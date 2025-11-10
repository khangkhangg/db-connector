/**
 * Migration executor with rollback support
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { TransactionManager } from '../transaction/transaction-manager';
import {
  Migration,
  MigrationRecord,
  MigrationStatus,
  MigrationDirection,
  MigrationPlan,
  MigrationRisk
} from './migration-types';
import { DatabaseType } from '../schema/types';
import { createLogger } from '../utils/logger';

/**
 * Migration executor
 */
export class MigrationExecutor {
  private logger = createLogger('MigrationExecutor');
  private transactionManager: TransactionManager;
  private migrationsTable = 'schema_migrations';

  constructor(private connector: BaseDatabaseConnector) {
    this.transactionManager = new TransactionManager(connector);
  }

  /**
   * Initialize migrations table
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing migrations tracking');

    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.migrationsTable}')
        BEGIN
          CREATE TABLE ${this.migrationsTable} (
            id NVARCHAR(100) PRIMARY KEY,
            migration_id NVARCHAR(100),
            version NVARCHAR(50),
            name NVARCHAR(200),
            status NVARCHAR(20),
            executed_at DATETIME2 DEFAULT GETDATE(),
            execution_time_ms INT,
            error_message NVARCHAR(MAX),
            checksum NVARCHAR(64),
            rolled_back_at DATETIME2
          );
        END
      `;
    } else {
      sql = `
        CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
          id VARCHAR(100) PRIMARY KEY,
          migration_id VARCHAR(100),
          version VARCHAR(50),
          name VARCHAR(200),
          status VARCHAR(20),
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INT,
          error_message TEXT,
          checksum VARCHAR(64),
          rolled_back_at TIMESTAMP NULL
        );
      `;
    }

    await this.connector.executeQuery(sql);

    this.logger.info('Migrations tracking initialized');
  }

  /**
   * Execute migration
   */
  async executeMigration(
    migration: Migration,
    direction: MigrationDirection = MigrationDirection.UP,
    dryRun: boolean = false
  ): Promise<MigrationRecord> {
    this.logger.info('Executing migration', {
      migration: migration.name,
      version: migration.version,
      direction,
      dryRun
    });

    const startTime = Date.now();
    const record: MigrationRecord = {
      id: `exec_${Date.now()}_${migration.id}`,
      migration_id: migration.id,
      version: migration.version,
      name: migration.name,
      status: MigrationStatus.RUNNING,
      executed_at: new Date(),
      checksum: migration.checksum
    };

    try {
      // Save record as running
      if (!dryRun) {
        await this.saveMigrationRecord(record);
      }

      // Execute operations in transaction
      const operations = direction === MigrationDirection.UP
        ? migration.operations.up
        : migration.operations.down;

      if (dryRun) {
        this.logger.info('DRY RUN - Would execute:', {
          operations: operations.map(op => op.sql)
        });
      } else {
        await this.transactionManager.executeInTransaction(async (ctx) => {
          for (const operation of operations) {
            this.logger.debug('Executing operation', {
              type: operation.type,
              table: operation.table
            });

            await ctx.executeQuery(operation.sql, operation.params);
          }
        });
      }

      // Update record as completed
      record.status = MigrationStatus.COMPLETED;
      record.execution_time_ms = Date.now() - startTime;

      if (!dryRun) {
        await this.updateMigrationRecord(record);
      }

      this.logger.info('Migration executed successfully', {
        migration: migration.name,
        executionTime: record.execution_time_ms
      });

      return record;
    } catch (error) {
      this.logger.error('Migration execution failed', {
        migration: migration.name,
        error
      });

      record.status = MigrationStatus.FAILED;
      record.error_message = (error as Error).message;
      record.execution_time_ms = Date.now() - startTime;

      if (!dryRun) {
        await this.updateMigrationRecord(record);
      }

      throw error;
    }
  }

  /**
   * Execute multiple migrations
   */
  async executeMigrations(
    migrations: Migration[],
    direction: MigrationDirection = MigrationDirection.UP,
    stopOnError: boolean = true
  ): Promise<MigrationRecord[]> {
    this.logger.info('Executing multiple migrations', {
      count: migrations.length,
      direction
    });

    const records: MigrationRecord[] = [];

    for (const migration of migrations) {
      try {
        const record = await this.executeMigration(migration, direction);
        records.push(record);
      } catch (error) {
        if (stopOnError) {
          this.logger.error('Stopping migration execution due to error');
          break;
        } else {
          this.logger.warn('Continuing despite migration error');
        }
      }
    }

    return records;
  }

