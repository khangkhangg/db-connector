/**
 * Examples of auto-discovering and connecting to local SQL Server instances
 * Just like SQL Server Management Studio does
 */

import { MSSQLDiscoveryManager } from '../src/discovery/mssql-discovery';
import { MSSQLConnector } from '../src/connectors/mssql-connector';

async function example1_DiscoverAllInstances() {
  console.log('\n=== Example 1: Discover All Local SQL Server Instances ===\n');

  const discovery = new MSSQLDiscoveryManager();

  // Discover all local instances
  const instances = await discovery.discoverLocalInstances();

  console.log(`Found ${instances.length} SQL Server instances:\n`);

  instances.forEach((instance, index) => {
    console.log(`${index + 1}. ${instance.displayName}`);
    console.log(`   Instance Name: ${instance.instanceName}`);
    console.log(`   Server Name: ${instance.serverName}`);
    if (instance.version) {
      console.log(`   Version: ${instance.version}`);
    }
    console.log('');
  });
}

async function example2_AutoConnectToLocal() {
  console.log('\n=== Example 2: Auto-Connect to Local SQL Server (Like SSMS) ===\n');

  const discovery = new MSSQLDiscoveryManager();

  // Automatically discover and connect to any available local instance
  // Uses Windows Authentication (current user credentials)
  const result = await discovery.autoConnectLocal();

  if (result.success && result.pool) {
    console.log('✅ Successfully auto-connected to local SQL Server!');
    console.log(`\nInstance: ${result.instance?.displayName}`);
    console.log(`Version: ${result.instance?.version}`);

    if (result.databases && result.databases.length > 0) {
      console.log(`\nAvailable databases (${result.databases.length}):`);
      result.databases.forEach(db => {
        console.log(`  - ${db.name} (${db.size})`);
      });
    }

    // Use the connection
    const queryResult = await result.pool.request().query('SELECT @@VERSION as Version');
    console.log('\nSQL Server Version:');
    console.log(queryResult.recordset[0].Version);

    await result.pool.close();
  } else {
    console.log('❌ Failed to auto-connect:', result.error);
  }
}

async function example3_ConnectToSpecificInstance() {
  console.log('\n=== Example 3: Connect to Specific Local Instance ===\n');

  const discovery = new MSSQLDiscoveryManager();

  // Connect to SQL Server Express specifically
  const result = await discovery.connectToLocalInstance('localhost\\SQLEXPRESS', {
    database: 'master'
  });

  if (result.success && result.pool) {
    console.log('✅ Connected to SQL Server Express!');

    // List all databases
    if (result.databases) {
      console.log('\nUser databases:');
      result.databases.forEach(db => {
        console.log(`  - ${db.name}`);
        console.log(`    Size: ${db.size}`);
        console.log(`    Owner: ${db.owner}`);
        console.log('');
      });
    }

    await result.pool.close();
  } else {
    console.log('❌ Connection failed:', result.error);
  }
}

async function example4_AutoConnectToPreferredDatabase() {
  console.log('\n=== Example 4: Auto-Connect to Specific Database ===\n');

  const discovery = new MSSQLDiscoveryManager();

  // Auto-connect and specify which database to use
  const result = await discovery.autoConnectLocal({
    database: 'AdventureWorks',  // Or any database name
    preferredInstance: 'SQLEXPRESS'
  });

  if (result.success && result.pool) {
    console.log('✅ Connected to database!');
    console.log(`Instance: ${result.instance?.displayName}`);
    console.log(`Database: AdventureWorks`);

    // Query the database
    const tables = await result.pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    console.log(`\nTables (${tables.recordset.length}):`);
    tables.recordset.forEach((row: any) => {
      console.log(`  - ${row.TABLE_NAME}`);
    });

    await result.pool.close();
  } else {
    console.log('❌ Connection failed:', result.error);
    console.log('Note: Make sure AdventureWorks database exists');
  }
}

