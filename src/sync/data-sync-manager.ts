/**
 * Data Synchronization Manager
 * Handles synchronization of data between databases
 */

import { EventEmitter } from 'events';
import { BaseDatabaseConnector } from '../connectors/base-connector';
import { MSSQLConnector } from '../connectors/mssql-connector';
import { MySQLConnector } from '../connectors/mysql-connector';
import { PostgreSQLConnector } from '../connectors/postgresql-connector';
import { AuditLogger } from '../audit/audit-logger';
import { Logger } from '../utils/logger';
import { DatabaseError } from '../utils/error-handler';
import {
  SyncConfig,
  SyncDatabaseConfig,
  TableSyncConfig,
  SyncDirection,
  SyncMode,
  SyncResult,
  SyncSessionResult,
  SyncStatus,
  RowChange,
  Conflict,
  ConflictStrategy,
  SyncEvent,
  SyncEventType
} from './types';
import { DatabaseType } from '../schema/types';

/**
 * Data synchronization manager
 */
export class DataSyncManager extends EventEmitter {
  private sourceConnector!: BaseDatabaseConnector;
  private targetConnector!: BaseDatabaseConnector;
  private logger: Logger;
  private auditLogger?: AuditLogger;
  private config!: SyncConfig;
  private status: SyncStatus;
  private syncInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(auditLogger?: AuditLogger) {
    super();
    this.logger = new Logger('DataSyncManager');
    this.auditLogger = auditLogger;
    this.status = {
      syncId: '',
      status: 'idle',
      progress: 0
    };
  }

  /**
   * Initialize sync with configuration
   */
  async initialize(config: SyncConfig): Promise<void> {
    try {
      this.config = config;
      this.status.syncId = config.id;

      // Create source connector
      this.sourceConnector = this.createConnector(config.source);
      await this.sourceConnector.connect();
      this.logger.info('Connected to source database', {
        type: config.source.type,
        database: config.source.database
      });

      // Create target connector
      this.targetConnector = this.createConnector(config.target);
      await this.targetConnector.connect();
      this.logger.info('Connected to target database', {
        type: config.target.type,
        database: config.target.database
      });

      // Log initialization
      if (this.auditLogger) {
        await this.auditLogger.logSchemaRead(
          config.source.database,
          config.source.type,
          `Sync initialized: ${config.name}`,
          'system'
        );
      }

      this.emitEvent(SyncEventType.SyncStarted, {
        config: {
          id: config.id,
          name: config.name,
          direction: config.direction,
          mode: config.mode
        }
      });
    } catch (error) {
      this.logger.error('Failed to initialize sync', { error });
      throw new DatabaseError(`Sync initialization failed: ${error}`);
    }
  }

  /**
   * Create database connector based on type
   */
  private createConnector(config: SyncDatabaseConfig): BaseDatabaseConnector {
    const connectorConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl
    };

