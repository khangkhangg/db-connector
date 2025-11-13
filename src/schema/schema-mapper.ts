/**
 * Schema mapper for transforming database schemas between different types
 */

import {
  DatabaseSchema,
  TableSchema,
  ColumnMetadata,
  DatabaseType,
  StandardDataType,
  SchemaMappingOptions,
  SchemaComparison
} from './types';
import { createLogger } from '../utils/logger';
import { SchemaMappingError } from '../utils/error-handler';
import { SchemaValidator } from './schema-validator';

export class SchemaMapper {
  private logger = createLogger('SchemaMapper');

  /**
   * Map schema from one database type to another
   */
  mapSchema(
    sourceSchema: DatabaseSchema,
    targetType: DatabaseType,
    options?: SchemaMappingOptions
  ): DatabaseSchema {
    this.logger.info('Mapping schema', {
      from: sourceSchema.databaseType,
      to: targetType,
      tables: sourceSchema.tables.length
    });

    try {
      const mappedTables = sourceSchema.tables.map(table =>
        this.mapTable(table, sourceSchema.databaseType, targetType, options)
      );

      return {
        ...sourceSchema,
        databaseType: targetType,
        tables: mappedTables,
        metadata: {
          ...sourceSchema.metadata,
          mappedFrom: sourceSchema.databaseType,
          mappedAt: new Date()
        }
      };
    } catch (error) {
      throw new SchemaMappingError(
        `Failed to map schema: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Map a single table schema
   */
  private mapTable(
    table: TableSchema,
    sourceType: DatabaseType,
    targetType: DatabaseType,
    options?: SchemaMappingOptions
  ): TableSchema {
    const mappedColumns = table.columns.map(col =>
      this.mapColumn(col, sourceType, targetType, options)
    );

    return {
      ...table,
      columns: mappedColumns,
      // Preserve constraints and indexes based on options
      foreignKeys: options?.includeConstraints !== false ? table.foreignKeys : [],
      indexes: options?.includeIndexes !== false ? table.indexes : []
    };
  }

  /**
   * Map a single column
   */
  private mapColumn(
    column: ColumnMetadata,
    sourceType: DatabaseType,
    targetType: DatabaseType,
    options?: SchemaMappingOptions
  ): ColumnMetadata {
    // Apply custom type mapping if provided
    let mappedStandardType = column.standardType;
    if (options?.customTypeMapping && options.customTypeMapping[column.dataType]) {
      mappedStandardType = options.customTypeMapping[column.dataType];
    }

    // Map to target database type
    const targetDataType = this.mapStandardTypeToTarget(mappedStandardType, targetType);

    // Handle case sensitivity
    const columnName = options?.preserveCase
      ? column.name
      : this.normalizeName(column.name, targetType);

    return {
      ...column,
      name: columnName,
      dataType: targetDataType,
      standardType: mappedStandardType
    };
  }

  /**
   * Map standard type to target database-specific type
   */
  private mapStandardTypeToTarget(standardType: StandardDataType, targetType: DatabaseType): string {
    if (targetType === DatabaseType.MSSQL) {
      return this.mapToMSSQL(standardType);
    } else if (targetType === DatabaseType.MySQL) {
      return this.mapToMySQL(standardType);
    }
    return standardType.toString();
  }

  /**
   * Map to MSSQL-specific types
   */
  private mapToMSSQL(standardType: StandardDataType): string {
    const typeMap: Record<StandardDataType, string> = {
      [StandardDataType.TINYINT]: 'TINYINT',
      [StandardDataType.SMALLINT]: 'SMALLINT',
      [StandardDataType.INT]: 'INT',
      [StandardDataType.BIGINT]: 'BIGINT',
      [StandardDataType.DECIMAL]: 'DECIMAL',
      [StandardDataType.NUMERIC]: 'NUMERIC',
      [StandardDataType.FLOAT]: 'FLOAT',
      [StandardDataType.REAL]: 'REAL',
      [StandardDataType.DOUBLE]: 'FLOAT',
      [StandardDataType.CHAR]: 'CHAR',
      [StandardDataType.VARCHAR]: 'VARCHAR',
      [StandardDataType.TEXT]: 'TEXT',
      [StandardDataType.NCHAR]: 'NCHAR',
      [StandardDataType.NVARCHAR]: 'NVARCHAR',
      [StandardDataType.NTEXT]: 'NTEXT',
      [StandardDataType.BINARY]: 'BINARY',
      [StandardDataType.VARBINARY]: 'VARBINARY',
      [StandardDataType.BLOB]: 'VARBINARY(MAX)',
      [StandardDataType.DATE]: 'DATE',
      [StandardDataType.TIME]: 'TIME',
      [StandardDataType.DATETIME]: 'DATETIME',
      [StandardDataType.DATETIME2]: 'DATETIME2',
      [StandardDataType.TIMESTAMP]: 'DATETIME2',
      [StandardDataType.BOOLEAN]: 'BIT',
      [StandardDataType.BIT]: 'BIT',
      [StandardDataType.UUID]: 'UNIQUEIDENTIFIER',
      [StandardDataType.JSON]: 'NVARCHAR(MAX)',
      [StandardDataType.XML]: 'XML',
      [StandardDataType.UNKNOWN]: 'VARCHAR(MAX)'
    };

    return typeMap[standardType] || 'VARCHAR(MAX)';
  }

  /**
   * Map to MySQL-specific types
   */
  private mapToMySQL(standardType: StandardDataType): string {
    const typeMap: Record<StandardDataType, string> = {
      [StandardDataType.TINYINT]: 'TINYINT',
      [StandardDataType.SMALLINT]: 'SMALLINT',
      [StandardDataType.INT]: 'INT',
      [StandardDataType.BIGINT]: 'BIGINT',
      [StandardDataType.DECIMAL]: 'DECIMAL',
      [StandardDataType.NUMERIC]: 'DECIMAL',
      [StandardDataType.FLOAT]: 'FLOAT',
      [StandardDataType.REAL]: 'FLOAT',
      [StandardDataType.DOUBLE]: 'DOUBLE',
      [StandardDataType.CHAR]: 'CHAR',
      [StandardDataType.VARCHAR]: 'VARCHAR',
      [StandardDataType.TEXT]: 'TEXT',
      [StandardDataType.NCHAR]: 'CHAR',
      [StandardDataType.NVARCHAR]: 'VARCHAR',
      [StandardDataType.NTEXT]: 'TEXT',
      [StandardDataType.BINARY]: 'BINARY',
      [StandardDataType.VARBINARY]: 'VARBINARY',
      [StandardDataType.BLOB]: 'BLOB',
      [StandardDataType.DATE]: 'DATE',
      [StandardDataType.TIME]: 'TIME',
      [StandardDataType.DATETIME]: 'DATETIME',
      [StandardDataType.DATETIME2]: 'DATETIME',
      [StandardDataType.TIMESTAMP]: 'TIMESTAMP',
      [StandardDataType.BOOLEAN]: 'BOOLEAN',
      [StandardDataType.BIT]: 'BIT',
      [StandardDataType.UUID]: 'CHAR(36)',
      [StandardDataType.JSON]: 'JSON',
      [StandardDataType.XML]: 'TEXT',
      [StandardDataType.UNKNOWN]: 'TEXT'
    };

    return typeMap[standardType] || 'TEXT';
  }

  /**
   * Normalize column/table names based on target database conventions
   */
  private normalizeName(name: string, targetType: DatabaseType): string {
    if (targetType === DatabaseType.MySQL) {
      // MySQL is case-sensitive on some platforms, typically use lowercase
      return name.toLowerCase();
    } else if (targetType === DatabaseType.MSSQL) {
      // MSSQL is case-insensitive but typically uses PascalCase
      return name;
    }
    return name;
  }

  /**
   * Generate CREATE TABLE statements from schema
   */
  generateCreateTableSQL(table: TableSchema, targetType: DatabaseType): string {
    const columns = table.columns.map(col => this.generateColumnDefinition(col, targetType));
    const primaryKey = table.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${table.primaryKey.join(', ')})`
      : '';

    const foreignKeys = table.foreignKeys.map(fk =>
      `  FOREIGN KEY (${fk.columnName}) REFERENCES ${fk.referencedTable}(${fk.referencedColumn})` +
      (fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '') +
      (fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '')
    );

    const constraints = foreignKeys.length > 0
      ? `,\n` + foreignKeys.join(',\n')
      : '';

    return `CREATE TABLE ${table.name} (\n  ${columns.join(',\n  ')}${primaryKey}${constraints}\n);`;
  }

  /**
   * Generate column definition SQL
   */
  private generateColumnDefinition(column: ColumnMetadata, targetType: DatabaseType): string {
    let definition = `${column.name} ${column.dataType}`;

    // Add length/precision
    if (column.maxLength && this.requiresLength(column.dataType)) {
      definition += `(${column.maxLength})`;
    } else if (column.precision && column.scale !== undefined) {
      definition += `(${column.precision}, ${column.scale})`;
    } else if (column.precision) {
      definition += `(${column.precision})`;
    }

    // Add nullable constraint
    definition += column.nullable ? ' NULL' : ' NOT NULL';

    // Add auto increment
    if (column.isAutoIncrement) {
      definition += targetType === DatabaseType.MySQL ? ' AUTO_INCREMENT' : ' IDENTITY(1,1)';
    }

    // Add default value
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
      definition += ` DEFAULT ${column.defaultValue}`;
    }

    return definition;
  }

  /**
   * Check if data type requires length specification
   */
  private requiresLength(dataType: string): boolean {
    const typesRequiringLength = ['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'VARBINARY', 'BINARY'];
    return typesRequiringLength.some(type => dataType.toUpperCase().startsWith(type));
  }

  /**
   * Compare two schemas (delegates to SchemaValidator)
   */
  compareSchemas(oldSchema: DatabaseSchema, newSchema: DatabaseSchema): SchemaComparison {
    const validator = new SchemaValidator();
    return validator.compareSchemas(oldSchema, newSchema);
  }
}
