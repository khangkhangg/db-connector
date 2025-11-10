# Schema Migrations and Versioning Guide

Complete guide for database schema migrations, versioning, and drift detection in DB Schema Mapper Connector.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Schema Versioning](#schema-versioning)
- [Creating Migrations](#creating-migrations)
- [Executing Migrations](#executing-migrations)
- [Drift Detection](#drift-detection)
- [Alert System](#alert-system)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)

## Overview

The migration system provides:

- **Schema Versioning**: Track schema changes over time with semantic versioning
- **Migration Generation**: Automatically generate migrations from schema comparisons
- **Safe Execution**: Execute migrations with rollback support and dry-run mode
- **Drift Detection**: Monitor for unexpected schema changes
- **Automated Alerts**: Get notified of schema changes and migration failures
- **Risk Assessment**: Evaluate migration risks before execution

## Quick Start

```typescript
import { MigrationManager } from './migration/migration-manager';
import { createAndConnectConnector } from './connectors/connector-factory';
import { DatabaseType } from './schema/types';

// Connect to database
const connector = await createAndConnectConnector(DatabaseType.MySQL, config);

// Initialize migration manager
const migrationManager = new MigrationManager(connector, {
  enableDriftMonitoring: true,
  driftCheckIntervalMs: 300000, // 5 minutes
  alertConfig: {
    enabled: true,
    channels: [{ type: 'log', enabled: true, config: {} }],
    severityThreshold: 'medium',
    notifyOnDrift: true,
    notifyOnMigration: true,
    notifyOnFailure: true
  }
});

// Initialize system
await migrationManager.initialize();

// Create and execute migration
const migration = await migrationManager.createMigration(oldSchema, newSchema);
await migrationManager.executeMigration(migration);

// Detect drift
const driftResult = await migrationManager.detectDrift(currentSchema);
console.log(migrationManager.generateDriftReport(driftResult));
```

## Schema Versioning

### Version Format

Versions follow semantic versioning: `MAJOR.MINOR.PATCH`

```typescript
// Get current version
const version = await migrationManager.getCurrentVersion();
console.log(`Current version: ${version?.version}`); // e.g., "1.2.3"

// Generate next version
const versionManager = new SchemaVersionManager(connector);
const nextVersion = await versionManager.generateNextVersion(); // "1.2.4"
```

### Version History

```typescript
// Get version history
const history = await migrationManager.getVersionHistory(10);

history.forEach(version => {
  console.log(`v${version.version} - ${version.description}`);
  console.log(`  Applied: ${version.applied_at}`);
  console.log(`  Migrations: ${version.migrations.length}`);
});
```

### Schema Snapshots

Snapshots capture the complete database schema at a point in time:

```typescript
const versionManager = new SchemaVersionManager(connector);

// Create snapshot
const snapshot = await versionManager.createSnapshot(schema, '1.0.0');

// Retrieve snapshot
const historical = await versionManager.getSnapshot('1.0.0');

// Get latest snapshot
const latest = await versionManager.getLatestSnapshot();
```

## Creating Migrations

### Automatic Generation

Generate migrations by comparing two schemas:

```typescript
import { DBSchemaMapper } from './';

const mapper = new DBSchemaMapper();

// Read old schema (from snapshot or database)
const oldSchema = await mapper.readLocalSchema(DatabaseType.MySQL);

// Read new schema (after changes)
const newSchema = await mapper.readLocalSchema(DatabaseType.MySQL);

// Generate migration
const migration = await migrationManager.createMigration(
  oldSchema,
  newSchema,
  'Add user authentication tables'
);

console.log(`Migration created: v${migration.version}`);
console.log(`Operations: ${migration.operations.up.length}`);
```

### Migration Structure

```typescript
interface Migration {
  id: string;
  name: string;
  version: string;
  description?: string;
  databaseType: DatabaseType;
  operations: {
    up: MigrationOperation[];    // Forward migration
    down: MigrationOperation[];  // Rollback migration
  };
  createdAt: Date;
  checksum?: string;
}
```

### Operation Types

Migrations support various operations:

- `CREATE_TABLE` - Create new table
- `DROP_TABLE` - Remove table
- `ALTER_TABLE` - Modify table
- `ADD_COLUMN` - Add column
- `DROP_COLUMN` - Remove column
- `MODIFY_COLUMN` - Change column
- `ADD_INDEX` - Create index
- `DROP_INDEX` - Remove index
- `ADD_FOREIGN_KEY` - Add FK constraint
- `DROP_FOREIGN_KEY` - Remove FK constraint
- `RENAME_TABLE` - Rename table
- `RENAME_COLUMN` - Rename column
- `RAW_SQL` - Custom SQL

## Executing Migrations

### Dry Run

Test migrations without applying changes:

```typescript
// Dry run - no changes made to database
await migrationManager.executeMigration(migration, true);
console.log('Dry run completed - no changes made');
```

### Execute Migration

```typescript
// Execute migration
await migrationManager.executeMigration(migration, false);
console.log('Migration applied successfully');
```

### Migration Plan

Review migration plan before execution:

```typescript
const executor = new MigrationExecutor(connector);
const plan = await executor.createMigrationPlan([migration]);

console.log(`Total operations: ${plan.totalOperations}`);
console.log(`Estimated time: ${plan.estimatedTime}ms`);
console.log(`Can rollback: ${plan.canRollback}`);

// Check risks
plan.risks.forEach(risk => {
  console.log(`[${risk.level.toUpperCase()}] ${risk.description}`);
  if (risk.mitigation) {
    console.log(`  Mitigation: ${risk.mitigation}`);
  }
});
```

### Rollback

Rollback a migration if needed:

```typescript
try {
  await migrationManager.executeMigration(migration);
} catch (error) {
  console.error('Migration failed, rolling back...');
  await migrationManager.rollbackMigration(migration);
}
```

### Batch Execution

Execute multiple migrations:

```typescript
const executor = new MigrationExecutor(connector);

const records = await executor.executeMigrations(
  [migration1, migration2, migration3],
  MigrationDirection.UP,
  true // stop on error
);

records.forEach(record => {
  console.log(`${record.name}: ${record.status} (${record.execution_time_ms}ms)`);
});
```

## Drift Detection

### Manual Detection

Detect drift on-demand:

```typescript
const currentSchema = await mapper.readLocalSchema(DatabaseType.MySQL);
const driftResult = await migrationManager.detectDrift(currentSchema);

if (driftResult.hasDrift) {
  console.log(`Drift detected: ${driftResult.severity}`);
  console.log(`Changes: ${driftResult.changes.length}`);
  console.log(`Affected tables: ${driftResult.affectedTables.join(', ')}`);

  // Generate report
  const report = migrationManager.generateDriftReport(driftResult);
  console.log(report);
}
```

### Drift Result

```typescript
interface DriftDetectionResult {
  hasDrift: boolean;
  driftType: 'schema' | 'data' | 'both' | 'none';
  changes: DriftChange[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  affectedTables: string[];
}
```

### Drift Changes

Each drift change includes:

```typescript
interface DriftChange {
  type: 'table_added' | 'table_removed' | 'column_added' | ...;
  table: string;
  column?: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expectedValue?: any;
  actualValue?: any;
  autoFixable: boolean;
  fixSuggestion?: string;
}
```

### Continuous Monitoring

Monitor for drift continuously:

```typescript
// Start monitoring (checks every 5 minutes)
migrationManager.startDriftMonitoring(async () => {
  return await mapper.readLocalSchema(DatabaseType.MySQL);
});

// Stop monitoring
migrationManager.stopDriftMonitoring();
```

### Validation Rules

Define custom validation rules for schema changes:

```typescript
const driftDetector = new DriftDetector(connector, versionManager, [
  {
    name: 'no_production_table_drops',
    description: 'Prevent table drops in production',
    severity: 'error',
    validate: (change) => change.type !== 'table_removed',
    message: 'Dropping tables in production is forbidden'
  },
  {
    name: 'require_default_values',
    description: 'New columns must have defaults',
    severity: 'warning',
    validate: (change) => {
      if (change.type === 'column_added') {
        // Check if column has default value
        return true; // Simplified
      }
      return true;
    },
    message: 'New columns should have default values'
  }
]);

// Validate drift changes
const validation = driftDetector.validateChanges(driftResult.changes);

if (!validation.valid) {
  console.error('Schema changes violate rules:');
  validation.errors.forEach(err => console.error(`  - ${err}`));
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:');
  validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
}
```

## Alert System

### Configuration

Configure alerts when initializing MigrationManager:

```typescript
const migrationManager = new MigrationManager(connector, {
  alertConfig: {
    enabled: true,
    channels: [
      // Log alerts
      {
        type: 'log',
        enabled: true,
        config: {}
      },
      // Slack alerts
      {
        type: 'slack',
        enabled: true,
        config: {
          webhookUrl: 'https://hooks.slack.com/services/...'
        }
      },
      // Custom webhook
      {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://your-api.com/alerts',
          headers: {
            'Authorization': 'Bearer token123'
          }
        }
      },
      // Email alerts
      {
        type: 'email',
        enabled: true,
        config: {
          recipients: ['ops@company.com', 'dba@company.com']
        }
      }
    ],
    severityThreshold: 'medium',
    notifyOnDrift: true,
    notifyOnMigration: true,
    notifyOnFailure: true
  }
});
```

### Alert Types

- **drift_detected**: Schema drift was found
- **migration_completed**: Migration executed successfully
- **migration_failed**: Migration execution failed
- **validation_failed**: Schema change validation failed

### Managing Alerts

```typescript
const alertManager = migrationManager.getAlertManager();

if (alertManager) {
  // Get alert history
  const alerts = alertManager.getHistory(10);

  // Get unacknowledged alerts
  const unacked = alertManager.getUnacknowledged();
  console.log(`${unacked.length} unacknowledged alerts`);

  // Acknowledge alert
  alertManager.acknowledgeAlert(alertId);

  // Clear history
  alertManager.clearHistory();
}
```

## Best Practices

### 1. Always Use Dry Run First

```typescript
// Test migration first
await migrationManager.executeMigration(migration, true);

// If successful, execute for real
await migrationManager.executeMigration(migration, false);
```

### 2. Backup Before Migrations

```bash
# Backup database before running migrations
mysqldump -u user -p database > backup_before_migration.sql
```

### 3. Test in Staging First

Always test migrations in a staging environment that mirrors production.

### 4. Monitor Drift Continuously

```typescript
// Enable continuous monitoring
migrationManager.startDriftMonitoring(async () => {
  return await getCurrentSchema();
});
```

### 5. Review Migration Plans

```typescript
const plan = await executor.createMigrationPlan([migration]);

// Review risks
if (plan.risks.some(r => r.level === 'critical')) {
  console.error('CRITICAL RISKS DETECTED - MANUAL REVIEW REQUIRED');
  process.exit(1);
}
```

### 6. Version Control Migrations

Store generated migrations in version control:

```typescript
const migration = await migrationManager.createMigration(old, new);

// Save to file
fs.writeFileSync(
  `migrations/${migration.version}_${migration.name}.json`,
  JSON.stringify(migration, null, 2)
);
```

### 7. Implement Change Windows

Only run migrations during maintenance windows:

```typescript
const now = new Date();
const hour = now.getHours();

// Only run between 2-4 AM
if (hour >= 2 && hour < 4) {
  await migrationManager.executeMigration(migration);
} else {
  console.log('Outside maintenance window - migration scheduled');
}
```

### 8. Use Schema Validation Rules

Enforce organizational policies:

```typescript
const rules = [
  {
    name: 'no_cascading_deletes',
    severity: 'error',
    validate: (change) => {
      // Prevent CASCADE on foreign keys
      return !change.description.includes('CASCADE');
    },
    message: 'Cascading deletes are not allowed'
  }
];
```

## API Reference

### MigrationManager

```typescript
class MigrationManager {
  constructor(connector: BaseDatabaseConnector, config?: MigrationManagerConfig);

  // Initialization
  initialize(): Promise<void>;

  // Migration operations
  createMigration(oldSchema, newSchema, description?): Promise<Migration>;
  executeMigration(migration, dryRun?): Promise<void>;
  rollbackMigration(migration): Promise<void>;

  // Drift detection
  detectDrift(currentSchema, expectedVersion?): Promise<DriftDetectionResult>;
  startDriftMonitoring(getCurrentSchema): void;
  stopDriftMonitoring(): void;
  generateDriftReport(result): string;

  // History and versioning
  getCurrentVersion(): Promise<SchemaVersion | null>;
  getVersionHistory(limit?): Promise<SchemaVersion[]>;
  getMigrationHistory(limit?): Promise<MigrationRecord[]>;
  getPendingMigrations(allMigrations): Promise<Migration[]>;

  // Component access
  getDriftDetector(): DriftDetector;
  getAlertManager(): AlertManager | undefined;
}
```

### SchemaVersionManager

```typescript
class SchemaVersionManager {
  initialize(): Promise<void>;
  getCurrentVersion(): Promise<SchemaVersion | null>;
  saveVersion(version): Promise<void>;
  getAllVersions(): Promise<SchemaVersion[]>;
  createSnapshot(schema, version): Promise<SchemaSnapshot>;
  getSnapshot(version): Promise<SchemaSnapshot | null>;
  getLatestSnapshot(): Promise<SchemaSnapshot | null>;
  generateNextVersion(): Promise<string>;
  validateVersionFormat(version): boolean;
  compareVersions(v1, v2): number;
}
```

### MigrationExecutor

```typescript
class MigrationExecutor {
  initialize(): Promise<void>;
  executeMigration(migration, direction?, dryRun?): Promise<MigrationRecord>;
  executeMigrations(migrations, direction?, stopOnError?): Promise<MigrationRecord[]>;
  rollbackMigration(migration): Promise<void>;
  getMigrationHistory(limit?): Promise<MigrationRecord[]>;
  getPendingMigrations(allMigrations): Promise<Migration[]>;
  createMigrationPlan(migrations): Promise<MigrationPlan>;
  verifyMigrationIntegrity(migration): Promise<boolean>;
}
```

### DriftDetector

```typescript
class DriftDetector {
  detectDrift(currentSchema, expectedVersion?): Promise<DriftDetectionResult>;
  validateChanges(changes): { valid: boolean; errors: string[]; warnings: string[] };
  startMonitoring(intervalMs, getCurrentSchema): void;
  stopMonitoring(): void;
  onAlert(callback): void;
  generateDriftReport(result): string;
  getAutoFixableChanges(result): DriftChange[];
  isWithinThreshold(result, maxChanges?, maxSeverity?): boolean;
}
```

### AlertManager

```typescript
class AlertManager {
  sendAlert(alert): Promise<void>;
  getHistory(limit?): SchemaAlert[];
  acknowledgeAlert(alertId): void;
  getUnacknowledged(): SchemaAlert[];
  clearHistory(): void;
}
```

## Examples

See `examples/migration-usage.ts` for complete working examples.

## Troubleshooting

### Migration Fails with Checksum Mismatch

```
Error: Migration checksum mismatch
```

Solution: Migration has been modified after creation. Regenerate the migration.

### Drift Not Detected

Ensure:
1. Latest snapshot exists
2. Schema comparison is working
3. Drift monitoring is started

### Alerts Not Sending

Check:
1. Alert configuration is enabled
2. Severity threshold is correct
3. Channel configuration is valid
4. Network connectivity for webhooks

## Related Documentation

- [CRUD API Guide](./CRUD_API.md)
- [Main README](../README.md)
