/**
 * Migration types and interfaces
 */

import { DatabaseType, TableSchema, ColumnMetadata } from '../schema/types';

/**
 * Migration direction
 */
export enum MigrationDirection {
  UP = 'up',
  DOWN = 'down'
}

/**
 * Migration operation types
 */
export enum MigrationType {
  CREATE_TABLE = 'CREATE_TABLE',
  DROP_TABLE = 'DROP_TABLE',
  ALTER_TABLE = 'ALTER_TABLE',
  ADD_COLUMN = 'ADD_COLUMN',
  DROP_COLUMN = 'DROP_COLUMN',
  MODIFY_COLUMN = 'MODIFY_COLUMN',
  ADD_INDEX = 'ADD_INDEX',
  DROP_INDEX = 'DROP_INDEX',
  ADD_FOREIGN_KEY = 'ADD_FOREIGN_KEY',
  DROP_FOREIGN_KEY = 'DROP_FOREIGN_KEY',
  RENAME_TABLE = 'RENAME_TABLE',
  RENAME_COLUMN = 'RENAME_COLUMN',
  RAW_SQL = 'RAW_SQL'
}

/**
 * Migration status
 */
export enum MigrationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

/**
 * Migration operation
 */
export interface MigrationOperation {
  type: MigrationType;
  table: string;
  sql: string;
  params?: any[];
  metadata?: Record<string, any>;
}

/**
 * Migration definition
 */
export interface Migration {
  id: string;
  name: string;
  version: string;
  description?: string;
  databaseType: DatabaseType;
  operations: {
    up: MigrationOperation[];
    down: MigrationOperation[];
  };
  createdAt: Date;
  checksum?: string;
}

/**
 * Migration execution record
 */
export interface MigrationRecord {
  id: string;
  migration_id: string;
  version: string;
  name: string;
  status: MigrationStatus;
  executed_at: Date;
  execution_time_ms?: number;
  error_message?: string;
  checksum?: string;
  rolled_back_at?: Date;
}

/**
 * Schema version
 */
export interface SchemaVersion {
  version: string;
  description?: string;
  applied_at: Date;
  applied_by?: string;
  migrations: string[];
  checksum: string;
}

/**
 * Drift detection result
 */
export interface DriftDetectionResult {
  hasDrift: boolean;
  driftType: 'schema' | 'data' | 'both' | 'none';
  changes: DriftChange[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  affectedTables: string[];
}

/**
 * Individual drift change
 */
export interface DriftChange {
  type: 'table_added' | 'table_removed' | 'table_modified' | 'column_added' | 'column_removed' | 'column_modified' | 'constraint_changed' | 'index_changed';
  table: string;
  column?: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expectedValue?: any;
  actualValue?: any;
  autoFixable: boolean;
  fixSuggestion?: string;
}

/**
 * Schema change validation rule
 */
export interface SchemaChangeRule {
  name: string;
  description: string;
  severity: 'warning' | 'error';
  validate: (change: DriftChange) => boolean;
  message: string;
}

/**
 * Migration conflict
 */
export interface MigrationConflict {
  type: 'version' | 'checksum' | 'dependency' | 'operation';
  migration: string;
  description: string;
  resolution?: string;
}

/**
 * Migration plan
 */
export interface MigrationPlan {
  migrations: Migration[];
  totalOperations: number;
  estimatedTime: number;
  risks: MigrationRisk[];
  canRollback: boolean;
}

/**
 * Migration risk
 */
export interface MigrationRisk {
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation?: string;
  affectedTables: string[];
}

/**
 * Schema snapshot
 */
export interface SchemaSnapshot {
  id: string;
  version: string;
  timestamp: Date;
  databaseType: DatabaseType;
  databaseName: string;
  tables: TableSchema[];
  checksum: string;
  metadata?: Record<string, any>;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannel[];
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';
  notifyOnDrift: boolean;
  notifyOnMigration: boolean;
  notifyOnFailure: boolean;
}

/**
 * Alert channel
 */
export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'log';
  config: Record<string, any>;
  enabled: boolean;
}

/**
 * Schema alert
 */
export interface SchemaAlert {
  id: string;
  type: 'drift_detected' | 'migration_failed' | 'migration_completed' | 'validation_failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  acknowledged: boolean;
}
