# Running DB Connector on macOS - Testing Guide

Complete guide for installing, running, and testing the DB Connector on macOS.

## Prerequisites

### 1. Install Node.js 18+

```bash
# Check if Node.js is installed
node --version

# If not installed or version < 18, install using Homebrew
brew install node

# Or download from https://nodejs.org/
```

### 2. Install Git (if not already installed)

```bash
# Check if Git is installed
git --version

# If not installed
brew install git
```

## Quick Start (5 Minutes)

### 1. Clone or Navigate to Project

```bash
cd /path/to/db-connector
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required packages (~1-2 minutes).

### 3. Start the Client

```bash
npm run client
```

**Expected output:**
```
> db-schema-mapper-connector@0.1.0 client
> API_ENABLE_AUTH=false ts-node src/index.ts

[INFO] APIServer: Server started on http://0.0.0.0:3000
[INFO] APIServer: UI available at http://localhost:3000
```

### 4. Open the Web UI

Open your browser and navigate to:
```
http://localhost:3000
```

You should see the **DB Connector** web interface! 🎉

## What Works on Mac

### ✅ Fully Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Web UI** | ✅ Full | Complete UI works perfectly |
| **Manual Connections** | ✅ Full | Connect to any database |
| **MySQL Connections** | ✅ Full | Local or remote MySQL |
| **PostgreSQL Connections** | ✅ Full | Local or remote PostgreSQL |
| **Remote MSSQL** | ✅ Full | Connect to remote SQL Server |
| **Connection Testing** | ✅ Full | Test all connection types |
| **Save/Load Profiles** | ✅ Full | Browser localStorage works |
| **REST API** | ✅ Full | All endpoints available |

### ⚠️ Limited Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Auto-Discovery** | ⚠️ Limited | SQL Server auto-discovery is Windows-only |
| **Windows Authentication** | ⚠️ Limited | Not available on Mac (Windows-only) |
| **Local MSSQL** | ⚠️ Limited | SQL Server rarely runs on Mac natively |

### ❌ Not Supported on Mac

- SQL Server instance auto-discovery (Windows Registry scanning)
- Windows Authentication (integrated security)
- SQL Server Browser service detection

**However**, you can still:
- Connect to **remote** SQL Server using SQL Authentication
- Connect to **local** MySQL and PostgreSQL
- Use **Docker** to run SQL Server on Mac
- Test all **remote** database connections

## Testing Scenarios

### Scenario 1: Test with MySQL (Easiest on Mac)

#### Option A: Using Homebrew MySQL

**1. Install MySQL:**
```bash
brew install mysql
brew services start mysql
```

**2. Create test database:**
```bash
# Connect to MySQL
mysql -u root

# Create database and user
CREATE DATABASE testdb;
CREATE USER 'testuser'@'localhost' IDENTIFIED BY 'testpass';
GRANT ALL PRIVILEGES ON testdb.* TO 'testuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**3. Test in UI:**
1. Open `http://localhost:3000`
2. In Manual Connection panel:
   - Database Type: **MySQL**
   - Server: `localhost`
   - Port: `3306`
   - Database: `testdb`
   - Username: `testuser`
   - Password: `testpass`
   - Connection Name: `Local MySQL Test`

3. Click **"Test Connection"**
4. Should see: ✅ **"Connection test successful!"**
5. Click **"Connect"**
6. Should see: ✅ **"Connected successfully!"** with status panel

#### Option B: Using Docker MySQL

```bash
# Run MySQL in Docker
docker run -d \
  --name mysql-test \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=testdb \
  -e MYSQL_USER=testuser \
  -e MYSQL_PASSWORD=testpass \
  mysql:8.0

# Wait 10-15 seconds for MySQL to start
sleep 15

# Verify it's running
docker ps | grep mysql-test
```

Then test in UI with same settings as above.

**To stop:**
```bash
docker stop mysql-test
docker rm mysql-test
```

### Scenario 2: Test with PostgreSQL

#### Option A: Using Homebrew PostgreSQL

**1. Install PostgreSQL:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**2. Create test database:**
```bash
# Create database
createdb testdb

# Create user and grant permissions
psql testdb

# In psql:
CREATE USER testuser WITH PASSWORD 'testpass';
GRANT ALL PRIVILEGES ON DATABASE testdb TO testuser;
GRANT ALL ON SCHEMA public TO testuser;
\q
```

**3. Test in UI:**
1. Open `http://localhost:3000`
2. In Manual Connection panel:
   - Database Type: **PostgreSQL**
   - Server: `localhost`
   - Port: `5432`
   - Database: `testdb`
   - Username: `testuser`
   - Password: `testpass`
   - Connection Name: `Local PostgreSQL Test`

3. Click **"Test Connection"**
4. Click **"Connect"**
5. See connection status!

#### Option B: Using Docker PostgreSQL

