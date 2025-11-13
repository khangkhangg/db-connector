/**
 * Comprehensive metrics collection for observability
 */

import { createLogger } from '../utils/logger';

/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

/**
 * Metric definition
 */
export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  labels?: string[];
  values: MetricDataPoint[];
}

/**
 * Query metrics
 */
export interface QueryMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  slowQueries: number;
  queriesPerSecond: number;
}

/**
 * Connection pool metrics
 */
export interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalConnections: number;
  utilizationPercent: number;
  connectionAcquireTime: number;
  connectionErrors: number;
}

/**
 * System metrics
 */
export interface SystemMetrics {
  cpuUsagePercent: number;
  memoryUsageMB: number;
  memoryUsagePercent: number;
  uptime: number;
  timestamp: Date;
}

/**
 * Comprehensive metrics collector
 */
export class MetricsCollector {
  private logger = createLogger('MetricsCollector');
  private metrics: Map<string, Metric> = new Map();
  private queryLatencies: number[] = [];
  private connectionAcquireTimes: number[] = [];
  private maxHistorySize = 10000;

  // Counters
  private totalQueries = 0;
  private successfulQueries = 0;
  private failedQueries = 0;
  private slowQueries = 0;
  private connectionErrors = 0;

  // Gauges
  private activeConnections = 0;
  private idleConnections = 0;
  private waitingRequests = 0;

  // Time windows for rate calculations
  private queryTimestamps: number[] = [];
  private windowSize = 60000; // 1 minute

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize standard metrics
   */
  private initializeMetrics(): void {
    // Query metrics
    this.registerMetric({
      name: 'db_queries_total',
      type: MetricType.COUNTER,
      help: 'Total number of database queries executed',
      labels: ['status', 'table'],
      values: []
    });

    this.registerMetric({
      name: 'db_query_duration_seconds',
      type: MetricType.HISTOGRAM,
      help: 'Database query execution duration in seconds',
      labels: ['operation', 'table'],
      values: []
    });

    this.registerMetric({
      name: 'db_slow_queries_total',
      type: MetricType.COUNTER,
      help: 'Total number of slow queries (>1s)',
      values: []
    });

    // Connection pool metrics
    this.registerMetric({
      name: 'db_pool_active_connections',
      type: MetricType.GAUGE,
      help: 'Number of active database connections',
      values: []
    });

    this.registerMetric({
      name: 'db_pool_idle_connections',
      type: MetricType.GAUGE,
      help: 'Number of idle database connections',
      values: []
    });

    this.registerMetric({
      name: 'db_pool_waiting_requests',
      type: MetricType.GAUGE,
      help: 'Number of requests waiting for connections',
      values: []
    });

    this.registerMetric({
      name: 'db_pool_utilization_percent',
      type: MetricType.GAUGE,
      help: 'Connection pool utilization percentage',
      values: []
    });

    this.registerMetric({
      name: 'db_connection_errors_total',
      type: MetricType.COUNTER,
      help: 'Total number of connection errors',
      values: []
    });

    // Transaction metrics
    this.registerMetric({
      name: 'db_transactions_total',
      type: MetricType.COUNTER,
      help: 'Total number of database transactions',
      labels: ['status'],
      values: []
    });

    // Migration metrics
    this.registerMetric({
      name: 'db_migrations_total',
      type: MetricType.COUNTER,
      help: 'Total number of migrations executed',
      labels: ['status'],
      values: []
    });

    this.registerMetric({
      name: 'db_drift_checks_total',
      type: MetricType.COUNTER,
      help: 'Total number of drift detection checks',
      labels: ['has_drift'],
      values: []
    });
  }

  /**
   * Register a metric
   */
  registerMetric(metric: Metric): void {
    this.metrics.set(metric.name, metric);
  }

  /**
   * Record query execution
   */
  recordQuery(options: {
    durationMs: number;
    success: boolean;
    operation?: string;
    table?: string;
    slow?: boolean;
  }): void {
    this.totalQueries++;
    this.queryTimestamps.push(Date.now());

    // Clean old timestamps
    const cutoff = Date.now() - this.windowSize;
    this.queryTimestamps = this.queryTimestamps.filter(ts => ts > cutoff);

    if (options.success) {
      this.successfulQueries++;
    } else {
      this.failedQueries++;
    }

    if (options.slow || options.durationMs > 1000) {
      this.slowQueries++;
      this.incrementCounter('db_slow_queries_total');
    }

    // Record latency
    this.queryLatencies.push(options.durationMs);
    if (this.queryLatencies.length > this.maxHistorySize) {
      this.queryLatencies.shift();
    }

    // Update metrics
    this.incrementCounter('db_queries_total', {
      status: options.success ? 'success' : 'failure',
      table: options.table || 'unknown'
    });

    this.recordHistogram('db_query_duration_seconds', options.durationMs / 1000, {
      operation: options.operation || 'query',
      table: options.table || 'unknown'
    });
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
    this.activeConnections = state.active;
    this.idleConnections = state.idle;
    this.waitingRequests = state.waiting;

    const utilization = state.max > 0 ? (state.active / state.max) * 100 : 0;

    this.setGauge('db_pool_active_connections', state.active);
    this.setGauge('db_pool_idle_connections', state.idle);
    this.setGauge('db_pool_waiting_requests', state.waiting);
    this.setGauge('db_pool_utilization_percent', utilization);
  }

