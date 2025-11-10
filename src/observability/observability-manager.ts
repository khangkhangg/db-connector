/**
 * Main observability manager - coordinates all monitoring and observability components
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { AuditLogger } from './audit-logger';
import { MetricsCollector } from './metrics-collector';
import { SLOTracker } from './slo-tracker';
import { RunbookManager } from './runbook-manager';
import { AlertThresholdManager } from './alert-threshold-manager';
import { HealthCheck } from './health-check';
import { PerformanceProfiler } from './performance-profiler';
import { createLogger } from '../utils/logger';

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  enableAuditLogging?: boolean;
  enableMetrics?: boolean;
  enableSLOTracking?: boolean;
  enableAlerts?: boolean;
  enableHealthChecks?: boolean;
  enableProfiling?: boolean;
  enableDistributedTracing?: boolean;
  auditLogRetentionDays?: number;
  metricsRetentionHours?: number;
  alertEvaluationIntervalMs?: number;
}

/**
 * Observability manager
 */
export class ObservabilityManager {
  private logger = createLogger('ObservabilityManager');
  private auditLogger?: AuditLogger;
  private metricsCollector?: MetricsCollector;
  private sloTracker?: SLOTracker;
  private runbookManager?: RunbookManager;
  private alertManager?: AlertThresholdManager;
  private healthCheck?: HealthCheck;
  private profiler?: PerformanceProfiler;
  private alertEvaluationInterval?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(
    private connector: BaseDatabaseConnector,
    private config: ObservabilityConfig = {}
  ) {
    this.config = {
      enableAuditLogging: true,
      enableMetrics: true,
      enableSLOTracking: true,
      enableAlerts: true,
      enableHealthChecks: true,
      enableProfiling: true,
      enableDistributedTracing: false,
      auditLogRetentionDays: 90,
      metricsRetentionHours: 24,
      alertEvaluationIntervalMs: 60000, // 1 minute
      ...config
    };

    this.logger.info('Observability manager created', this.config);
  }

  /**
   * Initialize observability system
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing observability system');

    try {
      // Initialize audit logger
      if (this.config.enableAuditLogging) {
        this.auditLogger = new AuditLogger(
          this.connector,
          this.config.auditLogRetentionDays
        );
        await this.auditLogger.initialize();
        this.logger.info('Audit logger initialized');
      }

      // Initialize metrics collector
      if (this.config.enableMetrics) {
        this.metricsCollector = new MetricsCollector();
        this.logger.info('Metrics collector initialized');
      }

      // Initialize SLO tracker
      if (this.config.enableSLOTracking) {
        this.sloTracker = new SLOTracker();
        this.logger.info('SLO tracker initialized');
      }

      // Initialize runbook manager
      this.runbookManager = new RunbookManager();
      this.logger.info('Runbook manager initialized');

      // Initialize alert manager
      if (this.config.enableAlerts) {
        this.alertManager = new AlertThresholdManager(
          this.metricsCollector,
          this.sloTracker,
          this.auditLogger
        );
        this.startAlertEvaluation();
        this.logger.info('Alert manager initialized');
      }

      // Initialize health check
      if (this.config.enableHealthChecks) {
        this.healthCheck = new HealthCheck(
          this.connector,
          this.metricsCollector,
          { includeMetrics: true }
        );
        this.healthCheck.markStarted();
        this.logger.info('Health check initialized');
      }

      // Initialize profiler
      if (this.config.enableProfiling) {
        this.profiler = new PerformanceProfiler();
        this.logger.info('Performance profiler initialized');
      }

      this.isInitialized = true;

      // Mark as ready
      if (this.healthCheck) {
        this.healthCheck.markReady();
      }

      this.logger.info('Observability system initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize observability system', { error });
      throw error;
    }
  }

  /**
   * Start alert evaluation
   */
  private startAlertEvaluation(): void {
    if (!this.alertManager) return;

    const interval = this.config.alertEvaluationIntervalMs!;

    this.alertEvaluationInterval = setInterval(async () => {
      try {
        await this.alertManager!.evaluateThresholds();
      } catch (error) {
        this.logger.error('Alert evaluation error', { error });
      }
    }, interval);

    this.logger.info('Alert evaluation started', { intervalMs: interval });
  }

