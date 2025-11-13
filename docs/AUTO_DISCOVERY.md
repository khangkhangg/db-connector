# Auto-Discovery for Local SQL Server Instances

Automatically discover and connect to local SQL Server instances using Windows Authentication, just like SQL Server Management Studio (SSMS).

## Overview

The Auto-Discovery feature allows you to:

- 🔍 **Automatically find** all SQL Server instances on your local machine
- 🔐 **Use Windows Authentication** - No need to manage passwords
- ✅ **Connect seamlessly** - Same experience as SQL Server Management Studio
- 📊 **List databases** - Automatically discover all available databases
- ⚡ **Zero configuration** - Works out of the box if SQL Server is installed

## How It Works

### Windows Authentication (Trusted Connection)

When you have SQL Server Management Studio installed and can connect using "Windows Authentication", this feature uses the **same authentication method**:

1. Uses your current Windows user credentials
2. No username/password needed
3. Respects SQL Server permissions for your Windows account
4. Works with domain accounts and local accounts

### Instance Discovery

The discovery process checks:

1. **Common default instances**: `localhost`, `(local)`, `.`, machine name
2. **Named instances**: `SQLEXPRESS`, `MSSQLSERVER`, etc.
3. **Windows Registry** (Windows only): Scans for installed SQL Server instances
4. **SQL Server Browser service**: Enumerates available instances

## Quick Start

### Basic Auto-Connect

The simplest way - automatically find and connect to any available local SQL Server:

```typescript
import { MSSQLDiscoveryManager } from './src/discovery/mssql-discovery';

const discovery = new MSSQLDiscoveryManager();

// Auto-connect to any available local instance
const result = await discovery.autoConnectLocal();

if (result.success && result.pool) {
  console.log('Connected to:', result.instance?.displayName);
  console.log('Available databases:', result.databases?.length);

  // Use the connection
  const data = await result.pool.request().query('SELECT * FROM MyTable');

  await result.pool.close();
}
```

### Discover All Instances First

List all available instances before connecting:

```typescript
const discovery = new MSSQLDiscoveryManager();

// Discover all local SQL Server instances
const instances = await discovery.discoverLocalInstances();

console.log('Found SQL Server instances:');
instances.forEach(instance => {
  console.log(`- ${instance.displayName}`);
});

// Connect to a specific one
const result = await discovery.connectToLocalInstance(instances[0].serverName);
```

## Usage Examples

### 1. Auto-Connect (Like SSMS)

Automatically discover and connect using Windows Authentication:

```typescript
const discovery = new MSSQLDiscoveryManager();

const result = await discovery.autoConnectLocal();

if (result.success) {
  console.log('✅ Connected!');
  console.log('Instance:', result.instance?.displayName);
  console.log('Version:', result.instance?.version);

  // List available databases
  result.databases?.forEach(db => {
    console.log(`- ${db.name} (${db.size})`);
  });
}
```

### 2. Connect to Specific Database

Auto-connect and select a specific database:

```typescript
const result = await discovery.autoConnectLocal({
  database: 'MyDatabase'
});

if (result.success && result.pool) {
  // Already connected to 'MyDatabase'
  const tables = await result.pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
  `);
}
```

### 3. Prefer Specific Instance

Try a preferred instance first, then fallback to others:

```typescript
const result = await discovery.autoConnectLocal({
  preferredInstance: 'SQLEXPRESS',
  database: 'master'
});
```

### 4. Manual Instance Selection

Discover instances and let user choose:

```typescript
const instances = await discovery.discoverLocalInstances();

// Show list to user
console.log('Available SQL Server instances:');
instances.forEach((instance, index) => {
  console.log(`${index + 1}. ${instance.displayName}`);
});

// User selects instance
const selectedInstance = instances[0];

// Connect to selected instance
const result = await discovery.connectToLocalInstance(
  selectedInstance.serverName,
  { database: 'MyDatabase' }
);
```

### 5. Test Connection

Test if a specific instance is accessible:

```typescript
const canConnect = await discovery.testConnection('localhost\\SQLEXPRESS');

if (canConnect) {
  console.log('✅ Instance is accessible');
} else {
  console.log('❌ Cannot connect to instance');
}
```

### 6. Get Current Windows User

See which Windows user will be used for authentication:

```typescript
const user = await discovery.getCurrentUser();

