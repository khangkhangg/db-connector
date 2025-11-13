# DB Connector Web UI - User Guide

Modern web interface for managing **local and remote** database connections with real-time status monitoring.

## Overview

The DB Connector Web UI is a powerful, user-friendly interface that allows you to:

- 🔍 **Auto-discover local SQL Server** instances on your Windows machine
- 🌐 **Connect to remote databases** (MSSQL, MySQL, PostgreSQL) anywhere on your network or cloud
- 🔐 **Use Windows Authentication** for local SQL Server (no passwords needed)
- 💾 **Save connection profiles** for both local and remote databases
- 🧪 **Test connections** before establishing them
- ✅ **See connection status** in real-time (success/failure/details)
- 📊 **Browse databases** and view metadata

## Quick Start (4 Steps)

### Prerequisites

Make sure you have **Node.js 18+** installed:
```bash
node --version  # Should be v18.0.0 or higher
```

### 1. Install Dependencies

**First time only** - Install all required packages:

```bash
npm install
```

This installs `ts-node`, `typescript`, and all other dependencies (~1-2 minutes).

**Common Error Fix:**
If you see `sh: ts-node: command not found`, you skipped this step. Run `npm install` first!

### 2. Start the Client Application

```bash
npm run client
```

**Expected output:**
```
> db-schema-mapper-connector@0.1.0 client
> API_ENABLE_AUTH=false ts-node src/index.ts

[info] APIServer: Server started on http://0.0.0.0:3000
[info] APIServer: UI available at http://localhost:3000
```

**What this does:**
- Starts the web server on port 3000
- Disables authentication for local use
- Enables auto-discovery features
- Opens the connection manager UI

**Alternative (if ts-node issues):**
```bash
npm run build
npm run client:build
```

### 3. Open Your Browser

```
http://localhost:3000
```

You'll see the **Connection Manager** interface with three main panels:
- **Left**: Auto-Discovery (for local SQL Server)
- **Right**: Manual Connection (for local or remote databases)
- **Bottom**: Saved Connections (your connection profiles)

### 4. Connect to a Database

**Option A - Local SQL Server (easiest):**
1. Click "Discover Local SQL Server Instances"
2. Select an instance from the list
3. Click "Connect to Selected Instance"
4. ✅ Connected! (uses Windows Authentication)

**Option B - Remote Database (manual):**
1. Fill in the connection form (see below)
2. Click "Test Connection" to verify
3. Click "Save Connection" (optional)
4. Click "Connect"
5. ✅ Connected! See status below

---

## Using the UI Client - Complete Guide

### Panel 1: Auto-Discovery (Local SQL Server)

**Purpose**: Automatically find and connect to SQL Server instances running on your local Windows machine.

#### Step-by-Step:

**1. Click "Discover Local SQL Server Instances"**

The system scans your machine for:
- Default instances (`localhost`, `(local)`, `.`)
- Named instances (`SQLEXPRESS`, custom names)
- Registry-installed instances

**2. View Discovered Instances**

You'll see a list like:
```
┌─────────────────────────────────┐
│ ✓ localhost (Default)           │
│   Version: 15.00.4198           │
│   Click to view databases       │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│   localhost\SQLEXPRESS          │
│   Version: 15.00.2000           │
│   Click to view databases       │
└─────────────────────────────────┘
```

**3. Click on Any Instance**

This will:
- Highlight the selected instance
- Show instance details (version, clustering status)
- Display available databases with sizes
- Enable the "Connect" button

**4. View Database Information**

You'll see databases like:
```
Available Databases:
┌────────────────┐ ┌────────────────┐
│ AdventureWorks │ │ master         │
│ 245.50 MB      │ │ 5.25 MB        │
│ Owner: sa      │ │ Owner: sa      │
└────────────────┘ └────────────────┘
```

**5. Click "Connect to Selected Instance"**

A prompt will ask:
```
Enter database name (or press OK for master): [master]
```

**6. See Connection Status**

