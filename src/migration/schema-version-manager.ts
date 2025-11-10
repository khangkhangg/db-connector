/**
 * Schema version manager for tracking and managing schema versions
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { SchemaVersion, SchemaSnapshot, Migration, MigrationRecord } from './migration-types';
import { DatabaseSchema, DatabaseType } from '../schema/types';
import { createLogger } from '../utils/logger';
import { createHash } from 'crypto';

/**
 * Schema version manager
 */
export class SchemaVersionManager {
  private logger = createLogger('SchemaVersionManager');
  private versionsTable = 'schema_versions';
  private snapshotsTable = 'schema_snapshots';

  constructor(private connector: BaseDatabaseConnector) {}

  /**
   * Initialize version tracking tables
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing schema version tracking');

    await this.createVersionsTable();
    await this.createSnapshotsTable();

    this.logger.info('Schema version tracking initialized');
  }

  /**
   * Create schema_versions table
   */
  private async createVersionsTable(): Promise<void> {
    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.versionsTable}')
        BEGIN
          CREATE TABLE ${this.versionsTable} (
            version NVARCHAR(50) PRIMARY KEY,
            description NVARCHAR(500),
            applied_at DATETIME2 DEFAULT GETDATE(),
            applied_by NVARCHAR(100),
            migrations NVARCHAR(MAX),
            checksum NVARCHAR(64)
          );
        END
      `;
    } else {
      sql = `
        CREATE TABLE IF NOT EXISTS ${this.versionsTable} (
          version VARCHAR(50) PRIMARY KEY,
          description VARCHAR(500),
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          applied_by VARCHAR(100),
          migrations TEXT,
          checksum VARCHAR(64)
        );
      `;
    }

    await this.connector.executeQuery(sql);
  }

  /**
   * Create schema_snapshots table
   */
  private async createSnapshotsTable(): Promise<void> {
    const dbType = this.connector.getDatabaseType();

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.snapshotsTable}')
        BEGIN
          CREATE TABLE ${this.snapshotsTable} (
            id NVARCHAR(50) PRIMARY KEY,
            version NVARCHAR(50),
            timestamp DATETIME2 DEFAULT GETDATE(),
            database_type NVARCHAR(20),
            database_name NVARCHAR(100),
            schema_data NVARCHAR(MAX),
            checksum NVARCHAR(64),
            metadata NVARCHAR(MAX)
          );
        END
      `;
    } else {
      sql = `
        CREATE TABLE IF NOT EXISTS ${this.snapshotsTable} (
          id VARCHAR(50) PRIMARY KEY,
          version VARCHAR(50),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          database_type VARCHAR(20),
          database_name VARCHAR(100),
          schema_data LONGTEXT,
          checksum VARCHAR(64),
          metadata TEXT
        );
      `;
    }

    await this.connector.executeQuery(sql);
  }

  /**
   * Get current schema version
   */
  async getCurrentVersion(): Promise<SchemaVersion | null> {
    const sql = `
      SELECT * FROM ${this.versionsTable}
      ORDER BY applied_at DESC
      LIMIT 1
    `;

    const results = await this.connector.executeQuery<any>(sql);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      version: row.version,
      description: row.description,
      applied_at: new Date(row.applied_at),
      applied_by: row.applied_by,
      migrations: JSON.parse(row.migrations || '[]'),
      checksum: row.checksum
    };
  }

  /**
   * Save new version
   */
  async saveVersion(version: SchemaVersion): Promise<void> {
    this.logger.info('Saving schema version', { version: version.version });

    const dbType = this.connector.getDatabaseType();

    let sql: string;
    const migrations = JSON.stringify(version.migrations);

    if (dbType === DatabaseType.MSSQL) {
      sql = `
        INSERT INTO ${this.versionsTable} (version, description, applied_at, applied_by, migrations, checksum)
        VALUES (@p0, @p1, @p2, @p3, @p4, @p5)
      `;
    } else {
      sql = `
        INSERT INTO ${this.versionsTable} (version, description, applied_at, applied_by, migrations, checksum)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
    }

    await this.connector.executeQuery(sql, [
      version.version,
      version.description,
      version.applied_at,
      version.applied_by,
      migrations,
      version.checksum
    ]);

    this.logger.info('Schema version saved', { version: version.version });
  }

  /**
   * Get all versions
   */
  async getAllVersions(): Promise<SchemaVersion[]> {
    const sql = `
      SELECT * FROM ${this.versionsTable}
      ORDER BY applied_at ASC
    `;

    const results = await this.connector.executeQuery<any>(sql);

    return results.map(row => ({
      version: row.version,
      description: row.description,
      applied_at: new Date(row.applied_at),
      applied_by: row.applied_by,
      migrations: JSON.parse(row.migrations || '[]'),
      checksum: row.checksum
    }));
  }

  /**
   * Create schema snapshot
   */
  async createSnapshot(schema: DatabaseSchema, version: string): Promise<SchemaSnapshot> {
    this.logger.info('Creating schema snapshot', { version });

    const snapshot: SchemaSnapshot = {
      id: `snapshot_${Date.now()}_${version}`,
      version,
      timestamp: new Date(),
      databaseType: schema.databaseType,
      databaseName: schema.databaseName,
      tables: schema.tables,
      checksum: this.calculateSchemaChecksum(schema)
    };

    await this.saveSnapshot(snapshot);

    this.logger.info('Schema snapshot created', { id: snapshot.id });

    return snapshot;
  }

  /**
   * Save snapshot to database
   */
  private async saveSnapshot(snapshot: SchemaSnapshot): Promise<void> {
    const dbType = this.connector.getDatabaseType();

    const schemaData = JSON.stringify({
      tables: snapshot.tables
    });

    const metadata = JSON.stringify(snapshot.metadata || {});

    let sql: string;
    if (dbType === DatabaseType.MSSQL) {
      sql = `
        INSERT INTO ${this.snapshotsTable} (id, version, timestamp, database_type, database_name, schema_data, checksum, metadata)
        VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)
      `;
    } else {
      sql = `
        INSERT INTO ${this.snapshotsTable} (id, version, timestamp, database_type, database_name, schema_data, checksum, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
    }

    await this.connector.executeQuery(sql, [
      snapshot.id,
      snapshot.version,
      snapshot.timestamp,
      snapshot.databaseType,
      snapshot.databaseName,
      schemaData,
      snapshot.checksum,
      metadata
    ]);
  }

  /**
   * Get snapshot by version
   */
  async getSnapshot(version: string): Promise<SchemaSnapshot | null> {
    const sql = `
      SELECT * FROM ${this.snapshotsTable}
      WHERE version = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const results = await this.connector.executeQuery<any>(sql, [version]);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    const schemaData = JSON.parse(row.schema_data);

    return {
      id: row.id,
      version: row.version,
      timestamp: new Date(row.timestamp),
      databaseType: row.database_type as DatabaseType,
      databaseName: row.database_name,
      tables: schemaData.tables,
      checksum: row.checksum,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(): Promise<SchemaSnapshot | null> {
    const sql = `
      SELECT * FROM ${this.snapshotsTable}
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const results = await this.connector.executeQuery<any>(sql);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    const schemaData = JSON.parse(row.schema_data);

    return {
      id: row.id,
      version: row.version,
      timestamp: new Date(row.timestamp),
      databaseType: row.database_type as DatabaseType,
      databaseName: row.database_name,
      tables: schemaData.tables,
      checksum: row.checksum,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  /**
   * Calculate schema checksum
   */
  calculateSchemaChecksum(schema: DatabaseSchema): string {
    // Create a normalized representation of the schema
    const normalized = {
      database: schema.databaseName,
      tables: schema.tables.map(table => ({
        name: table.name,
        columns: table.columns.map(col => ({
          name: col.name,
          type: col.dataType,
          nullable: col.nullable
        })).sort((a, b) => a.name.localeCompare(b.name))
      })).sort((a, b) => a.name.localeCompare(b.name))
    };

    const json = JSON.stringify(normalized);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Generate next version number
   */
  async generateNextVersion(): Promise<string> {
    const current = await this.getCurrentVersion();

    if (!current) {
      return '1.0.0';
    }

    const [major, minor, patch] = current.version.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  /**
   * Validate version format
   */
  validateVersionFormat(version: string): boolean {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    return versionRegex.test(version);
  }

  /**
   * Compare versions
   */
  compareVersions(v1: string, v2: string): number {
    const [major1, minor1, patch1] = v1.split('.').map(Number);
    const [major2, minor2, patch2] = v2.split('.').map(Number);

    if (major1 !== major2) return major1 - major2;
    if (minor1 !== minor2) return minor1 - minor2;
    return patch1 - patch2;
  }

  /**
   * Get version history
   */
  async getVersionHistory(limit?: number): Promise<SchemaVersion[]> {
    const sql = limit
      ? `SELECT * FROM ${this.versionsTable} ORDER BY applied_at DESC LIMIT ${limit}`
      : `SELECT * FROM ${this.versionsTable} ORDER BY applied_at DESC`;

    const results = await this.connector.executeQuery<any>(sql);

    return results.map(row => ({
      version: row.version,
      description: row.description,
      applied_at: new Date(row.applied_at),
      applied_by: row.applied_by,
      migrations: JSON.parse(row.migrations || '[]'),
      checksum: row.checksum
    }));
  }
}
