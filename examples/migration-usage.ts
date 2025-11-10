/**
 * Migration and versioning usage examples
 */

import { createAndConnectConnector } from '../src/connectors/connector-factory';
import { DatabaseType } from '../src/schema/types';
import { MigrationManager } from '../src/migration/migration-manager';
import { DBSchemaMapper } from '../src';
import logger from '../src/utils/logger';

async function main() {
  logger.info('Migration System Examples');
  logger.info('='.repeat(50));

  // Connect to database
  const connector = await createAndConnectConnector(DatabaseType.MySQL, {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    database: process.env.MYSQL_DATABASE || 'testdb',
    user: process.env.MYSQL_USER || 'testuser',
    password: process.env.MYSQL_PASSWORD || 'testpassword'
  });

  // Initialize migration manager with alerts
  const migrationManager = new MigrationManager(connector, {
    enableDriftMonitoring: true,
    driftCheckIntervalMs: 60000, // Check every minute
    autoFixDrift: false,
    alertConfig: {
      enabled: true,
      channels: [
        {
          type: 'log',
          enabled: true,
          config: {}
        },
        {
          type: 'slack',
          enabled: false, // Enable in production with webhook URL
          config: {
            webhookUrl: process.env.SLACK_WEBHOOK_URL
          }
        }
      ],
      severityThreshold: 'medium',
      notifyOnDrift: true,
      notifyOnMigration: true,
      notifyOnFailure: true
    }
  });

  try {
    // Example 1: Initialize migration system
    logger.info('\n--- Example 1: Initialize Migration System ---');
    await migrationManager.initialize();
    logger.info('✓ Migration system initialized');

    // Example 2: Check current version
    logger.info('\n--- Example 2: Check Current Version ---');
    const currentVersion = await migrationManager.getCurrentVersion();
    if (currentVersion) {
      logger.info('Current version:', currentVersion);
    } else {
      logger.info('No migrations applied yet');
    }

    // Example 3: Read current and old schemas
    logger.info('\n--- Example 3: Create Migration from Schema Changes ---');
    const schemaMapper = new DBSchemaMapper();

    const oldSchema = await schemaMapper.readLocalSchema(DatabaseType.MySQL, {
      includeSystemTables: false
    });
    logger.info(`Old schema loaded: ${oldSchema.tables.length} tables`);

    // For demo, use same schema (in practice, this would be a changed schema)
    const newSchema = oldSchema;

    // Generate migration
    const migration = await migrationManager.createMigration(
      oldSchema,
      newSchema,
      'Initial schema setup'
    );
    logger.info('✓ Migration generated', {
      version: migration.version,
      operations: migration.operations.up.length
    });

    // Example 4: Dry run migration
    logger.info('\n--- Example 4: Dry Run Migration ---');
    logger.info('Performing dry run...');
    await migrationManager.executeMigration(migration, true);
    logger.info('✓ Dry run completed successfully');

    // Example 5: Execute migration (commented out for safety)
    logger.info('\n--- Example 5: Execute Migration ---');
    logger.info('(Skipped in example - uncomment to actually execute)');
    // await migrationManager.executeMigration(migration, false);

    // Example 6: Detect drift
    logger.info('\n--- Example 6: Detect Schema Drift ---');
    const driftResult = await migrationManager.detectDrift(oldSchema);

    if (driftResult.hasDrift) {
      logger.warn('Drift detected!', {
        changes: driftResult.changes.length,
        severity: driftResult.severity
      });

      const report = migrationManager.generateDriftReport(driftResult);
      logger.info('\n' + report);
    } else {
      logger.info('✓ No drift detected');
    }

    // Example 7: Validate drift changes
    logger.info('\n--- Example 7: Validate Drift Changes ---');
    const driftDetector = migrationManager.getDriftDetector();
    const validation = driftDetector.validateChanges(driftResult.changes);

    logger.info('Validation result:', {
      valid: validation.valid,
      errors: validation.errors.length,
      warnings: validation.warnings.length
    });

    if (validation.errors.length > 0) {
      logger.error('Validation errors:');
      validation.errors.forEach(err => logger.error(`  - ${err}`));
    }

    if (validation.warnings.length > 0) {
      logger.warn('Validation warnings:');
      validation.warnings.forEach(warn => logger.warn(`  - ${warn}`));
    }

    // Example 8: Get version history
    logger.info('\n--- Example 8: Get Version History ---');
    const versionHistory = await migrationManager.getVersionHistory(10);
    logger.info(`Found ${versionHistory.length} versions in history`);

    versionHistory.forEach(version => {
      logger.info(`  v${version.version} - ${version.description} (${version.applied_at.toISOString()})`);
    });

    // Example 9: Get migration history
    logger.info('\n--- Example 9: Get Migration History ---');
    const migrationHistory = await migrationManager.getMigrationHistory(10);
    logger.info(`Found ${migrationHistory.length} migrations in history`);

    migrationHistory.forEach(record => {
      logger.info(`  ${record.name} - ${record.status} (${record.execution_time_ms}ms)`);
    });

    // Example 10: Start continuous drift monitoring
    logger.info('\n--- Example 10: Start Drift Monitoring ---');
    logger.info('Starting continuous drift monitoring...');
    logger.info('(Would run in background - stopping after 5 seconds for demo)');

    migrationManager.startDriftMonitoring(async () => {
      return await schemaMapper.readLocalSchema(DatabaseType.MySQL);
    });

    // Let it run for 5 seconds then stop
    await new Promise(resolve => setTimeout(resolve, 5000));

    migrationManager.stopDriftMonitoring();
    logger.info('✓ Drift monitoring stopped');

    // Example 11: Check alert history
    logger.info('\n--- Example 11: Check Alert History ---');
    const alertManager = migrationManager.getAlertManager();
    if (alertManager) {
      const alerts = alertManager.getHistory(10);
      logger.info(`Found ${alerts.length} alerts in history`);

      const unacknowledged = alertManager.getUnacknowledged();
      if (unacknowledged.length > 0) {
        logger.warn(`${unacknowledged.length} unacknowledged alerts`);
      }
    }

    logger.info('\n✓ All examples completed successfully\n');
  } catch (error) {
    logger.error('Example error:', error);
  } finally {
    // Cleanup
    await connector.disconnect();
  }
}

// Run examples
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
