# Production Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Docker Deployment](#docker-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [AWS Deployment](#aws-deployment)
5. [Azure Deployment](#azure-deployment)
6. [GCP Deployment](#gcp-deployment)
7. [Environment Configuration](#environment-configuration)
8. [Security Best Practices](#security-best-practices)
9. [Monitoring Setup](#monitoring-setup)
10. [Backup and Recovery](#backup-and-recovery)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Node.js**: 18.x or later
- **Database**: MySQL 8.0+ or MSSQL Server 2019+
- **Memory**: Minimum 2GB RAM (4GB recommended)
- **CPU**: 2+ cores recommended
- **Disk**: 20GB minimum (for logs and data)

### Required Software

- Docker 20.10+ and Docker Compose 2.0+ (for Docker deployment)
- kubectl (for Kubernetes deployment)
- Cloud CLI tools (AWS CLI, Azure CLI, or gcloud)

---

## Docker Deployment

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/db-connector.git
   cd db-connector
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Update .env file:**
   ```bash
   # IMPORTANT: Change these values!
   JWT_SECRET=<generate-strong-secret>
   MYSQL_PASSWORD=<strong-password>
   MYSQL_ROOT_PASSWORD=<strong-password>
   ```

4. **Start the stack:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

5. **Verify deployment:**
   ```bash
   curl http://localhost:3000/health
   ```

### Production Docker Configuration

**Build production image:**
```bash
docker build -t db-connector:latest .
```

**Run with production settings:**
```bash
docker run -d \
  --name db-connector \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e MYSQL_HOST=your-db-host \
  -e MYSQL_DATABASE=your-db \
  -e MYSQL_USER=your-user \
  -e MYSQL_PASSWORD=your-password \
  -e JWT_SECRET=your-secret \
  --restart unless-stopped \
  db-connector:latest
```

### Docker Compose Production Stack

The production stack (`docker-compose.prod.yml`) includes:

- **Application**: Main DB connector service
- **MySQL**: Database server
- **MSSQL**: Optional SQL Server
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **Redis**: Optional caching layer

**Start full stack:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

**View logs:**
```bash
docker-compose -f docker-compose.prod.yml logs -f app
```

**Stop stack:**
```bash
docker-compose -f docker-compose.prod.yml down
```

### Docker Health Checks

The application includes built-in health checks:

```bash
# Check container health
docker ps

# View health check logs
docker inspect --format='{{json .State.Health}}' db-connector-app
```

---

## Kubernetes Deployment

### Kubernetes Manifests

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: db-connector
  labels:
    app: db-connector
spec:
  replicas: 3
  selector:
    matchLabels:
      app: db-connector
  template:
    metadata:
      labels:
        app: db-connector
    spec:
      containers:
      - name: db-connector
        image: your-registry/db-connector:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MYSQL_HOST
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: host
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: db-connector-service
spec:
  selector:
    app: db-connector
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Create Secrets

```bash
# Create database credentials secret
kubectl create secret generic db-credentials \
  --from-literal=host=your-db-host \
  --from-literal=database=your-db \
  --from-literal=user=your-user \
  --from-literal=password=your-password

# Create JWT secret
kubectl create secret generic jwt-secret \
  --from-literal=secret=$(openssl rand -hex 32)
```

### Deploy to Kubernetes

```bash
# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Check deployment status
kubectl get pods
kubectl get services

# View logs
kubectl logs -f deployment/db-connector

# Scale deployment
kubectl scale deployment/db-connector --replicas=5
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: db-connector-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: db-connector
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## AWS Deployment

### AWS ECS (Fargate)

1. **Create ECR repository:**
   ```bash
   aws ecr create-repository --repository-name db-connector
   ```

2. **Build and push image:**
   ```bash
   # Authenticate Docker to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

   # Build and tag
   docker build -t db-connector .
   docker tag db-connector:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/db-connector:latest

   # Push
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/db-connector:latest
   ```

3. **Create ECS Task Definition:**
   ```json
   {
     "family": "db-connector",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "1024",
     "memory": "2048",
     "containerDefinitions": [
       {
         "name": "db-connector",
         "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/db-connector:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {"name": "NODE_ENV", "value": "production"}
         ],
         "secrets": [
           {
             "name": "JWT_SECRET",
             "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:jwt-secret"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/db-connector",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         },
         "healthCheck": {
           "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
           "interval": 30,
           "timeout": 5,
           "retries": 3,
           "startPeriod": 60
         }
       }
     ]
   }
   ```

4. **Create ECS Service:**
   ```bash
   aws ecs create-service \
     --cluster your-cluster \
     --service-name db-connector \
     --task-definition db-connector \
     --desired-count 3 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
     --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=db-connector,containerPort=3000"
   ```

### AWS RDS for Database

```bash
# Create RDS MySQL instance
aws rds create-db-instance \
  --db-instance-identifier db-connector-mysql \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --master-username admin \
  --master-user-password <strong-password> \
  --allocated-storage 100 \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name your-subnet-group \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "sun:04:00-sun:05:00" \
  --multi-az \
  --storage-encrypted \
  --enable-cloudwatch-logs-exports '["error","general","slowquery"]'
```

---

## Azure Deployment

### Azure Container Instances

```bash
# Create resource group
az group create --name db-connector-rg --location eastus

# Create container registry
az acr create --resource-group db-connector-rg --name dbconnectoracr --sku Basic

# Build and push image
az acr build --registry dbconnectoracr --image db-connector:latest .

# Create container instance
az container create \
  --resource-group db-connector-rg \
  --name db-connector \
  --image dbconnectoracr.azurecr.io/db-connector:latest \
  --cpu 2 \
  --memory 4 \
  --registry-login-server dbconnectoracr.azurecr.io \
  --registry-username <username> \
  --registry-password <password> \
  --dns-name-label db-connector \
  --ports 3000 \
  --environment-variables \
    NODE_ENV=production \
    MYSQL_HOST=<host> \
  --secure-environment-variables \
    MYSQL_PASSWORD=<password> \
    JWT_SECRET=<secret>
```

### Azure Kubernetes Service (AKS)

```bash
# Create AKS cluster
az aks create \
  --resource-group db-connector-rg \
  --name db-connector-cluster \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group db-connector-rg --name db-connector-cluster

# Deploy (use Kubernetes manifests above)
kubectl apply -f k8s/
```

---

## GCP Deployment

### Google Cloud Run

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/your-project/db-connector

# Deploy to Cloud Run
gcloud run deploy db-connector \
  --image gcr.io/your-project/db-connector \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production \
  --set-secrets JWT_SECRET=jwt-secret:latest \
  --set-secrets MYSQL_PASSWORD=db-password:latest
```

### Google Kubernetes Engine (GKE)

```bash
# Create GKE cluster
gcloud container clusters create db-connector-cluster \
  --num-nodes 3 \
  --machine-type n1-standard-2 \
  --zone us-central1-a \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10

# Get credentials
gcloud container clusters get-credentials db-connector-cluster --zone us-central1-a

# Deploy (use Kubernetes manifests above)
kubectl apply -f k8s/
```

---

## Environment Configuration

### Critical Environment Variables

**MUST change in production:**
- `JWT_SECRET`: Generate with `openssl rand -hex 32`
- `MYSQL_PASSWORD`: Strong database password
- `MYSQL_ROOT_PASSWORD`: Strong root password

**Recommended to configure:**
- `CORS_ORIGINS`: Specific allowed origins
- `RATE_LIMIT_MAX_REQUESTS`: Adjust based on traffic
- `ALERT_EMAIL_*`: Configure email alerts
- `SLACK_WEBHOOK_URL`: Configure Slack notifications

### Secrets Management

**AWS Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name db-connector/jwt-secret \
  --secret-string "$(openssl rand -hex 32)"
```

**Azure Key Vault:**
```bash
az keyvault create --name db-connector-vault --resource-group db-connector-rg
az keyvault secret set --vault-name db-connector-vault --name jwt-secret --value "$(openssl rand -hex 32)"
```

**Google Secret Manager:**
```bash
echo -n "$(openssl rand -hex 32)" | gcloud secrets create jwt-secret --data-file=-
```

---

## Security Best Practices

### 1. Use Strong Secrets

```bash
# Generate strong JWT secret
openssl rand -hex 32

# Generate strong database password
openssl rand -base64 32
```

### 2. Enable HTTPS

Use a reverse proxy (Nginx, Traefik) or cloud load balancer with SSL/TLS.

### 3. Network Security

- Use private networks for database connections
- Configure security groups/firewalls to restrict access
- Use VPN or private endpoints for sensitive connections

### 4. Regular Updates

```bash
# Update Docker image
docker pull db-connector:latest
docker-compose -f docker-compose.prod.yml up -d

# Update Kubernetes deployment
kubectl set image deployment/db-connector db-connector=db-connector:latest
```

### 5. Audit Logging

Ensure audit logging is enabled and regularly reviewed:
```bash
ENABLE_AUDIT_LOGGING=true
AUDIT_LOG_RETENTION_DAYS=90
```

---

## Monitoring Setup

### Prometheus + Grafana

1. **Access Grafana:**
   ```
   http://your-host:3001
   ```

2. **Default credentials:**
   - Username: admin
   - Password: admin (change immediately!)

3. **Add Prometheus data source:**
   - URL: http://prometheus:9090
   - Access: Server

4. **Import dashboards:**
   - Use provided dashboards in `monitoring/grafana/dashboards/`

### CloudWatch (AWS)

```bash
# Enable Container Insights
aws ecs update-cluster-settings \
  --cluster your-cluster \
  --settings name=containerInsights,value=enabled
```

### Azure Monitor

```bash
# Enable monitoring for ACI
az container create ... --log-analytics-workspace <workspace-id>
```

---

## Backup and Recovery

### Database Backup

**MySQL backup script:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE \
  | gzip > backup_${DATE}.sql.gz

# Upload to S3
aws s3 cp backup_${DATE}.sql.gz s3://your-backup-bucket/
```

**Automated backup with cron:**
```cron
0 2 * * * /path/to/backup-script.sh
```

### Disaster Recovery

1. **Backup critical data:**
   - Database dumps
   - Application configuration
   - SSL certificates
   - Audit logs

2. **Test restore procedure:**
   ```bash
   gunzip < backup.sql.gz | mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE
   ```

3. **Document recovery time objective (RTO) and recovery point objective (RPO)**

---

## Troubleshooting

### Application won't start

```bash
# Check logs
docker logs db-connector-app

# Check environment variables
docker exec db-connector-app env

# Verify database connectivity
docker exec db-connector-app node -e "const mysql = require('mysql2'); const conn = mysql.createConnection({host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD}); conn.connect(err => console.log(err ? 'Error: ' + err : 'Connected'));"
```

### Database connection errors

```bash
# Test MySQL connection
mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD

# Check network connectivity
telnet $MYSQL_HOST 3306

# Verify credentials in secrets
kubectl get secret db-credentials -o yaml
```

### High memory usage

```bash
# Check container stats
docker stats db-connector-app

# Increase memory limit
docker update --memory 4g db-connector-app
```

### Performance issues

```bash
# Enable profiling
ENABLE_PROFILING=true

# Check slow queries
# Access Grafana dashboard or query metrics endpoint
curl http://localhost:3000/api/monitoring/metrics
```

---

For additional help, consult:
- [API Documentation](./API.md)
- [Observability Guide](./OBSERVABILITY.md)
- [GitHub Issues](https://github.com/your-org/db-connector/issues)