    switch (config.type) {
      case DatabaseType.MSSQL:
        return new MSSQLConnector(connectorConfig);
      case DatabaseType.MySQL:
        return new MySQLConnector(connectorConfig);
      case DatabaseType.PostgreSQL:
        return new PostgreSQLConnector(connectorConfig);
      default:
        throw new DatabaseError(`Unsupported database type: ${config.type}`);
    }
  }

  /**
   * Execute synchronization
   */
  async sync(): Promise<SyncSessionResult> {
    if (this.isRunning) {
      throw new DatabaseError('Sync is already running');
    }

    this.isRunning = true;
    this.status.status = 'running';
    this.status.progress = 0;

    const sessionStart = new Date();
    const tableResults: SyncResult[] = [];

    try {
      const enabledTables = this.config.tables.filter(t => t.enabled !== false);
      const totalTables = enabledTables.length;

      this.logger.info('Starting sync session', {
        syncId: this.config.id,
        tables: totalTables,
        direction: this.config.direction
      });

      // Process each table
      for (let i = 0; i < enabledTables.length; i++) {
        const tableConfig = enabledTables[i];
        this.status.currentTable = tableConfig.sourceTable;
        this.status.progress = Math.round((i / totalTables) * 100);

        const result = await this.syncTable(tableConfig);
        tableResults.push(result);

        this.emitEvent(SyncEventType.TableSyncCompleted, {
          table: tableConfig.sourceTable,
          result
        });
      }

      const sessionEnd = new Date();
      const sessionResult: SyncSessionResult = {
        syncId: this.config.id,
        startTime: sessionStart,
        endTime: sessionEnd,
        durationMs: sessionEnd.getTime() - sessionStart.getTime(),
        tableResults,
        success: tableResults.every(r => r.success),
        summary: this.calculateSummary(tableResults)
      };

      this.status.status = 'idle';
      this.status.progress = 100;
      this.status.lastSyncTime = sessionEnd;
      this.status.lastResult = sessionResult;

      this.emitEvent(SyncEventType.SyncCompleted, { result: sessionResult });

      this.logger.info('Sync session completed', {
        syncId: this.config.id,
        summary: sessionResult.summary
      });

      return sessionResult;
    } catch (error) {
      this.status.status = 'error';
      this.status.errorMessage = String(error);
      this.emitEvent(SyncEventType.SyncFailed, { error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync a single table
   */
  private async syncTable(tableConfig: TableSyncConfig): Promise<SyncResult> {
    const startTime = new Date();
    let inserted = 0;
    let updated = 0;
    let deleted = 0;
    let conflicts = 0;
    let errors = 0;

    try {
      this.logger.info('Syncing table', {
        source: tableConfig.sourceTable,
        target: tableConfig.targetTable || tableConfig.sourceTable
      });

      this.emitEvent(SyncEventType.TableSyncStarted, {
        table: tableConfig.sourceTable
      });

      const sourceTable = tableConfig.sourceTable;
      const targetTable = tableConfig.targetTable || tableConfig.sourceTable;
      const batchSize = tableConfig.batchSize || this.config.defaultBatchSize || 1000;

      // Read source data
      const sourceData = await this.readTableData(
        this.sourceConnector,
        tableConfig
      );

      if (this.config.dryRun) {
        this.logger.info('DRY RUN: Would sync rows', {
          table: sourceTable,
          rows: sourceData.length
        });
        return this.createSuccessResult(
          sourceTable,
          startTime,
          sourceData.length,
          0,
          0,
          0,
          0
        );
      }

      // Get primary key columns
      const primaryKey = tableConfig.primaryKey || await this.getPrimaryKey(
        this.sourceConnector,
        sourceTable
      );

      if (!primaryKey || primaryKey.length === 0) {
        throw new DatabaseError(
          `No primary key defined for table ${sourceTable}`
        );
      }

      // Read target data for comparison
      const targetData = await this.readTableData(
        this.targetConnector,
        {
          ...tableConfig,
          sourceTable: targetTable
        }
      );

      // Build maps for efficient lookup
      const sourceMap = this.buildDataMap(sourceData, primaryKey);
      const targetMap = this.buildDataMap(targetData, primaryKey);

      // Calculate changes
      const changes: RowChange[] = [];

      // Find inserts and updates
      for (const [key, sourceRow] of sourceMap) {
        if (!targetMap.has(key)) {
          // Insert
          changes.push({
            type: 'insert',
            tableName: targetTable,
            primaryKey: this.extractPrimaryKey(sourceRow, primaryKey),
            data: sourceRow
          });
        } else {
          // Potential update
          const targetRow = targetMap.get(key)!;
          if (!this.areRowsEqual(sourceRow, targetRow, tableConfig)) {
            // Check for conflicts in bidirectional mode
            if (this.config.direction === SyncDirection.Bidirectional) {
              const conflict = this.detectConflict(
                sourceRow,
                targetRow,
                tableConfig
              );
              if (conflict) {
                conflicts++;
                const resolved = await this.resolveConflict(
                  conflict,
                  tableConfig
                );
                if (resolved) {
                  changes.push({
                    type: 'update',
                    tableName: targetTable,
                    primaryKey: this.extractPrimaryKey(sourceRow, primaryKey),
                    data: resolved,
                    oldData: targetRow
                  });
                }
              } else {
                changes.push({
                  type: 'update',
                  tableName: targetTable,
                  primaryKey: this.extractPrimaryKey(sourceRow, primaryKey),
                  data: sourceRow,
                  oldData: targetRow
                });
              }
            } else {
              changes.push({
                type: 'update',
                tableName: targetTable,
                primaryKey: this.extractPrimaryKey(sourceRow, primaryKey),
                data: sourceRow,
                oldData: targetRow
              });
            }
          }
        }
      }

      // Find deletes (only if we're replacing target data)
      if (this.config.mode === SyncMode.InitialClone) {
        for (const [key, targetRow] of targetMap) {
          if (!sourceMap.has(key)) {
            changes.push({
              type: 'delete',
              tableName: targetTable,
              primaryKey: this.extractPrimaryKey(targetRow, primaryKey)
            });
          }
        }
      }

      // Apply changes in batches
      const insertChanges = changes.filter(c => c.type === 'insert');
      const updateChanges = changes.filter(c => c.type === 'update');
      const deleteChanges = changes.filter(c => c.type === 'delete');

      // Process inserts
      if (insertChanges.length > 0) {
        inserted = await this.applyInserts(
          this.targetConnector,
          targetTable,
          insertChanges,
          tableConfig,
          batchSize
        );
      }

      // Process updates
      if (updateChanges.length > 0) {
        updated = await this.applyUpdates(
          this.targetConnector,
          targetTable,
          updateChanges,
          tableConfig,
          primaryKey
        );
      }

      // Process deletes
      if (deleteChanges.length > 0) {
        deleted = await this.applyDeletes(
          this.targetConnector,
          targetTable,
          deleteChanges,
          primaryKey
        );
      }

      const endTime = new Date();
      return this.createSuccessResult(
        sourceTable,
        startTime,
        inserted,
        updated,
        deleted,
        conflicts,
        errors
      );
    } catch (error) {
      this.logger.error('Table sync failed', {
        table: tableConfig.sourceTable,
        error
      });
      this.emitEvent(SyncEventType.TableSyncFailed, {
        table: tableConfig.sourceTable,
        error
      });
      return this.createErrorResult(tableConfig.sourceTable, startTime, error);
    }
  }

  /**
   * Read data from a table
   */
  private async readTableData(
    connector: BaseDatabaseConnector,
    tableConfig: TableSyncConfig
  ): Promise<any[]> {
    const columns = tableConfig.columns?.join(', ') || '*';
    const whereClause = tableConfig.whereClause ? `WHERE ${tableConfig.whereClause}` : '';
    const query = `SELECT ${columns} FROM ${tableConfig.sourceTable} ${whereClause}`;

    return connector.executeQuery<any[]>(query);
  }

  /**
   * Get primary key columns for a table
   */
  private async getPrimaryKey(
    connector: BaseDatabaseConnector,
    tableName: string
  ): Promise<string[]> {
    const schema = await connector.readTableSchema(tableName);
    return schema.primaryKey || [];
  }

  /**
   * Build a map of rows keyed by primary key
   */
  private buildDataMap(
    data: any[],
    primaryKey: string[]
  ): Map<string, any> {
    const map = new Map<string, any>();

    for (const row of data) {
      const key = this.buildPrimaryKeyString(row, primaryKey);
      map.set(key, row);
    }

    return map;
  }

  /**
   * Build a string key from primary key values
   */
  private buildPrimaryKeyString(row: any, primaryKey: string[]): string {
    return primaryKey.map(col => String(row[col])).join('|');
  }

  /**
   * Extract primary key values from a row
   */
  private extractPrimaryKey(row: any, primaryKey: string[]): Record<string, any> {
    const pk: Record<string, any> = {};
    for (const col of primaryKey) {
      pk[col] = row[col];
    }
    return pk;
  }

  /**
   * Check if two rows are equal
   */
  private areRowsEqual(
    row1: any,
    row2: any,
    tableConfig: TableSyncConfig
  ): boolean {
    const columns = tableConfig.columns || Object.keys(row1);

    for (const col of columns) {
      if (row1[col] !== row2[col]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect conflict between source and target rows
   */
  private detectConflict(
    sourceRow: any,
    targetRow: any,
    tableConfig: TableSyncConfig
  ): Conflict | null {
    // If there's a timestamp column, check if both have been modified
    if (tableConfig.timestampColumn) {
      const sourceTs = sourceRow[tableConfig.timestampColumn];
      const targetTs = targetRow[tableConfig.timestampColumn];

      if (sourceTs && targetTs && sourceTs !== targetTs) {
        return {
          tableName: tableConfig.sourceTable,
          primaryKey: this.extractPrimaryKey(
            sourceRow,
            tableConfig.primaryKey || []
          ),
          sourceData: sourceRow,
          targetData: targetRow,
          sourceTimestamp: new Date(sourceTs),
          targetTimestamp: new Date(targetTs)
        };
      }
    }

    return null;
  }

  /**
   * Resolve a conflict based on strategy
   */
  private async resolveConflict(
    conflict: Conflict,
    tableConfig: TableSyncConfig
  ): Promise<any | null> {
    const strategy = this.config.conflictStrategy || ConflictStrategy.SourceWins;

    this.emitEvent(SyncEventType.ConflictDetected, { conflict, strategy });

    let resolvedData: any;

    switch (strategy) {
      case ConflictStrategy.SourceWins:
        resolvedData = conflict.sourceData;
        break;

      case ConflictStrategy.TargetWins:
        resolvedData = conflict.targetData;
        break;

      case ConflictStrategy.LatestWins:
        if (!conflict.sourceTimestamp || !conflict.targetTimestamp) {
          resolvedData = conflict.sourceData;
        } else {
          resolvedData = conflict.sourceTimestamp > conflict.targetTimestamp
            ? conflict.sourceData
            : conflict.targetData;
        }
        break;

      case ConflictStrategy.Skip:
        this.logger.warn('Skipping conflicting row', {
          table: conflict.tableName,
          primaryKey: conflict.primaryKey
        });
        return null;

      case ConflictStrategy.Manual:
        this.logger.error('Manual conflict resolution required', { conflict });
        throw new DatabaseError(
          `Manual conflict resolution required for ${conflict.tableName}`
        );

      default:
        resolvedData = conflict.sourceData;
    }

    this.emitEvent(SyncEventType.ConflictResolved, {
      conflict,
      resolution: resolvedData
    });

    return resolvedData;
  }

  /**
   * Apply inserts to target database
   */
  private async applyInserts(
    connector: BaseDatabaseConnector,
    tableName: string,
    changes: RowChange[],
    tableConfig: TableSyncConfig,
    batchSize: number
  ): Promise<number> {
    let totalInserted = 0;

    for (let i = 0; i < changes.length; i += batchSize) {
      const batch = changes.slice(i, i + batchSize);
      const rows = batch.map(c => c.data!);

      // Get columns from first row
      const columns = Object.keys(rows[0]);
      const values = rows.map(row => columns.map(col => row[col]));

      await connector.batchInsert(tableName, columns, values);
      totalInserted += batch.length;

      this.emitEvent(SyncEventType.BatchProcessed, {
        type: 'insert',
        table: tableName,
        count: batch.length
      });

      if (this.config.enableDetailedLogging) {
        this.logger.info('Inserted batch', {
          table: tableName,
          count: batch.length,
          total: totalInserted
        });
      }
    }

    return totalInserted;
  }

  /**
   * Apply updates to target database
   */
  private async applyUpdates(
    connector: BaseDatabaseConnector,
    tableName: string,
    changes: RowChange[],
    tableConfig: TableSyncConfig,
    primaryKey: string[]
  ): Promise<number> {
    let totalUpdated = 0;

    for (const change of changes) {
      const setClauses: string[] = [];
      const values: any[] = [];

      // Build SET clause
      for (const [col, value] of Object.entries(change.data!)) {
        if (!primaryKey.includes(col)) {
          setClauses.push(`${col} = ?`);
          values.push(value);
        }
      }

      // Build WHERE clause
      const whereClauses = primaryKey.map(col => `${col} = ?`);
      for (const col of primaryKey) {
        values.push(change.primaryKey[col]);
      }

      const query = `
        UPDATE ${tableName}
        SET ${setClauses.join(', ')}
        WHERE ${whereClauses.join(' AND ')}
      `;

      await connector.executeQuery(query, values);
      totalUpdated++;
    }

    this.emitEvent(SyncEventType.BatchProcessed, {
      type: 'update',
      table: tableName,
      count: totalUpdated
    });

    return totalUpdated;
  }

  /**
   * Apply deletes to target database
   */
  private async applyDeletes(
    connector: BaseDatabaseConnector,
    tableName: string,
    changes: RowChange[],
    primaryKey: string[]
  ): Promise<number> {
    let totalDeleted = 0;

    for (const change of changes) {
      const whereClauses = primaryKey.map(col => `${col} = ?`);
      const values = primaryKey.map(col => change.primaryKey[col]);

      const query = `DELETE FROM ${tableName} WHERE ${whereClauses.join(' AND ')}`;

      await connector.executeQuery(query, values);
      totalDeleted++;
    }

    this.emitEvent(SyncEventType.BatchProcessed, {
      type: 'delete',
      table: tableName,
      count: totalDeleted
    });

    return totalDeleted;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(results: SyncResult[]) {
    return {
      totalTables: results.length,
      successfulTables: results.filter(r => r.success).length,
      failedTables: results.filter(r => !r.success).length,
      totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
      totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
      totalDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
      totalConflicts: results.reduce((sum, r) => sum + r.conflicts, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors, 0)
    };
  }

  /**
   * Create success result
   */
  private createSuccessResult(
    tableName: string,
    startTime: Date,
    inserted: number,
    updated: number,
    deleted: number,
    conflicts: number,
    errors: number
  ): SyncResult {
    const endTime = new Date();
    return {
      syncId: this.config.id,
      tableName,
      inserted,
      updated,
      deleted,
      conflicts,
      errors,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      success: true
    };
  }

  /**
   * Create error result
   */
  private createErrorResult(
    tableName: string,
    startTime: Date,
    error: any
  ): SyncResult {
    const endTime = new Date();
    return {
      syncId: this.config.id,
      tableName,
      inserted: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      errors: 1,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      success: false,
      errorMessage: String(error)
    };
  }

  /**
   * Start continuous sync
   */
  async startContinuousSync(): Promise<void> {
    if (this.config.mode !== SyncMode.Continuous) {
      throw new DatabaseError('Sync mode must be "continuous"');
    }

    const intervalMs = this.config.syncIntervalMs || 60000; // Default 1 minute

    this.logger.info('Starting continuous sync', {
      syncId: this.config.id,
      intervalMs
    });

    // Run initial sync
    await this.sync();

    // Schedule periodic syncs
    this.syncInterval = setInterval(async () => {
      try {
        await this.sync();
      } catch (error) {
        this.logger.error('Continuous sync failed', { error });
        this.emitEvent(SyncEventType.ErrorOccurred, { error });
      }
    }, intervalMs);

    this.status.nextSyncTime = new Date(Date.now() + intervalMs);
  }

  /**
   * Stop continuous sync
   */
  stopContinuousSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      this.status.status = 'stopped';
      this.status.nextSyncTime = undefined;
      this.logger.info('Stopped continuous sync', { syncId: this.config.id });
    }
  }

  /**
   * Pause sync
   */
  pause(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      this.status.status = 'paused';
      this.logger.info('Paused sync', { syncId: this.config.id });
    }
  }

  /**
   * Resume sync
   */
  async resume(): Promise<void> {
    if (this.status.status === 'paused') {
      await this.startContinuousSync();
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Emit sync event
   */
  private emitEvent(type: SyncEventType, data: any): void {
    const event: SyncEvent = {
      type,
      syncId: this.config.id,
      timestamp: new Date(),
      data
    };

    this.emit('sync-event', event);

    if (this.config.enableDetailedLogging) {
      this.logger.info('Sync event', { type, data });
    }
  }

  /**
   * Disconnect from databases
   */
  async disconnect(): Promise<void> {
    this.stopContinuousSync();

    if (this.sourceConnector) {
      await this.sourceConnector.disconnect();
    }

    if (this.targetConnector) {
      await this.targetConnector.disconnect();
    }

    this.logger.info('Disconnected from databases');
  }
}
