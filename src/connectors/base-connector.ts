/**
 * Abstract base class for database connectors
 */

import {
  ConnectionConfig,
  DatabaseSchema,
  DatabaseType,
  SchemaReadOptions,
  TableSchema
} from '../schema/types';
import { createLogger } from '../utils/logger';
import { DatabaseConnectionError } from '../utils/error-handler';

export abstract class BaseDatabaseConnector {
  protected logger = createLogger(this.constructor.name);
  protected isConnected: boolean = false;

  constructor(
    protected config: ConnectionConfig,
    protected databaseType: DatabaseType
  ) {}

  /**
   * Establish database connection
   */
  abstract connect(): Promise<void>;

  /**
   * Close database connection
   */
  abstract disconnect(): Promise<void>;

  /**
   * Test database connection
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Read complete database schema
   */
  abstract readSchema(options?: SchemaReadOptions): Promise<DatabaseSchema>;

  /**
   * Read schema for specific table
   */
  abstract readTableSchema(tableName: string): Promise<TableSchema>;

  /**
   * Get list of all tables in database
   */
  abstract listTables(includeSystemTables?: boolean): Promise<string[]>;

  /**
   * Get database server version
   */
  abstract getServerVersion(): Promise<string>;

  /**
   * Execute a raw query (for advanced operations)
   */
  abstract executeQuery<T = any>(query: string, params?: any[]): Promise<T[]>;

  /**
   * Ensure connection is established
   */
  protected ensureConnected(): void {
    if (!this.isConnected) {
      throw new DatabaseConnectionError(
        'Database not connected. Call connect() first.'
      );
    }
  }

  /**
   * Get database type
   */
  getDatabaseType(): DatabaseType {
    return this.databaseType;
  }

  /**
   * Get connection configuration (sanitized, without password)
   */
  getConnectionInfo(): Partial<ConnectionConfig> {
    const { password, ...safeConfig } = this.config;
    return safeConfig;
  }
}
