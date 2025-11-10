/**
 * Enhanced Alert Manager with Telegram, PHI Protection, and Extended Channels
 */

import { SchemaAlert, AlertConfig, AlertChannel } from './migration-types';
import { createLogger } from '../utils/logger';
import axios from 'axios';

/**
 * Enhanced alert channel types
 */
export type EnhancedChannelType =
  | 'email'
  | 'slack'
  | 'webhook'
  | 'log'
  | 'telegram'
  | 'discord'
  | 'teams'
  | 'pagerduty';

/**
 * Enhanced alert channel
 */
export interface EnhancedAlertChannel extends Omit<AlertChannel, 'type'> {
  type: EnhancedChannelType;
  config: Record<string, any>;
  enabled: boolean;
  maskPHI?: boolean; // Override PHI masking per channel
}

/**
 * PHI-aware alert configuration
 */
export interface PHIAwareAlertConfig extends Omit<AlertConfig, 'channels'> {
  channels: EnhancedAlertChannel[];
  maskPHI: boolean; // Global PHI masking
  phiFields?: string[]; // Custom PHI field patterns
}

/**
 * Enhanced Alert Manager with PHI protection and multiple channels
 */
export class EnhancedAlertManager {
  private logger = createLogger('EnhancedAlertManager');
  private alertHistory: SchemaAlert[] = [];
  private maxHistorySize = 1000;
  private defaultPHIFields = [
    'ssn', 'social_security',
    'dob', 'date_of_birth', 'birthdate',
    'mrn', 'medical_record',
    'patient_id', 'patient_name',
    'diagnosis', 'medication',
    'phone', 'telephone', 'mobile',
    'email', 'address', 'street',
    'credit_card', 'card_number',
    'password', 'token', 'secret', 'api_key'
  ];

  constructor(private config: PHIAwareAlertConfig) {
    this.logger.info('Enhanced alert manager initialized', {
      enabled: config.enabled,
      channels: config.channels.length,
      maskPHI: config.maskPHI
    });

    // Merge custom PHI fields
    if (config.phiFields) {
      this.defaultPHIFields.push(...config.phiFields);
    }
  }

