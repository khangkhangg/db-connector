/**
 * Alert manager for schema changes and drift detection
 */

import { SchemaAlert, AlertConfig, AlertChannel } from './migration-types';
import { createLogger } from '../utils/logger';
import axios from 'axios';

/**
 * Alert manager
 */
export class AlertManager {
  private logger = createLogger('AlertManager');
  private alertHistory: SchemaAlert[] = [];
  private maxHistorySize = 1000;

  constructor(private config: AlertConfig) {
    this.logger.info('Alert manager initialized', {
      enabled: config.enabled,
      channels: config.channels.length
    });
  }

  /**
   * Send alert
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

    // Send to all enabled channels
    const promises = this.config.channels
      .filter(channel => channel.enabled)
      .map(channel => this.sendToChannel(alert, channel));

    await Promise.allSettled(promises);

    // Add to history
    this.addToHistory(alert);
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(alert: SchemaAlert, channel: AlertChannel): Promise<void> {
    this.logger.debug('Sending to channel', { type: channel.type });

    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmail(alert, channel.config);
          break;
        case 'slack':
          await this.sendSlack(alert, channel.config);
          break;
        case 'webhook':
          await this.sendWebhook(alert, channel.config);
          break;
        case 'log':
          await this.sendLog(alert);
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
    // Implementation would integrate with email service (e.g., SendGrid, AWS SES)
    this.logger.info('Email alert sent', {
      to: config.recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.message}`
    });

    // Placeholder for actual email sending
    // const nodemailer = require('nodemailer');
    // await transporter.sendMail({...});
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
              value: JSON.stringify(alert.details, null, 2),
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
   * Get severity color for Slack
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

    // Maintain max history size
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
