/**
 * Query builder for safe, parameterized SQL generation
 */

import { DatabaseType } from '../schema/types';
import { createLogger } from '../utils/logger';

export interface WhereCondition {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
}

export interface JoinCondition {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  on: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Safe query builder with parameterized queries
 */
export class QueryBuilder {
  private logger = createLogger('QueryBuilder');
  private paramIndex = 0;
  private params: any[] = [];

  constructor(private databaseType: DatabaseType) {}

  /**
   * Build SELECT query
   */
  buildSelect(
    table: string,
    columns: string[] = ['*'],
    where?: WhereCondition[],
    joins?: JoinCondition[],
    options?: QueryOptions
  ): { query: string; params: any[] } {
    this.reset();

    let query = `SELECT ${columns.join(', ')} FROM ${this.escapeIdentifier(table)}`;

    // Add JOINs
    if (joins && joins.length > 0) {
      joins.forEach(join => {
        query += ` ${join.type} JOIN ${this.escapeIdentifier(join.table)} ON ${join.on}`;
      });
    }

    // Add WHERE clause
    if (where && where.length > 0) {
      const whereClause = this.buildWhereClause(where);
      query += ` WHERE ${whereClause}`;
    }

    // Add ORDER BY
    if (options?.orderBy) {
      query += ` ORDER BY ${this.escapeIdentifier(options.orderBy)} ${options.orderDirection || 'ASC'}`;
    }

    // Add LIMIT/OFFSET
    if (options?.limit) {
      if (this.databaseType === DatabaseType.MSSQL) {
        // MSSQL uses TOP or OFFSET-FETCH
        if (options.offset) {
          query += ` OFFSET ${options.offset} ROWS FETCH NEXT ${options.limit} ROWS ONLY`;
        } else {
          query = query.replace('SELECT', `SELECT TOP ${options.limit}`);
        }
      } else {
        // MySQL uses LIMIT
        query += ` LIMIT ${options.limit}`;
        if (options.offset) {
          query += ` OFFSET ${options.offset}`;
        }
      }
    }

    this.logger.debug('Built SELECT query', { query, paramCount: this.params.length });

    return { query, params: this.params };
  }

  /**
   * Build INSERT query
   */
  buildInsert(
    table: string,
    data: Record<string, any>
  ): { query: string; params: any[] } {
    this.reset();

    const columns = Object.keys(data);
    const values = Object.values(data);

    const columnList = columns.map(col => this.escapeIdentifier(col)).join(', ');
    const placeholders = columns.map(() => this.getParamPlaceholder()).join(', ');

    this.params.push(...values);

    let query = `INSERT INTO ${this.escapeIdentifier(table)} (${columnList}) VALUES (${placeholders})`;

    // Add RETURNING/OUTPUT clause for getting inserted ID
    if (this.databaseType === DatabaseType.MSSQL) {
      query += '; SELECT SCOPE_IDENTITY() AS id';
    } else if (this.databaseType === DatabaseType.MySQL) {
      // MySQL returns insertId automatically
    }

    this.logger.debug('Built INSERT query', { query, paramCount: this.params.length });

    return { query, params: this.params };
  }

  /**
   * Build UPDATE query
   */
  buildUpdate(
    table: string,
    data: Record<string, any>,
    where: WhereCondition[]
  ): { query: string; params: any[] } {
    this.reset();

    if (!where || where.length === 0) {
      throw new Error('UPDATE requires WHERE clause for safety');
    }

    const columns = Object.keys(data);
    const values = Object.values(data);

    const setClause = columns
      .map(col => `${this.escapeIdentifier(col)} = ${this.getParamPlaceholder()}`)
      .join(', ');

    this.params.push(...values);

    const whereClause = this.buildWhereClause(where);

    const query = `UPDATE ${this.escapeIdentifier(table)} SET ${setClause} WHERE ${whereClause}`;

    this.logger.debug('Built UPDATE query', { query, paramCount: this.params.length });

    return { query, params: this.params };
  }

  /**
   * Build DELETE query
   */
  buildDelete(
    table: string,
    where: WhereCondition[]
  ): { query: string; params: any[] } {
    this.reset();

    if (!where || where.length === 0) {
      throw new Error('DELETE requires WHERE clause for safety');
    }

    const whereClause = this.buildWhereClause(where);

    const query = `DELETE FROM ${this.escapeIdentifier(table)} WHERE ${whereClause}`;

    this.logger.debug('Built DELETE query', { query, paramCount: this.params.length });

    return { query, params: this.params };
  }

