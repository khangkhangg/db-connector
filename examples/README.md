# Data Synchronization Examples

This directory contains example configuration files for common data synchronization scenarios.

## Configuration Files

### 1. Client to Web Sync (`sync-config-client-to-web.json`)

**Use Case**: Sync data from on-premise MSSQL client database to cloud PostgreSQL web database.

**Features**:
- Unidirectional sync (client → web)
- Selective table and column sync
- Column name mapping (MSSQL PascalCase → PostgreSQL snake_case)
- Row filtering with WHERE clauses
- Continuous sync every 60 seconds

**Example Usage**:
```bash
# Copy and customize the config
cp examples/sync-config-client-to-web.json my-sync-config.json

# Edit credentials and settings
nano my-sync-config.json

# Validate configuration
db-connector sync validate --config my-sync-config.json

# Test with dry run
db-connector sync once --config my-sync-config.json --dry-run

# Run actual sync
db-connector sync once --config my-sync-config.json

# Start continuous sync
db-connector sync start --config my-sync-config.json
```

**Customization Points**:
- Update database credentials (`source` and `target` sections)
- Modify table list (`tables` array)
- Adjust column mappings for your schema
- Set appropriate WHERE clauses for filtering
- Configure batch sizes for performance
- Adjust sync interval (`syncIntervalMs`)

### 2. Bidirectional Sync (`sync-config-bidirectional.json`)

**Use Case**: Two-way synchronization between regional databases with automatic conflict resolution.

**Features**:
- Bidirectional sync (both directions)
- Latest-wins conflict resolution
- Multi-region support
- Fast sync interval (30 seconds)
- Composite primary keys

**Example Usage**:
```bash
# Copy and customize
cp examples/sync-config-bidirectional.json my-bidirectional-sync.json

# Edit configuration
nano my-bidirectional-sync.json

# Validate
db-connector sync validate --config my-bidirectional-sync.json

# Start continuous bidirectional sync
db-connector sync start --config my-bidirectional-sync.json
```

**Important Notes**:
- Requires `timestampColumn` for conflict resolution
- Use `latest_wins` strategy to automatically resolve conflicts
- Monitor for conflicts in audit logs
- Higher max concurrency for better performance

### 3. Initial Clone (`sync-config-initial-clone.json`)

**Use Case**: One-time full database clone from production to staging.

**Features**:
- Full database replication
- One-time sync (not continuous)
- Large batch sizes for performance
- Optional row filtering
- High concurrency for speed

**Example Usage**:
```bash
# Copy and customize
cp examples/sync-config-initial-clone.json my-clone-config.json

# Edit configuration
nano my-clone-config.json

# IMPORTANT: Always dry run first for large clones
db-connector sync once --config my-clone-config.json --dry-run

# Run actual clone
db-connector sync once --config my-clone-config.json
```

**Performance Tips**:
- Set high `defaultBatchSize` (5000-10000 for large tables)
- Increase `maxConcurrency` (10-20 for faster cloning)
- Use read-only user for source database
- Schedule during low-traffic periods
- Monitor progress in logs

## Common Configuration Options

### Database Connection

```json
{
  "type": "MSSQL" | "MySQL" | "PostgreSQL",
  "host": "database.host.com",
  "port": 1433 | 3306 | 5432,
  "database": "DatabaseName",
  "user": "username",
  "password": "password",
  "ssl": true | false
}
```

### Sync Directions

- `source_to_target`: One-way sync (client → web)
- `target_to_source`: Reverse one-way sync (web → client)
- `bidirectional`: Two-way sync with conflict resolution

### Sync Modes

- `once`: One-time synchronization
- `continuous`: Ongoing sync at intervals
- `initial_clone`: Full database replication (deletes non-matching rows)
- `incremental`: Sync only changes since last run

### Conflict Strategies (Bidirectional Only)

- `source_wins`: Source database always wins
- `target_wins`: Target database always wins
- `latest_wins`: Most recently modified row wins (requires timestampColumn)
- `skip`: Skip conflicting rows
- `manual`: Throw error, require manual resolution

### Table Configuration

```json
{
  "sourceTable": "SourceTableName",
  "targetTable": "target_table_name",
  "columns": ["column1", "column2"],
  "columnMappings": [
    { "source": "OldName", "target": "new_name" }
  ],
  "whereClause": "status = 'active' AND deleted_at IS NULL",
  "primaryKey": ["id"],
  "timestampColumn": "updated_at",
  "batchSize": 1000,
  "enabled": true
}
```

