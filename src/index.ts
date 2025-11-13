/**
 * DB Schema Mapper Connector - Main Entry Point
 *
 * This service maps database schema from local DB (MSSQL/MySQL) to remote application
 */

import { createConnector } from './connectors/connector-factory';
import { SchemaMapper } from './schema/schema-mapper';
import { SchemaValidator } from './schema/schema-validator';
import { RemoteSyncClient } from './remote/remote-sync-client';
import {
  DatabaseType,
  DatabaseSchema,
  SchemaReadOptions,
  SchemaMappingOptions
} from './schema/types';
import {
  getConnectionConfig,
  getRemoteSyncConfig
} from './utils/config-loader';
import logger, { createLogger } from './utils/logger';
import { handleError } from './utils/error-handler';

// Export public API
export * from './connectors/base-connector';
export * from './connectors/mssql-connector';
export * from './connectors/mysql-connector';
export * from './connectors/connector-factory';
export * from './schema/types';
export * from './schema/schema-mapper';
export * from './schema/schema-validator';
export * from './remote/remote-sync-client';
export * from './utils/logger';
export * from './utils/error-handler';
export * from './utils/config-loader';

// Export CRUD and data access
export * from './query/query-builder';
export * from './data-access/base-repository';
export * from './data-access/crud-service';
export * from './transaction/transaction-manager';
export * from './validation/data-validator';
export { ConnectionPoolMonitor } from './monitoring/connection-pool-monitor';

// Export migration and versioning
export * from './migration/migration-types';
export * from './migration/schema-version-manager';
export * from './migration/migration-generator';
export * from './migration/migration-executor';
export * from './migration/drift-detector';
export * from './migration/alert-manager';
export * from './migration/migration-manager';

// Export observability and monitoring (includes PoolMetrics and QueryMetrics)
export * from './observability/audit-logger';
export * from './observability/metrics-collector';
export * from './observability/slo-tracker';
export * from './observability/runbook-manager';
export * from './observability/alert-threshold-manager';
export * from './observability/health-check';
export * from './observability/performance-profiler';
export * from './observability/distributed-tracing';
export * from './observability/observability-manager';

// Export integration and API
export * from './integration/webhook-manager';
export * from './integration/integrated-connector';
export * from './api/server';
export * from './api/middleware/auth';
export * from './api/middleware/error-handler';

/**
 * Main DB Schema Mapper Service
 */
export class DBSchemaMapper {
  private serviceLogger = createLogger('DBSchemaMapper');
  private schemaMapper = new SchemaMapper();
  private schemaValidator = new SchemaValidator();

  /**
   * Read schema from local database
   */
  async readLocalSchema(
    databaseType: DatabaseType,
    options?: SchemaReadOptions
  ): Promise<DatabaseSchema> {
    this.serviceLogger.info('Reading local database schema', { databaseType });

    const config = getConnectionConfig(databaseType);
    const connector = createConnector(databaseType, config);

    try {
      await connector.connect();

      // Test connection
      const isConnected = await connector.testConnection();
      if (!isConnected) {
        throw new Error('Database connection test failed');
      }

      // Read schema
      const schema = await connector.readSchema(options);

      // Validate schema
      this.schemaValidator.validateSchema(schema);

      this.serviceLogger.info('Schema read successfully', {
        database: schema.databaseName,
        tables: schema.tables.length
      });

      return schema;
    } finally {
      await connector.disconnect();
    }
  }

  /**
   * Map schema from one database type to another
   */
  mapSchema(
    sourceSchema: DatabaseSchema,
    targetType: DatabaseType,
    options?: SchemaMappingOptions
  ): DatabaseSchema {
    this.serviceLogger.info('Mapping schema', {
      from: sourceSchema.databaseType,
      to: targetType
    });

    const mappedSchema = this.schemaMapper.mapSchema(sourceSchema, targetType, options);

    this.schemaValidator.validateSchema(mappedSchema);

    return mappedSchema;
  }

  /**
   * Sync schema to remote application
   */
  async syncToRemote(schema: DatabaseSchema): Promise<void> {
    this.serviceLogger.info('Syncing schema to remote application');

    const remoteSyncConfig = getRemoteSyncConfig();
    const remoteClient = new RemoteSyncClient(remoteSyncConfig);

    // Test remote connection
    const isRemoteConnected = await remoteClient.testConnection();
    if (!isRemoteConnected) {
      throw new Error('Remote application connection test failed');
    }

    // Push schema
    const result = await remoteClient.pushSchema(schema);

    this.serviceLogger.info('Schema sync completed', {
      success: result.success,
      version: result.schemaVersion
    });
  }

  /**
   * Complete workflow: Read -> Map -> Sync
   */
  async syncLocalToRemote(
    sourceDatabaseType: DatabaseType,
    targetDatabaseType: DatabaseType,
    readOptions?: SchemaReadOptions,
    mappingOptions?: SchemaMappingOptions
  ): Promise<void> {
    this.serviceLogger.info('Starting complete sync workflow', {
      source: sourceDatabaseType,
      target: targetDatabaseType
    });

    try {
      // Step 1: Read local schema
      const localSchema = await this.readLocalSchema(sourceDatabaseType, readOptions);

      // Step 2: Map to target database type
      const mappedSchema = this.mapSchema(localSchema, targetDatabaseType, mappingOptions);

      // Step 3: Sync to remote
      await this.syncToRemote(mappedSchema);

      this.serviceLogger.info('Complete sync workflow finished successfully');
    } catch (error) {
      handleError(error as Error);
      throw error;
    }
  }

  /**
   * Compare two schemas
   */
  compareSchemas(schema1: DatabaseSchema, schema2: DatabaseSchema) {
    return this.schemaValidator.compareSchemas(schema1, schema2);
  }

  /**
   * Generate SQL DDL from schema
   */
  generateDDL(schema: DatabaseSchema): string[] {
    const ddlStatements: string[] = [];

    for (const table of schema.tables) {
      const createTableSQL = this.schemaMapper.generateCreateTableSQL(
        table,
        schema.databaseType
      );
      ddlStatements.push(createTableSQL);
    }

    return ddlStatements;
  }
}

/**
 * CLI execution
 */
async function main() {
  logger.info('DB Schema Mapper Connector starting...');

  try {
    const mapper = new DBSchemaMapper();

    // Example: Read MSSQL schema and sync to remote as MySQL format
    await mapper.syncLocalToRemote(
      DatabaseType.MSSQL,
      DatabaseType.MySQL,
      {
        includeSystemTables: false
      },
      {
        targetDatabaseType: DatabaseType.MySQL,
        preserveCase: false,
        includeConstraints: true,
        includeIndexes: true
      }
    );

    logger.info('Schema synchronization completed successfully');
  } catch (error) {
    logger.error('Schema synchronization failed', { error });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error', { error });
    process.exit(1);
  });
}