console.log(`Will authenticate as: ${user.domain}\\${user.username}`);
```

## Integration with Existing Code

### Use with MSSQLConnector

Combine discovery with the existing connector:

```typescript
import { MSSQLDiscoveryManager } from './src/discovery/mssql-discovery';
import { MSSQLConnector } from './src/connectors/mssql-connector';

// 1. Discover instance
const discovery = new MSSQLDiscoveryManager();
const result = await discovery.autoConnectLocal();

if (result.success && result.instance) {
  // 2. Close discovery connection
  await result.pool?.close();

  // 3. Create regular connector with discovered settings
  const connector = new MSSQLConnector({
    server: result.instance.serverName,
    database: 'MyDatabase',
    authentication: {
      type: 'default' // Windows Authentication
    },
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  });

  await connector.connect();

  // 4. Use connector normally
  const data = await connector.executeQuery('SELECT * FROM MyTable');
}
```

### Use with Connection Factory

```typescript
import { createAndConnectConnector } from './src/connectors/connector-factory';
import { MSSQLDiscoveryManager } from './src/discovery/mssql-discovery';

// Discover instance
const discovery = new MSSQLDiscoveryManager();
const result = await discovery.autoConnectLocal();

if (result.success && result.instance) {
  await result.pool?.close();

  // Use with factory
  const connector = await createAndConnectConnector({
    type: 'MSSQL',
    config: {
      server: result.instance.serverName,
      database: 'MyDatabase',
      authentication: { type: 'default' },
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    }
  });
}
```

## Common Scenarios

### Scenario 1: Developer Workstation

Developer has SQL Server Express installed locally:

```typescript
// Just auto-connect - it will find SQLEXPRESS automatically
const result = await discovery.autoConnectLocal();