✅ **Success**:
```
┌──────────────────────────────────────────────┐
│ ✅ Connected successfully!                   │
│                                              │
│ Active Connection:                           │
│ Type: MSSQL                                  │
│ Server: localhost                            │
│ Database: master                             │
│ Status: ● Connected                          │
│ Auth: Windows Authentication                 │
│                                              │
│ [Disconnect]                                 │
└──────────────────────────────────────────────┘
```

❌ **Failure**:
```
┌──────────────────────────────────────────────┐
│ ❌ Connection failed: Login failed for user  │
│                                              │
│ Possible causes:                             │
│ - SQL Server service not running             │
│ - Windows account lacks permissions          │
│ - Database does not exist                    │
│                                              │
│ See troubleshooting guide below              │
└──────────────────────────────────────────────┘
```

---

### Panel 2: Manual Connection (Local or Remote)

**Purpose**: Connect to any database - local SQL Server with credentials, or remote MySQL/PostgreSQL databases.

#### Connection Form Fields:

**1. Database Type**
```
[MSSQL ▼]
```
Options:
- **Microsoft SQL Server** - Local or remote MSSQL
- **MySQL** - Remote MySQL databases
- **PostgreSQL** - Remote PostgreSQL databases

Automatically updates default port when changed.

**2. Server / Host**
```
[localhost\SQLEXPRESS]
```
Examples:
- Local SQL Server: `localhost`, `localhost\SQLEXPRESS`, `(local)`, `.`
- Remote SQL Server: `prod-server.company.com`, `10.0.0.5\SQLEXPRESS`
- Remote MySQL: `mysql.aws.example.com`, `192.168.1.100`
- Remote PostgreSQL: `postgres.cloud.com`, `10.0.0.10`

**3. Port**
```
[1433]
```
Default ports (auto-filled):
- MSSQL: `1433`
- MySQL: `3306`
- PostgreSQL: `5432`

**4. Database**
```
[master]
```
The specific database name to connect to.

Examples:
- SQL Server: `master`, `AdventureWorks`, `ProductionDB`
- MySQL: `wordpress`, `myapp`, `analytics`
- PostgreSQL: `postgres`, `myapp_db`, `production`

**5. Authentication (MSSQL only)**

```
☑ Use Windows Authentication (Local SQL Server only)
```

**When checked (Windows Authentication)**:
- No username/password needed
- Uses your current Windows user credentials
- Only works for local SQL Server on Windows
- Most secure option for local databases
- Username/Password fields hidden

**When unchecked (SQL Authentication)**:
- Username and password required
- Works for local and remote databases
- Required for MySQL and PostgreSQL
- Shows username/password fields:

**6. Username** (if not using Windows Auth)
```
[sa]
```
Examples:
- SQL Server: `sa`, `dbadmin`, `app_user`
- MySQL: `root`, `mysql_user`, `wordpress`
- PostgreSQL: `postgres`, `dbuser`, `app_admin`

**7. Password** (if not using Windows Auth)
```
[••••••••]
```
Enter the password for the username above.

**8. Connection Name** (for saving)
```
[My Production DB]
```
Give your connection a friendly name to save it for later use.

Examples:
- `Local SQL Express`
- `Production MySQL`
- `Dev PostgreSQL`
- `AWS RDS Database`

#### Action Buttons:

**Test Connection**
```
[Test Connection]
```
**What it does:**
- Attempts to connect with your settings
- Verifies server is reachable
- Validates credentials
- Checks if database exists
- **Does NOT** establish a persistent connection

**Success message:**
```
✅ Connection test successful!
```

**Failure messages:**
```
❌ Connection test failed: connect ECONNREFUSED 192.168.1.100:3306
→ Server not reachable, check IP/hostname and firewall

❌ Connection test failed: Login failed for user 'sa'
→ Invalid credentials, check username/password

❌ Connection test failed: Cannot open database "MyDB"
→ Database doesn't exist, check database name

❌ Connection test failed: Server is not accepting remote connections
→ SQL Server remote connections disabled
```

