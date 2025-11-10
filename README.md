# DB Schema Mapper Connector

A robust database connector service for mapping and synchronizing database schemas between local databases (MSSQL/MySQL) and remote applications. Designed for healthcare applications following HIPAA compliance requirements.

## Overview

This service provides:

- **Schema Reading**: Extract complete database schemas from MSSQL and MySQL databases
- **Schema Mapping**: Transform schemas between different database types with intelligent type conversion
- **Schema Validation**: Comprehensive validation and comparison tools
- **Remote Sync**: Push schemas to remote applications via REST API
- **Error Handling**: Robust error handling with retry logic and exponential backoff
- **Logging**: Structured logging with Winston for audit trails
- **Connection Pooling**: Efficient database connection management

## Architecture

```
┌─────────────────┐
│  Local MSSQL    │
│  or MySQL DB    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Connector     │─────▶│  Schema Mapper   │─────▶│  Remote Sync    │
│   (Read Schema) │      │  (Transform)     │      │  (Push to API)  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

## Features

### 1. Database Support

- **Microsoft SQL Server** (MSSQL 2019+)
  - Full schema extraction including tables, columns, constraints, indexes
  - Support for IDENTITY columns, foreign keys, and complex data types
  - Connection pooling with automatic retry

- **MySQL** (5.7+, 8.0+)
  - Complete schema reading with all metadata
  - Support for AUTO_INCREMENT, foreign keys, indexes
  - Native connection pooling

### 2. Schema Operations

- Extract table structures with all metadata
- Read column definitions (types, constraints, defaults)
- Capture primary and foreign key relationships
- Index information extraction
- Schema comparison and diff generation
- Generate DDL statements

### 3. Type Mapping

Intelligent data type conversion between database systems:

| MSSQL Type | MySQL Type | Standard Type |
|------------|------------|---------------|
| INT | INT | INT |
| NVARCHAR | VARCHAR | VARCHAR |
| DATETIME2 | DATETIME | DATETIME |
| BIT | BOOLEAN | BOOLEAN |
| UNIQUEIDENTIFIER | CHAR(36) | UUID |

### 4. Error Handling & Reliability

- Automatic retry with exponential backoff (2s, 4s, 8s, 16s)
- Comprehensive error types (Connection, Schema, Validation, Sync)
- Circuit breaker pattern for remote connections
- Transaction management with rollback support

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker & Docker Compose (for local testing)

### Setup

1. **Clone and install dependencies:**

```bash
git clone <repository-url>
cd db-connector
npm install
```

2. **Configure environment variables:**

```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Start test databases (optional):**

```bash
docker-compose up -d
```

4. **Build the project:**

```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# MSSQL Configuration
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_DATABASE=your_database
MSSQL_USER=your_username
MSSQL_PASSWORD=your_password
MSSQL_ENCRYPT=true
MSSQL_TRUST_SERVER_CERTIFICATE=true

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=your_database
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password

# Remote Application
REMOTE_API_ENDPOINT=https://api.caresa.com
REMOTE_API_KEY=your_api_key
REMOTE_RETRY_ATTEMPTS=3
REMOTE_RETRY_DELAY=5000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## Usage

### Basic Usage

```typescript
import { DBSchemaMapper, DatabaseType } from './src';

const mapper = new DBSchemaMapper();

// Read local MSSQL schema
const schema = await mapper.readLocalSchema(DatabaseType.MSSQL, {
  includeSystemTables: false,
  excludeTables: ['temp_*']
});

// Map to MySQL format
const mappedSchema = mapper.mapSchema(schema, DatabaseType.MySQL, {
  preserveCase: false,
  includeConstraints: true,
  includeIndexes: true
});

// Sync to remote application
await mapper.syncToRemote(mappedSchema);
```

### Complete Workflow

```typescript
// Read from MSSQL, map to MySQL, and sync in one operation
await mapper.syncLocalToRemote(
  DatabaseType.MSSQL,
  DatabaseType.MySQL,
  {
    includeSystemTables: false,
    excludeTables: ['audit_*', 'temp_*']
  },
  {
    targetDatabaseType: DatabaseType.MySQL,
    preserveCase: false,
    includeConstraints: true,
    includeIndexes: true
  }
);
```

### Schema Comparison

```typescript
const oldSchema = await mapper.readLocalSchema(DatabaseType.MSSQL);
const newSchema = await mapper.readLocalSchema(DatabaseType.MySQL);

const comparison = mapper.compareSchemas(oldSchema, newSchema);

console.log(comparison);
// {
//   tablesAdded: ['new_table'],
//   tablesRemoved: ['old_table'],
//   tablesModified: [{ tableName: 'users', columnsAdded: [...], ... }],
//   isIdentical: false
// }
```

### Generate DDL

```typescript
const schema = await mapper.readLocalSchema(DatabaseType.MSSQL);
const ddlStatements = mapper.generateDDL(schema);

ddlStatements.forEach(sql => {
  console.log(sql);
});
```

### Direct Connector Usage

```typescript
import { createAndConnectConnector } from './src/connectors/connector-factory';
import { DatabaseType } from './src/schema/types';

const connector = await createAndConnectConnector(
  DatabaseType.MSSQL,
  {
    host: 'localhost',
    port: 1433,
    database: 'testdb',
    user: 'sa',
    password: 'password'
  }
);

