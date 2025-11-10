#!/usr/bin/env node
/**
 * DB Schema Mapper Connector - Command Line Interface
 */

import { Command } from 'commander';
import { createAndConnectConnector } from '../connectors/connector-factory';
import { DatabaseType } from '../schema/types';
import { SchemaMapper } from '../schema/schema-mapper';
import { SchemaVersionManager } from '../migration/schema-version-manager';
import { MigrationGenerator } from '../migration/migration-generator';
import { MigrationExecutor } from '../migration/migration-executor';
import { DriftDetector } from '../migration/drift-detector';
import { ObservabilityManager } from '../observability/observability-manager';
import { DataSyncManager } from '../sync/data-sync-manager';
import { ChangeTracker, ChangeTrackingMethod } from '../sync/change-tracker';
import { SyncConfig, SyncDirection, SyncMode, ConflictStrategy } from '../sync/types';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('CLI');
const program = new Command();

// Version
program
  .name('db-connector')
  .description('DB Schema Mapper Connector - Map and sync database schemas')
  .version('1.0.0');

/**
 * Schema Commands
 */
const schemaCmd = program.command('schema').description('Schema operations');

schemaCmd
  .command('read')
  .description('Read schema from database')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .option('--output <file>', 'Output file (JSON)')
  .option('--include-system', 'Include system tables', false)
  .action(async (options) => {
    try {
      logger.info('Reading schema from database', {
        type: options.type,
        host: options.host,
        database: options.database
      });

      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const schema = await connector.readSchema({
        includeSystemTables: options.includeSystem
      });

      await connector.disconnect();

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(schema, null, 2));
        logger.info('Schema written to file', { file: options.output });
      } else {
        console.log(JSON.stringify(schema, null, 2));
      }

      logger.info('Schema read successfully', {
        tables: schema.tables.length,
        views: schema.views?.length || 0
      });
    } catch (error) {
      logger.error('Failed to read schema', { error });
      process.exit(1);
    }
  });

schemaCmd
  .command('compare')
  .description('Compare two schemas')
  .requiredOption('--schema1 <file>', 'First schema file (JSON)')
  .requiredOption('--schema2 <file>', 'Second schema file (JSON)')
  .option('--output <file>', 'Output file for differences (JSON)')
  .action(async (options) => {
    try {
      logger.info('Comparing schemas', {
        schema1: options.schema1,
        schema2: options.schema2
      });

      const schema1 = JSON.parse(fs.readFileSync(options.schema1, 'utf-8'));
      const schema2 = JSON.parse(fs.readFileSync(options.schema2, 'utf-8'));

      const mapper = new SchemaMapper();
      const differences = mapper.compareSchemas(schema1, schema2);

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(differences, null, 2));
        logger.info('Differences written to file', { file: options.output });
      } else {
        console.log(JSON.stringify(differences, null, 2));
      }

      logger.info('Schema comparison complete', {
        tablesAdded: differences.tablesAdded.length,
        tablesRemoved: differences.tablesRemoved.length,
        tablesModified: differences.tablesModified.length
      });
    } catch (error) {
      logger.error('Failed to compare schemas', { error });
      process.exit(1);
    }
  });

schemaCmd
  .command('map')
  .description('Map schema to different database type')
  .requiredOption('--input <file>', 'Input schema file (JSON)')
  .requiredOption('--target <type>', 'Target database type (mssql or mysql)')
  .option('--output <file>', 'Output file (JSON)')
  .action(async (options) => {
    try {
      logger.info('Mapping schema', {
        input: options.input,
        target: options.target
      });

      const schema = JSON.parse(fs.readFileSync(options.input, 'utf-8'));
      const targetType = options.target.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const mapper = new SchemaMapper();
      const mappedSchema = mapper.mapSchema(schema, targetType);

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(mappedSchema, null, 2));
        logger.info('Mapped schema written to file', { file: options.output });
      } else {
        console.log(JSON.stringify(mappedSchema, null, 2));
      }

      logger.info('Schema mapping complete');
    } catch (error) {
      logger.error('Failed to map schema', { error });
      process.exit(1);
    }
  });

/**
 * Migration Commands
 */
const migrationCmd = program.command('migration').description('Migration operations');

migrationCmd
  .command('init')
  .description('Initialize migration system')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .action(async (options) => {
    try {
      logger.info('Initializing migration system');

      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const versionManager = new SchemaVersionManager(connector);
      await versionManager.initialize();

      await connector.disconnect();

      logger.info('Migration system initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize migration system', { error });
      process.exit(1);
    }
  });

