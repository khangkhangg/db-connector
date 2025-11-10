/**
 * Performance profiling and bottleneck detection
 */

import { createLogger } from '../utils/logger';
import { performance } from 'perf_hooks';

/**
 * Performance profile
 */
export interface PerformanceProfile {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  children: PerformanceProfile[];
  metadata: Record<string, any>;
  traces: PerformanceTrace[];
}

/**
 * Performance trace
 */
export interface PerformanceTrace {
  name: string;
  timestamp: number;
  duration?: number;
  type: 'start' | 'end' | 'mark';
  metadata?: Record<string, any>;
}

/**
 * Bottleneck detection result
 */
export interface BottleneckResult {
  detected: boolean;
  bottlenecks: Bottleneck[];
  totalDuration: number;
  timestamp: Date;
}

/**
 * Bottleneck
 */
export interface Bottleneck {
  operation: string;
  duration: number;
  percentage: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

/**
 * Slow operation
 */
export interface SlowOperation {
  id: string;
  operation: string;
  duration: number;
  threshold: number;
  timestamp: Date;
  stackTrace?: string;
  metadata: Record<string, any>;
}

/**
 * Performance profiler
 */
export class PerformanceProfiler {
  private logger = createLogger('PerformanceProfiler');
  private activeProfiles = new Map<string, PerformanceProfile>();
  private completedProfiles: PerformanceProfile[] = [];
  private slowOperations: SlowOperation[] = [];
  private maxProfileHistory = 1000;
  private maxSlowOperations = 500;
  private slowOperationThresholds = new Map<string, number>();

  constructor() {
    // Set default thresholds (in milliseconds)
    this.slowOperationThresholds.set('query', 100);
    this.slowOperationThresholds.set('transaction', 1000);
    this.slowOperationThresholds.set('migration', 5000);
    this.slowOperationThresholds.set('schema_read', 2000);
    this.slowOperationThresholds.set('connection', 500);
  }

  /**
   * Start profiling an operation
   */
  start(name: string, metadata: Record<string, any> = {}): string {
    const id = `${name}_${Date.now()}_${Math.random()}`;

    const profile: PerformanceProfile = {
      id,
      name,
      startTime: performance.now(),
      children: [],
      metadata,
      traces: [
        {
          name: 'start',
          timestamp: performance.now(),
          type: 'start',
          metadata
        }
      ]
    };

    this.activeProfiles.set(id, profile);

    this.logger.debug('Started profiling', { id, name });

    return id;
  }

  /**
   * End profiling an operation
   */
  end(id: string, metadata: Record<string, any> = {}): PerformanceProfile | null {
    const profile = this.activeProfiles.get(id);

    if (!profile) {
      this.logger.warn('Profile not found', { id });
      return null;
    }

    profile.endTime = performance.now();
    profile.duration = profile.endTime - profile.startTime;
    profile.metadata = { ...profile.metadata, ...metadata };

    profile.traces.push({
      name: 'end',
      timestamp: profile.endTime,
      type: 'end',
      metadata
    });

    // Remove from active
    this.activeProfiles.delete(id);

    // Add to completed
    this.addToHistory(profile);

    // Check if operation was slow
    this.checkSlowOperation(profile);

    this.logger.debug('Ended profiling', {
      id,
      name: profile.name,
      duration: profile.duration
    });

    return profile;
  }

  /**
   * Mark a point in the profile
   */
  mark(id: string, markName: string, metadata: Record<string, any> = {}): void {
    const profile = this.activeProfiles.get(id);

    if (!profile) {
      this.logger.warn('Profile not found for mark', { id, markName });
      return;
    }

    profile.traces.push({
      name: markName,
      timestamp: performance.now(),
      type: 'mark',
      metadata
    });

    this.logger.debug('Profile mark added', { id, markName });
  }

  /**
   * Measure duration between two marks
   */
  measure(id: string, startMark: string, endMark: string): number | null {
    const profile = this.activeProfiles.get(id);

    if (!profile) {
      this.logger.warn('Profile not found for measure', { id });
      return null;
    }

    const startTrace = profile.traces.find(t => t.name === startMark);
    const endTrace = profile.traces.find(t => t.name === endMark);

    if (!startTrace || !endTrace) {
      this.logger.warn('Marks not found for measure', { startMark, endMark });
      return null;
    }

    const duration = endTrace.timestamp - startTrace.timestamp;

    this.logger.debug('Measured duration', { startMark, endMark, duration });

    return duration;
  }

