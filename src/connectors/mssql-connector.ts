/**
 * Microsoft SQL Server connector implementation
 */

import * as mssql from 'mssql';
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

export class MSSQLConnector extends BaseDatabaseConnector {
  private pool?: mssql.ConnectionPool;

  constructor(config: ConnectionConfig) {
    super(config, DatabaseType.MSSQL);
  }

  /**
   * Connect to MSSQL database
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to MSSQL database...', {
        host: this.config.host,
        database: this.config.database
      });

      const poolConfig: mssql.config = {
        user: this.config.user,
        password: this.config.password,
        server: this.config.host,
        database: this.config.database,
        port: this.config.port,
        connectionTimeout: this.config.connectionTimeout,
        requestTimeout: this.config.requestTimeout,
        pool: {
          min: this.config.pool?.min || 2,
          max: this.config.pool?.max || 10
        },
        options: {
          encrypt: this.config.options?.encrypt ?? true,
          trustServerCertificate: this.config.options?.trustServerCertificate ?? false
        }
      };

      this.pool = await retryWithBackoff(
        () => new mssql.ConnectionPool(poolConfig).connect(),
        3,
        2000
      );

      this.isConnected = true;
      this.logger.info('Successfully connected to MSSQL database');
    } catch (error) {
      this.logger.error('Failed to connect to MSSQL database', { error });
      throw new DatabaseConnectionError(
        `Failed to connect to MSSQL: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Disconnect from MSSQL database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.isConnected = false;
      this.logger.info('Disconnected from MSSQL database');
    }
  }

  /**
   * Test MSSQL connection
   */
  async testConnection(): Promise<boolean> {
    try {
      this.ensureConnected();
      const result = await this.pool!.request().query('SELECT 1 AS test');
      return result.recordset[0].test === 1;
    } catch (error) {
      this.logger.error('Connection test failed', { error });
      return false;
    }
  }

  /**
   * Get MSSQL server version
   */
  async getServerVersion(): Promise<string> {
    this.ensureConnected();
    const result = await this.pool!.request().query('SELECT @@VERSION AS version');
    return result.recordset[0].version;
  }

  /**
   * Execute raw query
   */
  async executeQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
    this.ensureConnected();
    const request = this.pool!.request();

    if (params) {
      params.forEach((param, index) => {
        request.input(`param${index}`, param);
      });
    }