  /**
   * Build WHERE clause from conditions
   */
  private buildWhereClause(conditions: WhereCondition[]): string {
    return conditions
      .map(condition => {
        const column = this.escapeIdentifier(condition.column);

        if (condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL') {
          return `${column} ${condition.operator}`;
        }

        if (condition.operator === 'IN') {
          const values = Array.isArray(condition.value) ? condition.value : [condition.value];
          const placeholders = values.map(() => this.getParamPlaceholder()).join(', ');
          this.params.push(...values);
          return `${column} IN (${placeholders})`;
        }

        const placeholder = this.getParamPlaceholder();
        this.params.push(condition.value);
        return `${column} ${condition.operator} ${placeholder}`;
      })
      .join(' AND ');
  }

  /**
   * Get parameter placeholder based on database type
   */
  private getParamPlaceholder(): string {
    if (this.databaseType === DatabaseType.MSSQL) {
      return `@param${this.paramIndex++}`;
    } else if (this.databaseType === DatabaseType.MySQL) {
      this.paramIndex++;
      return '?';
    }
    return '?';
  }

  /**
   * Escape identifier (table/column name)
   */
  private escapeIdentifier(identifier: string): string {
    if (this.databaseType === DatabaseType.MSSQL) {
      return `[${identifier}]`;
    } else if (this.databaseType === DatabaseType.MySQL) {
      return `\`${identifier}\``;
    }
    return identifier;
  }

  /**
   * Reset builder state
   */
  private reset(): void {
    this.paramIndex = 0;
    this.params = [];
  }

  /**
   * Build COUNT query
   */
  buildCount(
    table: string,
    where?: WhereCondition[]
  ): { query: string; params: any[] } {
    this.reset();

    let query = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(table)}`;

    if (where && where.length > 0) {
      const whereClause = this.buildWhereClause(where);
      query += ` WHERE ${whereClause}`;
    }

    return { query, params: this.params };
  }

  /**
   * Build EXISTS query
   */
  buildExists(
    table: string,
    where: WhereCondition[]
  ): { query: string; params: any[] } {
    this.reset();

    const whereClause = this.buildWhereClause(where);

    let query: string;
    if (this.databaseType === DatabaseType.MSSQL) {
      query = `SELECT CASE WHEN EXISTS (SELECT 1 FROM ${this.escapeIdentifier(table)} WHERE ${whereClause}) THEN 1 ELSE 0 END AS exists`;
    } else {
      query = `SELECT EXISTS (SELECT 1 FROM ${this.escapeIdentifier(table)} WHERE ${whereClause}) AS \`exists\``;
    }

    return { query, params: this.params };
  }

  /**
   * Build batch INSERT query
   */
  buildBatchInsert(
    table: string,
    data: Record<string, any>[]
  ): { query: string; params: any[] } {
    this.reset();

    if (data.length === 0) {
      throw new Error('Batch insert requires at least one row');
    }

    const columns = Object.keys(data[0]);
    const columnList = columns.map(col => this.escapeIdentifier(col)).join(', ');

    const valueSets = data.map(row => {
      const placeholders = columns.map(() => this.getParamPlaceholder()).join(', ');
      this.params.push(...Object.values(row));
      return `(${placeholders})`;
    });

    const query = `INSERT INTO ${this.escapeIdentifier(table)} (${columnList}) VALUES ${valueSets.join(', ')}`;

    this.logger.debug('Built batch INSERT query', { query, rowCount: data.length, paramCount: this.params.length });

    return { query, params: this.params };
  }

  /**
   * Build UPSERT query (INSERT ... ON DUPLICATE KEY UPDATE or MERGE)
   */
  buildUpsert(
    table: string,
    data: Record<string, any>,
    uniqueColumns: string[]
  ): { query: string; params: any[] } {
    this.reset();

    const columns = Object.keys(data);
    const values = Object.values(data);

    if (this.databaseType === DatabaseType.MySQL) {
      // MySQL: INSERT ... ON DUPLICATE KEY UPDATE
      const columnList = columns.map(col => this.escapeIdentifier(col)).join(', ');
      const placeholders = columns.map(() => this.getParamPlaceholder()).join(', ');

      this.params.push(...values);

      const updateClauses = columns
        .filter(col => !uniqueColumns.includes(col))
        .map(col => `${this.escapeIdentifier(col)} = VALUES(${this.escapeIdentifier(col)})`)
        .join(', ');

      const query = `INSERT INTO ${this.escapeIdentifier(table)} (${columnList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClauses}`;

      return { query, params: this.params };
    } else if (this.databaseType === DatabaseType.MSSQL) {
      // MSSQL: Use MERGE statement
      throw new Error('MSSQL MERGE not yet implemented. Use separate INSERT/UPDATE logic.');
    }

    throw new Error(`Upsert not supported for database type: ${this.databaseType}`);
  }
}
