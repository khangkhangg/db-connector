/**
 * Data Synchronization Types and Configurations
 */

import { DatabaseType } from '../schema/types';

/**
 * Sync direction modes
 */
export enum SyncDirection {
  /** One-way sync from source to target */
  SourceToTarget = 'source_to_target',
  /** One-way sync from target to source */
  TargetToSource = 'target_to_source',
  /** Two-way bidirectional sync */
  Bidirectional = 'bidirectional'
}

/**
 * Sync operation modes
 */
export enum SyncMode {
  /** One-time full sync */
  Once = 'once',
  /** Continuous sync with change tracking */
  Continuous = 'continuous',
  /** Initial clone of data */
  InitialClone = 'initial_clone',
  /** Incremental sync only (no initial clone) */
  Incremental = 'incremental'
}

/**
 * Conflict resolution strategies for bidirectional sync
 */
export enum ConflictStrategy {
  /** Source database wins in conflicts */
  SourceWins = 'source_wins',
  /** Target database wins in conflicts */
  TargetWins = 'target_wins',
  /** Most recently modified record wins */
  LatestWins = 'latest_wins',
  /** Highest value of specified column wins */
  HighestValueWins = 'highest_value_wins',
  /** Manual resolution required */
  Manual = 'manual',
  /** Skip conflicting rows */
  Skip = 'skip'
}

/**
 * Column mapping for different names in source/target
 */
export interface ColumnMapping {
  /** Source column name */
  source: string;
  /** Target column name */
  target: string;
  /** Optional transformation function name */
  transform?: string;
}

/**
 * Table sync configuration
 */
export interface TableSyncConfig {
  /** Source table name */
  sourceTable: string;
  /** Target table name (defaults to sourceTable if not specified) */
  targetTable?: string;
  /** Columns to sync (if empty, sync all columns) */
  columns?: string[];
  /** Column mappings for different names */
  columnMappings?: ColumnMapping[];
  /** WHERE clause to filter rows (e.g., "status = 'active'") */
  whereClause?: string;
  /** Primary key columns (for identifying rows) */
  primaryKey?: string[];
  /** Timestamp column for change tracking */
  timestampColumn?: string;
  /** Batch size for sync operations */
  batchSize?: number;
  /** Enable/disable this table sync */
  enabled?: boolean;
}

/**
 * Database connection configuration for sync
 */
export interface SyncDatabaseConfig {
  /** Database type */
  type: DatabaseType;
  /** Host address */
  host: string;
  /** Port number */
  port: number;
  /** Database name */
  database: string;
  /** Username */
  user: string;
  /** Password */
  password: string;
  /** Enable SSL/TLS */
  ssl?: boolean;
}

/**
 * Complete sync configuration
 */
export interface SyncConfig {
  /** Unique sync job identifier */
  id: string;
  /** Friendly name for this sync */
  name: string;
  /** Source database configuration */
  source: SyncDatabaseConfig;
  /** Target database configuration */
  target: SyncDatabaseConfig;
  /** Sync direction */
  direction: SyncDirection;
  /** Sync mode */
  mode: SyncMode;
  /** Conflict resolution strategy (for bidirectional) */
  conflictStrategy?: ConflictStrategy;
  /** Tables to sync */
  tables: TableSyncConfig[];
  /** Default batch size for all tables */
  defaultBatchSize?: number;
  /** Sync interval in milliseconds (for continuous mode) */
  syncIntervalMs?: number;
  /** Enable detailed logging */
  enableDetailedLogging?: boolean;
  /** Enable dry run (no actual changes) */
  dryRun?: boolean;
  /** Maximum concurrent table syncs */
  maxConcurrency?: number;
  /** Retry configuration */
  retry?: {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Delay between retries in milliseconds */
    delayMs: number;
    /** Exponential backoff multiplier */
    backoffMultiplier?: number;
  };
}

/**
 * Sync operation result
 */
export interface SyncResult {
  /** Sync job ID */
  syncId: string;
  /** Table name */
  tableName: string;
  /** Number of rows inserted */
  inserted: number;
  /** Number of rows updated */
  updated: number;
  /** Number of rows deleted */
  deleted: number;
  /** Number of conflicts detected */
  conflicts: number;
  /** Number of errors */
  errors: number;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
  /** Duration in milliseconds */
  durationMs: number;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Overall sync session result
 */
export interface SyncSessionResult {
  /** Sync job ID */
  syncId: string;
  /** Session start time */
  startTime: Date;
  /** Session end time */
  endTime: Date;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Results for each table */
  tableResults: SyncResult[];
  /** Overall success status */
  success: boolean;
  /** Summary statistics */
  summary: {
    totalTables: number;
    successfulTables: number;
    failedTables: number;
    totalInserted: number;
    totalUpdated: number;
    totalDeleted: number;
    totalConflicts: number;
    totalErrors: number;
  };
}

/**
 * Sync status information
 */
export interface SyncStatus {
  /** Sync job ID */
  syncId: string;
  /** Current status */
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  /** Current table being synced */
  currentTable?: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Last sync timestamp */
  lastSyncTime?: Date;
  /** Next sync timestamp (for continuous mode) */
  nextSyncTime?: Date;
  /** Last sync result */
  lastResult?: SyncSessionResult;
  /** Error message if in error state */
  errorMessage?: string;
}

/**
 * Row change information
 */
export interface RowChange {
  /** Change type */
  type: 'insert' | 'update' | 'delete';
  /** Table name */
  tableName: string;
  /** Primary key values */
  primaryKey: Record<string, any>;
  /** Row data (for insert/update) */
  data?: Record<string, any>;
  /** Old data (for update) */
  oldData?: Record<string, any>;
  /** Timestamp of change */
  timestamp?: Date;
}

/**
 * Conflict information
 */
export interface Conflict {
  /** Table name */
  tableName: string;
  /** Primary key values */
  primaryKey: Record<string, any>;
  /** Source row data */
  sourceData: Record<string, any>;
  /** Target row data */
  targetData: Record<string, any>;
  /** Source modification timestamp */
  sourceTimestamp?: Date;
  /** Target modification timestamp */
  targetTimestamp?: Date;
  /** Conflict resolution strategy used */
  resolution?: ConflictStrategy;
  /** Resolved data (if resolved) */
  resolvedData?: Record<string, any>;
}

/**
 * Sync event types for monitoring
 */
export enum SyncEventType {
  SyncStarted = 'sync_started',
  SyncCompleted = 'sync_completed',
  SyncFailed = 'sync_failed',
  TableSyncStarted = 'table_sync_started',
  TableSyncCompleted = 'table_sync_completed',
  TableSyncFailed = 'table_sync_failed',
  ConflictDetected = 'conflict_detected',
  ConflictResolved = 'conflict_resolved',
  BatchProcessed = 'batch_processed',
  ErrorOccurred = 'error_occurred'
}

/**
 * Sync event data
 */
export interface SyncEvent {
  /** Event type */
  type: SyncEventType;
  /** Sync job ID */
  syncId: string;
  /** Timestamp */
  timestamp: Date;
  /** Event data */
  data: any;
  /** Error information if applicable */
  error?: Error;
}
