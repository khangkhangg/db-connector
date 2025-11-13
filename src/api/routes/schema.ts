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

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  // Normalize type to match DatabaseType enum
  const normalizedType = type.toLowerCase();
  let dbType: DatabaseType;

  if (normalizedType === 'mssql') {
    dbType = DatabaseType.MSSQL;
  } else if (normalizedType === 'mysql') {
    dbType = DatabaseType.MySQL;
  } else if (normalizedType === 'postgresql') {
    dbType = DatabaseType.PostgreSQL;
  } else {
    throw createAPIError(`Unsupported database type: ${type}`, 400);
  }

  logger.info('Reading schema', {
    type: dbType,
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

/**
 * Export database data as SQL INSERT statements
 * POST /api/schema/export-data
 */
router.post('/export-data', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, tables, limit } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  // Normalize type to match DatabaseType enum
  const normalizedType = type.toLowerCase();
  let dbType: DatabaseType;

  if (normalizedType === 'mssql') {
    dbType = DatabaseType.MSSQL;
  } else if (normalizedType === 'mysql') {
    dbType = DatabaseType.MySQL;
  } else if (normalizedType === 'postgresql') {
    dbType = DatabaseType.PostgreSQL;
  } else {
    throw createAPIError(`Unsupported database type: ${type}`, 400);
  }

  logger.info('Exporting database data', {
    type: dbType,
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
    // Get list of tables to export
    let tablesToExport: string[];
    if (tables && Array.isArray(tables) && tables.length > 0) {
      tablesToExport = tables;
    } else {
      tablesToExport = await connector.listTables(false);
    }

    const sqlStatements: string[] = [];
    let totalRecords = 0;
    const recordLimit = limit || 1000; // Default limit per table

    // Export data from each table
    for (const tableName of tablesToExport) {
      try {
        // Read table schema to get column information
        const tableSchema = await connector.readTableSchema(tableName);

        // Query all data from the table with limit (database-specific syntax)
        let query: string;
        if (dbType === DatabaseType.MSSQL) {
          query = `SELECT TOP ${recordLimit} * FROM ${escapeSqlIdentifier(tableName, dbType)}`;
        } else {
          query = `SELECT * FROM ${escapeSqlIdentifier(tableName, dbType)} LIMIT ${recordLimit}`;
        }

        const rows = await connector.executeQuery(query);

        if (rows.length === 0) {
          sqlStatements.push(`-- Table ${tableName} has no data\n`);
          continue;
        }

        // Generate INSERT statements
        sqlStatements.push(`-- Data for table: ${tableName}`);
        sqlStatements.push(`-- Records: ${rows.length}\n`);

        for (const row of rows) {
          const columns = Object.keys(row);
          const values = columns.map(col => formatSqlValue(row[col], dbType));

          const insertSQL = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${columns.map(c => escapeSqlIdentifier(c, dbType)).join(', ')}) VALUES (${values.join(', ')});`;
          sqlStatements.push(insertSQL);
        }

        sqlStatements.push(''); // Empty line between tables
        totalRecords += rows.length;
      } catch (error: any) {
        logger.warn(`Failed to export table ${tableName}`, { error: error.message });
        sqlStatements.push(`-- Failed to export table ${tableName}: ${error.message}\n`);
      }
    }

    const sqlContent = sqlStatements.join('\n');

    res.json({
      success: true,
      sql: sqlContent,
      metadata: {
        tables: tablesToExport.length,
        totalRecords,
        recordLimit
      }
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Helper function to escape SQL identifiers (table/column names)
 */
function escapeSqlIdentifier(identifier: string, dbType: DatabaseType): string {
  if (dbType === DatabaseType.MySQL) {
    return `\`${identifier.replace(/`/g, '``')}\``;
  } else if (dbType === DatabaseType.PostgreSQL) {
    return `"${identifier.replace(/"/g, '""')}"`;
  } else if (dbType === DatabaseType.MSSQL) {
    return `[${identifier.replace(/]/g, ']]')}]`;
  }
  return identifier;
}

/**
 * Helper function to format values for SQL INSERT statements
 */
function formatSqlValue(value: any, dbType: DatabaseType): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    if (dbType === DatabaseType.PostgreSQL) {
      return value ? 'TRUE' : 'FALSE';
    }
    return value ? '1' : '0';
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (typeof value === 'object') {
    // Handle JSON/JSONB columns
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  // String values - escape single quotes
  const stringValue = String(value).replace(/'/g, "''");
  return `'${stringValue}'`;
}

export default router;
