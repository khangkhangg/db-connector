# Running as a Windows Client Application

This application can run as a **Windows client application** that discovers and connects to local SQL Server instances, just like SQL Server Management Studio.

## Architecture Overview

The DB Connector can operate in multiple modes:

### 1. **Windows Client Mode** (Local Development)
- Runs on your Windows workstation/laptop
- Auto-discovers local SQL Server instances
- Uses Windows Authentication (no passwords needed)
- Web UI accessible at `http://localhost:3000`
- Perfect for developers and local database management

### 2. **Server Mode** (Remote/Cloud)
- Runs on a server (Windows or Linux)
- Connects to remote databases (MSSQL, MySQL, PostgreSQL)
- API accessible over network
- Can sync data between multiple databases

### 3. **Hybrid Mode**
- Runs on Windows client
- Discovers local SQL Server
- Also connects to remote cloud databases
- Syncs local ↔ cloud

## Windows Client Setup

### Quick Start (5 minutes)

1. **Install Prerequisites**
   ```bash
   # Node.js 18+ required
   node --version
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Application**
   ```bash
   # Option 1: Run directly (recommended for development)
   npm start

   # Option 2: Build and run
   npm run build
   node dist/index.js
   ```

4. **Open Web UI**
   - Open browser: `http://localhost:3000`
   - You'll see the Connection Manager UI
   - Click "Discover Local SQL Server Instances"
   - Select your instance and connect!

### Configuration

Create `.env` file for Windows client:

```env
# Application Mode
NODE_ENV=development

# Server Configuration
API_PORT=3000
API_HOST=0.0.0.0

# Disable authentication for local use
API_ENABLE_AUTH=false

# Logging
LOG_LEVEL=info
LOG_FORMAT=console

# OPTIONAL: Default database connections
# (Leave empty to use auto-discovery)
DEFAULT_MSSQL_SERVER=localhost
DEFAULT_MSSQL_DATABASE=master
```

## Using the Web UI

### 1. Auto-Discovery Panel (Left Side)

**Discover Local SQL Server Instances:**
- Click "Discover Local SQL Server Instances" button
- System scans for:
  - Default instances (`localhost`, `(local)`, `.`)
  - Named instances (`SQLEXPRESS`, custom names)
  - Registry-installed instances (Windows only)

**Select and Connect:**
- Click on any discovered instance
- View instance details and available databases
- Click "Connect to Selected Instance"
- Automatically uses Windows Authentication

### 2. Manual Connection Panel (Right Side)

**Configure Connection Manually:**
- **Database Type**: Choose MSSQL, MySQL, or PostgreSQL
- **Server/Host**: Enter server name (e.g., `localhost\SQLEXPRESS`)
- **Port**: Auto-filled based on database type
- **Database**: Database name to connect to
- **Windows Authentication**: Check this for local SQL Server (no password needed)
- **Username/Password**: For SQL Authentication or other databases

**Actions:**
- **Test Connection**: Verify settings without connecting
- **Save Connection**: Save to browser localStorage for reuse
- **Connect**: Establish connection

### 3. Saved Connections Panel (Bottom)

- View all saved connection profiles
- Click "Load" to fill form with saved settings
- Click "Delete" to remove saved connection
- Connections stored in browser (localStorage)

### 4. Active Connection Info

- Shows currently connected database
- Connection details and status
- "Disconnect" button to close connection

## Running as Windows Service

### Option 1: Using node-windows

```bash
# Install node-windows
npm install -g node-windows

# Create Windows service
npm install
npm run build

# Create service script
node create-service.js
```

Create `create-service.js`:

```javascript
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'DB Connector',
  description: 'Database Schema Mapper Connector Service',
  script: 'C:\\path\\to\\db-connector\\dist\\index.js',
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: {
    name: "NODE_ENV",
    value: "production"
  }
});

svc.on('install', () => {
  svc.start();
  console.log('Service installed and started');
});

svc.install();
```

### Option 2: Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/index.js --name db-connector

# Save configuration
pm2 save

# Setup Windows startup
pm2 startup windows
```

### Option 3: Using NSSM (Non-Sucking Service Manager)

```bash
# Download NSSM: https://nssm.cc/download

# Install service
nssm install DBConnector "C:\Program Files\nodejs\node.exe"

# Configure service
nssm set DBConnector AppDirectory "C:\path\to\db-connector"
nssm set DBConnector AppParameters "dist\index.js"
nssm set DBConnector DisplayName "DB Connector Service"
nssm set DBConnector Description "Database Schema Mapper Connector"
nssm set DBConnector Start SERVICE_AUTO_START

# Start service
nssm start DBConnector
```

## Accessing from Other Machines

To access the UI from other computers on your network:

1. **Configure API_HOST**
   ```env
   API_HOST=0.0.0.0  # Listen on all network interfaces
   ```

2. **Configure Firewall**
   ```powershell
   # Windows Firewall - Allow port 3000
   New-NetFirewallRule -DisplayName "DB Connector" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

3. **Access from Network**
   ```
   http://<your-computer-ip>:3000
   ```

4. **Get Your IP Address**
   ```powershell
   ipconfig
   # Look for IPv4 Address
   ```

## Windows Authentication Requirements

For Windows Authentication to work:

### 1. SQL Server Configuration

- SQL Server must be configured for **Windows Authentication** or **Mixed Mode**
- Your Windows account must have SQL Server login permissions

**Check in SQL Server Management Studio (SSMS):**
1. Connect to SQL Server
2. Right-click server → Properties → Security
3. Ensure "Windows Authentication" or "SQL Server and Windows Authentication mode" is selected
4. Security → Logins → Add your Windows account