**Save Connection**
```
[Save Connection]
```
**What it does:**
- Saves all connection settings to browser localStorage
- Requires "Connection Name" to be filled
- Stored on your local machine only
- Can be loaded later for quick connections

**Success message:**
```
✅ Connection saved!
```

**Connect**
```
[Connect]
```
**What it does:**
- Establishes a persistent database connection
- Shows connection status in "Active Connection" panel
- Connection remains open until you disconnect
- Enables database operations via API

**Success:**
```
✅ Connected successfully!

Active Connection:
Type: MySQL
Server: mysql.aws.example.com:3306
Database: production
Status: ● Connected
Auth: SQL Authentication
```

**Failure:**
```
❌ Connection failed: Access denied for user 'user'@'host'

Connection Details:
Type: MySQL
Server: mysql.aws.example.com:3306
Database: production
Status: ○ Disconnected
Error: Authentication failed
```

---

### Panel 3: Saved Connections

**Purpose**: Quickly access your frequently used database connections.

#### Managing Saved Connections:

**View Saved Connections**

Example list:
```
┌────────────────────────────────────────────────────┐
│ 📋 Saved Connections                               │
├────────────────────────────────────────────────────┤
│ Local SQL Express                                  │
│ MSSQL - localhost\SQLEXPRESS:1433/master           │
│ Windows Auth                          [Load] [Del] │
├────────────────────────────────────────────────────┤
│ Production MySQL                                   │
│ MySQL - mysql.aws.com:3306/production              │
│ SQL Auth (saved)                      [Load] [Del] │
├────────────────────────────────────────────────────┤
│ Dev PostgreSQL                                     │
│ PostgreSQL - 192.168.1.100:5432/dev_db             │
│ SQL Auth (saved)                      [Load] [Del] │
└────────────────────────────────────────────────────┘
```

**Load a Connection**

1. Click **[Load]** button on any saved connection
2. Connection form automatically fills with saved settings
3. Click **[Connect]** to establish connection
4. Or modify settings before connecting

**Delete a Connection**

1. Click **[Delete]** button
2. Confirm deletion
3. Connection removed from saved list

**Note**: Deleting a saved connection does NOT disconnect an active connection.

---

## Connection Status Display

### Active Connection Panel

When connected, you'll see:

```
┌──────────────────────────────────────────────────────┐
│ ✅ Active Connection                                 │
├──────────────────────────────────────────────────────┤
│ Type: MSSQL                                          │
│ Server: prod-server.company.com                      │
│ Database: ProductionDB                               │
│ Status: ● Connected                                  │
│ Auth: SQL Authentication                             │
│ Connection ID: mssql-1678901234                      │
│                                                      │
│ [Disconnect]                                         │
└──────────────────────────────────────────────────────┘
```

### Status Indicators

**● Connected** (Green)
- Connection is active and healthy
- Database operations available
- API calls will succeed

**○ Disconnected** (Gray)
- No active connection
- Need to connect before operations
- Click "Connect" to establish

**⚠ Error** (Red)
- Connection failed or lost
- Error message displayed
- Review error and retry

### Alert Messages

**Success (Green)**
```
┌──────────────────────────────────────────┐
│ ✅ Connection test successful!           │
└──────────────────────────────────────────┘
```
Auto-dismisses after 5 seconds.

**Error (Red)**
```
┌──────────────────────────────────────────────────────┐
│ ❌ Connection failed: connect ETIMEDOUT              │
│                                                      │
│ The connection attempt timed out. Possible causes:  │
│ - Server is down or unreachable                     │
│ - Firewall blocking connection                      │
│ - Incorrect hostname/IP address                     │
└──────────────────────────────────────────────────────┘
```
Stays visible until dismissed or new action.

**Info (Blue)**
```
┌──────────────────────────────────────────┐
│ ℹ Testing connection...                  │
└──────────────────────────────────────────┘
```
Shows during operations, auto-dismisses.

---

## Complete Usage Examples

