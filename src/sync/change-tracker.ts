/**
 * Change Tracking System
 * Monitors databases for changes to enable continuous synchronization
 */

import { EventEmitter } from 'events';
import { BaseDatabaseConnector } from '../connectors/base-connector';
import { Logger } from '../utils/logger';
import { DatabaseError } from '../utils/error-handler';
import { RowChange, TableSyncConfig } from './types';
import { DatabaseType } from '../schema/types';

/**
 * Change tracking method
 */
export enum ChangeTrackingMethod {
  /** Timestamp-based tracking */
  Timestamp = 'timestamp',
  /** MSSQL Change Tracking */
  MSSQLChangeTracking = 'mssql_change_tracking',
  /** MySQL Binary Log */
  MySQLBinlog = 'mysql_binlog',
  /** PostgreSQL Logical Replication */
  PostgreSQLLogical = 'postgresql_logical',
  /** Polling-based tracking */
  Polling = 'polling'
}

/**
 * Change tracking configuration
 */
export interface ChangeTrackerConfig {
  /** Database connector */
  connector: BaseDatabaseConnector;
  /** Database type */
  databaseType: DatabaseType;
  /** Tables to track */
  tables: TableSyncConfig[];
  /** Tracking method */
  method: ChangeTrackingMethod;
  /** Polling interval in milliseconds (for polling method) */
  pollingIntervalMs?: number;
  /** Batch size for reading changes */
  batchSize?: number;
}

/**
 * Last sync checkpoint for a table
 */
interface SyncCheckpoint {
  tableName: string;
  lastSyncTime: Date;
  lastChangeVersion?: number;
  lastBinlogPosition?: string;
  lastLSN?: string;
}

/**
 * Change tracker for monitoring database changes
 */
export class ChangeTracker extends EventEmitter {
  private config: ChangeTrackerConfig;
  private logger: Logger;
  private checkpoints: Map<string, SyncCheckpoint>;
  private pollingInterval?: NodeJS.Timeout;
  private isTracking: boolean = false;

  constructor(config: ChangeTrackerConfig) {
    super();
    this.config = config;
    this.logger = new Logger('ChangeTracker');
    this.checkpoints = new Map();
  }

  /**
   * Initialize change tracking
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing change tracking', {
        method: this.config.method,
        tables: this.config.tables.length
      });

      // Initialize checkpoints for each table
      for (const table of this.config.tables) {
        this.checkpoints.set(table.sourceTable, {
          tableName: table.sourceTable,
          lastSyncTime: new Date()
        });
      }

      // Set up change tracking based on method
      switch (this.config.method) {
        case ChangeTrackingMethod.MSSQLChangeTracking:
          await this.initializeMSSQLChangeTracking();
          break;

        case ChangeTrackingMethod.MySQLBinlog:
          await this.initializeMySQLBinlog();
          break;

        case ChangeTrackingMethod.PostgreSQLLogical:
          await this.initializePostgreSQLLogical();
          break;

        case ChangeTrackingMethod.Timestamp:
        case ChangeTrackingMethod.Polling:
          // No special initialization needed
          break;

        default:
          throw new DatabaseError(
            `Unsupported change tracking method: ${this.config.method}`
          );
      }

      this.logger.info('Change tracking initialized');
    } catch (error) {
      this.logger.error('Failed to initialize change tracking', { error });
      throw error;
    }
  }

  /**
   * Initialize MSSQL Change Tracking
   */
  private async initializeMSSQLChangeTracking(): Promise<void> {
    if (this.config.databaseType !== DatabaseType.MSSQL) {
      throw new DatabaseError('MSSQL Change Tracking requires MSSQL database');
    }

    // Check if change tracking is enabled on database
    const dbCheckQuery = `
      SELECT COUNT(*) as enabled
      FROM sys.change_tracking_databases
      WHERE database_id = DB_ID()
    `;

    const result = await this.config.connector.executeQuery<any[]>(dbCheckQuery);

    if (result[0].enabled === 0) {
      this.logger.warn(
        'MSSQL Change Tracking not enabled on database. ' +
        'Run: ALTER DATABASE [DatabaseName] SET CHANGE_TRACKING = ON'
      );
    }

    // Check/enable change tracking on tables
    for (const table of this.config.tables) {
      const tableCheckQuery = `
        SELECT COUNT(*) as enabled
        FROM sys.change_tracking_tables
        WHERE object_id = OBJECT_ID('${table.sourceTable}')
      `;

      const tableResult = await this.config.connector.executeQuery<any[]>(
        tableCheckQuery
      );

      if (tableResult[0].enabled === 0) {
        this.logger.warn(
          `Change tracking not enabled on table ${table.sourceTable}. ` +
          `Run: ALTER TABLE ${table.sourceTable} ENABLE CHANGE_TRACKING`
        );
      }
    }
  }

