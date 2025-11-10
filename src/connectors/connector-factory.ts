/**
 * Factory for creating database connectors
 */

import { BaseDatabaseConnector } from './base-connector';
import { MSSQLConnector } from './mssql-connector';
import { MySQLConnector } from './mysql-connector';
import { ConnectionConfig, DatabaseType } from '../schema/types';
import { ConfigurationError } from '../utils/error-handler';

/**
 * Create a database connector based on type
 */
export function createConnector(
  databaseType: DatabaseType,
  config: ConnectionConfig
): BaseDatabaseConnector {
  switch (databaseType) {
    case DatabaseType.MSSQL:
      return new MSSQLConnector(config);
    case DatabaseType.MySQL:
      return new MySQLConnector(config);
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
