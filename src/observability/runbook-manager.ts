/**
 * Runbook manager for on-call scenarios and incident response
 */

import { createLogger } from '../utils/logger';

/**
 * Runbook severity
 */
export enum RunbookSeverity {
  P1_CRITICAL = 'P1_CRITICAL',  // Complete outage, immediate response
  P2_HIGH = 'P2_HIGH',          // Major functionality impaired
  P3_MEDIUM = 'P3_MEDIUM',      // Limited impact
  P4_LOW = 'P4_LOW'             // Cosmetic issues
}

/**
 * Runbook step
 */
export interface RunbookStep {
  step: number;
  title: string;
  description: string;
  command?: string;
  expectedResult?: string;
  troubleshooting?: string[];
}

/**
 * Runbook definition
 */
export interface Runbook {
  id: string;
  title: string;
  severity: RunbookSeverity;
  description: string;
  symptoms: string[];
  possibleCauses: string[];
  impactDescription: string;
  steps: RunbookStep[];
  escalationPath?: string[];
  references?: string[];
  lastUpdated: Date;
}

/**
 * Runbook manager
 */
export class RunbookManager {
  private logger = createLogger('RunbookManager');
  private runbooks: Map<string, Runbook> = new Map();

  constructor() {
    this.loadDefaultRunbooks();
  }