  /**
   * Record connection acquire time
   */
  recordConnectionAcquire(durationMs: number, success: boolean): void {
    if (success) {
      this.connectionAcquireTimes.push(durationMs);
      if (this.connectionAcquireTimes.length > this.maxHistorySize) {
        this.connectionAcquireTimes.shift();
      }
    } else {
      this.connectionErrors++;
      this.incrementCounter('db_connection_errors_total');
    }
  }

  /**
   * Record transaction
   */
  recordTransaction(status: 'committed' | 'rolled_back'): void {
    this.incrementCounter('db_transactions_total', { status });
  }

  /**
   * Record migration
   */
  recordMigration(status: 'completed' | 'failed'): void {
    this.incrementCounter('db_migrations_total', { status });
  }

  /**
   * Record drift check
   */
  recordDriftCheck(hasDrift: boolean): void {
    this.incrementCounter('db_drift_checks_total', {
      has_drift: hasDrift ? 'true' : 'false'
    });
  }

  /**
   * Get query metrics
   */
  getQueryMetrics(): QueryMetrics {
    const latencies = [...this.queryLatencies].sort((a, b) => a - b);

    return {
      totalQueries: this.totalQueries,
      successfulQueries: this.successfulQueries,
      failedQueries: this.failedQueries,
      averageLatency: this.calculateAverage(latencies),
      p50Latency: this.calculatePercentile(latencies, 50),
      p95Latency: this.calculatePercentile(latencies, 95),
      p99Latency: this.calculatePercentile(latencies, 99),
      slowQueries: this.slowQueries,
      queriesPerSecond: this.queryTimestamps.length / (this.windowSize / 1000)
    };
  }

  /**
   * Get pool metrics
   */
  getPoolMetrics(): PoolMetrics {
    return {
      activeConnections: this.activeConnections,
      idleConnections: this.idleConnections,
      waitingRequests: this.waitingRequests,
      totalConnections: this.activeConnections + this.idleConnections,
      utilizationPercent: 0, // Would be calculated based on max pool size
      connectionAcquireTime: this.calculateAverage(this.connectionAcquireTimes),
      connectionErrors: this.connectionErrors
    };
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const usage = process.memoryUsage();

    return {
      cpuUsagePercent: 0, // Would require system monitoring
      memoryUsageMB: usage.heapUsed / 1024 / 1024,
      memoryUsagePercent: (usage.heapUsed / usage.heapTotal) * 100,
      uptime: process.uptime(),
      timestamp: new Date()
    };
  }

  /**
   * Get all metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      // Metric help
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      // Metric values
      if (metric.values.length > 0) {
        const latest = metric.values[metric.values.length - 1];
        const labelStr = latest.labels
          ? Object.entries(latest.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',')
          : '';

        const metricLine = labelStr
          ? `${metric.name}{${labelStr}} ${latest.value}`
          : `${metric.name} ${latest.value}`;

        lines.push(metricLine);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    queries: QueryMetrics;
    pool: PoolMetrics;
    system: SystemMetrics;
  } {
    return {
      queries: this.getQueryMetrics(),
      pool: this.getPoolMetrics(),
      system: this.getSystemMetrics()
    };
  }

  /**
   * Get all metrics (alias for getMetricsSummary)
   */
  getMetrics(): {
    queries: QueryMetrics;
    pool: PoolMetrics;
    system: SystemMetrics;
  } {
    return this.getMetricsSummary();
  }

  /**
   * Get transaction metrics
   */
  getTransactionMetrics(): {
    total: number;
    committed: number;
    rolledBack: number;
  } {
    const committedMetric = this.metrics.get('db_transaction_committed_total');
    const rolledBackMetric = this.metrics.get('db_transaction_rolled_back_total');

    const committed = committedMetric?.values[committedMetric.values.length - 1]?.value || 0;
    const rolledBack = rolledBackMetric?.values[rolledBackMetric.values.length - 1]?.value || 0;

    return {
      total: committed + rolledBack,
      committed,
      rolledBack
    };
  }

  /**
   * Increment counter
   */
  private incrementCounter(name: string, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    const existing = metric.values.find(v =>
      labels ? JSON.stringify(v.labels) === JSON.stringify(labels) : !v.labels
    );

    if (existing) {
      existing.value++;
      existing.timestamp = new Date();
    } else {
      metric.values.push({
        timestamp: new Date(),
        value: 1,
        labels
      });
    }
  }

  /**
   * Set gauge value
   */
  private setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    const existing = metric.values.find(v =>
      labels ? JSON.stringify(v.labels) === JSON.stringify(labels) : !v.labels
    );

    if (existing) {
      existing.value = value;
      existing.timestamp = new Date();
    } else {
      metric.values.push({
        timestamp: new Date(),
        value,
        labels
      });
    }
  }

  /**
   * Record histogram value
   */
  private recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    metric.values.push({
      timestamp: new Date(),
      value,
      labels
    });

    // Keep only recent values
    if (metric.values.length > this.maxHistorySize) {
      metric.values.shift();
    }
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[index] || 0;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.totalQueries = 0;
    this.successfulQueries = 0;
    this.failedQueries = 0;
    this.slowQueries = 0;
    this.connectionErrors = 0;
    this.queryLatencies = [];
    this.connectionAcquireTimes = [];
    this.queryTimestamps = [];

    for (const metric of this.metrics.values()) {
      metric.values = [];
    }
  }
}
