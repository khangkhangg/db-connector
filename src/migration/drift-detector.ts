/**
 * Automated drift detection system
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { SchemaVersionManager } from './schema-version-manager';
import { SchemaValidator } from '../schema/schema-validator';
import {
  DriftDetectionResult,
  DriftChange,
  SchemaChangeRule,
  SchemaAlert
} from './migration-types';
import { DatabaseSchema, SchemaComparison } from '../schema/types';
import { createLogger } from '../utils/logger';

/**
 * Drift detector
 */
export class DriftDetector {
  private logger = createLogger('DriftDetector');
  private validator = new SchemaValidator();
  private monitoringInterval?: NodeJS.Timeout;
  private alertCallbacks: Array<(alert: SchemaAlert) => Promise<void>> = [];

  // Default schema change rules
  private defaultRules: SchemaChangeRule[] = [
    {
      name: 'no_table_drops_in_production',
      description: 'Tables should not be dropped in production',
      severity: 'error',
      validate: (change) => change.type !== 'table_removed',
      message: 'Dropping tables in production is not allowed'
    },
    {
      name: 'no_column_drops_without_backup',
      description: 'Columns with data should not be dropped without backup',
      severity: 'error',
      validate: (change) => change.type !== 'column_removed',
      message: 'Dropping columns may result in data loss'
    },
    {
      name: 'warn_on_type_changes',
      description: 'Column type changes should be reviewed',
      severity: 'warning',
      validate: (change) =>
        !(change.type === 'column_modified' &&
          change.description.includes('dataType')),
      message: 'Column type changes may cause data conversion issues'
    },
    {
      name: 'warn_on_constraint_changes',
      description: 'Constraint changes should be reviewed',
      severity: 'warning',
      validate: (change) => change.type !== 'constraint_changed',
      message: 'Constraint changes may affect application behavior'
    }
  ];

  constructor(
    private connector: BaseDatabaseConnector,
    private versionManager: SchemaVersionManager,
    private customRules: SchemaChangeRule[] = []
  ) {
    this.logger.info('Drift detector initialized');
  }

  /**
   * Detect drift between current database and expected schema
   */
  async detectDrift(
    currentSchema: DatabaseSchema,
    expectedVersion?: string
  ): Promise<DriftDetectionResult> {
    this.logger.info('Detecting schema drift', {
      database: currentSchema.databaseName,
      expectedVersion
    });

    // Get expected schema from snapshot
    const expectedSnapshot = expectedVersion
      ? await this.versionManager.getSnapshot(expectedVersion)
      : await this.versionManager.getLatestSnapshot();

    if (!expectedSnapshot) {
      this.logger.warn('No expected schema snapshot found');
      return {
        hasDrift: false,
        driftType: 'none',
        changes: [],
        severity: 'low',
        detectedAt: new Date(),
        affectedTables: []
      };
    }

    // Compare schemas
    const comparison = this.validator.compareSchemas(
      {
        ...expectedSnapshot,
        databaseType: currentSchema.databaseType
      } as DatabaseSchema,
      currentSchema
    );

    // Convert comparison to drift changes
    const changes = this.convertComparisonToDrift(comparison);

    // Assess severity
    const severity = this.assessSeverity(changes);

    // Get affected tables
    const affectedTables = [
      ...comparison.tablesAdded,
      ...comparison.tablesRemoved,
      ...comparison.tablesModified.map(t => t.tableName)
    ];

    const result: DriftDetectionResult = {
      hasDrift: changes.length > 0,
      driftType: this.determineDriftType(changes),
      changes,
      severity,
      detectedAt: new Date(),
      affectedTables
    };

    if (result.hasDrift) {
      this.logger.warn('Schema drift detected', {
        changes: changes.length,
        severity,
        affectedTables
      });

      // Trigger alert
      await this.triggerAlert({
        id: `drift_${Date.now()}`,
        type: 'drift_detected',
        severity,
        message: `Schema drift detected: ${changes.length} changes found`,
        details: { result },
        timestamp: new Date(),
        acknowledged: false
      });
    } else {
      this.logger.info('No schema drift detected');
    }

    return result;
  }

