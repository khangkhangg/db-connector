/**
 * Webhook Notifier - Sends notifications to registered webhooks
 */

import axios from 'axios';
import { ChangeRecord } from './changelog-manager';
import { createLogger } from '../utils/logger';

const logger = createLogger('WebhookNotifier');

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  tableName?: string;
  active: boolean;
}

export class WebhookNotifier {
  /**
   * Notify webhooks about a change
   */
  async notifyWebhooks(change: ChangeRecord, webhooks: WebhookConfig[]): Promise<void> {
    const relevantWebhooks = this.filterRelevantWebhooks(change, webhooks);

    if (relevantWebhooks.length === 0) {
      logger.debug('No relevant webhooks found for change', {
        tableName: change.tableName,
        operation: change.operation
      });
      return;
    }

    const payload = this.createWebhookPayload(change);

    // Send to all relevant webhooks in parallel
    const promises = relevantWebhooks.map(webhook =>
      this.sendWebhook(webhook.url, payload)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Notify multiple changes in batch
   */
  async notifyBatchChanges(changes: ChangeRecord[], webhooks: WebhookConfig[]): Promise<void> {
    if (changes.length === 0) return;

    // Group changes by table
    const changesByTable = new Map<string, ChangeRecord[]>();
    for (const change of changes) {
      const existing = changesByTable.get(change.tableName) || [];
      existing.push(change);
      changesByTable.set(change.tableName, existing);
    }

    // Send batch notification for each table
    for (const [tableName, tableChanges] of changesByTable) {
      const relevantWebhooks = webhooks.filter(wh =>
        wh.active && (!wh.tableName || wh.tableName === tableName)
      );

      if (relevantWebhooks.length === 0) continue;

      const payload = {
        event: 'batch_change',
        tableName,
        changes: tableChanges.map(c => this.createWebhookPayload(c)),
        count: tableChanges.length,
        timestamp: new Date().toISOString()
      };

      const promises = relevantWebhooks.map(webhook =>
        this.sendWebhook(webhook.url, payload)
      );

      await Promise.allSettled(promises);
    }
  }

  /**
   * Filter webhooks that should receive this change notification
   */
  private filterRelevantWebhooks(change: ChangeRecord, webhooks: WebhookConfig[]): WebhookConfig[] {
    return webhooks.filter(webhook => {
      // Check if webhook is active
      if (!webhook.active) return false;

      // Check table filter
      if (webhook.tableName && webhook.tableName !== change.tableName) {
        return false;
      }

      // Check event filter
      const eventName = change.operation.toLowerCase();
      if (webhook.events.includes('*') || webhook.events.includes(eventName)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Create webhook payload from change record
   */
  private createWebhookPayload(change: ChangeRecord): any {
    return {
      event: change.operation.toLowerCase(),
      tableName: change.tableName,
      recordId: change.recordId,
      data: change.newData,
      oldData: change.oldData,
      timestamp: change.timestamp.toISOString(),
      changeId: change.id
    };
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhook(url: string, payload: any): Promise<void> {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DB-Connector-Webhook/1.0'
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info('Webhook sent successfully', {
        url,
        status: response.status,
        event: payload.event
      });
    } catch (error: any) {
      logger.error('Failed to send webhook', {
        url,
        error: error.message,
        event: payload.event
      });
    }
  }
}