```bash
# Run PostgreSQL in Docker
docker run -d \
  --name postgres-test \
  -p 5432:5432 \
  -e POSTGRES_USER=testuser \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=testdb \
  postgres:15

# Wait for startup
sleep 10

# Verify
docker ps | grep postgres-test
```

### Scenario 3: Test with SQL Server (Docker)

Since SQL Server doesn't run natively on Mac, use Docker:

**1. Run SQL Server in Docker:**
```bash
# Run SQL Server 2022 (Mac with Apple Silicon/M1/M2 - use azure-sql-edge)
docker run -d \
  --name sqlserver-test \
  -p 1433:1433 \
  -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=YourStrong!Pass123" \
  mcr.microsoft.com/azure-sql-edge

# For Intel Mac, you can use:
# mcr.microsoft.com/mssql/server:2022-latest

# Wait for SQL Server to start (20-30 seconds)
sleep 30

# Verify it's running
docker ps | grep sqlserver-test
```

**2. Test in UI:**
1. Open `http://localhost:3000`
2. In Manual Connection panel:
   - Database Type: **MSSQL**
   - Server: `localhost`
   - Port: `1433`
   - Database: `master`
   - **UNCHECK** "Use Windows Authentication"
   - Username: `sa`
   - Password: `YourStrong!Pass123`
   - Connection Name: `Docker SQL Server`

3. Click **"Test Connection"**
4. Click **"Connect"**
5. See connection status!

**Note**: Auto-discovery won't work, but manual connection works perfectly.

### Scenario 4: Test Remote Database Connections

You can test connecting to any remote database from your Mac:

**Example - Remote MySQL on AWS RDS:**
```
Database Type: MySQL
Server: myapp.c9akciq32.us-east-1.rds.amazonaws.com
Port: 3306
Database: production
Username: admin
Password: your-password
```

**Example - Remote PostgreSQL on Heroku:**
```
Database Type: PostgreSQL
Server: ec2-xxx.compute-1.amazonaws.com
Port: 5432
Database: d8f7s9df8s
Username: userxxx
Password: your-password
```

**Example - Remote SQL Server:**
```
Database Type: MSSQL
Server: sql-prod.yourcompany.com
Port: 1433
Database: ProductionDB
Username: sql_user
Password: your-password
```

## Complete Testing Checklist

### UI Functionality Tests

- [ ] **1. Open UI**
  ```bash
  npm run client
  # Open http://localhost:3000
  ```

- [ ] **2. Test Manual Connection Form**
  - [ ] Change database type (MSSQL → MySQL → PostgreSQL)
  - [ ] Verify port auto-updates
  - [ ] Fill in connection details
  - [ ] Click "Test Connection"
  - [ ] Verify success/error message displays

- [ ] **3. Test Save Connection**
  - [ ] Fill connection form
  - [ ] Enter connection name
  - [ ] Click "Save Connection"
  - [ ] Verify appears in Saved Connections panel
  - [ ] Refresh page - verify still saved

- [ ] **4. Test Load Connection**
  - [ ] Click "Load" on saved connection
  - [ ] Verify form fills automatically
  - [ ] Click "Connect"

- [ ] **5. Test Active Connection**
  - [ ] Establish connection
  - [ ] Verify "Active Connection" panel shows
  - [ ] Check connection details displayed
  - [ ] Click "Disconnect"
  - [ ] Verify panel updates

- [ ] **6. Test Error Handling**
  - [ ] Try invalid server: `invalid-server.com`
  - [ ] Verify error message displays
  - [ ] Try wrong credentials
  - [ ] Verify clear error message

- [ ] **7. Test Auto-Discovery Panel**
  - [ ] Click "Discover Local SQL Server Instances"
  - [ ] On Mac, should show: "No SQL Server instances found"
  - [ ] (Expected - SQL Server discovery is Windows-only)

### API Endpoint Tests

Test the REST API directly:

**1. Health Check:**
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"healthy",...}`

**2. Test Connection (MySQL):**
```bash
curl -X POST http://localhost:3000/api/connections/test \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MySQL",
    "server": "localhost",
    "port": 3306,
    "database": "testdb",
    "username": "testuser",
    "password": "testpass"
  }'
```
Expected: `{"success":true,...}`

**3. Establish Connection:**
```bash
curl -X POST http://localhost:3000/api/connections/connect \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MySQL",
    "server": "localhost",
    "port": 3306,
    "database": "testdb",
    "username": "testuser",
    "password": "testpass"
  }'