// Works immediately with Windows Authentication
if (result.success) {
  // Start working with database
}
```

### Scenario 2: Multiple Instances

Machine has both default instance and named instances:

```typescript
// Prefer SQLEXPRESS, but fallback to others
const result = await discovery.autoConnectLocal({
  preferredInstance: 'SQLEXPRESS'
});
```

### Scenario 3: Production Server

Connect to default instance on production server:

```typescript
const result = await discovery.connectToLocalInstance(
  'localhost',  // Default instance
  { database: 'ProductionDB' }
);
```

### Scenario 4: Check Availability

Check if SQL Server is available before starting application:

```typescript
async function checkDatabaseAvailability() {
  const discovery = new MSSQLDiscoveryManager();
  const instances = await discovery.discoverLocalInstances();

  if (instances.length === 0) {
    console.error('No SQL Server instances found!');
    process.exit(1);
  }

  const canConnect = await discovery.testConnection(instances[0].serverName);

  if (!canConnect) {
    console.error('Cannot connect to SQL Server!');
    process.exit(1);
  }

  console.log('✅ SQL Server is available');
}
```

## API Reference

### MSSQLDiscoveryManager

#### Methods

##### `discoverLocalInstances(): Promise<DiscoveredInstance[]>`

Discover all SQL Server instances on the local machine.

**Returns:** Array of discovered instances

**Example:**
```typescript
const instances = await discovery.discoverLocalInstances();
```

##### `autoConnectLocal(options?): Promise<LocalConnectionResult>`

Automatically discover and connect to an available local instance.

**Parameters:**
- `options.preferredInstance`: Preferred instance name (optional)
- `options.database`: Database to connect to (optional)

**Returns:** Connection result with pool, instance info, and databases

**Example:**
```typescript
const result = await discovery.autoConnectLocal({
  preferredInstance: 'SQLEXPRESS',
  database: 'MyDB'
});
```

##### `connectToLocalInstance(serverName, options?): Promise<LocalConnectionResult>`

Connect to a specific local SQL Server instance.

**Parameters:**
- `serverName`: Server name (e.g., 'localhost', 'localhost\\SQLEXPRESS')
- `options.database`: Database name (default: 'master')
- `options.encrypt`: Enable encryption (default: false)
- `options.trustServerCertificate`: Trust server certificate (default: true)

**Returns:** Connection result

**Example:**
```typescript
const result = await discovery.connectToLocalInstance('localhost\\SQLEXPRESS');
```

##### `testConnection(serverName, database?): Promise<boolean>`

Test if connection to an instance is possible.

**Parameters:**
- `serverName`: Server name to test
- `database`: Database name (optional)

**Returns:** `true` if connection successful, `false` otherwise

##### `getCurrentUser(): Promise<{ username, domain? }>`

Get the current Windows user that will be used for authentication.

**Returns:** Username and domain (if available)

### Types

#### DiscoveredInstance

```typescript
interface DiscoveredInstance {
  instanceName: string;      // Instance name (e.g., 'SQLEXPRESS')
  serverName: string;        // Full server name (e.g., 'localhost\\SQLEXPRESS')
  version?: string;          // SQL Server version
  isClustered?: boolean;     // Is clustered instance
  isLocal: boolean;          // Is local instance
  displayName: string;       // User-friendly display name
}
```

#### LocalConnectionResult

```typescript
interface LocalConnectionResult {
  success: boolean;                    // Connection successful
  pool?: mssql.ConnectionPool;        // Connection pool (if successful)
  instance?: DiscoveredInstance;      // Instance information
  databases?: DiscoveredDatabase[];   // Available databases
  error?: string;                      // Error message (if failed)
}
```

#### DiscoveredDatabase

```typescript
interface DiscoveredDatabase {
  name: string;          // Database name
  size?: string;         // Size (e.g., '245.50 MB')
  owner?: string;        // Database owner
  createDate?: Date;     // Creation date
}
```

## Troubleshooting

### No Instances Found

**Problem:** `discoverLocalInstances()` returns empty array

**Solutions:**
1. Verify SQL Server is installed: Check in Windows Services
2. Ensure SQL Server service is running
3. Try connecting to known instances manually: `localhost`, `localhost\\SQLEXPRESS`
4. Check if SQL Server Browser service is running (for named instances)

### Cannot Connect with Windows Authentication

**Problem:** Connection fails with authentication error

**Solutions:**
1. Verify your Windows account has SQL Server login permissions
2. Check SQL Server is configured for Windows Authentication mode (not SQL Server Authentication only)
3. Ensure your Windows account has been granted database access
4. Try connecting with SQL Server Management Studio first to verify permissions

### Connection Refused

**Problem:** `ECONNREFUSED` error

**Solutions:**
1. Verify SQL Server is running: Check Windows Services
2. Check firewall settings: Allow SQL Server ports (default: 1433)
3. Verify TCP/IP protocol is enabled in SQL Server Configuration Manager
4. For named instances, ensure SQL Server Browser is running

### Permission Denied

**Problem:** Can connect but cannot access databases

**Solutions:**
1. Grant your Windows account database permissions in SQL Server
2. Use SQL Server Management Studio to add your Windows account as a user
3. Grant appropriate database roles (db_owner, db_datareader, etc.)

## Platform Support

### Windows

✅ **Full Support**
- Windows Authentication (Trusted Connection)
- Registry-based instance discovery
- All features available

### Linux

⚠️ **Limited Support**
- Can connect to SQL Server on Linux
- Windows Authentication not available (use SQL Authentication)
- Instance discovery limited to common defaults

### Docker

⚠️ **Limited Support**
- Can connect to SQL Server in Docker containers
- Use container name or localhost as server name
- SQL Authentication required

## Security Considerations

### Windows Authentication Benefits

- ✅ No passwords in code or configuration files
- ✅ Centralized permission management in SQL Server
- ✅ Audit trail uses Windows account names
- ✅ Automatic credential rotation via Windows
- ✅ Supports domain security policies

### Best Practices

1. **Use Windows Authentication** whenever possible
2. **Encrypt connections** in production environments
3. **Grant minimal permissions** to Windows accounts
4. **Enable auditing** for sensitive databases
5. **Use least-privilege accounts** for application services

## Examples

See `examples/auto-discover-mssql.ts` for complete runnable examples:

```bash
# Run all examples
npm run ts-node examples/auto-discover-mssql.ts

# Run specific example
npm run ts-node examples/auto-discover-mssql.ts 2
```

## Related Documentation

- [SQL Server Configuration](./MSSQL_SETUP.md)
- [Connection Management](./CONNECTIONS.md)
- [MDF File Import](./MDF_IMPORT.md)
- [Security Best Practices](./SECURITY.md)
