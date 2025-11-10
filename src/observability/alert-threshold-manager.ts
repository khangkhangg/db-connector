/**
 * Alert threshold manager with escalation policies
 */

import { createLogger } from '../utils/logger';
import { MetricsCollector } from './metrics-collector';
import { SLOTracker } from './slo-tracker';
import { AuditLogger } from './audit-logger';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Alert threshold definition
 */
export interface AlertThreshold {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: AlertSeverity;
  enabled: boolean;
  cooldownMs: number; // Minimum time between alerts
  evaluationWindowMs: number; // Time window for metric evaluation
}

/**
 * Escalation policy
 */
export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  levels: EscalationLevel[];
  enabled: boolean;
}

/**
 * Escalation level
 */
export interface EscalationLevel {
  level: number;
  delayMs: number; // Time to wait before escalating
  channels: string[]; // e.g., ['slack', 'email', 'pagerduty']
  recipients: string[];
  message?: string;
}

/**
 * Alert event
 */
export interface AlertEvent {
  id: string;
  thresholdId: string;
  severity: AlertSeverity;
  metric: string;
  currentValue: number;
  threshold: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  escalationLevel: number;
  escalationPolicyId?: string;
}

/**
 * Alert threshold manager
 */
export class AlertThresholdManager {
  private logger = createLogger('AlertThresholdManager');
  private thresholds = new Map<string, AlertThreshold>();
  private escalationPolicies = new Map<string, EscalationPolicy>();
  private activeAlerts = new Map<string, AlertEvent>();
  private alertHistory: AlertEvent[] = [];
  private lastAlertTime = new Map<string, number>();
  private escalationTimers = new Map<string, NodeJS.Timeout>();
  private maxHistorySize = 10000;

  constructor(
    private metricsCollector?: MetricsCollector,
    private sloTracker?: SLOTracker,
    private auditLogger?: AuditLogger
  ) {
    this.logger.info('Alert threshold manager initialized');
    this.registerDefaultThresholds();
    this.registerDefaultEscalationPolicies();
  }

  /**
   * Register default alert thresholds
   */
  private registerDefaultThresholds(): void {
    // Query performance thresholds
    this.registerThreshold({
      id: 'query_p95_latency',
      name: 'Query P95 Latency',
      description: 'Alert when 95th percentile query latency exceeds threshold',
      metric: 'query.latency.p95',
      condition: 'gt',
      threshold: 100, // 100ms
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 300000, // 5 minutes
      evaluationWindowMs: 60000 // 1 minute
    });

    this.registerThreshold({
      id: 'query_p99_latency',
      name: 'Query P99 Latency',
      description: 'Alert when 99th percentile query latency exceeds threshold',
      metric: 'query.latency.p99',
      condition: 'gt',
      threshold: 500, // 500ms
      severity: AlertSeverity.ERROR,
      enabled: true,
      cooldownMs: 300000,
      evaluationWindowMs: 60000
    });

    // Error rate thresholds
    this.registerThreshold({
      id: 'query_error_rate',
      name: 'Query Error Rate',
      description: 'Alert when query error rate exceeds threshold',
      metric: 'query.error_rate',
      condition: 'gt',
      threshold: 0.01, // 1%
      severity: AlertSeverity.ERROR,
      enabled: true,
      cooldownMs: 300000,
      evaluationWindowMs: 60000
    });

    this.registerThreshold({
      id: 'high_error_rate',
      name: 'High Error Rate',
      description: 'Critical alert for very high error rate',
      metric: 'query.error_rate',
      condition: 'gt',
      threshold: 0.05, // 5%
      severity: AlertSeverity.CRITICAL,
      enabled: true,
      cooldownMs: 180000, // 3 minutes
      evaluationWindowMs: 60000
    });

    // Connection pool thresholds
    this.registerThreshold({
      id: 'pool_utilization_high',
      name: 'High Pool Utilization',
      description: 'Alert when connection pool utilization is high',
      metric: 'pool.utilization',
      condition: 'gt',
      threshold: 0.8, // 80%
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 300000,
      evaluationWindowMs: 60000
    });

    this.registerThreshold({
      id: 'pool_utilization_critical',
      name: 'Critical Pool Utilization',
      description: 'Critical alert when pool is nearly exhausted',
      metric: 'pool.utilization',
      condition: 'gt',
      threshold: 0.95, // 95%
      severity: AlertSeverity.CRITICAL,
      enabled: true,
      cooldownMs: 180000,
      evaluationWindowMs: 60000
    });

    this.registerThreshold({
      id: 'pool_queue_size',
      name: 'Pool Queue Size',
      description: 'Alert when connection pool queue is backing up',
      metric: 'pool.waiting',
      condition: 'gt',
      threshold: 10,
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 300000,
      evaluationWindowMs: 60000
    });

    // Transaction thresholds
    this.registerThreshold({
      id: 'transaction_rollback_rate',
      name: 'Transaction Rollback Rate',
      description: 'Alert when transaction rollback rate is high',
      metric: 'transaction.rollback_rate',
      condition: 'gt',
      threshold: 0.1, // 10%
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 300000,
      evaluationWindowMs: 300000 // 5 minutes
    });

    // SLO burn rate thresholds
    this.registerThreshold({
      id: 'slo_burn_rate_fast',
      name: 'Fast SLO Burn Rate',
      description: 'Alert when error budget is burning quickly',
      metric: 'slo.burn_rate',
      condition: 'gt',
      threshold: 10, // 10x normal rate
      severity: AlertSeverity.CRITICAL,
      enabled: true,
      cooldownMs: 180000,
      evaluationWindowMs: 60000
    });

    this.logger.info('Registered default alert thresholds', {
      count: this.thresholds.size
    });
  }

