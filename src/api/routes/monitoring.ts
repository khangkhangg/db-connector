/**
 * Monitoring API routes
 */

import { Router, Response } from 'express';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { DatabaseType } from '../../schema/types';
import { ObservabilityManager } from '../../observability/observability-manager';
import { asyncHandler, createAPIError } from '../middleware/error-handler';
import { AuthenticatedRequest } from '../middleware/auth';
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('MonitoringRoutes');

/**
 * Health check
 * GET /api/monitoring/health
 */
router.get('/health', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, probe } = req.query;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required query parameters', 400);
  }

  const dbType = (type as string).toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  const connector = await createAndConnectConnector(dbType, {
    host: host as string,
    port: parseInt(port as string),
    database: database as string,
    user: user as string,
    password: password as string
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableHealthChecks: true
    });

    await observability.initialize();

    const healthCheck = observability.getHealthCheck();
    if (!healthCheck) {
      throw createAPIError('Health check not available', 500);
    }

    let health;
    switch (probe) {
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

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get metrics
 * GET /api/monitoring/metrics
 */
router.get('/metrics', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, format } = req.query;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required query parameters', 400);
  }

  const dbType = (type as string).toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  const connector = await createAndConnectConnector(dbType, {
    host: host as string,
    port: parseInt(port as string),
    database: database as string,
    user: user as string,
    password: password as string
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableMetrics: true
    });

    await observability.initialize();

    if (format === 'prometheus') {
      const metrics = observability.exportPrometheusMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } else {
      const metricsCollector = observability.getMetricsCollector();
      if (!metricsCollector) {
        throw createAPIError('Metrics collector not available', 500);
      }

      const metrics = {
        queries: metricsCollector.getMetrics(),
        pool: metricsCollector.getPoolMetrics(),
        transactions: metricsCollector.getTransactionMetrics()
      };

      res.json({
        success: true,
        metrics
      });
    }

    await observability.shutdown();
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get dashboard
 * POST /api/monitoring/dashboard
 */
router.post('/dashboard', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Getting dashboard', {
    userId: req.user?.id
  });

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector);
    await observability.initialize();

    const dashboard = await observability.getDashboard();

    await observability.shutdown();

    res.json({
      success: true,
      dashboard
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get SLO status
 * GET /api/monitoring/slo/:sloName
 */
router.get('/slo/:sloName', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sloName } = req.params;
  const { type, host, port, database, user, password } = req.query;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required query parameters', 400);
  }

  const dbType = (type as string).toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  const connector = await createAndConnectConnector(dbType, {
    host: host as string,
    port: parseInt(port as string),
    database: database as string,
    user: user as string,
    password: password as string
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableSLOTracking: true
    });

    await observability.initialize();

    const sloTracker = observability.getSLOTracker();
    if (!sloTracker) {
      throw createAPIError('SLO tracker not available', 500);
    }

    const status = sloTracker.getSLOStatus(sloName);

    if (!status) {
      throw createAPIError(`SLO not found: ${sloName}`, 404);
    }

    await observability.shutdown();

    res.json({
      success: true,
      slo: status
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get active alerts
 * POST /api/monitoring/alerts
 */
router.post('/alerts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAlerts: true
    });

    await observability.initialize();

    const alertManager = observability.getAlertManager();
    if (!alertManager) {
      throw createAPIError('Alert manager not available', 500);
    }

    const activeAlerts = alertManager.getActiveAlerts();
    const unacknowledged = alertManager.getUnacknowledgedAlerts();

    await observability.shutdown();

    res.json({
      success: true,
      alerts: {
        active: activeAlerts,
        unacknowledged,
        total: activeAlerts.length,
        unacknowledgedCount: unacknowledged.length
      }
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Acknowledge alert
 * POST /api/monitoring/alerts/:alertId/acknowledge
 */
router.post('/alerts/:alertId/acknowledge', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { alertId } = req.params;
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAlerts: true
    });

    await observability.initialize();

    const alertManager = observability.getAlertManager();
    if (!alertManager) {
      throw createAPIError('Alert manager not available', 500);
    }

    await alertManager.acknowledgeAlert(alertId, req.user?.id || 'unknown');

    await observability.shutdown();

    res.json({
      success: true,
      message: 'Alert acknowledged'
    });
  } finally {
    await connector.disconnect();
  }
}));

export default router;
