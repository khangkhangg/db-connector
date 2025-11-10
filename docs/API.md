# DB Schema Mapper Connector - API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [CLI Commands](#cli-commands)
5. [Webhooks](#webhooks)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [Examples](#examples)

---

## Overview

The DB Schema Mapper Connector provides two interfaces for interacting with the system:

1. **REST API**: HTTP-based API for remote access
2. **CLI**: Command-line interface for local operations

Both interfaces provide full access to:
- Schema operations (read, compare, map)
- Migration management
- Monitoring and observability
- Audit logging and compliance

---

## Authentication

### JWT Authentication

All API requests (except `/health`) require authentication using JWT tokens.

#### Request Header

```
Authorization: Bearer <token>
```

#### Generating Tokens

```typescript
import { generateToken } from 'db-connector';

const token = generateToken('user123', 'john.doe', 'admin');
```

#### Roles

- `admin`: Full access to all endpoints
- `user`: Access to read operations
- `auditor`: Access to audit logs and compliance reports
- `security`: Access to security-related audit logs
- `compliance`: Access to PHI access logs

---

## REST API Endpoints

Base URL: `http://localhost:3000/api`

### Schema Endpoints

#### Read Schema

Read schema from a database.

**Endpoint:** `POST /api/schema/read`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password",
  "includeSystemTables": false
}
```

**Response:**
```json
{
  "success": true,
  "schema": {
    "databaseName": "mydb",
    "databaseType": "mysql",
    "tables": [...]
  },
  "metadata": {
    "tables": 15,
    "views": 3,
    "databaseType": "mysql"
  }
}
```

#### Compare Schemas

Compare two schemas and get differences.

**Endpoint:** `POST /api/schema/compare`

**Request:**
```json
{
  "schema1": { ... },
  "schema2": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "differences": {
    "tablesAdded": [...],
    "tablesRemoved": [...],
    "tablesModified": [...]
  },
  "summary": {
    "tablesAdded": 2,
    "tablesRemoved": 1,
    "tablesModified": 3
  }
}
```

#### Map Schema

Map schema to different database type.

**Endpoint:** `POST /api/schema/map`

**Request:**
```json
{
  "schema": { ... },
  "targetType": "mssql",
  "options": {
    "preserveCase": false,
    "includeConstraints": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "schema": { ... }
}
```

#### Validate Schema

Validate a schema structure.

**Endpoint:** `POST /api/schema/validate`

**Request:**
```json
{
  "schema": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "message": "Schema is valid"
}
```

#### Generate DDL

Generate DDL statements from schema.

**Endpoint:** `POST /api/schema/generate-ddl`

**Request:**
```json
{
  "schema": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "ddl": [
    "CREATE TABLE users (...)",
    "CREATE TABLE posts (...)"
  ],
  "count": 2
}
```

---

### Migration Endpoints

#### Initialize Migration System

Initialize migration tracking tables.

**Endpoint:** `POST /api/migration/init`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Migration system initialized"
}
```

#### Generate Migration

Generate migration from schema differences.

**Endpoint:** `POST /api/migration/generate`

**Request:**
```json
{
  "oldSchema": { ... },
  "newSchema": { ... },
  "version": "1.1.0",
  "description": "Add email column to users table"
}
```

**Response:**
```json
{
  "success": true,
  "migration": {
    "version": "1.1.0",
    "operations": [...]
  },
  "operations": 3
}
```

#### Execute Migration

Execute a migration.

**Endpoint:** `POST /api/migration/execute`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password",
  "migration": { ... },
  "direction": "up",
  "dryRun": false
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "executedOperations": 3,
    "duration": 1234
  },
  "message": "Migration executed successfully"
}
```

#### Get Current Version

Get current schema version.

**Endpoint:** `POST /api/migration/version`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "version": {
    "version": "1.0.0",
    "appliedAt": "2025-01-10T12:00:00.000Z"
  }
}
```

#### Detect Drift

Detect schema drift.

**Endpoint:** `POST /api/migration/drift`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "drift": {
    "hasDrift": true,
    "changes": [...]
  },
  "hasDrift": true,
  "changes": 5
}
```

---

### Monitoring Endpoints

#### Health Check

Check system health.

**Endpoint:** `GET /api/monitoring/health`

**Query Parameters:**
- `type`: Database type (mysql/mssql)
- `host`: Database host
- `port`: Database port
- `database`: Database name
- `user`: Database user
- `password`: Database password
- `probe` (optional): Probe type (liveness/readiness/startup/full)

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "latency": 15 },
    "memory": { "status": "healthy" },
    "cpu": { "status": "healthy" }
  },
  "timestamp": "2025-01-10T12:00:00.000Z",
  "uptime": 3600
}
```

