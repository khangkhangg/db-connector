# Data Synchronization Guide

This guide covers the data synchronization features of the DB Schema Mapper Connector, including setup, configuration, and usage for syncing data between databases.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Supported Databases](#supported-databases)
4. [Quick Start](#quick-start)
5. [Configuration](#configuration)
6. [Usage Examples](#usage-examples)
7. [CLI Commands](#cli-commands)
8. [REST API](#rest-api)
9. [Conflict Resolution](#conflict-resolution)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The Data Synchronization feature enables you to:
- Sync data between MSSQL, MySQL, and PostgreSQL databases
- Select specific tables and columns to synchronize
- Support unidirectional (client-to-web) and bidirectional sync
- Track all sync operations in audit logs
- Clone/replicate databases across environments
- Run on Windows Server or Linux

## Features

### Core Capabilities

- ✅ **Multi-Database Support**: MSSQL, MySQL, PostgreSQL
- ✅ **Selective Sync**: Choose specific tables and columns
- ✅ **Bidirectional Sync**: Two-way synchronization with conflict resolution
- ✅ **Unidirectional Sync**: One-way client-to-web or web-to-client
- ✅ **Initial Clone**: Full database replication
- ✅ **Continuous Sync**: Ongoing synchronization with configurable intervals
- ✅ **Change Tracking**: Monitor database changes for incremental sync
- ✅ **Conflict Resolution**: Multiple strategies for handling conflicts
- ✅ **Batch Operations**: Efficient bulk data transfer
- ✅ **Audit Logging**: Complete sync operation tracking
- ✅ **Dry Run Mode**: Test sync without making changes

### Sync Modes

1. **Once** - One-time synchronization
2. **Continuous** - Ongoing sync at regular intervals
3. **Initial Clone** - Full data replication (deletes records not in source)
4. **Incremental** - Sync only changes since last run

### Sync Directions

1. **Source to Target** - Unidirectional sync (client → web)
2. **Target to Source** - Reverse sync (web → client)
3. **Bidirectional** - Two-way sync with conflict resolution

---

## Supported Databases

### Source Database (Client)
- Microsoft SQL Server (MSSQL) 2016+
- MySQL 5.7+
- PostgreSQL 10+

### Target Database (Web)
- MySQL 5.7+
- PostgreSQL 10+
- Microsoft SQL Server (MSSQL) 2016+

---

## Quick Start

### 1. Create Sync Configuration

```bash
db-connector sync init \
  --name "Client-to-Web Sync" \
  --source-type mssql \
  --source-host client.database.local \
  --source-port 1433 \
  --source-database ClientDB \
  --source-user syncuser \
  --source-password SecurePass123 \
  --target-type postgresql \
  --target-host web.database.cloud \
  --target-port 5432 \
  --target-database WebDB \
  --target-user syncuser \
  --target-password SecurePass456 \
  --direction source_to_target \
  --mode continuous \
  --tables users,orders,products
```

This creates a `sync-config.json` file.

### 2. Customize Configuration

Edit `sync-config.json` to add column mappings, filters, and other options:

```json
{
  "id": "sync-1234567890",
  "name": "Client-to-Web Sync",
  "source": {
    "type": "MSSQL",
    "host": "client.database.local",
    "port": 1433,
    "database": "ClientDB",
    "user": "syncuser",
    "password": "SecurePass123"
  },
  "target": {
    "type": "PostgreSQL",
    "host": "web.database.cloud",
    "port": 5432,
    "database": "WebDB",
    "user": "syncuser",
    "password": "SecurePass456"
  },
  "direction": "source_to_target",
  "mode": "continuous",
  "tables": [
    {
      "sourceTable": "users",
      "targetTable": "users",
      "columns": ["id", "username", "email", "created_at", "updated_at"],
      "primaryKey": ["id"],
      "timestampColumn": "updated_at",
      "whereClause": "active = 1",
      "enabled": true
    },
    {
      "sourceTable": "orders",
      "targetTable": "orders",
      "primaryKey": ["id"],
      "timestampColumn": "modified_at",
      "enabled": true
    }
  ],
  "defaultBatchSize": 1000,
  "syncIntervalMs": 60000,
  "enableDetailedLogging": true
}
```

### 3. Validate Configuration

```bash
db-connector sync validate --config sync-config.json
```

### 4. Run One-Time Sync

```bash
db-connector sync once --config sync-config.json
```

### 5. Start Continuous Sync

```bash
db-connector sync start --config sync-config.json --interval 60000
```

---

## Configuration

### SyncConfig Structure

```typescript
{
  // Unique identifier
  "id": "string",

  // Friendly name
  "name": "string",

  // Source database
  "source": {
    "type": "MSSQL" | "MySQL" | "PostgreSQL",
    "host": "string",
    "port": number,
    "database": "string",
    "user": "string",
    "password": "string",
    "ssl": boolean (optional)
  },

  // Target database
  "target": {
    "type": "MSSQL" | "MySQL" | "PostgreSQL",
    "host": "string",
    "port": number,
    "database": "string",
    "user": "string",
    "password": "string",
    "ssl": boolean (optional)
  },

  // Sync direction
  "direction": "source_to_target" | "target_to_source" | "bidirectional",

  // Sync mode
  "mode": "once" | "continuous" | "initial_clone" | "incremental",

  // Conflict resolution (for bidirectional)
  "conflictStrategy": "source_wins" | "target_wins" | "latest_wins" | "skip" | "manual",

  // Tables to sync
  "tables": [
    {
      "sourceTable": "string",
      "targetTable": "string (optional, defaults to sourceTable)",
      "columns": ["array of column names (optional, syncs all if empty)"],
      "columnMappings": [
        {
          "source": "old_name",
          "target": "new_name"
        }
      ],
      "whereClause": "SQL WHERE clause (optional)",
      "primaryKey": ["array of PK columns"],
      "timestampColumn": "column for change tracking",
      "batchSize": number (optional),
      "enabled": boolean
    }
  ],

  // Default batch size
  "defaultBatchSize": 1000,

  // Sync interval (for continuous mode)
  "syncIntervalMs": 60000,

  // Enable detailed logging
  "enableDetailedLogging": true,

  // Dry run mode (test without changes)
  "dryRun": false,

  // Max concurrent table syncs
  "maxConcurrency": 5,

  // Retry configuration
  "retry": {
    "maxAttempts": 3,
    "delayMs": 1000,
    "backoffMultiplier": 2
  }
}
```

### Table Configuration Options

#### Selective Column Sync

Sync only specific columns:

```json
{
  "sourceTable": "users",
  "columns": ["id", "username", "email"],
  "primaryKey": ["id"]
}
```

#### Column Mapping

Map columns with different names:

```json
{
  "sourceTable": "users",
  "columnMappings": [
    { "source": "user_id", "target": "id" },
    { "source": "user_name", "target": "username" }
  ]
}
```

#### Row Filtering

Sync only rows matching a condition:

```json
{
  "sourceTable": "orders",
  "whereClause": "status = 'completed' AND created_at > '2024-01-01'",
  "primaryKey": ["id"]
}
```

#### Change Tracking

Use timestamp column for incremental sync:

```json
{
  "sourceTable": "products",
  "timestampColumn": "updated_at",
  "primaryKey": ["id"]
}
```

---

## Usage Examples

### Example 1: MSSQL Client to PostgreSQL Web (Unidirectional)

**Scenario**: Sync customer and order data from on-premise MSSQL to cloud PostgreSQL.

**Configuration**:
```json
{
  "name": "Client to Web Sync",
  "source": {
    "type": "MSSQL",
    "host": "192.168.1.10",
    "port": 1433,
    "database": "ClientDB",
    "user": "sync_user",
    "password": "password123"
  },
  "target": {
    "type": "PostgreSQL",
    "host": "db.example.com",
    "port": 5432,
    "database": "WebDB",
    "user": "sync_user",
    "password": "password456"
  },
  "direction": "source_to_target",
  "mode": "continuous",
  "syncIntervalMs": 300000,
  "tables": [
    {
      "sourceTable": "Customers",
      "targetTable": "customers",
      "columns": ["CustomerID", "Name", "Email", "Phone", "ModifiedDate"],
      "primaryKey": ["CustomerID"],
      "timestampColumn": "ModifiedDate",
      "whereClause": "IsActive = 1"
    },
    {
      "sourceTable": "Orders",
      "targetTable": "orders",
      "primaryKey": ["OrderID"],
      "timestampColumn": "LastUpdated"
    }
  ]
}
```

**Run**:
```bash
db-connector sync start --config client-to-web.json
```

### Example 2: Bidirectional Sync with Conflict Resolution

**Scenario**: Two-way sync between regional databases with latest-wins conflict resolution.

**Configuration**:
```json
{
  "name": "Bidirectional Regional Sync",
  "source": {
    "type": "PostgreSQL",
    "host": "us-east.db.example.com",
    "port": 5432,
    "database": "RegionDB",
    "user": "sync_user",
    "password": "password789"
  },
  "target": {
    "type": "PostgreSQL",
    "host": "us-west.db.example.com",
    "port": 5432,
    "database": "RegionDB",
    "user": "sync_user",
    "password": "password789"
  },
  "direction": "bidirectional",
  "mode": "continuous",
  "conflictStrategy": "latest_wins",
  "syncIntervalMs": 60000,
  "tables": [
    {
      "sourceTable": "inventory",
      "primaryKey": ["product_id", "location_id"],
      "timestampColumn": "updated_at"
    }
  ]
}
```

### Example 3: Initial Database Clone

**Scenario**: One-time full clone of production database to staging.

**Configuration**:
```json
{
  "name": "Production to Staging Clone",
  "source": {
    "type": "MySQL",
    "host": "prod.db.example.com",
    "port": 3306,
    "database": "ProductionDB",
    "user": "readonly_user",
    "password": "password"
  },
  "target": {
    "type": "MySQL",
    "host": "staging.db.example.com",
    "port": 3306,
    "database": "StagingDB",
    "user": "admin_user",
    "password": "password"
  },
  "direction": "source_to_target",
  "mode": "initial_clone",
  "defaultBatchSize": 5000,
  "tables": [
    { "sourceTable": "users", "primaryKey": ["id"] },
    { "sourceTable": "products", "primaryKey": ["id"] },
    { "sourceTable": "orders", "primaryKey": ["id"] }
  ]
}
```

**Run**:
```bash
# Dry run first to verify
db-connector sync once --config clone.json --dry-run

# Actual clone
db-connector sync once --config clone.json
```

### Example 4: Selective Table and Column Sync

**Scenario**: Sync only specific columns from specific tables, filtering sensitive data.

**Configuration**:
```json
{
  "name": "Selective Sync",
  "source": {
    "type": "MSSQL",
    "host": "source.db",
    "port": 1433,
    "database": "SourceDB",
    "user": "sync_user",
    "password": "password"
  },
  "target": {
    "type": "PostgreSQL",
    "host": "target.db",
    "port": 5432,
    "database": "TargetDB",
    "user": "sync_user",
    "password": "password"
  },
  "direction": "source_to_target",
  "mode": "continuous",
  "tables": [
    {
      "sourceTable": "Users",
      "targetTable": "users",
      "columns": ["id", "username", "email", "created_at"],
      "primaryKey": ["id"],
      "whereClause": "deleted_at IS NULL"
    },
    {
      "sourceTable": "Orders",
      "targetTable": "orders",
      "columns": ["id", "user_id", "total", "status", "created_at"],
      "primaryKey": ["id"],
      "whereClause": "status IN ('completed', 'shipped')"
    }
  ]
}
```

---

## CLI Commands

### sync init

Create a new sync configuration file.

```bash
db-connector sync init \
  --name <name> \
  --source-type <mssql|mysql|postgresql> \
  --source-host <host> \
  --source-port <port> \
  --source-database <database> \
  --source-user <user> \
  --source-password <password> \
  --target-type <mssql|mysql|postgresql> \
  --target-host <host> \
  --target-port <port> \
  --target-database <database> \
  --target-user <user> \
  --target-password <password> \
  [--direction <direction>] \
  [--mode <mode>] \
  [--conflict-strategy <strategy>] \
  [--tables <tables>] \
  [--output <file>]
```

### sync validate

Validate a sync configuration file.

```bash
db-connector sync validate --config <file>
```

### sync once

Run a one-time synchronization.

```bash
db-connector sync once --config <file> [--dry-run]
```

### sync start

Start continuous synchronization.

```bash
db-connector sync start --config <file> [--interval <ms>]
```

### sync status

Get the status of a running sync job.

```bash
db-connector sync status --config <file>
```

---

## REST API

### POST /api/sync/configure

Create or update sync configuration.

**Request**:
```json
{
  "name": "My Sync Job",
  "source": { ... },
  "target": { ... },
  "tables": [ ... ]
}
```

**Response**:
```json
{
  "success": true,
  "config": { ... }
}
```

### POST /api/sync/execute

Execute one-time synchronization.

**Request**:
```json
{
  "id": "sync-123",
  "name": "My Sync Job",
  ...
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "syncId": "sync-123",
    "summary": {
      "totalInserted": 1500,
      "totalUpdated": 250,
      "totalDeleted": 10,
      "totalConflicts": 0
    },
    "tableResults": [ ... ]
  }
}
```

### POST /api/sync/start

Start continuous synchronization.

**Request**:
```json
{
  "id": "sync-123",
  "mode": "continuous",
  "syncIntervalMs": 60000,
  ...
}
```

**Response**:
```json
{
  "success": true,
  "message": "Continuous sync started",
  "id": "sync-123"
}
```

### POST /api/sync/:id/stop

Stop continuous synchronization.

**Response**:
```json
{
  "success": true,
  "message": "Continuous sync stopped"
}
```

### GET /api/sync/:id/status

Get sync job status.

**Response**:
```json
{
  "success": true,
  "status": {
    "syncId": "sync-123",
    "status": "running",
    "progress": 45,
    "currentTable": "orders",
    "lastSyncTime": "2024-01-15T10:30:00Z"
  }
}
```

### GET /api/sync/jobs

List all active sync jobs.

**Response**:
```json
{
  "success": true,
  "jobs": [
    {
      "id": "sync-123",
      "status": { ... }
    }
  ],
  "total": 1
}
```

### POST /api/sync/validate

Validate sync configuration.

**Request**:
```json
{
  "name": "My Sync",
  "source": { ... },
  "target": { ... }
}
```

**Response**:
```json
{
  "valid": true,
  "message": "Configuration is valid"
}
```

---

## Conflict Resolution

When using bidirectional sync, conflicts can occur when the same row is modified in both databases.

### Strategies

#### 1. Source Wins
Source database always takes precedence.

```json
{
  "conflictStrategy": "source_wins"
}
```

#### 2. Target Wins
Target database always takes precedence.

```json
{
  "conflictStrategy": "target_wins"
}
```

#### 3. Latest Wins
Most recently modified record wins (requires timestamp column).

```json
{
  "conflictStrategy": "latest_wins",
  "tables": [
    {
      "sourceTable": "users",
      "timestampColumn": "updated_at"
    }
  ]
}
```

#### 4. Skip
Skip conflicting rows and continue.

```json
{
  "conflictStrategy": "skip"
}
```

#### 5. Manual
Throw error requiring manual resolution.

```json
{
  "conflictStrategy": "manual"
}
```

### Conflict Logging

All conflicts are logged in the audit log for review:

```bash
db-connector audit logs \
  --event-type conflict_detected \
  --start 2024-01-01 \
  --end 2024-01-31
```

---

## Best Practices

### 1. Use Timestamp Columns

Always configure timestamp columns for change tracking:

```json
{
  "tables": [
    {
      "sourceTable": "users",
      "timestampColumn": "updated_at",
      "primaryKey": ["id"]
    }
  ]
}
```

### 2. Start with Dry Run

Test sync configuration without making changes:

```bash
db-connector sync once --config sync.json --dry-run
```

### 3. Use Selective Sync

Only sync necessary tables and columns to reduce load:

```json
{
  "tables": [
    {
      "sourceTable": "users",
      "columns": ["id", "username", "email"],
      "whereClause": "active = 1 AND created_at > '2024-01-01'"
    }
  ]
}
```

### 4. Monitor Sync Performance

Check sync metrics regularly:

```bash
db-connector sync status --config sync.json
```

### 5. Set Appropriate Batch Sizes

Balance performance and memory usage:

```json
{
  "defaultBatchSize": 1000,
  "tables": [
    {
      "sourceTable": "large_table",
      "batchSize": 500
    }
  ]
}
```

### 6. Use Read-Only Users

Source database user should have read-only access:

```sql
-- MSSQL
CREATE LOGIN sync_user WITH PASSWORD = 'password';
CREATE USER sync_user FOR LOGIN sync_user;
GRANT SELECT ON DATABASE::ClientDB TO sync_user;

-- MySQL
CREATE USER 'sync_user'@'%' IDENTIFIED BY 'password';
GRANT SELECT ON ClientDB.* TO 'sync_user'@'%';

-- PostgreSQL
CREATE USER sync_user WITH PASSWORD 'password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sync_user;
```

### 7. Enable Audit Logging

Track all sync operations:

```json
{
  "enableDetailedLogging": true
}
```

### 8. Configure Retry Logic

Handle transient failures:

```json
{
  "retry": {
    "maxAttempts": 3,
    "delayMs": 2000,
    "backoffMultiplier": 2
  }
}
```

### 9. Use SSL/TLS

Secure database connections:

```json
{
  "source": {
    "type": "MSSQL",
    "host": "db.example.com",
    "port": 1433,
    "ssl": true
  }
}
```

### 10. Schedule Maintenance Windows

For initial clones of large databases, use low-traffic periods.

---

## Troubleshooting

### Connection Errors

**Problem**: Cannot connect to source/target database

**Solutions**:
1. Verify database credentials
2. Check network connectivity and firewall rules
3. Ensure database is running and accepting connections
4. Verify SSL/TLS configuration if enabled

```bash
# Test connectivity
telnet db.example.com 1433

# Validate configuration
db-connector sync validate --config sync.json
```

### Slow Sync Performance

**Problem**: Sync is taking too long

**Solutions**:
1. Increase batch size
2. Add indexes on timestamp columns
3. Reduce number of columns synced
4. Use WHERE clause to filter rows
5. Increase max concurrency

```json
{
  "defaultBatchSize": 5000,
  "maxConcurrency": 10,
  "tables": [
    {
      "sourceTable": "large_table",
      "columns": ["essential", "columns", "only"]
    }
  ]
}
```

### Primary Key Errors

**Problem**: "No primary key defined for table"

**Solution**: Configure primary key in table config:

```json
{
  "tables": [
    {
      "sourceTable": "users",
      "primaryKey": ["id"]
    }
  ]
}
```

### Conflicts Not Resolving

**Problem**: Bidirectional sync conflicts not being resolved

**Solutions**:
1. Ensure timestamp column is configured
2. Choose appropriate conflict strategy
3. Check conflict logs

```bash
db-connector audit logs --event-type conflict_detected
```

### Memory Issues

**Problem**: Out of memory errors during sync

**Solutions**:
1. Reduce batch size
2. Reduce max concurrency
3. Sync fewer tables at once
4. Increase available memory

```json
{
  "defaultBatchSize": 500,
  "maxConcurrency": 2
}
```

### Data Type Mismatches

**Problem**: Errors due to incompatible data types

**Solution**: Use column mappings to transform data:

```json
{
  "tables": [
    {
      "sourceTable": "users",
      "columnMappings": [
        {
          "source": "id",
          "target": "user_id",
          "transform": "cast_to_bigint"
        }
      ]
    }
  ]
}
```

---

## Getting Help

- **Documentation**: Check [API.md](./API.md) for API details
- **Deployment**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
- **Issues**: Report issues on GitHub
- **Logs**: Check application logs for detailed error messages

```bash
# View logs
docker logs db-connector-app

# Check audit logs
db-connector audit logs --limit 100
```
