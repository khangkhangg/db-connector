/**
 * SLO (Service Level Objective) and error budget tracking
 */

import { createLogger } from '../utils/logger';

/**
 * SLO definition
 */
export interface SLO {
  name: string;
  description: string;
  target: number; // e.g., 99.9 for 99.9%
  window: number; // Time window in milliseconds
  type: 'availability' | 'latency' | 'error_rate' | 'custom';
  threshold?: number; // For latency SLOs (in ms)
}

/**
 * SLO status
 */
export interface SLOStatus {
  slo: SLO;
  current: number;
  target: number;
  inBudget: boolean;
  errorBudget: number;
  errorBudgetRemaining: number;
  errorBudgetConsumed: number;
  violationCount: number;
  lastViolation?: Date;
  severity: 'ok' | 'warning' | 'critical';
}

/**
 * Error budget period
 */
export interface ErrorBudgetPeriod {
  start: Date;
  end: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorBudgetAllowed: number;
  errorBudgetUsed: number;
  errorBudgetRemaining: number;
}

/**
 * SLO event
 */
interface SLOEvent {
  timestamp: Date;
  success: boolean;
  latency?: number;
}

/**
 * SLO and error budget tracker
 */
export class SLOTracker {
  private logger = createLogger('SLOTracker');
  private slos: Map<string, SLO> = new Map();
  private events: Map<string, SLOEvent[]> = new Map();
  private maxEventsPerSLO = 100000;

  // Default SLOs
  private defaultSLOs: SLO[] = [
    {
      name: 'availability',
      description: 'Database availability - 99.9% of requests succeed',
      target: 99.9,
      window: 30 * 24 * 60 * 60 * 1000, // 30 days
      type: 'availability'
    },
    {
      name: 'query_latency_p95',
      description: '95th percentile query latency under 100ms',
      target: 95,
      window: 24 * 60 * 60 * 1000, // 24 hours
      type: 'latency',
      threshold: 100 // 100ms
    },
    {
      name: 'query_latency_p99',
      description: '99th percentile query latency under 500ms',
      target: 99,
      window: 24 * 60 * 60 * 1000, // 24 hours
      type: 'latency',
      threshold: 500 // 500ms
    },
    {
      name: 'error_rate',
      description: 'Query error rate below 0.1%',
      target: 99.9, // 99.9% success = 0.1% error
      window: 7 * 24 * 60 * 60 * 1000, // 7 days
      type: 'error_rate'
    },
    {
      name: 'connection_success_rate',
      description: 'Connection success rate 99.95%',
      target: 99.95,
      window: 24 * 60 * 60 * 1000, // 24 hours
      type: 'availability'
    }
  ];

  constructor() {
    // Register default SLOs
    this.defaultSLOs.forEach(slo => this.registerSLO(slo));
  }

  /**
   * Register an SLO
   */
  registerSLO(slo: SLO): void {
    this.slos.set(slo.name, slo);
    if (!this.events.has(slo.name)) {
      this.events.set(slo.name, []);
    }
    this.logger.info('SLO registered', { name: slo.name, target: slo.target });
  }

  /**
   * Record an event for SLO tracking
   */
  recordEvent(sloName: string, success: boolean, latency?: number): void {
    const events = this.events.get(sloName);
    if (!events) {
      this.logger.warn('SLO not found', { sloName });
      return;
    }

    events.push({
      timestamp: new Date(),
      success,
      latency
    });

    // Limit event history
    if (events.length > this.maxEventsPerSLO) {
      events.shift();
    }

    // Check for violations
    const status = this.getSLOStatus(sloName);
    if (status && !status.inBudget) {
      this.logger.warn('SLO budget exhausted', {
        slo: sloName,
        current: status.current,
        target: status.target
      });
    }
  }

  /**
   * Get SLO status
   */
  getSLOStatus(sloName: string): SLOStatus | null {
    const slo = this.slos.get(sloName);
    if (!slo) return null;

    const events = this.events.get(sloName) || [];

    // Filter events within window
    const cutoff = Date.now() - slo.window;
    const recentEvents = events.filter(e => e.timestamp.getTime() > cutoff);

    if (recentEvents.length === 0) {
      return {
        slo,
        current: 100,
        target: slo.target,
        inBudget: true,
        errorBudget: 100 - slo.target,
        errorBudgetRemaining: 100 - slo.target,
        errorBudgetConsumed: 0,
        violationCount: 0,
        severity: 'ok'
      };
    }

    let current: number;
    let violationCount = 0;
    let lastViolation: Date | undefined;

    if (slo.type === 'availability' || slo.type === 'error_rate') {
      const successCount = recentEvents.filter(e => e.success).length;
      current = (successCount / recentEvents.length) * 100;

      // Count violations
      recentEvents.forEach(e => {
        if (!e.success) {
          violationCount++;
          lastViolation = e.timestamp;
        }
      });
    } else if (slo.type === 'latency' && slo.threshold) {
      const withinThreshold = recentEvents.filter(
        e => e.latency !== undefined && e.latency <= slo.threshold!
      ).length;
      current = (withinThreshold / recentEvents.length) * 100;

      // Count violations
      recentEvents.forEach(e => {
        if (e.latency !== undefined && e.latency > slo.threshold!) {
          violationCount++;
          lastViolation = e.timestamp;
        }
      });
    } else {
      current = 100;
    }

    const errorBudget = 100 - slo.target;
    const errorBudgetConsumed = 100 - current;
    const errorBudgetRemaining = errorBudget - errorBudgetConsumed;
    const inBudget = current >= slo.target;

    // Determine severity
    let severity: 'ok' | 'warning' | 'critical' = 'ok';
    const budgetUsedPercent = (errorBudgetConsumed / errorBudget) * 100;

    if (!inBudget) {
      severity = 'critical';
    } else if (budgetUsedPercent > 75) {
      severity = 'warning';
    }

    return {
      slo,
      current,
      target: slo.target,
      inBudget,
      errorBudget,
      errorBudgetRemaining: Math.max(0, errorBudgetRemaining),
      errorBudgetConsumed,
      violationCount,
      lastViolation,
      severity
    };
  }