#### Get Metrics

Get current metrics.

**Endpoint:** `GET /api/monitoring/metrics`

**Query Parameters:**
- Same as health check endpoint
- `format` (optional): Output format (json/prometheus)

**Response (JSON):**
```json
{
  "success": true,
  "metrics": {
    "queries": {
      "totalQueries": 1000,
      "averageLatency": 45.2,
      "p95Latency": 89.5
    },
    "pool": {
      "currentUtilization": 0.6
    },
    "transactions": {
      "committed": 500,
      "rolledBack": 5
    }
  }
}
```

**Response (Prometheus):**
```
# HELP db_queries_total Total number of database queries
# TYPE db_queries_total counter
db_queries_total 1000
...
```

#### Get Dashboard

Get comprehensive dashboard.

**Endpoint:** `POST /api/monitoring/dashboard`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "dashboard": {
    "status": "healthy",
    "metrics": { ... },
    "slos": { ... },
    "alerts": { ... },
    "health": { ... },
    "performance": { ... },
    "timestamp": "2025-01-10T12:00:00.000Z"
  }
}
```

#### Get SLO Status

Get SLO status for specific SLO.

**Endpoint:** `GET /api/monitoring/slo/:sloName`

**Response:**
```json
{
  "success": true,
  "slo": {
    "slo": {
      "name": "availability",
      "target": 0.999
    },
    "current": 0.9995,
    "status": "meeting",
    "compliance": 0.9995
  }
}
```

#### Get Active Alerts

Get active alerts.

**Endpoint:** `POST /api/monitoring/alerts`

**Response:**
```json
{
  "success": true,
  "alerts": {
    "active": [...],
    "unacknowledged": [...],
    "total": 5,
    "unacknowledgedCount": 2
  }
}
```

#### Acknowledge Alert

Acknowledge an alert.

**Endpoint:** `POST /api/monitoring/alerts/:alertId/acknowledge`

**Response:**
```json
{
  "success": true,
  "message": "Alert acknowledged"
}
```

---

### Audit Endpoints

**Note:** Most audit endpoints require `admin`, `auditor`, or `compliance` role.

#### Query Audit Logs

Query audit logs.

**Endpoint:** `POST /api/audit/logs`

**Required Role:** `admin`, `auditor`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password",
  "event_type": "PHI_ACCESS",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "limit": 100
}
```

**Response:**
```json
{
  "success": true,
  "logs": [...],
  "count": 15
}
```

#### Generate Compliance Report

Generate compliance report.

**Endpoint:** `POST /api/audit/report`