async function example5_GetCurrentWindowsUser() {
  console.log('\n=== Example 5: Show Current Windows User (For Authentication) ===\n');

  const discovery = new MSSQLDiscoveryManager();

  const user = await discovery.getCurrentUser();

  console.log('Current Windows user that will be used for authentication:');
  if (user.domain) {
    console.log(`  ${user.domain}\\${user.username}`);
  } else {
    console.log(`  ${user.username}`);
  }

  console.log('\nThis is the same user that SQL Server Management Studio would use');
  console.log('when you select "Windows Authentication"');
}

async function example6_TestMultipleInstances() {
  console.log('\n=== Example 6: Test Connection to Multiple Instances ===\n');

  const discovery = new MSSQLDiscoveryManager();

  const instancesToTest = [
    'localhost',
    'localhost\\SQLEXPRESS',
    '(local)',
    '.'
  ];

  console.log('Testing connections to common SQL Server instances...\n');

  for (const instance of instancesToTest) {
    const canConnect = await discovery.testConnection(instance);

    if (canConnect) {
      console.log(`✅ ${instance} - Connected`);
    } else {
      console.log(`❌ ${instance} - Failed`);
    }
  }
}

async function example7_UseWithExistingConnector() {
  console.log('\n=== Example 7: Use Discovery with MSSQLConnector ===\n');

  const discovery = new MSSQLDiscoveryManager();

  // Auto-discover and connect
  const result = await discovery.autoConnectLocal();

  if (result.success && result.instance) {
    console.log(`✅ Discovered instance: ${result.instance.displayName}`);

    // Close the discovery connection
    if (result.pool) {
      await result.pool.close();
    }

    // Now use the regular MSSQLConnector with the discovered instance
    const connector = new MSSQLConnector({
      server: result.instance.serverName,
      database: result.databases?.[0]?.name || 'master',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      authentication: {
        type: 'default' // Windows Authentication
      }
    });

    await connector.connect();
    console.log('✅ Connected using MSSQLConnector');

    // Use the connector
    const tables = await connector.executeQuery(
      `SELECT name FROM sys.tables ORDER BY name`
    );

    console.log(`\nSystem tables: ${tables.length}`);

    await connector.disconnect();
  } else {
    console.log('❌ No instances found');
  }
}

// Run all examples
async function runAllExamples() {
  try {
    await example1_DiscoverAllInstances();
    await example2_AutoConnectToLocal();
    await example3_ConnectToSpecificInstance();
    await example4_AutoConnectToPreferredDatabase();
    await example5_GetCurrentWindowsUser();
    await example6_TestMultipleInstances();
    await example7_UseWithExistingConnector();
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run individual example
async function runExample(exampleNumber: number) {
  const examples = [
    example1_DiscoverAllInstances,
    example2_AutoConnectToLocal,
    example3_ConnectToSpecificInstance,
    example4_AutoConnectToPreferredDatabase,
    example5_GetCurrentWindowsUser,
    example6_TestMultipleInstances,
    example7_UseWithExistingConnector
  ];

  if (exampleNumber >= 1 && exampleNumber <= examples.length) {
    await examples[exampleNumber - 1]();
  } else {
    console.log(`Example ${exampleNumber} not found. Available: 1-${examples.length}`);
  }
}

// Export for use in other files
export {
  example1_DiscoverAllInstances,
  example2_AutoConnectToLocal,
  example3_ConnectToSpecificInstance,
  example4_AutoConnectToPreferredDatabase,
  example5_GetCurrentWindowsUser,
  example6_TestMultipleInstances,
  example7_UseWithExistingConnector,
  runAllExamples,
  runExample
};

// If run directly
if (require.main === module) {
  const exampleNum = process.argv[2] ? parseInt(process.argv[2]) : null;

  if (exampleNum) {
    runExample(exampleNum);
  } else {
    runAllExamples();
  }
}
