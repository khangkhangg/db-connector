/**
 * HIPAA-compliant audit logging system
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { DatabaseType } from '../schema/types';
import { createLogger } from '../utils/logger';

/**
 * Audit event types
 */
export enum AuditEventType {
  // Data access events
  DATA_READ = 'DATA_READ',
  DATA_CREATE = 'DATA_CREATE',
  DATA_UPDATE = 'DATA_UPDATE',
  DATA_DELETE = 'DATA_DELETE',
  DATA_EXPORT = 'DATA_EXPORT',

  // Schema events
  SCHEMA_READ = 'SCHEMA_READ',
  SCHEMA_MODIFY = 'SCHEMA_MODIFY',
  MIGRATION_EXECUTE = 'MIGRATION_EXECUTE',
  MIGRATION_ROLLBACK = 'MIGRATION_ROLLBACK',

  // Authentication/Authorization
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // System events
  CONNECTION_OPEN = 'CONNECTION_OPEN',
  CONNECTION_CLOSE = 'CONNECTION_CLOSE',
  CONNECTION_FAILURE = 'CONNECTION_FAILURE',
  QUERY_EXECUTE = 'QUERY_EXECUTE',
  TRANSACTION_START = 'TRANSACTION_START',
  TRANSACTION_COMMIT = 'TRANSACTION_COMMIT',
  TRANSACTION_ROLLBACK = 'TRANSACTION_ROLLBACK',

  // Configuration changes
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  ALERT_SENT = 'ALERT_SENT',

  // Compliance events
  PHI_ACCESS = 'PHI_ACCESS',
  AUDIT_LOG_ACCESS = 'AUDIT_LOG_ACCESS',
  BACKUP_CREATED = 'BACKUP_CREATED',
  RESTORE_PERFORMED = 'RESTORE_PERFORMED'
}

/**
 * Audit event severity
 */
export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Audit event
 */
export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  resource: string;
  action: string;
  result: 'success' | 'failure';
  details?: Record<string, any>;
  sessionId?: string;
  requestId?: string;
  duration_ms?: number;
  rowsAffected?: number;
  error?: string;
  phiAccessed?: boolean;
}

/**
 * Audit log configuration
 */
export interface AuditLogConfig {
  enabled: boolean;
  logLevel: AuditSeverity;
  retentionDays: number;
  includePHI: boolean;
  maskSensitiveData: boolean;
  realTimeAlerts: boolean;
  complianceMode: 'HIPAA' | 'GDPR' | 'SOC2' | 'ALL';
}

/**
 * Audit logger for HIPAA compliance
 */
export class AuditLogger {
  private logger = createLogger('AuditLogger');
  private auditTable = 'audit_logs';
  private eventQueue: AuditEvent[] = [];
  private flushInterval?: NodeJS.Timeout;
  private batchSize = 100;

  constructor(
    private connector: BaseDatabaseConnector,
    private config: AuditLogConfig
  ) {
    if (config.enabled) {
      this.startBatchFlushing();
    }
  }

  /**
   * Initialize audit logging tables
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing audit logging system');

    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.auditTable}')
        BEGIN
          CREATE TABLE ${this.auditTable} (
            id NVARCHAR(50) PRIMARY KEY,
            timestamp DATETIME2 NOT NULL DEFAULT GETDATE(),
            event_type NVARCHAR(50) NOT NULL,
            severity NVARCHAR(20) NOT NULL,
            user_id NVARCHAR(50),
            username NVARCHAR(100),
            ip_address NVARCHAR(45),
            user_agent NVARCHAR(500),
            resource NVARCHAR(200) NOT NULL,
            action NVARCHAR(50) NOT NULL,
            result NVARCHAR(20) NOT NULL,
            details NVARCHAR(MAX),
            session_id NVARCHAR(50),
            request_id NVARCHAR(50),
            duration_ms INT,
            rows_affected INT,
            error_message NVARCHAR(MAX),
            phi_accessed BIT DEFAULT 0,
            INDEX idx_timestamp (timestamp),
            INDEX idx_event_type (event_type),
            INDEX idx_user_id (user_id),
            INDEX idx_resource (resource),
            INDEX idx_phi_accessed (phi_accessed)
          );
        END
      `;
    } else {
      sql = `
        CREATE TABLE IF NOT EXISTS ${this.auditTable} (
          id VARCHAR(50) PRIMARY KEY,
          timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          event_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          user_id VARCHAR(50),
          username VARCHAR(100),
          ip_address VARCHAR(45),
          user_agent VARCHAR(500),
          resource VARCHAR(200) NOT NULL,
          action VARCHAR(50) NOT NULL,
          result VARCHAR(20) NOT NULL,
          details TEXT,
          session_id VARCHAR(50),
          request_id VARCHAR(50),
          duration_ms INT,
          rows_affected INT,
          error_message TEXT,
          phi_accessed BOOLEAN DEFAULT FALSE,
          INDEX idx_timestamp (timestamp),
          INDEX idx_event_type (event_type),
          INDEX idx_user_id (user_id),
          INDEX idx_resource (resource),
          INDEX idx_phi_accessed (phi_accessed)
        );
      `;
    }

    await this.connector.executeQuery(sql);

    this.logger.info('Audit logging system initialized');
  }

  /**
   * Log audit event
   */
  async logEvent(event: Partial<AuditEvent>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Check log level
    const severityLevels = [AuditSeverity.INFO, AuditSeverity.WARNING, AuditSeverity.ERROR, AuditSeverity.CRITICAL];
    const eventLevel = severityLevels.indexOf(event.severity || AuditSeverity.INFO);
    const configLevel = severityLevels.indexOf(this.config.logLevel);

    if (eventLevel < configLevel) {
      return;
    }

    // Create full event
    const fullEvent: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      eventType: event.eventType || AuditEventType.QUERY_EXECUTE,
      severity: event.severity || AuditSeverity.INFO,
      resource: event.resource || 'unknown',
      action: event.action || 'unknown',
      result: event.result || 'success',
      ...event
    };

