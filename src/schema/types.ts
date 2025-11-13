/**
 * Core type definitions for database schema representation
 */

/**
 * Supported database types
 */
export enum DatabaseType {
  MSSQL = 'mssql',
  MySQL = 'mysql',
  PostgreSQL = 'postgresql'
}

/**
 * Standard data types for schema mapping
 */
export enum StandardDataType {
  // Numeric types
  TINYINT = 'TINYINT',
  SMALLINT = 'SMALLINT',
  INT = 'INT',
  BIGINT = 'BIGINT',
  DECIMAL = 'DECIMAL',
  NUMERIC = 'NUMERIC',
  FLOAT = 'FLOAT',
  REAL = 'REAL',
  DOUBLE = 'DOUBLE',

  // String types
  CHAR = 'CHAR',
  VARCHAR = 'VARCHAR',
  TEXT = 'TEXT',
  NCHAR = 'NCHAR',
  NVARCHAR = 'NVARCHAR',
  NTEXT = 'NTEXT',

  // Binary types
  BINARY = 'BINARY',
  VARBINARY = 'VARBINARY',
  BLOB = 'BLOB',

  // Date/Time types
  DATE = 'DATE',
  TIME = 'TIME',
  DATETIME = 'DATETIME',
  DATETIME2 = 'DATETIME2',
  TIMESTAMP = 'TIMESTAMP',

  // Boolean
  BOOLEAN = 'BOOLEAN',
  BIT = 'BIT',

  // Special types
  UUID = 'UUID',
  JSON = 'JSON',
  XML = 'XML',

  // Unknown
  UNKNOWN = 'UNKNOWN'
}

/**
 * Foreign key constraint information
 */
export interface ForeignKeyConstraint {
  name: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT' | 'SET DEFAULT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT' | 'SET DEFAULT';
}

/**
 * Index information
 */
export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  type?: string;
}

/**
 * Column metadata
 */
export interface ColumnMetadata {
  name: string;
  dataType: string;
  standardType: StandardDataType;
  nullable: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isAutoIncrement: boolean;
  defaultValue?: any;
  comment?: string;
}

/**
 * Table schema representation
 */
export interface TableSchema {
  name: string;
  database: string;
  schema?: string; // For databases that support schemas (MSSQL: dbo, etc.)
  columns: ColumnMetadata[];
  primaryKey: string[];
  foreignKeys: ForeignKeyConstraint[];
  indexes: IndexInfo[];
  rowCount?: number;
  comment?: string;
}

/**
 * Complete database schema
 */
export interface DatabaseSchema {
  databaseType: DatabaseType;
  databaseName: string;
  serverVersion?: string;
  tables: TableSchema[];
  version: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Schema comparison result
 */
export interface SchemaComparison {
  tablesAdded: string[];
  tablesRemoved: string[];
  tablesModified: TableComparison[];
  isIdentical: boolean;
}

/**
 * Table comparison result
 */
export interface TableComparison {
  tableName: string;
  columnsAdded: ColumnMetadata[];
  columnsRemoved: ColumnMetadata[];
  columnsModified: ColumnComparison[];
  foreignKeysChanged: boolean;
  indexesChanged: boolean;
}

/**
 * Column comparison result
 */
export interface ColumnComparison {
  columnName: string;
  changes: {
    property: string;
    oldValue: any;
    newValue: any;
  }[];
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  pool?: {
    min: number;
    max: number;
  };
  options?: Record<string, any>;
}

/**
 * Schema reading options
 */
export interface SchemaReadOptions {
  includeTables?: string[];
  excludeTables?: string[];
  includeSystemTables?: boolean;
  includeRowCounts?: boolean;
  includeComments?: boolean;
}

/**
 * Schema mapping options
 */
export interface SchemaMappingOptions {
  targetDatabaseType: DatabaseType;
  preserveCase?: boolean;
  customTypeMapping?: Record<string, StandardDataType>;
  includeConstraints?: boolean;
  includeIndexes?: boolean;
}

/**
 * Remote sync configuration
 */
export interface RemoteSyncConfig {
  endpoint: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Schema sync result
 */
export interface SchemaSyncResult {
  success: boolean;
  message: string;
  schemaVersion?: string;
  timestamp: Date;
  errors?: Error[];
}
