# Data Sync with Alerts and PHI Protection

Complete guide for setting up data synchronization with automatic conflict alerts and HIPAA-compliant PHI protection.

## Table of Contents

1. [Overview](#overview)
2. [Quick Answer](#quick-answer)
3. [How It Works](#how-it-works)
4. [Configuration](#configuration)
5. [Alert Types](#alert-types)
6. [PHI Protection](#phi-protection)
7. [Complete Examples](#complete-examples)
8. [Best Practices](#best-practices)

---

## Overview

The DB Schema Mapper Connector provides **automatic alerting** for data synchronization events with **built-in PHI protection** to ensure HIPAA compliance.

### Key Features

✅ **Automatic Alerts** on:
- Data conflicts during bidirectional sync
- Sync errors and failures
- Sync completion (optional)
- Table-level failures

✅ **PHI Protection** in:
- Alert messages sent to Slack, Telegram, Discord, etc.
- Log files
- Error messages
- Audit trails (with full data preserved for compliance)

✅ **Zero Configuration** - Works out of the box with sensible defaults

---

## Quick Answer

### Q: Does it alert on database/data conflicts?

**YES! Automatically.** ✅

When using **bidirectional sync**, the system:
1. Detects conflicts when both databases modify the same row
2. Resolves conflicts based on your strategy (latest wins, source wins, etc.)
3. **Automatically sends alerts** to your configured channels (Telegram, Slack, etc.)
4. Logs conflicts in audit trail

### Q: Does it protect PHI if we want to?

**YES! Automatically with multiple protection levels.** ✅

PHI is protected in:
1. **Alerts** - PHI masked before sending to Slack/Telegram/etc.
2. **Logs** - PHI masked in application logs
3. **Audit Trail** - Full data preserved for compliance (encrypted access)
4. **Error Messages** - PHI redacted in error messages

**You choose the protection level:**
- Global PHI masking (`maskPHI: true`)
- Per-channel control (mask in Slack, don't mask in compliance email)
- Custom PHI field patterns
- Multiple protection modes (strict, standard, development)

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────┐
│             Data Sync Manager                       │
│  • Reads from source DB                             │
│  • Writes to target DB                              │
│  • Detects conflicts                                │
│  • Resolves conflicts                               │
└─────────────┬──────────────────────────────────────┘
              │
              │ Emits Events
              ↓
┌─────────────────────────────────────────────────────┐
│         Sync Alert Integration                      │
│  • Listens for sync events                          │
│  • Filters by severity                              │
│  • Triggers alerts                                  │
└─────────────┬──────────────────────────────────────┘
              │
              │ Sends Alerts
              ↓
┌─────────────────────────────────────────────────────┐
│      Enhanced Alert Manager                         │
│  • Masks PHI automatically                          │
│  • Sends to multiple channels                       │
│  • Per-channel PHI control                          │
└─────────────┬──────────────────────────────────────┘
              │
              ↓
      ┌───────────────────┐
      │ Telegram (masked) │
      │ Slack (masked)    │
      │ Email (full data) │ ← Compliance team only
      └───────────────────┘
```

### Conflict Detection Flow

```
1. Bidirectional Sync Running
   ↓
2. Source row modified: patient_name = "John Doe"
   Target row modified: patient_name = "John D. Doe"
   ↓
3. Conflict Detected!
   • Both rows changed
   • Timestamps differ
   ↓
4. Conflict Resolved
   • Strategy: latest_wins
   • Winner: Target (newer timestamp)
   ↓
5. Alert Sent
   • Telegram: PHI masked
   • Slack: PHI masked
   • Email (compliance): Full data
   ↓
6. Audit Logged
   • Full conflict details preserved
   • PHI access tracked
```

---

## Configuration

### Basic Setup - Alerts on Conflicts

```typescript
import { DataSyncManager } from 'db-connector';
import { SyncAlertIntegration } from 'db-connector';

// 1. Create sync manager
const syncManager = new DataSyncManager();
await syncManager.initialize(syncConfig);

// 2. Add alerts (ONE LINE!)
const alerts = new SyncAlertIntegration(syncManager, {
  alertConfig: {
    enabled: true,
    maskPHI: true, // ← PHI protection ON
    channels: [
      {
        type: 'telegram',
        enabled: true,
        config: {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID
        }
      }
    ]
  },
  alertOnConflicts: true, // ← Alert on conflicts
  alertOnErrors: true,
  alertOnFailure: true
});

// 3. Run sync - alerts automatic!
await syncManager.sync();
```

**That's it!** Conflicts will now alert to Telegram with PHI masked. ✨

### Complete Configuration

```typescript
const alertIntegration = new SyncAlertIntegration(syncManager, {
  alertConfig: {
    // Alert system settings
    enabled: true,
    severityThreshold: 'medium',
    notifyOnDrift: true,
    notifyOnMigration: false,
    notifyOnFailure: true,

    // PHI PROTECTION - CRITICAL
    maskPHI: true,
    phiFields: [
      'patient',
      'medical',
      'diagnosis',
      'ssn',
      'insurance'
    ],

    // Alert channels
    channels: [
      // Public channels - PHI MUST be masked
      {
        type: 'telegram',
        enabled: true,
        maskPHI: true, // ← ALWAYS true for public
        config: {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID
        }
      },
      {
        type: 'slack',
        enabled: true,
        maskPHI: true, // ← ALWAYS true for team channels
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL
        }
      },

      // Compliance team - authorized access
      {
        type: 'email',
        enabled: true,
        maskPHI: false, // ← OK for compliance team
        config: {
          recipients: ['hipaa-compliance@example.com']
        }
      }
    ]
  },

  // When to alert
  alertOnConflicts: true, // ← Alert on data conflicts
  alertOnErrors: true,
  alertOnCompletion: false, // Don't alert every time
  alertOnFailure: true,

  // Thresholds
  conflictThreshold: 10, // Alert if >10 conflicts
  errorThreshold: 5 // Alert if >5 errors
});
```

---

## Alert Types

### 1. Conflict Alert

**Triggers when**: Bidirectional sync detects same row modified in both databases

**Example Alert (Telegram)**:
```
⚠️ MEDIUM: Data conflict detected in sync sync-123

Type: conflict_detected
Time: 2024-01-15T10:30:00Z

Details:
{
  "syncId": "sync-123",
  "tableName": "Patients",
  "primaryKey": {"patient_id": 12345},
  "strategy": "latest_wins",
  "sourceData": {
    "patient_name": "***PHI-REDACTED***",
    "ssn": "***-**-****",
    "email": "***@***.***"
  },
  "targetData": {
    "patient_name": "***PHI-REDACTED***",
    "ssn": "***-**-****",
    "email": "***@***.***"
  }
}

✅ PHI automatically masked!
```

### 2. Sync Failed Alert

**Triggers when**: Sync operation fails

**Severity**: CRITICAL

### 3. Table Sync Failed Alert

**Triggers when**: Individual table fails to sync

**Severity**: HIGH

### 4. Error Alert

**Triggers when**: Error occurs during sync

**Severity**: HIGH

### 5. Sync Completed Alert

**Triggers when**: Sync completes (optional)

**Severity**: LOW (or higher if conflicts/errors detected)

---

## PHI Protection

### What Gets Protected

**PHI (Protected Health Information)** includes:

| Category | Examples |
|----------|----------|
| **Identifiers** | Name, SSN, MRN, Patient ID |
| **Demographics** | DOB, Address, Phone, Email |
| **Medical** | Diagnosis, Medications, Lab Results |
| **Insurance** | Policy Number, Subscriber ID |
| **Financial** | Credit Card, Account Number |

### Default PHI Patterns

The system **automatically detects** these field patterns:

```typescript
const DEFAULT_PHI_PATTERNS = [
  // Patient identifiers
  'ssn', 'social_security', 'patient_id', 'patient_name', 'mrn',

  // Demographics
  'dob', 'date_of_birth', 'birthdate',
  'first_name', 'last_name', 'full_name',
  'address', 'street', 'city', 'zip',
  'phone', 'telephone', 'mobile',
  'email',

  // Medical
  'diagnosis', 'medication', 'prescription',
  'treatment', 'procedure',
  'lab_result', 'test_result',

  // Insurance
  'insurance_id', 'policy_number',

  // Financial
  'credit_card', 'account_number'
];
```

### PHI Masking Examples

| Field Type | Original | Masked |
|------------|----------|--------|
| SSN | 123-45-6789 | ***-**-**** |
| Email | john@example.com | ***@***.*** |
| Phone | 555-123-4567 | ***-***-**** |
| Name | John Doe | ***PHI-REDACTED*** |
| DOB | 1980-05-15 | ****-**-** |
| Diagnosis | Hypertension | ***PHI-REDACTED*** |

### Custom PHI Fields

Add your domain-specific PHI fields:

```typescript
{
  maskPHI: true,
  phiFields: [
    'patient_number',
    'medical_record_id',
    'insurance_member_id',
    'prescription_number',
    'lab_order_id'
  ]
}
```

### Per-Channel PHI Control

**IMPORTANT**: Different channels can have different PHI settings:

```typescript
{
  maskPHI: true, // Global default
  channels: [
    // Public team channel - MUST mask
    {
      type: 'slack',
      maskPHI: true, // ✅ PHI masked
      config: { webhookUrl: '...' }
    },

    // Authorized compliance team - full access
    {
      type: 'email',
      maskPHI: false, // ❌ PHI NOT masked (authorized)
      config: {
        recipients: ['hipaa-compliance@example.com']
      }
    }
  ]
}
```

**Use Case**:
- Team sees masked alerts in Slack/Telegram
- Compliance team receives full details via secure email
- Both groups stay informed, PHI stays protected

---

## Complete Examples

### Example 1: Bidirectional Sync with Conflict Alerts

```typescript
import { DataSyncManager, SyncAlertIntegration } from 'db-connector';

// Sync config with bidirectional mode
const syncConfig = {
  id: 'bidirectional-sync',
  name: 'Two-Way Sync with Conflicts',
  source: { /* MSSQL config */ },
  target: { /* PostgreSQL config */ },
  direction: 'bidirectional', // ← Two-way = possible conflicts
  mode: 'continuous',
  conflictStrategy: 'latest_wins',
  tables: [
    {
      sourceTable: 'Patients',
      columns: ['patient_id', 'patient_name', 'ssn', 'updated_at'],
      primaryKey: ['patient_id'],
      timestampColumn: 'updated_at' // ← Required for conflict detection
    }
  ]
};

// Initialize
const syncManager = new DataSyncManager();
await syncManager.initialize(syncConfig);

// Add alerts
const alerts = new SyncAlertIntegration(syncManager, {
  alertConfig: {
    enabled: true,
    maskPHI: true,
    phiFields: ['patient', 'ssn'],
    channels: [
      {
        type: 'telegram',
        enabled: true,
        maskPHI: true,
        config: {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID
        }
      }
    ]
  },
  alertOnConflicts: true, // ← Critical setting
  conflictThreshold: 5
});

// Run
await syncManager.startContinuousSync();

// You'll receive alerts like:
// "⚠️ Data conflict detected: patient_name modified in both DBs
//  PHI: ***PHI-REDACTED***
//  Resolved using: latest_wins"
```

### Example 2: Production Setup

```typescript
// Complete production configuration
const alertIntegration = new SyncAlertIntegration(syncManager, {
  alertConfig: {
    enabled: true,
    severityThreshold: 'high', // Only critical alerts
    notifyOnDrift: true,
    notifyOnFailure: true,
    maskPHI: true,
    phiFields: [
      'patient', 'medical', 'diagnosis',
      'insurance', 'prescription'
    ],
    channels: [
      // Team notifications - masked
      {
        type: 'slack',
        enabled: true,
        maskPHI: true,
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL
        }
      },
      // Mobile alerts - masked
      {
        type: 'telegram',
        enabled: true,
        maskPHI: true,
        config: {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID
        }
      },
      // Critical incidents
      {
        type: 'pagerduty',
        enabled: true,
        config: {
          routingKey: process.env.PAGERDUTY_KEY
        }
      },
      // Compliance - full access
      {
        type: 'email',
        enabled: true,
        maskPHI: false, // Authorized access
        config: {
          recipients: [
            'hipaa-compliance@example.com',
            'security-team@example.com'
          ]
        }
      }
    ]
  },
  alertOnConflicts: true,
  alertOnErrors: true,
  alertOnFailure: true,
  conflictThreshold: 10,
  errorThreshold: 5
});
```

### Example 3: Development/Testing

```typescript
// Lightweight config for development
const alerts = new SyncAlertIntegration(syncManager, {
  alertConfig: {
    enabled: true,
    severityThreshold: 'low', // See everything
    maskPHI: true, // Still protect PHI
    channels: [
      {
        type: 'log', // Just log to console
        enabled: true,
        config: {}
      }
    ]
  },
  alertOnConflicts: true,
  alertOnErrors: true,
  alertOnCompletion: true // See all completions
});
```

---

## Best Practices

### ✅ DO

1. **Always Enable PHI Masking in Production**
   ```typescript
   {
     maskPHI: true, // ← ALWAYS
     phiFields: ['patient', 'medical', ...]
   }
   ```

2. **Use Per-Channel PHI Control**
   ```typescript
   channels: [
     { type: 'slack', maskPHI: true },  // Public
     { type: 'email', maskPHI: false }  // Compliance only
   ]
   ```

3. **Alert on Conflicts in Bidirectional Sync**
   ```typescript
   {
     direction: 'bidirectional',
     alertOnConflicts: true, // ← Important!
     conflictThreshold: 10
   }
   ```

4. **Use Timestamp Columns for Conflict Detection**
   ```typescript
   {
     timestampColumn: 'updated_at', // ← Required
     conflictStrategy: 'latest_wins'
   }
   ```

5. **Test PHI Masking Before Production**
   ```bash
   # Run test sync with dry-run
   db-connector sync once --config test.json --dry-run
   ```

6. **Monitor Alert History**
   ```typescript
   const alerts = integration.getAlertManager();
   const recent = alerts.getHistory(10);
   const unacked = alerts.getUnacknowledged();
   ```

### ❌ DON'T

1. **Don't Disable PHI Masking for Public Channels**
   ```typescript
   // ❌ WRONG
   { type: 'telegram', maskPHI: false }

   // ✅ CORRECT
   { type: 'telegram', maskPHI: true }
   ```

2. **Don't Send PHI to Unauthorized Recipients**
   ```typescript
   // ❌ WRONG
   {
     type: 'slack',
     maskPHI: false, // Team sees full PHI
     config: { webhookUrl: '...' }
   }
   ```

3. **Don't Ignore Conflict Alerts**
   ```typescript
   // ❌ WRONG
   { alertOnConflicts: false }

   // ✅ CORRECT
   { alertOnConflicts: true }
   ```

4. **Don't Set Conflict Threshold Too High**
   ```typescript
   // ❌ WRONG (miss important conflicts)
   { conflictThreshold: 1000 }

   // ✅ CORRECT
   { conflictThreshold: 10 }
   ```

5. **Don't Forget SSL/TLS for PHI**
   ```typescript
   // ❌ WRONG
   { ssl: false }

   // ✅ CORRECT
   { ssl: true } // Required for PHI
   ```

---

## Testing

### Test Conflict Alerts

```bash
# 1. Create test sync config
cat > test-sync.json <<EOF
{
  "direction": "bidirectional",
  "mode": "once",
  ...
}
EOF

# 2. Run with alerts
node examples/sync-with-alerts-and-phi.ts

# 3. Check alerts received in Telegram/Slack
```

### Verify PHI Masking

```typescript
import { testConflictAlert } from './examples/sync-with-alerts-and-phi';

// This shows exactly what alert looks like
await testConflictAlert();

// Output:
// Original: patient_name: "John Doe"
// Masked:   patient_name: "***PHI-REDACTED***"
```

---

## Troubleshooting

### Not Receiving Conflict Alerts

**Check**:
1. `alertOnConflicts: true` is set
2. `direction: 'bidirectional'` is configured
3. `timestampColumn` is specified in table config
4. At least one channel is enabled
5. Conflicts actually occurred (check logs)

### PHI Not Being Masked

**Check**:
1. `maskPHI: true` is set globally
2. Field names match PHI patterns
3. Added custom `phiFields` if needed
4. Per-channel `maskPHI` isn't overriding

### Too Many Alerts

**Solution**:
```typescript
{
  severityThreshold: 'high', // Reduce noise
  alertOnCompletion: false, // Don't alert every time
  conflictThreshold: 20 // Higher threshold
}
```

---

## Security Checklist

- [ ] `maskPHI: true` enabled globally
- [ ] Public channels have `maskPHI: true`
- [ ] Authorized channels documented
- [ ] SSL/TLS enabled (`ssl: true`)
- [ ] Environment variables for credentials
- [ ] Conflict alerts enabled for bidirectional
- [ ] Alert history monitored regularly
- [ ] PHI fields list updated
- [ ] Compliance team receives full alerts
- [ ] Audit trail enabled

---

## Additional Resources

- **[Complete Example Code](../examples/sync-with-alerts-and-phi.ts)**
- **[Alert System Guide](./ALERTS.md)**
- **[Data Sync Guide](./DATA_SYNC.md)**
- **[HIPAA Compliance Guide](./OBSERVABILITY.md)**

---

**Made with 🔒 for HIPAA Compliance**