```
Expected: `{"success":true,"connectionId":"mysql-...",...}`

**4. List Active Connections:**
```bash
curl http://localhost:3000/api/connections/active
```
Expected: `{"success":true,"connections":[...],...}`

## Docker Compose Test Environment

For complete testing, use Docker Compose to run all databases:

**1. Create `docker-compose.test.yml`:**
```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: testdb
      MYSQL_USER: testuser
      MYSQL_PASSWORD: testpass
    ports:
      - "3306:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 10s
      timeout: 5s
      retries: 5

  sqlserver:
    image: mcr.microsoft.com/azure-sql-edge
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "YourStrong!Pass123"
    ports:
      - "1433:1433"
    healthcheck:
      test: ["CMD-SHELL", "/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'YourStrong!Pass123' -Q 'SELECT 1'"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
```

**2. Start all databases:**
```bash
docker-compose -f docker-compose.test.yml up -d
```

**3. Wait for databases to be ready:**
```bash
# Check status
docker-compose -f docker-compose.test.yml ps

# Wait for all healthy
sleep 30
```

**4. Test all connections in UI:**
- MySQL: localhost:3306/testdb (testuser/testpass)
- PostgreSQL: localhost:5432/testdb (testuser/testpass)
- SQL Server: localhost:1433/master (sa/YourStrong!Pass123)

**5. Stop all databases:**
```bash
docker-compose -f docker-compose.test.yml down
```

## Troubleshooting on Mac

### Port Already in Use

If you get "port already in use" errors:

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use different port
API_PORT=3001 npm run client
```

### Database Connection Fails

**MySQL:**
```bash
# Verify MySQL is running
brew services list | grep mysql

# Or with Docker
docker ps | grep mysql

# Test direct connection
mysql -h localhost -u testuser -p
```

**PostgreSQL:**
```bash
# Verify PostgreSQL is running
brew services list | grep postgres

# Or with Docker
docker ps | grep postgres

# Test direct connection
psql -h localhost -U testuser testdb
```

**SQL Server:**
```bash
# Verify Docker container is running
docker ps | grep sqlserver

# Check logs
docker logs sqlserver-test

# Test with sqlcmd (if installed)
# Install: brew install microsoft/mssql-release/mssql-tools
/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'YourStrong!Pass123'
```

### UI Not Loading

```bash
# Check server is running
curl http://localhost:3000/health

# Check for errors in console
# Look at terminal output where you ran npm run client

# Try hard refresh
# Chrome/Firefox: Cmd+Shift+R
# Safari: Cmd+Option+R

# Clear browser cache completely
```

### TypeScript Errors

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

## Development Tips

### Watch Mode for Development

```bash
# Terminal 1: Run in watch mode
npm run dev

# Terminal 2: Make changes to code
# Server auto-restarts on file changes
```

### View Logs

```bash
# Console output
npm run client

# Or redirect to file
npm run client > logs/app.log 2>&1
```

### Browser DevTools

Press **F12** (or **Cmd+Option+I**) to open:
- **Console**: JavaScript errors and logs
- **Network**: API requests and responses
- **Application**: LocalStorage (saved connections)

## Performance Considerations

On Mac with Apple Silicon (M1/M2):
- Use `mcr.microsoft.com/azure-sql-edge` for SQL Server (ARM-compatible)
- Native MySQL and PostgreSQL run very fast
- Docker performs well with native ARM images

On Intel Mac:
- All standard Docker images work
- SQL Server 2022 fully supported
- No special considerations needed

## Next Steps

After testing locally on Mac:

1. **Test Remote Connections**
   - Connect to cloud databases (AWS RDS, Azure, GCP)
   - Test with VPN connections
   - Verify firewall rules

2. **Test Data Operations**
   - Use API to query databases
   - Test data synchronization features
   - Verify CRUD operations

3. **Deploy to Server**
   - Deploy to Linux server
   - Deploy to Windows server with full auto-discovery
   - Set up production environment

## Quick Reference

### Start Application
```bash
npm run client
```

### Stop Application
```
Ctrl+C in terminal
```

### Test URLs
- UI: http://localhost:3000
- Health: http://localhost:3000/health
- API: http://localhost:3000/api

### Database Defaults
- MySQL: localhost:3306 (testuser/testpass)
- PostgreSQL: localhost:5432 (testuser/testpass)
- SQL Server: localhost:1433 (sa/YourStrong!Pass123)

### Clean Up Docker
```bash
# Stop all test databases
docker stop mysql-test postgres-test sqlserver-test

# Remove containers
docker rm mysql-test postgres-test sqlserver-test

# Or with docker-compose
docker-compose -f docker-compose.test.yml down
```

## Summary

✅ **What Works on Mac:**
- Complete Web UI
- Manual database connections (all types)
- Local MySQL and PostgreSQL
- Remote MSSQL with SQL Auth
- Docker-based SQL Server
- All REST API endpoints
- Connection testing and management

⚠️ **What Doesn't Work on Mac:**
- Auto-discovery for local SQL Server (Windows-only)
- Windows Authentication (Windows-only)
- Registry-based instance detection (Windows-only)

**Best Mac Testing Setup:**
1. Use Homebrew for MySQL/PostgreSQL (local)
2. Use Docker for SQL Server (containerized)
3. Test remote connections to cloud databases
4. Use Docker Compose for full test environment

**You can fully test and develop the application on Mac!** 🚀

For production deployment with auto-discovery, deploy to a Windows server.