  /**
   * Load default runbooks for common scenarios
   */
  private loadDefaultRunbooks(): void {
    // Database connection failure
    this.registerRunbook({
      id: 'db-connection-failure',
      title: 'Database Connection Failure',
      severity: RunbookSeverity.P1_CRITICAL,
      description: 'Unable to establish connection to database',
      symptoms: [
        'Connection timeout errors',
        'ECONNREFUSED errors',
        'Application unable to query database',
        'All requests failing with database errors'
      ],
      possibleCauses: [
        'Database server is down',
        'Network connectivity issues',
        'Firewall blocking connections',
        'Maximum connections reached',
        'Invalid credentials',
        'Database in maintenance mode'
      ],
      impactDescription: 'Complete application outage - no data access possible',
      steps: [
        {
          step: 1,
          title: 'Verify database server status',
          description: 'Check if database server is running',
          command: 'systemctl status mysql  # or postgresql/mssql',
          expectedResult: 'Service should be active (running)',
          troubleshooting: [
            'If stopped: sudo systemctl start mysql',
            'Check system logs: journalctl -u mysql -n 50',
            'Verify disk space: df -h'
          ]
        },
        {
          step: 2,
          title: 'Test network connectivity',
          description: 'Verify network path to database',
          command: 'telnet db-host 3306  # or appropriate port',
          expectedResult: 'Connection should succeed',
          troubleshooting: [
            'Check firewall rules',
            'Verify security groups (cloud)',
            'Test DNS resolution: nslookup db-host',
            'Check routing: traceroute db-host'
          ]
        },
        {
          step: 3,
          title: 'Check connection pool',
          description: 'Verify connection pool is not exhausted',
          expectedResult: 'Active connections < max pool size',
          troubleshooting: [
            'Query: SHOW PROCESSLIST; to see active connections',
            'Kill long-running queries if needed',
            'Restart application to reset pool',
            'Increase max_connections if consistently hitting limit'
          ]
        },
        {
          step: 4,
          title: 'Verify credentials',
          description: 'Test database credentials',
          command: 'mysql -h host -u user -p  # Enter password',
          expectedResult: 'Successful login to database',
          troubleshooting: [
            'Verify credentials in environment variables',
            'Check if password has been rotated',
            'Verify user has necessary permissions',
            'Check if account is locked'
          ]
        },
        {
          step: 5,
          title: 'Review error logs',
          description: 'Check application and database logs',
          troubleshooting: [
            'Application logs: tail -f /var/log/app/error.log',
            'Database logs: tail -f /var/log/mysql/error.log',
            'Look for specific error codes and messages',
            'Check for OOM kills or crashes'
          ]
        }
      ],
      escalationPath: [
        'Tier 1: On-call engineer (15 min)',
        'Tier 2: Database administrator (30 min)',
        'Tier 3: Infrastructure team lead (45 min)',
        'Tier 4: Engineering manager (60 min)'
      ],
      references: [
        'Database monitoring dashboard: https://grafana/db-metrics',
        'Connection pool documentation',
        'Database runbook wiki'
      ],
      lastUpdated: new Date()
    });

    // Slow query performance
    this.registerRunbook({
      id: 'slow-query-performance',
      title: 'Slow Query Performance',
      severity: RunbookSeverity.P2_HIGH,
      description: 'Queries taking longer than expected',
      symptoms: [
        'Query latency P95 > 1000ms',
        'Application timeouts',
        'Slow query log filling up',
        'Users reporting slow response times'
      ],
      possibleCauses: [
        'Missing indexes',
        'Large table scans',
        'Lock contention',
        'Database resource exhaustion',
        'Network latency',
        'Inefficient query patterns'
      ],
      impactDescription: 'Degraded user experience, potential timeouts',
      steps: [
        {
          step: 1,
          title: 'Identify slow queries',
          description: 'Find queries exceeding threshold',
          command: 'SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;',
          troubleshooting: [
            'Enable slow query log if not already: SET GLOBAL slow_query_log = 1;',
            'Check current threshold: SHOW VARIABLES LIKE \'long_query_time\';',
            'Review application metrics for slow endpoints'
          ]
        },
        {
          step: 2,
          title: 'Analyze query execution plans',
          description: 'Use EXPLAIN to understand query execution',
          command: 'EXPLAIN <slow_query>;',
          expectedResult: 'Look for table scans, missing indexes',
          troubleshooting: [
            'Type=ALL indicates full table scan (bad)',
            'Key=NULL means no index used',
            'Rows examined should be minimal',
            'Extra field shows optimization hints'
          ]
        },
        {
          step: 3,
          title: 'Check for missing indexes',
          description: 'Identify and create missing indexes',
          troubleshooting: [
            'Review WHERE clause columns',
            'Check JOIN conditions',
            'Analyze ORDER BY and GROUP BY columns',
            'Create indexes: CREATE INDEX idx_name ON table(column);',
            'Monitor index usage: SHOW INDEX FROM table;'
          ]
        },
        {
          step: 4,
          title: 'Check lock contention',
          description: 'Look for blocking queries',
          command: 'SHOW ENGINE INNODB STATUS;',
          troubleshooting: [
            'Look for "LOCK WAIT" in output',
            'Check for deadlocks',
            'Kill blocking query if necessary: KILL <processlist_id>;',
            'Review transaction isolation level'
          ]
        },
        {
          step: 5,
          title: 'Monitor database resources',
          description: 'Check CPU, memory, disk I/O',
          troubleshooting: [
            'CPU: top, htop',
            'Memory: free -h, check buffer pool',
            'Disk I/O: iostat -x 1',
            'Consider scaling if resource-constrained'
          ]
        }
      ],
      escalationPath: [
        'Tier 1: On-call engineer (30 min)',
        'Tier 2: Database administrator (60 min)'
      ],
      references: [
        'Query optimization guide',
        'Index strategy documentation',
        'Performance monitoring dashboard'
      ],
      lastUpdated: new Date()
    });

    // High connection pool utilization
    this.registerRunbook({
      id: 'high-pool-utilization',
      title: 'High Connection Pool Utilization',
      severity: RunbookSeverity.P2_HIGH,
      description: 'Connection pool is near or at capacity',
      symptoms: [
        'Pool utilization > 80%',
        'Requests waiting for connections',
        'Connection timeouts',
        'Application errors: "no connections available"'
      ],
      possibleCauses: [
        'Connection leaks (not released)',
        'Long-running transactions',
        'Pool size too small',
        'Sudden traffic spike',
        'Database performance issues'
      ],
      impactDescription: 'Request queuing, increased latency, potential failures',
      steps: [
        {
          step: 1,
          title: 'Check current pool metrics',
          description: 'Review connection pool state',
          troubleshooting: [
            'Active connections',
            'Idle connections',
            'Waiting requests',
            'Pool utilization percentage'
          ]
        },
        {
          step: 2,
          title: 'Identify connection leaks',
          description: 'Find connections not being released',
          troubleshooting: [
            'Review application code for missing .release() calls',
            'Check for uncaught exceptions',
            'Look for connections held in error paths',
            'Enable connection tracking/debugging'
          ]
        },
        {
          step: 3,
          title: 'Kill long-running connections',
          description: 'Terminate connections exceeding threshold',
          command: 'SELECT * FROM information_schema.processlist WHERE time > 300;',
          troubleshooting: [
            'Review query causing long connection hold',
            'KILL <process_id> if necessary',
            'Set max_execution_time to prevent future issues'
          ]
        },
        {
          step: 4,
          title: 'Temporarily increase pool size',
          description: 'Scale pool to handle load',
          troubleshooting: [
            'Update CONNECTION_POOL_MAX environment variable',
            'Restart application',
            'Monitor database server capacity',
            'Plan for permanent pool sizing if needed'
          ]
        }
      ],
      escalationPath: [
        'Tier 1: On-call engineer (15 min)',
        'Tier 2: Application team (30 min)'
      ],
      references: [
        'Connection pool configuration guide',
        'Application scaling procedures'
      ],
      lastUpdated: new Date()
    });

    // Migration failure
    this.registerRunbook({
      id: 'migration-failure',
      title: 'Database Migration Failure',
      severity: RunbookSeverity.P1_CRITICAL,
      description: 'Database migration failed or needs rollback',
      symptoms: [
        'Migration script errors',
        'Schema inconsistencies',
        'Application errors after deployment',
        'Data integrity issues'
      ],
      possibleCauses: [
        'Syntax errors in migration',
        'Constraint violations',
        'Insufficient permissions',
        'Lock timeouts',
        'Data incompatibility'
      ],
      impactDescription: 'Application may be down or partially functional',
      steps: [
        {
          step: 1,
          title: 'STOP - Do not make changes yet',
          description: 'Assess the situation first',
          troubleshooting: [
            'Determine if application is still running',
            'Check if rollback is safe',
            'Review migration failure logs',
            'Notify team in incident channel'
          ]
        },
        {
          step: 2,
          title: 'Check migration status',
          description: 'Determine what was applied',
          command: 'SELECT * FROM schema_migrations ORDER BY executed_at DESC LIMIT 10;',
          troubleshooting: [
            'Identify partially applied migrations',
            'Check migration checksums',
            'Review schema_versions table'
          ]
        },
        {
          step: 3,
          title: 'Review migration logs',
          description: 'Understand the failure',
          troubleshooting: [
            'Check error message details',
            'Identify failing SQL statement',
            'Look for constraint violations',
            'Check for lock timeouts'
          ]
        },
        {
          step: 4,
          title: 'Execute rollback if safe',
          description: 'Revert to previous schema state',
          troubleshooting: [
            'Verify rollback migration exists',
            'Check if rollback requires data migration',
            'Test rollback in staging if possible',
            'Execute: npm run migrate:rollback',
            'Verify application functionality'
          ]
        },
        {
          step: 5,
          title: 'Restore from backup (last resort)',
          description: 'If rollback not possible',
          troubleshooting: [
            'Calculate data loss window',
            'Get approval from incident commander',
            'Stop application writes',
            'Restore latest backup',
            'Replay WAL logs if available'
          ]
        }
      ],
      escalationPath: [
        'Tier 1: On-call engineer (immediate)',
        'Tier 2: Database administrator (15 min)',
        'Tier 3: Engineering lead (30 min)',
        'Incident Commander: CTO (critical decisions)'
      ],
      references: [
        'Migration procedures',
        'Backup and restore guide',
        'Incident response playbook'
      ],
      lastUpdated: new Date()
    });

    // Schema drift detected
    this.registerRunbook({
      id: 'schema-drift-detected',
      title: 'Schema Drift Detected',
      severity: RunbookSeverity.P3_MEDIUM,
      description: 'Unexpected schema changes detected',
      symptoms: [
        'Drift detection alerts',
        'Schema mismatch errors',
        'Unexpected table or column changes'
      ],
      possibleCauses: [
        'Manual schema changes',
        'Migration out of sync',
        'Multiple environments diverged',
        'Hot-fix applied directly to database'
      ],
      impactDescription: 'Potential application errors, deployment issues',
      steps: [
        {
          step: 1,
          title: 'Review drift report',
          description: 'Understand what changed',
          troubleshooting: [
            'Check drift detection report',
            'Identify added/removed/modified objects',
            'Determine severity of changes',
            'Review audit logs for who made changes'
          ]
        },
        {
          step: 2,
          title: 'Assess impact',
          description: 'Determine if changes are breaking',
          troubleshooting: [
            'Check if application is functioning',
            'Review error logs',
            'Test critical functionality',
            'Determine urgency of fix'
          ]
        },
        {
          step: 3,
          title: 'Generate corrective migration',
          description: 'Create migration to fix drift',
          troubleshooting: [
            'Use migration generator',
            'Review generated SQL',
            'Test in staging environment',
            'Get peer review'
          ]
        },
        {
          step: 4,
          title: 'Apply corrective migration',
          description: 'Bring schema back to expected state',
          troubleshooting: [
            'Coordinate with team',
            'Apply during low-traffic window',
            'Monitor for errors',
            'Verify drift resolved'
          ]
        }
      ],
      escalationPath: [
        'Tier 1: On-call engineer (1 hour)',
        'Tier 2: Database administrator (4 hours)'
      ],
      references: [
        'Drift detection documentation',
        'Schema change procedures'
      ],
      lastUpdated: new Date()
    });
  }