  /**
   * Stop alert evaluation
   */
  private stopAlertEvaluation(): void {
    if (this.alertEvaluationInterval) {
      clearInterval(this.alertEvaluationInterval);
      this.alertEvaluationInterval = undefined;
      this.logger.info('Alert evaluation stopped');
    }
  }

  /**
   * Get audit logger
   */
  getAuditLogger(): AuditLogger | undefined {
    return this.auditLogger;
  }

  /**
   * Get metrics collector
   */
  getMetricsCollector(): MetricsCollector | undefined {
    return this.metricsCollector;
  }

  /**
   * Get SLO tracker
   */
  getSLOTracker(): SLOTracker | undefined {
    return this.sloTracker;
  }

  /**
   * Get runbook manager
   */
  getRunbookManager(): RunbookManager | undefined {
    return this.runbookManager;
  }

  /**
   * Get alert manager
   */
  getAlertManager(): AlertThresholdManager | undefined {
    return this.alertManager;
  }

  /**
   * Get health check
   */
  getHealthCheck(): HealthCheck | undefined {
    return this.healthCheck;
  }

  /**
   * Get profiler
   */
  getProfiler(): PerformanceProfiler | undefined {
    return this.profiler;
  }

  /**
   * Record query execution
   */
  async recordQuery(options: {
    operation: string;
    table: string;
    durationMs: number;
    success: boolean;
    rowsAffected?: number;
    error?: string;
    query?: string;
    userId?: string;
  }): Promise<void> {
    // Record metrics
    if (this.metricsCollector) {
      this.metricsCollector.recordQuery({
        durationMs: options.durationMs,
        success: options.success,
        operation: options.operation,
        table: options.table
      });
    }

    // Record SLO
    if (this.sloTracker) {
      this.sloTracker.recordEvent('query_latency_p95', options.success, options.durationMs);
      this.sloTracker.recordEvent('query_latency_p99', options.success, options.durationMs);
      this.sloTracker.recordEvent('availability', options.success);
    }

    // Audit log
    if (this.auditLogger && options.operation !== 'SELECT') {
      await this.auditLogger.logEvent({
        event_type: this.mapOperationToEventType(options.operation),
        severity: options.success ? 'low' : 'high',
        user_id: options.userId,
        resource: options.table,
        action: options.operation.toLowerCase(),
        result: options.success ? 'success' : 'failure',
        details: {
          durationMs: options.durationMs,
          rowsAffected: options.rowsAffected,
          error: options.error
        }
      });
    }
  }

  /**
   * Map SQL operation to audit event type
   */
  private mapOperationToEventType(operation: string): string {
    const opUpper = operation.toUpperCase();

    if (opUpper === 'SELECT') return 'DATA_READ';
    if (opUpper === 'INSERT') return 'DATA_CREATE';
    if (opUpper === 'UPDATE') return 'DATA_UPDATE';
    if (opUpper === 'DELETE') return 'DATA_DELETE';
    if (opUpper.includes('CREATE') || opUpper.includes('ALTER') || opUpper.includes('DROP')) {
      return 'SCHEMA_MODIFY';
    }

    return 'DATA_ACCESS';
  }

  /**
   * Record transaction
   */
  async recordTransaction(options: {
    status: 'committed' | 'rolled_back';
    durationMs: number;
    operationCount: number;
    userId?: string;
  }): Promise<void> {
    // Record metrics
    if (this.metricsCollector) {
      this.metricsCollector.recordTransaction(options.status);
    }

    // Audit log
    if (this.auditLogger) {
      await this.auditLogger.logEvent({
        event_type: 'TRANSACTION_COMMIT',
        severity: options.status === 'committed' ? 'low' : 'medium',
        user_id: options.userId,
        action: `transaction.${options.status}`,
        result: 'success',
        details: {
          status: options.status,
          durationMs: options.durationMs,
          operationCount: options.operationCount
        }
      });
    }
  }

