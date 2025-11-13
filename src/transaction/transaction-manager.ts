/**
 * Transaction manager for safe database operations with rollback support
 */

import { BaseDatabaseConnector } from '../connectors/base-connector';
import { MSSQLConnector } from '../connectors/mssql-connector';
import { MySQLConnector } from '../connectors/mysql-connector';
import { createLogger } from '../utils/logger';
import { DatabaseConnectionError } from '../utils/error-handler';
import * as mssql from 'mssql';

export enum IsolationLevel {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE'
}

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  timeout?: number;
}

export interface Transaction {
  id: string;
  startTime: Date;
  operations: number;
}

/**
 * Transaction context for executing operations within a transaction
 */
export class TransactionContext {
  private logger = createLogger('TransactionContext');
  private operationCount = 0;

  constructor(
    public readonly id: string,
    private transaction: any, // mssql.Transaction or mysql.Connection
    private connector: BaseDatabaseConnector
  ) {}

  /**
   * Execute query within transaction
   */
  async executeQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
    this.operationCount++;

    this.logger.debug('Executing query in transaction', {
      transactionId: this.id,
      operation: this.operationCount
    });

    if (this.connector instanceof MSSQLConnector) {
      const request = new mssql.Request(this.transaction);

      if (params) {
        params.forEach((param, index) => {
          request.input(`param${index}`, param);
        });
      }

      const result = await request.query(query);
      return result.recordset as T[];
    } else if (this.connector instanceof MySQLConnector) {
      const [rows] = await this.transaction.query(query, params);
      return rows as T[];
    }

    throw new Error('Unsupported connector type for transactions');
  }

  /**
   * Get operation count
   */
  getOperationCount(): number {
    return this.operationCount;
  }
}

/**
 * Transaction manager
 */
export class TransactionManager {
  private logger = createLogger('TransactionManager');
  private activeTransactions = new Map<string, Transaction>();
  private transactionCounter = 0;

  constructor(private connector: BaseDatabaseConnector) {}

  /**
   * Begin a new transaction
   */
  async beginTransaction(options?: TransactionOptions): Promise<TransactionContext> {
    const transactionId = `txn_${Date.now()}_${++this.transactionCounter}`;

    this.logger.info('Beginning transaction', {
      transactionId,
      isolationLevel: options?.isolationLevel
    });

    try {
      let transaction: any;

      if (this.connector instanceof MSSQLConnector) {
        // MSSQL transaction
        const pool = (this.connector as any).pool;
        if (!pool) {
          throw new DatabaseConnectionError('MSSQL connection pool not available');
        }

        transaction = new mssql.Transaction(pool);

        if (options?.isolationLevel) {
          await transaction.begin(this.mapIsolationLevel(options.isolationLevel));
        } else {
          await transaction.begin();
        }
      } else if (this.connector instanceof MySQLConnector) {
        // MySQL transaction
        const pool = (this.connector as any).pool;
        if (!pool) {
          throw new DatabaseConnectionError('MySQL connection pool not available');
        }

        transaction = await pool.getConnection();

        if (options?.isolationLevel) {
          await transaction.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
        }

        await transaction.beginTransaction();
      } else {
        throw new Error('Unsupported connector type for transactions');
      }

      // Track active transaction
      this.activeTransactions.set(transactionId, {
        id: transactionId,
        startTime: new Date(),
        operations: 0
      });

      return new TransactionContext(transactionId, transaction, this.connector);
    } catch (error) {
      this.logger.error('Failed to begin transaction', { transactionId, error });
      throw error;
    }
  }

  /**
   * Commit transaction
   */
  async commit(context: TransactionContext): Promise<void> {
    this.logger.info('Committing transaction', {
      transactionId: context.id,
      operations: context.getOperationCount()
    });

    try {
      const transaction = (context as any).transaction;

      if (this.connector instanceof MSSQLConnector) {
        await transaction.commit();
      } else if (this.connector instanceof MySQLConnector) {
        await transaction.commit();
        transaction.release(); // Release connection back to pool
      }

      this.activeTransactions.delete(context.id);

      this.logger.info('Transaction committed successfully', {
        transactionId: context.id
      });
    } catch (error) {
      this.logger.error('Failed to commit transaction', {
        transactionId: context.id,
        error
      });
      throw error;
    }
  }

  /**
   * Rollback transaction
   */
  async rollback(context: TransactionContext, reason?: string): Promise<void> {
    this.logger.warn('Rolling back transaction', {
      transactionId: context.id,
      reason,
      operations: context.getOperationCount()
    });

    try {
      const transaction = (context as any).transaction;

      if (this.connector instanceof MSSQLConnector) {
        await transaction.rollback();
      } else if (this.connector instanceof MySQLConnector) {
        await transaction.rollback();
        transaction.release(); // Release connection back to pool
      }

      this.activeTransactions.delete(context.id);

      this.logger.info('Transaction rolled back successfully', {
        transactionId: context.id
      });
    } catch (error) {
      this.logger.error('Failed to rollback transaction', {
        transactionId: context.id,
        error
      });
      throw error;
    }
  }

  /**
   * Execute operations within a transaction with automatic commit/rollback
   */
  async executeInTransaction<T>(
    operation: (context: TransactionContext) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const context = await this.beginTransaction(options);

    try {
      const result = await operation(context);
      await this.commit(context);
      return result;
    } catch (error) {
      await this.rollback(context, (error as Error).message);
      throw error;
    }
  }

  /**
   * Execute multiple operations with idempotency check
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operation: (context: TransactionContext) => Promise<T>,
    checkExisting: (key: string) => Promise<T | null>,
    options?: TransactionOptions
  ): Promise<T> {
    // Check if operation already executed
    const existing = await checkExisting(idempotencyKey);
    if (existing) {
      this.logger.info('Idempotent operation already executed', { idempotencyKey });
      return existing;
    }

    // Execute in transaction
    return this.executeInTransaction(operation, options);
  }

  /**
   * Get active transaction count
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Get active transactions
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Map isolation level to MSSQL constant
   */
  private mapIsolationLevel(level: IsolationLevel): any {
    if (this.connector instanceof MSSQLConnector) {
      const mssql = require('mssql');
      const isolationMap: Record<IsolationLevel, any> = {
        [IsolationLevel.READ_UNCOMMITTED]: mssql.ISOLATION_LEVEL.READ_UNCOMMITTED,
        [IsolationLevel.READ_COMMITTED]: mssql.ISOLATION_LEVEL.READ_COMMITTED,
        [IsolationLevel.REPEATABLE_READ]: mssql.ISOLATION_LEVEL.REPEATABLE_READ,
        [IsolationLevel.SERIALIZABLE]: mssql.ISOLATION_LEVEL.SERIALIZABLE
      };
      return isolationMap[level];
    }
    return level;
  }
}
