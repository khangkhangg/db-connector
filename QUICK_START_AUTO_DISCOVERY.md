# Quick Start: Auto-Discovery for Local SQL Server

Get started with automatic SQL Server discovery and connection in 2 minutes!

## Prerequisites

- ✅ SQL Server installed locally (any version: Express, Developer, Standard, Enterprise)
- ✅ SQL Server service running
- ✅ Node.js 18+ installed

## Installation

```bash
npm install
```

## Method 1: Interactive CLI (Easiest)

Run the interactive discovery tool:

```bash
npm run discover
```

This will:
1. Show your Windows username (used for authentication)
2. Auto-discover all SQL Server instances
3. Let you select which instance to connect to
4. Show available databases
5. Provide connection code snippets

**Example Output:**
```
╔════════════════════════════════════════════════════════════╗
║   SQL Server Auto-Discovery & Connection Tool            ║
║   (Windows Authentication)                                ║
╚════════════════════════════════════════════════════════════╝

🔐 Authentication: DOMAIN\username

🔍 Discovering SQL Server instances...

✅ Found 2 SQL Server instance(s):

  1. localhost (Default)
  2. localhost\SQLEXPRESS

Select instance to connect (1-2, or 'q' to quit): 1

🔌 Connecting to localhost...

✅ Successfully connected!

📊 Instance Information:
   Server: DESKTOP-ABC123
   Version: 15.00.4198
   Clustered: No

📁 Available Databases (3):
   1. AdventureWorks
      Size: 245.50 MB
      Owner: sa
   ...
```

## Method 2: Code (Automatic)

Just call `autoConnectLocal()` - it finds and connects automatically:

```typescript
import { MSSQLDiscoveryManager } from './src/discovery/mssql-discovery';

async function quickConnect() {
  const discovery = new MSSQLDiscoveryManager();

  // Auto-connect to any available local SQL Server
  const result = await discovery.autoConnectLocal();

  if (result.success && result.pool) {
    console.log('✅ Connected!');
    console.log('Instance:', result.instance?.displayName);

    // Query any database
    const data = await result.pool.request().query('SELECT @@VERSION');
    console.log(data.recordset[0]);

    await result.pool.close();
  } else {
    console.log('❌ Failed:', result.error);
  }
}

quickConnect();
```

Run it:
```bash
npx ts-node examples/quick-connect.ts
```

## Method 3: Discover Then Choose

List all instances first, then choose:

```typescript
import { MSSQLDiscoveryManager } from './src/discovery/mssql-discovery';

async function discoverAndChoose() {
  const discovery = new MSSQLDiscoveryManager();

  // 1. Discover all instances
  const instances = await discovery.discoverLocalInstances();

  console.log('Found instances:');
  instances.forEach((instance, i) => {
    console.log(`${i + 1}. ${instance.displayName}`);
  });

  // 2. Connect to first one
  const result = await discovery.connectToLocalInstance(
    instances[0].serverName,
    { database: 'master' }
  );

  if (result.success && result.pool) {
    console.log('✅ Connected to:', result.instance?.displayName);
    console.log('Databases:', result.databases?.map(d => d.name));

    await result.pool.close();
  }
}

discoverAndChoose();
```

## Method 4: Specific Instance

Connect to a specific instance by name:

```typescript
const discovery = new MSSQLDiscoveryManager();

// Connect to SQL Express
const result = await discovery.connectToLocalInstance('localhost\\SQLEXPRESS', {
  database: 'MyDatabase'
});
```

Common instance names:
- `localhost` - Default instance
- `localhost\SQLEXPRESS` - SQL Express
- `(local)` - Default instance alias
- `.` - Default instance short alias

## How It Works

### Windows Authentication

The tool uses **Windows Authentication** (same as SQL Server Management Studio):

- ✅ No password needed
- ✅ Uses your current Windows user credentials
- ✅ Respects SQL Server permissions for your account
- ✅ Works with domain accounts and local accounts

To see which user will be used:
```bash
echo %USERDOMAIN%\%USERNAME%
```

Or in code:
```typescript
const user = await discovery.getCurrentUser();
console.log(`${user.domain}\\${user.username}`);
```