    // Mask sensitive data if configured
    if (this.config.maskSensitiveData && fullEvent.details) {
      fullEvent.details = this.maskSensitiveData(fullEvent.details);
    }

    // Add to queue for batch processing
    this.eventQueue.push(fullEvent);

    // Flush if batch size reached
    if (this.eventQueue.length >= this.batchSize) {
      await this.flushEvents();
    }

    // Real-time alert for critical events
    if (this.config.realTimeAlerts && fullEvent.severity === AuditSeverity.CRITICAL) {
      this.logger.error('CRITICAL AUDIT EVENT', fullEvent);
    }

    // Log PHI access separately
    if (fullEvent.phiAccessed) {
      this.logger.warn('PHI ACCESS', {
        userId: fullEvent.userId,
        resource: fullEvent.resource,
        action: fullEvent.action
      });
    }
  }

  /**
   * Flush queued events to database
   */
  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const dbType = this.connector.getDatabaseType();

      for (const event of events) {
        const details = JSON.stringify(event.details || {});

        let sql: string;
        if (dbType === DatabaseType.MSSQL) {
          sql = `
            INSERT INTO ${this.auditTable}
            (id, timestamp, event_type, severity, user_id, username, ip_address, user_agent,
             resource, action, result, details, session_id, request_id, duration_ms,
             rows_affected, error_message, phi_accessed)
            VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17)
          `;
        } else {
          sql = `
            INSERT INTO ${this.auditTable}
            (id, timestamp, event_type, severity, user_id, username, ip_address, user_agent,
             resource, action, result, details, session_id, request_id, duration_ms,
             rows_affected, error_message, phi_accessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
        }

        await this.connector.executeQuery(sql, [
          event.id,
          event.timestamp,
          event.eventType,
          event.severity,
          event.userId,
          event.username,
          event.ipAddress,
          event.userAgent,
          event.resource,
          event.action,
          event.result,
          details,
          event.sessionId,
          event.requestId,
          event.duration_ms,
          event.rowsAffected,
          event.error,
          event.phiAccessed ? 1 : 0
        ]);
      }

      this.logger.debug(`Flushed ${events.length} audit events`);
    } catch (error) {
      this.logger.error('Failed to flush audit events', { error });
      // Re-queue events
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Start batch flushing
   */
  private startBatchFlushing(): void {
    this.flushInterval = setInterval(() => {
      this.flushEvents().catch(error => {
        this.logger.error('Batch flush error', { error });
      });
    }, 5000); // Flush every 5 seconds
  }

  /**
   * Stop batch flushing
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }

    // Flush remaining events
    await this.flushEvents();
  }

  /**
   * Mask sensitive data
   */
  private maskSensitiveData(data: Record<string, any>): Record<string, any> {
    const masked = { ...data };
    const sensitiveFields = ['password', 'ssn', 'creditCard', 'token', 'apiKey', 'secret'];

    const maskValue = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => maskValue(item));
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          result[key] = '***MASKED***';
        } else if (typeof value === 'object') {
          result[key] = maskValue(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return maskValue(masked);
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    eventType?: AuditEventType;
    resource?: string;
    severity?: AuditSeverity;
    phiAccessed?: boolean;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 0;

    if (filters.startDate) {
      conditions.push(`timestamp >= ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`timestamp <= ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.endDate);
    }

    if (filters.userId) {
      conditions.push(`user_id = ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.userId);
    }

    if (filters.eventType) {
      conditions.push(`event_type = ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.eventType);
    }

    if (filters.resource) {
      conditions.push(`resource = ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.resource);
    }

    if (filters.severity) {
      conditions.push(`severity = ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.severity);
    }

    if (filters.phiAccessed !== undefined) {
      conditions.push(`phi_accessed = ${this.getParamPlaceholder(paramIndex++)}`);
      params.push(filters.phiAccessed ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;

    const sql = `
      SELECT * FROM ${this.auditTable}
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    const results = await this.connector.executeQuery<any>(sql, params);

    return results.map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      eventType: row.event_type as AuditEventType,
      severity: row.severity as AuditSeverity,
      userId: row.user_id,
      username: row.username,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      resource: row.resource,
      action: row.action,
      result: row.result as 'success' | 'failure',
      details: row.details ? JSON.parse(row.details) : undefined,
      sessionId: row.session_id,
      requestId: row.request_id,
      duration_ms: row.duration_ms,
      rowsAffected: row.rows_affected,
      error: row.error_message,
      phiAccessed: Boolean(row.phi_accessed)
    }));
  }

  /**
   * Get audit logs (alias for queryLogs for backward compatibility)
   */
  async getAuditLogs(filters?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    eventType?: AuditEventType;
    resource?: string;
    severity?: AuditSeverity;
    phiAccessed?: boolean;
    limit?: number;
  }): Promise<AuditEvent[]> {
    return this.queryLogs(filters || {});
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<{
    totalEvents: number;
    phiAccessCount: number;
    failedAccessAttempts: number;
    uniqueUsers: number;
    criticalEvents: number;
    eventsByType: Record<string, number>;
    topUsers: Array<{ userId: string; count: number }>;
  }> {
    const dbType = this.connector.getDatabaseType();
    const param1 = this.getParamPlaceholder(0);
    const param2 = this.getParamPlaceholder(1);

    // Total events
    const totalResult = await this.connector.executeQuery<any>(
      `SELECT COUNT(*) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2}`,
      [startDate, endDate]
    );

    // PHI access count
    const phiResult = await this.connector.executeQuery<any>(
      `SELECT COUNT(*) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2} AND phi_accessed = 1`,
      [startDate, endDate]
    );

    // Failed access attempts
    const failedResult = await this.connector.executeQuery<any>(
      `SELECT COUNT(*) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2} AND result = 'failure'`,
      [startDate, endDate]
    );

    // Unique users
    const usersResult = await this.connector.executeQuery<any>(
      `SELECT COUNT(DISTINCT user_id) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2}`,
      [startDate, endDate]
    );

    // Critical events
    const criticalResult = await this.connector.executeQuery<any>(
      `SELECT COUNT(*) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2} AND severity = 'CRITICAL'`,
      [startDate, endDate]
    );

    // Events by type
    const typeResults = await this.connector.executeQuery<any>(
      `SELECT event_type, COUNT(*) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2} GROUP BY event_type`,
      [startDate, endDate]
    );

    const eventsByType: Record<string, number> = {};
    typeResults.forEach(row => {
      eventsByType[row.event_type] = row.count;
    });

    // Top users
    const topUsersResults = await this.connector.executeQuery<any>(
      `SELECT user_id, COUNT(*) as count FROM ${this.auditTable} WHERE timestamp BETWEEN ${param1} AND ${param2} AND user_id IS NOT NULL GROUP BY user_id ORDER BY count DESC LIMIT 10`,
      [startDate, endDate]
    );

    const topUsers = topUsersResults.map(row => ({
      userId: row.user_id,
      count: row.count
    }));

    return {
      totalEvents: totalResult[0]?.count || 0,
      phiAccessCount: phiResult[0]?.count || 0,
      failedAccessAttempts: failedResult[0]?.count || 0,
      uniqueUsers: usersResult[0]?.count || 0,
      criticalEvents: criticalResult[0]?.count || 0,
      eventsByType,
      topUsers
    };
  }

  /**
   * Clean old audit logs (retention policy)
   */
  async cleanOldLogs(): Promise<number> {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - this.config.retentionDays);

    const param = this.getParamPlaceholder(0);

    const result = await this.connector.executeQuery(
      `DELETE FROM ${this.auditTable} WHERE timestamp < ${param}`,
      [retentionDate]
    );

    const deletedCount = (result as any).affectedRows || 0;

    this.logger.info(`Cleaned ${deletedCount} old audit logs`, {
      retentionDays: this.config.retentionDays
    });

    return deletedCount;
  }

  /**
   * Get parameter placeholder
   */
  private getParamPlaceholder(index: number): string {
    if (this.connector.getDatabaseType() === DatabaseType.MSSQL) {
      return `@p${index}`;
    }
    return '?';
  }
}
