# MDF File Import Guide

Complete guide for importing SQL Server MDF database files and syncing their data to other databases.

## Table of Contents

1. [Overview](#overview)
2. [Quick Answer](#quick-answer)
3. [How It Works](#how-it-works)
4. [Requirements](#requirements)
5. [Basic Usage](#basic-usage)
6. [Advanced Features](#advanced-features)
7. [Common Scenarios](#common-scenarios)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

The DB Schema Mapper Connector supports **importing SQL Server MDF database files** in multiple ways:

✅ **Attach MDF files** to a running SQL Server instance
✅ **Sync data** from MDF to cloud databases (PostgreSQL, MySQL)
✅ **Read-only access** to archival MDF files
✅ **Batch import** of multiple MDF files
✅ **Backup and restore** operations
✅ **Network share** MDF files

---

## Quick Answer

### Q: Can I import MDF files?

**YES! Three ways:** ✅

1. **Attach to SQL Server** (recommended) - Full access to all data
2. **Restore from backup** - Standard SQL Server restore
3. **Direct import + sync** - One-step process

### Simple Example

```typescript
import { createMDFImportManager } from 'db-connector';

// 1. Create manager
const mdfManager = await createMDFImportManager({
  host: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'YourPassword123!'
});

// 2. Import MDF file
const result = await mdfManager.importMDF({
  mdfPath: 'C:\\Database\\ClientDB.mdf'
});

console.log(`✅ Database '${result.databaseName}' imported!`);

// 3. Now sync to cloud
// ... use DataSyncManager with result.databaseName
```

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────┐
│     MDF File on Disk                    │
│     C:\Database\ClientDB.mdf            │
│     C:\Database\ClientDB_log.ldf        │
└──────────────┬──────────────────────────┘
               │
               │ Attach
               ↓
┌─────────────────────────────────────────┐
│   SQL Server Instance                   │
│   • Database attached as 'ClientDB'     │
│   • Full read/write access              │
│   • Query normally via MSSQL connector  │
└──────────────┬──────────────────────────┘
               │
               │ Sync
               ↓
┌─────────────────────────────────────────┐
│   Target Database (PostgreSQL/MySQL)    │
│   • Data synchronized                   │
│   • Schema mapped                       │
│   • Ready to use                        │
└─────────────────────────────────────────┘
```

### Process Flow

```
1. MDF File → Attach to SQL Server
2. SQL Server → Read data via MSSQL Connector
3. Data → Transform & Map schema
4. Target DB → Write data
5. (Optional) SQL Server → Detach MDF
```

---

## Requirements

### System Requirements

1. **SQL Server Instance**
   - SQL Server 2016+ (any edition)
   - Local or remote instance
   - Service account with permissions

2. **File Access**
   - SQL Server service account needs **read access** to MDF file
   - For network shares: Network read permissions
   - Sufficient disk space for SQL Server data directory

3. **Permissions**
   - `CREATE DATABASE` permission
   - `sysadmin` or `dbcreator` role recommended

### File Requirements

- **MDF File** (required) - Database data file
- **LDF File** (optional) - Transaction log file
  - Auto-detected if same directory
  - Can be rebuilt if missing
- **File Format** - SQL Server 2005+ compatible

---

## Basic Usage

### 1. Import MDF File

```typescript
import { createMDFImportManager } from 'db-connector';

const mdfManager = await createMDFImportManager({
  host: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'YourPassword123!'
});

const result = await mdfManager.importMDF({
  mdfPath: 'C:\\Database\\ClientDB.mdf',
  ldfPath: 'C:\\Database\\ClientDB_log.ldf' // Optional
});

console.log('Import Result:', result);
// {
//   success: true,
//   databaseName: 'ClientDB',
//   attached: true,
//   message: 'Database attached successfully',
//   fileInfo: {
//     mdfSize: 524288000, // bytes
//     ldfSize: 131072000,
//     location: 'C:\\Database\\ClientDB.mdf'
//   }
// }
```

### 2. Import and Sync to Cloud

```typescript
import { createMDFImportManager, DataSyncManager } from 'db-connector';

// Step 1: Import MDF
const mdfManager = await createMDFImportManager({
  host: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'password'
});

const importResult = await mdfManager.importMDF({
  mdfPath: 'C:\\Database\\ClientDB.mdf'
});

// Step 2: Sync to PostgreSQL
const syncManager = new DataSyncManager();
await syncManager.initialize({
  source: {
    type: 'MSSQL',
    host: 'localhost',
    port: 1433,
    database: importResult.databaseName, // Use imported DB
    user: 'sa',
    password: 'password'
  },
  target: {
    type: 'PostgreSQL',
    host: 'cloud.database.com',
    port: 5432,
    database: 'CloudDB',
    user: 'sync_user',
    password: 'cloudpass',
    ssl: true
  },
  direction: 'source_to_target',
  mode: 'once',
  tables: [
    { sourceTable: 'Customers', primaryKey: ['id'], enabled: true },
    { sourceTable: 'Orders', primaryKey: ['id'], enabled: true }
  ]
});

const syncResult = await syncManager.sync();
console.log(`✅ Synced ${syncResult.summary.totalInserted} records to cloud`);
```

### 3. Import with Custom Name

```typescript
await mdfManager.importMDF(
  {
    mdfPath: 'C:\\Database\\ClientDB.mdf'
  },
  {
    databaseName: 'ImportedClientDB', // Custom database name
    forceDetach: true, // Detach if already exists
    readOnly: false
  }
);
```

### 4. Detach When Done

```typescript
await mdfManager.detachDatabase('ClientDB');
console.log('✅ Database detached');
```

---

## Advanced Features

### Read-Only Import

Perfect for accessing archival databases without modification risk:

```typescript
await mdfManager.importMDF(
  {
    mdfPath: 'C:\\Archives\\OldDatabase.mdf'
  },
  {
    databaseName: 'Archive_ReadOnly',
    readOnly: true, // ← Read-only mode
    forceDetach: true
  }
);

// Can query but not modify
// Perfect for reporting or migration
```

### Auto-Detect Log File

If log file is in same directory with standard naming:

```typescript
// Will auto-find: ClientDB.ldf or ClientDB_log.ldf
await mdfManager.importMDF({
  mdfPath: 'C:\\Database\\ClientDB.mdf'
  // ldfPath not needed!
});
```

### Missing Log File Handling

If log file is missing or corrupted:

```typescript
// System will automatically rebuild log file
await mdfManager.importMDF({
  mdfPath: 'C:\\Database\\ClientDB.mdf'
  // Works even if .ldf is missing!
});
```

### Get MDF Info Without Importing

Inspect MDF file without attaching:

```typescript
const info = await mdfManager.getMDFInfo('C:\\Database\\ClientDB.mdf');

console.log(`Database: ${info.databaseName}`);
console.log(`Size: ${(info.fileSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Has Log: ${info.hasLogFile}`);
```

### List Attached Databases

```typescript
const databases = await mdfManager.listDatabases();
console.log('Attached databases:', databases);
// ['ClientDB', 'ProductionDB', 'TestDB']
```

### Get Database Files

```typescript
const files = await mdfManager.getDatabaseFiles('ClientDB');
console.log('Data files:', files.dataFiles);
console.log('Log files:', files.logFiles);
```

### Backup Database

```typescript
await mdfManager.backupDatabase(
  'ClientDB',
  'C:\\Backups\\ClientDB_backup.bak'
);
console.log('✅ Backup created');
```

### Restore from Backup

```typescript
await mdfManager.restoreDatabase(
  'C:\\Backups\\ClientDB_backup.bak',
  'RestoredDB',
  {
    replace: false, // Don't replace existing database
    recovery: true // Full recovery mode
  }
);
console.log('✅ Database restored');
```

---

## Common Scenarios

### Scenario 1: Client Sends MDF File

**Problem**: Client sends you an MDF file to migrate to your cloud database.

**Solution**:

```typescript
// 1. Receive ClientDB.mdf file
// 2. Import it
const result = await mdfManager.importMDF({
  mdfPath: 'C:\\ClientFiles\\ClientDB.mdf'
});

// 3. Sync to your cloud
await syncManager.initialize({
  source: {
    type: 'MSSQL',
    host: 'localhost',
    database: result.databaseName,
    ...
  },
  target: {
    type: 'PostgreSQL',
    host: 'your-cloud-db.com',
    ...
  }
});

await syncManager.sync();

// 4. Cleanup
await mdfManager.detachDatabase(result.databaseName);

console.log('✅ Client database migrated to cloud');
```

### Scenario 2: Multiple Client Databases

**Problem**: Need to import and consolidate data from multiple client MDF files.

**Solution**:

```typescript
const clientMDFs = [
  'C:\\Clients\\Client1.mdf',
  'C:\\Clients\\Client2.mdf',
  'C:\\Clients\\Client3.mdf'
];

for (const mdfPath of clientMDFs) {
  // Import
  const result = await mdfManager.importMDF({ mdfPath });

  // Sync to consolidated database
  await syncToConsolidatedDB(result.databaseName);

  // Cleanup
  await mdfManager.detachDatabase(result.databaseName);
}

console.log('✅ All client databases consolidated');
```

### Scenario 3: Archival Database Access

**Problem**: Need to query old MDF files occasionally for historical data.

**Solution**:

```typescript
// Attach as read-only
await mdfManager.importMDF(
  {
    mdfPath: '\\\\FileServer\\Archives\\2020\\ClientDB.mdf'
  },
  {
    databaseName: 'Archive_2020',
    readOnly: true // No accidental modifications
  }
);

// Query for historical data
// Leave attached for future queries
// Or detach when done
```

### Scenario 4: Disaster Recovery

**Problem**: Need to restore from backup MDF files.

**Solution**:

```typescript
// Option 1: Restore from .bak file
await mdfManager.restoreDatabase(
  'C:\\Backups\\Production_backup.bak',
  'Production_Restored'
);

// Option 2: Attach MDF directly
await mdfManager.importMDF({
  mdfPath: 'C:\\Backups\\Production.mdf'
});
```

### Scenario 5: Network Share MDF

**Problem**: MDF files are on a network file server.

**Solution**:

```typescript
// UNC path to network share
const networkPath = '\\\\FileServer\\Databases\\ClientDB.mdf';

await mdfManager.importMDF({
  mdfPath: networkPath
});

// Note: SQL Server service account needs network permissions
```

---

## Troubleshooting

### Error: "Database already exists"

**Problem**: Database name conflicts with existing database.

**Solution**:

```typescript
// Option 1: Use custom name
await mdfManager.importMDF(
  { mdfPath: 'C:\\DB\\ClientDB.mdf' },
  { databaseName: 'ClientDB_Import' }
);

// Option 2: Force detach existing
await mdfManager.importMDF(
  { mdfPath: 'C:\\DB\\ClientDB.mdf' },
  { forceDetach: true }
);
```

### Error: "Access denied" or "Permission denied"

**Problem**: SQL Server service account can't access MDF file.

**Solution**:

1. **Check file permissions**:
   ```powershell
   # Right-click MDF file → Properties → Security
   # Add: "NT SERVICE\MSSQLSERVER" with Read permissions
   ```

2. **Move to SQL Server data directory**:
   ```typescript
   // SQL Server always has access to its data directory
   // Copy MDF to: C:\Program Files\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQL\DATA\
   ```

3. **Run SQL Server with elevated account**:
   - Change SQL Server service to run as domain admin (not recommended for production)
   - Better: Grant specific folder access

### Error: "Log file cannot be found"

**Problem**: Log file (.ldf) is missing or path is wrong.

**Solution**:

```typescript
// System will automatically rebuild log
await mdfManager.importMDF({
  mdfPath: 'C:\\DB\\ClientDB.mdf'
  // Don't specify ldfPath - will rebuild automatically
});
```

### Error: "Database is in use"

**Problem**: Database is attached and has active connections.

**Solution**:

```typescript
// Detach will close all connections
await mdfManager.detachDatabase('DatabaseName');

// Then re-attach
await mdfManager.importMDF({ mdfPath: '...' });
```

### Error: "Version mismatch"

**Problem**: MDF file is from newer SQL Server version.

**Solution**:

- Upgrade your SQL Server instance
- Or restore MDF on compatible version first

### MDF on Network Share Not Working

**Problem**: Can't access MDF on network share.

**Solutions**:

1. **Grant network permissions**:
   ```
   \\FileServer\Databases → Right-click → Properties → Security
   Add: SQL Server service account with Read
   ```

2. **Use mapped drive** (not recommended):
   ```typescript
   // Map network drive first
   // Then use: 'Z:\\ClientDB.mdf'
   ```

3. **Copy to local disk** (recommended):
   ```typescript
   // Copy from network to local first
   // Then import from local path
   ```

---

## Best Practices

### ✅ DO

1. **Always backup first**
   ```typescript
   // Backup before importing
   await mdfManager.backupDatabase('SourceDB', 'backup.bak');
   ```

2. **Use read-only for archival access**
   ```typescript
   { readOnly: true }
   ```

3. **Detach when done (temporary imports)**
   ```typescript
   await mdfManager.detachDatabase(dbName);
   ```

4. **Check MDF info first**
   ```typescript
   const info = await mdfManager.getMDFInfo(mdfPath);
   console.log(`Will import ${info.fileSize / 1024 / 1024} MB`);
   ```

5. **Use specific database names**
   ```typescript
   { databaseName: 'Client_2024_Import' }
   ```

6. **Copy to local disk for network MDFs**
   ```bash
   # Faster and more reliable
   copy \\server\share\db.mdf C:\temp\db.mdf
   ```

7. **Validate after import**
   ```typescript
   const databases = await mdfManager.listDatabases();
   console.log('Imported:', databases);
   ```

### ❌ DON'T

1. **Don't modify MDF files directly** - Always go through SQL Server

2. **Don't leave unnecessary databases attached**
   ```typescript
   // Detach when done
   await mdfManager.detachDatabase(dbName);
   ```

3. **Don't ignore version compatibility**
   - Check SQL Server versions match

4. **Don't run SQL Server as Administrator** - Security risk

5. **Don't skip backups** - Always backup before operations

6. **Don't use mapped network drives** - UNC paths are better

---

## Security Considerations

### File Permissions

```
Required Permissions for MDF/LDF files:
- SQL Server service account: Read
- Your user account: Read (optional)

DO NOT give: Write, Modify, Full Control (unless necessary)
```

### Read-Only Mode

```typescript
// For sensitive data
{
  readOnly: true // Prevents accidental modifications
}
```

### Detach After Use

```typescript
// Don't leave databases attached unnecessarily
await mdfManager.detachDatabase(dbName);
```

### Audit Trail

```typescript
// Log all MDF operations
console.log(`Imported MDF: ${mdfPath} at ${new Date()}`);
```

---

## Performance Tips

### Large MDF Files

```typescript
// For large files (>10GB):
// 1. Ensure sufficient disk space (2x file size)
// 2. Import during off-hours
// 3. Use batch sync with smaller batch sizes

await syncManager.initialize({
  ...
  defaultBatchSize: 500, // Smaller batches for large databases
  maxConcurrency: 2
});
```

### Multiple MDFs

```typescript
// Process in parallel
const imports = mdfFiles.map(mdf =>
  mdfManager.importMDF({ mdfPath: mdf })
);

await Promise.all(imports);
```

### Network Performance

```bash
# Copy to local first (much faster)
robocopy \\server\share C:\temp ClientDB.mdf /MT:8
```

---

## CLI Support

### Import MDF via CLI

```bash
# Add to CLI
db-connector import mdf \
  --file "C:\Database\ClientDB.mdf" \
  --server localhost \
  --user sa \
  --password "password" \
  --database-name "ImportedDB"
```

### Import and Sync

```bash
db-connector import mdf-sync \
  --mdf "C:\Database\ClientDB.mdf" \
  --target-type postgresql \
  --target-host cloud.db.com \
  --target-database CloudDB
```

---

## API Endpoints

### POST /api/import/mdf

Import MDF file via REST API:

```http
POST /api/import/mdf
Content-Type: application/json

{
  "mdfPath": "C:\\Database\\ClientDB.mdf",
  "options": {
    "databaseName": "ImportedDB",
    "forceDetach": true,
    "readOnly": false
  },
  "sqlServer": {
    "host": "localhost",
    "port": 1433,
    "user": "sa",
    "password": "password"
  }
}
```

**Response**:
```json
{
  "success": true,
  "databaseName": "ImportedDB",
  "fileSize": 524288000,
  "message": "Database imported successfully"
}
```

---

## Complete Example: Production Workflow

```typescript
import { createMDFImportManager, DataSyncManager } from 'db-connector';

async function productionImportWorkflow(mdfPath: string) {
  console.log('Starting production MDF import workflow...');

  // 1. Create manager
  const mdfManager = await createMDFImportManager({
    host: process.env.SQL_SERVER_HOST || 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD
  });

  try {
    // 2. Inspect MDF first
    console.log('Inspecting MDF file...');
    const info = await mdfManager.getMDFInfo(mdfPath);
    console.log(`  Database: ${info.databaseName}`);
    console.log(`  Size: ${(info.fileSize / 1024 / 1024).toFixed(2)} MB`);

    // 3. Import MDF
    console.log('Importing MDF...');
    const importResult = await mdfManager.importMDF(
      { mdfPath },
      {
        databaseName: `Import_${Date.now()}`,
        forceDetach: true
      }
    );
    console.log(`  ✅ Imported as: ${importResult.databaseName}`);

    // 4. Sync to production cloud database
    console.log('Syncing to cloud...');
    const syncManager = new DataSyncManager();

    await syncManager.initialize({
      source: {
        type: 'MSSQL',
        host: 'localhost',
        database: importResult.databaseName,
        user: 'sa',
        password: process.env.SQL_SERVER_PASSWORD
      },
      target: {
        type: 'PostgreSQL',
        host: process.env.CLOUD_DB_HOST,
        database: process.env.CLOUD_DB_NAME,
        user: process.env.CLOUD_DB_USER,
        password: process.env.CLOUD_DB_PASSWORD,
        ssl: true
      },
      direction: 'source_to_target',
      mode: 'once',
      tables: [
        { sourceTable: 'Customers', primaryKey: ['id'], enabled: true },
        { sourceTable: 'Orders', primaryKey: ['id'], enabled: true },
        { sourceTable: 'Products', primaryKey: ['id'], enabled: true }
      ],
      defaultBatchSize: 1000
    });

    const syncResult = await syncManager.sync();
    console.log(`  ✅ Synced ${syncResult.summary.totalInserted} records`);

    await syncManager.disconnect();

    // 5. Cleanup - detach temporary database
    console.log('Cleaning up...');
    await mdfManager.detachDatabase(importResult.databaseName);
    console.log('  ✅ Detached temporary database');

    console.log('\n✅ Production import workflow completed successfully!');

    return {
      success: true,
      recordsSynced: syncResult.summary.totalInserted
    };
  } catch (error) {
    console.error('❌ Import workflow failed:', error);
    throw error;
  }
}

// Usage
productionImportWorkflow('C:\\ClientData\\ClientDB.mdf')
  .then(result => console.log('Result:', result))
  .catch(error => console.error('Error:', error));
```

---

## Additional Resources

- **[Data Sync Guide](./DATA_SYNC.md)** - Complete synchronization documentation
- **[Examples](../examples/mdf-import-examples.ts)** - Working code examples
- **[API Documentation](./API.md)** - REST API reference

---

**Made with 💾 for SQL Server Database Migration**