**Required Role:** `admin`, `auditor`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31"
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "period": { ... },
    "summary": {
      "totalEvents": 5000,
      "phiAccessCount": 150
    }
  }
}
```

#### Log Audit Event

Log an audit event.

**Endpoint:** `POST /api/audit/log`

**Request:**
```json
{
  "type": "mysql",
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "user",
  "password": "password",
  "event": {
    "event_type": "DATA_READ",
    "severity": "low",
    "resource": "users",
    "action": "read",
    "result": "success"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Audit event logged"
}
```

---

## CLI Commands

### Installation

```bash
npm install -g db-schema-mapper-connector
```

Or use locally:

```bash
npx db-connector <command>
```

### Schema Commands

#### Read Schema

```bash
db-connector schema read \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --output schema.json
```

#### Compare Schemas

```bash
db-connector schema compare \
  --schema1 old-schema.json \
  --schema2 new-schema.json \
  --output differences.json
```

#### Map Schema

```bash
db-connector schema map \
  --input schema.json \
  --target mssql \
  --output mapped-schema.json
```

### Migration Commands

#### Initialize Migration System

```bash
db-connector migration init \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password
```

#### Generate Migration

```bash
db-connector migration generate \
  --old old-schema.json \
  --new new-schema.json \
  --version 1.1.0 \
  --description "Add email column" \
  --output migration.json
```

#### Execute Migration

```bash
db-connector migration execute \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --migration migration.json \
  --direction up
```

#### Detect Drift

```bash
db-connector migration drift \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --output drift-report.txt
```

### Monitoring Commands

#### Health Check

```bash
db-connector monitor health \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --probe full
```

#### Get Metrics

```bash
db-connector monitor metrics \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --format prometheus
```

#### Get Dashboard

```bash
db-connector monitor dashboard \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password
```

### Audit Commands

#### Query Audit Logs

```bash
db-connector audit logs \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --event-type PHI_ACCESS \
  --limit 100
```

#### Generate Compliance Report

```bash
db-connector audit report \
  --type mysql \
  --host localhost \
  --port 3306 \
  --database mydb \
  --user user \
  --password password \
  --start 2025-01-01 \
  --end 2025-01-31 \
  --output compliance-report.json
```

---

## Webhooks

### Overview

Webhooks allow you to receive real-time notifications when events occur in the system.

### Event Types

- `schema.read`: Schema was read from database
- `schema.changed`: Schema has changed
- `migration.started`: Migration started
- `migration.completed`: Migration completed successfully
- `migration.failed`: Migration failed
- `drift.detected`: Schema drift detected
- `alert.triggered`: Alert was triggered
- `alert.resolved`: Alert was resolved
- `slo.breached`: SLO was breached
- `health.degraded`: Health status degraded
- `phi.accessed`: PHI was accessed
- `audit.event`: Audit event occurred

### Registering Webhooks

```typescript
import { WebhookManager, WebhookEventType } from 'db-connector';

const webhookManager = new WebhookManager();

webhookManager.registerWebhook({
  id: 'my-webhook',
  url: 'https://example.com/webhook',
  events: [
    WebhookEventType.MIGRATION_STARTED,
    WebhookEventType.MIGRATION_COMPLETED,
    WebhookEventType.DRIFT_DETECTED
  ],
  enabled: true,
  secret: 'your-webhook-secret'
});
```

### Webhook Payload

```json
{
  "id": "evt_1234567890_abc123",
  "event": "migration.completed",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "data": {
    "migration": { ... },
    "result": { ... }
  },
  "metadata": {
    "source": "db-connector",
    "version": "1.0.0"
  }
}
```

### Webhook Signature Verification

```typescript
import { WebhookManager } from 'db-connector';

const signature = request.headers['x-webhook-signature'];
const payload = request.body;

const isValid = WebhookManager.verifySignature(
  payload,
  signature,
  'your-webhook-secret'
);

if (!isValid) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "ErrorName",
  "message": "Error description",
  "details": { ... },
  "stack": "..." // Only in development mode
}
```

### HTTP Status Codes

- `200`: Success
- `400`: Bad Request (missing or invalid parameters)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error
- `503`: Service Unavailable (health check failed)

---

## Rate Limiting

### Default Limits

- Window: 15 minutes
- Max Requests: 100 per window per IP

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1641825600
```

### Rate Limit Exceeded Response

```json
{
  "error": "Too Many Requests",
  "message": "Too many requests from this IP, please try again later"
}
```

---

## Examples

### Full Workflow: Read, Map, and Execute Migration

```typescript
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
const TOKEN = 'your-jwt-token';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

// 1. Read current schema
const { data: readResult } = await axios.post(`${API_URL}/schema/read`, {
  type: 'mysql',
  host: 'localhost',
  port: '3306',
  database: 'mydb',
  user: 'user',
  password: 'password'
}, { headers });

const oldSchema = readResult.schema;

// 2. Make changes to schema (e.g., add a column)
const newSchema = { ...oldSchema };
newSchema.tables[0].columns.push({
  name: 'email',
  dataType: 'varchar',
  maxLength: 255,
  nullable: false
});

// 3. Generate migration
const { data: migrationResult } = await axios.post(`${API_URL}/migration/generate`, {
  oldSchema,
  newSchema,
  version: '1.1.0',
  description: 'Add email column to users table'
}, { headers });

const migration = migrationResult.migration;

// 4. Execute migration
const { data: executeResult } = await axios.post(`${API_URL}/migration/execute`, {
  type: 'mysql',
  host: 'localhost',
  port: '3306',
  database: 'mydb',
  user: 'user',
  password: 'password',
  migration,
  direction: 'up',
  dryRun: false
}, { headers });

console.log('Migration result:', executeResult);
```

### Monitoring with Webhooks

```typescript
import { IntegratedConnector } from 'db-connector';

const connector = new IntegratedConnector({
  database: {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'mydb',
    user: 'user',
    password: 'password'
  },
  webhooks: { enabled: true }
});

await connector.initialize();

const webhookManager = connector.getWebhookManager();

// Register webhook
webhookManager.registerWebhook({
  id: 'slack-webhook',
  url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
  events: [
    'migration.completed',
    'drift.detected',
    'alert.triggered'
  ],
  enabled: true
});

// Perform operations - webhooks will be triggered automatically
const migrationManager = connector.getMigrationManager();
await migrationManager.executeMigration(migration);
```

---

For more examples, see the `examples/` directory in the repository.