  /**
   * Get all SLO statuses
   */
  getAllSLOStatuses(): SLOStatus[] {
    const statuses: SLOStatus[] = [];

    for (const sloName of this.slos.keys()) {
      const status = this.getSLOStatus(sloName);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Get error budget for period
   */
  getErrorBudget(sloName: string, start: Date, end: Date): ErrorBudgetPeriod | null {
    const slo = this.slos.get(sloName);
    if (!slo) return null;

    const events = this.events.get(sloName) || [];

    // Filter events in period
    const periodEvents = events.filter(
      e => e.timestamp >= start && e.timestamp <= end
    );

    const totalRequests = periodEvents.length;
    const successfulRequests = periodEvents.filter(e => e.success).length;
    const failedRequests = totalRequests - successfulRequests;

    const errorBudgetAllowed = Math.floor((totalRequests * (100 - slo.target)) / 100);
    const errorBudgetUsed = failedRequests;
    const errorBudgetRemaining = Math.max(0, errorBudgetAllowed - errorBudgetUsed);

    return {
      start,
      end,
      totalRequests,
      successfulRequests,
      failedRequests,
      errorBudgetAllowed,
      errorBudgetUsed,
      errorBudgetRemaining
    };
  }

  /**
   * Check if SLO is violated
   */
  isSLOViolated(sloName: string): boolean {
    const status = this.getSLOStatus(sloName);
    return status ? !status.inBudget : false;
  }

  /**
   * Get SLO compliance report
   */
  getComplianceReport(): {
    totalSLOs: number;
    compliantSLOs: number;
    violatedSLOs: number;
    complianceRate: number;
    statuses: SLOStatus[];
  } {
    const statuses = this.getAllSLOStatuses();
    const compliantSLOs = statuses.filter(s => s.inBudget).length;
    const violatedSLOs = statuses.filter(s => !s.inBudget).length;

    return {
      totalSLOs: statuses.length,
      compliantSLOs,
      violatedSLOs,
      complianceRate: statuses.length > 0 ? (compliantSLOs / statuses.length) * 100 : 100,
      statuses
    };
  }

  /**
   * Generate SLO report
   */
  generateReport(): string {
    const lines: string[] = [
      '═══════════════════════════════════════',
      '        SLO & ERROR BUDGET REPORT',
      '═══════════════════════════════════════',
      ''
    ];

    const report = this.getComplianceReport();

    lines.push(`Total SLOs: ${report.totalSLOs}`);
    lines.push(`Compliant: ${report.compliantSLOs} (${report.complianceRate.toFixed(1)}%)`);
    lines.push(`Violated: ${report.violatedSLOs}`);
    lines.push('');

    if (report.violatedSLOs > 0) {
      lines.push('⚠️  VIOLATED SLOs:');
      lines.push('─────────────────────────────────────');
    }

    report.statuses.forEach(status => {
      const icon = status.severity === 'critical' ? '🔴' :
                   status.severity === 'warning' ? '⚠️' : '✓';

      lines.push(`${icon} ${status.slo.name}`);
      lines.push(`   Target: ${status.target}%`);
      lines.push(`   Current: ${status.current.toFixed(2)}%`);
      lines.push(`   Error Budget: ${status.errorBudgetRemaining.toFixed(2)}% remaining`);

      if (status.violationCount > 0) {
        lines.push(`   Violations: ${status.violationCount}`);
        if (status.lastViolation) {
          lines.push(`   Last Violation: ${status.lastViolation.toISOString()}`);
        }
      }

      lines.push('');
    });

    lines.push('═══════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Calculate burn rate
   */
  getBurnRate(sloName: string, windowHours: number = 1): number {
    const slo = this.slos.get(sloName);
    if (!slo) return 0;

    const events = this.events.get(sloName) || [];
    const cutoff = Date.now() - (windowHours * 60 * 60 * 1000);
    const recentEvents = events.filter(e => e.timestamp.getTime() > cutoff);

    if (recentEvents.length === 0) return 0;

    const failureRate = recentEvents.filter(e => !e.success).length / recentEvents.length;
    const allowedFailureRate = (100 - slo.target) / 100;

    return failureRate / allowedFailureRate;
  }

  /**
   * Predict budget exhaustion
   */
  predictBudgetExhaustion(sloName: string): Date | null {
    const status = this.getSLOStatus(sloName);
    if (!status || status.inBudget) return null;

    const burnRate = this.getBurnRate(sloName, 1);
    if (burnRate === 0) return null;

    const hoursRemaining = status.errorBudgetRemaining / (burnRate * 100);
    const exhaustionDate = new Date(Date.now() + hoursRemaining * 60 * 60 * 1000);

    return exhaustionDate;
  }

  /**
   * Reset SLO tracking
   */
  reset(sloName?: string): void {
    if (sloName) {
      this.events.set(sloName, []);
      this.logger.info('SLO reset', { sloName });
    } else {
      this.events.clear();
      this.slos.forEach((_, name) => this.events.set(name, []));
      this.logger.info('All SLOs reset');
    }
  }
}