  /**
   * Convert schema comparison to drift changes
   */
  private convertComparisonToDrift(comparison: SchemaComparison): DriftChange[] {
    const changes: DriftChange[] = [];

    // Tables added
    comparison.tablesAdded.forEach(table => {
      changes.push({
        type: 'table_added',
        table,
        description: `Table ${table} was added but not in expected schema`,
        severity: 'medium',
        autoFixable: true,
        fixSuggestion: `Generate migration to add table ${table}`
      });
    });

    // Tables removed
    comparison.tablesRemoved.forEach(table => {
      changes.push({
        type: 'table_removed',
        table,
        description: `Table ${table} is missing from current schema`,
        severity: 'critical',
        autoFixable: false,
        fixSuggestion: `Restore table ${table} from backup or create new table`
      });
    });

    // Tables modified
    comparison.tablesModified.forEach(tableComp => {
      // Columns added
      tableComp.columnsAdded.forEach(col => {
        changes.push({
          type: 'column_added',
          table: tableComp.tableName,
          column: col.name,
          description: `Column ${col.name} was added to ${tableComp.tableName}`,
          severity: 'low',
          autoFixable: true,
          fixSuggestion: `Generate migration to add column ${col.name}`
        });
      });

      // Columns removed
      tableComp.columnsRemoved.forEach(col => {
        changes.push({
          type: 'column_removed',
          table: tableComp.tableName,
          column: col.name,
          description: `Column ${col.name} was removed from ${tableComp.tableName}`,
          severity: 'high',
          autoFixable: false,
          fixSuggestion: `Restore column ${col.name} or update expected schema`
        });
      });

      // Columns modified
      tableComp.columnsModified.forEach(colComp => {
        colComp.changes.forEach(change => {
          changes.push({
            type: 'column_modified',
            table: tableComp.tableName,
            column: colComp.columnName,
            description: `Column ${colComp.columnName} ${change.property} changed from ${change.oldValue} to ${change.newValue}`,
            severity: change.property === 'dataType' ? 'high' : 'medium',
            expectedValue: change.oldValue,
            actualValue: change.newValue,
            autoFixable: false,
            fixSuggestion: `Review and update schema or revert column change`
          });
        });
      });

      // Constraints changed
      if (tableComp.foreignKeysChanged) {
        changes.push({
          type: 'constraint_changed',
          table: tableComp.tableName,
          description: `Foreign key constraints changed on ${tableComp.tableName}`,
          severity: 'medium',
          autoFixable: false,
          fixSuggestion: 'Review constraint changes and update schema'
        });
      }

      // Indexes changed
      if (tableComp.indexesChanged) {
        changes.push({
          type: 'index_changed',
          table: tableComp.tableName,
          description: `Indexes changed on ${tableComp.tableName}`,
          severity: 'low',
          autoFixable: true,
          fixSuggestion: 'Generate migration to sync indexes'
        });
      }
    });

    return changes;
  }

  /**
   * Assess overall severity
   */
  private assessSeverity(changes: DriftChange[]): 'low' | 'medium' | 'high' | 'critical' {
    if (changes.some(c => c.severity === 'critical')) return 'critical';
    if (changes.some(c => c.severity === 'high')) return 'high';
    if (changes.some(c => c.severity === 'medium')) return 'medium';
    return 'low';
  }

  /**
   * Determine drift type
   */
  private determineDriftType(changes: DriftChange[]): 'schema' | 'data' | 'both' | 'none' {
    if (changes.length === 0) return 'none';
    return 'schema'; // For now, we only detect schema drift
  }

