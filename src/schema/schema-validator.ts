/**
 * Schema validator for compatibility and validation checks
 */

import {
  DatabaseSchema,
  TableSchema,
  ColumnMetadata,
  SchemaComparison,
  TableComparison,
  ColumnComparison
} from './types';
import { createLogger } from '../utils/logger';
import { SchemaValidationError } from '../utils/error-handler';

export class SchemaValidator {
  private logger = createLogger('SchemaValidator');

  /**
   * Validate schema structure
   */
  validateSchema(schema: DatabaseSchema): boolean {
    try {
      // Check required fields
      if (!schema.databaseName || !schema.databaseType || !schema.tables) {
        throw new SchemaValidationError('Schema missing required fields');
      }

      // Validate each table
      schema.tables.forEach(table => this.validateTable(table));

      this.logger.info('Schema validation passed', {
        database: schema.databaseName,
        tables: schema.tables.length
      });

      return true;
    } catch (error) {
      throw new SchemaValidationError(
        `Schema validation failed: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Validate table structure
   */
  private validateTable(table: TableSchema): boolean {
    if (!table.name || !table.columns || table.columns.length === 0) {
      throw new SchemaValidationError(
        `Table ${table.name} is invalid`,
        { table: table.name }
      );
    }

    // Validate each column
    table.columns.forEach(col => this.validateColumn(col, table.name));

    // Validate primary key columns exist
    table.primaryKey.forEach(pkCol => {
      if (!table.columns.find(col => col.name === pkCol)) {
        throw new SchemaValidationError(
          `Primary key column ${pkCol} not found in table ${table.name}`,
          { table: table.name, column: pkCol }
        );
      }
    });

    // Validate foreign key references
    table.foreignKeys.forEach(fk => {
      if (!table.columns.find(col => col.name === fk.columnName)) {
        throw new SchemaValidationError(
          `Foreign key column ${fk.columnName} not found in table ${table.name}`,
          { table: table.name, column: fk.columnName }
        );
      }
    });

    return true;
  }

  /**
   * Validate column definition
   */
  private validateColumn(column: ColumnMetadata, tableName: string): boolean {
    if (!column.name || !column.dataType) {
      throw new SchemaValidationError(
        `Column in table ${tableName} has invalid definition`,
        { table: tableName, column: column.name }
      );
    }

    return true;
  }

  /**
   * Compare two schemas and return differences
   */
  compareSchemas(oldSchema: DatabaseSchema, newSchema: DatabaseSchema): SchemaComparison {
    const oldTables = new Map(oldSchema.tables.map(t => [t.name, t]));
    const newTables = new Map(newSchema.tables.map(t => [t.name, t]));

    // Find added tables
    const tablesAdded = Array.from(newTables.keys()).filter(name => !oldTables.has(name));

    // Find removed tables
    const tablesRemoved = Array.from(oldTables.keys()).filter(name => !newTables.has(name));

    // Find modified tables
    const tablesModified: TableComparison[] = [];
    for (const [tableName, oldTable] of oldTables) {
      const newTable = newTables.get(tableName);
      if (newTable) {
        const comparison = this.compareTables(oldTable, newTable);
        if (!this.isTableIdentical(comparison)) {
          tablesModified.push(comparison);
        }
      }
    }

    const isIdentical =
      tablesAdded.length === 0 &&
      tablesRemoved.length === 0 &&
      tablesModified.length === 0;

    this.logger.info('Schema comparison completed', {
      added: tablesAdded.length,
      removed: tablesRemoved.length,
      modified: tablesModified.length,
      identical: isIdentical
    });

    return {
      tablesAdded,
      tablesRemoved,
      tablesModified,
      isIdentical
    };
  }

  /**
   * Compare two table schemas
   */
  private compareTables(oldTable: TableSchema, newTable: TableSchema): TableComparison {
    const oldColumns = new Map(oldTable.columns.map(c => [c.name, c]));
    const newColumns = new Map(newTable.columns.map(c => [c.name, c]));

    // Find added columns
    const columnsAdded = Array.from(newColumns.values()).filter(
      col => !oldColumns.has(col.name)
    );

    // Find removed columns
    const columnsRemoved = Array.from(oldColumns.values()).filter(
      col => !newColumns.has(col.name)
    );

    // Find modified columns
    const columnsModified: ColumnComparison[] = [];
    for (const [colName, oldCol] of oldColumns) {
      const newCol = newColumns.get(colName);
      if (newCol) {
        const changes = this.compareColumns(oldCol, newCol);
        if (changes.length > 0) {
          columnsModified.push({
            columnName: colName,
            changes
          });
        }
      }
    }

    // Check foreign keys and indexes
    const foreignKeysChanged = JSON.stringify(oldTable.foreignKeys) !== JSON.stringify(newTable.foreignKeys);
    const indexesChanged = JSON.stringify(oldTable.indexes) !== JSON.stringify(newTable.indexes);

    return {
      tableName: newTable.name,
      columnsAdded,
      columnsRemoved,
      columnsModified,
      foreignKeysChanged,
      indexesChanged
    };
  }

  /**
   * Compare two columns and return list of changes
   */
  private compareColumns(
    oldCol: ColumnMetadata,
    newCol: ColumnMetadata
  ): Array<{ property: string; oldValue: any; newValue: any }> {
    const changes: Array<{ property: string; oldValue: any; newValue: any }> = [];

    // Compare relevant properties
    const propertiesToCompare: (keyof ColumnMetadata)[] = [
      'dataType',
      'nullable',
      'maxLength',
      'precision',
      'scale',
      'isPrimaryKey',
      'isForeignKey',
      'isAutoIncrement',
      'defaultValue'
    ];

    for (const prop of propertiesToCompare) {
      if (oldCol[prop] !== newCol[prop]) {
        changes.push({
          property: prop,
          oldValue: oldCol[prop],
          newValue: newCol[prop]
        });
      }
    }

    return changes;
  }

  /**
   * Check if table comparison shows no changes
   */
  private isTableIdentical(comparison: TableComparison): boolean {
    return (
      comparison.columnsAdded.length === 0 &&
      comparison.columnsRemoved.length === 0 &&
      comparison.columnsModified.length === 0 &&
      !comparison.foreignKeysChanged &&
      !comparison.indexesChanged
    );
  }

  /**
   * Generate a human-readable diff report
   */
  generateDiffReport(comparison: SchemaComparison): string {
    const lines: string[] = ['Schema Comparison Report', '='.repeat(50), ''];

    if (comparison.isIdentical) {
      lines.push('✓ Schemas are identical - no changes detected');
      return lines.join('\n');
    }

    if (comparison.tablesAdded.length > 0) {
      lines.push(`Added Tables (${comparison.tablesAdded.length}):`);
      comparison.tablesAdded.forEach(table => lines.push(`  + ${table}`));
      lines.push('');
    }

    if (comparison.tablesRemoved.length > 0) {
      lines.push(`Removed Tables (${comparison.tablesRemoved.length}):`);
      comparison.tablesRemoved.forEach(table => lines.push(`  - ${table}`));
      lines.push('');
    }

    if (comparison.tablesModified.length > 0) {
      lines.push(`Modified Tables (${comparison.tablesModified.length}):`);
      comparison.tablesModified.forEach(tableComp => {
        lines.push(`  ~ ${tableComp.tableName}`);

        if (tableComp.columnsAdded.length > 0) {
          tableComp.columnsAdded.forEach(col =>
            lines.push(`      + Column: ${col.name} (${col.dataType})`)
          );
        }

        if (tableComp.columnsRemoved.length > 0) {
          tableComp.columnsRemoved.forEach(col =>
            lines.push(`      - Column: ${col.name}`)
          );
        }

        if (tableComp.columnsModified.length > 0) {
          tableComp.columnsModified.forEach(colComp => {
            lines.push(`      ~ Column: ${colComp.columnName}`);
            colComp.changes.forEach(change =>
              lines.push(`          ${change.property}: ${change.oldValue} → ${change.newValue}`)
            );
          });
        }

        if (tableComp.foreignKeysChanged) {
          lines.push(`      ~ Foreign keys changed`);
        }

        if (tableComp.indexesChanged) {
          lines.push(`      ~ Indexes changed`);
        }

        lines.push('');
      });
    }

    return lines.join('\n');
  }
}