migrationCmd
  .command('generate')
  .description('Generate migration from schema differences')
  .requiredOption('--old <file>', 'Old schema file (JSON)')
  .requiredOption('--new <file>', 'New schema file (JSON)')
  .requiredOption('--version <version>', 'Migration version (e.g., 1.0.0)')
  .option('--description <desc>', 'Migration description')
  .option('--output <file>', 'Output file (JSON)')
  .action(async (options) => {
    try {
      logger.info('Generating migration', {
        version: options.version
      });

      const oldSchema = JSON.parse(fs.readFileSync(options.old, 'utf-8'));
      const newSchema = JSON.parse(fs.readFileSync(options.new, 'utf-8'));

      const generator = new MigrationGenerator();
      const migration = generator.generateMigration(
        oldSchema,
        newSchema,
        options.version,
        options.description || 'Auto-generated migration'
      );

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(migration, null, 2));
        logger.info('Migration written to file', { file: options.output });
      } else {
        console.log(JSON.stringify(migration, null, 2));
      }

      logger.info('Migration generated successfully', {
        operations: migration.operations.length
      });
    } catch (error) {
      logger.error('Failed to generate migration', { error });
      process.exit(1);
    }
  });

migrationCmd
  .command('execute')
  .description('Execute a migration')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .requiredOption('--migration <file>', 'Migration file (JSON)')
  .option('--dry-run', 'Dry run (don\'t execute, just validate)', false)
  .option('--direction <dir>', 'Direction (up or down)', 'up')
  .action(async (options) => {
    try {
      logger.info('Executing migration', {
        migration: options.migration,
        dryRun: options.dryRun,
        direction: options.direction
      });

      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const migration = JSON.parse(fs.readFileSync(options.migration, 'utf-8'));
      const executor = new MigrationExecutor(connector);

      const result = await executor.executeMigration(
        migration,
        options.direction as 'up' | 'down',
        options.dryRun
      );

      await connector.disconnect();

      logger.info('Migration execution result', {
        success: result.success,
        executed: result.executedOperations,
        duration: result.duration
      });

      if (!result.success) {
        logger.error('Migration failed', { error: result.error });
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to execute migration', { error });
      process.exit(1);
    }
  });

migrationCmd
  .command('drift')
  .description('Detect schema drift')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .option('--output <file>', 'Output file for drift report (JSON)')
  .action(async (options) => {
    try {
      logger.info('Detecting schema drift');

      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const versionManager = new SchemaVersionManager(connector);
      const currentVersion = await versionManager.getCurrentVersion();

      if (!currentVersion) {
        logger.warn('No version found - migration system may not be initialized');
        await connector.disconnect();
        return;
      }

      const currentSchema = await connector.readSchema();
      const driftDetector = new DriftDetector(connector);

      const drift = await driftDetector.detectDrift(currentSchema, currentVersion.version);

      await connector.disconnect();

      if (options.output) {
        const report = driftDetector.generateDriftReport(drift);
        fs.writeFileSync(options.output, report);
        logger.info('Drift report written to file', { file: options.output });
      }

      if (drift.hasDrift) {
        logger.warn('Schema drift detected!', {
          changes: drift.changes.length
        });
        console.log('\nDrift Changes:');
        drift.changes.forEach((change, i) => {
          console.log(`${i + 1}. ${change.type}: ${change.description}`);
        });
      } else {
        logger.info('No schema drift detected');
      }
    } catch (error) {
      logger.error('Failed to detect drift', { error });
      process.exit(1);
    }
  });

/**
 * Monitoring Commands
 */
const monitorCmd = program.command('monitor').description('Monitoring and observability');

monitorCmd
  .command('health')
  .description('Check system health')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .option('--probe <probe>', 'Probe type (liveness, readiness, startup, full)', 'full')
  .action(async (options) => {
    try {
      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const observability = new ObservabilityManager(connector, {
        enableHealthChecks: true
      });

      await observability.initialize();

      const healthCheck = observability.getHealthCheck();
      if (!healthCheck) {
        logger.error('Health check not available');
        process.exit(1);
      }

      let health;
      switch (options.probe) {
        case 'liveness':
          health = await healthCheck.liveness();
          break;
        case 'readiness':
          health = await healthCheck.readiness();
          break;
        case 'startup':
          health = await healthCheck.startup();
          break;
        default:
          health = await healthCheck.health();
      }

      await observability.shutdown();
      await connector.disconnect();

      console.log(JSON.stringify(health, null, 2));

      if (health.status !== 'healthy') {
        process.exit(1);
      }
    } catch (error) {
      logger.error('Health check failed', { error });
      process.exit(1);
    }
  });

monitorCmd
  .command('metrics')
  .description('Get current metrics')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .option('--format <format>', 'Output format (json or prometheus)', 'json')
  .action(async (options) => {
    try {
      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const observability = new ObservabilityManager(connector, {
        enableMetrics: true
      });

      await observability.initialize();

      if (options.format === 'prometheus') {
        const metrics = observability.exportPrometheusMetrics();
        console.log(metrics);
      } else {
        const metricsCollector = observability.getMetricsCollector();
        if (metricsCollector) {
          const metrics = {
            queries: metricsCollector.getMetrics(),
            pool: metricsCollector.getPoolMetrics(),
            transactions: metricsCollector.getTransactionMetrics()
          };
          console.log(JSON.stringify(metrics, null, 2));
        }
      }

      await observability.shutdown();
      await connector.disconnect();
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      process.exit(1);
    }
  });

monitorCmd
  .command('dashboard')
  .description('Get observability dashboard')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .action(async (options) => {
    try {
      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const observability = new ObservabilityManager(connector);
      await observability.initialize();

      const dashboard = await observability.getDashboard();

      await observability.shutdown();
      await connector.disconnect();

      console.log(JSON.stringify(dashboard, null, 2));
    } catch (error) {
      logger.error('Failed to get dashboard', { error });
      process.exit(1);
    }
  });

/**
 * Audit Commands
 */
const auditCmd = program.command('audit').description('Audit logging and compliance');

auditCmd
  .command('logs')
  .description('Query audit logs')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .option('--event-type <type>', 'Filter by event type')
  .option('--user-id <id>', 'Filter by user ID')
  .option('--start <date>', 'Start date (ISO 8601)')
  .option('--end <date>', 'End date (ISO 8601)')
  .option('--limit <n>', 'Limit results', '100')
  .action(async (options) => {
    try {
      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const observability = new ObservabilityManager(connector, {
        enableAuditLogging: true
      });

      await observability.initialize();

      const auditLogger = observability.getAuditLogger();
      if (!auditLogger) {
        logger.error('Audit logger not available');
        process.exit(1);
      }

      const logs = await auditLogger.getAuditLogs({
        event_type: options.eventType,
        user_id: options.userId,
        startDate: options.start ? new Date(options.start) : undefined,
        endDate: options.end ? new Date(options.end) : undefined,
        limit: parseInt(options.limit)
      });

      await observability.shutdown();
      await connector.disconnect();

      console.log(JSON.stringify(logs, null, 2));
    } catch (error) {
      logger.error('Failed to query audit logs', { error });
      process.exit(1);
    }
  });

auditCmd
  .command('report')
  .description('Generate compliance report')
  .requiredOption('--type <type>', 'Database type (mssql or mysql)')
  .requiredOption('--host <host>', 'Database host')
  .requiredOption('--port <port>', 'Database port')
  .requiredOption('--database <database>', 'Database name')
  .requiredOption('--user <user>', 'Database user')
  .requiredOption('--password <password>', 'Database password')
  .requiredOption('--start <date>', 'Start date (ISO 8601)')
  .requiredOption('--end <date>', 'End date (ISO 8601)')
  .option('--output <file>', 'Output file (JSON)')
  .action(async (options) => {
    try {
      const dbType = options.type.toLowerCase() === 'mssql'
        ? DatabaseType.MSSQL
        : DatabaseType.MySQL;

      const connector = await createAndConnectConnector(dbType, {
        host: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password
      });

      const observability = new ObservabilityManager(connector, {
        enableAuditLogging: true
      });

      await observability.initialize();

      const report = await observability.generateComplianceReport(
        new Date(options.start),
        new Date(options.end)
      );

      await observability.shutdown();
      await connector.disconnect();

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
        logger.info('Report written to file', { file: options.output });
      } else {
        console.log(JSON.stringify(report, null, 2));
      }
    } catch (error) {
      logger.error('Failed to generate report', { error });
      process.exit(1);
    }
  });

