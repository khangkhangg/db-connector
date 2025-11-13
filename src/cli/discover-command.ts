#!/usr/bin/env node

/**
 * CLI command for discovering and connecting to local SQL Server instances
 * Usage: npm run discover or node dist/cli/discover-command.js
 */

import { MSSQLDiscoveryManager } from '../discovery/mssql-discovery';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   SQL Server Auto-Discovery & Connection Tool            ║');
  console.log('║   (Windows Authentication)                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const discovery = new MSSQLDiscoveryManager();

  // Get current Windows user
  const user = await discovery.getCurrentUser();
  if (user.domain) {
    console.log(`🔐 Authentication: ${user.domain}\\${user.username}\n`);
  } else {
    console.log(`🔐 Authentication: ${user.username}\n`);
  }

  // Discover instances
  console.log('🔍 Discovering SQL Server instances...\n');
  const instances = await discovery.discoverLocalInstances();

  if (instances.length === 0) {
    console.log('❌ No SQL Server instances found on this machine.');
    console.log('\nPossible reasons:');
    console.log('  - SQL Server is not installed');
    console.log('  - SQL Server service is not running');
    console.log('  - SQL Server is installed remotely\n');
    rl.close();
    return;
  }

  console.log(`✅ Found ${instances.length} SQL Server instance(s):\n`);

  instances.forEach((instance, index) => {
    console.log(`  ${index + 1}. ${instance.displayName}`);
    if (instance.version) {
      console.log(`     Version: ${instance.version}`);
    }
  });

  console.log('');

  // Ask user which instance to connect to
  const choice = await question(
    `\nSelect instance to connect (1-${instances.length}, or 'q' to quit): `
  );

  if (choice.toLowerCase() === 'q') {
    console.log('\nExiting...\n');
    rl.close();
    return;
  }

  const instanceIndex = parseInt(choice) - 1;
  if (instanceIndex < 0 || instanceIndex >= instances.length) {
    console.log('\n❌ Invalid selection\n');
    rl.close();
    return;
  }

  const selectedInstance = instances[instanceIndex];
  console.log(`\n🔌 Connecting to ${selectedInstance.displayName}...\n`);

  // Connect to selected instance
  const result = await discovery.connectToLocalInstance(selectedInstance.serverName);

  if (!result.success || !result.pool) {
    console.log(`❌ Connection failed: ${result.error}\n`);
    rl.close();
    return;
  }

  console.log('✅ Successfully connected!\n');

  // Show instance details
  console.log('📊 Instance Information:');
  console.log(`   Server: ${result.instance?.displayName}`);
  console.log(`   Version: ${result.instance?.version}`);
  console.log(`   Clustered: ${result.instance?.isClustered ? 'Yes' : 'No'}`);
  console.log('');

  // Show databases
  if (result.databases && result.databases.length > 0) {
    console.log(`📁 Available Databases (${result.databases.length}):`);
    console.log('');

    result.databases.forEach((db, index) => {
      console.log(`   ${index + 1}. ${db.name}`);
      console.log(`      Size: ${db.size}`);
      console.log(`      Owner: ${db.owner}`);
      if (db.createDate) {
        console.log(`      Created: ${db.createDate.toLocaleDateString()}`);
      }
      console.log('');
    });
  }

  // Ask if user wants to query a database
  const queryChoice = await question('Would you like to explore a database? (y/n): ');

  if (queryChoice.toLowerCase() === 'y' && result.databases && result.databases.length > 0) {
    const dbChoice = await question(
      `\nSelect database (1-${result.databases.length}): `
    );

    const dbIndex = parseInt(dbChoice) - 1;
    if (dbIndex >= 0 && dbIndex < result.databases.length) {
      const selectedDb = result.databases[dbIndex];

      console.log(`\n📊 Exploring database: ${selectedDb.name}\n`);

      try {
        // Get tables in the database
        const tablesResult = await result.pool.request().query(`
          USE [${selectedDb.name}];
          SELECT
            t.name as TableName,
            s.name as SchemaName,
            COUNT(c.column_id) as ColumnCount
          FROM sys.tables t
          INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
          LEFT JOIN sys.columns c ON t.object_id = c.object_id
          GROUP BY t.name, s.name
          ORDER BY s.name, t.name
        `);

        if (tablesResult.recordset.length > 0) {
          console.log(`Tables (${tablesResult.recordset.length}):\n`);

          tablesResult.recordset.forEach((row: any, index: number) => {
            console.log(`   ${index + 1}. ${row.SchemaName}.${row.TableName}`);
            console.log(`      Columns: ${row.ColumnCount}`);
          });
          console.log('');
        } else {
          console.log('No tables found in this database.\n');
        }

        // Get row counts for top tables
        const topTables = tablesResult.recordset.slice(0, 5);
        if (topTables.length > 0) {
          console.log('Row counts for first 5 tables:\n');

          for (const table of topTables) {
            try {
              const countResult = await result.pool.request().query(`
                SELECT COUNT(*) as RowCount
                FROM [${selectedDb.name}].[${table.SchemaName}].[${table.TableName}]
              `);

              const rowCount = countResult.recordset[0].RowCount;
              console.log(`   ${table.SchemaName}.${table.TableName}: ${rowCount.toLocaleString()} rows`);
            } catch (error) {
              console.log(`   ${table.SchemaName}.${table.TableName}: (unable to count)`);
            }
          }
          console.log('');
        }
      } catch (error) {
        console.log(`❌ Error exploring database: ${(error as Error).message}\n`);
      }
    }
  }

  // Show connection string
  console.log('\n📋 Connection String (for use in code):');
  console.log('─────────────────────────────────────────────────');
  console.log('');
  console.log('TypeScript/JavaScript:');
  console.log('```typescript');
  console.log('import { MSSQLConnector } from "./src/connectors/mssql-connector";');
  console.log('');
  console.log('const connector = new MSSQLConnector({');
  console.log(`  server: "${selectedInstance.serverName}",`);
  console.log('  database: "YourDatabase",');
  console.log('  authentication: {');
  console.log('    type: "default"  // Windows Authentication');
  console.log('  },');
  console.log('  options: {');
  console.log('    encrypt: false,');
  console.log('    trustServerCertificate: true');
  console.log('  }');
  console.log('});');
  console.log('```');
  console.log('');

  console.log('Auto-Discovery (easiest):');
  console.log('```typescript');
  console.log('import { MSSQLDiscoveryManager } from "./src/discovery/mssql-discovery";');
  console.log('');
  console.log('const discovery = new MSSQLDiscoveryManager();');
  console.log('const result = await discovery.autoConnectLocal({');
  console.log(`  preferredInstance: "${selectedInstance.instanceName}",`);
  console.log('  database: "YourDatabase"');
  console.log('});');
  console.log('```');
  console.log('');

  // Clean up
  await result.pool.close();
  console.log('✅ Connection closed\n');

  rl.close();
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error('');
  rl.close();
  process.exit(1);
});
