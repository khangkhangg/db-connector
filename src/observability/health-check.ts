/**
 * Health check endpoints and probes
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { createLogger } from '../utils/logger';
import { MetricsCollector } from './metrics-collector';

/**
 * Health status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  checks: {
    [key: string]: ComponentHealth;
  };
  timestamp: Date;
  version?: string;
  uptime?: number;
}

/**
 * Component health
 */
export interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  latency?: number;
  details?: Record<string, any>;
}

/**
 * Probe type
 */
export enum ProbeType {
  LIVENESS = 'liveness',   // Is the service running?
  READINESS = 'readiness', // Is the service ready to accept traffic?
  STARTUP = 'startup'      // Has the service started up?
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  enableDetailedChecks?: boolean;
  timeoutMs?: number;
  includeMetrics?: boolean;
}

/**
 * Health check system
 */
export class HealthCheck {
  private logger = createLogger('HealthCheck');
  private startTime = Date.now();
  private isStarted = false;
  private isReady = false;

  constructor(
    private connector?: BaseDatabaseConnector,
    private metricsCollector?: MetricsCollector,
    private config: HealthCheckConfig = {}
  ) {
    this.config = {
      enableDetailedChecks: true,
      timeoutMs: 5000,
      includeMetrics: false,
      ...config
    };
  }

  /**
   * Mark service as started
   */
  markStarted(): void {
    this.isStarted = true;
    this.logger.info('Service marked as started');
  }

  /**
   * Mark service as ready
   */
  markReady(): void {
    this.isReady = true;
    this.logger.info('Service marked as ready');
  }

  /**
   * Mark service as not ready
   */
  markNotReady(): void {
    this.isReady = false;
    this.logger.warn('Service marked as not ready');
  }

  /**
   * Liveness probe - is the service alive?
   */
  async liveness(): Promise<HealthCheckResult> {
    const checks: { [key: string]: ComponentHealth } = {};

    // Basic liveness - process is running
    checks.process = {
      status: HealthStatus.HEALTHY,
      message: 'Process is running',
      details: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };

    // Overall status is healthy if process is running
    const status = HealthStatus.HEALTHY;

    return {
      status,
      checks,
      timestamp: new Date(),
      uptime: this.getUptime()
    };
  }

  /**
   * Readiness probe - is the service ready to accept traffic?
   */
  async readiness(): Promise<HealthCheckResult> {
    const checks: { [key: string]: ComponentHealth } = {};

    // Check if service is marked as ready
    if (!this.isReady) {
      return {
        status: HealthStatus.UNHEALTHY,
        checks: {
          service: {
            status: HealthStatus.UNHEALTHY,
            message: 'Service not ready'
          }
        },
        timestamp: new Date(),
        uptime: this.getUptime()
      };
    }

    // Check database connectivity
    if (this.connector && this.config.enableDetailedChecks) {
      checks.database = await this.checkDatabase();
    }

    // Check memory usage
    checks.memory = this.checkMemory();

    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    const status = this.aggregateStatus(statuses);

    return {
      status,
      checks,
      timestamp: new Date(),
      uptime: this.getUptime()
    };
  }

  /**
   * Startup probe - has the service finished starting up?
   */
  async startup(): Promise<HealthCheckResult> {
    const checks: { [key: string]: ComponentHealth } = {};

    // Check if service is marked as started
    checks.service = {
      status: this.isStarted ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
      message: this.isStarted ? 'Service started' : 'Service not started'
    };

    // If started, check database initialization
    if (this.isStarted && this.connector && this.config.enableDetailedChecks) {
      checks.database = await this.checkDatabase();
    }

    const statuses = Object.values(checks).map(c => c.status);
    const status = this.aggregateStatus(statuses);

    return {
      status,
      checks,
      timestamp: new Date(),
      uptime: this.getUptime()
    };
  }