  /**
   * Initialize MySQL Binary Log tracking
   */
  private async initializeMySQLBinlog(): Promise<void> {
    if (this.config.databaseType !== DatabaseType.MySQL) {
      throw new DatabaseError('MySQL Binlog tracking requires MySQL database');
    }

    // Check if binary logging is enabled
    const result = await this.config.connector.executeQuery<any[]>(
      'SHOW VARIABLES LIKE "log_bin"'
    );

    if (result.length === 0 || result[0].Value !== 'ON') {
      this.logger.warn(
        'MySQL binary logging not enabled. ' +
        'Enable in my.cnf: log-bin=mysql-bin'
      );
    }

    this.logger.info('MySQL binlog tracking initialized');
  }

  /**
   * Initialize PostgreSQL Logical Replication
   */
  private async initializePostgreSQLLogical(): Promise<void> {
    if (this.config.databaseType !== DatabaseType.PostgreSQL) {
      throw new DatabaseError(
        'PostgreSQL Logical Replication requires PostgreSQL database'
      );
    }

    // Check if logical replication is enabled
    const result = await this.config.connector.executeQuery<any[]>(
      "SHOW wal_level"
    );

    if (result[0].wal_level !== 'logical') {
      this.logger.warn(
        'PostgreSQL logical replication not enabled. ' +
        'Set in postgresql.conf: wal_level = logical'
      );
    }

    this.logger.info('PostgreSQL logical replication tracking initialized');
  }

  /**
   * Start tracking changes
   */
  async startTracking(): Promise<void> {
    if (this.isTracking) {
      this.logger.warn('Change tracking already started');
      return;
    }

    this.isTracking = true;
    this.logger.info('Starting change tracking');

    switch (this.config.method) {
      case ChangeTrackingMethod.Timestamp:
      case ChangeTrackingMethod.Polling:
        this.startPolling();
        break;

      case ChangeTrackingMethod.MSSQLChangeTracking:
        this.startMSSQLChangeTracking();
        break;

      case ChangeTrackingMethod.MySQLBinlog:
        this.startMySQLBinlog();
        break;

      case ChangeTrackingMethod.PostgreSQLLogical:
        this.startPostgreSQLLogical();
        break;
    }
  }

  /**
   * Stop tracking changes
   */
  stopTracking(): void {
    if (!this.isTracking) {
      return;
    }

    this.isTracking = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    this.logger.info('Stopped change tracking');
  }

