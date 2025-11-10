/**
 * Migration API routes
 */

import { Router, Response } from 'express';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { DatabaseType } from '../../schema/types';
import { SchemaVersionManager } from '../../migration/schema-version-manager';
import { MigrationGenerator } from '../../migration/migration-generator';
import { MigrationExecutor } from '../../migration/migration-executor';
import { DriftDetector } from '../../migration/drift-detector';
import { asyncHandler, createAPIError } from '../middleware/error-handler';
import { AuthenticatedRequest } from '../middleware/auth';
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('MigrationRoutes');

/**
 * Initialize migration system
 * POST /api/migration/init
 */
router.post('/init', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Initializing migration system', {
    type,
    database,
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
    const versionManager = new SchemaVersionManager(connector);
    await versionManager.initialize();

    res.json({
      success: true,
      message: 'Migration system initialized'
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Generate migration
 * POST /api/migration/generate
 */
router.post('/generate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { oldSchema, newSchema, version, description } = req.body;

  if (!oldSchema || !newSchema || !version) {
    throw createAPIError('oldSchema, newSchema, and version are required', 400);
  }

  logger.info('Generating migration', {
    version,
    userId: req.user?.id
  });

  const generator = new MigrationGenerator();
  const migration = generator.generateMigration(
    oldSchema,
    newSchema,
    version,
    description || 'Auto-generated migration'
  );

  res.json({
    success: true,
    migration,
    operations: migration.operations.length
  });
}));

/**
 * Execute migration
 * POST /api/migration/execute
 */
router.post('/execute', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, migration, direction, dryRun } = req.body;

  if (!type || !host || !port || !database || !user || !password || !migration) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Executing migration', {
    version: migration.version,
    direction: direction || 'up',
    dryRun: dryRun || false,
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
    const executor = new MigrationExecutor(connector);
    const result = await executor.executeMigration(
      migration,
      direction || 'up',
      dryRun || false
    );

    res.json({
      success: result.success,
      result,
      message: result.success ? 'Migration executed successfully' : 'Migration failed'
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get current version
 * POST /api/migration/version
 */
router.post('/version', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
    const versionManager = new SchemaVersionManager(connector);
    const currentVersion = await versionManager.getCurrentVersion();

    if (!currentVersion) {
      res.json({
        success: true,
        version: null,
        message: 'No version found - migration system may not be initialized'
      });
    } else {
      res.json({
        success: true,
        version: currentVersion
      });
    }
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Detect drift
 * POST /api/migration/drift
 */
router.post('/drift', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Detecting drift', {
    type,
    database,
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
    const versionManager = new SchemaVersionManager(connector);
    const currentVersion = await versionManager.getCurrentVersion();

    if (!currentVersion) {
      throw createAPIError('No version found - migration system may not be initialized', 400);
    }

    const currentSchema = await connector.readSchema();
    const driftDetector = new DriftDetector(connector);
    const drift = await driftDetector.detectDrift(currentSchema, currentVersion.version);

    res.json({
      success: true,
      drift,
      hasDrift: drift.hasDrift,
      changes: drift.changes.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Create migration plan
 * POST /api/migration/plan
 */
router.post('/plan', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, migrations } = req.body;

  if (!type || !host || !port || !database || !user || !password || !migrations) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Creating migration plan', {
    migrations: migrations.length,
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
    const executor = new MigrationExecutor(connector);
    const plan = await executor.createMigrationPlan(migrations);

    res.json({
      success: true,
      plan
    });
  } finally {
    await connector.disconnect();
  }
}));

export default router;
