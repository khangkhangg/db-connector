/**
 * Schema API routes
 */

import { Router, Request, Response } from 'express';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { DatabaseType } from '../../schema/types';
import { SchemaMapper } from '../../schema/schema-mapper';
import { SchemaValidator } from '../../schema/schema-validator';
import { asyncHandler, createAPIError } from '../middleware/error-handler';
import { AuthenticatedRequest } from '../middleware/auth';
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('SchemaRoutes');

/**
 * Read schema from database
 * POST /api/schema/read
 */
router.post('/read', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, includeSystemTables } = req.body;

  if (!type || !host || !port || !database || !user || !password) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = type.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Reading schema', {
    type,
    host,
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
    const schema = await connector.readSchema({
      includeSystemTables: includeSystemTables || false
    });

    res.json({
      success: true,
      schema,
      metadata: {
        tables: schema.tables.length,
        views: schema.views?.length || 0,
        databaseType: schema.databaseType
      }
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Compare two schemas
 * POST /api/schema/compare
 */
router.post('/compare', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { schema1, schema2 } = req.body;

  if (!schema1 || !schema2) {
    throw createAPIError('Both schema1 and schema2 are required', 400);
  }

  logger.info('Comparing schemas', {
    userId: req.user?.id
  });

  const mapper = new SchemaMapper();
  const differences = mapper.compareSchemas(schema1, schema2);

  res.json({
    success: true,
    differences,
    summary: {
      tablesAdded: differences.tablesAdded.length,
      tablesRemoved: differences.tablesRemoved.length,
      tablesModified: differences.tablesModified.length
    }
  });
}));

/**
 * Map schema to different database type
 * POST /api/schema/map
 */
router.post('/map', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { schema, targetType, options } = req.body;

  if (!schema || !targetType) {
    throw createAPIError('schema and targetType are required', 400);
  }

  const target = targetType.toLowerCase() === 'mssql' ? DatabaseType.MSSQL : DatabaseType.MySQL;

  logger.info('Mapping schema', {
    targetType: target,
    userId: req.user?.id
  });

  const mapper = new SchemaMapper();
  const mappedSchema = mapper.mapSchema(schema, target, options);

  res.json({
    success: true,
    schema: mappedSchema
  });
}));

/**
 * Validate schema
 * POST /api/schema/validate
 */
router.post('/validate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { schema } = req.body;

  if (!schema) {
    throw createAPIError('schema is required', 400);
  }

  logger.info('Validating schema', {
    userId: req.user?.id
  });

  const validator = new SchemaValidator();

  try {
    validator.validateSchema(schema);

    res.json({
      success: true,
      valid: true,
      message: 'Schema is valid'
    });
  } catch (error: any) {
    res.json({
      success: true,
      valid: false,
      errors: [error.message]
    });
  }
}));

/**
 * Generate DDL from schema
 * POST /api/schema/generate-ddl
 */
router.post('/generate-ddl', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { schema } = req.body;

  if (!schema) {
    throw createAPIError('schema is required', 400);
  }

  logger.info('Generating DDL', {
    userId: req.user?.id
  });

  const mapper = new SchemaMapper();
  const ddlStatements: string[] = [];

  for (const table of schema.tables) {
    const createTableSQL = mapper.generateCreateTableSQL(table, schema.databaseType);
    ddlStatements.push(createTableSQL);
  }

  res.json({
    success: true,
    ddl: ddlStatements,
    count: ddlStatements.length
  });
}));

export default router;
