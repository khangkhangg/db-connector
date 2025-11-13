/**
 * Generic CRUD service with transaction support
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { BaseRepository } from './base-repository';
import { TransactionManager } from '../transaction/transaction-manager';
import { WhereCondition, QueryOptions } from '../query/query-builder';
import { createLogger } from '../utils/logger';

export interface CrudOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Generic CRUD service with transaction support and auditing
 */
export class CrudService<T> {
  private logger = createLogger('CrudService');
  private transactionManager: TransactionManager;

  constructor(
    private repository: BaseRepository<T>,
    connector: BaseDatabaseConnector
  ) {
    this.transactionManager = new TransactionManager(connector);
  }

  /**
   * Create single record with transaction
   */
  async create(data: Partial<T>): Promise<CrudOperationResult<T>> {
    try {
      const result = await this.transactionManager.executeInTransaction(async (_ctx) => {
        // Validate data before insert
        await this.validateCreate(data);

        // Execute insert via repository (outside transaction for now)
        return await this.repository.create(data);
      });

      this.logger.info('Record created successfully', {
        table: this.repository.getTableName()
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to create record', {
        table: this.repository.getTableName(),
        error
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Update record with transaction
   */
  async update(id: number | string, data: Partial<T>): Promise<CrudOperationResult<boolean>> {
    try {
      const result = await this.transactionManager.executeInTransaction(async (_ctx) => {
        // Check if record exists
        const existing = await this.repository.findById(id);
        if (!existing) {
          throw new Error(`Record with ID ${id} not found`);
        }

        // Validate update data
        await this.validateUpdate(id, data);

        // Execute update
        return await this.repository.update(id, data);
      });

      this.logger.info('Record updated successfully', {
        table: this.repository.getTableName(),
        id
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to update record', {
        table: this.repository.getTableName(),
        id,
        error
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete record with transaction
   */
  async delete(id: number | string): Promise<CrudOperationResult<boolean>> {
    try {
      const result = await this.transactionManager.executeInTransaction(async (_ctx) => {
        // Check if record exists
        const existing = await this.repository.findById(id);
        if (!existing) {
          throw new Error(`Record with ID ${id} not found`);
        }

        // Validate deletion
        await this.validateDelete(id);

        // Execute delete
        return await this.repository.delete(id);
      });

      this.logger.info('Record deleted successfully', {
        table: this.repository.getTableName(),
        id
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to delete record', {
        table: this.repository.getTableName(),
        id,
        error
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Batch create with transaction
   */
  async batchCreate(data: Partial<T>[]): Promise<CrudOperationResult<void>> {
    try {
      await this.transactionManager.executeInTransaction(async (_ctx) => {
        // Validate all records
        for (const record of data) {
          await this.validateCreate(record);
        }

        // Batch insert
        await this.repository.batchCreate(data);
      });

      this.logger.info('Batch records created successfully', {
        table: this.repository.getTableName(),
        count: data.length
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to create batch records', {
        table: this.repository.getTableName(),
        count: data.length,
        error
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Update multiple records with transaction
   */
  async updateMany(
    where: WhereCondition[],
    data: Partial<T>
  ): Promise<CrudOperationResult<number>> {
    try {
      const result = await this.transactionManager.executeInTransaction(async (_ctx) => {
        return await this.repository.updateMany(where, data);
      });

      this.logger.info('Multiple records updated successfully', {
        table: this.repository.getTableName(),
        count: result
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to update multiple records', {
        table: this.repository.getTableName(),
        error
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Idempotent create operation
   */
  async createIdempotent(
    idempotencyKey: string,
    data: Partial<T>,
    uniqueField: string
  ): Promise<CrudOperationResult<T>> {
    try {
      const result = await this.transactionManager.executeIdempotent(
        idempotencyKey,
        async (_ctx) => {
          return await this.repository.create(data);
        },
        async (_key) => {
          // Check if record already exists based on unique field
          const where: WhereCondition[] = [
            { column: uniqueField, operator: '=', value: data[uniqueField as keyof T] }
          ];
          return await this.repository.findOne(where);
        }
      );

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to create idempotent record', {
        table: this.repository.getTableName(),
        idempotencyKey,
        error
      });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Read operations (no transaction needed)
   */
  async findById(id: number | string): Promise<T | null> {
    return this.repository.findById(id);
  }

  async findOne(where: WhereCondition[]): Promise<T | null> {
    return this.repository.findOne(where);
  }

  async findMany(where: WhereCondition[], options?: QueryOptions): Promise<T[]> {
    return this.repository.findMany(where, options);
  }

  async findAll(options?: QueryOptions): Promise<T[]> {
    return this.repository.findAll(options);
  }

  async count(where?: WhereCondition[]): Promise<number> {
    return this.repository.count(where);
  }

  async exists(where: WhereCondition[]): Promise<boolean> {
    return this.repository.exists(where);
  }

  /**
   * Validation hooks (override in subclasses)
   */
  protected async validateCreate(_data: Partial<T>): Promise<void> {
    // Override in subclass for custom validation
  }

  protected async validateUpdate(_id: number | string, _data: Partial<T>): Promise<void> {
    // Override in subclass for custom validation
  }

  protected async validateDelete(_id: number | string): Promise<void> {
    // Override in subclass for custom validation
  }

  /**
   * Get transaction manager for custom operations
   */
  getTransactionManager(): TransactionManager {
    return this.transactionManager;
  }

  /**
   * Get repository
   */
  getRepository(): BaseRepository<T> {
    return this.repository;
  }
}
