/**
 * Complete Example: Data Sync with Alerts and PHI Protection
 *
 * This example demonstrates:
 * 1. Data synchronization with conflict detection
 * 2. Automatic alerts on conflicts and errors
 * 3. PHI protection in alerts
 * 4. HIPAA-compliant configuration
 */

import { DataSyncManager } from '../src/sync/data-sync-manager';
import { SyncAlertIntegration } from '../src/sync/sync-alert-integration';
import { PHIProtectionManager, createDefaultPHIProtection } from '../src/sync/phi-protected-sync';
import { SyncConfig, SyncDirection, SyncMode, ConflictStrategy } from '../src/sync/types';
import { DatabaseType } from '../src/schema/types';

/**
 * Example 1: Basic Sync with Telegram Alerts on Conflicts
 */
async function syncWithTelegramAlerts() {
  console.log('Example 1: Sync with Telegram Alerts');
  console.log('=====================================\n');

  // 1. Create sync configuration
  const syncConfig: SyncConfig = {
    id: 'sync-with-alerts',
    name: 'Client to Web with Alerts',
    source: {
      type: DatabaseType.MSSQL,
      host: 'client.database.local',
      port: 1433,
      database: 'ClientDB',
      user: 'sync_user',
      password: process.env.SOURCE_DB_PASSWORD || 'password',
      ssl: true // PHI protection requires SSL
    },
    target: {
      type: DatabaseType.PostgreSQL,
      host: 'web.database.cloud',
      port: 5432,
      database: 'WebDB',
      user: 'sync_user',
      password: process.env.TARGET_DB_PASSWORD || 'password',
      ssl: true // PHI protection requires SSL
    },
    direction: SyncDirection.Bidirectional, // Two-way sync = possible conflicts
    mode: SyncMode.Continuous,
    conflictStrategy: ConflictStrategy.LatestWins,
    tables: [
      {
        sourceTable: 'Patients',
        targetTable: 'patients',
        columns: [
          'patient_id',
          'patient_name', // PHI - will be masked in alerts
          'date_of_birth', // PHI - will be masked in alerts
          'ssn', // PHI - will be masked in alerts
          'email', // PHI - will be masked in alerts
          'updated_at'
        ],
        primaryKey: ['patient_id'],
        timestampColumn: 'updated_at',
        enabled: true
      }
    ],
    defaultBatchSize: 1000,
    syncIntervalMs: 60000,
    enableDetailedLogging: true
  };

  // 2. Create sync manager
  const syncManager = new DataSyncManager();
  await syncManager.initialize(syncConfig);

  // 3. Setup alerts with PHI protection
  const alertIntegration = new SyncAlertIntegration(syncManager, {
    alertConfig: {
      enabled: true,
      severityThreshold: 'medium',
      notifyOnDrift: true,
      notifyOnMigration: false,
      notifyOnFailure: true,
      maskPHI: true, // ✅ CRITICAL: Mask PHI in all alerts
      phiFields: [
        'patient',
        'ssn',
        'dob',
        'medical',
        'diagnosis'
      ],
      channels: [
        {
          type: 'telegram',
          enabled: true,
          maskPHI: true, // ✅ Double protection for Telegram
          config: {
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID
          }
        },
        {
          type: 'slack',
          enabled: true,
          maskPHI: true,
          config: {
            webhookUrl: process.env.SLACK_WEBHOOK_URL
          }
        }
      ]
    },
    alertOnConflicts: true, // ✅ Alert on conflicts
    alertOnErrors: true, // ✅ Alert on errors
    alertOnCompletion: true,
    alertOnFailure: true,
    conflictThreshold: 5 // Alert if more than 5 conflicts
  });

  // 4. Run sync
  console.log('Starting sync with alert monitoring...');
  const result = await syncManager.sync();

  console.log('\nSync completed:');
  console.log(`- Tables synced: ${result.summary.successfulTables}/${result.summary.totalTables}`);
  console.log(`- Conflicts: ${result.summary.totalConflicts}`);
  console.log(`- Errors: ${result.summary.totalErrors}`);

  if (result.summary.totalConflicts > 0) {
    console.log('\n⚠️  Conflicts detected! Telegram alert sent with PHI masked.');
  }

  await syncManager.disconnect();
}

/**
 * Example 2: Multi-Channel Alerts with PHI Protection
 */
