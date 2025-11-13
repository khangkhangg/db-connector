/**
 * Factory for creating database connectors
 */

import { BaseDatabaseConnector } from './base-connector';
import { MSSQLConnector } from './mssql-connector';
import { MySQLConnector } from './mysql-connector';
import { PostgreSQLConnector } from './postgresql-connector';
import { ConnectionConfig, DatabaseType } from '../schema/types';
import { ConfigurationError } from '../utils/error-handler';

/**
 * Create a database connector based on type
 */
export function createConnector(
  databaseType: DatabaseType | string,
  config: ConnectionConfig
): BaseDatabaseConnector {
  // Normalize to DatabaseType enum if string
  const normalizedType = typeof databaseType === 'string'
    ? databaseType.toLowerCase()
    : databaseType;

  switch (normalizedType) {
    case DatabaseType.MSSQL:
    case 'mssql':
      return new MSSQLConnector(config);
    case DatabaseType.MySQL:
    case 'mysql':
      return new MySQLConnector(config);
    case DatabaseType.PostgreSQL:
    case 'postgresql':
      return new PostgreSQLConnector(config);
    default:
      throw new ConfigurationError(
        `Unsupported database type: ${databaseType}`,
        { databaseType }
      );
  }
}

/**
 * Create and connect a database connector
 */
export async function createAndConnectConnector(
  databaseType: DatabaseType,
  config: ConnectionConfig
): Promise<BaseDatabaseConnector> {
  const connector = createConnector(databaseType, config);
  await connector.connect();
  return connector;
}