  /**
   * Profile a function
   */
  async profile<T>(
    name: string,
    fn: () => Promise<T>,
    metadata: Record<string, any> = {}
  ): Promise<{ result: T; profile: PerformanceProfile }> {
    const id = this.start(name, metadata);

    try {
      const result = await fn();
      const profile = this.end(id, { success: true });

      return { result, profile: profile! };
    } catch (error) {
      const profile = this.end(id, { success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Check if operation was slow
   */
  private checkSlowOperation(profile: PerformanceProfile): void {
    const threshold = this.getThreshold(profile.name);

    if (profile.duration! > threshold) {
      const slowOp: SlowOperation = {
        id: profile.id,
        operation: profile.name,
        duration: profile.duration!,
        threshold,
        timestamp: new Date(),
        metadata: profile.metadata
      };

      // Capture stack trace
      const stack = new Error().stack;
      if (stack) {
        slowOp.stackTrace = stack;
      }

      this.slowOperations.push(slowOp);

      // Maintain max size
      if (this.slowOperations.length > this.maxSlowOperations) {
        this.slowOperations.shift();
      }

      this.logger.warn('Slow operation detected', {
        operation: profile.name,
        duration: profile.duration,
        threshold
      });
    }
  }

  /**
   * Get threshold for operation type
   */
  private getThreshold(operation: string): number {
    // Try exact match first
    if (this.slowOperationThresholds.has(operation)) {
      return this.slowOperationThresholds.get(operation)!;
    }

    // Try prefix match
    for (const [key, value] of this.slowOperationThresholds.entries()) {
      if (operation.startsWith(key)) {
        return value;
      }
    }

    // Default threshold
    return 1000; // 1 second
  }

  /**
   * Set threshold for operation type
   */
  setThreshold(operation: string, thresholdMs: number): void {
    this.slowOperationThresholds.set(operation, thresholdMs);
    this.logger.info('Threshold updated', { operation, thresholdMs });
  }

  /**
   * Detect bottlenecks in a profile
   */
  detectBottlenecks(profileId: string): BottleneckResult {
    const profile = this.getProfile(profileId);

    if (!profile || !profile.duration) {
      return {
        detected: false,
        bottlenecks: [],
        totalDuration: 0,
        timestamp: new Date()
      };
    }

    const bottlenecks: Bottleneck[] = [];

    // Analyze traces to find slow operations
    for (let i = 0; i < profile.traces.length - 1; i++) {
      const current = profile.traces[i];
      const next = profile.traces[i + 1];

      const duration = next.timestamp - current.timestamp;
      const percentage = (duration / profile.duration) * 100;

      if (percentage > 10) { // More than 10% of total time
        bottlenecks.push({
          operation: current.name,
          duration,
          percentage,
          severity: this.getSeverity(percentage),
          recommendation: this.getRecommendation(current.name, duration, percentage)
        });
      }
    }

    return {
      detected: bottlenecks.length > 0,
      bottlenecks: bottlenecks.sort((a, b) => b.percentage - a.percentage),
      totalDuration: profile.duration,
      timestamp: new Date()
    };
  }

  /**
   * Get severity based on percentage
   */
  private getSeverity(percentage: number): 'low' | 'medium' | 'high' | 'critical' {
    if (percentage > 50) return 'critical';
    if (percentage > 30) return 'high';
    if (percentage > 20) return 'medium';
    return 'low';
  }

  /**
   * Get recommendation for bottleneck
   */
  private getRecommendation(operation: string, duration: number, percentage: number): string {
    const recommendations: string[] = [];

    if (operation.includes('query')) {
      recommendations.push('Consider adding indexes or optimizing the query');
      if (duration > 1000) {
        recommendations.push('Query is taking over 1 second - review execution plan');
      }
    }

    if (operation.includes('connection')) {
      recommendations.push('Connection pool may need tuning');
      recommendations.push('Check network latency to database');
    }

    if (operation.includes('transaction')) {
      recommendations.push('Transaction is holding locks for extended period');
      recommendations.push('Consider breaking into smaller transactions');
    }

    if (operation.includes('schema')) {
      recommendations.push('Schema operations are inherently slow');
      recommendations.push('Consider running during maintenance window');
    }

    if (percentage > 50) {
      recommendations.push(`CRITICAL: This operation consumes ${percentage.toFixed(1)}% of total time`);
    }

    return recommendations.join('. ');
  }

  /**
   * Generate performance report
   */
  generateReport(limit: number = 100): string {
    const recentProfiles = this.completedProfiles.slice(-limit);

    let report = 'Performance Report\n';
    report += '='.repeat(80) + '\n\n';

    // Summary
    report += 'Summary:\n';
    report += `- Total profiles: ${this.completedProfiles.length}\n`;
    report += `- Recent profiles analyzed: ${recentProfiles.length}\n`;
    report += `- Slow operations detected: ${this.slowOperations.length}\n\n`;

    // Average durations by operation type
    const avgDurations = new Map<string, { total: number; count: number }>();

    for (const profile of recentProfiles) {
      if (!profile.duration) continue;

      const stats = avgDurations.get(profile.name) || { total: 0, count: 0 };
      stats.total += profile.duration;
      stats.count += 1;
      avgDurations.set(profile.name, stats);
    }

    report += 'Average Durations by Operation:\n';
    for (const [name, stats] of avgDurations.entries()) {
      const avg = stats.total / stats.count;
      report += `- ${name}: ${avg.toFixed(2)}ms (${stats.count} operations)\n`;
    }

    // Slowest operations
    const sortedSlowOps = [...this.slowOperations]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    if (sortedSlowOps.length > 0) {
      report += '\nTop 10 Slowest Operations:\n';
      sortedSlowOps.forEach((op, i) => {
        report += `${i + 1}. ${op.operation}: ${op.duration.toFixed(2)}ms `;
        report += `(threshold: ${op.threshold}ms)\n`;
      });
    }

    // Bottleneck analysis
    const profilesWithBottlenecks = recentProfiles
      .map(p => ({ profile: p, bottlenecks: this.detectBottlenecks(p.id) }))
      .filter(r => r.bottlenecks.detected);

    if (profilesWithBottlenecks.length > 0) {
      report += '\nBottlenecks Detected:\n';
      profilesWithBottlenecks.forEach(({ profile, bottlenecks }) => {
        report += `\n${profile.name} (${profile.duration?.toFixed(2)}ms):\n`;
        bottlenecks.bottlenecks.forEach(b => {
          report += `  - ${b.operation}: ${b.duration.toFixed(2)}ms `;
          report += `(${b.percentage.toFixed(1)}%) [${b.severity.toUpperCase()}]\n`;
          report += `    ${b.recommendation}\n`;
        });
      });
    }

    return report;
  }

  /**
   * Get profile by ID
   */
  private getProfile(id: string): PerformanceProfile | undefined {
    return this.completedProfiles.find(p => p.id === id);
  }

  /**
   * Add profile to history
   */
  private addToHistory(profile: PerformanceProfile): void {
    this.completedProfiles.push(profile);

    if (this.completedProfiles.length > this.maxProfileHistory) {
      this.completedProfiles.shift();
    }
  }

  /**
   * Get slow operations
   */
  getSlowOperations(limit?: number): SlowOperation[] {
    if (limit) {
      return this.slowOperations.slice(-limit);
    }
    return [...this.slowOperations];
  }

  /**
   * Get profiles by operation name
   */
  getProfilesByOperation(operation: string, limit?: number): PerformanceProfile[] {
    const profiles = this.completedProfiles.filter(p => p.name === operation);

    if (limit) {
      return profiles.slice(-limit);
    }
    return profiles;
  }

  /**
   * Get statistics for operation
   */
  getOperationStats(operation: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const profiles = this.getProfilesByOperation(operation);

    if (profiles.length === 0) {
      return null;
    }

    const durations = profiles
      .filter(p => p.duration !== undefined)
      .map(p => p.duration!)
      .sort((a, b) => a - b);

    const sum = durations.reduce((a, b) => a + b, 0);
    const count = durations.length;

    return {
      count,
      avgDuration: sum / count,
      minDuration: durations[0],
      maxDuration: durations[count - 1],
      p50: durations[Math.floor(count * 0.5)],
      p95: durations[Math.floor(count * 0.95)],
      p99: durations[Math.floor(count * 0.99)]
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.completedProfiles = [];
    this.slowOperations = [];
    this.logger.info('Performance history cleared');
  }

  /**
   * Get memory usage
   */
  getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } {
    const usage = process.memoryUsage();

    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100
    };
  }

  /**
   * Get CPU usage
   */
  getCPUUsage(): {
    user: number;
    system: number;
  } {
    const usage = process.cpuUsage();

    return {
      user: Math.round(usage.user / 1000000 * 100) / 100,
      system: Math.round(usage.system / 1000000 * 100) / 100
    };
  }
}
