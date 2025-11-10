/**
 * Integrated connector - combines all components into a unified interface
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { createAndConnectConnector } from '../connectors/connector-factory';
import { DatabaseType, DatabaseSchema } from '../schema/types';
import { SchemaMapper } from '../schema/schema-mapper';
import { SchemaVersionManager } from '../migration/schema-version-manager';
import { MigrationManager } from '../migration/migration-manager';
import { ObservabilityManager } from '../observability/observability-manager';
import { WebhookManager, WebhookEventType } from './webhook-manager';
import { CRUDService } from '../data-access/crud-service';
import { TransactionManager } from '../transaction/transaction-manager';
import { createLogger } from '../utils/logger';

const logger = createLogger('IntegratedConnector');

/**
 * Integrated connector configuration
 */
export interface IntegratedConnectorConfig {
  database: {
    type: DatabaseType;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  observability?: {
    enableAuditLogging?: boolean;
    enableMetrics?: boolean;
    enableSLOTracking?: boolean;
    enableAlerts?: boolean;
    enableHealthChecks?: boolean;
  };
  webhooks?: {
    enabled?: boolean;
  };
}

/**
 * Integrated connector - all-in-one interface
 */
export class IntegratedConnector {
  private logger = createLogger('IntegratedConnector');
  private connector!: BaseDatabaseConnector;
  private schemaMapper!: SchemaMapper;
  private versionManager!: SchemaVersionManager;
  private migrationManager!: MigrationManager;
  private observabilityManager!: ObservabilityManager;
  private webhookManager?: WebhookManager;
  private crudService?: CRUDService;
  private transactionManager?: TransactionManager;
  private config: IntegratedConnectorConfig;
  private initialized = false;

  constructor(config: IntegratedConnectorConfig) {
    this.config = config;
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing integrated connector');

    try {
      // Initialize database connector
      this.connector = await createAndConnectConnector(
        this.config.database.type,
        this.config.database
      );

      // Initialize schema mapper
      this.schemaMapper = new SchemaMapper();

      // Initialize version manager
      this.versionManager = new SchemaVersionManager(this.connector);

      // Initialize migration manager
      this.migrationManager = new MigrationManager(this.connector);

      // Initialize observability
      this.observabilityManager = new ObservabilityManager(
        this.connector,
        this.config.observability
      );
      await this.observabilityManager.initialize();

      // Initialize webhooks if enabled
      if (this.config.webhooks?.enabled) {
        this.webhookManager = new WebhookManager();
        this.setupWebhookIntegration();
      }

      // Initialize CRUD service
      this.crudService = new CRUDService(this.connector);

      // Initialize transaction manager
      this.transactionManager = new TransactionManager(this.connector);

      this.initialized = true;

      this.logger.info('Integrated connector initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize integrated connector', { error });
      throw error;
    }
  }

  /**
   * Setup webhook integration with other components
   */
  private setupWebhookIntegration(): void {
    if (!this.webhookManager) return;

    // Listen to migration manager events
    this.migrationManager.on('migration:started', async (migration) => {
      await this.webhookManager!.emitEvent(
        WebhookEventType.MIGRATION_STARTED,
        { migration }
      );
    });

    this.migrationManager.on('migration:completed', async (migration, result) => {
      await this.webhookManager!.emitEvent(
        WebhookEventType.MIGRATION_COMPLETED,
        { migration, result }
      );
    });

    this.migrationManager.on('migration:failed', async (migration, error) => {
      await this.webhookManager!.emitEvent(
        WebhookEventType.MIGRATION_FAILED,
        { migration, error: error.message }
      );
    });

    this.migrationManager.on('drift:detected', async (drift) => {
      await this.webhookManager!.emitEvent(
        WebhookEventType.DRIFT_DETECTED,
        { drift }
      );
    });

    this.logger.info('Webhook integration setup complete');
  }

  /**
   * Read schema from database
   */
  async readSchema(includeSystemTables = false): Promise<DatabaseSchema> {
    this.ensureInitialized();

    const schema = await this.connector.readSchema({ includeSystemTables });

    if (this.webhookManager) {
      await this.webhookManager.emitEvent(WebhookEventType.SCHEMA_READ, {
        database: schema.databaseName,
        tables: schema.tables.length
      });
    }

    return schema;
  }

  /**
   * Map schema to different database type
   */
  mapSchema(schema: DatabaseSchema, targetType: DatabaseType): DatabaseSchema {
    this.ensureInitialized();
    return this.schemaMapper.mapSchema(schema, targetType);
  }

  /**
   * Compare schemas
   */
  compareSchemas(schema1: DatabaseSchema, schema2: DatabaseSchema): any {
    this.ensureInitialized();
    return this.schemaMapper.compareSchemas(schema1, schema2);
  }

  /**
   * Execute query with observability
   */
  async executeQuery<T>(
    query: string,
    params?: any[],
    options?: { userId?: string }
  ): Promise<T> {
    this.ensureInitialized();

    const startTime = Date.now();
    let success = true;
    let error: any;
    let result: T;

    try {
      result = await this.connector.executeQuery<T>(query, params);
      return result;
    } catch (err) {
      success = false;
      error = err;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // Record metrics
      await this.observabilityManager.recordQuery({
        operation: 'CUSTOM',
        table: 'unknown',
        durationMs: duration,
        success,
        error: error?.message,
        query,
        userId: options?.userId
      });
    }
  }

  /**
   * Get CRUD service
   */
  getCRUDService(): CRUDService {
    this.ensureInitialized();
    if (!this.crudService) {
      throw new Error('CRUD service not initialized');
    }
    return this.crudService;
  }

  /**
   * Get transaction manager
   */
  getTransactionManager(): TransactionManager {
    this.ensureInitialized();
    if (!this.transactionManager) {
      throw new Error('Transaction manager not initialized');
    }
    return this.transactionManager;
  }

  /**
   * Get migration manager
   */
  getMigrationManager(): MigrationManager {
    this.ensureInitialized();
    return this.migrationManager;
  }

  /**
   * Get observability manager
   */
  getObservabilityManager(): ObservabilityManager {
    this.ensureInitialized();
    return this.observabilityManager;
  }

  /**
   * Get webhook manager
   */
  getWebhookManager(): WebhookManager | undefined {
    this.ensureInitialized();
    return this.webhookManager;
  }

  /**
   * Get database connector
   */
  getConnector(): BaseDatabaseConnector {
    this.ensureInitialized();
    return this.connector;
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<any> {
    this.ensureInitialized();

    const healthCheck = this.observabilityManager.getHealthCheck();
    if (!healthCheck) {
      return { status: 'unknown' };
    }

    return await healthCheck.health();
  }

  /**
   * Get dashboard
   */
  async getDashboard(): Promise<any> {
    this.ensureInitialized();
    return await this.observabilityManager.getDashboard();
  }

  /**
   * Ensure initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('IntegratedConnector not initialized. Call initialize() first.');
    }
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down integrated connector');

    if (this.observabilityManager) {
      await this.observabilityManager.shutdown();
    }

    if (this.connector) {
      await this.connector.disconnect();
    }

    this.initialized = false;

    this.logger.info('Integrated connector shut down');
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
