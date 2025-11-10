/**
 * Webhook manager for event notifications
 */

import axios, { AxiosRequestConfig } from 'axios';
import { createLogger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * Webhook event types
 */
export enum WebhookEventType {
  SCHEMA_READ = 'schema.read',
  SCHEMA_CHANGED = 'schema.changed',
  MIGRATION_STARTED = 'migration.started',
  MIGRATION_COMPLETED = 'migration.completed',
  MIGRATION_FAILED = 'migration.failed',
  DRIFT_DETECTED = 'drift.detected',
  ALERT_TRIGGERED = 'alert.triggered',
  ALERT_RESOLVED = 'alert.resolved',
  SLO_BREACHED = 'slo.breached',
  HEALTH_DEGRADED = 'health.degraded',
  PHI_ACCESSED = 'phi.accessed',
  AUDIT_EVENT = 'audit.event'
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  secret?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Webhook payload
 */
export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: Date;
  data: any;
  metadata?: {
    source: string;
    version: string;
    [key: string]: any;
  };
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
  deliveredAt?: Date;
}

/**
 * Webhook manager
 */
export class WebhookManager extends EventEmitter {
  private logger = createLogger('WebhookManager');
  private webhooks = new Map<string, WebhookConfig>();
  private deliveryHistory: WebhookDeliveryResult[] = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.logger.info('Webhook manager initialized');
  }

  /**
   * Register webhook
   */
  registerWebhook(config: WebhookConfig): void {
    this.webhooks.set(config.id, {
      retryAttempts: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000,
      ...config
    });

    this.logger.info('Webhook registered', {
      id: config.id,
      url: config.url,
      events: config.events
    });
  }

  /**
   * Unregister webhook
   */
  unregisterWebhook(webhookId: string): boolean {
    const deleted = this.webhooks.delete(webhookId);

    if (deleted) {
      this.logger.info('Webhook unregistered', { id: webhookId });
    }

    return deleted;
  }

  /**
   * Get webhook
   */
  getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Get all webhooks
   */
  getAllWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Enable webhook
   */
  enableWebhook(webhookId: string): void {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      webhook.enabled = true;
      this.logger.info('Webhook enabled', { id: webhookId });
    }
  }

  /**
   * Disable webhook
   */
  disableWebhook(webhookId: string): void {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      webhook.enabled = false;
      this.logger.info('Webhook disabled', { id: webhookId });
    }
  }

  /**
   * Emit event to webhooks
   */
  async emitEvent(
    event: WebhookEventType,
    data: any,
    metadata?: Record<string, any>
  ): Promise<WebhookDeliveryResult[]> {
    const payload: WebhookPayload = {
      id: this.generateEventId(),
      event,
      timestamp: new Date(),
      data,
      metadata: {
        source: 'db-connector',
        version: '1.0.0',
        ...metadata
      }
    };

    this.logger.info('Emitting event', {
      event,
      eventId: payload.id
    });

    // Find webhooks subscribed to this event
    const subscribedWebhooks = Array.from(this.webhooks.values())
      .filter(wh => wh.enabled && wh.events.includes(event));

    if (subscribedWebhooks.length === 0) {
      this.logger.debug('No webhooks subscribed to event', { event });
      return [];
    }

    // Deliver to all subscribed webhooks
    const results = await Promise.all(
      subscribedWebhooks.map(webhook => this.deliverWebhook(webhook, payload))
    );

    // Emit delivery results
    this.emit('delivery', { event, results });

    return results;
  }

  /**
   * Deliver webhook with retries
   */
  private async deliverWebhook(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<WebhookDeliveryResult> {
    const result: WebhookDeliveryResult = {
      webhookId: webhook.id,
      success: false,
      attempts: 0
    };

    for (let attempt = 0; attempt <= webhook.retryAttempts!; attempt++) {
      result.attempts = attempt + 1;

      try {
        const response = await this.sendWebhookRequest(webhook, payload);

        result.success = true;
        result.statusCode = response.status;
        result.deliveredAt = new Date();

        this.logger.info('Webhook delivered successfully', {
          webhookId: webhook.id,
          url: webhook.url,
          statusCode: response.status,
          attempt: result.attempts
        });

        break;
      } catch (error: any) {
        result.error = error.message;

        this.logger.warn('Webhook delivery failed', {
          webhookId: webhook.id,
          url: webhook.url,
          attempt: result.attempts,
          error: error.message
        });

        // Wait before retry (exponential backoff)
        if (attempt < webhook.retryAttempts!) {
          const delay = webhook.retryDelayMs! * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Add to history
    this.addToHistory(result);

    return result;
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhookRequest(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<any> {
    const requestConfig: AxiosRequestConfig = {
      method: 'POST',
      url: webhook.url,
      data: payload,
      timeout: webhook.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DB-Connector-Webhook/1.0',
        'X-Webhook-Event': payload.event,
        'X-Webhook-ID': webhook.id,
        'X-Webhook-Delivery': payload.id,
        ...webhook.headers
      }
    };

    // Add signature if secret is provided
    if (webhook.secret) {
      const signature = this.generateSignature(payload, webhook.secret);
      requestConfig.headers!['X-Webhook-Signature'] = signature;
    }

    return await axios(requestConfig);
  }

  /**
   * Generate webhook signature
   */
  private generateSignature(payload: WebhookPayload, secret: string): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return 'sha256=' + hmac.digest('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(
    payload: WebhookPayload,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expected = 'sha256=' + hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add to delivery history
   */
  private addToHistory(result: WebhookDeliveryResult): void {
    this.deliveryHistory.push(result);

    if (this.deliveryHistory.length > this.maxHistorySize) {
      this.deliveryHistory.shift();
    }
  }

  /**
   * Get delivery history
   */
  getDeliveryHistory(limit?: number): WebhookDeliveryResult[] {
    if (limit) {
      return this.deliveryHistory.slice(-limit);
    }
    return [...this.deliveryHistory];
  }

  /**
   * Get failed deliveries
   */
  getFailedDeliveries(limit?: number): WebhookDeliveryResult[] {
    const failed = this.deliveryHistory.filter(r => !r.success);

    if (limit) {
      return failed.slice(-limit);
    }
    return failed;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalWebhooks: number;
    enabledWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    successRate: number;
  } {
    const totalWebhooks = this.webhooks.size;
    const enabledWebhooks = Array.from(this.webhooks.values()).filter(w => w.enabled).length;
    const totalDeliveries = this.deliveryHistory.length;
    const successfulDeliveries = this.deliveryHistory.filter(r => r.success).length;
    const failedDeliveries = this.deliveryHistory.filter(r => !r.success).length;
    const successRate = totalDeliveries > 0
      ? (successfulDeliveries / totalDeliveries) * 100
      : 0;

    return {
      totalWebhooks,
      enabledWebhooks,
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      successRate
    };
  }

  /**
   * Test webhook
   */
  async testWebhook(webhookId: string): Promise<WebhookDeliveryResult> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const testPayload: WebhookPayload = {
      id: this.generateEventId(),
      event: WebhookEventType.AUDIT_EVENT,
      timestamp: new Date(),
      data: {
        test: true,
        message: 'This is a test webhook delivery'
      },
      metadata: {
        source: 'db-connector',
        version: '1.0.0',
        test: true
      }
    };

    return await this.deliverWebhook(webhook, testPayload);
  }

  /**
   * Clear delivery history
   */
  clearHistory(): void {
    this.deliveryHistory = [];
    this.logger.info('Delivery history cleared');
  }
}