  /**
   * Start polling-based change tracking
   */
  private startPolling(): void {
    const intervalMs = this.config.pollingIntervalMs || 10000; // Default 10 seconds

    this.logger.info('Starting polling-based tracking', { intervalMs });

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollForChanges();
      } catch (error) {
        this.logger.error('Polling failed', { error });
        this.emit('error', error);
      }
    }, intervalMs);

    // Run initial poll
    this.pollForChanges().catch(error => {
      this.logger.error('Initial polling failed', { error });
    });
  }

  /**
   * Poll for changes using timestamp comparison
   */
  private async pollForChanges(): Promise<void> {
    const batchSize = this.config.batchSize || 1000;

    for (const table of this.config.tables) {
      if (!table.enabled) continue;

      const checkpoint = this.checkpoints.get(table.sourceTable);
      if (!checkpoint) continue;

      // Check if table has timestamp column
      if (!table.timestampColumn) {
        this.logger.warn(
          `No timestamp column configured for ${table.sourceTable}, skipping`
        );
        continue;
      }

      try {
        // Query for changes since last sync
        const columns = table.columns?.join(', ') || '*';
        const whereClause = table.whereClause
          ? `AND (${table.whereClause})`
          : '';

        const query = `
          SELECT ${columns}
          FROM ${table.sourceTable}
          WHERE ${table.timestampColumn} > ?
            ${whereClause}
          ORDER BY ${table.timestampColumn}
          LIMIT ${batchSize}
        `;

        const changes = await this.config.connector.executeQuery<any[]>(
          query,
          [checkpoint.lastSyncTime]
        );

        if (changes.length > 0) {
          this.logger.info('Detected changes', {
            table: table.sourceTable,
            count: changes.length
          });

          // Convert to RowChange format
          const rowChanges: RowChange[] = changes.map(row => ({
            type: 'update', // Polling can't distinguish insert/update
            tableName: table.sourceTable,
            primaryKey: this.extractPrimaryKey(row, table.primaryKey || []),
            data: row,
            timestamp: new Date(row[table.timestampColumn!])
          }));

          // Emit changes
          this.emit('changes', rowChanges);

          // Update checkpoint
          const lastChange = changes[changes.length - 1];
          checkpoint.lastSyncTime = new Date(
            lastChange[table.timestampColumn!]
          );
        }
      } catch (error) {
        this.logger.error('Failed to poll table', {
          table: table.sourceTable,
          error
        });
      }
    }
  }

  /**
   * Start MSSQL Change Tracking
   */
  private startMSSQLChangeTracking(): void {
    const intervalMs = this.config.pollingIntervalMs || 5000; // Default 5 seconds

    this.logger.info('Starting MSSQL Change Tracking', { intervalMs });

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollMSSQLChanges();
      } catch (error) {
        this.logger.error('MSSQL change tracking failed', { error });
        this.emit('error', error);
      }
    }, intervalMs);

    // Run initial poll
    this.pollMSSQLChanges().catch(error => {
      this.logger.error('Initial MSSQL polling failed', { error });
    });
  }

  /**
   * Poll MSSQL Change Tracking
   */
  private async pollMSSQLChanges(): Promise<void> {
    for (const table of this.config.tables) {
      if (!table.enabled) continue;

      const checkpoint = this.checkpoints.get(table.sourceTable);
      if (!checkpoint) continue;

      try {
        // Get current change version
        const currentVersionQuery = 'SELECT CHANGE_TRACKING_CURRENT_VERSION() AS version';
        const versionResult = await this.config.connector.executeQuery<any[]>(
          currentVersionQuery
        );
        const currentVersion = versionResult[0].version;

        if (!checkpoint.lastChangeVersion) {
          checkpoint.lastChangeVersion = currentVersion;
          continue;
        }

        // Query for changes
        const primaryKey = table.primaryKey?.join(', ') || 'id';
        const query = `
          SELECT CT.*, T.*
          FROM CHANGETABLE(CHANGES ${table.sourceTable}, ${checkpoint.lastChangeVersion}) AS CT
          LEFT JOIN ${table.sourceTable} AS T
            ON ${table.primaryKey?.map(pk => `CT.${pk} = T.${pk}`).join(' AND ')}
        `;

        const changes = await this.config.connector.executeQuery<any[]>(query);

        if (changes.length > 0) {
          this.logger.info('Detected MSSQL changes', {
            table: table.sourceTable,
            count: changes.length
          });

          // Convert to RowChange format
          const rowChanges: RowChange[] = changes.map(change => {
            const changeType = change.SYS_CHANGE_OPERATION;
            let type: 'insert' | 'update' | 'delete' = 'update';

            if (changeType === 'I') type = 'insert';
            else if (changeType === 'U') type = 'update';
            else if (changeType === 'D') type = 'delete';

            return {
              type,
              tableName: table.sourceTable,
              primaryKey: this.extractPrimaryKey(change, table.primaryKey || []),
              data: type !== 'delete' ? change : undefined
            };
          });

          // Emit changes
          this.emit('changes', rowChanges);

          // Update checkpoint
          checkpoint.lastChangeVersion = currentVersion;
        }
      } catch (error) {
        this.logger.error('Failed to poll MSSQL changes', {
          table: table.sourceTable,
          error
        });
      }
    }
  }

  /**
   * Start MySQL Binary Log tracking
   */
  private startMySQLBinlog(): void {
    this.logger.warn(
      'MySQL binlog tracking requires external library (mysql-binlog-connector). ' +
      'Falling back to polling mode.'
    );
    this.startPolling();
  }

  /**
   * Start PostgreSQL Logical Replication
   */
  private startPostgreSQLLogical(): void {
    this.logger.warn(
      'PostgreSQL logical replication requires pg-logical-replication library. ' +
      'Falling back to polling mode.'
    );
    this.startPolling();
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
   * Get checkpoint for a table
   */
  getCheckpoint(tableName: string): SyncCheckpoint | undefined {
    return this.checkpoints.get(tableName);
  }

  /**
   * Update checkpoint for a table
   */
  updateCheckpoint(tableName: string, checkpoint: Partial<SyncCheckpoint>): void {
    const existing = this.checkpoints.get(tableName);
    if (existing) {
      this.checkpoints.set(tableName, { ...existing, ...checkpoint });
    }
  }

  /**
   * Reset all checkpoints
   */
  resetCheckpoints(): void {
    for (const [tableName, checkpoint] of this.checkpoints) {
      checkpoint.lastSyncTime = new Date();
      checkpoint.lastChangeVersion = undefined;
      checkpoint.lastBinlogPosition = undefined;
      checkpoint.lastLSN = undefined;
    }
    this.logger.info('Reset all checkpoints');
  }
}
