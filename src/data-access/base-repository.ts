/**
 * Base repository pattern for data access
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { QueryBuilder, WhereCondition, QueryOptions } from '../query/query-builder';
import { DatabaseType } from '../schema/types';
import { createLogger } from '../utils/logger';

export interface IRepository<T> {
  findAll(options?: QueryOptions): Promise<T[]>;
  findById(id: number | string): Promise<T | null>;
  findOne(where: WhereCondition[]): Promise<T | null>;
  findMany(where: WhereCondition[], options?: QueryOptions): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: number | string, data: Partial<T>): Promise<boolean>;
  delete(id: number | string): Promise<boolean>;
  count(where?: WhereCondition[]): Promise<number>;
  exists(where: WhereCondition[]): Promise<boolean>;
}

/**
 * Base repository implementation
 */
export abstract class BaseRepository<T> implements IRepository<T> {
  protected logger = createLogger(this.constructor.name);
  protected queryBuilder: QueryBuilder;

  constructor(
    protected connector: BaseDatabaseConnector,
    protected tableName: string,
    protected primaryKey: string = 'id'
  ) {
    this.queryBuilder = new QueryBuilder(connector.getDatabaseType());
  }

  /**
   * Find all records
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    const { query, params } = this.queryBuilder.buildSelect(
      this.tableName,
      ['*'],
      undefined,
      undefined,
      options
    );

    const results = await this.connector.executeQuery<T>(query, params);

    this.logger.debug('findAll executed', { count: results.length });

    return results;
  }

  /**
   * Find record by ID
   */
  async findById(id: number | string): Promise<T | null> {
    const where: WhereCondition[] = [
      { column: this.primaryKey, operator: '=', value: id }
    ];

    return this.findOne(where);
  }

  /**
   * Find single record by conditions
   */
  async findOne(where: WhereCondition[]): Promise<T | null> {
    const { query, params } = this.queryBuilder.buildSelect(
      this.tableName,
      ['*'],
      where,
      undefined,
      { limit: 1 }
    );

    const results = await this.connector.executeQuery<T>(query, params);

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find multiple records by conditions
   */
  async findMany(where: WhereCondition[], options?: QueryOptions): Promise<T[]> {
    const { query, params } = this.queryBuilder.buildSelect(
      this.tableName,
      ['*'],
      where,
      undefined,
      options
    );

    const results = await this.connector.executeQuery<T>(query, params);

    this.logger.debug('findMany executed', { count: results.length });

    return results;
  }

  /**
   * Create new record
   */
  async create(data: Partial<T>): Promise<T> {
    const { query, params } = this.queryBuilder.buildInsert(
      this.tableName,
      data as Record<string, any>
    );

    const result = await this.connector.executeQuery(query, params);

    // Get the inserted ID
    let insertedId: number | string;

    if (this.connector.getDatabaseType() === DatabaseType.MSSQL) {
      // MSSQL returns ID in result
      insertedId = result[0]?.id;
    } else {
      // MySQL returns insertId in result metadata (handled by connector)
      insertedId = (result as any).insertId || data[this.primaryKey as keyof T];
    }

    this.logger.info('Record created', { table: this.tableName, id: insertedId });

    // Fetch and return the created record
    const created = await this.findById(insertedId);
    if (!created) {
      throw new Error(`Failed to retrieve created record with ID ${insertedId}`);
    }

    return created;
  }

  /**
   * Update record by ID
   */
  async update(id: number | string, data: Partial<T>): Promise<boolean> {
    const where: WhereCondition[] = [
      { column: this.primaryKey, operator: '=', value: id }
    ];

    const { query, params } = this.queryBuilder.buildUpdate(
      this.tableName,
      data as Record<string, any>,
      where
    );

    await this.connector.executeQuery(query, params);

    this.logger.info('Record updated', { table: this.tableName, id });

    return true;
  }

  /**
   * Delete record by ID
   */
  async delete(id: number | string): Promise<boolean> {
    const where: WhereCondition[] = [
      { column: this.primaryKey, operator: '=', value: id }
    ];

    const { query, params } = this.queryBuilder.buildDelete(this.tableName, where);

    await this.connector.executeQuery(query, params);

    this.logger.info('Record deleted', { table: this.tableName, id });

    return true;
  }

  /**
   * Count records
   */
  async count(where?: WhereCondition[]): Promise<number> {
    const { query, params } = this.queryBuilder.buildCount(this.tableName, where);

    const result = await this.connector.executeQuery<{ count: number }>(query, params);

    return result[0]?.count || 0;
  }

  /**
   * Check if record exists
   */
  async exists(where: WhereCondition[]): Promise<boolean> {
    const { query, params } = this.queryBuilder.buildExists(this.tableName, where);

    const result = await this.connector.executeQuery<{ exists: number | boolean }>(query, params);

    return Boolean(result[0]?.exists);
  }

  /**
   * Batch create records
   */
  async batchCreate(data: Partial<T>[]): Promise<void> {
    if (data.length === 0) return;

    const { query, params } = this.queryBuilder.buildBatchInsert(
      this.tableName,
      data as Record<string, any>[]
    );

    await this.connector.executeQuery(query, params);

    this.logger.info('Batch records created', { table: this.tableName, count: data.length });
  }

  /**
   * Update multiple records
   */
  async updateMany(where: WhereCondition[], data: Partial<T>): Promise<number> {
    const { query, params } = this.queryBuilder.buildUpdate(
      this.tableName,
      data as Record<string, any>,
      where
    );

    const result = await this.connector.executeQuery(query, params);

    const affectedRows = (result as any).affectedRows || 0;

    this.logger.info('Multiple records updated', { table: this.tableName, count: affectedRows });

    return affectedRows;
  }

  /**
   * Delete multiple records
   */
  async deleteMany(where: WhereCondition[]): Promise<number> {
    const { query, params } = this.queryBuilder.buildDelete(this.tableName, where);

    const result = await this.connector.executeQuery(query, params);

    const affectedRows = (result as any).affectedRows || 0;

    this.logger.info('Multiple records deleted', { table: this.tableName, count: affectedRows });

    return affectedRows;
  }

  /**
   * Get table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Execute raw query
   */
  protected async executeRaw<R = any>(query: string, params?: any[]): Promise<R[]> {
    return this.connector.executeQuery<R>(query, params);
  }
}