### 2. Windows Permissions

Your Windows account needs:
- SQL Server login permission
- Database access permission
- Appropriate role membership (e.g., `db_datareader`, `db_datawriter`, `db_owner`)

**Grant permissions (run in SSMS):**
```sql
-- Add Windows user as login
CREATE LOGIN [DOMAIN\Username] FROM WINDOWS;

-- Grant database access
USE [YourDatabase];
CREATE USER [DOMAIN\Username] FOR LOGIN [DOMAIN\Username];

-- Grant roles
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\Username];
ALTER ROLE db_datawriter ADD MEMBER [DOMAIN\Username];
```

### 3. SQL Server Service Account

If SQL Server runs as a service:
- Ensure the service account has necessary permissions
- Check in SQL Server Configuration Manager

## Client Application Features

### Local Database Discovery

✅ **Automatic Instance Discovery**
- Finds all SQL Server instances on local machine
- Shows version, clustering status
- Lists all available databases

✅ **Windows Authentication**
- Uses current Windows user credentials
- No password management needed
- Secure trusted connection

✅ **Database Browsing**
- View all databases on instance
- See database size and owner
- Quick database statistics

### Connection Management

✅ **Save Connection Profiles**
- Save frequently used connections
- Quick connection switching
- Stored locally in browser

✅ **Test Connections**
- Verify settings before connecting
- Quick connectivity check
- Troubleshoot connection issues

✅ **Multi-Database Support**
- MSSQL with Windows Authentication
- MySQL remote connections
- PostgreSQL remote connections

### Data Operations (via API)

Once connected, use the REST API for:
- Schema reading and comparison
- Data synchronization
- CRUD operations
- Migration management

## Deployment Scenarios

### Scenario 1: Developer Workstation

**Use Case**: Developer working with local SQL Server Express

**Setup**:
```bash
npm install
npm start
```

**Access**: `http://localhost:3000`

**Benefits**:
- Instant local database access
- No configuration needed
- Windows Authentication

### Scenario 2: Database Administrator

**Use Case**: DBA managing multiple local SQL Server instances

**Setup**:
```bash
npm install
npm run build
pm2 start dist/index.js --name db-connector
pm2 startup windows
```

**Access**: `http://localhost:3000` or from network

**Benefits**:
- Runs as background service
- Always available
- Network accessible

### Scenario 3: Application Server

**Use Case**: Windows server hosting databases and applications

**Setup**: Install as Windows Service (see above)

**Access**: `http://server-name:3000`

**Benefits**:
- Automatic startup with Windows
- Robust service management
- Centralized database management

### Scenario 4: Hybrid Client-Cloud

**Use Case**: Local SQL Server + Remote Cloud Databases

**Configuration**:
```env
# Auto-discover local SQL Server
DEFAULT_MSSQL_SERVER=localhost

# Also configure remote connections via UI
# Save connection profiles for cloud databases
```

**Benefits**:
- Single tool for all databases
- Local + remote management
- Data synchronization capabilities

## Troubleshooting

### Cannot discover SQL Server instances

**Solutions**:
1. Check SQL Server service is running:
   ```powershell
   Get-Service | Where-Object {$_.Name -like "*SQL*"}
   ```

2. Verify SQL Server Browser is running:
   ```powershell
   Get-Service SQLBROWSER
   # If stopped:
   Start-Service SQLBROWSER
   Set-Service SQLBROWSER -StartupType Automatic
   ```

3. Check Windows Firewall for SQL Server

### Windows Authentication fails

**Solutions**:
1. Verify your Windows account has SQL Server permissions (see above)
2. Check SQL Server authentication mode (see above)
3. Try connecting with SSMS first to verify access
4. Check SQL Server error logs: `C:\Program Files\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQL\Log`

### UI not accessible

**Solutions**:
1. Verify server is running: `http://localhost:3000/health`
2. Check if port 3000 is in use: `netstat -ano | findstr :3000`
3. Check firewall settings
4. Try different port in `.env`: `API_PORT=3001`

### Connection test fails

**Solutions**:
1. Verify server name is correct
2. Check port is correct (1433 for MSSQL default)
3. Ensure SQL Server is accepting remote connections
4. Test with `sqlcmd` or SSMS first

## Security Considerations

### Local Client Use

- **Authentication disabled by default** for local use
- UI stores passwords in browser localStorage (local only)
- Windows Authentication preferred (no password storage)

### Network Use

If exposing on network:

1. **Enable Authentication**:
   ```env
   API_ENABLE_AUTH=true
   ```

2. **Configure HTTPS** (production):
   - Use reverse proxy (IIS, nginx)
   - SSL certificate required

3. **Network Security**:
   - Use firewall rules
   - VPN for remote access
   - Strong passwords for SQL Authentication

## Best Practices

1. **Use Windows Authentication** for local SQL Server
2. **Save connection profiles** for frequently used databases
3. **Test connections** before attempting data operations
4. **Run as service** for always-on availability
5. **Enable authentication** if exposing on network
6. **Regular backups** of databases before migrations
7. **Monitor logs** for connection issues

## Related Documentation

- [Auto-Discovery Guide](./AUTO_DISCOVERY.md) - Detailed auto-discovery documentation
- [API Documentation](./API.md) - REST API reference
- [Data Sync Guide](./DATA_SYNC.md) - Data synchronization features
- [Security Best Practices](./SECURITY.md) - Production security

## Getting Help

- Check logs: `logs/` directory
- Health check: `http://localhost:3000/health`
- API status: `http://localhost:3000/api`
- GitHub Issues: Report problems or ask questions