### Example 1: Connect to Local SQL Server Express

**Scenario**: You have SQL Server Express installed on your Windows PC.

**Steps**:
1. Open `http://localhost:3000`
2. Click **"Discover Local SQL Server Instances"**
3. Wait 2-3 seconds for scan to complete
4. Click on **"localhost\SQLEXPRESS"** in the instance list
5. View available databases (master, tempdb, etc.)
6. Click **"Connect to Selected Instance"**
7. Enter database name: `master` (or press OK)
8. ✅ **Success!** See active connection status

**Connection Details Shown**:
- Type: MSSQL
- Server: localhost\SQLEXPRESS
- Database: master
- Auth: Windows Authentication
- Status: ● Connected

### Example 2: Connect to Remote MySQL Database

**Scenario**: Connect to a MySQL database running on AWS RDS.

**Steps**:
1. In Manual Connection panel:
   - Database Type: **MySQL**
   - Server: `myapp.c9akciq32.us-east-1.rds.amazonaws.com`
   - Port: `3306` (auto-filled)
   - Database: `production`
   - Username: `admin`
   - Password: `your-password`
   - Connection Name: `AWS Production MySQL`

2. Click **"Test Connection"**
3. Wait for result:
   - ✅ **Success**: "Connection test successful!"
   - ❌ **Failure**: See error message and fix issues

4. If test succeeded, click **"Save Connection"**
5. Click **"Connect"**
6. ✅ **See active connection** in Active Connection panel

**Status Display**:
```
✅ Active Connection
Type: MySQL
Server: myapp.c9akciq32.us-east-1.rds.amazonaws.com:3306
Database: production
Status: ● Connected
Auth: SQL Authentication
```

### Example 3: Connect to Remote PostgreSQL

**Scenario**: Connect to PostgreSQL running on a VPS.

**Steps**:
1. In Manual Connection panel:
   - Database Type: **PostgreSQL**
   - Server: `192.168.1.50`
   - Port: `5432`
   - Database: `myapp_db`
   - Username: `postgres`
   - Password: `postgres-password`
   - Connection Name: `Dev PostgreSQL`

2. Click **"Test Connection"**
3. Result: ✅ **"Connection test successful!"**
4. Click **"Save Connection"**
5. Click **"Connect"**
6. ✅ **Connected successfully!**

### Example 4: Connect to Remote SQL Server with SQL Authentication

**Scenario**: Remote SQL Server that requires SQL Authentication (not Windows Auth).

**Steps**:
1. In Manual Connection panel:
   - Database Type: **MSSQL**
   - Server: `sql-prod-01.company.com`
   - Port: `1433`
   - Database: `SalesDB`
   - **UNCHECK** "Use Windows Authentication"
   - Username: `sa`
   - Password: `your-sa-password`
   - Connection Name: `Production SQL Server`

2. Click **"Test Connection"**
3. If successful: ✅ **"Connection test successful!"**
4. Click **"Save Connection"**
5. Click **"Connect"**
6. ✅ **See connection status**

**Important**: Uncheck Windows Authentication when connecting to remote SQL Server or when using SQL credentials.

### Example 5: Load and Use Saved Connection

**Scenario**: Quickly connect using a previously saved profile.

**Steps**:
1. Find your saved connection in **Saved Connections** panel
2. Click **[Load]** button
3. Form auto-fills with all saved settings
4. Review settings (modify if needed)
5. Click **"Connect"**
6. ✅ **Connected!**

**Time saved**: 2 seconds vs 30+ seconds manual entry!

### Example 6: Handle Connection Failure

**Scenario**: Connection test fails, troubleshoot and fix.

**Steps**:
1. Attempt connection to `mysql.example.com:3306`
2. ❌ **Error**: "Connection test failed: connect ECONNREFUSED"

**Troubleshooting**:
3. Check if server is running:
   ```bash
   ping mysql.example.com
   ```
