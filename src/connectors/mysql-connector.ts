/**
 * MySQL connector implementation
 */

import * as mysql from 'mysql2/promise';
import { BaseDatabaseConnector } from './base-connector';
import {
  ConnectionConfig,
  DatabaseSchema,
  DatabaseType,
  SchemaReadOptions,
  TableSchema,
  ColumnMetadata,
  ForeignKeyConstraint,
  IndexInfo,
  StandardDataType
} from '../schema/types';
import { DatabaseConnectionError, SchemaReadError } from '../utils/error-handler';
import { retryWithBackoff } from '../utils/error-handler';

export class MySQLConnector extends BaseDatabaseConnector {
  private pool?: mysql.Pool;

  constructor(config: ConnectionConfig) {
    super(config, DatabaseType.MySQL);
  }

  /**
   * Connect to MySQL database
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to MySQL database...', {
        host: this.config.host,
        database: this.config.database
      });

      const poolConfig: mysql.PoolOptions = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.config.pool?.max || 10,
        connectTimeout: this.config.connectionTimeout || 10000,
        waitForConnections: true,
        queueLimit: 0
      };

      this.pool = await retryWithBackoff(
        async () => {
          const pool = mysql.createPool(poolConfig);
          // Test the connection
          await pool.query('SELECT 1');
          return pool;
        },
        3,
        2000
      );

      this.isConnected = true;
      this.logger.info('Successfully connected to MySQL database');
    } catch (error) {
      this.logger.error('Failed to connect to MySQL database', { error });
      throw new DatabaseConnectionError(
        `Failed to connect to MySQL: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Disconnect from MySQL database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      this.logger.info('Disconnected from MySQL database');
    }
  }

  /**
   * Test MySQL connection
   */
  async testConnection(): Promise<boolean> {
    try {
      this.ensureConnected();
      const [rows] = await this.pool!.query('SELECT 1 AS test');
      return Array.isArray(rows) && (rows as any[])[0].test === 1;
    } catch (error) {
      this.logger.error('Connection test failed', { error });
      return false;
    }
  }

  /**
   * Get MySQL server version
   */
  async getServerVersion(): Promise<string> {
    this.ensureConnected();
    const [rows] = await this.pool!.query('SELECT VERSION() AS version');
    return (rows as any[])[0].version;
  }

