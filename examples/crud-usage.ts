/**
 * CRUD operations usage examples
 */

import { createAndConnectConnector } from '../src/connectors/connector-factory';
import { DatabaseType } from '../src/schema/types';
import { BaseRepository } from '../src/data-access/base-repository';
import { CrudService } from '../src/data-access/crud-service';
import { DataValidator } from '../src/validation/data-validator';
import { ConnectionPoolMonitor } from '../src/monitoring/connection-pool-monitor';
import logger from '../src/utils/logger';

// Define your data model
interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  created_at?: Date;
  is_active?: boolean;
}

// Create a repository for your model
class UserRepository extends BaseRepository<User> {
  constructor(connector: any) {
    super(connector, 'users', 'id');
  }

  // Add custom methods
  async findByUsername(username: string): Promise<User | null> {
    return this.findOne([{ column: 'username', operator: '=', value: username }]);
  }

  async findActiveUsers(): Promise<User[]> {
    return this.findMany([{ column: 'is_active', operator: '=', value: true }]);
  }
}

// Create a service with validation
class UserService extends CrudService<User> {
  private validator = new DataValidator();

  protected async validateCreate(data: Partial<User>): Promise<void> {
    const result = await this.validator.validate(data as Record<string, any>, [
      { field: 'username', required: true, minLength: 3, maxLength: 50 },
      { field: 'email', required: true, type: 'email' },
      { field: 'full_name', maxLength: 100 }
    ]);

    if (!result.valid) {
      throw new Error(`Validation failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
  }

  protected async validateUpdate(id: number | string, data: Partial<User>): Promise<void> {
    const result = await this.validator.validate(data as Record<string, any>, [
      { field: 'username', minLength: 3, maxLength: 50 },
      { field: 'email', type: 'email' },
      { field: 'full_name', maxLength: 100 }
    ]);

    if (!result.valid) {
      throw new Error(`Validation failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
  }
}

async function main() {
  logger.info('Starting CRUD operations example');

  // Connect to database
  const connector = await createAndConnectConnector(DatabaseType.MySQL, {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    database: process.env.MYSQL_DATABASE || 'testdb',
    user: process.env.MYSQL_USER || 'testuser',
    password: process.env.MYSQL_PASSWORD || 'testpassword'
  });

  // Create repository and service
  const repository = new UserRepository(connector);
  const userService = new UserService(repository, connector);

  // Setup connection pool monitoring
  const monitor = new ConnectionPoolMonitor(connector, {
    poolUtilization: 80,
    slowQueryTime: 1000,
    failureRate: 0.1
  });
  monitor.startMonitoring(30000); // Monitor every 30 seconds

  try {
    // Example 1: Create a user
    logger.info('Example 1: Creating a user');
    const createResult = await userService.create({
      username: 'johndoe',
      email: 'john.doe@example.com',
      full_name: 'John Doe'
    });

    if (createResult.success) {
      logger.info('User created successfully', { user: createResult.data });
    }

    const userId = createResult.data!.id;

    // Example 2: Find user by ID
    logger.info('Example 2: Finding user by ID');
    const user = await userService.findById(userId);
    logger.info('User found', { user });

    // Example 3: Update user
    logger.info('Example 3: Updating user');
    const updateResult = await userService.update(userId, {
      full_name: 'John Updated Doe'
    });
    logger.info('User updated', { success: updateResult.success });

    // Example 4: Find users with conditions
    logger.info('Example 4: Finding active users');
    const activeUsers = await repository.findActiveUsers();
    logger.info('Active users found', { count: activeUsers.length });

    // Example 5: Count users
    logger.info('Example 5: Counting users');
    const userCount = await userService.count();
    logger.info('Total users', { count: userCount });

    // Example 6: Batch create users
    logger.info('Example 6: Batch creating users');
    const batchResult = await userService.batchCreate([
      {
        username: 'jane_doe',
        email: 'jane@example.com',
        full_name: 'Jane Doe'
      },
      {
        username: 'bob_smith',
        email: 'bob@example.com',
        full_name: 'Bob Smith'
      }
    ]);
    logger.info('Batch users created', { success: batchResult.success });

    // Example 7: Use transaction manager for complex operations
    logger.info('Example 7: Transaction example');
    const txManager = userService.getTransactionManager();

    await txManager.executeInTransaction(async (ctx) => {
      // Multiple operations in a transaction
      await ctx.executeQuery('UPDATE users SET is_active = ? WHERE id = ?', [true, userId]);
      logger.info('Transaction operation completed');
    });

    // Example 8: Idempotent create
    logger.info('Example 8: Idempotent create');
    const idempotentResult = await userService.createIdempotent(
      'unique_key_123',
      {
        username: 'idempotent_user',
        email: 'idempotent@example.com'
      },
      'email'
    );
    logger.info('Idempotent create result', { success: idempotentResult.success });

    // Example 9: Check pool health
    logger.info('Example 9: Checking pool health');
    const health = await monitor.getHealthStatus();
    logger.info('Pool health', { health });

    // Example 10: Get metrics
    logger.info('Example 10: Getting metrics');
    const poolMetrics = await monitor.getPoolMetrics();
    const queryMetrics = monitor.getQueryMetrics();
    logger.info('Metrics', { poolMetrics, queryMetrics });

    // Cleanup: Delete test user
    logger.info('Cleaning up test data');
    await userService.delete(userId);

    // Delete batch users
    const janeUser = await repository.findByUsername('jane_doe');
    const bobUser = await repository.findByUsername('bob_smith');
    const idempotentUser = await repository.findByUsername('idempotent_user');

    if (janeUser) await userService.delete(janeUser.id);
    if (bobUser) await userService.delete(bobUser.id);
    if (idempotentUser) await userService.delete(idempotentUser.id);

    logger.info('Examples completed successfully');
  } catch (error) {
    logger.error('Example error', { error });
  } finally {
    // Stop monitoring
    monitor.stopMonitoring();

    // Disconnect
    await connector.disconnect();
  }
}

// Run examples
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error', { error });
    process.exit(1);
  });
}

export { main };
