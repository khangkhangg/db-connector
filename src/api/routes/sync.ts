/**
 * Data Synchronization API Routes
 */

import { Router, Request, Response } from 'express';
import { DataSyncManager } from '../../sync/data-sync-manager';
import { ChangeTracker, ChangeTrackingMethod } from '../../sync/change-tracker';
import { SyncConfig, SyncDirection, SyncMode, ConflictStrategy } from '../../sync/types';
import { BidirectionalSync, SyncTableConfig } from '../../sync/bidirectional-sync';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { DatabaseType } from '../../schema/types';
// import { authenticate } from '../middleware/auth'; // Not used in local client mode
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('SyncAPI');

// Dummy middleware for local client mode (auth disabled)
const noAuth = (_req: Request, _res: Response, next: any) => next();

// Store active sync managers (in production, use Redis or database)
const syncManagers = new Map<string, DataSyncManager>();

/**
 * POST /api/sync/configure
 * Create or update sync configuration
 */
router.post('/configure', noAuth, async (req: Request, res: Response) => {
  try {
    const config: SyncConfig = req.body;

    // Validate configuration
    if (!config.name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    if (!config.source || !config.target) {
      return res.status(400).json({
        error: 'Missing source or target database configuration'
      });
    }

    if (!config.tables || config.tables.length === 0) {
      return res.status(400).json({
        error: 'At least one table must be configured'
      });
    }

    // Generate ID if not provided
    if (!config.id) {
      config.id = `sync-${Date.now()}`;
    }

    logger.info('Sync configuration created', {
      id: config.id,
      name: config.name,
      user: req.user?.username
    });

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Failed to create sync configuration', { error });
    res.status(500).json({
      error: 'Failed to create sync configuration',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/execute
 * Execute one-time data synchronization
 */
router.post('/execute', noAuth, async (req: Request, res: Response) => {
  try {
    const config: SyncConfig = req.body;

    if (!config.id) {
      return res.status(400).json({
        error: 'Missing sync configuration ID'
      });
    }

    logger.info('Starting sync execution', {
      id: config.id,
      user: req.user?.username
    });

    const syncManager = new DataSyncManager();
    await syncManager.initialize(config);

    const result = await syncManager.sync();

    await syncManager.disconnect();

    logger.info('Sync completed', {
      id: config.id,
      success: result.success,
      summary: result.summary
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Sync execution failed', { error });
    res.status(500).json({
      error: 'Sync execution failed',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/start
 * Start continuous synchronization
 */
router.post('/start', noAuth, async (req: Request, res: Response) => {
  try {
    const config: SyncConfig = req.body;

    if (!config.id) {
      return res.status(400).json({
        error: 'Missing sync configuration ID'
      });
    }

    // Check if sync is already running
    if (syncManagers.has(config.id)) {
      return res.status(409).json({
        error: 'Sync job is already running',
        id: config.id
      });
    }

    logger.info('Starting continuous sync', {
      id: config.id,
      user: req.user?.username
    });

    const syncManager = new DataSyncManager();
    await syncManager.initialize(config);

    // Listen for events
    syncManager.on('sync-event', (event) => {
      logger.info('Sync event', {
        syncId: event.syncId,
        type: event.type
      });
    });

    await syncManager.startContinuousSync();

    // Store the manager
    syncManagers.set(config.id, syncManager);

    res.json({
      success: true,
      message: 'Continuous sync started',
      id: config.id
    });
  } catch (error) {
    logger.error('Failed to start continuous sync', { error });
    res.status(500).json({
      error: 'Failed to start continuous sync',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/:id/stop
 * Stop continuous synchronization
 */
router.post('/:id/stop', noAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const syncManager = syncManagers.get(id);
    if (!syncManager) {
      return res.status(404).json({
        error: 'Sync job not found',
        id
      });
    }

    logger.info('Stopping continuous sync', {
      id,
      user: req.user?.username
    });

    syncManager.stopContinuousSync();
    await syncManager.disconnect();

    syncManagers.delete(id);

    res.json({
      success: true,
      message: 'Continuous sync stopped',
      id
    });
  } catch (error) {
    logger.error('Failed to stop continuous sync', { error });
    res.status(500).json({
      error: 'Failed to stop continuous sync',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/:id/pause
 * Pause continuous synchronization
 */
router.post('/:id/pause', noAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const syncManager = syncManagers.get(id);
    if (!syncManager) {
      return res.status(404).json({
        error: 'Sync job not found',
        id
      });
    }

    logger.info('Pausing sync', {
      id,
      user: req.user?.username
    });

    syncManager.pause();

    res.json({
      success: true,
      message: 'Sync paused',
      id
    });
  } catch (error) {
    logger.error('Failed to pause sync', { error });
    res.status(500).json({
      error: 'Failed to pause sync',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/:id/resume
 * Resume paused synchronization
 */
router.post('/:id/resume', noAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const syncManager = syncManagers.get(id);
    if (!syncManager) {
      return res.status(404).json({
        error: 'Sync job not found',
        id
      });
    }

    logger.info('Resuming sync', {
      id,
      user: req.user?.username
    });

    await syncManager.resume();

    res.json({
      success: true,
      message: 'Sync resumed',
      id
    });
  } catch (error) {
    logger.error('Failed to resume sync', { error });
    res.status(500).json({
      error: 'Failed to resume sync',
      details: String(error)
    });
  }
});

/**
 * GET /api/sync/:id/status
 * Get sync job status
 */
router.get('/:id/status', noAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const syncManager = syncManagers.get(id);
    if (!syncManager) {
      return res.status(404).json({
        error: 'Sync job not found',
        id
      });
    }

    const status = syncManager.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Failed to get sync status', { error });
    res.status(500).json({
      error: 'Failed to get sync status',
      details: String(error)
    });
  }
});

/**
 * GET /api/sync/jobs
 * List all active sync jobs
 */
router.get('/jobs', noAuth, async (req: Request, res: Response) => {
  try {
    const jobs = Array.from(syncManagers.keys()).map(id => {
      const manager = syncManagers.get(id);
      return {
        id,
        status: manager?.getStatus()
      };
    });

    res.json({
      success: true,
      jobs,
      total: jobs.length
    });
  } catch (error) {
    logger.error('Failed to list sync jobs', { error });
    res.status(500).json({
      error: 'Failed to list sync jobs',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/validate
 * Validate sync configuration
 */
router.post('/validate', noAuth, async (req: Request, res: Response) => {
  try {
    const config: SyncConfig = req.body;

    const errors: string[] = [];

    // Validate basic configuration
    if (!config.name) errors.push('Missing sync name');
    if (!config.source) errors.push('Missing source configuration');
    if (!config.target) errors.push('Missing target configuration');
    if (!config.tables || config.tables.length === 0) {
      errors.push('No tables configured for sync');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        valid: false,
        errors
      });
    }

    // Test connections
    const syncManager = new DataSyncManager();
    await syncManager.initialize(config);
    await syncManager.disconnect();

    res.json({
      valid: true,
      message: 'Configuration is valid'
    });
  } catch (error) {
    res.status(400).json({
      valid: false,
      error: 'Configuration validation failed',
      details: String(error)
    });
  }
});

/**
 * GET /api/sync/templates
 * Get sync configuration templates
 */
router.get('/templates', noAuth, async (req: Request, res: Response) => {
  try {
    const templates = [
      {
        name: 'MSSQL to PostgreSQL',
        description: 'One-way sync from MSSQL to PostgreSQL',
        template: {
          direction: SyncDirection.SourceToTarget,
          mode: SyncMode.Continuous,
          conflictStrategy: ConflictStrategy.SourceWins,
          defaultBatchSize: 1000,
          syncIntervalMs: 60000
        }
      },
      {
        name: 'MSSQL to MySQL',
        description: 'One-way sync from MSSQL to MySQL',
        template: {
          direction: SyncDirection.SourceToTarget,
          mode: SyncMode.Continuous,
          conflictStrategy: ConflictStrategy.SourceWins,
          defaultBatchSize: 1000,
          syncIntervalMs: 60000
        }
      },
      {
        name: 'Bidirectional Sync',
        description: 'Two-way sync with conflict resolution',
        template: {
          direction: SyncDirection.Bidirectional,
          mode: SyncMode.Continuous,
          conflictStrategy: ConflictStrategy.LatestWins,
          defaultBatchSize: 500,
          syncIntervalMs: 30000
        }
      },
      {
        name: 'Initial Clone',
        description: 'One-time full data clone',
        template: {
          direction: SyncDirection.SourceToTarget,
          mode: SyncMode.InitialClone,
          defaultBatchSize: 5000,
          syncIntervalMs: 0
        }
      }
    ];

    res.json({
      success: true,
      templates
    });
  } catch (error) {
    logger.error('Failed to get templates', { error });
    res.status(500).json({
      error: 'Failed to get templates',
      details: String(error)
    });
  }
});

/**
 * POST /api/sync/bidirectional
 * Execute bi-directional sync between two databases
 */
router.post('/bidirectional', noAuth, async (req: Request, res: Response) => {
  try {
    const {
      source,
      target,
      tables,
      lastSyncTime
    } = req.body;

    // Validate request
    if (!source || !target) {
      return res.status(400).json({
        error: 'Missing source or target database configuration'
      });
    }

    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      return res.status(400).json({
        error: 'At least one table configuration is required'
      });
    }

    logger.info('Starting bidirectional sync', {
      sourceType: source.type,
      targetType: target.type,
      tableCount: tables.length
    });

    // Normalize database types
    const sourceType = normalizeDatabaseType(source.type);
    const targetType = normalizeDatabaseType(target.type);

    // Connect to source database
    const sourceConnector = await createAndConnectConnector(sourceType, {
      host: source.host,
      port: parseInt(source.port),
      database: source.database,
      user: source.user,
      password: source.password
    });

    // Connect to target database
    const targetConnector = await createAndConnectConnector(targetType, {
      host: target.host,
      port: parseInt(target.port),
      database: target.database,
      user: target.user,
      password: target.password
    });

    try {
      // Create bidirectional sync instance
      const biSync = new BidirectionalSync(
        sourceConnector,
        targetConnector,
        sourceType,
        targetType
      );

      // Parse table configurations
      const tableConfigs: SyncTableConfig[] = tables.map((t: any) => ({
        sourceTable: t.sourceTable,
        targetTable: t.targetTable,
        primaryKey: t.primaryKey || 'id',
        conflictStrategy: t.conflictStrategy || 'newest-wins',
        columnMapping: t.columnMapping,
        syncDirection: t.syncDirection || 'both'
      }));

      // Execute sync
      const syncResult = await biSync.sync(
        tableConfigs,
        lastSyncTime ? new Date(lastSyncTime) : undefined
      );

      res.json({
        success: syncResult.success,
        result: syncResult,
        timestamp: new Date().toISOString()
      });
    } finally {
      await sourceConnector.disconnect();
      await targetConnector.disconnect();
    }
  } catch (error) {
    logger.error('Bidirectional sync failed', { error });
    res.status(500).json({
      error: 'Bidirectional sync failed',
      details: String(error)
    });
  }
});

/**
 * Helper function to normalize database type
 */
function normalizeDatabaseType(type: string): DatabaseType {
  const normalizedType = type.toLowerCase();

  if (normalizedType === 'mssql') {
    return DatabaseType.MSSQL;
  } else if (normalizedType === 'mysql') {
    return DatabaseType.MySQL;
  } else if (normalizedType === 'postgresql') {
    return DatabaseType.PostgreSQL;
  }

  throw new Error(`Unsupported database type: ${type}`);
}

export default router;