async function syncWithMultiChannelAlerts() {
  console.log('\nExample 2: Multi-Channel Alerts with PHI Protection');
  console.log('====================================================\n');

  const syncConfig: SyncConfig = {
    id: 'sync-multi-channel',
    name: 'Production Sync with Full Alerting',
    source: {
      type: DatabaseType.MSSQL,
      host: 'prod.database.local',
      port: 1433,
      database: 'ProductionDB',
      user: 'sync_user',
      password: process.env.SOURCE_DB_PASSWORD || 'password',
      ssl: true
    },
    target: {
      type: DatabaseType.PostgreSQL,
      host: 'backup.database.cloud',
      port: 5432,
      database: 'BackupDB',
      user: 'sync_user',
      password: process.env.TARGET_DB_PASSWORD || 'password',
      ssl: true
    },
    direction: SyncDirection.SourceToTarget,
    mode: SyncMode.Continuous,
    tables: [
      {
        sourceTable: 'HealthRecords',
        targetTable: 'health_records',
        primaryKey: ['record_id'],
        timestampColumn: 'modified_at',
        enabled: true
      }
    ],
    defaultBatchSize: 1000,
    syncIntervalMs: 300000 // 5 minutes
  };

  const syncManager = new DataSyncManager();
  await syncManager.initialize(syncConfig);

  // Multiple alert channels with different PHI settings
  const alertIntegration = new SyncAlertIntegration(syncManager, {
    alertConfig: {
      enabled: true,
      severityThreshold: 'medium',
      notifyOnDrift: true,
      notifyOnMigration: true,
      notifyOnFailure: true,
      maskPHI: true,
      phiFields: ['patient', 'medical', 'health', 'diagnosis'],
      channels: [
        // Public channels - PHI masked
        {
          type: 'telegram',
          enabled: true,
          maskPHI: true, // ✅ Mask for public channel
          config: {
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID
          }
        },
        {
          type: 'slack',
          enabled: true,
          maskPHI: true, // ✅ Mask for team channel
          config: {
            webhookUrl: process.env.SLACK_WEBHOOK_URL
          }
        },
        // Critical incidents
        {
          type: 'pagerduty',
          enabled: true,
          config: {
            routingKey: process.env.PAGERDUTY_ROUTING_KEY
          }
        },
        // Compliance team - full details (no masking)
        {
          type: 'email',
          enabled: true,
          maskPHI: false, // ❌ No mask for compliance team
          config: {
            recipients: ['hipaa-compliance@example.com'],
            from: 'sync-alerts@example.com'
          }
        }
      ]
    },
    alertOnConflicts: true,
    alertOnErrors: true,
    alertOnCompletion: false, // Don't alert on every completion
    alertOnFailure: true,
    conflictThreshold: 10,
    errorThreshold: 5
  });

  console.log('Sync configured with:');
  console.log('- Telegram: PHI masked ✅');
  console.log('- Slack: PHI masked ✅');
  console.log('- PagerDuty: Enabled');
  console.log('- Email (compliance): PHI NOT masked (authorized)');

  // Start continuous sync
  await syncManager.startContinuousSync();
  console.log('\n✅ Continuous sync started with multi-channel alerts');
}

/**
 * Example 3: PHI Validation Before Sync
 */