    const result = await request.query(query);
    return result.recordset as T[];
  }

  /**
   * List all tables in database
   */
  async listTables(includeSystemTables: boolean = false): Promise<string[]> {
    this.ensureConnected();

    const query = `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ${!includeSystemTables ? "AND TABLE_SCHEMA != 'sys'" : ''}
      ORDER BY TABLE_NAME
    `;

    const result = await this.executeQuery<{ TABLE_NAME: string }>(query);
    return result.map(row => row.TABLE_NAME);
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

      return {
        name: tableName,
        database: this.config.database,
        schema: 'dbo',
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
      this.logger.info('Reading MSSQL database schema...');

      const tables = await this.listTables(options?.includeSystemTables);
      const filteredTables = this.filterTables(tables, options);

      const tableSchemas = await Promise.all(
        filteredTables.map(tableName => this.readTableSchema(tableName))
      );

      const serverVersion = await this.getServerVersion();

      const schema: DatabaseSchema = {
        databaseType: DatabaseType.MSSQL,
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
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.IS_NULLABLE,
        c.CHARACTER_MAXIMUM_LENGTH,
        c.NUMERIC_PRECISION,
        c.NUMERIC_SCALE,
        c.COLUMN_DEFAULT,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = @param0
      ORDER BY c.ORDINAL_POSITION
    `;

    const result = await this.executeQuery(query, [tableName]);

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
      isAutoIncrement: row.IS_IDENTITY === 1,
      defaultValue: row.COLUMN_DEFAULT
    }));
  }

  /**
   * Read primary keys for a table
   */
  private async readPrimaryKeys(tableName: string): Promise<string[]> {
    const query = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
      AND TABLE_NAME = @param0
      ORDER BY ORDINAL_POSITION
    `;

    const result = await this.executeQuery(query, [tableName]);
    return result.map((row: any) => row.COLUMN_NAME);
  }

  /**
   * Read foreign keys for a table
   */
  private async readForeignKeys(tableName: string): Promise<ForeignKeyConstraint[]> {
    const query = `
      SELECT
        fk.name AS FK_NAME,
        COL_NAME(fc.parent_object_id, fc.parent_column_id) AS COLUMN_NAME,
        OBJECT_NAME(fk.referenced_object_id) AS REFERENCED_TABLE,
        COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS REFERENCED_COLUMN,
        fk.delete_referential_action_desc AS DELETE_ACTION,
        fk.update_referential_action_desc AS UPDATE_ACTION
      FROM sys.foreign_keys AS fk
      INNER JOIN sys.foreign_key_columns AS fc
        ON fk.object_id = fc.constraint_object_id
      WHERE OBJECT_NAME(fk.parent_object_id) = @param0
    `;

    const result = await this.executeQuery(query, [tableName]);

    return result.map((row: any) => ({
      name: row.FK_NAME,
      columnName: row.COLUMN_NAME,
      referencedTable: row.REFERENCED_TABLE,
      referencedColumn: row.REFERENCED_COLUMN,
      onDelete: this.mapReferentialAction(row.DELETE_ACTION),
      onUpdate: this.mapReferentialAction(row.UPDATE_ACTION)
    }));
  }

  /**
   * Read indexes for a table
   */
  private async readIndexes(tableName: string): Promise<IndexInfo[]> {
    const query = `
      SELECT
        i.name AS INDEX_NAME,
        i.is_unique AS IS_UNIQUE,
        i.is_primary_key AS IS_PRIMARY,
        COL_NAME(ic.object_id, ic.column_id) AS COLUMN_NAME
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      WHERE i.object_id = OBJECT_ID(@param0) AND i.name IS NOT NULL
      ORDER BY i.name, ic.key_ordinal
    `;

    const result = await this.executeQuery(query, [tableName]);

    // Group columns by index name
    const indexMap = new Map<string, IndexInfo>();

    result.forEach((row: any) => {
      const indexName = row.INDEX_NAME;

      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, {
          name: indexName,
          columns: [],
          isUnique: row.IS_UNIQUE,
          isPrimary: row.IS_PRIMARY
        });
      }

      indexMap.get(indexName)!.columns.push(row.COLUMN_NAME);
    });

    return Array.from(indexMap.values());
  }

  /**
   * Map MSSQL data types to standard types
   */
  private mapToStandardType(mssqlType: string): StandardDataType {
    const typeMap: Record<string, StandardDataType> = {
      'tinyint': StandardDataType.TINYINT,
      'smallint': StandardDataType.SMALLINT,
      'int': StandardDataType.INT,
      'bigint': StandardDataType.BIGINT,
      'decimal': StandardDataType.DECIMAL,
      'numeric': StandardDataType.NUMERIC,
      'float': StandardDataType.FLOAT,
      'real': StandardDataType.REAL,
      'char': StandardDataType.CHAR,
      'varchar': StandardDataType.VARCHAR,
      'text': StandardDataType.TEXT,
      'nchar': StandardDataType.NCHAR,
      'nvarchar': StandardDataType.NVARCHAR,
      'ntext': StandardDataType.NTEXT,
      'binary': StandardDataType.BINARY,
      'varbinary': StandardDataType.VARBINARY,
      'date': StandardDataType.DATE,
      'time': StandardDataType.TIME,
      'datetime': StandardDataType.DATETIME,
      'datetime2': StandardDataType.DATETIME2,
      'bit': StandardDataType.BIT,
      'uniqueidentifier': StandardDataType.UUID,
      'xml': StandardDataType.XML
    };

    return typeMap[mssqlType.toLowerCase()] || StandardDataType.UNKNOWN;
  }

  /**
   * Map referential action descriptions
   */
  private mapReferentialAction(action: string): ForeignKeyConstraint['onDelete'] {
    const actionMap: Record<string, ForeignKeyConstraint['onDelete']> = {
      'CASCADE': 'CASCADE',
      'SET_NULL': 'SET NULL',
      'NO_ACTION': 'NO ACTION',
      'RESTRICT': 'RESTRICT',
      'SET_DEFAULT': 'SET DEFAULT'
    };

    return actionMap[action] || 'NO ACTION';
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
