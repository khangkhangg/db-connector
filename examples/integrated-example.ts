/**
 * Complete integration example using all components
 */

import {
  IntegratedConnector,
  DatabaseType,
  WebhookEventType,
  generateToken
} from '../src';
import logger from '../src/utils/logger';

async function main() {
  logger.info('Integrated Connector Example');
  logger.info('='.repeat(50));

  // 1. Initialize integrated connector
  logger.info('\n--- Step 1: Initialize Integrated Connector ---');

  const connector = new IntegratedConnector({
    database: {
      type: DatabaseType.MySQL,
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      database: process.env.MYSQL_DATABASE || 'testdb',
      user: process.env.MYSQL_USER || 'testuser',
      password: process.env.MYSQL_PASSWORD || 'testpassword'
    },
    observability: {
      enableAuditLogging: true,
      enableMetrics: true,
      enableSLOTracking: true,
      enableAlerts: true,
      enableHealthChecks: true
    },
    webhooks: {
      enabled: true
    }
  });

  await connector.initialize();
  logger.info('✓ Connector initialized');

  try {
    // 2. Setup webhooks
    logger.info('\n--- Step 2: Setup Webhooks ---');

    const webhookManager = connector.getWebhookManager();
    if (webhookManager) {
      webhookManager.registerWebhook({
        id: 'console-webhook',
        url: 'http://localhost:4000/webhook', // Example webhook endpoint
        events: [
          WebhookEventType.MIGRATION_STARTED,
          WebhookEventType.MIGRATION_COMPLETED,
          WebhookEventType.DRIFT_DETECTED,
          WebhookEventType.ALERT_TRIGGERED
        ],
        enabled: true,
        retryAttempts: 3
      });

      // Listen to delivery events
      webhookManager.on('delivery', ({ event, results }) => {
        logger.info('Webhook delivery results:', {
          event,
          delivered: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        });
      });

      logger.info('✓ Webhooks configured');
    }

    // 3. Read current schema
    logger.info('\n--- Step 3: Read Current Schema ---');

    const currentSchema = await connector.readSchema();
    logger.info('✓ Schema read:', {
      database: currentSchema.databaseName,
      tables: currentSchema.tables.length,
      views: currentSchema.views?.length || 0
    });

    // 4. Check health
    logger.info('\n--- Step 4: Health Check ---');

    const health = await connector.getHealth();
    logger.info('✓ Health status:', health.status);

    // 5. Get observability dashboard
    logger.info('\n--- Step 5: Get Dashboard ---');

    const dashboard = await connector.getDashboard();
    logger.info('✓ Dashboard retrieved:', {
      status: dashboard.status,
      activeAlerts: dashboard.alerts?.active?.length || 0
    });

    // 6. Use CRUD service
    logger.info('\n--- Step 6: CRUD Operations ---');

    const crudService = connector.getCRUDService();

    // Example: Find all records (if table exists)
    try {
      const users = await crudService.findAll('users', {
        limit: 10
      });
      logger.info('✓ CRUD query executed:', {
        table: 'users',
        records: users.length
      });
    } catch (error) {
      logger.warn('CRUD example skipped (table may not exist)');
    }

    // 7. Use transaction manager
    logger.info('\n--- Step 7: Transaction Example ---');

    const transactionManager = connector.getTransactionManager();

    await transactionManager.executeInTransaction(async (context) => {
      // Example operations in transaction
      logger.info('✓ Transaction executed successfully');
      return { success: true };
    });

    // 8. Get migration manager and check version
    logger.info('\n--- Step 8: Migration Management ---');

    const migrationManager = connector.getMigrationManager();

    // Initialize if not already done
    try {
      await migrationManager.initialize();
      logger.info('✓ Migration system initialized');
    } catch (error) {
      logger.info('Migration system already initialized');
    }

    // Get current version
    const currentVersion = await migrationManager.getCurrentVersion();
    if (currentVersion) {
      logger.info('✓ Current version:', currentVersion.version);
    } else {
      logger.info('No version found (new installation)');
    }

    // 9. Check for drift
    logger.info('\n--- Step 9: Drift Detection ---');

    if (currentVersion) {
      const drift = await migrationManager.detectDrift();

      if (drift.hasDrift) {
        logger.warn('Schema drift detected!', {
          changes: drift.changes.length
        });

        // Webhook would be triggered automatically
      } else {
        logger.info('✓ No drift detected');
      }
    }

    // 10. Observability examples
    logger.info('\n--- Step 10: Observability Features ---');

    const observability = connector.getObservabilityManager();

    // Get metrics
    const metricsCollector = observability.getMetricsCollector();
    if (metricsCollector) {
      const metrics = metricsCollector.getMetrics();
      logger.info('✓ Metrics:', {
        totalQueries: metrics.totalQueries,
        avgLatency: metrics.averageLatency.toFixed(2) + 'ms'
      });
    }

    // Get SLO status
    const sloTracker = observability.getSLOTracker();
    if (sloTracker) {
      const availabilitySLO = sloTracker.getSLOStatus('availability');
      if (availabilitySLO) {
        logger.info('✓ SLO Status (Availability):', {
          target: availabilitySLO.slo.target,
          current: availabilitySLO.current,
          status: availabilitySLO.status
        });
      }
    }

    // Get active alerts
    const alertManager = observability.getAlertManager();
    if (alertManager) {
      const activeAlerts = alertManager.getActiveAlerts();
      logger.info('✓ Active Alerts:', activeAlerts.length);

      if (activeAlerts.length > 0) {
        activeAlerts.forEach(alert => {
          logger.warn('Alert:', {
            severity: alert.severity,
            message: alert.message
          });
        });
      }
    }

    // 11. Generate JWT token for API access
    logger.info('\n--- Step 11: Generate API Token ---');

    const apiToken = generateToken('user123', 'demo-user', 'admin');
    logger.info('✓ API Token generated (valid for 24h)');
    logger.info('  Token:', apiToken.substring(0, 50) + '...');

    // 12. Webhook statistics
    logger.info('\n--- Step 12: Webhook Statistics ---');

    if (webhookManager) {
      const stats = webhookManager.getStatistics();
      logger.info('✓ Webhook Stats:', {
        totalWebhooks: stats.totalWebhooks,
        enabledWebhooks: stats.enabledWebhooks,
        totalDeliveries: stats.totalDeliveries,
        successRate: stats.successRate.toFixed(2) + '%'
      });
    }

    // 13. Example: Execute a custom query with observability
    logger.info('\n--- Step 13: Custom Query with Observability ---');

    try {
      await connector.executeQuery(
        'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?',
        [process.env.MYSQL_DATABASE || 'testdb'],
        { userId: 'user123' }
      );
      logger.info('✓ Custom query executed with observability tracking');
    } catch (error) {
      logger.warn('Custom query failed:', error);
    }

    // 14. Get profiler stats
    logger.info('\n--- Step 14: Performance Profiling ---');

    const profiler = observability.getProfiler();
    if (profiler) {
      const slowOps = profiler.getSlowOperations(5);
      logger.info('✓ Slow Operations:', slowOps.length);

      const memoryUsage = profiler.getMemoryUsage();
      logger.info('✓ Memory Usage:', {
        heapUsed: memoryUsage.heapUsed + ' MB',
        heapTotal: memoryUsage.heapTotal + ' MB'
      });
    }

    logger.info('\n✓ All integration examples completed successfully!\n');

    // Summary
    logger.info('='.repeat(50));
    logger.info('Summary:');
    logger.info('- Integrated connector initialized with all components');
    logger.info('- Webhooks configured for real-time notifications');
    logger.info('- Schema operations completed');
    logger.info('- Health and metrics monitored');
    logger.info('- CRUD and transaction support available');
    logger.info('- Migration system ready');
    logger.info('- Comprehensive observability enabled');
    logger.info('- API authentication token generated');
    logger.info('='.repeat(50));

  } catch (error) {
    logger.error('Example error:', error);
  } finally {
    // Cleanup
    await connector.shutdown();
    logger.info('\nConnector shut down gracefully');
  }
}

// Run example
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
