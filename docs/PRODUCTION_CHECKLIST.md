# Production Deployment Checklist

## Pre-Deployment

### Security

- [ ] **Generate strong JWT secret**
  ```bash
  openssl rand -hex 32
  ```

- [ ] **Generate strong database passwords**
  ```bash
  openssl rand -base64 32
  ```

- [ ] **Store secrets securely**
  - [ ] AWS Secrets Manager / Azure Key Vault / Google Secret Manager
  - [ ] Kubernetes Secrets
  - [ ] Never commit secrets to git

- [ ] **Configure CORS origins**
  - [ ] Set specific allowed origins (not `*`)
  - [ ] Update `CORS_ORIGINS` in `.env`

- [ ] **Enable security headers**
  - [ ] Helmet enabled (`HELMET_ENABLED=true`)
  - [ ] HTTPS enforced

- [ ] **Review authentication settings**
  - [ ] JWT expiration appropriate (default: 24h)
  - [ ] Role-based access control configured
  - [ ] Authentication enabled (`ENABLE_AUTH=true`)

- [ ] **Security scanning**
  - [ ] Run `npm audit`
  - [ ] Scan Docker image with Trivy or Snyk
  - [ ] Review and fix critical vulnerabilities

### Database

- [ ] **Database server secured**
  - [ ] Firewall rules configured
  - [ ] SSL/TLS connections enabled
  - [ ] Private network/VPC used

- [ ] **Database credentials**
  - [ ] Strong passwords set
  - [ ] Principle of least privilege applied
  - [ ] Separate user accounts for app and admin

- [ ] **Database backups configured**
  - [ ] Automated backups enabled
  - [ ] Backup retention policy set
  - [ ] Restore procedure tested

- [ ] **Connection pooling tuned**
  - [ ] `DB_POOL_MIN` and `DB_POOL_MAX` configured
  - [ ] Connection timeout appropriate

### Application Configuration

- [ ] **Environment variables configured**
  - [ ] `NODE_ENV=production`
  - [ ] Database connection settings
  - [ ] API port and host
  - [ ] All required environment variables set

- [ ] **Observability enabled**
  - [ ] `ENABLE_AUDIT_LOGGING=true`
  - [ ] `ENABLE_METRICS=true`
  - [ ] `ENABLE_SLO_TRACKING=true`
  - [ ] `ENABLE_ALERTS=true`
  - [ ] `ENABLE_HEALTH_CHECKS=true`

- [ ] **Rate limiting configured**
  - [ ] Appropriate limits for production traffic
  - [ ] `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS` set

- [ ] **Logging configured**
  - [ ] Log level appropriate (`info` or `warn` for production)
  - [ ] Log format set (`json` recommended)
  - [ ] Log aggregation configured

### Infrastructure

- [ ] **Resource allocation**
  - [ ] CPU: 2+ cores
  - [ ] Memory: 2GB minimum (4GB recommended)
  - [ ] Disk: 20GB minimum
  - [ ] Auto-scaling configured (if applicable)

- [ ] **Networking**
  - [ ] Load balancer configured
  - [ ] SSL/TLS certificates installed
  - [ ] DNS records configured
  - [ ] Health check endpoints configured

- [ ] **High availability**
  - [ ] Multiple replicas/instances running (3+ recommended)
  - [ ] Load balancing enabled
  - [ ] Database replication configured (if applicable)

### Monitoring and Alerting

- [ ] **Prometheus configured**
  - [ ] Scraping application metrics
  - [ ] Retention period set
  - [ ] Alert rules configured

- [ ] **Grafana configured**
  - [ ] Dashboards imported
  - [ ] Data sources connected
  - [ ] Alert notifications configured

- [ ] **Alert channels configured**
  - [ ] Slack webhook URL set (`SLACK_WEBHOOK_URL`)
  - [ ] Email alerts configured
  - [ ] PagerDuty integration (if using)

- [ ] **SLO thresholds reviewed**
  - [ ] Availability target appropriate
  - [ ] Latency targets achievable
  - [ ] Error rate threshold reasonable

### Documentation

- [ ] **Deployment documentation updated**
  - [ ] Architecture diagrams current
  - [ ] Configuration documented
  - [ ] Runbooks updated

- [ ] **API documentation published**
  - [ ] Endpoints documented
  - [ ] Authentication guide available
  - [ ] Examples provided

- [ ] **Team trained**
  - [ ] On-call rotation established
  - [ ] Runbooks reviewed
  - [ ] Escalation procedures documented

## Deployment

### Pre-Deployment Steps

- [ ] **Run final tests**
  ```bash
  npm test
  npm run test:coverage
  ```

- [ ] **Build and test Docker image**
  ```bash
  docker build -t db-connector:latest .
  docker run --rm db-connector:latest npm test
  ```

- [ ] **Tag release**
  ```bash
  git tag -a v1.0.0 -m "Release v1.0.0"
  git push origin v1.0.0
  ```

- [ ] **Create deployment plan**
  - [ ] Deployment window scheduled
  - [ ] Rollback plan documented
  - [ ] Team notified

### Deployment Steps

- [ ] **Deploy application**
  - [ ] Docker: `docker-compose -f docker-compose.prod.yml up -d`
  - [ ] Kubernetes: `kubectl apply -f k8s/`
  - [ ] Cloud: Use platform-specific deployment commands

