/**
 * Observability and monitoring usage examples
 */

import { createAndConnectConnector } from '../src/connectors/connector-factory';
import { DatabaseType } from '../src/schema/types';
import { ObservabilityManager } from '../src/observability/observability-manager';
import { PerformanceProfiler } from '../src/observability/performance-profiler';
import { DistributedTracer, SpanKind } from '../src/observability/distributed-tracing';
import logger from '../src/utils/logger';

async function main() {
  logger.info('Observability System Examples');
  logger.info('='.repeat(50));

  // Connect to database
  const connector = await createAndConnectConnector(DatabaseType.MySQL, {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    database: process.env.MYSQL_DATABASE || 'testdb',
    user: process.env.MYSQL_USER || 'testuser',
    password: process.env.MYSQL_PASSWORD || 'testpassword'
  });

  try {
    // Example 1: Initialize observability system
    logger.info('\n--- Example 1: Initialize Observability System ---');

    const observabilityManager = new ObservabilityManager(connector, {
      enableAuditLogging: true,
      enableMetrics: true,
      enableSLOTracking: true,
      enableAlerts: true,
      enableHealthChecks: true,
      enableProfiling: true,
      auditLogRetentionDays: 90,
      alertEvaluationIntervalMs: 60000
    });

    await observabilityManager.initialize();
    logger.info('✓ Observability system initialized');

    // Example 2: Record query metrics
    logger.info('\n--- Example 2: Record Query Metrics ---');

    await observabilityManager.recordQuery({
      operation: 'SELECT',
      table: 'users',
      durationMs: 45,
      success: true,
      rowsAffected: 100,
      userId: 'user123'
    });

    await observabilityManager.recordQuery({
      operation: 'UPDATE',
      table: 'users',
      durationMs: 120,
      success: true,
      rowsAffected: 1,
      userId: 'user123'
    });

    logger.info('✓ Query metrics recorded');

    // Example 3: Check health status
    logger.info('\n--- Example 3: Check Health Status ---');

    const healthCheck = observabilityManager.getHealthCheck();
    if (healthCheck) {
      const health = await healthCheck.health();
      logger.info('Health status:', health.status);
      logger.info('Health checks:', JSON.stringify(health.checks, null, 2));
    }

    // Example 4: Use performance profiler
    logger.info('\n--- Example 4: Use Performance Profiler ---');

    const profiler = observabilityManager.getProfiler();
    if (profiler) {
      // Profile a function
      const { result, profile } = await profiler.profile('test-query', async () => {
        // Simulate query
        await new Promise(resolve => setTimeout(resolve, 150));
        return { rows: 100 };
      });

      logger.info('Profile result:', {
        duration: profile.duration,
        name: profile.name,
        success: result.rows > 0
      });

      // Check for bottlenecks
      const bottlenecks = profiler.detectBottlenecks(profile.id);
      if (bottlenecks.detected) {
        logger.warn('Bottlenecks detected:', bottlenecks.bottlenecks);
      } else {
        logger.info('✓ No bottlenecks detected');
      }
    }

    // Example 5: Distributed tracing
    logger.info('\n--- Example 5: Distributed Tracing ---');

    const tracer = new DistributedTracer({ serviceName: 'db-connector' });

    // Start a trace
    const traceContext = tracer.startTrace('user-operation', SpanKind.SERVER);
    tracer.setTag(traceContext, 'user.id', 'user123');
    tracer.setTag(traceContext, 'operation', 'fetch-user-data');

    // Start child span for database query
    const dbSpan = tracer.startChildSpan('database-query', traceContext, SpanKind.CLIENT);
    tracer.setTag(dbSpan, 'db.type', 'mysql');
    tracer.setTag(dbSpan, 'db.table', 'users');

    // Simulate query
    await new Promise(resolve => setTimeout(resolve, 50));

    // End spans
    tracer.endSpan(dbSpan);
    tracer.endSpan(traceContext);

    const trace = tracer.getTrace(traceContext.traceId);
    logger.info('Trace completed:', {
      traceId: trace?.traceId,
      spans: trace?.spans.length,
      duration: trace?.duration
    });

    // Example 6: Get SLO status
    logger.info('\n--- Example 6: Get SLO Status ---');

    const sloTracker = observabilityManager.getSLOTracker();
    if (sloTracker) {
      const availabilitySLO = sloTracker.getSLOStatus('availability');
      if (availabilitySLO) {
        logger.info('Availability SLO:', {
          name: availabilitySLO.slo.name,
          target: availabilitySLO.slo.target,
          current: availabilitySLO.current,
          compliance: availabilitySLO.compliance
        });
      }

      const latencySLO = sloTracker.getSLOStatus('query_latency_p95');
      if (latencySLO) {
        logger.info('Query Latency P95 SLO:', {
          name: latencySLO.slo.name,
          target: latencySLO.slo.target,
          current: latencySLO.current,
          compliance: latencySLO.slo.compliance
        });
      }
    }

    // Example 7: Get metrics in Prometheus format
    logger.info('\n--- Example 7: Export Prometheus Metrics ---');

    const prometheusMetrics = observabilityManager.exportPrometheusMetrics();
    logger.info('Prometheus metrics (first 500 chars):');
    logger.info(prometheusMetrics.substring(0, 500) + '...');

    // Example 8: Get observability dashboard
    logger.info('\n--- Example 8: Get Observability Dashboard ---');

    const dashboard = await observabilityManager.getDashboard();
    logger.info('Dashboard summary:', {
      status: dashboard.status,
      queriesTotal: dashboard.metrics?.queries?.totalQueries,
      poolUtilization: dashboard.metrics?.pool?.currentUtilization,
      activeAlerts: dashboard.alerts?.active?.length,
      timestamp: dashboard.timestamp
    });

    // Example 9: Check alerts
    logger.info('\n--- Example 9: Check Alerts ---');

    const alertManager = observabilityManager.getAlertManager();
    if (alertManager) {
      // Evaluate thresholds
      const newAlerts = await alertManager.evaluateThresholds();
      logger.info(`Evaluated thresholds, found ${newAlerts.length} new alerts`);

      // Get active alerts
      const activeAlerts = alertManager.getActiveAlerts();
      logger.info(`Active alerts: ${activeAlerts.length}`);

      if (activeAlerts.length > 0) {
        activeAlerts.forEach(alert => {
          logger.warn(`Alert: ${alert.message}`, {
            severity: alert.severity,
            metric: alert.metric,
            currentValue: alert.currentValue,
            threshold: alert.threshold
          });
        });
      }
    }

    // Example 10: Get runbook
    logger.info('\n--- Example 10: Get Runbook for Issue ---');

    const runbookManager = observabilityManager.getRunbookManager();
    if (runbookManager) {
      // Search for runbook by symptom
      const runbooks = runbookManager.searchBySymptom('slow query');

      if (runbooks.length > 0) {
        const runbook = runbooks[0];
        logger.info(`Found runbook: ${runbook.title}`);
        logger.info(`Severity: ${runbook.severity}`);
        logger.info(`Symptoms: ${runbook.symptoms.join(', ')}`);

        // Generate formatted runbook document
        const document = runbookManager.generateRunbookDocument(runbook.id);
        logger.info('\nRunbook document (first 1000 chars):');
        logger.info(document.substring(0, 1000) + '...');
      }
    }

    // Example 11: Audit logging
    logger.info('\n--- Example 11: Audit Logging ---');

    const auditLogger = observabilityManager.getAuditLogger();
    if (auditLogger) {
      // Log an audit event
      await auditLogger.logEvent({
        event_type: 'PHI_ACCESS',
        severity: 'high',
        user_id: 'user123',
        username: 'john.doe',
        ip_address: '192.168.1.100',
        resource: 'patient_records',
        action: 'read',
        result: 'success',
        phi_accessed: true,
        details: {
          recordId: 'patient-12345',
          fields: ['name', 'dob', 'ssn']
        }
      });

      logger.info('✓ Audit event logged');

      // Get recent audit logs
      const recentLogs = await auditLogger.getAuditLogs({
        limit: 5,
        event_type: 'PHI_ACCESS'
      });

      logger.info(`Recent PHI access logs: ${recentLogs.length}`);
    }

    // Example 12: Generate compliance report
    logger.info('\n--- Example 12: Generate Compliance Report ---');

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const complianceReport = await observabilityManager.generateComplianceReport(
      startDate,
      endDate
    );

    if (complianceReport) {
      logger.info('Compliance report:', {
        period: `${complianceReport.period.start.toISOString()} to ${complianceReport.period.end.toISOString()}`,
        totalEvents: complianceReport.summary.totalEvents,
        phiAccessCount: complianceReport.summary.phiAccessCount,
        eventsByType: complianceReport.summary.byType,
        eventsBySeverity: complianceReport.summary.bySeverity
      });
    }

    // Example 13: Record connection pool state
    logger.info('\n--- Example 13: Record Connection Pool State ---');

    observabilityManager.recordPoolState({
      active: 5,
      idle: 10,
      waiting: 0,
      total: 15,
      max: 20
    });

    logger.info('✓ Pool state recorded');

    // Example 14: Record transaction
    logger.info('\n--- Example 14: Record Transaction ---');

    await observabilityManager.recordTransaction({
      status: 'committed',
      durationMs: 250,
      operationCount: 5,
      userId: 'user123'
    });

    logger.info('✓ Transaction recorded');

    // Example 15: Liveness and readiness probes
    logger.info('\n--- Example 15: Liveness and Readiness Probes ---');

    if (healthCheck) {
      const liveness = await healthCheck.liveness();
      logger.info('Liveness probe:', liveness.status);

      const readiness = await healthCheck.readiness();
      logger.info('Readiness probe:', readiness.status);

      const startup = await healthCheck.startup();
      logger.info('Startup probe:', startup.status);

      // Format for HTTP endpoint
      const httpResponse = healthCheck.formatForHTTP(readiness);
      logger.info('HTTP response:', {
        statusCode: httpResponse.statusCode,
        status: httpResponse.body.status
      });
    }

    // Example 16: Performance report
    logger.info('\n--- Example 16: Generate Performance Report ---');

    if (profiler) {
      // Add some more profiles for the report
      for (let i = 0; i < 5; i++) {
        await profiler.profile(`query-${i}`, async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
        });
      }

      const report = profiler.generateReport(20);
      logger.info('\nPerformance Report (first 1500 chars):');
      logger.info(report.substring(0, 1500) + '...');
    }

    logger.info('\n✓ All observability examples completed successfully\n');

    // Cleanup
    await observabilityManager.shutdown();

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
