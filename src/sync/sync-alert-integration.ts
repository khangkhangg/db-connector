/**
 * Integration between Data Sync and Alert System
 * Automatically sends alerts for sync events with PHI protection
 */

import { DataSyncManager } from './data-sync-manager';
import { EnhancedAlertManager, PHIAwareAlertConfig } from '../migration/enhanced-alert-manager';
import { SyncEvent, SyncEventType, SyncSessionResult } from './types';
import { Logger } from '../utils/logger';

/**
 * Sync alert integration configuration
 */
export interface SyncAlertIntegrationConfig {
  alertConfig: PHIAwareAlertConfig;
  alertOnConflicts: boolean;
  alertOnErrors: boolean;
  alertOnCompletion: boolean;
  alertOnFailure: boolean;
  conflictThreshold?: number; // Alert if conflicts exceed this number
  errorThreshold?: number; // Alert if errors exceed this number
}

/**
 * Integrates data sync events with alert system
 */
export class SyncAlertIntegration {
  private logger: Logger;
  private alertManager: EnhancedAlertManager;

  constructor(
    private syncManager: DataSyncManager,
    private config: SyncAlertIntegrationConfig
  ) {
    this.logger = new Logger('SyncAlertIntegration');
    this.alertManager = new EnhancedAlertManager(config.alertConfig);
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for sync events
   */
  private setupEventListeners(): void {
    this.syncManager.on('sync-event', (event: SyncEvent) => {
      this.handleSyncEvent(event).catch(error => {
        this.logger.error('Failed to handle sync event', { error });
      });
    });

    this.logger.info('Sync alert integration initialized');
  }

  /**
   * Handle sync event and send alerts if needed
   */
  private async handleSyncEvent(event: SyncEvent): Promise<void> {
    switch (event.type) {
      case SyncEventType.ConflictDetected:
        if (this.config.alertOnConflicts) {
          await this.alertConflictDetected(event);
        }
        break;

      case SyncEventType.SyncCompleted:
        if (this.config.alertOnCompletion) {
          await this.alertSyncCompleted(event);
        }
        break;

      case SyncEventType.SyncFailed:
        if (this.config.alertOnFailure) {
          await this.alertSyncFailed(event);
        }
        break;

      case SyncEventType.ErrorOccurred:
        if (this.config.alertOnErrors) {
          await this.alertErrorOccurred(event);
        }
        break;

      case SyncEventType.TableSyncFailed:
        if (this.config.alertOnFailure) {
          await this.alertTableSyncFailed(event);
        }
        break;
    }
  }

  /**
   * Alert on conflict detection
   */
  private async alertConflictDetected(event: SyncEvent): Promise<void> {
    const conflict = event.data.conflict;

    // Check threshold
    if (this.config.conflictThreshold &&
        conflict &&
        this.config.conflictThreshold > 1) {
      // Only alert if threshold exceeded
      return;
    }

    await this.alertManager.sendAlert({
      id: `conflict_${event.syncId}_${Date.now()}`,
      type: 'drift_detected', // Use drift_detected as closest match
      severity: 'medium',
      message: `Data conflict detected in sync ${event.syncId}`,
      details: {
        syncId: event.syncId,
        tableName: conflict?.tableName,
        primaryKey: conflict?.primaryKey,
        strategy: event.data.strategy,
        timestamp: event.timestamp,
        // PHI in conflict data will be automatically masked by alert manager
        sourceData: conflict?.sourceData,
        targetData: conflict?.targetData
      },
      timestamp: event.timestamp,
      acknowledged: false
    });

    this.logger.info('Conflict alert sent', {
      syncId: event.syncId,
      table: conflict?.tableName
    });
  }

  /**
   * Alert on sync completion
   */
  private async alertSyncCompleted(event: SyncEvent): Promise<void> {
    const result: SyncSessionResult = event.data.result;

    // Determine severity based on conflicts and errors
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (result.summary.totalErrors > 0) {
      severity = 'medium';
    }

    if (result.summary.totalConflicts > (this.config.conflictThreshold || 10)) {
      severity = 'high';
    }

    await this.alertManager.sendAlert({
      id: `sync_completed_${event.syncId}_${Date.now()}`,
      type: 'migration_completed',
      severity,
      message: `Data synchronization completed: ${result.summary.successfulTables}/${result.summary.totalTables} tables synced`,
      details: {
        syncId: event.syncId,
        duration: result.durationMs,
        summary: result.summary,
        tablesSuccessful: result.summary.successfulTables,
        tablesFailed: result.summary.failedTables,
        totalInserted: result.summary.totalInserted,
        totalUpdated: result.summary.totalUpdated,
        totalDeleted: result.summary.totalDeleted,
        totalConflicts: result.summary.totalConflicts,
        totalErrors: result.summary.totalErrors
      },
      timestamp: event.timestamp,
      acknowledged: false
    });

    this.logger.info('Sync completion alert sent', {
      syncId: event.syncId,
      success: result.success
    });
  }

  /**
   * Alert on sync failure
   */
  private async alertSyncFailed(event: SyncEvent): Promise<void> {
    await this.alertManager.sendAlert({
      id: `sync_failed_${event.syncId}_${Date.now()}`,
      type: 'migration_failed',
      severity: 'critical',
      message: `Data synchronization failed for ${event.syncId}`,
      details: {
        syncId: event.syncId,
        error: event.error?.message || 'Unknown error',
        stack: event.error?.stack,
        timestamp: event.timestamp
      },
      timestamp: event.timestamp,
      acknowledged: false
    });

    this.logger.error('Sync failure alert sent', {
      syncId: event.syncId,
      error: event.error
    });
  }

  /**
   * Alert on error
   */
  private async alertErrorOccurred(event: SyncEvent): Promise<void> {
    await this.alertManager.sendAlert({
      id: `sync_error_${event.syncId}_${Date.now()}`,
      type: 'migration_failed',
      severity: 'high',
      message: `Error occurred during data synchronization`,
      details: {
        syncId: event.syncId,
        error: event.data.error || event.error?.message,
        timestamp: event.timestamp
      },
      timestamp: event.timestamp,
      acknowledged: false
    });
  }

  /**
   * Alert on table sync failure
   */
  private async alertTableSyncFailed(event: SyncEvent): Promise<void> {
    await this.alertManager.sendAlert({
      id: `table_sync_failed_${event.syncId}_${Date.now()}`,
      type: 'migration_failed',
      severity: 'high',
      message: `Table sync failed: ${event.data.table}`,
      details: {
        syncId: event.syncId,
        table: event.data.table,
        error: event.data.error,
        timestamp: event.timestamp
      },
      timestamp: event.timestamp,
      acknowledged: false
    });
  }

  /**
   * Get alert manager (for manual alerts)
   */
  getAlertManager(): EnhancedAlertManager {
    return this.alertManager;
  }
}

/**
 * Helper function to create sync with alerts
 */
export async function createSyncWithAlerts(
  syncManager: DataSyncManager,
  alertConfig: PHIAwareAlertConfig,
  options?: {
    alertOnConflicts?: boolean;
    alertOnErrors?: boolean;
    alertOnCompletion?: boolean;
    alertOnFailure?: boolean;
    conflictThreshold?: number;
    errorThreshold?: number;
  }
): Promise<SyncAlertIntegration> {
  const integration = new SyncAlertIntegration(syncManager, {
    alertConfig,
    alertOnConflicts: options?.alertOnConflicts ?? true,
    alertOnErrors: options?.alertOnErrors ?? true,
    alertOnCompletion: options?.alertOnCompletion ?? true,
    alertOnFailure: options?.alertOnFailure ?? true,
    conflictThreshold: options?.conflictThreshold ?? 10,
    errorThreshold: options?.errorThreshold ?? 5
  });

  return integration;
}
