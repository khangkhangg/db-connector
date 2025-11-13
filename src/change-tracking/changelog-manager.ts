/**
 * Changelog Manager - Manages change tracking across databases
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { DatabaseType } from '../schema/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('ChangelogManager');

export interface ChangeRecord {
  id: string;
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  recordId: string;
  oldData?: any;
  newData?: any;
  timestamp: Date;
  synced: boolean;
  syncedAt?: Date;
}

export class ChangelogManager {
  private changelogTableName = '_db_connector_changelog';
  private webhookTableName = '_db_connector_webhooks';

  constructor(
    private connector: BaseDatabaseConnector,
    private dbType: DatabaseType
  ) {}

  /**
   * Initialize changelog table in the database
   */
  async initializeChangelogTable(): Promise<void> {
    logger.info('Initializing changelog table', { dbType: this.dbType });

    const createTableSQL = this.getCreateChangelogTableSQL();
    await this.connector.executeQuery(createTableSQL);

    logger.info('Changelog table initialized successfully');
  }

  /**
   * Initialize webhook configuration table
   */
  async initializeWebhookTable(): Promise<void> {
    logger.info('Initializing webhook table');

    const createTableSQL = this.getCreateWebhookTableSQL();
    await this.connector.executeQuery(createTableSQL);

    logger.info('Webhook table initialized successfully');
  }

  /**
   * Create triggers for a specific table
   */
  async createTriggersForTable(tableName: string, primaryKeyColumn: string = 'id'): Promise<void> {
    logger.info('Creating triggers for table', { tableName, dbType: this.dbType });

    const triggers = this.getCreateTriggerSQL(tableName, primaryKeyColumn);

    for (const triggerSQL of triggers) {
      try {
        await this.connector.executeQuery(triggerSQL);
      } catch (error: any) {
        logger.warn(`Failed to create trigger for ${tableName}`, { error: error.message });
      }
    }

    logger.info('Triggers created successfully', { tableName });
  }

  /**
   * Remove triggers for a specific table
   */
  async removeTriggersForTable(tableName: string): Promise<void> {
    logger.info('Removing triggers for table', { tableName });

    const dropTriggerSQL = this.getDropTriggerSQL(tableName);

    for (const sql of dropTriggerSQL) {
      try {
        await this.connector.executeQuery(sql);
      } catch (error: any) {
        logger.warn(`Failed to drop trigger for ${tableName}`, { error: error.message });
      }
    }

    logger.info('Triggers removed successfully', { tableName });
  }

  /**
   * Get unsynced changes
   */
  async getUnsyncedChanges(limit: number = 100): Promise<ChangeRecord[]> {
    const query = `
      SELECT * FROM ${this.changelogTableName}
      WHERE synced = ${this.dbType === DatabaseType.PostgreSQL ? 'FALSE' : '0'}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `;

    const rows = await this.connector.executeQuery(query);
    return rows.map(row => this.mapRowToChangeRecord(row));
  }

  /**
   * Get changes for specific table
   */
  async getChangesForTable(tableName: string, limit: number = 100): Promise<ChangeRecord[]> {
    const query = `
      SELECT * FROM ${this.changelogTableName}
      WHERE table_name = '${tableName}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    const rows = await this.connector.executeQuery(query);
    return rows.map(row => this.mapRowToChangeRecord(row));
  }

  /**
   * Get changes since a specific timestamp
   */
  async getChangesSince(since: Date, tableName?: string): Promise<ChangeRecord[]> {
    let query = `
      SELECT * FROM ${this.changelogTableName}
      WHERE timestamp > '${since.toISOString()}'
    `;

    if (tableName) {
      query += ` AND table_name = '${tableName}'`;
    }

    query += ' ORDER BY timestamp ASC';

    const rows = await this.connector.executeQuery(query);
    return rows.map(row => this.mapRowToChangeRecord(row));
  }

  /**
   * Mark changes as synced
   */
  async markAsSynced(changeIds: string[]): Promise<void> {
    if (changeIds.length === 0) return;

    const ids = changeIds.map(id => `'${id}'`).join(', ');
    const query = `
      UPDATE ${this.changelogTableName}
      SET synced = ${this.dbType === DatabaseType.PostgreSQL ? 'TRUE' : '1'},
          synced_at = ${this.getCurrentTimestampSQL()}
      WHERE id IN (${ids})
    `;

    await this.connector.executeQuery(query);
    logger.info('Changes marked as synced', { count: changeIds.length });
  }

  /**
   * Register a webhook
   */
  async registerWebhook(url: string, events: string[], tableName?: string): Promise<void> {
    const id = this.generateId();
    const query = `
      INSERT INTO ${this.webhookTableName} (id, url, events, table_name, active, created_at)
      VALUES ('${id}', '${url}', '${JSON.stringify(events).replace(/'/g, "''")}', ${tableName ? `'${tableName}'` : 'NULL'}, ${this.dbType === DatabaseType.PostgreSQL ? 'TRUE' : '1'}, ${this.getCurrentTimestampSQL()})
    `;

    await this.connector.executeQuery(query);
    logger.info('Webhook registered', { url, events, tableName });
  }

  /**
   * Get active webhooks
   */
  async getActiveWebhooks(tableName?: string): Promise<any[]> {
    let query = `
      SELECT * FROM ${this.webhookTableName}
      WHERE active = ${this.dbType === DatabaseType.PostgreSQL ? 'TRUE' : '1'}
    `;

    if (tableName) {
      query += ` AND (table_name = '${tableName}' OR table_name IS NULL)`;
    }

    return await this.connector.executeQuery(query);
  }

  /**
   * Get SQL for creating changelog table
   */
  private getCreateChangelogTableSQL(): string {
    if (this.dbType === DatabaseType.PostgreSQL) {
      return `
        CREATE TABLE IF NOT EXISTS ${this.changelogTableName} (
          id VARCHAR(255) PRIMARY KEY,
          table_name VARCHAR(255) NOT NULL,
          operation VARCHAR(10) NOT NULL,
          record_id VARCHAR(255) NOT NULL,
          old_data JSONB,
          new_data JSONB,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          synced BOOLEAN DEFAULT FALSE,
          synced_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_changelog_synced ON ${this.changelogTableName}(synced);
        CREATE INDEX IF NOT EXISTS idx_changelog_table ON ${this.changelogTableName}(table_name);
        CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON ${this.changelogTableName}(timestamp);
      `;
    } else if (this.dbType === DatabaseType.MySQL) {
      return `
        CREATE TABLE IF NOT EXISTS ${this.changelogTableName} (
          id VARCHAR(255) PRIMARY KEY,
          table_name VARCHAR(255) NOT NULL,
          operation VARCHAR(10) NOT NULL,
          record_id VARCHAR(255) NOT NULL,
          old_data JSON,
          new_data JSON,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          synced BOOLEAN DEFAULT FALSE,
          synced_at TIMESTAMP NULL,
          INDEX idx_changelog_synced (synced),
          INDEX idx_changelog_table (table_name),
          INDEX idx_changelog_timestamp (timestamp)
        );
      `;
    } else if (this.dbType === DatabaseType.MSSQL) {
      return `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.changelogTableName}')
        BEGIN
          CREATE TABLE ${this.changelogTableName} (
            id VARCHAR(255) PRIMARY KEY,
            table_name VARCHAR(255) NOT NULL,
            operation VARCHAR(10) NOT NULL,
            record_id VARCHAR(255) NOT NULL,
            old_data NVARCHAR(MAX),
            new_data NVARCHAR(MAX),
            timestamp DATETIME2 DEFAULT GETDATE(),
            synced BIT DEFAULT 0,
            synced_at DATETIME2
          );
          CREATE INDEX idx_changelog_synced ON ${this.changelogTableName}(synced);
          CREATE INDEX idx_changelog_table ON ${this.changelogTableName}(table_name);
          CREATE INDEX idx_changelog_timestamp ON ${this.changelogTableName}(timestamp);
        END
      `;
    }

    throw new Error(`Unsupported database type: ${this.dbType}`);
  }

  /**
   * Get SQL for creating webhook table
   */
  private getCreateWebhookTableSQL(): string {
    if (this.dbType === DatabaseType.PostgreSQL) {
      return `
        CREATE TABLE IF NOT EXISTS ${this.webhookTableName} (
          id VARCHAR(255) PRIMARY KEY,
          url VARCHAR(500) NOT NULL,
          events JSONB NOT NULL,
          table_name VARCHAR(255),
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_triggered_at TIMESTAMP
        );
      `;
    } else if (this.dbType === DatabaseType.MySQL) {
      return `
        CREATE TABLE IF NOT EXISTS ${this.webhookTableName} (
          id VARCHAR(255) PRIMARY KEY,
          url VARCHAR(500) NOT NULL,
          events JSON NOT NULL,
          table_name VARCHAR(255),
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_triggered_at TIMESTAMP NULL
        );
      `;
    } else if (this.dbType === DatabaseType.MSSQL) {
      return `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.webhookTableName}')
        BEGIN
          CREATE TABLE ${this.webhookTableName} (
            id VARCHAR(255) PRIMARY KEY,
            url VARCHAR(500) NOT NULL,
            events NVARCHAR(MAX) NOT NULL,
            table_name VARCHAR(255),
            active BIT DEFAULT 1,
            created_at DATETIME2 DEFAULT GETDATE(),
            last_triggered_at DATETIME2
          );
        END
      `;
    }

    throw new Error(`Unsupported database type: ${this.dbType}`);
  }

  /**
   * Get SQL for creating triggers
   */
  private getCreateTriggerSQL(tableName: string, primaryKeyColumn: string): string[] {
    if (this.dbType === DatabaseType.PostgreSQL) {
      return [
        `
        CREATE OR REPLACE FUNCTION ${tableName}_changelog_trigger()
        RETURNS TRIGGER AS $$
        BEGIN
          IF (TG_OP = 'INSERT') THEN
            INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, new_data, timestamp, synced)
            VALUES (gen_random_uuid()::text, '${tableName}', 'INSERT', NEW.${primaryKeyColumn}::text, row_to_json(NEW), CURRENT_TIMESTAMP, FALSE);
            RETURN NEW;
          ELSIF (TG_OP = 'UPDATE') THEN
            INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, old_data, new_data, timestamp, synced)
            VALUES (gen_random_uuid()::text, '${tableName}', 'UPDATE', NEW.${primaryKeyColumn}::text, row_to_json(OLD), row_to_json(NEW), CURRENT_TIMESTAMP, FALSE);
            RETURN NEW;
          ELSIF (TG_OP = 'DELETE') THEN
            INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, old_data, timestamp, synced)
            VALUES (gen_random_uuid()::text, '${tableName}', 'DELETE', OLD.${primaryKeyColumn}::text, row_to_json(OLD), CURRENT_TIMESTAMP, FALSE);
            RETURN OLD;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
        `,
        `
        DROP TRIGGER IF EXISTS ${tableName}_after_insert ON ${tableName};
        CREATE TRIGGER ${tableName}_after_insert AFTER INSERT ON ${tableName}
        FOR EACH ROW EXECUTE FUNCTION ${tableName}_changelog_trigger();
        `,
        `
        DROP TRIGGER IF EXISTS ${tableName}_after_update ON ${tableName};
        CREATE TRIGGER ${tableName}_after_update AFTER UPDATE ON ${tableName}
        FOR EACH ROW EXECUTE FUNCTION ${tableName}_changelog_trigger();
        `,
        `
        DROP TRIGGER IF EXISTS ${tableName}_after_delete ON ${tableName};
        CREATE TRIGGER ${tableName}_after_delete AFTER DELETE ON ${tableName}
        FOR EACH ROW EXECUTE FUNCTION ${tableName}_changelog_trigger();
        `
      ];
    } else if (this.dbType === DatabaseType.MySQL) {
      return [
        `
        DROP TRIGGER IF EXISTS ${tableName}_after_insert;
        CREATE TRIGGER ${tableName}_after_insert
        AFTER INSERT ON ${tableName}
        FOR EACH ROW
        BEGIN
          INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, new_data, timestamp, synced)
          VALUES (UUID(), '${tableName}', 'INSERT', NEW.${primaryKeyColumn}, JSON_OBJECT(), CURRENT_TIMESTAMP, FALSE);
        END;
        `,
        `
        DROP TRIGGER IF EXISTS ${tableName}_after_update;
        CREATE TRIGGER ${tableName}_after_update
        AFTER UPDATE ON ${tableName}
        FOR EACH ROW
        BEGIN
          INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, old_data, new_data, timestamp, synced)
          VALUES (UUID(), '${tableName}', 'UPDATE', NEW.${primaryKeyColumn}, JSON_OBJECT(), JSON_OBJECT(), CURRENT_TIMESTAMP, FALSE);
        END;
        `,
        `
        DROP TRIGGER IF EXISTS ${tableName}_after_delete;
        CREATE TRIGGER ${tableName}_after_delete
        AFTER DELETE ON ${tableName}
        FOR EACH ROW
        BEGIN
          INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, old_data, timestamp, synced)
          VALUES (UUID(), '${tableName}', 'DELETE', OLD.${primaryKeyColumn}, JSON_OBJECT(), CURRENT_TIMESTAMP, FALSE);
        END;
        `
      ];
    } else if (this.dbType === DatabaseType.MSSQL) {
      return [
        `
        IF EXISTS (SELECT * FROM sys.triggers WHERE name = '${tableName}_after_insert')
          DROP TRIGGER ${tableName}_after_insert;
        GO
        CREATE TRIGGER ${tableName}_after_insert
        ON ${tableName}
        AFTER INSERT
        AS
        BEGIN
          INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, new_data, timestamp, synced)
          SELECT NEWID(), '${tableName}', 'INSERT', CAST(${primaryKeyColumn} AS VARCHAR(255)), (SELECT * FROM INSERTED FOR JSON PATH), GETDATE(), 0
          FROM INSERTED;
        END;
        `,
        `
        IF EXISTS (SELECT * FROM sys.triggers WHERE name = '${tableName}_after_update')
          DROP TRIGGER ${tableName}_after_update;
        GO
        CREATE TRIGGER ${tableName}_after_update
        ON ${tableName}
        AFTER UPDATE
        AS
        BEGIN
          INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, old_data, new_data, timestamp, synced)
          SELECT NEWID(), '${tableName}', 'UPDATE', CAST(i.${primaryKeyColumn} AS VARCHAR(255)),
                 (SELECT * FROM DELETED d WHERE d.${primaryKeyColumn} = i.${primaryKeyColumn} FOR JSON PATH),
                 (SELECT * FROM INSERTED i2 WHERE i2.${primaryKeyColumn} = i.${primaryKeyColumn} FOR JSON PATH),
                 GETDATE(), 0
          FROM INSERTED i;
        END;
        `,
        `
        IF EXISTS (SELECT * FROM sys.triggers WHERE name = '${tableName}_after_delete')
          DROP TRIGGER ${tableName}_after_delete;
        GO
        CREATE TRIGGER ${tableName}_after_delete
        ON ${tableName}
        AFTER DELETE
        AS
        BEGIN
          INSERT INTO ${this.changelogTableName} (id, table_name, operation, record_id, old_data, timestamp, synced)
          SELECT NEWID(), '${tableName}', 'DELETE', CAST(${primaryKeyColumn} AS VARCHAR(255)), (SELECT * FROM DELETED FOR JSON PATH), GETDATE(), 0
          FROM DELETED;
        END;
        `
      ];
    }

    throw new Error(`Unsupported database type: ${this.dbType}`);
  }

  /**
   * Get SQL for dropping triggers
   */
  private getDropTriggerSQL(tableName: string): string[] {
    if (this.dbType === DatabaseType.PostgreSQL) {
      return [
        `DROP TRIGGER IF EXISTS ${tableName}_after_insert ON ${tableName};`,
        `DROP TRIGGER IF EXISTS ${tableName}_after_update ON ${tableName};`,
        `DROP TRIGGER IF EXISTS ${tableName}_after_delete ON ${tableName};`,
        `DROP FUNCTION IF EXISTS ${tableName}_changelog_trigger();`
      ];
    } else if (this.dbType === DatabaseType.MySQL) {
      return [
        `DROP TRIGGER IF EXISTS ${tableName}_after_insert;`,
        `DROP TRIGGER IF EXISTS ${tableName}_after_update;`,
        `DROP TRIGGER IF EXISTS ${tableName}_after_delete;`
      ];
    } else if (this.dbType === DatabaseType.MSSQL) {
      return [
        `IF EXISTS (SELECT * FROM sys.triggers WHERE name = '${tableName}_after_insert') DROP TRIGGER ${tableName}_after_insert;`,
        `IF EXISTS (SELECT * FROM sys.triggers WHERE name = '${tableName}_after_update') DROP TRIGGER ${tableName}_after_update;`,
        `IF EXISTS (SELECT * FROM sys.triggers WHERE name = '${tableName}_after_delete') DROP TRIGGER ${tableName}_after_delete;`
      ];
    }

    throw new Error(`Unsupported database type: ${this.dbType}`);
  }

  /**
   * Get current timestamp SQL
   */
  private getCurrentTimestampSQL(): string {
    if (this.dbType === DatabaseType.PostgreSQL) {
      return 'CURRENT_TIMESTAMP';
    } else if (this.dbType === DatabaseType.MySQL) {
      return 'CURRENT_TIMESTAMP';
    } else if (this.dbType === DatabaseType.MSSQL) {
      return 'GETDATE()';
    }
    return 'CURRENT_TIMESTAMP';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map database row to ChangeRecord
   */
  private mapRowToChangeRecord(row: any): ChangeRecord {
    return {
      id: row.id,
      tableName: row.table_name,
      operation: row.operation,
      recordId: row.record_id,
      oldData: this.parseJSON(row.old_data),
      newData: this.parseJSON(row.new_data),
      timestamp: new Date(row.timestamp),
      synced: row.synced === true || row.synced === 1,
      syncedAt: row.synced_at ? new Date(row.synced_at) : undefined
    };
  }

  /**
   * Parse JSON safely
   */
  private parseJSON(data: any): any {
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }
}