  /**
   * Validate schema changes against rules
   */
  validateChanges(changes: DriftChange[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const allRules = [...this.defaultRules, ...this.customRules];

    changes.forEach(change => {
      allRules.forEach(rule => {
        if (!rule.validate(change)) {
          const message = `[${rule.name}] ${rule.message}: ${change.description}`;

          if (rule.severity === 'error') {
            errors.push(message);
          } else {
            warnings.push(message);
          }
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Start continuous drift monitoring
   */
  startMonitoring(
    intervalMs: number,
    getCurrentSchema: () => Promise<DatabaseSchema>
  ): void {
    this.logger.info('Starting continuous drift monitoring', { intervalMs });

    this.monitoringInterval = setInterval(async () => {
      try {
        const currentSchema = await getCurrentSchema();
        await this.detectDrift(currentSchema);
      } catch (error) {
        this.logger.error('Drift monitoring error', { error });
      }
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.info('Stopped drift monitoring');
    }
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: SchemaAlert) => Promise<void>): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(alert: SchemaAlert): Promise<void> {
    for (const callback of this.alertCallbacks) {
      try {
        await callback(alert);
      } catch (error) {
        this.logger.error('Alert callback failed', { error });
      }
    }
  }

  /**
   * Generate drift report
   */
  generateDriftReport(result: DriftDetectionResult): string {
    const lines: string[] = [
      '═══════════════════════════════════════',
      '        SCHEMA DRIFT DETECTION REPORT',
      '═══════════════════════════════════════',
      '',
      `Detected At: ${result.detectedAt.toISOString()}`,
      `Drift Status: ${result.hasDrift ? '⚠️  DRIFT DETECTED' : '✓ NO DRIFT'}`,
      `Severity: ${result.severity.toUpperCase()}`,
      `Type: ${result.driftType}`,
      `Changes Found: ${result.changes.length}`,
      `Affected Tables: ${result.affectedTables.length}`,
      ''
    ];

    if (result.hasDrift) {
      lines.push('CHANGES DETECTED:');
      lines.push('─────────────────────────────────────');
      lines.push('');

      // Group by severity
      const critical = result.changes.filter(c => c.severity === 'critical');
      const high = result.changes.filter(c => c.severity === 'high');
      const medium = result.changes.filter(c => c.severity === 'medium');
      const low = result.changes.filter(c => c.severity === 'low');

      const addChanges = (severity: string, changes: DriftChange[]) => {
        if (changes.length > 0) {
          lines.push(`${severity.toUpperCase()} SEVERITY (${changes.length}):`);
          changes.forEach(change => {
            lines.push(`  • ${change.description}`);
            if (change.fixSuggestion) {
              lines.push(`    → ${change.fixSuggestion}`);
            }
          });
          lines.push('');
        }
      };

      addChanges('critical', critical);
      addChanges('high', high);
      addChanges('medium', medium);
      addChanges('low', low);

      // Affected tables
      if (result.affectedTables.length > 0) {
        lines.push('AFFECTED TABLES:');
        result.affectedTables.forEach(table => {
          const tableChanges = result.changes.filter(c => c.table === table);
          lines.push(`  • ${table} (${tableChanges.length} changes)`);
        });
        lines.push('');
      }

      // Auto-fixable changes
      const autoFixable = result.changes.filter(c => c.autoFixable);
      if (autoFixable.length > 0) {
        lines.push(`AUTO-FIXABLE: ${autoFixable.length} of ${result.changes.length} changes can be auto-fixed`);
        lines.push('');
      }
    }

    lines.push('═══════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Get auto-fixable changes
   */
  getAutoFixableChanges(result: DriftDetectionResult): DriftChange[] {
    return result.changes.filter(c => c.autoFixable);
  }

  /**
   * Check if drift is within acceptable threshold
   */
  isWithinThreshold(
    result: DriftDetectionResult,
    maxChanges: number = 10,
    maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): boolean {
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const maxSeverityIndex = severityLevels.indexOf(maxSeverity);
    const resultSeverityIndex = severityLevels.indexOf(result.severity);

    return (
      result.changes.length <= maxChanges &&
      resultSeverityIndex <= maxSeverityIndex
    );
  }
}
