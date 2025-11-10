/**
 * Migration generator from schema changes
 */

import {
  Migration,
  MigrationOperation,
  MigrationType
} from './migration-types';
import {
  DatabaseSchema,
  TableSchema,
  ColumnMetadata,
  DatabaseType,
  SchemaComparison,
  TableComparison
} from '../schema/types';
import { SchemaValidator } from '../schema/schema-validator';
import { createLogger } from '../utils/logger';
import { createHash } from 'crypto';

/**
 * Migration generator
 */
export class MigrationGenerator {
  private logger = createLogger('MigrationGenerator');
  private validator = new SchemaValidator();

  /**
   * Generate migration from schema comparison
   */
  generateMigration(
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema,
    version: string,
    description?: string
  ): Migration {
    this.logger.info('Generating migration', { version });

    const comparison = this.validator.compareSchemas(oldSchema, newSchema);

    const operations: MigrationOperation[] = [];

    // Generate operations for table additions
    comparison.tablesAdded.forEach(tableName => {
      const table = newSchema.tables.find(t => t.name === tableName)!;
      operations.push(...this.generateCreateTableOperations(table, newSchema.databaseType));
    });

    // Generate operations for table removals
    comparison.tablesRemoved.forEach(tableName => {
      operations.push(...this.generateDropTableOperations(tableName, newSchema.databaseType));
    });

    // Generate operations for table modifications
    comparison.tablesModified.forEach(tableComp => {
      operations.push(...this.generateAlterTableOperations(tableComp, newSchema.databaseType));
    });

    const migration: Migration = {
      id: `migration_${Date.now()}_${version.replace(/\./g, '_')}`,
      name: `v${version}_${this.generateMigrationName(comparison)}`,
      version,
      description: description || this.generateDescription(comparison),
      databaseType: newSchema.databaseType,
      operations: {
        up: operations,
        down: this.generateRollbackOperations(operations, oldSchema, newSchema)
      },
      createdAt: new Date(),
      checksum: this.calculateMigrationChecksum(operations)
    };

    this.logger.info('Migration generated', {
      version,
      operationCount: operations.length
    });

    return migration;
  }

  /**
   * Generate CREATE TABLE operations
   */
  private generateCreateTableOperations(
    table: TableSchema,
    dbType: DatabaseType
  ): MigrationOperation[] {
    const operations: MigrationOperation[] = [];

    // Generate CREATE TABLE SQL
    const sql = this.generateCreateTableSQL(table, dbType);

    operations.push({
      type: MigrationType.CREATE_TABLE,
      table: table.name,
      sql,
      metadata: {
        columns: table.columns.length,
        hasPrimaryKey: table.primaryKey.length > 0,
        hasForeignKeys: table.foreignKeys.length > 0
      }
    });

    return operations;
  }

  /**
   * Generate DROP TABLE operations
   */
  private generateDropTableOperations(
    tableName: string,
    dbType: DatabaseType
  ): MigrationOperation[] {
    const sql = `DROP TABLE ${this.escapeIdentifier(tableName, dbType)}`;

    return [{
      type: MigrationType.DROP_TABLE,
      table: tableName,
      sql
    }];
  }

  /**
   * Generate ALTER TABLE operations
   */
  private generateAlterTableOperations(
    tableComp: TableComparison,
    dbType: DatabaseType
  ): MigrationOperation[] {
    const operations: MigrationOperation[] = [];

    // Add new columns
    tableComp.columnsAdded.forEach(column => {
      operations.push({
        type: MigrationType.ADD_COLUMN,
        table: tableComp.tableName,
        sql: this.generateAddColumnSQL(tableComp.tableName, column, dbType),
        metadata: { column: column.name, dataType: column.dataType }
      });
    });

    // Drop removed columns
    tableComp.columnsRemoved.forEach(column => {
      operations.push({
        type: MigrationType.DROP_COLUMN,
        table: tableComp.tableName,
        sql: this.generateDropColumnSQL(tableComp.tableName, column.name, dbType),
        metadata: { column: column.name }
      });
    });

    // Modify changed columns
    tableComp.columnsModified.forEach(columnComp => {
      operations.push({
        type: MigrationType.MODIFY_COLUMN,
        table: tableComp.tableName,
        sql: this.generateModifyColumnSQL(tableComp.tableName, columnComp, dbType),
        metadata: {
          column: columnComp.columnName,
          changes: columnComp.changes
        }
      });
    });

    return operations;
  }

