/**
 * Configuration loader and validator
 */

import * as dotenv from 'dotenv';
import * as Joi from 'joi';
import { ConnectionConfig, RemoteSyncConfig, DatabaseType } from '../schema/types';

// Load environment variables
dotenv.config();

/**
 * Configuration schema validation
 */
const configSchema = Joi.object({
  // Node environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),

  LOG_FORMAT: Joi.string()
    .valid('json', 'console')
    .default('console'),

  // MSSQL Configuration
  MSSQL_HOST: Joi.string(),
  MSSQL_PORT: Joi.number().default(1433),
  MSSQL_DATABASE: Joi.string(),
  MSSQL_USER: Joi.string(),
  MSSQL_PASSWORD: Joi.string(),
  MSSQL_ENCRYPT: Joi.boolean().default(true),
  MSSQL_TRUST_SERVER_CERTIFICATE: Joi.boolean().default(false),

  // MySQL Configuration
  MYSQL_HOST: Joi.string(),
  MYSQL_PORT: Joi.number().default(3306),
  MYSQL_DATABASE: Joi.string(),
  MYSQL_USER: Joi.string(),
  MYSQL_PASSWORD: Joi.string(),

  // Remote API Configuration
  REMOTE_API_ENDPOINT: Joi.string().uri(),
  REMOTE_API_KEY: Joi.string(),
  REMOTE_API_TIMEOUT: Joi.number().default(30000),
  REMOTE_RETRY_ATTEMPTS: Joi.number().default(3),
  REMOTE_RETRY_DELAY: Joi.number().default(5000),

  // Connection Pool Configuration
  CONNECTION_POOL_MIN: Joi.number().default(2),
  CONNECTION_POOL_MAX: Joi.number().default(10),
  CONNECTION_TIMEOUT: Joi.number().default(10000),
  REQUEST_TIMEOUT: Joi.number().default(30000),

  // Schema Sync Configuration
  SYNC_INTERVAL_MS: Joi.number().default(300000),
  ENABLE_AUTO_SYNC: Joi.boolean().default(false),
  SCHEMA_VERSION_TRACKING: Joi.boolean().default(true)
});

/**
 * Validate and load configuration
 */
function loadConfig() {
  const { error, value } = configSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: false
  });

  if (error) {
    throw new Error(`Configuration validation error: ${error.message}`);
  }

  return value;
}

const config = loadConfig();

/**
 * Get MSSQL connection configuration
 */
export function getMSSQLConfig(): ConnectionConfig {
  return {
    host: config.MSSQL_HOST,
    port: config.MSSQL_PORT,
    database: config.MSSQL_DATABASE,
    user: config.MSSQL_USER,
    password: config.MSSQL_PASSWORD,
    connectionTimeout: config.CONNECTION_TIMEOUT,
    requestTimeout: config.REQUEST_TIMEOUT,
    pool: {
      min: config.CONNECTION_POOL_MIN,
      max: config.CONNECTION_POOL_MAX
    },
    options: {
      encrypt: config.MSSQL_ENCRYPT,
      trustServerCertificate: config.MSSQL_TRUST_SERVER_CERTIFICATE
    }
  };
}

/**
 * Get MySQL connection configuration
 */
export function getMySQLConfig(): ConnectionConfig {
  return {
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    database: config.MYSQL_DATABASE,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    connectionTimeout: config.CONNECTION_TIMEOUT,
    requestTimeout: config.REQUEST_TIMEOUT,
    pool: {
      min: config.CONNECTION_POOL_MIN,
      max: config.CONNECTION_POOL_MAX
    }
  };
}

/**
 * Get remote sync configuration
 */
export function getRemoteSyncConfig(): RemoteSyncConfig {
  return {
    endpoint: config.REMOTE_API_ENDPOINT,
    apiKey: config.REMOTE_API_KEY,
    timeout: config.REMOTE_API_TIMEOUT,
    retryAttempts: config.REMOTE_RETRY_ATTEMPTS,
    retryDelay: config.REMOTE_RETRY_DELAY
  };
}

/**
 * Get database connection configuration by type
 */
export function getConnectionConfig(dbType: DatabaseType): ConnectionConfig {
  switch (dbType) {
    case DatabaseType.MSSQL:
      return getMSSQLConfig();
    case DatabaseType.MySQL:
      return getMySQLConfig();
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

export default config;
