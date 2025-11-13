/**
 * Mobile API routes - API endpoints for mobile app integration
 */

import { Router, Request, Response } from 'express';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { DatabaseType } from '../../schema/types';
import { ChangelogManager } from '../../change-tracking/changelog-manager';
import { WebhookNotifier } from '../../change-tracking/webhook-notifier';
import { asyncHandler, createAPIError } from '../middleware/error-handler';
import { AuthenticatedRequest } from '../middleware/auth';
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('MobileRoutes');

/**
 * Initialize changelog system for a database
 * POST /api/mobile/init
 */
router.post('/init', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);

    // Initialize changelog and webhook tables
    await changelogManager.initializeChangelogTable();
    await changelogManager.initializeWebhookTable();

    res.json({
      success: true,
      message: 'Changelog system initialized successfully'
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Enable change tracking for a table
 * POST /api/mobile/tables/:tableName/enable-tracking
 */
router.post('/tables/:tableName/enable-tracking', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tableName } = req.params;
  const { type, host, port, database, user, password, primaryKeyColumn } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);
    await changelogManager.createTriggersForTable(tableName, primaryKeyColumn || 'id');

    res.json({
      success: true,
      message: `Change tracking enabled for table: ${tableName}`
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Disable change tracking for a table
 * POST /api/mobile/tables/:tableName/disable-tracking
 */
router.post('/tables/:tableName/disable-tracking', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tableName } = req.params;
  const { type, host, port, database, user, password } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);
    await changelogManager.removeTriggersForTable(tableName);

    res.json({
      success: true,
      message: `Change tracking disabled for table: ${tableName}`
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get data from a specific table
 * POST /api/mobile/tables/:tableName/data
 */
router.post('/tables/:tableName/data', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tableName } = req.params;
  const { type, host, port, database, user, password, limit, offset, where, orderBy } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    // Build query
    let query = `SELECT * FROM ${escapeSqlIdentifier(tableName, dbType)}`;

    if (where) {
      query += ` WHERE ${where}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      const limitValue = parseInt(limit);
      const offsetValue = offset ? parseInt(offset) : 0;

      if (dbType === DatabaseType.MSSQL) {
        if (orderBy) {
          query += ` OFFSET ${offsetValue} ROWS FETCH NEXT ${limitValue} ROWS ONLY`;
        } else {
          query = query.replace('SELECT *', `SELECT TOP ${limitValue} *`);
        }
      } else {
        query += ` LIMIT ${limitValue}`;
        if (offsetValue > 0) {
          query += ` OFFSET ${offsetValue}`;
        }
      }
    }

    const data = await connector.executeQuery(query);

    res.json({
      success: true,
      tableName,
      data,
      count: data.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get changes for a specific table
 * POST /api/mobile/tables/:tableName/changes
 */
router.post('/tables/:tableName/changes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tableName } = req.params;
  const { type, host, port, database, user, password, since, limit } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);

    let changes;
    if (since) {
      const sinceDate = new Date(since);
      changes = await changelogManager.getChangesSince(sinceDate, tableName);
    } else {
      changes = await changelogManager.getChangesForTable(tableName, limit || 100);
    }

    res.json({
      success: true,
      tableName,
      changes,
      count: changes.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get unsynced changes
 * POST /api/mobile/changes/unsynced
 */
router.post('/changes/unsynced', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, limit } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);
    const changes = await changelogManager.getUnsyncedChanges(limit || 100);

    res.json({
      success: true,
      changes,
      count: changes.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Mark changes as synced
 * POST /api/mobile/changes/mark-synced
 */
router.post('/changes/mark-synced', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, changeIds } = req.body;

  if (!type || !host || !port || !database || !changeIds) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);
    await changelogManager.markAsSynced(changeIds);

    res.json({
      success: true,
      message: 'Changes marked as synced',
      count: changeIds.length
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Execute custom query
 * POST /api/mobile/query
 */
router.post('/query', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, query, params } = req.body;

  if (!type || !host || !port || !database || !query) {
    throw createAPIError('Missing required fields', 400);
  }

  // Security: Block destructive operations in custom queries
  const lowerQuery = query.toLowerCase().trim();
  if (lowerQuery.startsWith('drop') ||
      lowerQuery.startsWith('truncate') ||
      lowerQuery.startsWith('delete') ||
      lowerQuery.includes('drop table') ||
      lowerQuery.includes('drop database')) {
    throw createAPIError('Destructive queries are not allowed', 403);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const result = await connector.executeQuery(query, params);

    res.json({
      success: true,
      data: result,
      count: Array.isArray(result) ? result.length : undefined
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Sync data from mobile to database (INSERT/UPDATE)
 * POST /api/mobile/tables/:tableName/sync
 */
router.post('/tables/:tableName/sync', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tableName } = req.params;
  const { type, host, port, database, user, password, records, primaryKey, operation } = req.body;

  if (!type || !host || !port || !database || !records || !primaryKey) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const results = {
      inserted: 0,
      updated: 0,
      failed: 0,
      errors: [] as any[]
    };

    for (const record of records) {
      try {
        const pkValue = record[primaryKey];

        if (!pkValue) {
          results.failed++;
          results.errors.push({ record, error: 'Missing primary key value' });
          continue;
        }

        // Check if record exists
        const checkQuery = `SELECT ${escapeSqlIdentifier(primaryKey, dbType)} FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(primaryKey, dbType)} = ?`;
        const existing = await connector.executeQuery(checkQuery, [pkValue]);

        if (existing.length > 0 && operation !== 'insert') {
          // Update existing record
          const columns = Object.keys(record).filter(k => k !== primaryKey);
          const setClause = columns.map(col => `${escapeSqlIdentifier(col, dbType)} = ?`).join(', ');
          const values = columns.map(col => record[col]);
          values.push(pkValue);

          const updateQuery = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setClause} WHERE ${escapeSqlIdentifier(primaryKey, dbType)} = ?`;
          await connector.executeQuery(updateQuery, values);
          results.updated++;
        } else if (operation !== 'update') {
          // Insert new record
          const columns = Object.keys(record);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map(col => record[col]);

          const insertQuery = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${columns.map(c => escapeSqlIdentifier(c, dbType)).join(', ')}) VALUES (${placeholders})`;
          await connector.executeQuery(insertQuery, values);
          results.inserted++;
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({ record, error: error.message });
        logger.warn('Failed to sync record', { tableName, error: error.message });
      }
    }

    res.json({
      success: true,
      results
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Register a webhook
 * POST /api/mobile/webhooks/register
 */
router.post('/webhooks/register', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, url, events, tableName } = req.body;

  if (!type || !host || !port || !database || !url || !events) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);
    await changelogManager.registerWebhook(url, events, tableName);

    res.json({
      success: true,
      message: 'Webhook registered successfully'
    });
  } finally {
    await connector.disconnect();
  }
}));

/**
 * Get active webhooks
 * POST /api/mobile/webhooks/list
 */
router.post('/webhooks/list', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, user, password, tableName } = req.body;

  if (!type || !host || !port || !database) {
    throw createAPIError('Missing required fields', 400);
  }

  const dbType = normalizeDatabaseType(type);
  const connector = await createAndConnectConnector(dbType, {
    host,
    port: parseInt(port),
    database,
    user,
    password
  });

  try {
    const changelogManager = new ChangelogManager(connector, dbType);
    const webhooks = await changelogManager.getActiveWebhooks(tableName);

    res.json({
      success: true,
      webhooks,
      count: webhooks.length
    });
  } finally {
    await connector.disconnect();
  }
}));

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

  throw createAPIError(`Unsupported database type: ${type}`, 400);
}

/**
 * Helper function to escape SQL identifiers
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

export default router;
