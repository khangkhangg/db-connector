/**
 * Audit API routes
 */

import { Router, Response } from 'express';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { DatabaseType } from '../../schema/types';
import { ObservabilityManager } from '../../observability/observability-manager';
import { asyncHandler, createAPIError } from '../middleware/error-handler';
import { AuthenticatedRequest, requireRole } from '../middleware/auth';
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('AuditRoutes');

/**
 * Query audit logs
 * POST /api/audit/logs
 */
router.post('/logs', requireRole('admin', 'auditor'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    type,
    host,
    port,
    database,
    user,
    password,
    event_type,
    user_id,
    startDate,
    endDate,
    limit
  } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Querying audit logs', {
    event_type,
    user_id,
    requestedBy: req.user?.id
  });

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAuditLogging: true
    });

    await observability.initialize();

    const auditLogger = observability.getAuditLogger();
    if (!auditLogger) {
      throw createAPIError('Audit logger not available', 500);
    }

    const logs = await auditLogger.getAuditLogs({
      event_type,
      user_id,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : 100
    });

    await observability.shutdown();

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Generate compliance report
 * POST /api/audit/report
 */
router.post('/report', requireRole('admin', 'auditor'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, startDate, endDate } = req.body;

  if (!type || !host || !port || !database || !user || !password || !startDate || !endDate) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Generating compliance report', {
    startDate,
    endDate,
    requestedBy: req.user?.id
  });

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAuditLogging: true
    });

    await observability.initialize();

    const report = await observability.generateComplianceReport(
      new Date(startDate),
      new Date(endDate)
    );

    await observability.shutdown();

    res.json({
      success: true,
      report
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Log audit event
 * POST /api/audit/log
 */
router.post('/log', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    type,
    host,
    port,
    database,
    user,
    password,
    event
  } = req.body;

  if (!type || !host || !port || !database || !user || !password || !event) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Logging audit event', {
    event_type: event.event_type,
    requestedBy: req.user?.id
  });

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAuditLogging: true
    });

    await observability.initialize();

    const auditLogger = observability.getAuditLogger();
    if (!auditLogger) {
      throw createAPIError('Audit logger not available', 500);
    }

    // Add user info from JWT if not provided
    if (!event.user_id && req.user) {
      event.user_id = req.user.id;
      event.username = req.user.username;
    }

    await auditLogger.logEvent(event);

    await observability.shutdown();

    res.json({
      success: true,
      message: 'Audit event logged'
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get PHI access logs
 * POST /api/audit/phi-access
 */
router.post('/phi-access', requireRole('admin', 'auditor', 'compliance'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    type,
    host,
    port,
    database,
    user,
    password,
    startDate,
    endDate,
    limit
  } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Querying PHI access logs', {
    requestedBy: req.user?.id
  });

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAuditLogging: true
    });

    await observability.initialize();

    const auditLogger = observability.getAuditLogger();
    if (!auditLogger) {
      throw createAPIError('Audit logger not available', 500);
    }

    const logs = await auditLogger.getAuditLogs({
      event_type: 'PHI_ACCESS',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : 100
    });

    await observability.shutdown();

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get failed access attempts
 * POST /api/audit/failed-access
 */
router.post('/failed-access', requireRole('admin', 'security'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    type,
    host,
    port,
    database,
    user,
    password,
    startDate,
    endDate,
    limit
  } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Querying failed access attempts', {
    requestedBy: req.user?.id
  });

  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const observability = new ObservabilityManager(connector, {
      enableAuditLogging: true
    });

    await observability.initialize();

    const auditLogger = observability.getAuditLogger();
    if (!auditLogger) {
      throw createAPIError('Audit logger not available', 500);
    }

    const logs = await auditLogger.getAuditLogs({
      result: 'failure',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : 100
    });

    await observability.shutdown();

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } finally {
    await connector.disconnect();
  }
}));

export default router;
