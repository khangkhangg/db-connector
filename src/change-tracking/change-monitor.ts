/**
 * Change Monitor - Polls for changes and sends notifications
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { DatabaseType } from '../schema/types';
import { ChangelogManager, ChangeRecord } from './changelog-manager';
import { WebhookNotifier } from './webhook-notifier';
import { ChangeNotificationWebSocketServer } from '../api/websocket-server';
import { createLogger } from '../utils/logger';

const logger = createLogger('ChangeMonitor');

export interface ChangeMonitorConfig {
  pollIntervalMs: number; // How often to check for changes
  batchSize: number; // How many changes to process at once
  enableWebhooks: boolean; // Send webhook notifications
  enableWebSocket: boolean; // Send WebSocket notifications
}

export class ChangeMonitor {
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(
    private connector: BaseDatabaseConnector,
    private dbType: DatabaseType,
    private config: ChangeMonitorConfig,
    private wsServer?: ChangeNotificationWebSocketServer
  ) {}

  /**
   * Start monitoring for changes
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Change monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting change monitor', {
      pollIntervalMs: this.config.pollIntervalMs,
      batchSize: this.config.batchSize,
      enableWebhooks: this.config.enableWebhooks,
      enableWebSocket: this.config.enableWebSocket
    });

    // Start polling
    this.intervalId = setInterval(() => {
      this.pollChanges().catch(error => {
        logger.error('Error polling changes', { error: error.message });
      });
    }, this.config.pollIntervalMs);

    // Do an immediate poll
    await this.pollChanges();
  }

  /**
   * Stop monitoring for changes
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    logger.info('Change monitor stopped');
  }

  /**
   * Poll for unsynced changes and process them
   */
  private async pollChanges(): Promise<void> {
    try {
      const changelogManager = new ChangelogManager(this.connector, this.dbType);

      // Get unsynced changes
      const changes = await changelogManager.getUnsyncedChanges(this.config.batchSize);

      if (changes.length === 0) {
        return; // No changes to process
      }

      logger.info('Processing changes', { count: changes.length });

      // Send webhook notifications
      if (this.config.enableWebhooks) {
        await this.sendWebhookNotifications(changes, changelogManager);
      }

      // Send WebSocket notifications
      if (this.config.enableWebSocket && this.wsServer) {
        this.sendWebSocketNotifications(changes);
      }

      // Mark changes as processed (synced)
      const changeIds = changes.map(c => c.id);
      await changelogManager.markAsSynced(changeIds);

      logger.info('Changes processed successfully', { count: changes.length });
    } catch (error: any) {
      logger.error('Failed to poll changes', { error: error.message });
    }
  }

  /**
   * Send webhook notifications
   */
  private async sendWebhookNotifications(
    changes: ChangeRecord[],
    changelogManager: ChangelogManager
  ): Promise<void> {
    try {
      // Get all active webhooks
      const webhooks = await changelogManager.getActiveWebhooks();

      if (webhooks.length === 0) {
        return;
      }

      // Parse webhook configs
      const webhookConfigs = webhooks.map(wh => ({
        id: wh.id,
        url: wh.url,
        events: this.parseJSON(wh.events) || [],
        tableName: wh.table_name,
        active: wh.active === true || wh.active === 1
      }));

      // Send notifications
      const notifier = new WebhookNotifier();
      await notifier.notifyBatchChanges(changes, webhookConfigs);
    } catch (error: any) {
      logger.error('Failed to send webhook notifications', { error: error.message });
    }
  }

  /**
   * Send WebSocket notifications
   */
  private sendWebSocketNotifications(changes: ChangeRecord[]): void {
    if (!this.wsServer) return;

    try {
      this.wsServer.broadcastBatchChanges(changes);
    } catch (error: any) {
      logger.error('Failed to send WebSocket notifications', { error: error.message });
    }
  }

  /**
   * Parse JSON safely
   */
  private parseJSON(data: any): any {
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  /**
   * Check if monitor is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