/**
 * Data Sync Commands
 */
const syncCmd = program.command('sync').description('Data synchronization operations');

syncCmd
  .command('init')
  .description('Create sync configuration file')
  .requiredOption('--name <name>', 'Sync job name')
  .requiredOption('--source-type <type>', 'Source database type (mssql, mysql, postgresql)')
  .requiredOption('--source-host <host>', 'Source database host')
  .requiredOption('--source-port <port>', 'Source database port')
  .requiredOption('--source-database <database>', 'Source database name')
  .requiredOption('--source-user <user>', 'Source database user')
  .requiredOption('--source-password <password>', 'Source database password')
  .requiredOption('--target-type <type>', 'Target database type (mssql, mysql, postgresql)')
  .requiredOption('--target-host <host>', 'Target database host')
  .requiredOption('--target-port <port>', 'Target database port')
  .requiredOption('--target-database <database>', 'Target database name')
  .requiredOption('--target-user <user>', 'Target database user')
  .requiredOption('--target-password <password>', 'Target database password')
  .option('--direction <direction>', 'Sync direction (source_to_target, bidirectional)', 'source_to_target')
  .option('--mode <mode>', 'Sync mode (once, continuous, initial_clone)', 'once')
  .option('--conflict-strategy <strategy>', 'Conflict resolution (source_wins, latest_wins)', 'source_wins')
  .option('--tables <tables>', 'Comma-separated list of tables to sync')
  .option('--output <file>', 'Output config file', 'sync-config.json')
  .action(async (options) => {
    try {
      logger.info('Creating sync configuration', { name: options.name });

      // Map database types
      const mapDbType = (type: string): DatabaseType => {
        const typeLower = type.toLowerCase();
        if (typeLower === 'mssql') return DatabaseType.MSSQL;
        if (typeLower === 'mysql') return DatabaseType.MySQL;
        if (typeLower === 'postgresql') return DatabaseType.PostgreSQL;
        throw new Error(`Unsupported database type: ${type}`);
      };

      // Parse tables
      const tables = options.tables
        ? options.tables.split(',').map((t: string) => ({
            sourceTable: t.trim(),
            enabled: true
          }))
        : [];

      const config: SyncConfig = {
        id: `sync-${Date.now()}`,
        name: options.name,
        source: {
          type: mapDbType(options.sourceType),
          host: options.sourceHost,
          port: parseInt(options.sourcePort),
          database: options.sourceDatabase,
          user: options.sourceUser,
          password: options.sourcePassword
        },
        target: {
          type: mapDbType(options.targetType),
          host: options.targetHost,
          port: parseInt(options.targetPort),
          database: options.targetDatabase,
          user: options.targetUser,
          password: options.targetPassword
        },
        direction: options.direction as SyncDirection,
        mode: options.mode as SyncMode,
        conflictStrategy: options.conflictStrategy as ConflictStrategy,
        tables,
        defaultBatchSize: 1000,
        syncIntervalMs: 60000,
        enableDetailedLogging: true
      };

      fs.writeFileSync(options.output, JSON.stringify(config, null, 2));
      logger.info('Sync configuration created', { file: options.output });

      console.log('\nNext steps:');
      console.log('1. Edit the config file to customize table mappings and sync settings');
      console.log('2. Run: db-connector sync once --config ' + options.output);
    } catch (error) {
      logger.error('Failed to create sync configuration', { error });
      process.exit(1);
    }
  });