## Quick Start Workflow

### 1. Choose a Template

Pick the configuration that matches your use case:
- **Client to Web**: `sync-config-client-to-web.json`
- **Bidirectional**: `sync-config-bidirectional.json`
- **Initial Clone**: `sync-config-initial-clone.json`

### 2. Customize Configuration

```bash
# Copy template
cp examples/sync-config-client-to-web.json my-sync.json

# Edit with your settings
nano my-sync.json
```

**Required Changes**:
- Database credentials (host, port, user, password)
- Table names
- Primary key columns
- Timestamp columns (for continuous/bidirectional)

**Optional Changes**:
- Column mappings
- WHERE clauses
- Batch sizes
- Sync interval
- Conflict strategy

### 3. Validate Configuration

```bash
db-connector sync validate --config my-sync.json
```

### 4. Test with Dry Run

```bash
db-connector sync once --config my-sync.json --dry-run
```

This will:
- ✅ Connect to databases
- ✅ Calculate changes
- ✅ Show what would be synced
- ❌ NOT make any actual changes

### 5. Run Actual Sync

**One-time sync**:
```bash
db-connector sync once --config my-sync.json
```

**Continuous sync**:
```bash
db-connector sync start --config my-sync.json
```

### 6. Monitor Progress

**Check status**:
```bash
db-connector sync status --config my-sync.json
```

**View audit logs**:
```bash
db-connector audit logs --event-type sync_completed --limit 10
```

## Best Practices

### 1. Security

- ✅ Store passwords in environment variables or secrets manager
- ✅ Use read-only user for source database
- ✅ Enable SSL/TLS connections
- ✅ Restrict database access by IP
- ✅ Never commit credentials to git

### 2. Performance

- ✅ Set appropriate batch sizes (1000-5000)
- ✅ Use WHERE clauses to filter unnecessary data
- ✅ Sync only required columns
- ✅ Add indexes on timestamp columns
- ✅ Monitor sync duration and adjust

### 3. Reliability

- ✅ Always validate configuration first
- ✅ Test with dry run before actual sync
- ✅ Configure retry logic
- ✅ Monitor audit logs regularly
- ✅ Set up alerts for failures

### 4. Conflict Management (Bidirectional)

- ✅ Always configure `timestampColumn`
- ✅ Use `latest_wins` for automatic resolution
- ✅ Monitor conflicts in audit logs
- ✅ Have manual resolution process for critical conflicts
- ✅ Test conflict scenarios in staging

## Troubleshooting

### Connection Errors

```bash
# Test database connectivity
telnet database.host.com 1433

# Verify credentials
db-connector sync validate --config my-sync.json
```

### Slow Performance

1. Increase batch size
2. Reduce number of columns
3. Add WHERE clause to filter rows
4. Increase max concurrency
5. Add indexes on timestamp columns

### Primary Key Errors

Ensure all tables have `primaryKey` configured:

```json
{
  "sourceTable": "users",
  "primaryKey": ["id"]
}
```

For composite keys:

```json
{
  "sourceTable": "order_items",
  "primaryKey": ["order_id", "item_id"]
}
```

### Conflict Issues (Bidirectional)

1. Ensure `timestampColumn` is configured
2. Choose appropriate conflict strategy
3. Check conflict logs:

```bash
db-connector audit logs --event-type conflict_detected
```

## Additional Resources

- **[Full Documentation](../docs/DATA_SYNC.md)**: Complete data sync guide
- **[API Reference](../docs/API.md)**: REST API endpoints
- **[CLI Reference](../docs/API.md#cli-commands)**: All CLI commands
- **[Deployment Guide](../docs/DEPLOYMENT.md)**: Production deployment

## Getting Help

If you encounter issues:

1. Check the [troubleshooting section](../docs/DATA_SYNC.md#troubleshooting)
2. Review application logs
3. Check audit logs for detailed error messages
4. Report issues on GitHub

---

**Need More Examples?**

See the [full documentation](../docs/DATA_SYNC.md) for additional scenarios including:
- Selective column sync
- Complex WHERE clause filtering
- Multi-database migrations
- High-frequency sync scenarios
- Large database cloning strategies