  /**
   * Generate CREATE TABLE SQL
   */
  private generateCreateTableSQL(table: TableSchema, dbType: DatabaseType): string {
    const columns = table.columns.map(col => this.generateColumnDefinition(col, dbType));

    const primaryKey = table.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${table.primaryKey.map(pk => this.escapeIdentifier(pk, dbType)).join(', ')})`
      : '';

    const foreignKeys = table.foreignKeys.map(fk =>
      `  FOREIGN KEY (${this.escapeIdentifier(fk.columnName, dbType)}) REFERENCES ${this.escapeIdentifier(fk.referencedTable, dbType)}(${this.escapeIdentifier(fk.referencedColumn, dbType)})` +
      (fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '') +
      (fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '')
    );

    const constraints = foreignKeys.length > 0 ? `,\n` + foreignKeys.join(',\n') : '';

    return `CREATE TABLE ${this.escapeIdentifier(table.name, dbType)} (\n  ${columns.join(',\n  ')}${primaryKey}${constraints}\n)`;
  }

  /**
   * Generate column definition SQL
   */
  private generateColumnDefinition(column: ColumnMetadata, dbType: DatabaseType): string {
    let definition = `${this.escapeIdentifier(column.name, dbType)} ${column.dataType}`;

    if (column.maxLength && this.requiresLength(column.dataType)) {
      definition += `(${column.maxLength})`;
    } else if (column.precision && column.scale !== undefined) {
      definition += `(${column.precision}, ${column.scale})`;
    } else if (column.precision) {
      definition += `(${column.precision})`;
    }

    definition += column.nullable ? ' NULL' : ' NOT NULL';

    if (column.isAutoIncrement) {
      definition += dbType === DatabaseType.MySQL ? ' AUTO_INCREMENT' : ' IDENTITY(1,1)';
    }

    if (column.defaultValue !== undefined && column.defaultValue !== null) {
      definition += ` DEFAULT ${this.escapeValue(column.defaultValue)}`;
    }

    return definition;
  }

  /**
   * Generate ADD COLUMN SQL
   */
  private generateAddColumnSQL(
    tableName: string,
    column: ColumnMetadata,
    dbType: DatabaseType
  ): string {
    return `ALTER TABLE ${this.escapeIdentifier(tableName, dbType)} ADD ${this.generateColumnDefinition(column, dbType)}`;
  }

  /**
   * Generate DROP COLUMN SQL
   */
  private generateDropColumnSQL(
    tableName: string,
    columnName: string,
    dbType: DatabaseType
  ): string {
    const tableId = this.escapeIdentifier(tableName, dbType);
    const columnId = this.escapeIdentifier(columnName, dbType);

    if (dbType === DatabaseType.MSSQL) {
      return `ALTER TABLE ${tableId} DROP COLUMN ${columnId}`;
    } else {
      return `ALTER TABLE ${tableId} DROP COLUMN ${columnId}`;
    }
  }

  /**
   * Generate MODIFY COLUMN SQL
   */
  private generateModifyColumnSQL(
    tableName: string,
    columnComp: any,
    dbType: DatabaseType
  ): string {
    const tableId = this.escapeIdentifier(tableName, dbType);
    const columnId = this.escapeIdentifier(columnComp.columnName, dbType);

    // This is simplified - in practice, you'd need the full new column definition
    const newType = columnComp.changes.find((c: any) => c.property === 'dataType')?.newValue;

    if (dbType === DatabaseType.MSSQL) {
      return `ALTER TABLE ${tableId} ALTER COLUMN ${columnId} ${newType}`;
    } else {
      return `ALTER TABLE ${tableId} MODIFY COLUMN ${columnId} ${newType}`;
    }
  }

  /**
   * Generate rollback operations (DOWN migrations)
   */
  private generateRollbackOperations(
    upOperations: MigrationOperation[],
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema
  ): MigrationOperation[] {
    const downOperations: MigrationOperation[] = [];

    // Reverse the operations
    upOperations.reverse().forEach(op => {
      switch (op.type) {
        case MigrationType.CREATE_TABLE:
          downOperations.push({
            type: MigrationType.DROP_TABLE,
            table: op.table,
            sql: `DROP TABLE ${this.escapeIdentifier(op.table, newSchema.databaseType)}`
          });
          break;

        case MigrationType.DROP_TABLE:
          // Recreate the table from old schema
          const oldTable = oldSchema.tables.find(t => t.name === op.table);
          if (oldTable) {
            downOperations.push({
              type: MigrationType.CREATE_TABLE,
              table: op.table,
              sql: this.generateCreateTableSQL(oldTable, oldSchema.databaseType)
            });
          }
          break;

        case MigrationType.ADD_COLUMN:
          downOperations.push({
            type: MigrationType.DROP_COLUMN,
            table: op.table,
            sql: this.generateDropColumnSQL(
              op.table,
              op.metadata?.column,
              newSchema.databaseType
            )
          });
          break;

        case MigrationType.DROP_COLUMN:
          // Would need to recreate the column from old schema
          downOperations.push({
            type: MigrationType.ADD_COLUMN,
            table: op.table,
            sql: `-- Manual rollback required for dropped column ${op.metadata?.column}`,
            metadata: { requiresManualIntervention: true }
          });
          break;

        // Add other operation types as needed
      }
    });

    return downOperations;
  }

  /**
   * Generate migration name from comparison
   */
  private generateMigrationName(comparison: SchemaComparison): string {
    if (comparison.tablesAdded.length > 0) {
      return `add_tables_${comparison.tablesAdded.slice(0, 2).join('_')}`;
    }

    if (comparison.tablesRemoved.length > 0) {
      return `drop_tables_${comparison.tablesRemoved.slice(0, 2).join('_')}`;
    }

    if (comparison.tablesModified.length > 0) {
      return `modify_tables_${comparison.tablesModified.slice(0, 2).map(t => t.tableName).join('_')}`;
    }

    return 'schema_update';
  }

  /**
   * Generate migration description
   */
  private generateDescription(comparison: SchemaComparison): string {
    const parts: string[] = [];

    if (comparison.tablesAdded.length > 0) {
      parts.push(`Add ${comparison.tablesAdded.length} table(s)`);
    }

    if (comparison.tablesRemoved.length > 0) {
      parts.push(`Remove ${comparison.tablesRemoved.length} table(s)`);
    }

    if (comparison.tablesModified.length > 0) {
      parts.push(`Modify ${comparison.tablesModified.length} table(s)`);
    }

    return parts.join(', ') || 'Schema update';
  }

  /**
   * Calculate migration checksum
   */
  private calculateMigrationChecksum(operations: MigrationOperation[]): string {
    const normalized = operations.map(op => ({
      type: op.type,
      table: op.table,
      sql: op.sql
    }));

    const json = JSON.stringify(normalized);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Escape identifier
   */
  private escapeIdentifier(identifier: string, dbType: DatabaseType): string {
    if (dbType === DatabaseType.MSSQL) {
      return `[${identifier}]`;
    } else {
      return `\`${identifier}\``;
    }
  }

  /**
   * Escape value
   */
  private escapeValue(value: any): string {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return String(value);
  }

  /**
   * Check if data type requires length
   */
  private requiresLength(dataType: string): boolean {
    const typesRequiringLength = ['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'VARBINARY', 'BINARY'];
    return typesRequiringLength.some(type => dataType.toUpperCase().startsWith(type));
  }
}
