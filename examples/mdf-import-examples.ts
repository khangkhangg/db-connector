/**
 * MDF File Import Examples
 *
 * Shows how to import SQL Server MDF database files and sync their data
 */

import { MDFImportManager, createMDFImportManager } from '../src/import/mdf-import-manager';
import { DataSyncManager } from '../src/sync/data-sync-manager';
import { SyncConfig, SyncDirection, SyncMode } from '../src/sync/types';
import { DatabaseType } from '../src/schema/types';
import * as path from 'path';

/**
 * Example 1: Import MDF and Sync to Cloud Database
 */
async function importAndSyncMDF() {
  console.log('Example 1: Import MDF and Sync to Cloud');
  console.log('=========================================\n');

  // 1. Connect to SQL Server instance
  const mdfManager = await createMDFImportManager({
    host: 'localhost', // Your SQL Server host
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'YourPassword123!'
  });

  // 2. Import MDF file
  const mdfPath = 'C:\\Database\\ClientDB.mdf';

  console.log(`Importing MDF: ${mdfPath}`);

  const importResult = await mdfManager.importMDF(
    {
      mdfPath,
      // ldfPath: 'C:\\Database\\ClientDB_log.ldf' // Optional, auto-detected
    },
    {
      databaseName: 'ImportedClientDB', // Custom name
      forceDetach: true, // Detach if already exists
      readOnly: false
    }
  );

  console.log('Import Result:', importResult);
  console.log(`✅ Database '${importResult.databaseName}' attached successfully`);
  console.log(`   MDF Size: ${(importResult.fileInfo!.mdfSize / 1024 / 1024).toFixed(2)} MB`);

  // 3. Now sync the imported database to cloud
  const syncManager = new DataSyncManager();

  const syncConfig: SyncConfig = {
    id: 'mdf-to-cloud-sync',
    name: 'Imported MDF to Cloud Sync',
    source: {
      type: DatabaseType.MSSQL,
      host: 'localhost',
      port: 1433,
      database: importResult.databaseName, // Use imported database
      user: 'sa',
      password: process.env.SQL_SERVER_PASSWORD || 'YourPassword123!',
      ssl: false
    },
    target: {
      type: DatabaseType.PostgreSQL,
      host: 'cloud.database.com',
      port: 5432,
      database: 'CloudDB',
      user: 'sync_user',
      password: process.env.CLOUD_DB_PASSWORD || 'password',
      ssl: true
    },
    direction: SyncDirection.SourceToTarget,
    mode: SyncMode.Once,
    tables: [
      {
        sourceTable: 'Customers',
        targetTable: 'customers',
        primaryKey: ['customer_id'],
        enabled: true
      },
      {
        sourceTable: 'Orders',
        targetTable: 'orders',
        primaryKey: ['order_id'],
        enabled: true
      }
    ],
    defaultBatchSize: 1000
  };

  await syncManager.initialize(syncConfig);

  console.log('\nStarting sync from imported MDF to cloud...');
  const syncResult = await syncManager.sync();

  console.log('\nSync Results:');
  console.log(`- Inserted: ${syncResult.summary.totalInserted}`);
  console.log(`- Updated: ${syncResult.summary.totalUpdated}`);
  console.log(`- Errors: ${syncResult.summary.totalErrors}`);

  await syncManager.disconnect();

  // 4. Optionally detach when done
  // await mdfManager.detachDatabase(importResult.databaseName);

  console.log('\n✅ Complete! MDF imported and data synced to cloud.');
}

/**
 * Example 2: Import Multiple MDF Files
 */