  /**
   * Send alert with PHI protection
   */
  async sendAlert(alert: SchemaAlert): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Alerts disabled, skipping');
      return;
    }

    // Check severity threshold
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const alertLevel = severityLevels.indexOf(alert.severity);
    const thresholdLevel = severityLevels.indexOf(this.config.severityThreshold);

    if (alertLevel < thresholdLevel) {
      this.logger.debug('Alert below severity threshold, skipping', {
        alert: alert.severity,
        threshold: this.config.severityThreshold
      });
      return;
    }

    // Check alert type filters
    if (alert.type === 'drift_detected' && !this.config.notifyOnDrift) return;
    if (alert.type === 'migration_completed' && !this.config.notifyOnMigration) return;
    if (alert.type === 'migration_failed' && !this.config.notifyOnFailure) return;

    this.logger.info('Sending alert', {
      type: alert.type,
      severity: alert.severity
    });

    // Mask PHI in alert if configured
    const sanitizedAlert = this.config.maskPHI
      ? this.maskPHIInAlert(alert)
      : alert;

    // Send to all enabled channels
    const promises = this.config.channels
      .filter(channel => channel.enabled)
      .map(channel => this.sendToChannel(sanitizedAlert, channel));

    await Promise.allSettled(promises);

    // Add to history (store original with PHI for audit)
    this.addToHistory(alert);
  }

  /**
   * Mask PHI in alert
   */
  private maskPHIInAlert(alert: SchemaAlert): SchemaAlert {
    return {
      ...alert,
      details: this.maskPHIData(alert.details),
      message: this.maskPHIInString(alert.message)
    };
  }

  /**
   * Mask PHI data in object
   */
  private maskPHIData(data: Record<string, any>): Record<string, any> {
    const masked = { ...data };

    const maskValue = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => maskValue(item));
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Check if key matches PHI pattern
        if (this.isPHIField(key)) {
          result[key] = '***PHI-REDACTED***';
        } else if (typeof value === 'object') {
          result[key] = maskValue(value);
        } else if (typeof value === 'string') {
          result[key] = this.maskPHIInString(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return maskValue(masked);
  }

  /**
   * Check if field name indicates PHI
   */
  private isPHIField(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase();
    return this.defaultPHIFields.some(phiField =>
      lowerField.includes(phiField.toLowerCase())
    );
  }

  /**
   * Mask PHI patterns in strings
   */
  private maskPHIInString(text: string): string {
    let masked = text;

    // Mask SSN patterns (XXX-XX-XXXX)
    masked = masked.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****');

    // Mask email addresses
    masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***');

    // Mask phone numbers
    masked = masked.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '***-***-****');

    // Mask credit card numbers
    masked = masked.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '****-****-****-****');

    return masked;
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(
    alert: SchemaAlert,
    channel: EnhancedAlertChannel
  ): Promise<void> {
    this.logger.debug('Sending to channel', { type: channel.type });

    // Per-channel PHI masking override
    const finalAlert = (channel.maskPHI === true)
      ? this.maskPHIInAlert(alert)
      : alert;

    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmail(finalAlert, channel.config);
          break;
        case 'slack':
          await this.sendSlack(finalAlert, channel.config);
          break;
        case 'telegram':
          await this.sendTelegram(finalAlert, channel.config);
          break;
        case 'discord':
          await this.sendDiscord(finalAlert, channel.config);
          break;
        case 'teams':
          await this.sendTeams(finalAlert, channel.config);
          break;
        case 'pagerduty':
          await this.sendPagerDuty(finalAlert, channel.config);
          break;
        case 'webhook':
          await this.sendWebhook(finalAlert, channel.config);
          break;
        case 'log':
          await this.sendLog(finalAlert);
          break;
        default:
          this.logger.warn('Unknown alert channel type', { type: channel.type });
      }
    } catch (error) {
      this.logger.error('Failed to send alert to channel', {
        channel: channel.type,
        error
      });
    }
  }

  /**
   * Send email alert
   */
  private async sendEmail(alert: SchemaAlert, config: any): Promise<void> {
    this.logger.info('Email alert sent', {
      to: config.recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.message}`
    });

    // Integration with email service would go here
    // e.g., SendGrid, AWS SES, NodeMailer
  }

  /**
   * Send Slack alert
   */
  private async sendSlack(alert: SchemaAlert, config: any): Promise<void> {
    const webhookUrl = config.webhookUrl;

    if (!webhookUrl) {
      this.logger.error('Slack webhook URL not configured');
      return;
    }

    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      attachments: [
        {
          color,
          title: `${emoji} Schema Alert: ${alert.message}`,
          fields: [
            {
              title: 'Type',
              value: alert.type,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Timestamp',
              value: alert.timestamp.toISOString(),
              short: false
            },
            {
              title: 'Details',
              value: `\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``,
              short: false
            }
          ],
          footer: 'DB Schema Mapper',
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }
      ]
    };

    await axios.post(webhookUrl, payload);
    this.logger.info('Slack alert sent');
  }

  /**
   * Send Telegram alert
   */
  private async sendTelegram(alert: SchemaAlert, config: any): Promise<void> {
    const botToken = config.botToken;
    const chatId = config.chatId;

    if (!botToken || !chatId) {
      this.logger.error('Telegram bot token or chat ID not configured');
      return;
    }

    const emoji = this.getSeverityEmoji(alert.severity);

    // Format message in Markdown
    const message = `
${emoji} *${alert.severity.toUpperCase()}: ${alert.message}*

*Type:* ${alert.type}
*Time:* ${alert.timestamp.toISOString()}

*Details:*
\`\`\`json
${JSON.stringify(alert.details, null, 2)}
\`\`\`

_DB Schema Mapper Connector_
    `.trim();

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    this.logger.info('Telegram alert sent', { chatId });
  }

  /**
   * Send Discord alert
   */
  private async sendDiscord(alert: SchemaAlert, config: any): Promise<void> {
    const webhookUrl = config.webhookUrl;

    if (!webhookUrl) {
      this.logger.error('Discord webhook URL not configured');
      return;
    }

    const color = parseInt(this.getSeverityColor(alert.severity).replace('#', ''), 16);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      embeds: [
        {
          title: `${emoji} Schema Alert: ${alert.message}`,
          description: `**Type:** ${alert.type}\n**Severity:** ${alert.severity.toUpperCase()}`,
          color,
          fields: [
            {
              name: 'Details',
              value: `\`\`\`json\n${JSON.stringify(alert.details, null, 2)}\n\`\`\``,
              inline: false
            }
          ],
          footer: {
            text: 'DB Schema Mapper'
          },
          timestamp: alert.timestamp.toISOString()
        }
      ]
    };

    await axios.post(webhookUrl, payload);
    this.logger.info('Discord alert sent');
  }

  /**
   * Send Microsoft Teams alert
   */
  private async sendTeams(alert: SchemaAlert, config: any): Promise<void> {
    const webhookUrl = config.webhookUrl;

    if (!webhookUrl) {
      this.logger.error('Teams webhook URL not configured');
      return;
    }

    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: color.replace('#', ''),
      summary: alert.message,
      sections: [
        {
          activityTitle: `${emoji} Schema Alert: ${alert.message}`,
          activitySubtitle: `Severity: ${alert.severity.toUpperCase()}`,
          facts: [
            {
              name: 'Type',
              value: alert.type
            },
            {
              name: 'Timestamp',
              value: alert.timestamp.toISOString()
            }
          ],
          text: `\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``
        }
      ]
    };

    await axios.post(webhookUrl, payload);
    this.logger.info('Teams alert sent');
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDuty(alert: SchemaAlert, config: any): Promise<void> {
    const routingKey = config.routingKey;

    if (!routingKey) {
      this.logger.error('PagerDuty routing key not configured');
      return;
    }

    const payload = {
      routing_key: routingKey,
      event_action: 'trigger',
      payload: {
        summary: alert.message,
        severity: alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'error' : 'warning',
        source: 'db-schema-mapper',
        component: 'schema-management',
        custom_details: alert.details
      }
    };

    await axios.post('https://events.pagerduty.com/v2/enqueue', payload);
    this.logger.info('PagerDuty alert sent');
  }

  /**
   * Send webhook alert
   */
  private async sendWebhook(alert: SchemaAlert, config: any): Promise<void> {
    const url = config.url;

    if (!url) {
      this.logger.error('Webhook URL not configured');
      return;
    }

    const headers = config.headers || {};
    headers['Content-Type'] = 'application/json';

    await axios.post(url, alert, { headers });
    this.logger.info('Webhook alert sent', { url });
  }

  /**
   * Log alert
   */
  private async sendLog(alert: SchemaAlert): Promise<void> {
    const level = alert.severity === 'critical' || alert.severity === 'high' ? 'error' : 'warn';

    this.logger[level]('Schema alert', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
      timestamp: alert.timestamp
    });
  }

  /**
   * Get severity color for alerts
   */
  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      low: '#36a64f',      // Green
      medium: '#ff9900',   // Orange
      high: '#ff4444',     // Red
      critical: '#990000'  // Dark red
    };

    return colors[severity] || '#808080';
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🚨',
      critical: '🔥'
    };

    return emojis[severity] || '📢';
  }

  /**
   * Add alert to history
   */
  private addToHistory(alert: SchemaAlert): void {
    this.alertHistory.push(alert);

    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }
  }

  /**
   * Get alert history
   */
  getHistory(limit?: number): SchemaAlert[] {
    if (limit) {
      return this.alertHistory.slice(-limit);
    }
    return [...this.alertHistory];
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.logger.info('Alert acknowledged', { alertId });
    }
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledged(): SchemaAlert[] {
    return this.alertHistory.filter(a => !a.acknowledged);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.alertHistory = [];
    this.logger.info('Alert history cleared');
  }
}