// List all tables
const tables = await connector.listTables();

// Read specific table schema
const tableSchema = await connector.readTableSchema('users');

// Execute custom query
const results = await connector.executeQuery('SELECT TOP 10 * FROM users');

await connector.disconnect();
```

## Development

### Project Structure

```
db-connector/
├── src/
│   ├── connectors/          # Database connectors
│   │   ├── base-connector.ts
│   │   ├── mssql-connector.ts
│   │   ├── mysql-connector.ts
│   │   └── connector-factory.ts
│   ├── schema/              # Schema operations
│   │   ├── types.ts
│   │   ├── schema-mapper.ts
│   │   └── schema-validator.ts
│   ├── remote/              # Remote sync
│   │   └── remote-sync-client.ts
│   ├── utils/               # Utilities
│   │   ├── logger.ts
│   │   ├── config-loader.ts
│   │   └── error-handler.ts
│   └── index.ts             # Main entry point
├── tests/                   # Test files
├── scripts/                 # Database initialization scripts
├── docker-compose.yml       # Local test databases
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts

```bash
# Development
npm run dev              # Run in development mode with ts-node
npm run build            # Compile TypeScript to JavaScript
npm start                # Run compiled JavaScript

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier

# Docker
docker-compose up -d     # Start test databases
docker-compose down      # Stop test databases
docker-compose logs -f   # View logs
```

### Running Tests

```bash
# Start test databases
docker-compose up -d

# Wait for databases to be ready (check with docker-compose ps)

# Run tests
npm test

# Or with coverage
npm run test:coverage
```

### Local Database Setup

The `docker-compose.yml` provides:

- **MSSQL Server** on port 1433
  - SA Password: `YourStrong!Passw0rd`
  - Test database: `testdb`

- **MySQL** on port 3306
  - Root Password: `rootpassword`
  - Database: `testdb`
  - User: `testuser`
  - Password: `testpassword`

- **phpMyAdmin** on port 8080 (for MySQL management)

To initialize MSSQL test schema:

```bash
docker exec -it db-connector-mssql /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P 'YourStrong!Passw0rd' \
  -i /scripts/mssql-init/01-create-test-schema.sql
```

## Security Considerations

### HIPAA Compliance

This connector is designed with healthcare security in mind:

1. **Credential Management**
   - Never commit credentials to version control
   - Use environment variables or secure vaults
   - Rotate credentials regularly

2. **Audit Logging**
   - All operations are logged with timestamps
   - Logs include user context and operation details
   - Store logs securely with restricted access

3. **Data Encryption**
   - Enable TLS/SSL for database connections
   - Encrypt data in transit to remote APIs
   - Use encrypted environment variables

4. **Access Control**
   - Use least-privilege database accounts
   - Implement role-based access control
   - Separate read-only vs. read-write operations

5. **Error Handling**
   - Never expose sensitive data in error messages
   - Sanitize logs to remove PHI
   - Implement secure error reporting

### Best Practices

- **Connection Pooling**: Use connection pools to prevent connection exhaustion
- **Rate Limiting**: Implement rate limits on remote API calls
- **Monitoring**: Set up alerts for failed connections and schema changes
- **Backup**: Always backup databases before schema migrations
- **Testing**: Test schema changes in non-production environments first

## Troubleshooting

### Common Issues

**Connection Timeout**
```
Error: Database connection timeout
```
Solution: Increase `CONNECTION_TIMEOUT` in `.env` or check firewall rules

**Schema Read Errors**
```
Error: Failed to read schema for table 'users'
```
Solution: Verify database user has SELECT permissions on INFORMATION_SCHEMA

**Remote Sync Failures**
```
Error: Remote API error (401): Unauthorized
```
Solution: Check `REMOTE_API_KEY` is valid and has proper permissions

**Type Mapping Issues**
```
Warning: Unknown data type encountered
```
Solution: Add custom type mapping in `SchemaMappingOptions`

### Debug Mode

Enable verbose logging:

```env
LOG_LEVEL=debug
LOG_FORMAT=console
```

### Network Issues

If experiencing network issues with Docker:

```bash
# Restart Docker network
docker-compose down
docker network prune
docker-compose up -d
```

## Roadmap

### Week 1-2: Foundation (COMPLETE)
- ✅ Project structure and configuration
- ✅ Base connector architecture
- ✅ MSSQL and MySQL connectors
- ✅ Schema type definitions
- ✅ Configuration management

### Week 3-4: Core Operations (IN PROGRESS)
- CRUD operations
- Transaction management
- Connection pooling optimization
- Advanced error recovery

### Week 5: Schema Management
- Schema versioning system
- Migration generation
- Drift detection and alerts
- Automated validation

### Week 6: Integration & Testing
- Caresa API integration
- End-to-end testing
- Load testing
- Failover testing

### Week 7: Production Readiness
- Monitoring and observability
- Performance tuning
- Documentation completion
- Production deployment

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier for formatting
- Write tests for new features
- Update documentation as needed

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or contributions:
- Create an issue in the repository
- Contact the development team
- Review the troubleshooting section

## Acknowledgments

- Built for healthcare integration following HIPAA compliance
- Designed for Caresa application connectivity
- Inspired by database migration tools like Flyway and Liquibase