- [ ] **Verify deployment**
  - [ ] Health check passing: `curl https://api.example.com/health`
  - [ ] Application logs reviewed
  - [ ] Metrics appearing in Prometheus/Grafana

- [ ] **Initialize systems**
  - [ ] Migration system initialized
  - [ ] Audit logging tables created
  - [ ] Initial schema version recorded

- [ ] **Run smoke tests**
  ```bash
  # Test schema read
  db-connector schema read --type mysql --host ... --output schema.json

  # Test health endpoint
  curl https://api.example.com/health

  # Test metrics endpoint
  curl https://api.example.com/api/monitoring/metrics
  ```

### Post-Deployment Steps

- [ ] **Monitor for issues**
  - [ ] Watch application logs for errors
  - [ ] Monitor metrics dashboards
  - [ ] Check for alerts

- [ ] **Verify functionality**
  - [ ] Test critical API endpoints
  - [ ] Verify database connectivity
  - [ ] Check audit logging

- [ ] **Performance testing**
  - [ ] Load test critical endpoints
  - [ ] Monitor response times
  - [ ] Check resource utilization

- [ ] **Backup verification**
  - [ ] First backup completed successfully
  - [ ] Backup files accessible
  - [ ] Restore procedure works

## Post-Deployment

### Week 1

- [ ] **Daily monitoring**
  - [ ] Review logs daily
  - [ ] Check metrics dashboards
  - [ ] Respond to alerts promptly

- [ ] **Performance review**
  - [ ] Query latency acceptable
  - [ ] Error rate within SLO
  - [ ] Resource utilization normal

- [ ] **Security review**
  - [ ] Review audit logs
  - [ ] Check for unauthorized access
  - [ ] Verify SSL/TLS working

### Week 2-4

- [ ] **Weekly reviews**
  - [ ] SLO compliance reviewed
  - [ ] Incident retrospectives conducted
  - [ ] Performance trends analyzed

- [ ] **Optimization**
  - [ ] Identify slow queries
  - [ ] Optimize database indexes
  - [ ] Tune connection pools

- [ ] **Documentation updates**
  - [ ] Update runbooks based on incidents
  - [ ] Document common issues
  - [ ] Improve troubleshooting guides

### Monthly

- [ ] **Compliance reporting**
  - [ ] Generate compliance reports
  - [ ] Review audit logs
  - [ ] Document PHI access

- [ ] **Security updates**
  - [ ] Apply security patches
  - [ ] Update dependencies
  - [ ] Re-scan for vulnerabilities

- [ ] **Backup testing**
  - [ ] Test database restore
  - [ ] Verify backup integrity
  - [ ] Update disaster recovery plan

- [ ] **Capacity planning**
  - [ ] Review resource utilization trends
  - [ ] Plan for scaling needs
  - [ ] Optimize costs

## Emergency Procedures

### Rollback

1. **Identify issue**
   ```bash
   # Check logs
   kubectl logs deployment/db-connector

   # Check health
   curl https://api.example.com/health
   ```

2. **Execute rollback**
   ```bash
   # Kubernetes
   kubectl rollout undo deployment/db-connector

   # Docker Compose
   docker-compose -f docker-compose.prod.yml down
   docker pull db-connector:previous-version
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Verify rollback**
   ```bash
   curl https://api.example.com/health
   ```

4. **Communicate**
   - [ ] Notify team
   - [ ] Update status page
   - [ ] Document incident

### Database Recovery

1. **Stop application**
   ```bash
   kubectl scale deployment/db-connector --replicas=0
   ```

2. **Restore database**
   ```bash
   gunzip < backup_YYYYMMDD.sql.gz | mysql -h $MYSQL_HOST -u $MYSQL_USER -p
   ```

3. **Verify restore**
   ```bash
   mysql -h $MYSQL_HOST -u $MYSQL_USER -p -e "SHOW TABLES; SELECT COUNT(*) FROM users;"
   ```

4. **Restart application**
   ```bash
   kubectl scale deployment/db-connector --replicas=3
   ```

### Incident Response

1. **Acknowledge incident**
   - [ ] Page on-call engineer
   - [ ] Create incident ticket
   - [ ] Start incident timeline

2. **Assess impact**
   - [ ] Check affected users/systems
   - [ ] Determine severity
   - [ ] Escalate if needed

3. **Mitigate**
   - [ ] Follow relevant runbook
   - [ ] Apply immediate fixes
   - [ ] Monitor for improvement

4. **Resolve**
   - [ ] Verify issue resolved
   - [ ] Update status page
   - [ ] Close incident ticket

5. **Post-mortem**
   - [ ] Write incident report
   - [ ] Identify root cause
   - [ ] Create action items
   - [ ] Update runbooks

## Sign-off

### Pre-Production

- [ ] **Development Lead**: _________________________ Date: _________
- [ ] **Security Review**: _________________________ Date: _________
- [ ] **Operations Lead**: _________________________ Date: _________

### Production Approval

- [ ] **Engineering Manager**: _____________________ Date: _________
- [ ] **Product Owner**: ___________________________ Date: _________
- [ ] **CTO/VP Engineering**: ______________________ Date: _________

### Post-Deployment Verification

- [ ] **On-Call Engineer**: ________________________ Date: _________
- [ ] **Operations Lead**: _________________________ Date: _________

---

**Deployment Date**: _____________

**Deployed Version**: _____________

**Deployed By**: _____________

**Notes**:
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________