syncCmd
  .command('once')
  .description('Run one-time data synchronization')
  .requiredOption('--config <file>', 'Sync configuration file (JSON)')
  .option('--dry-run', 'Run without making changes', false)
  .action(async (options) => {
    try {
      logger.info('Starting one-time sync', { config: options.config });

      const config: SyncConfig = JSON.parse(
        fs.readFileSync(options.config, 'utf-8')
      );

      if (options.dryRun) {
        config.dryRun = true;
        logger.info('DRY RUN MODE - No changes will be made');
      }

      const syncManager = new DataSyncManager();
      await syncManager.initialize(config);

      const result = await syncManager.sync();

      await syncManager.disconnect();

      console.log('\nSync Results:');
      console.log('═══════════════════════════════════════');
      console.log(`Duration: ${result.durationMs}ms`);
      console.log(`Tables Synced: ${result.summary.successfulTables}/${result.summary.totalTables}`);
      console.log(`Inserted: ${result.summary.totalInserted}`);
      console.log(`Updated: ${result.summary.totalUpdated}`);
      console.log(`Deleted: ${result.summary.totalDeleted}`);
      console.log(`Conflicts: ${result.summary.totalConflicts}`);
      console.log(`Errors: ${result.summary.totalErrors}`);
      console.log('\nTable Results:');
      result.tableResults.forEach(tr => {
        const status = tr.success ? '✓' : '✗';
        console.log(
          `  ${status} ${tr.tableName}: ` +
          `+${tr.inserted} ~${tr.updated} -${tr.deleted} ` +
          `(${tr.durationMs}ms)`
        );
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      logger.error('Sync failed', { error });
      process.exit(1);
    }
  });

syncCmd
  .command('start')
  .description('Start continuous data synchronization')
  .requiredOption('--config <file>', 'Sync configuration file (JSON)')
  .option('--interval <ms>', 'Sync interval in milliseconds', '60000')
  .action(async (options) => {
    try {
      logger.info('Starting continuous sync', {
        config: options.config,
        interval: options.interval
      });

      const config: SyncConfig = JSON.parse(
        fs.readFileSync(options.config, 'utf-8')
      );

      config.mode = SyncMode.Continuous;
      config.syncIntervalMs = parseInt(options.interval);

      const syncManager = new DataSyncManager();
      await syncManager.initialize(config);

      // Listen for events
      syncManager.on('sync-event', (event: any) => {
        logger.info('Sync event', {
          type: event.type,
          timestamp: event.timestamp
        });
      });

      await syncManager.startContinuousSync();

      console.log('\nContinuous sync started');
      console.log('Press Ctrl+C to stop...');

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nStopping sync...');
        syncManager.stopContinuousSync();
        await syncManager.disconnect();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\nStopping sync...');
        syncManager.stopContinuousSync();
        await syncManager.disconnect();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    } catch (error) {
      logger.error('Failed to start continuous sync', { error });
      process.exit(1);
    }
  });

syncCmd
  .command('status')
  .description('Get sync job status')
  .requiredOption('--config <file>', 'Sync configuration file (JSON)')
  .action(async (options) => {
    try {
      const config: SyncConfig = JSON.parse(
        fs.readFileSync(options.config, 'utf-8')
      );

      const syncManager = new DataSyncManager();
      await syncManager.initialize(config);

      const status = syncManager.getStatus();

      await syncManager.disconnect();

      console.log('\nSync Status:');
      console.log('═══════════════════════════════════════');
      console.log(`Sync ID: ${status.syncId}`);
      console.log(`Status: ${status.status}`);
      console.log(`Progress: ${status.progress}%`);
      if (status.currentTable) {
        console.log(`Current Table: ${status.currentTable}`);
      }
      if (status.lastSyncTime) {
        console.log(`Last Sync: ${status.lastSyncTime.toISOString()}`);
      }
      if (status.nextSyncTime) {
        console.log(`Next Sync: ${status.nextSyncTime.toISOString()}`);
      }
      if (status.errorMessage) {
        console.log(`Error: ${status.errorMessage}`);
      }

      if (status.lastResult) {
        console.log('\nLast Sync Results:');
        console.log(`  Tables: ${status.lastResult.summary.successfulTables}/${status.lastResult.summary.totalTables}`);
        console.log(`  Inserted: ${status.lastResult.summary.totalInserted}`);
        console.log(`  Updated: ${status.lastResult.summary.totalUpdated}`);
        console.log(`  Deleted: ${status.lastResult.summary.totalDeleted}`);
      }
    } catch (error) {
      logger.error('Failed to get status', { error });
      process.exit(1);
    }
  });

syncCmd
  .command('validate')
  .description('Validate sync configuration')
  .requiredOption('--config <file>', 'Sync configuration file (JSON)')
  .action(async (options) => {
    try {
      const config: SyncConfig = JSON.parse(
        fs.readFileSync(options.config, 'utf-8')
      );

      console.log('\nValidating sync configuration...');

      // Validate basic configuration
      const errors: string[] = [];

      if (!config.name) errors.push('Missing sync name');
      if (!config.source) errors.push('Missing source configuration');
      if (!config.target) errors.push('Missing target configuration');
      if (!config.tables || config.tables.length === 0) {
        errors.push('No tables configured for sync');
      }

      if (errors.length > 0) {
        console.log('\n✗ Configuration validation failed:');
        errors.forEach(err => console.log(`  - ${err}`));
        process.exit(1);
      }

      // Test connections
      console.log('  Testing source connection...');
      const syncManager = new DataSyncManager();
      await syncManager.initialize(config);
      await syncManager.disconnect();

      console.log('  ✓ Source connection successful');
      console.log('  ✓ Target connection successful');
      console.log('\n✓ Configuration is valid');
    } catch (error) {
      console.log('\n✗ Configuration validation failed');
      logger.error('Validation failed', { error });
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
