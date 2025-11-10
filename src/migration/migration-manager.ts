/**
 * Main migration manager - orchestrates all migration operations
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { SchemaVersionManager } from './schema-version-manager';
import { MigrationGenerator } from './migration-generator';
import { MigrationExecutor } from './migration-executor';
import { DriftDetector } from './drift-detector';
import { AlertManager } from './alert-manager';
import {
  Migration,
  MigrationDirection,
  DriftDetectionResult,
  SchemaVersion,
  AlertConfig
} from './migration-types';
import { DatabaseSchema } from '../schema/types';
import { createLogger } from '../utils/logger';

/**
 * Migration manager configuration
 */
export interface MigrationManagerConfig {
  enableDriftMonitoring?: boolean;
  driftCheckIntervalMs?: number;
  alertConfig?: AlertConfig;
  autoFixDrift?: boolean;
}

/**
 * Main migration manager
 */
export class MigrationManager {
  private logger = createLogger('MigrationManager');
  private versionManager: SchemaVersionManager;
  private generator: MigrationGenerator;
  private executor: MigrationExecutor;
  private driftDetector: DriftDetector;
  private alertManager?: AlertManager;

  constructor(
    private connector: BaseDatabaseConnector,
    private config: MigrationManagerConfig = {}
  ) {
    this.versionManager = new SchemaVersionManager(connector);
    this.generator = new MigrationGenerator();
    this.executor = new MigrationExecutor(connector);
    this.driftDetector = new DriftDetector(connector, this.versionManager);

    if (config.alertConfig) {
      this.alertManager = new AlertManager(config.alertConfig);

      // Register drift detector alert callback
      this.driftDetector.onAlert(async (alert) => {
        await this.alertManager!.sendAlert(alert);
      });
    }

    this.logger.info('Migration manager initialized', {
      driftMonitoring: config.enableDriftMonitoring,
      alertsEnabled: !!config.alertConfig
    });
  }

  /**
   * Initialize migration system
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing migration system');

    await this.versionManager.initialize();
    await this.executor.initialize();

    if (this.config.enableDriftMonitoring) {
      // Start drift monitoring would go here
    }

    this.logger.info('Migration system initialized');
  }

  /**
   * Create migration from schema change
   */
  async createMigration(
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema,
    description?: string
  ): Promise<Migration> {
    this.logger.info('Creating migration');

    const version = await this.versionManager.generateNextVersion();

    const migration = this.generator.generateMigration(
      oldSchema,
      newSchema,
      version,
      description
    );

    this.logger.info('Migration created', {
      version,
      operations: migration.operations.up.length
    });

    return migration;
  }

  /**
   * Execute migration
   */
  async executeMigration(
    migration: Migration,
    dryRun: boolean = false
  ): Promise<void> {
    this.logger.info('Executing migration', {
      version: migration.version,
      dryRun
    });

    // Verify migration integrity
    const integrityOk = await this.executor.verifyMigrationIntegrity(migration);
    if (!integrityOk) {
      throw new Error('Migration checksum mismatch - migration may have been tampered with');
    }

    // Create migration plan
    const plan = await this.executor.createMigrationPlan([migration]);

    this.logger.info('Migration plan created', {
      operations: plan.totalOperations,
      estimatedTime: plan.estimatedTime,
      risks: plan.risks.length
    });

    // Check for critical risks
    const criticalRisks = plan.risks.filter(r => r.level === 'critical');
    if (criticalRisks.length > 0 && !dryRun) {
      this.logger.error('Critical risks detected', { risks: criticalRisks });
      throw new Error(`Migration has ${criticalRisks.length} critical risks. Review and confirm before proceeding.`);
    }

    // Execute
    const record = await this.executor.executeMigration(migration, MigrationDirection.UP, dryRun);

    if (!dryRun && record.status === 'completed') {
      // Create snapshot
      const snapshot = await this.versionManager.createSnapshot(
        { tables: [] } as DatabaseSchema, // Would pass actual schema
        migration.version
      );

      // Save version
      await this.versionManager.saveVersion({
        version: migration.version,
        description: migration.description,
        applied_at: new Date(),
        migrations: [migration.id],
        checksum: snapshot.checksum
      });

      // Send alert
      if (this.alertManager) {
        await this.alertManager.sendAlert({
          id: `migration_complete_${Date.now()}`,
          type: 'migration_completed',
          severity: 'low',
          message: `Migration ${migration.version} completed successfully`,
          details: { migration, record },
          timestamp: new Date(),
          acknowledged: false
        });
      }

      this.logger.info('Migration executed successfully', {
        version: migration.version
      });
    }
  }