4. Verify port is correct (MySQL = 3306)
5. Check firewall allows port 3306
6. Verify credentials are correct
7. Update settings in form
8. Click **"Test Connection"** again
9. ✅ **Success!**
10. Click **"Connect"**

---

## Connection Status Reference

### Common Success Messages

| Message | Meaning |
|---------|---------|
| ✅ Connection test successful! | Test connection verified, settings are correct |
| ✅ Connected successfully! | Persistent connection established |
| ✅ Connection saved! | Connection profile saved to localStorage |
| ✅ Discovered N instances | Auto-discovery found SQL Server instances |

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| ❌ connect ECONNREFUSED | Server not reachable | Check server running, verify hostname/IP, check firewall |
| ❌ Login failed for user | Wrong credentials | Verify username/password, check SQL Server authentication mode |
| ❌ Cannot open database | Database doesn't exist | Check database name spelling, verify database exists |
| ❌ Connection timeout | Server not responding | Check network connection, verify server is online |
| ❌ No SQL Server instances found | Auto-discovery failed | Ensure SQL Server is running, check SQL Browser service |
| ❌ Access denied | Permission issue | Grant user permissions in SQL Server/MySQL/PostgreSQL |
| ❌ Server is not accepting remote connections | Remote connections disabled | Enable remote connections in server configuration |

### Status Indicators Explained

| Indicator | Status | Description |
|-----------|--------|-------------|
| ● Connected | Active | Database connection is live and healthy |
| ○ Disconnected | Inactive | No active connection, need to connect |
| ⚠ Error | Failed | Connection failed or was lost |
| 🔄 Connecting... | In Progress | Establishing connection |
| 🔍 Testing... | In Progress | Testing connection settings |

---

## Features

### ✨ Local Database Support

- 🔍 **Auto-Discovery**: One-click scanning for local SQL Server instances
- 🔐 **Windows Authentication**: No passwords needed for local SQL Server
- 📊 **Database Browser**: View all databases with sizes and owners
- ⚡ **Quick Connect**: Connect in 3 clicks

### 🌐 Remote Database Support

- 🗄️ **Multi-Database**: MSSQL, MySQL, PostgreSQL support
- 🔑 **SQL Authentication**: Username/password for remote databases
- 🌍 **Any Location**: Cloud (AWS, Azure, GCP), VPS, on-premise, anywhere
- 🧪 **Connection Testing**: Verify before connecting

### 💾 Connection Management

- 💾 **Save Profiles**: Store unlimited connection profiles
- ⚡ **Quick Load**: One-click to load saved connections
- 🏷️ **Friendly Names**: Name your connections clearly
- 🗑️ **Easy Delete**: Remove unwanted profiles

### ✅ Status Monitoring

- 📊 **Real-time Status**: See connection state instantly
- ⚠️ **Error Display**: Clear error messages with causes
- ✅ **Success Indicators**: Visual confirmation of actions
- 📝 **Connection Details**: Full connection information displayed

### 🔒 Security

- 🔐 **Windows Auth**: Most secure for local SQL Server
- 🏠 **Local Storage**: Passwords stored in browser only (not transmitted)
- 🚫 **No Auth Required**: For local client use (can be enabled)
- 🔒 **HTTPS Ready**: Deploy with SSL/TLS for network use

---

## Browser Compatibility

✅ **Supported Browsers:**
- Chrome 90+
- Firefox 88+
- Edge 90+
- Safari 14+

💾 **Storage Requirements:**
- LocalStorage enabled (for saved connections)
- Cookies enabled (for session management)
- JavaScript enabled (required)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Enter** | Submit connection form |
| **Escape** | Close alert messages |
| **Ctrl + F5** | Hard refresh (clear cache) |

---

## API Endpoints Reference

