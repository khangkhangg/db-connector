/**
 * Connection pool monitoring and metrics collection
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { MSSQLConnector } from '../connectors/mssql-connector';
import { MySQLConnector } from '../connectors/mysql-connector';
import { createLogger } from '../utils/logger';

export interface PoolMetrics {
  timestamp: Date;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  poolSize: {
    min: number;
    max: number;
  };
  utilizationPercent: number;
}

export interface QueryMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageExecutionTime: number;
  slowQueries: number;
  slowQueryThreshold: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  failedConnections: number;
  connectionErrors: string[];
  averageConnectionTime: number;
}

/**
 * Connection pool monitor
 */
export class ConnectionPoolMonitor {
  private logger = createLogger('ConnectionPoolMonitor');
  private queryMetrics: QueryMetrics = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    averageExecutionTime: 0,
    slowQueries: 0,
    slowQueryThreshold: 1000 // 1 second
  };
  private connectionMetrics: ConnectionMetrics = {
    totalConnections: 0,
    failedConnections: 0,
    connectionErrors: [],
    averageConnectionTime: 0
  };
  private queryExecutionTimes: number[] = [];
  private connectionTimes: number[] = [];
  private monitoringInterval?: NodeJS.Timeout;

  constructor(
    private connector: BaseDatabaseConnector,
    private alertThresholds: {
      poolUtilization?: number;
      slowQueryTime?: number;
      failureRate?: number;
    } = {}
  ) {
    this.alertThresholds = {
      poolUtilization: alertThresholds.poolUtilization || 80,
      slowQueryTime: alertThresholds.slowQueryTime || 1000,
      failureRate: alertThresholds.failureRate || 0.1
    };
  }

  /**
   * Start monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    this.logger.info('Starting connection pool monitoring', { intervalMs });

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.info('Stopped connection pool monitoring');
    }
  }

  /**
   * Collect pool metrics
   */
  async getPoolMetrics(): Promise<PoolMetrics> {
    const metrics: PoolMetrics = {
      timestamp: new Date(),
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      poolSize: { min: 0, max: 10 },
      utilizationPercent: 0
    };

    try {
      if (this.connector instanceof MSSQLConnector) {
        const pool = (this.connector as any).pool;
        if (pool) {
          metrics.totalConnections = pool.size;
          metrics.activeConnections = pool.connected;
          metrics.idleConnections = pool.size - pool.connected;
          metrics.poolSize = {
            min: pool.config.pool?.min || 0,
            max: pool.config.pool?.max || 10
          };
          metrics.utilizationPercent = (pool.connected / metrics.poolSize.max) * 100;
        }
      } else if (this.connector instanceof MySQLConnector) {
        const pool = (this.connector as any).pool;
        if (pool && pool.pool) {
          const poolConnection = pool.pool;
          metrics.totalConnections = poolConnection._allConnections?.length || 0;
          metrics.activeConnections = poolConnection._acquiringConnections?.length || 0;
          metrics.idleConnections = poolConnection._freeConnections?.length || 0;
          metrics.waitingRequests = poolConnection._connectionQueue?.length || 0;
          metrics.poolSize = {
            min: 0,
            max: poolConnection.config.connectionLimit || 10
          };
          metrics.utilizationPercent = metrics.poolSize.max > 0
            ? (metrics.activeConnections / metrics.poolSize.max) * 100
            : 0;
        }
      }
    } catch (error) {
      this.logger.error('Failed to collect pool metrics', { error });
    }

    return metrics;
  }

  /**
   * Get query metrics
   */
  getQueryMetrics(): QueryMetrics {
    return { ...this.queryMetrics };
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  /**
   * Record query execution
   */
  recordQueryExecution(executionTimeMs: number, success: boolean): void {
    this.queryMetrics.totalQueries++;

    if (success) {
      this.queryMetrics.successfulQueries++;
    } else {
      this.queryMetrics.failedQueries++;
    }

    this.queryExecutionTimes.push(executionTimeMs);

    // Keep only last 1000 execution times
    if (this.queryExecutionTimes.length > 1000) {
      this.queryExecutionTimes.shift();
    }

    // Calculate average
    this.queryMetrics.averageExecutionTime =
      this.queryExecutionTimes.reduce((a, b) => a + b, 0) / this.queryExecutionTimes.length;

    // Track slow queries
    if (executionTimeMs > this.queryMetrics.slowQueryThreshold) {
      this.queryMetrics.slowQueries++;
      this.logger.warn('Slow query detected', { executionTimeMs });
    }

    // Check for alerts
    this.checkQueryAlerts();
  }

  /**
   * Record connection attempt
   */
  recordConnectionAttempt(connectionTimeMs: number, success: boolean, error?: string): void {
    this.connectionMetrics.totalConnections++;

    if (success) {
      this.connectionTimes.push(connectionTimeMs);

      // Keep only last 100 connection times
      if (this.connectionTimes.length > 100) {
        this.connectionTimes.shift();
      }

      this.connectionMetrics.averageConnectionTime =
        this.connectionTimes.reduce((a, b) => a + b, 0) / this.connectionTimes.length;
    } else {
      this.connectionMetrics.failedConnections++;
      if (error) {
        this.connectionMetrics.connectionErrors.push(error);
        // Keep only last 50 errors
        if (this.connectionMetrics.connectionErrors.length > 50) {
          this.connectionMetrics.connectionErrors.shift();
        }
      }
    }

    this.checkConnectionAlerts();
  }

  /**
   * Collect and log metrics
   */
  private async collectMetrics(): Promise<void> {
    const poolMetrics = await this.getPoolMetrics();
    const queryMetrics = this.getQueryMetrics();
    const connectionMetrics = this.getConnectionMetrics();

    this.logger.info('Connection pool metrics', {
      pool: poolMetrics,
      queries: queryMetrics,
      connections: connectionMetrics
    });

    // Check pool utilization
    if (poolMetrics.utilizationPercent > this.alertThresholds.poolUtilization!) {
      this.logger.warn('High pool utilization detected', {
        utilization: poolMetrics.utilizationPercent,
        threshold: this.alertThresholds.poolUtilization
      });
    }
  }

  /**
   * Check query-related alerts
   */
  private checkQueryAlerts(): void {
    const failureRate = this.queryMetrics.totalQueries > 0
      ? this.queryMetrics.failedQueries / this.queryMetrics.totalQueries
      : 0;

    if (failureRate > this.alertThresholds.failureRate!) {
      this.logger.error('High query failure rate detected', {
        failureRate,
        threshold: this.alertThresholds.failureRate,
        failedQueries: this.queryMetrics.failedQueries,
        totalQueries: this.queryMetrics.totalQueries
      });
    }
  }

  /**
   * Check connection-related alerts
   */
  private checkConnectionAlerts(): void {
    const failureRate = this.connectionMetrics.totalConnections > 0
      ? this.connectionMetrics.failedConnections / this.connectionMetrics.totalConnections
      : 0;

    if (failureRate > this.alertThresholds.failureRate!) {
      this.logger.error('High connection failure rate detected', {
        failureRate,
        threshold: this.alertThresholds.failureRate,
        failedConnections: this.connectionMetrics.failedConnections,
        totalConnections: this.connectionMetrics.totalConnections
      });
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.queryMetrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageExecutionTime: 0,
      slowQueries: 0,
      slowQueryThreshold: this.queryMetrics.slowQueryThreshold
    };
    this.connectionMetrics = {
      totalConnections: 0,
      failedConnections: 0,
      connectionErrors: [],
      averageConnectionTime: 0
    };
    this.queryExecutionTimes = [];
    this.connectionTimes = [];

    this.logger.info('Metrics reset');
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    poolUtilization: number;
    queryFailureRate: number;
    connectionFailureRate: number;
    issues: string[];
  }> {
    const poolMetrics = await this.getPoolMetrics();
    const queryFailureRate = this.queryMetrics.totalQueries > 0
      ? this.queryMetrics.failedQueries / this.queryMetrics.totalQueries
      : 0;
    const connectionFailureRate = this.connectionMetrics.totalConnections > 0
      ? this.connectionMetrics.failedConnections / this.connectionMetrics.totalConnections
      : 0;

    const issues: string[] = [];
    let healthy = true;

    if (poolMetrics.utilizationPercent > this.alertThresholds.poolUtilization!) {
      issues.push(`High pool utilization: ${poolMetrics.utilizationPercent.toFixed(1)}%`);
      healthy = false;
    }

    if (queryFailureRate > this.alertThresholds.failureRate!) {
      issues.push(`High query failure rate: ${(queryFailureRate * 100).toFixed(1)}%`);
      healthy = false;
    }

    if (connectionFailureRate > this.alertThresholds.failureRate!) {
      issues.push(`High connection failure rate: ${(connectionFailureRate * 100).toFixed(1)}%`);
      healthy = false;
    }

    return {
      healthy,
      poolUtilization: poolMetrics.utilizationPercent,
      queryFailureRate,
      connectionFailureRate,
      issues
    };
  }
}