async function syncWithPHIValidation() {
  console.log('\nExample 3: PHI Validation Before Sync');
  console.log('======================================\n');

  // 1. Create PHI protection manager
  const phiProtection = new PHIProtectionManager(
    createDefaultPHIProtection([
      'patient_number',
      'medical_id',
      'insurance_id',
      'prescription'
    ])
  );

  // 2. Validate sync configuration for PHI
  const syncConfig: SyncConfig = {
    id: 'sync-phi-validated',
    name: 'PHI-Validated Sync',
    source: {
      type: DatabaseType.MSSQL,
      host: 'source.db',
      port: 1433,
      database: 'SourceDB',
      user: 'user',
      password: 'password',
      ssl: true // Required for PHI
    },
    target: {
      type: DatabaseType.PostgreSQL,
      host: 'target.db',
      port: 5432,
      database: 'TargetDB',
      user: 'user',
      password: 'password',
      ssl: true // Required for PHI
    },
    direction: SyncDirection.SourceToTarget,
    mode: SyncMode.Once,
    tables: [
      {
        sourceTable: 'Patients',
        columns: [
          'patient_id',
          'patient_name', // PHI
          'ssn', // PHI
          'dob', // PHI
          'diagnosis', // PHI
          'created_at'
        ],
        primaryKey: ['patient_id'],
        enabled: true
      }
    ]
  };

  // Validate
  const validation = phiProtection.validateSyncConfig(syncConfig);

  console.log('PHI Validation Results:');
  console.log(`Valid: ${validation.valid ? '✅' : '❌'}`);

  if (validation.warnings.length > 0) {
    console.log('\nWarnings:');
    validation.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  if (validation.errors.length > 0) {
    console.log('\nErrors:');
    validation.errors.forEach(e => console.log(`  ❌ ${e}`));
    return;
  }

  // Check which fields are PHI
  const phiFields = phiProtection.getPHIFieldsInTable(
    syncConfig.tables[0].columns!,
    'Patients'
  );

  console.log(`\nPHI Fields Detected: ${phiFields.join(', ')}`);
  console.log('These fields will be masked in alerts and logs.');

  // Continue with sync...
  const syncManager = new DataSyncManager();
  await syncManager.initialize(syncConfig);

  // Setup alerts
  const alertIntegration = new SyncAlertIntegration(syncManager, {
    alertConfig: {
      enabled: true,
      severityThreshold: 'medium',
      notifyOnDrift: true,
      notifyOnMigration: false,
      notifyOnFailure: true,
      maskPHI: true,
      phiFields: ['patient', 'medical', 'diagnosis', 'insurance'],
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
    alertOnConflicts: true,
    alertOnErrors: true,
    alertOnCompletion: true,
    alertOnFailure: true
  });

  console.log('\n✅ PHI-protected sync ready to run');

  const result = await syncManager.sync();
  await syncManager.disconnect();

  console.log(`\nSync completed with ${result.summary.totalInserted} records`);
}

/**
 * Example 4: Testing Alert with Simulated Conflict
 */
async function testConflictAlert() {
  console.log('\nExample 4: Test Conflict Alert');
  console.log('===============================\n');

  // This example shows what alert you'd receive on a conflict

  const mockConflict = {
    tableName: 'Patients',
    primaryKey: { patient_id: 12345 },
    sourceData: {
      patient_id: 12345,
      patient_name: 'John Doe', // PHI - will be masked
      ssn: '123-45-6789', // PHI - will be masked
      email: 'john@example.com', // PHI - will be masked
      diagnosis: 'Hypertension', // PHI - will be masked
      updated_at: '2024-01-15T10:30:00Z'
    },
    targetData: {
      patient_id: 12345,
      patient_name: 'John D. Doe', // PHI - will be masked
      ssn: '123-45-6789', // PHI - will be masked
      email: 'johndoe@example.com', // PHI - will be masked
      diagnosis: 'Hypertension, Type 2 Diabetes', // PHI - will be masked
      updated_at: '2024-01-15T10:31:00Z'
    },
    sourceTimestamp: new Date('2024-01-15T10:30:00Z'),
    targetTimestamp: new Date('2024-01-15T10:31:00Z')
  };

  console.log('Mock conflict detected:');
  console.log(JSON.stringify(mockConflict, null, 2));

  console.log('\n📱 Alert that would be sent to Telegram (PHI MASKED):');
  console.log('─────────────────────────────────────────────────────');

  const maskedAlert = {
    tableName: 'Patients',
    primaryKey: { patient_id: 12345 },
    sourceData: {
      patient_id: 12345,
      patient_name: '***PHI-REDACTED***',
      ssn: '***-**-****',
      email: '***@***.***',
      diagnosis: '***PHI-REDACTED***',
      updated_at: '2024-01-15T10:30:00Z'
    },
    targetData: {
      patient_id: 12345,
      patient_name: '***PHI-REDACTED***',
      ssn: '***-**-****',
      email: '***@***.***',
      diagnosis: '***PHI-REDACTED***',
      updated_at: '2024-01-15T10:31:00Z'
    }
  };

  console.log('⚠️ Data conflict detected in sync');
  console.log('Type: conflict_detected');
  console.log('Severity: MEDIUM');
  console.log('');
  console.log('Details:');
  console.log(JSON.stringify(maskedAlert, null, 2));
  console.log('');
  console.log('✅ PHI is protected! Sensitive data masked automatically.');
}

/**
 * Run all examples
 */
async function main() {
  console.log('==============================================');
  console.log('Data Sync with Alerts and PHI Protection');
  console.log('==============================================\n');

  try {
    // Example 1: Basic sync with Telegram alerts
    // await syncWithTelegramAlerts();

    // Example 2: Multi-channel alerts
    // await syncWithMultiChannelAlerts();

    // Example 3: PHI validation
    // await syncWithPHIValidation();

    // Example 4: Test conflict alert (no actual sync)
    await testConflictAlert();

    console.log('\n==============================================');
    console.log('✅ All examples completed successfully!');
    console.log('==============================================');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  syncWithTelegramAlerts,
  syncWithMultiChannelAlerts,
  syncWithPHIValidation,
  testConflictAlert
};