The UI communicates with these REST API endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/connections/discover` | POST | Discover local SQL Server instances |
| `/api/connections/databases` | POST | Get databases for a specific server |
| `/api/connections/test` | POST | Test connection without establishing it |
| `/api/connections/connect` | POST | Establish persistent connection |
| `/api/connections/disconnect` | POST | Close active connection |
| `/api/connections/active` | GET | List all active connections |
| `/api/connections/current-user` | GET | Get Windows user info |

---

## Troubleshooting

### UI Not Loading

**Symptom**: Browser shows blank page or "Cannot connect"

**Solutions**:
1. Verify server is running:
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"healthy",...}`

2. Check correct port:
   - Default: `http://localhost:3000`
   - Custom: Check `.env` file for `API_PORT`

3. Clear browser cache:
   - Press **Ctrl + F5** for hard refresh
   - Or clear browser cache completely

4. Check browser console:
   - Press **F12** to open Developer Tools
   - Look for JavaScript errors in Console tab

### Auto-Discovery Not Working

**Symptom**: "No SQL Server instances found" message

**Solutions**:
1. Verify SQL Server is running:
   ```powershell
   Get-Service | Where-Object {$_.Name -like "*SQL*"}
   ```

2. Check SQL Server Browser service (for named instances):
   ```powershell
   Get-Service SQLBROWSER
   Start-Service SQLBROWSER  # If stopped
   ```

3. Verify Windows account has permissions:
   - Open SQL Server Management Studio
   - Connect using Windows Authentication
   - If SSMS works, auto-discovery should work

4. Try manual connection instead:
   - Type `localhost` or `localhost\SQLEXPRESS` in Server field
   - Check Windows Authentication checkbox
   - Click "Test Connection"

### Connection Test Fails

**Symptom**: ❌ "Connection test failed" with error message

**Solutions by Error Type**:

**"connect ECONNREFUSED"**:
- Server not running or not reachable
- Check hostname/IP is correct
- Verify port is correct
- Check firewall allows the port
- Ping the server to verify network connectivity

**"Login failed for user"**:
- Wrong username or password
- User account doesn't exist in database
- Check SQL Server authentication mode (Windows/Mixed)
- Grant permissions to user account

**"Cannot open database"**:
- Database name is misspelled
- Database doesn't exist
- User doesn't have access to that database
- Check database name and try again

**"Connection timeout"**:
- Server is slow or unresponsive
- Network latency is high
- Firewall is blocking connection (partially)
- Increase timeout in code or retry

**"Server is not accepting remote connections"**:
- SQL Server remote connections are disabled
- Enable in SQL Server Configuration Manager
- Restart SQL Server service after enabling

### Saved Connections Not Loading

**Symptom**: Saved connections list is empty after saving

**Solutions**:
1. Check browser localStorage is enabled:
   - Open Developer Tools (F12)
   - Go to Application → Local Storage
   - Look for `savedConnections` key

2. Clear and re-save:
   - Delete all saved connections
   - Save a new connection
   - Refresh page

3. Try different browser:
   - Some browsers block localStorage in private mode
   - Use normal (non-private) browsing mode

### Connection Succeeds but Operations Fail

**Symptom**: Connected successfully but API calls fail

**Solutions**:
1. Check user has database permissions:
   ```sql
   -- Grant read/write permissions
   USE YourDatabase;
   ALTER ROLE db_datareader ADD MEMBER YourUser;
   ALTER ROLE db_datawriter ADD MEMBER YourUser;
   ```

2. Verify database is online:
   ```sql
   SELECT name, state_desc FROM sys.databases
   WHERE name = 'YourDatabase';
   ```

3. Check API server logs:
   - Look in `logs/` directory
   - Check console output for errors

---

## Security Best Practices

### For Local Use

✅ **Recommended**:
- Use Windows Authentication for local SQL Server
- Run with `API_ENABLE_AUTH=false` (default)
- Access only from `localhost`
- Don't expose on network

⚠️ **Note**:
- Passwords stored in browser localStorage only
- Not encrypted (browser storage limitation)
- Only you can access (local machine only)

### For Network Use

If exposing UI on network, **ENABLE** these security measures:

1. **Enable Authentication**:
   ```env
   API_ENABLE_AUTH=true
   ```