  /**
   * Record connection pool state
   */
  recordPoolState(state: {
    active: number;
    idle: number;
    waiting: number;
    total: number;
    max: number;
  }): void {
    if (this.metricsCollector) {
      this.metricsCollector.recordPoolState(state);
    }

    // Record SLO for connection success
    if (this.sloTracker && state.waiting === 0) {
      this.sloTracker.recordEvent('connection_success_rate', true);
    } else if (this.sloTracker && state.waiting > 0) {
      this.sloTracker.recordEvent('connection_success_rate', false);
    }
  }

  /**
   * Get comprehensive dashboard
   */
  async getDashboard(): Promise<{
    status: string;
    metrics: any;
    slos: any;
    alerts: any;
    health: any;
    performance: any;
    timestamp: Date;
  }> {
    const dashboard: any = {
      timestamp: new Date()
    };

    // Health status
    if (this.healthCheck) {
      const health = await this.healthCheck.health();
      dashboard.status = health.status;
      dashboard.health = health;
    }

    // Metrics
    if (this.metricsCollector) {
      dashboard.metrics = {
        queries: this.metricsCollector.getMetrics(),
        pool: this.metricsCollector.getPoolMetrics(),
        transactions: this.metricsCollector.getTransactionMetrics()
      };
    }

    // SLOs
    if (this.sloTracker) {
      const sloNames = ['availability', 'query_latency_p95', 'query_latency_p99', 'error_rate'];
      dashboard.slos = {};

      for (const sloName of sloNames) {
        const status = this.sloTracker.getSLOStatus(sloName);
        if (status) {
          dashboard.slos[sloName] = status;
        }
      }
    }

    // Alerts
    if (this.alertManager) {
      dashboard.alerts = {
        active: this.alertManager.getActiveAlerts(),
        unacknowledged: this.alertManager.getUnacknowledgedAlerts()
      };
    }

    // Performance
    if (this.profiler) {
      const slowOps = this.profiler.getSlowOperations(10);
      dashboard.performance = {
        slowOperations: slowOps,
        memoryUsage: this.profiler.getMemoryUsage(),
        cpuUsage: this.profiler.getCPUUsage()
      };
    }

    return dashboard;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    if (!this.metricsCollector) {
      return '';
    }

    return this.metricsCollector.getPrometheusMetrics();
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: { start: Date; end: Date };
    auditEvents: any[];
    summary: any;
  } | null> {
    if (!this.auditLogger) {
      return null;
    }

    const auditEvents = await this.auditLogger.getAuditLogs({
      startDate,
      endDate,
      limit: 10000
    });

    // Generate summary statistics
    const summary = {
      totalEvents: auditEvents.length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byResult: {} as Record<string, number>,
      phiAccessCount: auditEvents.filter(e => e.phi_accessed).length
    };

    for (const event of auditEvents) {
      // By type
      summary.byType[event.event_type] = (summary.byType[event.event_type] || 0) + 1;

      // By severity
      summary.bySeverity[event.severity] = (summary.bySeverity[event.severity] || 0) + 1;

      // By result
      summary.byResult[event.result] = (summary.byResult[event.result] || 0) + 1;
    }

    return {
      period: { start: startDate, end: endDate },
      auditEvents,
      summary
    };
  }

  /**
   * Shutdown observability system
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down observability system');

    // Mark as not ready
    if (this.healthCheck) {
      this.healthCheck.markNotReady();
    }

    // Stop alert evaluation
    this.stopAlertEvaluation();

    // Cleanup alert manager
    if (this.alertManager) {
      this.alertManager.cleanup();
    }

    // Clear profiler history
    if (this.profiler) {
      this.profiler.clearHistory();
    }

    this.isInitialized = false;

    this.logger.info('Observability system shut down');
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