  /**
   * Rollback migration
   */
  async rollbackMigration(migration: Migration): Promise<void> {
    this.logger.info('Rolling back migration', {
      migration: migration.name,
      version: migration.version
    });

    try {
      await this.executeMigration(migration, MigrationDirection.DOWN);

      // Mark as rolled back
      await this.markAsRolledBack(migration.id);

      this.logger.info('Migration rolled back successfully');
    } catch (error) {
      this.logger.error('Rollback failed', { error });
      throw error;
    }
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(limit?: number): Promise<MigrationRecord[]> {
    const sql = limit
      ? `SELECT * FROM ${this.migrationsTable} ORDER BY executed_at DESC LIMIT ${limit}`
      : `SELECT * FROM ${this.migrationsTable} ORDER BY executed_at DESC`;

    const results = await this.connector.executeQuery<any>(sql);

    return results.map(row => ({
      id: row.id,
      migration_id: row.migration_id,
      version: row.version,
      name: row.name,
      status: row.status as MigrationStatus,
      executed_at: new Date(row.executed_at),
      execution_time_ms: row.execution_time_ms,
      error_message: row.error_message,
      checksum: row.checksum,
      rolled_back_at: row.rolled_back_at ? new Date(row.rolled_back_at) : undefined
    }));
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(allMigrations: Migration[]): Promise<Migration[]> {
    const executed = await this.getExecutedMigrationIds();

    return allMigrations.filter(m => !executed.includes(m.id));
  }

  /**
   * Create migration plan
   */
  async createMigrationPlan(migrations: Migration[]): Promise<MigrationPlan> {
    const totalOperations = migrations.reduce(
      (sum, m) => sum + m.operations.up.length,
      0
    );

    // Estimate 100ms per operation
    const estimatedTime = totalOperations * 100;

    const risks = this.assessMigrationRisks(migrations);

    const canRollback = migrations.every(m =>
      m.operations.down.every(op => !op.metadata?.requiresManualIntervention)
    );

    return {
      migrations,
      totalOperations,
      estimatedTime,
      risks,
      canRollback
    };
  }

  /**
   * Assess migration risks
   */
  private assessMigrationRisks(migrations: Migration[]): MigrationRisk[] {
    const risks: MigrationRisk[] = [];

    migrations.forEach(migration => {
      migration.operations.up.forEach(op => {
        // Check for DROP TABLE operations
        if (op.type === 'DROP_TABLE') {
          risks.push({
            level: 'critical',
            description: `Dropping table ${op.table} will result in permanent data loss`,
            mitigation: 'Backup table data before executing migration',
            affectedTables: [op.table]
          });
        }

        // Check for DROP COLUMN operations
        if (op.type === 'DROP_COLUMN') {
          risks.push({
            level: 'high',
            description: `Dropping column ${op.metadata?.column} from ${op.table} will result in data loss`,
            mitigation: 'Backup column data before executing migration',
            affectedTables: [op.table]
          });
        }

        // Check for MODIFY COLUMN operations
        if (op.type === 'MODIFY_COLUMN') {
          risks.push({
            level: 'medium',
            description: `Modifying column ${op.metadata?.column} in ${op.table} may fail if data is incompatible`,
            mitigation: 'Test migration in staging environment first',
            affectedTables: [op.table]
          });
        }
      });
    });

    return risks;
  }

  /**
   * Save migration record
   */
  private async saveMigrationRecord(record: MigrationRecord): Promise<void> {
    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        INSERT INTO ${this.migrationsTable} (id, migration_id, version, name, status, executed_at, execution_time_ms, error_message, checksum)
        VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)
      `;
    } else {
      sql = `
        INSERT INTO ${this.migrationsTable} (id, migration_id, version, name, status, executed_at, execution_time_ms, error_message, checksum)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
    }

    await this.connector.executeQuery(sql, [
      record.id,
      record.migration_id,
      record.version,
      record.name,
      record.status,
      record.executed_at,
      record.execution_time_ms,
      record.error_message,
      record.checksum
    ]);
  }

  /**
   * Update migration record
   */
  private async updateMigrationRecord(record: MigrationRecord): Promise<void> {
    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        UPDATE ${this.migrationsTable}
        SET status = @p0, execution_time_ms = @p1, error_message = @p2
        WHERE id = @p3
      `;
    } else {
      sql = `
        UPDATE ${this.migrationsTable}
        SET status = ?, execution_time_ms = ?, error_message = ?
        WHERE id = ?
      `;
    }

    await this.connector.executeQuery(sql, [
      record.status,
      record.execution_time_ms,
      record.error_message,
      record.id
    ]);
  }

  /**
   * Mark migration as rolled back
   */
  private async markAsRolledBack(migrationId: string): Promise<void> {
    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        UPDATE ${this.migrationsTable}
        SET status = @p0, rolled_back_at = GETDATE()
        WHERE migration_id = @p1
      `;
    } else {
      sql = `
        UPDATE ${this.migrationsTable}
        SET status = ?, rolled_back_at = NOW()
        WHERE migration_id = ?
      `;
    }

    await this.connector.executeQuery(sql, [MigrationStatus.ROLLED_BACK, migrationId]);
  }

  /**
   * Get executed migration IDs
   */
  private async getExecutedMigrationIds(): Promise<string[]> {
    const sql = `
      SELECT migration_id FROM ${this.migrationsTable}
      WHERE status = '${MigrationStatus.COMPLETED}'
      AND rolled_back_at IS NULL
    `;

    const results = await this.connector.executeQuery<any>(sql);

    return results.map(row => row.migration_id);
  }

  /**
   * Verify migration integrity
   */
  async verifyMigrationIntegrity(migration: Migration): Promise<boolean> {
    const sql = `
      SELECT checksum FROM ${this.migrationsTable}
      WHERE migration_id = ? AND status = '${MigrationStatus.COMPLETED}'
    `;

    const results = await this.connector.executeQuery<any>(sql, [migration.id]);

    if (results.length === 0) {
      return true; // Not executed yet
    }

    const recordedChecksum = results[0].checksum;
    return recordedChecksum === migration.checksum;
  }
}
