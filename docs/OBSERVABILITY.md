# Observability and Monitoring Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Audit Logging](#audit-logging)
4. [Metrics Collection](#metrics-collection)
5. [SLO Tracking](#slo-tracking)
6. [Alerting and Escalation](#alerting-and-escalation)
7. [Health Checks](#health-checks)
8. [Performance Profiling](#performance-profiling)
9. [Distributed Tracing](#distributed-tracing)
10. [Runbooks](#runbooks)
11. [Compliance Reporting](#compliance-reporting)
12. [Best Practices](#best-practices)

---

## Overview

The DB Schema Mapper Connector includes a comprehensive observability system designed for production environments, especially healthcare applications requiring HIPAA compliance. The system provides:

- **Audit Logging**: HIPAA-compliant audit trails for all data access
- **Metrics Collection**: Real-time metrics on queries, connections, and transactions
- **SLO Tracking**: Service Level Objective monitoring with error budget tracking
- **Alerting**: Threshold-based alerts with escalation policies
- **Health Checks**: Kubernetes-compatible liveness, readiness, and startup probes
- **Performance Profiling**: Bottleneck detection and performance analysis
- **Distributed Tracing**: Request tracing across services
- **Runbooks**: Incident response playbooks

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  ObservabilityManager                       │
│  (Coordinates all observability components)                 │
└─────────────────────────────────────────────────────────────┘
           │                                 │
           ├─────────────┬──────────────────┼─────────────┬───────────
           │             │                  │             │
    ┌──────▼─────┐ ┌────▼────┐  ┌─────────▼──────┐ ┌────▼──────┐
    │   Audit    │ │ Metrics │  │      SLO       │ │   Alert   │
    │   Logger   │ │Collector│  │    Tracker     │ │  Manager  │
    └────────────┘ └─────────┘  └────────────────┘ └───────────┘
           │             │                  │             │
    ┌──────▼─────┐ ┌────▼────┐  ┌─────────▼──────┐ ┌────▼──────┐
    │   Health   │ │Profiler │  │   Distributed  │ │  Runbook  │
    │   Check    │ │         │  │    Tracing     │ │  Manager  │
    └────────────┘ └─────────┘  └────────────────┘ └───────────┘
```

### Initialization

```typescript
import { ObservabilityManager } from 'db-connector';

const observability = new ObservabilityManager(connector, {
  enableAuditLogging: true,
  enableMetrics: true,
  enableSLOTracking: true,
  enableAlerts: true,
  enableHealthChecks: true,
  enableProfiling: true,
  auditLogRetentionDays: 90,
  metricsRetentionHours: 24,
  alertEvaluationIntervalMs: 60000
});

await observability.initialize();
```

---

## Audit Logging

### HIPAA Compliance

The audit logger is designed to meet HIPAA requirements for tracking PHI (Protected Health Information) access.

### Event Types

```typescript
enum AuditEventType {
  DATA_READ = 'DATA_READ',
  DATA_CREATE = 'DATA_CREATE',
  DATA_UPDATE = 'DATA_UPDATE',
  DATA_DELETE = 'DATA_DELETE',
  SCHEMA_MODIFY = 'SCHEMA_MODIFY',
  MIGRATION_EXECUTE = 'MIGRATION_EXECUTE',
  PHI_ACCESS = 'PHI_ACCESS',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  BACKUP_CREATE = 'BACKUP_CREATE',
  BACKUP_RESTORE = 'BACKUP_RESTORE',
  CONFIG_CHANGE = 'CONFIG_CHANGE'
}
```

### Logging Events

```typescript
const auditLogger = observability.getAuditLogger();

await auditLogger.logEvent({
  event_type: 'PHI_ACCESS',
  severity: 'high',
  user_id: 'user123',
  username: 'john.doe',
  ip_address: '192.168.1.100',
  resource: 'patient_records',
  action: 'read',
  result: 'success',
  phi_accessed: true,
  details: {
    recordId: 'patient-12345',
    fields: ['name', 'dob', 'ssn']
  }
});
```

### Querying Audit Logs

```typescript
// Get logs by date range
const logs = await auditLogger.getAuditLogs({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  limit: 100
});

// Get logs by event type
const phiAccessLogs = await auditLogger.getAuditLogs({
  event_type: 'PHI_ACCESS',
  limit: 50
});

// Get logs by user
const userLogs = await auditLogger.getAuditLogs({
  user_id: 'user123',
  limit: 100
});
```

### Compliance Reports

```typescript
const report = await auditLogger.generateComplianceReport(
  new Date('2025-01-01'),
  new Date('2025-01-31')
);

console.log('Total Events:', report.totalEvents);
console.log('PHI Access:', report.phiAccessCount);
console.log('Failed Events:', report.failedEventCount);
```

### Retention Policy

Audit logs are automatically cleaned based on retention policy:

```typescript
// Logs older than retention period are deleted
await auditLogger.cleanOldLogs(); // Called automatically
```

---

## Metrics Collection

### Available Metrics

#### Query Metrics
- Total queries
- Successful/failed queries
- Average, P50, P95, P99 latency
- Slow queries (above threshold)
- Queries per second
- Error rate

#### Connection Pool Metrics
- Active connections
- Idle connections
- Waiting connections
- Pool utilization percentage
- Peak utilization
- Total checkouts/releases

#### Transaction Metrics
- Total transactions
- Committed transactions
- Rolled back transactions
- Rollback rate

### Recording Metrics

```typescript
const metrics = observability.getMetricsCollector();

// Record query
metrics.recordQuery({
  durationMs: 45,
  success: true,
  operation: 'SELECT',
  table: 'users'
});

// Record pool state
metrics.recordPoolState({
  active: 5,
  idle: 10,
  waiting: 0,
  total: 15,
  max: 20
});

// Record transaction
metrics.recordTransaction('committed');
```

### Getting Metrics

```typescript
// Get query metrics
const queryMetrics = metrics.getMetrics();
console.log('Average Latency:', queryMetrics.averageLatency);
console.log('P95 Latency:', queryMetrics.p95Latency);
console.log('Error Rate:', queryMetrics.failedQueries / queryMetrics.totalQueries);

// Get pool metrics
const poolMetrics = metrics.getPoolMetrics();
console.log('Utilization:', poolMetrics.currentUtilization);
console.log('Waiting:', poolMetrics.waiting);

// Get transaction metrics
const txMetrics = metrics.getTransactionMetrics();
console.log('Rollback Rate:', txMetrics.rolledBack / (txMetrics.committed + txMetrics.rolledBack));
```

### Prometheus Export

```typescript
const prometheusMetrics = observability.exportPrometheusMetrics();

// Output:
// # HELP db_queries_total Total number of database queries
// # TYPE db_queries_total counter
// db_queries_total 1523
//
// # HELP db_query_duration_ms Query duration in milliseconds
// # TYPE db_query_duration_ms histogram
// db_query_duration_ms_bucket{le="10"} 892
// db_query_duration_ms_bucket{le="50"} 1245
// ...
```

---

## SLO Tracking

### Default SLOs

The system comes with pre-configured SLOs:

| SLO Name | Target | Description |
|----------|--------|-------------|
| availability | 99.9% | Service availability |
| query_latency_p95 | <100ms | 95th percentile query latency |
| query_latency_p99 | <500ms | 99th percentile query latency |
| error_rate | <0.1% | Query error rate |
| connection_success_rate | 99.95% | Connection success rate |

### Checking SLO Status

```typescript
const sloTracker = observability.getSLOTracker();

const status = sloTracker.getSLOStatus('availability');

console.log('Target:', status.slo.target);
console.log('Current:', status.current);
console.log('Compliance:', status.slo.compliance);
console.log('Status:', status.status); // 'meeting', 'at_risk', 'breached'
```

### Error Budget

```typescript
const budget = sloTracker.getErrorBudget(
  'availability',
  new Date('2025-01-01'),
  new Date('2025-01-31')
);

console.log('Total Budget:', budget.totalBudget);
console.log('Remaining:', budget.remaining);
console.log('Consumed:', budget.consumed);
console.log('Burn Rate:', budget.burnRate);
console.log('Remaining Days:', budget.remainingDays);
```

### Burn Rate Alerts

```typescript
// Get burn rate for last 1 hour
const burnRate = sloTracker.getBurnRate('availability', 1);

if (burnRate > 10) {
  console.warn('Fast burn rate detected!');
}

// Predict when budget will be exhausted
const exhaustionDate = sloTracker.predictBudgetExhaustion('availability');

if (exhaustionDate) {
  console.warn('Budget will be exhausted by:', exhaustionDate);
}
```

### Custom SLOs

```typescript
sloTracker.registerSLO({
  name: 'migration_success_rate',
  description: 'Percentage of successful migrations',
  target: 0.999,
  window: 2592000000, // 30 days in ms
  type: 'availability',
  threshold: 0.995
});
```

---

## Alerting and Escalation

### Default Alert Thresholds

| Alert | Metric | Threshold | Severity |
|-------|--------|-----------|----------|
| Query P95 Latency | query.latency.p95 | >100ms | WARNING |
| Query P99 Latency | query.latency.p99 | >500ms | ERROR |
| Query Error Rate | query.error_rate | >1% | ERROR |
| High Error Rate | query.error_rate | >5% | CRITICAL |
| High Pool Utilization | pool.utilization | >80% | WARNING |
| Critical Pool Utilization | pool.utilization | >95% | CRITICAL |
| Pool Queue Size | pool.waiting | >10 | WARNING |
| Transaction Rollback Rate | transaction.rollback_rate | >10% | WARNING |
| Fast SLO Burn Rate | slo.burn_rate | >10x | CRITICAL |

### Evaluating Thresholds

```typescript
const alertManager = observability.getAlertManager();

// Evaluate all thresholds
const newAlerts = await alertManager.evaluateThresholds();

console.log('New alerts:', newAlerts.length);
```

### Managing Alerts

```typescript
// Get active alerts
const activeAlerts = alertManager.getActiveAlerts();

// Get unacknowledged alerts
const unacked = alertManager.getUnacknowledgedAlerts();

// Acknowledge alert
await alertManager.acknowledgeAlert('alert_id', 'user123');

// Resolve alert
await alertManager.resolveAlert('alert_id');
```

### Escalation Policies

#### Critical Incident Policy

```
Level 1 (Immediate):
  - Channels: Slack, PagerDuty
  - Recipients: oncall-primary

Level 2 (5 minutes):
  - Channels: Slack, PagerDuty, Email
  - Recipients: oncall-primary, oncall-secondary

Level 3 (10 minutes):
  - Channels: Slack, PagerDuty, Email, Phone
  - Recipients: oncall-primary, oncall-secondary, engineering-manager
```

#### High Priority Policy

```
Level 1 (Immediate):
  - Channels: Slack
  - Recipients: oncall-primary

Level 2 (15 minutes):
  - Channels: Slack, Email
  - Recipients: oncall-primary, oncall-secondary

Level 3 (30 minutes):
  - Channels: Slack, Email, PagerDuty
  - Recipients: oncall-primary, oncall-secondary, team-lead
```

### Custom Thresholds

```typescript
alertManager.registerThreshold({
  id: 'custom_metric',
  name: 'Custom Metric Alert',
  description: 'Alert for custom metric',
  metric: 'custom.metric.value',
  condition: 'gt',
  threshold: 100,
  severity: AlertSeverity.WARNING,
  enabled: true,
  cooldownMs: 300000,
  evaluationWindowMs: 60000
});
```

---

## Health Checks

### Probe Types

#### Liveness Probe
Indicates whether the service is running. If this fails, the container should be restarted.

```typescript
const healthCheck = observability.getHealthCheck();
const liveness = await healthCheck.liveness();

// HTTP endpoint: GET /health/live
console.log('Status:', liveness.status); // 'healthy' | 'degraded' | 'unhealthy'
```

#### Readiness Probe
Indicates whether the service is ready to accept traffic.

```typescript
const readiness = await healthCheck.readiness();

// HTTP endpoint: GET /health/ready
console.log('Status:', readiness.status);
console.log('Checks:', readiness.checks);
```

#### Startup Probe
Indicates whether the service has finished starting up.

```typescript
const startup = await healthCheck.startup();

// HTTP endpoint: GET /health/startup
console.log('Status:', startup.status);
```

### Full Health Check

```typescript
const health = await healthCheck.health();

console.log('Overall Status:', health.status);
console.log('Database:', health.checks.database.status);
console.log('Memory:', health.checks.memory.status);
console.log('CPU:', health.checks.cpu.status);
console.log('Metrics:', health.checks.metrics.status);
```

### Kubernetes Integration

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: db-connector
spec:
  containers:
  - name: app
    image: db-connector:latest
    livenessProbe:
      httpGet:
        path: /health/live
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5
    startupProbe:
      httpGet:
        path: /health/startup
        port: 8080
      initialDelaySeconds: 0
      periodSeconds: 10
      failureThreshold: 30
```

### HTTP Response Format

```typescript
const httpResponse = healthCheck.formatForHTTP(health);

// Returns:
// {
//   statusCode: 200,  // 200 for healthy/degraded, 503 for unhealthy
//   body: {
//     status: 'healthy',
//     checks: { ... },
//     timestamp: '2025-01-10T12:00:00.000Z',
//     uptime: 3600
//   }
// }
```

---

## Performance Profiling

### Profiling Operations

```typescript
const profiler = observability.getProfiler();

// Manual profiling
const profileId = profiler.start('my-operation', {
  userId: 'user123',
  operation: 'complex-query'
});

// ... perform operation ...

profiler.end(profileId);

// Automatic profiling
const { result, profile } = await profiler.profile('my-operation', async () => {
  // ... perform operation ...
  return { data: 'result' };
});

console.log('Duration:', profile.duration);
```

### Marking and Measuring

```typescript
const profileId = profiler.start('complex-operation');

profiler.mark(profileId, 'start-database-query');
// ... database query ...
profiler.mark(profileId, 'end-database-query');

profiler.mark(profileId, 'start-processing');
// ... data processing ...
profiler.mark(profileId, 'end-processing');

// Measure duration between marks
const queryDuration = profiler.measure(profileId, 'start-database-query', 'end-database-query');
const processingDuration = profiler.measure(profileId, 'start-processing', 'end-processing');

profiler.end(profileId);
```

### Bottleneck Detection

```typescript
const bottlenecks = profiler.detectBottlenecks(profileId);

if (bottlenecks.detected) {
  bottlenecks.bottlenecks.forEach(bottleneck => {
    console.log('Operation:', bottleneck.operation);
    console.log('Duration:', bottleneck.duration);
    console.log('Percentage:', bottleneck.percentage);
    console.log('Severity:', bottleneck.severity);
    console.log('Recommendation:', bottleneck.recommendation);
  });
}
```

### Slow Operations

```typescript
// Get slow operations (operations exceeding threshold)
const slowOps = profiler.getSlowOperations(10);

slowOps.forEach(op => {
  console.log('Operation:', op.operation);
  console.log('Duration:', op.duration);
  console.log('Threshold:', op.threshold);
  console.log('Stack Trace:', op.stackTrace);
});
```

### Custom Thresholds

```typescript
// Set threshold for specific operation type
profiler.setThreshold('query', 50); // 50ms threshold for queries
profiler.setThreshold('migration', 10000); // 10s threshold for migrations
```

### Performance Report

```typescript
const report = profiler.generateReport(100);

console.log(report);
// Output:
// Performance Report
// ================================================================================
//
// Summary:
// - Total profiles: 1523
// - Recent profiles analyzed: 100
// - Slow operations detected: 15
//
// Average Durations by Operation:
// - query: 45.23ms (892 operations)
// - transaction: 234.56ms (156 operations)
// - migration: 5432.10ms (12 operations)
//
// Top 10 Slowest Operations:
// 1. migration-execute: 12345.67ms (threshold: 5000ms)
// 2. complex-query: 3456.78ms (threshold: 100ms)
// ...
```

---

## Distributed Tracing

### Starting Traces

```typescript
import { DistributedTracer, SpanKind } from 'db-connector';

const tracer = new DistributedTracer({
  serviceName: 'db-connector',
  samplingRate: 1.0 // Sample 100% of traces
});

// Start a new trace
const context = tracer.startTrace('user-operation', SpanKind.SERVER);

// Start child span
const dbSpan = tracer.startChildSpan('database-query', context, SpanKind.CLIENT);

// ... perform operation ...

tracer.endSpan(dbSpan);
tracer.endSpan(context);
```

### Adding Tags and Logs

```typescript
// Add tags
tracer.setTag(context, 'user.id', 'user123');
tracer.setTag(context, 'http.method', 'POST');
tracer.setTag(context, 'http.status_code', 200);

// Add logs
tracer.log(context, {
  event: 'cache_miss',
  key: 'user:123'
});
```

### Trace Context Propagation

```typescript
// Inject context into HTTP headers
const headers = tracer.injectContext(context);

// Make HTTP request with headers
await fetch('https://api.example.com', {
  headers: {
    ...headers,
    'Content-Type': 'application/json'
  }
});

// Extract context from incoming headers
const incomingContext = tracer.extractContext(request.headers);

if (incomingContext) {
  // Continue trace
  const span = tracer.startChildSpan('handle-request', incomingContext);
  // ...
  tracer.endSpan(span);
}
```

### Querying Traces

```typescript
// Get specific trace
const trace = tracer.getTrace(traceId);

// Get all traces
const allTraces = tracer.getTraces(100); // Last 100 traces

// Get traces with errors
const errorTraces = tracer.getTracesWithErrors(50);

// Get slow traces
const slowTraces = tracer.getSlowTraces(1000, 20); // >1000ms, limit 20
```

### Exporting Traces

#### Jaeger Format

```typescript
const jaegerTrace = tracer.exportJaegerTrace(traceId);

// Send to Jaeger collector
await fetch('http://jaeger-collector:14268/api/traces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(jaegerTrace)
});
```

#### Zipkin Format

```typescript
const zipkinTrace = tracer.exportZipkinTrace(traceId);

// Send to Zipkin collector
await fetch('http://zipkin-collector:9411/api/v2/spans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(zipkinTrace)
});
```

---

## Runbooks

### Available Runbooks

1. **Database Connection Failure** (P1_CRITICAL)
2. **Slow Query Performance** (P2_HIGH)
3. **High Connection Pool Utilization** (P2_HIGH)
4. **Migration Failure** (P1_CRITICAL)
5. **Schema Drift Detected** (P3_MEDIUM)

### Getting Runbooks

```typescript
const runbookManager = observability.getRunbookManager();

// Get by ID
const runbook = runbookManager.getRunbook('db-connection-failure');

// Search by symptom
const runbooks = runbookManager.searchBySymptom('slow query');

// Get by severity
const criticalRunbooks = runbookManager.getBySeverity('P1_CRITICAL');
```

### Runbook Structure

```typescript
interface Runbook {
  id: string;
  title: string;
  severity: RunbookSeverity;
  symptoms: string[];
  possibleCauses: string[];
  impact: string;
  resolutionSteps: ResolutionStep[];
  escalationPath: string[];
  references: string[];
  lastUpdated: Date;
}
```

### Generating Runbook Document

```typescript
const document = runbookManager.generateRunbookDocument('db-connection-failure');

console.log(document);
// Output:
// RUNBOOK: Database Connection Failure
// ================================================================================
//
// Severity: P1_CRITICAL
// Last Updated: 2025-01-10T12:00:00.000Z
//
// SYMPTOMS
// --------------------------------------------------------------------------------
// - Unable to establish connection to database
// - Connection timeout errors
// - "ECONNREFUSED" or similar errors in logs
//
// POSSIBLE CAUSES
// --------------------------------------------------------------------------------
// - Database server is down
// - Network connectivity issues
// ...
```

### Custom Runbooks

```typescript
runbookManager.registerRunbook({
  id: 'custom-incident',
  title: 'Custom Incident Response',
  severity: RunbookSeverity.P2_HIGH,
  symptoms: [
    'Symptom 1',
    'Symptom 2'
  ],
  possibleCauses: [
    'Cause 1',
    'Cause 2'
  ],
  impact: 'Description of impact',
  resolutionSteps: [
    {
      step: 1,
      description: 'First step',
      command: 'command to run',
      expectedResult: 'what should happen'
    }
  ],
  escalationPath: [
    'First contact',
    'Second contact'
  ],
  references: [
    'https://docs.example.com'
  ]
});
```

---

## Compliance Reporting

### Generating Reports

```typescript
const startDate = new Date('2025-01-01');
const endDate = new Date('2025-01-31');

const report = await observability.generateComplianceReport(startDate, endDate);

console.log('Period:', report.period);
console.log('Total Events:', report.summary.totalEvents);
console.log('PHI Access Count:', report.summary.phiAccessCount);
console.log('Events by Type:', report.summary.byType);
console.log('Events by Severity:', report.summary.bySeverity);
console.log('Events by Result:', report.summary.byResult);
```

### Audit Trail Queries

```typescript
const auditLogger = observability.getAuditLogger();

// Get all PHI access events
const phiAccess = await auditLogger.getAuditLogs({
  event_type: 'PHI_ACCESS',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// Get failed access attempts
const failedAccess = await auditLogger.getAuditLogs({
  result: 'failure',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// Get high severity events
const highSeverity = await auditLogger.getAuditLogs({
  severity: 'high',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});
```

---

## Best Practices

### 1. Enable All Observability Features in Production

```typescript
const observability = new ObservabilityManager(connector, {
  enableAuditLogging: true,
  enableMetrics: true,
  enableSLOTracking: true,
  enableAlerts: true,
  enableHealthChecks: true,
  enableProfiling: true
});
```

### 2. Set Appropriate Retention Periods

```typescript
{
  auditLogRetentionDays: 90,  // Minimum for HIPAA compliance
  metricsRetentionHours: 24   // Adjust based on storage capacity
}
```

### 3. Use Distributed Tracing for Complex Operations

```typescript
// For operations that span multiple services
const context = tracer.startTrace('user-registration', SpanKind.SERVER);

const dbSpan = tracer.startChildSpan('create-user-record', context);
// ... database operation ...
tracer.endSpan(dbSpan);

const emailSpan = tracer.startChildSpan('send-welcome-email', context);
// ... email operation ...
tracer.endSpan(emailSpan);

tracer.endSpan(context);
```

### 4. Monitor SLO Burn Rate

```typescript
// Check burn rate hourly
setInterval(async () => {
  const burnRate = sloTracker.getBurnRate('availability', 1);

  if (burnRate > 10) {
    // Alert: Fast burn rate detected
    console.warn('Fast SLO burn rate detected:', burnRate);
  }
}, 3600000); // Every hour
```

### 5. Regular Compliance Audits

```typescript
// Generate weekly compliance reports
const weeklyReport = async () => {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const report = await observability.generateComplianceReport(startDate, endDate);

  // Send report to compliance team
  await sendComplianceReport(report);
};

// Run weekly
setInterval(weeklyReport, 7 * 24 * 60 * 60 * 1000);
```

### 6. Health Check Endpoints

Always expose health check endpoints for orchestration platforms:

```typescript
app.get('/health/live', async (req, res) => {
  const health = await healthCheck.liveness();
  const response = healthCheck.formatForHTTP(health);
  res.status(response.statusCode).json(response.body);
});

app.get('/health/ready', async (req, res) => {
  const health = await healthCheck.readiness();
  const response = healthCheck.formatForHTTP(health);
  res.status(response.statusCode).json(response.body);
});
```

### 7. Performance Profiling for Critical Operations

```typescript
// Profile migrations
const { result, profile } = await profiler.profile('migration', async () => {
  return await migrationManager.executeMigration(migration);
});

// Check for bottlenecks
const bottlenecks = profiler.detectBottlenecks(profile.id);
if (bottlenecks.detected) {
  console.warn('Migration bottlenecks:', bottlenecks);
}
```

### 8. Alert Acknowledgment Workflow

```typescript
// On-call engineer workflow
const unacked = alertManager.getUnacknowledgedAlerts();

for (const alert of unacked) {
  // Get relevant runbook
  const runbook = await getRunbookForAlert(alert);

  // Follow runbook procedures
  await followRunbook(runbook);

  // Acknowledge alert
  await alertManager.acknowledgeAlert(alert.id, 'oncall-engineer');

  // If resolved
  if (isResolved(alert)) {
    await alertManager.resolveAlert(alert.id);
  }
}
```

### 9. Metrics Dashboard

```typescript
// Export to monitoring system
const dashboard = await observability.getDashboard();

// Send to Grafana, Datadog, etc.
await sendToDashboard(dashboard);

// Or expose as endpoint
app.get('/metrics/dashboard', async (req, res) => {
  const dashboard = await observability.getDashboard();
  res.json(dashboard);
});
```

### 10. Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  // Mark as not ready
  healthCheck.markNotReady();

  // Allow existing requests to complete
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Shutdown observability
  await observability.shutdown();

  // Close database connections
  await connector.disconnect();

  process.exit(0);
});
```

---

## Example: Complete Integration

```typescript
import {
  createAndConnectConnector,
  DatabaseType,
  ObservabilityManager
} from 'db-connector';

async function main() {
  // Connect to database
  const connector = await createAndConnectConnector(DatabaseType.MySQL, {
    host: 'localhost',
    port: 3306,
    database: 'mydb',
    user: 'user',
    password: 'password'
  });

  // Initialize observability
  const observability = new ObservabilityManager(connector, {
    enableAuditLogging: true,
    enableMetrics: true,
    enableSLOTracking: true,
    enableAlerts: true,
    enableHealthChecks: true,
    enableProfiling: true
  });

  await observability.initialize();

  // Set up health check endpoints
  const healthCheck = observability.getHealthCheck();
  app.get('/health/live', async (req, res) => {
    const health = await healthCheck.liveness();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  // Set up metrics endpoint
  app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(observability.exportPrometheusMetrics());
  });

  // Record operations
  await observability.recordQuery({
    operation: 'SELECT',
    table: 'users',
    durationMs: 45,
    success: true,
    userId: 'user123'
  });

  // Check SLO status
  const slo = observability.getSLOTracker().getSLOStatus('availability');
  console.log('SLO Status:', slo.status);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await observability.shutdown();
    await connector.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
```

---

For more examples, see `examples/observability-usage.ts`.
