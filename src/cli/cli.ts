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

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