  /**
   * Register default escalation policies
   */
  private registerDefaultEscalationPolicies(): void {
    // Critical incidents policy
    this.registerEscalationPolicy({
      id: 'critical_incident',
      name: 'Critical Incident',
      description: 'Escalation policy for critical incidents requiring immediate attention',
      enabled: true,
      levels: [
        {
          level: 1,
          delayMs: 0, // Immediate
          channels: ['slack', 'pagerduty'],
          recipients: ['oncall-primary'],
          message: 'CRITICAL: Immediate attention required'
        },
        {
          level: 2,
          delayMs: 300000, // 5 minutes
          channels: ['slack', 'pagerduty', 'email'],
          recipients: ['oncall-primary', 'oncall-secondary'],
          message: 'CRITICAL: Escalated to secondary on-call'
        },
        {
          level: 3,
          delayMs: 600000, // 10 minutes
          channels: ['slack', 'pagerduty', 'email', 'phone'],
          recipients: ['oncall-primary', 'oncall-secondary', 'engineering-manager'],
          message: 'CRITICAL: Escalated to engineering manager'
        }
      ]
    });

    // High priority policy
    this.registerEscalationPolicy({
      id: 'high_priority',
      name: 'High Priority',
      description: 'Escalation policy for high priority issues',
      enabled: true,
      levels: [
        {
          level: 1,
          delayMs: 0,
          channels: ['slack'],
          recipients: ['oncall-primary'],
          message: 'HIGH: Attention needed'
        },
        {
          level: 2,
          delayMs: 900000, // 15 minutes
          channels: ['slack', 'email'],
          recipients: ['oncall-primary', 'oncall-secondary'],
          message: 'HIGH: Escalated to secondary on-call'
        },
        {
          level: 3,
          delayMs: 1800000, // 30 minutes
          channels: ['slack', 'email', 'pagerduty'],
          recipients: ['oncall-primary', 'oncall-secondary', 'team-lead'],
          message: 'HIGH: Escalated to team lead'
        }
      ]
    });

    // Standard policy
    this.registerEscalationPolicy({
      id: 'standard',
      name: 'Standard',
      description: 'Standard escalation policy for warnings',
      enabled: true,
      levels: [
        {
          level: 1,
          delayMs: 0,
          channels: ['slack'],
          recipients: ['oncall-primary'],
          message: 'WARNING: Please review'
        },
        {
          level: 2,
          delayMs: 3600000, // 1 hour
          channels: ['slack', 'email'],
          recipients: ['oncall-primary', 'team'],
          message: 'WARNING: Escalated to team'
        }
      ]
    });

    this.logger.info('Registered default escalation policies', {
      count: this.escalationPolicies.size
    });
  }

