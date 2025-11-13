/**
 * Bi-directional Sync - Synchronize data between two databases in both directions
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { DatabaseType } from '../schema/types';
import { ChangelogManager, ChangeRecord } from '../change-tracking/changelog-manager';
import { createLogger } from '../utils/logger';

const logger = createLogger('BidirectionalSync');

export type ConflictStrategy = 'source-wins' | 'target-wins' | 'newest-wins' | 'manual' | 'merge';

export interface SyncTableConfig {
  sourceTable: string;
  targetTable: string;
  primaryKey: string;
  conflictStrategy: ConflictStrategy;
  columnMapping?: { [sourceColumn: string]: string }; // source col -> target col
  syncDirection?: 'both' | 'source-to-target' | 'target-to-source';
}

export interface SyncConflict {
  tableName: string;
  recordId: string;
  sourceData: any;
  targetData: any;
  sourceTimestamp?: Date;
  targetTimestamp?: Date;
}

export interface SyncResult {
  success: boolean;
  sourceToTargetInserted: number;
  sourceToTargetUpdated: number;
  targetToSourceInserted: number;
  targetToSourceUpdated: number;
  conflicts: SyncConflict[];
  errors: any[];
}

export class BidirectionalSync {
  constructor(
    private sourceConnector: BaseDatabaseConnector,
    private targetConnector: BaseDatabaseConnector,
    private sourceDbType: DatabaseType,
    private targetDbType: DatabaseType
  ) {}

  /**
   * Perform bi-directional sync for configured tables
   */
  async sync(tableConfigs: SyncTableConfig[], lastSyncTime?: Date): Promise<SyncResult> {
    logger.info('Starting bi-directional sync', {
      tableCount: tableConfigs.length,
      lastSyncTime
    });

    const result: SyncResult = {
      success: true,
      sourceToTargetInserted: 0,
      sourceToTargetUpdated: 0,
      targetToSourceInserted: 0,
      targetToSourceUpdated: 0,
      conflicts: [],
      errors: []
    };

    for (const config of tableConfigs) {
      try {
        await this.syncTable(config, lastSyncTime, result);
      } catch (error: any) {
        logger.error('Failed to sync table', {
          sourceTable: config.sourceTable,
          targetTable: config.targetTable,
          error: error.message
        });
        result.errors.push({
          table: config.sourceTable,
          error: error.message
        });
        result.success = false;
      }
    }

    logger.info('Bi-directional sync completed', {
      success: result.success,
      sourceToTargetInserted: result.sourceToTargetInserted,
      sourceToTargetUpdated: result.sourceToTargetUpdated,
      targetToSourceInserted: result.targetToSourceInserted,
      targetToSourceUpdated: result.targetToSourceUpdated,
      conflicts: result.conflicts.length,
      errors: result.errors.length
    });

    return result;
  }

  /**
   * Sync a single table bi-directionally
   */
  private async syncTable(
    config: SyncTableConfig,
    lastSyncTime: Date | undefined,
    result: SyncResult
  ): Promise<void> {
    const { sourceTable, targetTable, primaryKey, syncDirection = 'both' } = config;

    logger.info('Syncing table', { sourceTable, targetTable, syncDirection });

    // Get changes from source
    let sourceChanges: ChangeRecord[] = [];
    if (syncDirection === 'both' || syncDirection === 'source-to-target') {
      sourceChanges = await this.getChanges(
        this.sourceConnector,
        this.sourceDbType,
        sourceTable,
        lastSyncTime
      );
      logger.debug('Source changes detected', { count: sourceChanges.length });
    }

    // Get changes from target
    let targetChanges: ChangeRecord[] = [];
    if (syncDirection === 'both' || syncDirection === 'target-to-source') {
      targetChanges = await this.getChanges(
        this.targetConnector,
        this.targetDbType,
        targetTable,
        lastSyncTime
      );
      logger.debug('Target changes detected', { count: targetChanges.length });
    }

    // Detect conflicts (same record modified on both sides)
    const conflicts = this.detectConflicts(sourceChanges, targetChanges, primaryKey);

    if (conflicts.length > 0) {
      logger.warn('Conflicts detected', { count: conflicts.length, table: sourceTable });

      // Resolve conflicts
      await this.resolveConflicts(conflicts, config, result);
    }

    // Sync source -> target
    if (syncDirection === 'both' || syncDirection === 'source-to-target') {
      await this.syncChanges(
        sourceChanges.filter(c => !conflicts.some(cf => cf.recordId === c.recordId)),
        this.sourceConnector,
        this.targetConnector,
        config,
        'source-to-target',
        result
      );
    }

    // Sync target -> source
    if (syncDirection === 'both' || syncDirection === 'target-to-source') {
      await this.syncChanges(
        targetChanges.filter(c => !conflicts.some(cf => cf.recordId === c.recordId)),
        this.targetConnector,
        this.sourceConnector,
        this.reverseConfig(config),
        'target-to-source',
        result
      );
    }
  }

  /**
   * Get changes from a database since last sync
   */
  private async getChanges(
    connector: BaseDatabaseConnector,
    dbType: DatabaseType,
    tableName: string,
    since?: Date
  ): Promise<ChangeRecord[]> {
    const changelogManager = new ChangelogManager(connector, dbType);

    if (since) {
      return await changelogManager.getChangesSince(since, tableName);
    } else {
      return await changelogManager.getChangesForTable(tableName, 1000);
    }
  }

  /**
   * Detect conflicts between source and target changes
   */
  private detectConflicts(
    sourceChanges: ChangeRecord[],
    targetChanges: ChangeRecord[],
    primaryKey: string
  ): SyncConflict[] {
    const conflicts: SyncConflict[] = [];

    // Build a map of target changes by record ID
    const targetChangeMap = new Map<string, ChangeRecord>();
    for (const change of targetChanges) {
      targetChangeMap.set(change.recordId, change);
    }

    // Check each source change for conflicts
    for (const sourceChange of sourceChanges) {
      const targetChange = targetChangeMap.get(sourceChange.recordId);

      if (targetChange) {
        // Conflict detected: same record modified on both sides
        conflicts.push({
          tableName: sourceChange.tableName,
          recordId: sourceChange.recordId,
          sourceData: sourceChange.newData,
          targetData: targetChange.newData,
          sourceTimestamp: sourceChange.timestamp,
          targetTimestamp: targetChange.timestamp
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts based on strategy
   */
  private async resolveConflicts(
    conflicts: SyncConflict[],
    config: SyncTableConfig,
    result: SyncResult
  ): Promise<void> {
    for (const conflict of conflicts) {
      let resolvedData: any = null;
      let direction: 'source-to-target' | 'target-to-source' | 'skip' = 'skip';

      switch (config.conflictStrategy) {
        case 'source-wins':
          resolvedData = conflict.sourceData;
          direction = 'source-to-target';
          break;

        case 'target-wins':
          resolvedData = conflict.targetData;
          direction = 'target-to-source';
          break;

        case 'newest-wins':
          if (conflict.sourceTimestamp && conflict.targetTimestamp) {
            if (conflict.sourceTimestamp > conflict.targetTimestamp) {
              resolvedData = conflict.sourceData;
              direction = 'source-to-target';
            } else {
              resolvedData = conflict.targetData;
              direction = 'target-to-source';
            }
          } else {
            direction = 'skip'; // Can't determine which is newer
          }
          break;

        case 'merge':
          // Simple merge: combine non-conflicting fields
          resolvedData = { ...conflict.targetData, ...conflict.sourceData };
          direction = 'source-to-target';
          break;

        case 'manual':
        default:
          // Add to conflicts list for manual resolution
          result.conflicts.push(conflict);
          direction = 'skip';
          break;
      }

      if (direction !== 'skip' && resolvedData) {
        // Apply the resolution
        await this.applyResolution(
          resolvedData,
          conflict.recordId,
          config,
          direction,
          result
        );
      }
    }
  }

  /**
   * Apply conflict resolution
   */
  private async applyResolution(
    data: any,
    recordId: string,
    config: SyncTableConfig,
    direction: 'source-to-target' | 'target-to-source',
    result: SyncResult
  ): Promise<void> {
    try {
      if (direction === 'source-to-target') {
        await this.updateRecord(
          this.targetConnector,
          this.targetDbType,
          config.targetTable,
          config.primaryKey,
          recordId,
          data,
          config.columnMapping
        );
        result.sourceToTargetUpdated++;
      } else {
        await this.updateRecord(
          this.sourceConnector,
          this.sourceDbType,
          config.sourceTable,
          config.primaryKey,
          recordId,
          data
        );
        result.targetToSourceUpdated++;
      }

      logger.info('Conflict resolved', {
        recordId,
        direction,
        strategy: config.conflictStrategy
      });
    } catch (error: any) {
      logger.error('Failed to apply conflict resolution', {
        recordId,
        error: error.message
      });
      result.errors.push({
        recordId,
        error: error.message,
        type: 'conflict_resolution'
      });
    }
  }

  /**
   * Sync changes from source to target
   */
  private async syncChanges(
    changes: ChangeRecord[],
    sourceConnector: BaseDatabaseConnector,
    targetConnector: BaseDatabaseConnector,
    config: SyncTableConfig,
    direction: 'source-to-target' | 'target-to-source',
    result: SyncResult
  ): Promise<void> {
    for (const change of changes) {
      try {
        const targetTable = direction === 'source-to-target' ? config.targetTable : config.sourceTable;
        const targetDbType = direction === 'source-to-target' ? this.targetDbType : this.sourceDbType;

        switch (change.operation) {
          case 'INSERT':
            await this.insertRecord(
              targetConnector,
              targetDbType,
              targetTable,
              change.newData,
              config.columnMapping
            );
            if (direction === 'source-to-target') {
              result.sourceToTargetInserted++;
            } else {
              result.targetToSourceInserted++;
            }
            break;

          case 'UPDATE':
            await this.updateRecord(
              targetConnector,
              targetDbType,
              targetTable,
              config.primaryKey,
              change.recordId,
              change.newData,
              config.columnMapping
            );
            if (direction === 'source-to-target') {
              result.sourceToTargetUpdated++;
            } else {
              result.targetToSourceUpdated++;
            }
            break;

          case 'DELETE':
            await this.deleteRecord(
              targetConnector,
              targetDbType,
              targetTable,
              config.primaryKey,
              change.recordId
            );
            break;
        }

        logger.debug('Change synced', {
          operation: change.operation,
          recordId: change.recordId,
          direction
        });
      } catch (error: any) {
        logger.error('Failed to sync change', {
          operation: change.operation,
          recordId: change.recordId,
          error: error.message
        });
        result.errors.push({
          changeId: change.id,
          recordId: change.recordId,
          error: error.message
        });
      }
    }
  }

  /**
   * Insert a record into target database
   */
  private async insertRecord(
    connector: BaseDatabaseConnector,
    dbType: DatabaseType,
    tableName: string,
    data: any,
    columnMapping?: { [key: string]: string }
  ): Promise<void> {
    const mappedData = this.mapColumns(data, columnMapping);
    const columns = Object.keys(mappedData);
    const values = columns.map(col => mappedData[col]);
    const placeholders = columns.map(() => '?').join(', ');

    const query = `INSERT INTO ${this.escapeSqlIdentifier(tableName, dbType)} (${columns.map(c => this.escapeSqlIdentifier(c, dbType)).join(', ')}) VALUES (${placeholders})`;

    await connector.executeQuery(query, values);
  }

  /**
   * Update a record in target database
   */
  private async updateRecord(
    connector: BaseDatabaseConnector,
    dbType: DatabaseType,
    tableName: string,
    primaryKey: string,
    recordId: string,
    data: any,
    columnMapping?: { [key: string]: string }
  ): Promise<void> {
    const mappedData = this.mapColumns(data, columnMapping);
    delete mappedData[primaryKey]; // Don't update primary key

    const columns = Object.keys(mappedData);
    const values = columns.map(col => mappedData[col]);
    values.push(recordId);

    const setClause = columns.map(col => `${this.escapeSqlIdentifier(col, dbType)} = ?`).join(', ');
    const query = `UPDATE ${this.escapeSqlIdentifier(tableName, dbType)} SET ${setClause} WHERE ${this.escapeSqlIdentifier(primaryKey, dbType)} = ?`;

    await connector.executeQuery(query, values);
  }

  /**
   * Delete a record from target database
   */
  private async deleteRecord(
    connector: BaseDatabaseConnector,
    dbType: DatabaseType,
    tableName: string,
    primaryKey: string,
    recordId: string
  ): Promise<void> {
    const query = `DELETE FROM ${this.escapeSqlIdentifier(tableName, dbType)} WHERE ${this.escapeSqlIdentifier(primaryKey, dbType)} = ?`;
    await connector.executeQuery(query, [recordId]);
  }

  /**
   * Map columns from source to target
   */
  private mapColumns(data: any, columnMapping?: { [key: string]: string }): any {
    if (!columnMapping) return data;

    const mapped: any = {};
    for (const [sourceCol, targetCol] of Object.entries(columnMapping)) {
      if (data[sourceCol] !== undefined) {
        mapped[targetCol] = data[sourceCol];
      }
    }

    // Include unmapped columns
    for (const col in data) {
      if (!columnMapping[col]) {
        mapped[col] = data[col];
      }
    }

    return mapped;
  }

  /**
   * Reverse table config for target -> source sync
   */
  private reverseConfig(config: SyncTableConfig): SyncTableConfig {
    const reverseMapping: { [key: string]: string } = {};
    if (config.columnMapping) {
      for (const [source, target] of Object.entries(config.columnMapping)) {
        reverseMapping[target] = source;
      }
    }

    return {
      sourceTable: config.targetTable,
      targetTable: config.sourceTable,
      primaryKey: config.primaryKey,
      conflictStrategy: config.conflictStrategy,
      columnMapping: Object.keys(reverseMapping).length > 0 ? reverseMapping : undefined,
      syncDirection: 'source-to-target' // Already reversed
    };
  }

  /**
   * Escape SQL identifiers
   */
  private escapeSqlIdentifier(identifier: string, dbType: DatabaseType): string {
    if (dbType === DatabaseType.MySQL) {
      return `\`${identifier.replace(/`/g, '``')}\``;
    } else if (dbType === DatabaseType.PostgreSQL) {
      return `"${identifier.replace(/"/g, '""')}"`;
    } else if (dbType === DatabaseType.MSSQL) {
      return `[${identifier.replace(/]/g, ']]')}]`;
    }
    return identifier;
  }
}