  /**
   * Rollback migration
   */
  async rollbackMigration(migration: Migration): Promise<void> {
    this.logger.info('Rolling back migration', { version: migration.version });

    await this.executor.rollbackMigration(migration);

    if (this.alertManager) {
      await this.alertManager.sendAlert({
        id: `migration_rollback_${Date.now()}`,
        type: 'migration_failed',
        severity: 'high',
        message: `Migration ${migration.version} was rolled back`,
        details: { migration },
        timestamp: new Date(),
        acknowledged: false
      });
    }

    this.logger.info('Migration rolled back successfully');
  }

  /**
   * Detect drift
   */
  async detectDrift(currentSchema: DatabaseSchema): Promise<DriftDetectionResult> {
    this.logger.info('Detecting drift');

    const result = await this.driftDetector.detectDrift(currentSchema);

    if (result.hasDrift) {
      this.logger.warn('Drift detected', {
        changes: result.changes.length,
        severity: result.severity
      });

      // Validate changes against rules
      const validation = this.driftDetector.validateChanges(result.changes);

      if (!validation.valid) {
        this.logger.error('Schema changes violate validation rules', {
          errors: validation.errors
        });
      }

      if (validation.warnings.length > 0) {
        this.logger.warn('Schema change warnings', {
          warnings: validation.warnings
        });
      }

      // Auto-fix if enabled and changes are auto-fixable
      if (this.config.autoFixDrift) {
        const autoFixable = this.driftDetector.getAutoFixableChanges(result);
        if (autoFixable.length > 0) {
          this.logger.info('Auto-fixing drift', { changes: autoFixable.length });
          // Would generate and execute migration to fix drift
        }
      }
    }

    return result;
  }

  /**
   * Start drift monitoring
   */
  startDriftMonitoring(getCurrentSchema: () => Promise<DatabaseSchema>): void {
    const interval = this.config.driftCheckIntervalMs || 300000; // 5 minutes default

    this.driftDetector.startMonitoring(interval, getCurrentSchema);

    this.logger.info('Drift monitoring started', { intervalMs: interval });
  }

  /**
   * Stop drift monitoring
   */
  stopDriftMonitoring(): void {
    this.driftDetector.stopMonitoring();
    this.logger.info('Drift monitoring stopped');
  }

  /**
   * Get current version
   */
  async getCurrentVersion(): Promise<SchemaVersion | null> {
    return this.versionManager.getCurrentVersion();
  }

  /**
   * Get version history
   */
  async getVersionHistory(limit?: number): Promise<SchemaVersion[]> {
    return this.versionManager.getVersionHistory(limit);
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(limit?: number) {
    return this.executor.getMigrationHistory(limit);
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(allMigrations: Migration[]): Promise<Migration[]> {
    return this.executor.getPendingMigrations(allMigrations);
  }

  /**
   * Generate drift report
   */
  generateDriftReport(result: DriftDetectionResult): string {
    return this.driftDetector.generateDriftReport(result);
  }

  /**
   * Get drift detector
   */
  getDriftDetector(): DriftDetector {
    return this.driftDetector;
  }

  /**
   * Get alert manager
   */
  getAlertManager(): AlertManager | undefined {
    return this.alertManager;
  }
}