  /**
   * Execute raw query
   */
  async executeQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
    this.ensureConnected();
    const [rows] = await this.pool!.query(query, params);
    return rows as T[];
  }

  /**
   * List all tables in database
   */
  async listTables(includeSystemTables: boolean = false): Promise<string[]> {
    this.ensureConnected();

    const query = includeSystemTables
      ? 'SHOW TABLES'
      : `SHOW TABLES WHERE Tables_in_${this.config.database} NOT LIKE 'mysql_%'`;

    const rows = await this.executeQuery(query);
    return rows.map((row: any) => Object.values(row)[0] as string);
  }

  /**
   * Read schema for specific table
   */
  async readTableSchema(tableName: string): Promise<TableSchema> {
    this.ensureConnected();

    try {
      const [columns, primaryKeys, foreignKeys, indexes] = await Promise.all([
        this.readTableColumns(tableName),
        this.readPrimaryKeys(tableName),
        this.readForeignKeys(tableName),
        this.readIndexes(tableName)
      ]);

      // Mark primary key columns
      columns.forEach(col => {
        col.isPrimaryKey = primaryKeys.includes(col.name);
      });

      // Mark foreign key columns
      const fkColumns = new Set(foreignKeys.map(fk => fk.columnName));
      columns.forEach(col => {
        col.isForeignKey = fkColumns.has(col.name);
      });

      return {
        name: tableName,
        database: this.config.database,
        columns,
        primaryKey: primaryKeys,
        foreignKeys,
        indexes
      };
    } catch (error) {
      throw new SchemaReadError(
        `Failed to read schema for table ${tableName}: ${(error as Error).message}`,
        { tableName, error }
      );
    }
  }

  /**
   * Read complete database schema
   */
  async readSchema(options?: SchemaReadOptions): Promise<DatabaseSchema> {
    this.ensureConnected();

    try {
      this.logger.info('Reading MySQL database schema...');

      const tables = await this.listTables(options?.includeSystemTables);
      const filteredTables = this.filterTables(tables, options);

      const tableSchemas = await Promise.all(
        filteredTables.map(tableName => this.readTableSchema(tableName))
      );

      const serverVersion = await this.getServerVersion();

      const schema: DatabaseSchema = {
        databaseType: DatabaseType.MySQL,
        databaseName: this.config.database,
        serverVersion,
        tables: tableSchemas,
        version: '1.0.0',
        timestamp: new Date()
      };

      this.logger.info('Schema reading completed', {
        tableCount: tableSchemas.length
      });

      return schema;
    } catch (error) {
      throw new SchemaReadError(
        `Failed to read database schema: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Read columns for a specific table
   */
  private async readTableColumns(tableName: string): Promise<ColumnMetadata[]> {
    const query = `
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        COLUMN_DEFAULT,
        EXTRA,
        COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;

    const result = await this.executeQuery(query, [this.config.database, tableName]);

    return result.map((row: any) => ({
      name: row.COLUMN_NAME,
      dataType: row.DATA_TYPE,
      standardType: this.mapToStandardType(row.DATA_TYPE),
      nullable: row.IS_NULLABLE === 'YES',
      maxLength: row.CHARACTER_MAXIMUM_LENGTH,
      precision: row.NUMERIC_PRECISION,
      scale: row.NUMERIC_SCALE,
      isPrimaryKey: false, // Will be set later
      isForeignKey: false, // Will be set later
      isAutoIncrement: row.EXTRA?.includes('auto_increment') || false,
      defaultValue: row.COLUMN_DEFAULT,
      comment: row.COLUMN_COMMENT || undefined
    }));
  }

  /**
   * Read primary keys for a table
   */
  private async readPrimaryKeys(tableName: string): Promise<string[]> {
    const query = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION
    `;

    const result = await this.executeQuery(query, [this.config.database, tableName]);
    return result.map((row: any) => row.COLUMN_NAME);
  }

  /**
   * Read foreign keys for a table
   */
  private async readForeignKeys(tableName: string): Promise<ForeignKeyConstraint[]> {
    const query = `
      SELECT
        kcu.CONSTRAINT_NAME AS FK_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.REFERENCED_COLUMN_NAME,
        rc.DELETE_RULE,
        rc.UPDATE_RULE
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      INNER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      WHERE kcu.TABLE_SCHEMA = ?
      AND kcu.TABLE_NAME = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    `;

    const result = await this.executeQuery(query, [this.config.database, tableName]);

    return result.map((row: any) => ({
      name: row.FK_NAME,
      columnName: row.COLUMN_NAME,
      referencedTable: row.REFERENCED_TABLE_NAME,
      referencedColumn: row.REFERENCED_COLUMN_NAME,
      onDelete: this.mapReferentialAction(row.DELETE_RULE),
      onUpdate: this.mapReferentialAction(row.UPDATE_RULE)
    }));
  }

  /**
   * Read indexes for a table
   */
  private async readIndexes(tableName: string): Promise<IndexInfo[]> {
    const query = `
      SELECT
        INDEX_NAME,
        NON_UNIQUE,
        COLUMN_NAME,
        INDEX_TYPE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;

    const result = await this.executeQuery(query, [this.config.database, tableName]);

    // Group columns by index name
    const indexMap = new Map<string, IndexInfo>();

    result.forEach((row: any) => {
      const indexName = row.INDEX_NAME;

      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, {
          name: indexName,
          columns: [],
          isUnique: row.NON_UNIQUE === 0,
          isPrimary: indexName === 'PRIMARY',
          type: row.INDEX_TYPE
        });
      }

      indexMap.get(indexName)!.columns.push(row.COLUMN_NAME);
    });

    return Array.from(indexMap.values());
  }

  /**
   * Map MySQL data types to standard types
   */
  private mapToStandardType(mysqlType: string): StandardDataType {
    const typeMap: Record<string, StandardDataType> = {
      'tinyint': StandardDataType.TINYINT,
      'smallint': StandardDataType.SMALLINT,
      'mediumint': StandardDataType.INT,
      'int': StandardDataType.INT,
      'integer': StandardDataType.INT,
      'bigint': StandardDataType.BIGINT,
      'decimal': StandardDataType.DECIMAL,
      'numeric': StandardDataType.NUMERIC,
      'float': StandardDataType.FLOAT,
      'double': StandardDataType.DOUBLE,
      'real': StandardDataType.REAL,
      'char': StandardDataType.CHAR,
      'varchar': StandardDataType.VARCHAR,
      'text': StandardDataType.TEXT,
      'tinytext': StandardDataType.TEXT,
      'mediumtext': StandardDataType.TEXT,
      'longtext': StandardDataType.TEXT,
      'binary': StandardDataType.BINARY,
      'varbinary': StandardDataType.VARBINARY,
      'blob': StandardDataType.BLOB,
      'tinyblob': StandardDataType.BLOB,
      'mediumblob': StandardDataType.BLOB,
      'longblob': StandardDataType.BLOB,
      'date': StandardDataType.DATE,
      'time': StandardDataType.TIME,
      'datetime': StandardDataType.DATETIME,
      'timestamp': StandardDataType.TIMESTAMP,
      'year': StandardDataType.SMALLINT,
      'boolean': StandardDataType.BOOLEAN,
      'bool': StandardDataType.BOOLEAN,
      'bit': StandardDataType.BIT,
      'json': StandardDataType.JSON,
      'enum': StandardDataType.VARCHAR,
      'set': StandardDataType.VARCHAR
    };

    return typeMap[mysqlType.toLowerCase()] || StandardDataType.UNKNOWN;
  }

  /**
   * Map referential action
   */
  private mapReferentialAction(action: string): ForeignKeyConstraint['onDelete'] {
    const actionMap: Record<string, ForeignKeyConstraint['onDelete']> = {
      'CASCADE': 'CASCADE',
      'SET NULL': 'SET NULL',
      'NO ACTION': 'NO ACTION',
      'RESTRICT': 'RESTRICT',
      'SET DEFAULT': 'SET DEFAULT'
    };

    return actionMap[action.toUpperCase()] || 'NO ACTION';
  }

  /**
   * Filter tables based on options
   */
  private filterTables(tables: string[], options?: SchemaReadOptions): string[] {
    if (!options) return tables;

    let filtered = tables;

    if (options.includeTables && options.includeTables.length > 0) {
      filtered = filtered.filter(table => options.includeTables!.includes(table));
    }

    if (options.excludeTables && options.excludeTables.length > 0) {
      filtered = filtered.filter(table => !options.excludeTables!.includes(table));
    }

    return filtered;
  }
}