### Discovery Process

The tool finds SQL Server instances by checking:

1. **Common defaults**: `localhost`, `(local)`, `.`
2. **Named instances**: `SQLEXPRESS`, `MSSQLSERVER`
3. **Windows Registry**: Scans for installed instances (Windows only)
4. **Machine name**: Checks your computer's hostname

## Troubleshooting

### "No SQL Server instances found"

**Solutions:**
1. Check if SQL Server service is running:
   - Open "Services" (services.msc)
   - Look for "SQL Server (MSSQLSERVER)" or "SQL Server (SQLEXPRESS)"
   - Ensure it's running

2. Try connecting manually to verify SQL Server is accessible:
   ```bash
   sqlcmd -S localhost -E
   ```

### "Connection failed: Login failed for user"

**Solutions:**
1. Verify your Windows account has SQL Server access:
   - Open SQL Server Management Studio (SSMS)
   - Connect using Windows Authentication
   - Go to Security → Logins
   - Add your Windows account if not present

2. Check SQL Server authentication mode:
   - Right-click server in SSMS → Properties → Security
   - Ensure "Windows Authentication" or "SQL Server and Windows Authentication mode" is selected

### "Cannot connect to localhost"

**Solutions:**
1. Try other instance names:
   ```typescript
   await discovery.connectToLocalInstance('(local)');
   await discovery.connectToLocalInstance('.');
   await discovery.connectToLocalInstance('localhost\\SQLEXPRESS');
   ```

2. Enable TCP/IP protocol:
   - Open SQL Server Configuration Manager
   - SQL Server Network Configuration → Protocols
   - Enable TCP/IP

## Next Steps

### 1. Query Databases

```typescript
const result = await discovery.autoConnectLocal({
  database: 'MyDatabase'
});

if (result.success && result.pool) {
  const customers = await result.pool.request().query(
    'SELECT * FROM Customers WHERE Active = 1'
  );

  console.log('Active customers:', customers.recordset.length);
}
```

### 2. Use with Existing Connectors

```typescript
import { MSSQLConnector } from './src/connectors/mssql-connector';

// Discover instance
const discovery = new MSSQLDiscoveryManager();
const result = await discovery.autoConnectLocal();

if (result.success && result.instance) {
  await result.pool?.close();

  // Use with MSSQLConnector
  const connector = new MSSQLConnector({
    server: result.instance.serverName,
    database: 'MyDatabase',
    authentication: { type: 'default' } // Windows Auth
  });

  await connector.connect();
  // Use connector...
}
```

### 3. Run Examples

```bash
# Run all auto-discovery examples
npm run discover:examples

# Run specific example (1-7)
npx ts-node examples/auto-discover-mssql.ts 2
```

### 4. Read Full Documentation

See [Auto-Discovery Guide](./docs/AUTO_DISCOVERY.md) for:
- Complete API reference
- Advanced scenarios
- Security best practices
- Integration patterns
- Platform-specific notes

## Common Use Cases

### Developer Workstation

```typescript
// Just auto-connect - works instantly on dev machine
const result = await discovery.autoConnectLocal();
```

### Test Environment

```typescript
// Ensure SQL Express is available
const canConnect = await discovery.testConnection('localhost\\SQLEXPRESS');

if (!canConnect) {
  console.error('Test database not available!');
  process.exit(1);
}
```

### Multiple Instances

```typescript
// Try preferred instance first, fallback to others
const result = await discovery.autoConnectLocal({
  preferredInstance: 'SQLEXPRESS'
});
```

### Specific Database

```typescript
// Auto-connect directly to your database
const result = await discovery.autoConnectLocal({
  database: 'AdventureWorks'
});
```

## Help & Support

- 📖 [Full Documentation](./docs/AUTO_DISCOVERY.md)
- 💡 [Examples](./examples/auto-discover-mssql.ts)
- 🐛 [Report Issues](https://github.com/your-org/db-connector/issues)

## That's It! 🎉

You can now auto-discover and connect to SQL Server with zero configuration!

```typescript
// One line to connect!
const result = await discovery.autoConnectLocal();
```

Just like SQL Server Management Studio, but in code! 🚀