  /**
   * Full health check
   */
  async health(): Promise<HealthCheckResult> {
    const checks: { [key: string]: ComponentHealth } = {};

    try {
      // Check database
      if (this.connector) {
        checks.database = await this.checkDatabase();
      }

      // Check memory
      checks.memory = this.checkMemory();

      // Check CPU
      checks.cpu = this.checkCPU();

      // Check metrics (if available)
      if (this.metricsCollector && this.config.includeMetrics) {
        checks.metrics = this.checkMetrics();
      }

      // Aggregate status
      const statuses = Object.values(checks).map(c => c.status);
      const status = this.aggregateStatus(statuses);

      return {
        status,
        checks,
        timestamp: new Date(),
        version: process.env.npm_package_version,
        uptime: this.getUptime()
      };
    } catch (error) {
      this.logger.error('Health check error', { error });

      return {
        status: HealthStatus.UNHEALTHY,
        checks: {
          error: {
            status: HealthStatus.UNHEALTHY,
            message: `Health check failed: ${error}`
          }
        },
        timestamp: new Date(),
        uptime: this.getUptime()
      };
    }
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    if (!this.connector) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Database connector not configured'
      };
    }

    const startTime = Date.now();

    try {
      // Test connection with timeout
      const testPromise = this.connector.testConnection();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), this.config.timeoutMs);
      });

      const isConnected = await Promise.race([testPromise, timeoutPromise]);
      const latency = Date.now() - startTime;

      if (isConnected) {
        // Determine status based on latency
        let status = HealthStatus.HEALTHY;
        if (latency > 1000) {
          status = HealthStatus.DEGRADED;
        }

        return {
          status,
          message: 'Database connection healthy',
          latency,
          details: {
            connected: true,
            responseTime: latency
          }
        };
      } else {
        return {
          status: HealthStatus.UNHEALTHY,
          message: 'Database connection failed',
          latency
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        status: HealthStatus.UNHEALTHY,
        message: `Database check failed: ${error}`,
        latency
      };
    }
  }

  /**
   * Check memory health
   */
  private checkMemory(): ComponentHealth {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    let status = HealthStatus.HEALTHY;
    let message = 'Memory usage normal';

    if (heapUsedPercent > 90) {
      status = HealthStatus.UNHEALTHY;
      message = 'Critical memory usage';
    } else if (heapUsedPercent > 80) {
      status = HealthStatus.DEGRADED;
      message = 'High memory usage';
    }

    return {
      status,
      message,
      details: {
        heapUsedMB: heapUsedMB.toFixed(2),
        heapTotalMB: heapTotalMB.toFixed(2),
        heapUsedPercent: heapUsedPercent.toFixed(2),
        rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
        external: (usage.external / 1024 / 1024).toFixed(2) + ' MB'
      }
    };
  }

  /**
   * Check CPU health
   */
  private checkCPU(): ComponentHealth {
    const cpuUsage = process.cpuUsage();
    const userCPU = cpuUsage.user / 1000000; // Convert to seconds
    const systemCPU = cpuUsage.system / 1000000;
    const totalCPU = userCPU + systemCPU;

    return {
      status: HealthStatus.HEALTHY,
      message: 'CPU usage normal',
      details: {
        userCPU: userCPU.toFixed(2) + 's',
        systemCPU: systemCPU.toFixed(2) + 's',
        totalCPU: totalCPU.toFixed(2) + 's'
      }
    };
  }

  /**
   * Check metrics health
   */
  private checkMetrics(): ComponentHealth {
    if (!this.metricsCollector) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Metrics collector not configured'
      };
    }

    const queryMetrics = this.metricsCollector.getMetrics();
    const poolMetrics = this.metricsCollector.getPoolMetrics();

    // Check for concerning metrics
    let status = HealthStatus.HEALTHY;
    let message = 'Metrics healthy';

    const errorRate = queryMetrics.totalQueries > 0
      ? queryMetrics.failedQueries / queryMetrics.totalQueries
      : 0;

    if (errorRate > 0.05) {
      status = HealthStatus.UNHEALTHY;
      message = 'High error rate detected';
    } else if (errorRate > 0.01) {
      status = HealthStatus.DEGRADED;
      message = 'Elevated error rate';
    } else if (poolMetrics.currentUtilization > 0.9) {
      status = HealthStatus.DEGRADED;
      message = 'High pool utilization';
    }

    return {
      status,
      message,
      details: {
        totalQueries: queryMetrics.totalQueries,
        errorRate: (errorRate * 100).toFixed(2) + '%',
        avgLatency: queryMetrics.averageLatency.toFixed(2) + 'ms',
        poolUtilization: (poolMetrics.currentUtilization * 100).toFixed(2) + '%'
      }
    };
  }

  /**
   * Aggregate status from multiple checks
   */
  private aggregateStatus(statuses: HealthStatus[]): HealthStatus {
    if (statuses.includes(HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }
    if (statuses.includes(HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }

  /**
   * Get service uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get probe result by type
   */
  async probe(type: ProbeType): Promise<HealthCheckResult> {
    switch (type) {
      case ProbeType.LIVENESS:
        return this.liveness();
      case ProbeType.READINESS:
        return this.readiness();
      case ProbeType.STARTUP:
        return this.startup();
      default:
        throw new Error(`Unknown probe type: ${type}`);
    }
  }

  /**
   * Format health check result as HTTP response
   */
  formatForHTTP(result: HealthCheckResult): {
    statusCode: number;
    body: any;
  } {
    const statusCode = result.status === HealthStatus.HEALTHY ? 200 :
                      result.status === HealthStatus.DEGRADED ? 200 :
                      503;

    return {
      statusCode,
      body: result
    };
  }

  /**
   * Get simple status string
   */
  async getSimpleStatus(): Promise<string> {
    const result = await this.health();
    return result.status;
  }
}