async function importMultipleMDFs() {
  console.log('\nExample 2: Import Multiple MDF Files');
  console.log('=====================================\n');

  const mdfManager = await createMDFImportManager({
    host: 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'password'
  });

  const mdfFiles = [
    'C:\\Backups\\Database1.mdf',
    'C:\\Backups\\Database2.mdf',
    'C:\\Backups\\Database3.mdf'
  ];

  for (const mdfPath of mdfFiles) {
    try {
      console.log(`Importing: ${path.basename(mdfPath)}`);

      const result = await mdfManager.importMDF(
        { mdfPath },
        { forceDetach: true }
      );

      console.log(`  ✅ ${result.databaseName} - ${(result.fileInfo!.mdfSize / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
    }
  }

  // List all imported databases
  const databases = await mdfManager.listDatabases();
  console.log('\nAttached Databases:', databases.join(', '));
}

/**
 * Example 3: Get MDF Info Without Importing
 */
async function inspectMDF() {
  console.log('\nExample 3: Inspect MDF Without Importing');
  console.log('=========================================\n');

  const mdfManager = await createMDFImportManager({
    host: 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'password'
  });

  const mdfPath = 'C:\\Database\\ClientDB.mdf';

  // Get info without attaching
  const info = await mdfManager.getMDFInfo(mdfPath);

  console.log('MDF File Information:');
  console.log(`  Database Name: ${info.databaseName}`);
  console.log(`  MDF Size: ${(info.fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Has Log File: ${info.hasLogFile ? 'Yes' : 'No'}`);

  if (info.logFileSize) {
    console.log(`  Log File Size: ${(info.logFileSize / 1024 / 1024).toFixed(2)} MB`);
  }
}

/**
 * Example 4: Import, Sync, Then Detach
 */
async function importSyncDetach() {
  console.log('\nExample 4: Import → Sync → Detach');
  console.log('==================================\n');

  const mdfManager = await createMDFImportManager({
    host: 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'password'
  });

  const mdfPath = 'C:\\Database\\ClientDB.mdf';

  try {
    // 1. Import (attach)
    console.log('1. Importing MDF...');
    const importResult = await mdfManager.importMDF({ mdfPath });
    const dbName = importResult.databaseName;
    console.log(`   ✅ Attached as '${dbName}'`);

    // 2. Sync data
    console.log('\n2. Syncing data to cloud...');
    const syncManager = new DataSyncManager();

    await syncManager.initialize({
      id: 'temp-sync',
      name: 'Temporary Sync',
      source: {
        type: DatabaseType.MSSQL,
        host: 'localhost',
        port: 1433,
        database: dbName,
        user: 'sa',
        password: process.env.SQL_SERVER_PASSWORD || 'password'
      },
      target: {
        type: DatabaseType.PostgreSQL,
        host: 'cloud.db',
        port: 5432,
        database: 'TargetDB',
        user: 'user',
        password: process.env.TARGET_DB_PASSWORD || 'password',
        ssl: true
      },
      direction: SyncDirection.SourceToTarget,
      mode: SyncMode.Once,
      tables: [
        { sourceTable: 'Users', primaryKey: ['id'], enabled: true }
      ]
    });

    const result = await syncManager.sync();
    console.log(`   ✅ Synced ${result.summary.totalInserted} records`);

    await syncManager.disconnect();

    // 3. Detach (cleanup)
    console.log('\n3. Detaching database...');
    await mdfManager.detachDatabase(dbName);
    console.log(`   ✅ Database '${dbName}' detached`);

    console.log('\n✅ Complete! MDF imported, synced, and cleaned up.');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 5: Backup and Restore
 */
async function backupAndRestore() {
  console.log('\nExample 5: Backup and Restore');
  console.log('==============================\n');

  const mdfManager = await createMDFImportManager({
    host: 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'password'
  });

  const databaseName = 'ProductionDB';
  const backupPath = 'C:\\Backups\\ProductionDB_backup.bak';

  // 1. Backup existing database
  console.log('1. Creating backup...');
  await mdfManager.backupDatabase(databaseName, backupPath);
  console.log(`   ✅ Backed up to: ${backupPath}`);

  // 2. Restore to new database
  console.log('\n2. Restoring to new database...');
  await mdfManager.restoreDatabase(
    backupPath,
    'ProductionDB_Restored',
    { replace: false }
  );
  console.log('   ✅ Restored as ProductionDB_Restored');

  // 3. List all databases
  const databases = await mdfManager.listDatabases();
  console.log('\n3. Available databases:');
  databases.forEach(db => console.log(`   - ${db}`));
}

/**
 * Example 6: Read-Only MDF Access
 */
async function readOnlyMDFAccess() {
  console.log('\nExample 6: Read-Only MDF Access');
  console.log('================================\n');

  const mdfManager = await createMDFImportManager({
    host: 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'password'
  });

  // Attach as read-only
  const result = await mdfManager.importMDF(
    {
      mdfPath: 'C:\\Database\\Archive.mdf'
    },
    {
      databaseName: 'ArchiveDB_ReadOnly',
      readOnly: true, // ← Read-only mode
      forceDetach: true
    }
  );

  console.log(`✅ Attached '${result.databaseName}' in read-only mode`);
  console.log('   Perfect for archival access without modification risk');

  // Can now query but not modify
  // await syncManager.sync() // Will work for reading
}

/**
 * Example 7: Network Share MDF Import
 */
async function networkShareMDF() {
  console.log('\nExample 7: Import MDF from Network Share');
  console.log('=========================================\n');

  const mdfManager = await createMDFImportManager({
    host: 'localhost',
    port: 1433,
    user: 'sa',
    password: process.env.SQL_SERVER_PASSWORD || 'password'
  });

  // UNC path to network share
  const networkMDFPath = '\\\\FileServer\\Backups\\ClientDB.mdf';

  console.log(`Importing from network: ${networkMDFPath}`);
  console.log('Note: SQL Server service account needs network access');

  try {
    const result = await mdfManager.importMDF(
      { mdfPath: networkMDFPath },
      { forceDetach: true }
    );

    console.log(`✅ Imported from network share: ${result.databaseName}`);
  } catch (error: any) {
    if (error.message.includes('access denied')) {
      console.error('❌ SQL Server service account lacks network permissions');
      console.error('   Grant the SQL Server service account read access to the network share');
    } else {
      console.error('❌ Import failed:', error.message);
    }
  }
}

/**
 * Main function - Run examples
 */
async function main() {
  console.log('============================================');
  console.log('MDF File Import Examples');
  console.log('============================================\n');

  const examples = [
    { name: 'Import and Sync MDF', fn: importAndSyncMDF },
    { name: 'Import Multiple MDFs', fn: importMultipleMDFs },
    { name: 'Inspect MDF Info', fn: inspectMDF },
    { name: 'Import → Sync → Detach', fn: importSyncDetach },
    { name: 'Backup and Restore', fn: backupAndRestore },
    { name: 'Read-Only Access', fn: readOnlyMDFAccess },
    { name: 'Network Share Import', fn: networkShareMDF }
  ];

  console.log('Available examples:');
  examples.forEach((ex, i) => {
    console.log(`  ${i + 1}. ${ex.name}`);
  });

  console.log('\nTo run an example, uncomment it in the code below:\n');

  try {
    // Uncomment the example you want to run:

    // await importAndSyncMDF();
    // await importMultipleMDFs();
    // await inspectMDF();
    // await importSyncDetach();
    // await backupAndRestore();
    // await readOnlyMDFAccess();
    // await networkShareMDF();

    console.log('👆 Uncomment an example above to run it');
  } catch (error) {
    console.error('❌ Error running example:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  importAndSyncMDF,
  importMultipleMDFs,
  inspectMDF,
  importSyncDetach,
  backupAndRestore,
  readOnlyMDFAccess,
  networkShareMDF
};