  /**
   * Register a runbook
   */
  registerRunbook(runbook: Runbook): void {
    this.runbooks.set(runbook.id, runbook);
    this.logger.info('Runbook registered', { id: runbook.id, title: runbook.title });
  }

  /**
   * Get runbook by ID
   */
  getRunbook(id: string): Runbook | null {
    return this.runbooks.get(id) || null;
  }

  /**
   * Get runbooks by severity
   */
  getRunbooksBySeverity(severity: RunbookSeverity): Runbook[] {
    return Array.from(this.runbooks.values()).filter(r => r.severity === severity);
  }

  /**
   * Search runbooks by symptom
   */
  searchBySymptom(symptom: string): Runbook[] {
    const lowerSymptom = symptom.toLowerCase();

    return Array.from(this.runbooks.values()).filter(runbook =>
      runbook.symptoms.some(s => s.toLowerCase().includes(lowerSymptom)) ||
      runbook.title.toLowerCase().includes(lowerSymptom) ||
      runbook.description.toLowerCase().includes(lowerSymptom)
    );
  }

  /**
   * Get all runbooks
   */
  getAllRunbooks(): Runbook[] {
    return Array.from(this.runbooks.values());
  }

  /**
   * Generate runbook document
   */
  generateRunbookDocument(id: string): string {
    const runbook = this.getRunbook(id);
    if (!runbook) {
      return 'Runbook not found';
    }

    const lines: string[] = [
      '═══════════════════════════════════════════════════════════',
      `  RUNBOOK: ${runbook.title}`,
      '═══════════════════════════════════════════════════════════',
      '',
      `Severity: ${runbook.severity}`,
      `Last Updated: ${runbook.lastUpdated.toISOString()}`,
      '',
      'DESCRIPTION:',
      runbook.description,
      '',
      'SYMPTOMS:',
      ...runbook.symptoms.map(s => `  • ${s}`),
      '',
      'POSSIBLE CAUSES:',
      ...runbook.possibleCauses.map(c => `  • ${c}`),
      '',
      'IMPACT:',
      runbook.impactDescription,
      '',
      '───────────────────────────────────────────────────────────',
      'RESOLUTION STEPS:',
      '───────────────────────────────────────────────────────────',
      ''
    ];

    runbook.steps.forEach(step => {
      lines.push(`STEP ${step.step}: ${step.title}`);
      lines.push(step.description);

      if (step.command) {
        lines.push('Command:');
        lines.push(`  $ ${step.command}`);
      }

      if (step.expectedResult) {
        lines.push(`Expected: ${step.expectedResult}`);
      }

      if (step.troubleshooting && step.troubleshooting.length > 0) {
        lines.push('Troubleshooting:');
        step.troubleshooting.forEach(t => lines.push(`  • ${t}`));
      }

      lines.push('');
    });

    if (runbook.escalationPath) {
      lines.push('───────────────────────────────────────────────────────────');
      lines.push('ESCALATION PATH:');
      runbook.escalationPath.forEach(e => lines.push(`  ${e}`));
      lines.push('');
    }

    if (runbook.references) {
      lines.push('REFERENCES:');
      runbook.references.forEach(r => lines.push(`  • ${r}`));
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Get runbook summary
   */
  getRunbookSummary(): {
    total: number;
    bySeverity: Record<string, number>;
    runbooks: Array<{ id: string; title: string; severity: string }>;
  } {
    const runbooks = this.getAllRunbooks();

    const bySeverity: Record<string, number> = {
      [RunbookSeverity.P1_CRITICAL]: 0,
      [RunbookSeverity.P2_HIGH]: 0,
      [RunbookSeverity.P3_MEDIUM]: 0,
      [RunbookSeverity.P4_LOW]: 0
    };

    runbooks.forEach(r => {
      bySeverity[r.severity]++;
    });

    return {
      total: runbooks.length,
      bySeverity,
      runbooks: runbooks.map(r => ({
        id: r.id,
        title: r.title,
        severity: r.severity
      }))
    };
  }
}
