/**
 * PostgreSQL Database Connector
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { BaseDatabaseConnector } from './base-connector';
import {
  DatabaseSchema,
  TableSchema,
  ColumnMetadata,
  SchemaReadOptions,
  DatabaseType
} from '../schema/types';
import { DatabaseError } from '../utils/error-handler';

/**
 * PostgreSQL connector implementation
 */
export class PostgreSQLConnector extends BaseDatabaseConnector {
  private pool!: Pool;
  protected override databaseType: DatabaseType = DatabaseType.PostgreSQL;

  /**
   * Connect to PostgreSQL database
   */
  async connect(): Promise<void> {
    try {
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: this.config.ssl ? {
          rejectUnauthorized: false
        } : false
      };

      this.pool = new Pool(poolConfig);

      // Test connection
      const client = await this.pool.connect();
      client.release();

      this.logger.info('Connected to PostgreSQL database', {
        host: this.config.host,
        database: this.config.database
      });
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL', { error });
      throw new DatabaseError(`PostgreSQL connection failed: ${error}`);
    }
  }

  /**
   * Disconnect from PostgreSQL database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.info('Disconnected from PostgreSQL database');
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1 as test');
      return result.rows[0].test === 1;
    } catch (error) {
      this.logger.error('Connection test failed', { error });
      return false;
    }
  }

  /**
   * List all tables in database
   */
  async listTables(options?: SchemaReadOptions): Promise<string[]> {
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const result = await this.pool.query(query);
    let tables = result.rows.map(row => row.table_name);

    // Apply filters
    if (options?.excludeTables) {
      tables = tables.filter(table =>
        !options.excludeTables!.some(pattern =>
          new RegExp(pattern.replace('*', '.*')).test(table)
        )
      );
    }

    return tables;
  }

  /**
   * Read complete database schema
   */
  async readSchema(options?: SchemaReadOptions): Promise<DatabaseSchema> {
    try {
      const tables = await this.listTables(options);
      const tableSchemas: TableSchema[] = [];

      for (const tableName of tables) {
        const tableSchema = await this.readTableSchema(tableName);
        tableSchemas.push(tableSchema);
      }

      return {
        databaseName: this.config.database!,
        databaseType: DatabaseType.PostgreSQL,
        tables: tableSchemas,
        views: [],
        version: '1.0.0'
      };
    } catch (error) {
      this.logger.error('Failed to read PostgreSQL schema', { error });
      throw new DatabaseError(`Failed to read schema: ${error}`);
    }
  }

  /**
   * Read schema for a specific table
   */
  async readTableSchema(tableName: string): Promise<TableSchema> {
    const columns = await this.getColumns(tableName);
    const primaryKey = await this.getPrimaryKey(tableName);
    const foreignKeys = await this.getForeignKeys(tableName);
    const indexes = await this.getIndexes(tableName);

    return {
      tableName,
      columns,
      primaryKey,
      foreignKeys,
      indexes,
      constraints: []
    };
  }

  /**
   * Get column information for a table
   */
  private async getColumns(tableName: string): Promise<ColumnMetadata[]> {
    const query = `
      SELECT
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        c.ordinal_position
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position
    `;

    const result = await this.pool.query(query, [tableName]);

    return result.rows.map(row => ({
      name: row.column_name,
      dataType: this.mapPostgreSQLType(row.data_type),
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      isIdentity: row.column_default?.includes('nextval'),
      isPrimaryKey: false, // Will be set later
      isForeignKey: false,
      ordinalPosition: row.ordinal_position
    }));
  }

  /**
   * Get primary key information
   */
  private async getPrimaryKey(tableName: string): Promise<string[]> {
    const query = `
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass
        AND i.indisprimary
    `;

    const result = await this.pool.query(query, [tableName]);
    return result.rows.map(row => row.attname);
  }

  /**
   * Get foreign key information
   */
  private async getForeignKeys(tableName: string): Promise<any[]> {
    const query = `
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `;

    const result = await this.pool.query(query, [tableName]);

    return result.rows.map(row => ({
      name: row.constraint_name,
      columnName: row.column_name,
      referencedTable: row.foreign_table_name,
      referencedColumn: row.foreign_column_name
    }));
  }

  /**
   * Get index information
   */
  private async getIndexes(tableName: string): Promise<any[]> {
    const query = `
      SELECT
        i.relname AS index_name,
        a.attname AS column_name,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relkind = 'r'
        AND t.relname = $1
        AND NOT ix.indisprimary
      ORDER BY i.relname, a.attnum
    `;

    const result = await this.pool.query(query, [tableName]);

    return result.rows.map(row => ({
      name: row.index_name,
      columnName: row.column_name,
      isUnique: row.is_unique
    }));
  }

  /**
   * Execute a query
   */
  async executeQuery<T>(query: string, params?: any[]): Promise<T> {
    try {
      const result = await this.pool.query(query, params);
      return result.rows as T;
    } catch (error) {
      this.logger.error('Query execution failed', { query, error });
      throw new DatabaseError(`Query failed: ${error}`);
    }
  }

  /**
   * Execute query in transaction
   */
  async executeInTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Map PostgreSQL data types to standard types
   */
  private mapPostgreSQLType(pgType: string): string {
    const typeMap: { [key: string]: string } = {
      'integer': 'INT',
      'bigint': 'BIGINT',
      'smallint': 'SMALLINT',
      'numeric': 'DECIMAL',
      'real': 'FLOAT',
      'double precision': 'DOUBLE',
      'character varying': 'VARCHAR',
      'character': 'CHAR',
      'text': 'TEXT',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'timestamp without time zone': 'DATETIME',
      'timestamp with time zone': 'TIMESTAMP',
      'time without time zone': 'TIME',
      'uuid': 'UUID',
      'json': 'JSON',
      'jsonb': 'JSON',
      'bytea': 'BLOB'
    };

    return typeMap[pgType.toLowerCase()] || pgType.toUpperCase();
  }

  /**
   * Get row count for a table
   */
  async getRowCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${tableName}`
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Batch insert rows
   */
  async batchInsert(
    tableName: string,
    columns: string[],
    rows: any[][]
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const placeholders = rows.map((_, i) => {
      const start = i * columns.length;
      const params = columns.map((_, j) => `$${start + j + 1}`).join(', ');
      return `(${params})`;
    }).join(', ');

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders}
    `;

    const flatParams = rows.flat();
    await this.pool.query(query, flatParams);

    return rows.length;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount
    };
  }
}