  /**
   * Register alert threshold
   */
  registerThreshold(threshold: AlertThreshold): void {
    this.thresholds.set(threshold.id, threshold);
    this.logger.debug('Threshold registered', {
      id: threshold.id,
      metric: threshold.metric
    });
  }

  /**
   * Register escalation policy
   */
  registerEscalationPolicy(policy: EscalationPolicy): void {
    this.escalationPolicies.set(policy.id, policy);
    this.logger.debug('Escalation policy registered', {
      id: policy.id,
      levels: policy.levels.length
    });
  }

  /**
   * Evaluate thresholds against current metrics
   */
  async evaluateThresholds(): Promise<AlertEvent[]> {
    const newAlerts: AlertEvent[] = [];

    for (const threshold of this.thresholds.values()) {
      if (!threshold.enabled) continue;

      try {
        const currentValue = await this.getMetricValue(threshold.metric);

        if (currentValue === null) continue;

        const breached = this.evaluateCondition(
          currentValue,
          threshold.condition,
          threshold.threshold
        );

        if (breached) {
          const alert = await this.createAlert(threshold, currentValue);
          if (alert) {
            newAlerts.push(alert);
          }
        }
      } catch (error) {
        this.logger.error('Error evaluating threshold', {
          threshold: threshold.id,
          error
        });
      }
    }

    return newAlerts;
  }