2. **Use HTTPS**:
   - Configure reverse proxy (IIS, nginx, Apache)
   - Obtain SSL certificate
   - Force HTTPS redirect

3. **Configure CORS**:
   ```env
   CORS_ORIGINS=https://your-domain.com
   ```

4. **Strong Passwords**:
   - Enforce strong password policy
   - Rotate passwords regularly
   - Use different passwords for each connection

5. **Firewall Rules**:
   - Restrict access to specific IPs
   - Use VPN for remote access
   - Block unauthorized networks

6. **Monitor Access**:
   - Review connection logs
   - Track failed login attempts
   - Set up alerts for suspicious activity

---

## Development & Customization

### Modifying the UI

The UI is a single-file application (`index.html`) with embedded CSS and JavaScript.

**To customize**:

1. Open `public/index.html` in text editor
2. Find the section to modify:
   - **Colors**: Search for CSS `background` or `color` properties
   - **Layout**: Find `.main-content` CSS grid
   - **Text**: Update HTML text content
   - **Features**: Modify JavaScript functions

3. Save file

4. Restart server:
   ```bash
   npm run client
   ```

5. Hard refresh browser:
   - Press **Ctrl + F5**
   - Or clear cache and reload

**Example - Change Color Scheme**:

Find this in CSS:
```css
body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

Change to blue theme:
```css
body {
    background: linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%);
}
```

### Adding Custom Features

**Example - Add Connection Timeout Setting**:

1. Add form field in HTML:
```html
<div class="form-group">
    <label>Connection Timeout (seconds)</label>
    <input type="number" id="timeout" value="30">
</div>
```

2. Update JavaScript `getConnectionConfig()`:
```javascript
function getConnectionConfig() {
    return {
        // ... existing fields ...
        timeout: parseInt(document.getElementById('timeout').value) * 1000
    };
}
```

3. Backend will receive `timeout` in request

---

## Related Documentation

📚 **Complete Guides**:
- [Windows Client Guide](../docs/WINDOWS_CLIENT.md) - Deploy as Windows client application
- [Auto-Discovery Guide](../docs/AUTO_DISCOVERY.md) - Auto-discovery technical details
- [API Documentation](../docs/API.md) - REST API reference
- [Data Sync Guide](../docs/DATA_SYNC.md) - Database synchronization features

🚀 **Quick Starts**:
- [Quick Start: Auto-Discovery](../QUICK_START_AUTO_DISCOVERY.md) - 2-minute setup guide
- [UI & Client Summary](../UI_AND_CLIENT_SUMMARY.md) - Complete feature overview

---

## Getting Help

💬 **Support Resources**:

1. **Check Health Endpoint**:
   ```
   http://localhost:3000/health
   ```

2. **Review Logs**:
   - Console output (if running in terminal)
   - Browser console (F12 → Console tab)
   - Log files in `logs/` directory

3. **Test API Directly**:
   ```bash
   # Test discovery
   curl -X POST http://localhost:3000/api/connections/discover

   # Test connection
   curl -X POST http://localhost:3000/api/connections/test \
     -H "Content-Type: application/json" \
     -d '{"type":"MSSQL","server":"localhost","database":"master","useWindowsAuth":true}'
   ```

4. **GitHub Issues**:
   - Report bugs
   - Request features
   - Ask questions

---

## License

MIT License - Free to use, modify, and distribute.

---

## Summary

The DB Connector Web UI provides a **powerful, user-friendly interface** for managing both **local and remote** database connections:

✅ **Local SQL Server**: One-click auto-discovery with Windows Authentication
✅ **Remote Databases**: Full support for MSSQL, MySQL, PostgreSQL anywhere
✅ **Connection Testing**: Verify before connecting
✅ **Save Profiles**: Store unlimited connections
✅ **Real-time Status**: See success/failure immediately
✅ **Clear Errors**: Understand what went wrong and how to fix it

**Start now**:
```bash
npm run client
# Open http://localhost:3000
```

Happy connecting! 🚀