  /**
   * Get metric value
   */
  private async getMetricValue(metric: string): Promise<number | null> {
    if (!this.metricsCollector && !this.sloTracker) {
      return null;
    }

    // Parse metric path (e.g., "query.latency.p95")
    const parts = metric.split('.');

    if (parts[0] === 'query' && this.metricsCollector) {
      const metrics = this.metricsCollector.getMetrics();

      if (parts[1] === 'latency') {
        if (parts[2] === 'p95') return metrics.p95Latency;
        if (parts[2] === 'p99') return metrics.p99Latency;
        if (parts[2] === 'avg') return metrics.averageLatency;
      }

      if (parts[1] === 'error_rate') {
        const total = metrics.totalQueries;
        const failed = metrics.failedQueries;
        return total > 0 ? failed / total : 0;
      }
    }

    if (parts[0] === 'pool' && this.metricsCollector) {
      const poolMetrics = this.metricsCollector.getPoolMetrics();

      if (parts[1] === 'utilization') {
        return poolMetrics.currentUtilization;
      }
      if (parts[1] === 'waiting') {
        return poolMetrics.waiting;
      }
    }

    if (parts[0] === 'transaction' && this.metricsCollector) {
      const txMetrics = this.metricsCollector.getTransactionMetrics();
      const total = txMetrics.committed + txMetrics.rolledBack;

      if (parts[1] === 'rollback_rate') {
        return total > 0 ? txMetrics.rolledBack / total : 0;
      }
    }

    if (parts[0] === 'slo' && this.sloTracker && parts[1] === 'burn_rate') {
      // Would calculate burn rate from SLO tracker
      // For now, return null as placeholder
      return null;
    }

    return null;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(
    value: number,
    condition: string,
    threshold: number
  ): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  /**
   * Create alert
   */
  private async createAlert(
    threshold: AlertThreshold,
    currentValue: number
  ): Promise<AlertEvent | null> {
    // Check cooldown
    const lastAlert = this.lastAlertTime.get(threshold.id);
    const now = Date.now();

    if (lastAlert && (now - lastAlert) < threshold.cooldownMs) {
      return null; // Still in cooldown period
    }

    const alertEvent: AlertEvent = {
      id: `alert_${threshold.id}_${now}`,
      thresholdId: threshold.id,
      severity: threshold.severity,
      metric: threshold.metric,
      currentValue,
      threshold: threshold.threshold,
      message: this.formatAlertMessage(threshold, currentValue),
      timestamp: new Date(),
      acknowledged: false,
      resolved: false,
      escalationLevel: 0
    };

    // Add to active alerts
    this.activeAlerts.set(alertEvent.id, alertEvent);
    this.addToHistory(alertEvent);
    this.lastAlertTime.set(threshold.id, now);

    // Log to audit trail
    if (this.auditLogger) {
      await this.auditLogger.logEvent({
        event_type: 'ALERT_TRIGGERED',
        severity: 'high',
        action: 'alert.triggered',
        resource: threshold.metric,
        result: 'success',
        details: {
          alertId: alertEvent.id,
          threshold: threshold.name,
          currentValue,
          thresholdValue: threshold.threshold
        }
      });
    }

    this.logger.warn('Alert triggered', {
      id: alertEvent.id,
      threshold: threshold.name,
      severity: threshold.severity,
      currentValue,
      thresholdValue: threshold.threshold
    });

    // Start escalation if applicable
    this.startEscalation(alertEvent);

    return alertEvent;
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(threshold: AlertThreshold, currentValue: number): string {
    return `${threshold.name}: ${threshold.metric} is ${currentValue.toFixed(2)} ` +
           `(threshold: ${threshold.threshold}). ${threshold.description}`;
  }

  /**
   * Start escalation
   */
  private startEscalation(alert: AlertEvent): void {
    const policyId = this.getEscalationPolicyForSeverity(alert.severity);
    if (!policyId) return;

    const policy = this.escalationPolicies.get(policyId);
    if (!policy || !policy.enabled) return;

    alert.escalationPolicyId = policyId;

    // Trigger first level immediately
    this.escalateToLevel(alert, 0);

    // Schedule subsequent levels
    for (let i = 1; i < policy.levels.length; i++) {
      const level = policy.levels[i];
      const timer = setTimeout(() => {
        if (!alert.acknowledged && !alert.resolved) {
          this.escalateToLevel(alert, i);
        }
      }, level.delayMs);

      this.escalationTimers.set(`${alert.id}_level_${i}`, timer);
    }
  }

  /**
   * Escalate to specific level
   */
  private escalateToLevel(alert: AlertEvent, levelIndex: number): void {
    if (!alert.escalationPolicyId) return;

    const policy = this.escalationPolicies.get(alert.escalationPolicyId);
    if (!policy || levelIndex >= policy.levels.length) return;

    const level = policy.levels[levelIndex];
    alert.escalationLevel = level.level;

    this.logger.warn('Alert escalated', {
      alertId: alert.id,
      level: level.level,
      channels: level.channels,
      recipients: level.recipients
    });

    // Here you would integrate with actual notification channels
    // For now, just log the escalation
  }

  /**
   * Get escalation policy for severity
   */
  private getEscalationPolicyForSeverity(severity: AlertSeverity): string | null {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return 'critical_incident';
      case AlertSeverity.ERROR:
        return 'high_priority';
      case AlertSeverity.WARNING:
        return 'standard';
      default:
        return null;
    }
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    // Cancel pending escalations
    this.cancelEscalations(alertId);

    // Log to audit trail
    if (this.auditLogger) {
      await this.auditLogger.logEvent({
        event_type: 'ALERT_ACKNOWLEDGED',
        severity: 'low',
        user_id: acknowledgedBy,
        action: 'alert.acknowledged',
        resource: alertId,
        result: 'success',
        details: { alertId }
      });
    }

    this.logger.info('Alert acknowledged', { alertId, acknowledgedBy });
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();

    // Cancel pending escalations
    this.cancelEscalations(alertId);

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    this.logger.info('Alert resolved', { alertId });
  }

  /**
   * Cancel escalations for alert
   */
  private cancelEscalations(alertId: string): void {
    for (const [key, timer] of this.escalationTimers.entries()) {
      if (key.startsWith(alertId)) {
        clearTimeout(timer);
        this.escalationTimers.delete(key);
      }
    }
  }

  /**
   * Add to history
   */
  private addToHistory(alert: AlertEvent): void {
    this.alertHistory.push(alert);

    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): AlertEvent[] {
    if (limit) {
      return this.alertHistory.slice(-limit);
    }
    return [...this.alertHistory];
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.acknowledged);
  }

  /**
   * Get threshold
   */
  getThreshold(id: string): AlertThreshold | undefined {
    return this.thresholds.get(id);
  }

  /**
   * Get all thresholds
   */
  getAllThresholds(): AlertThreshold[] {
    return Array.from(this.thresholds.values());
  }

  /**
   * Get escalation policy
   */
  getEscalationPolicy(id: string): EscalationPolicy | undefined {
    return this.escalationPolicies.get(id);
  }

  /**
   * Get all escalation policies
   */
  getAllEscalationPolicies(): EscalationPolicy[] {
    return Array.from(this.escalationPolicies.values());
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    // Clear all escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();
  }
}
