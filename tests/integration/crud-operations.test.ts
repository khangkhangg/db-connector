/**
 * Integration tests for CRUD operations
 */

import { createAndConnectConnector } from '../../src/connectors/connector-factory';
import { DatabaseType } from '../../src/schema/types';
import { BaseRepository } from '../../src/data-access/base-repository';
import { CrudService } from '../../src/data-access/crud-service';
import { BaseDatabaseConnector } from '../../src/connectors/base-connector';

interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  created_at?: Date;
  is_active?: boolean;
}

class UserRepository extends BaseRepository<User> {
  constructor(connector: BaseDatabaseConnector) {
    super(connector, 'users', 'id');
  }
}

describe('CRUD Operations Integration Tests', () => {
  let connector: BaseDatabaseConnector;
  let repository: UserRepository;
  let crudService: CrudService<User>;

  beforeAll(async () => {
    // Connect to test database (MySQL)
    connector = await createAndConnectConnector(DatabaseType.MySQL, {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      database: process.env.MYSQL_DATABASE || 'testdb',
      user: process.env.MYSQL_USER || 'testuser',
      password: process.env.MYSQL_PASSWORD || 'testpassword'
    });

    repository = new UserRepository(connector);
    crudService = new CrudService(repository, connector);
  });

  afterAll(async () => {
    await connector.disconnect();
  });

  describe('Create Operations', () => {
    test('should create a single user', async () => {
      const userData = {
        username: 'testuser_' + Date.now(),
        email: `testuser_${Date.now()}@example.com`,
        full_name: 'Test User'
      };

      const result = await crudService.create(userData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.username).toBe(userData.username);
      expect(result.data?.email).toBe(userData.email);

      // Cleanup
      if (result.data?.id) {
        await crudService.delete(result.data.id);
      }
    });

    test('should batch create multiple users', async () => {
      const timestamp = Date.now();
      const users = [
        {
          username: `batch_user1_${timestamp}`,
          email: `batch1_${timestamp}@example.com`,
          full_name: 'Batch User 1'
        },
        {
          username: `batch_user2_${timestamp}`,
          email: `batch2_${timestamp}@example.com`,
          full_name: 'Batch User 2'
        }
      ];

      const result = await crudService.batchCreate(users);

      expect(result.success).toBe(true);

      // Verify users were created
      const foundUsers = await repository.findMany([
        { column: 'email', operator: 'LIKE', value: `%batch%${timestamp}%` }
      ]);

      expect(foundUsers.length).toBe(2);

      // Cleanup
      for (const user of foundUsers) {
        await repository.delete(user.id);
      }
    });
  });

  describe('Read Operations', () => {
    let testUser: User;

    beforeAll(async () => {
      const result = await crudService.create({
        username: 'read_test_user',
        email: 'readtest@example.com',
        full_name: 'Read Test User'
      });
      testUser = result.data!;
    });

    afterAll(async () => {
      if (testUser?.id) {
        await crudService.delete(testUser.id);
      }
    });

    test('should find user by ID', async () => {
      const user = await crudService.findById(testUser.id);

      expect(user).toBeDefined();
      expect(user?.id).toBe(testUser.id);
      expect(user?.username).toBe('read_test_user');
    });

    test('should find user by email', async () => {
      const user = await crudService.findOne([
        { column: 'email', operator: '=', value: 'readtest@example.com' }
      ]);

      expect(user).toBeDefined();
      expect(user?.email).toBe('readtest@example.com');
    });

    test('should find multiple users', async () => {
      const users = await crudService.findMany([
        { column: 'is_active', operator: '=', value: true }
      ]);

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });

    test('should count users', async () => {
      const count = await crudService.count();

      expect(count).toBeGreaterThan(0);
    });

    test('should check if user exists', async () => {
      const exists = await crudService.exists([
        { column: 'id', operator: '=', value: testUser.id }
      ]);

      expect(exists).toBe(true);
    });
  });

  describe('Update Operations', () => {
    let testUser: User;

    beforeEach(async () => {
      const result = await crudService.create({
        username: 'update_test_user',
        email: 'updatetest@example.com',
        full_name: 'Update Test User'
      });
      testUser = result.data!;
    });

    afterEach(async () => {
      if (testUser?.id) {
        await crudService.delete(testUser.id);
      }
    });

    test('should update user', async () => {
      const result = await crudService.update(testUser.id, {
        full_name: 'Updated Test User'
      });

      expect(result.success).toBe(true);

      // Verify update
      const updated = await repository.findById(testUser.id);
      expect(updated?.full_name).toBe('Updated Test User');
    });

    test('should update multiple users', async () => {
      // Create another user
      const result2 = await crudService.create({
        username: 'update_test_user2',
        email: 'updatetest2@example.com',
        is_active: true
      });

      const result = await crudService.updateMany(
        [{ column: 'is_active', operator: '=', value: true }],
        { is_active: false }
      );

      expect(result.success).toBe(true);

      // Cleanup second user
      if (result2.data?.id) {
        await crudService.delete(result2.data.id);
      }
    });
  });

  describe('Delete Operations', () => {
    test('should delete user', async () => {
      const createResult = await crudService.create({
        username: 'delete_test_user',
        email: 'deletetest@example.com'
      });

      const userId = createResult.data!.id;

      const deleteResult = await crudService.delete(userId);

      expect(deleteResult.success).toBe(true);

      // Verify deletion
      const user = await repository.findById(userId);
      expect(user).toBeNull();
    });
  });

  describe('Idempotent Operations', () => {
    test('should handle idempotent create', async () => {
      const idempotencyKey = 'test_key_' + Date.now();
      const userData = {
        username: 'idempotent_user_' + Date.now(),
        email: `idempotent_${Date.now()}@example.com`
      };

      // First call
      const result1 = await crudService.createIdempotent(
        idempotencyKey,
        userData,
        'email'
      );

      expect(result1.success).toBe(true);
      const userId = result1.data!.id;

      // Second call with same idempotency key
      const result2 = await crudService.createIdempotent(
        idempotencyKey,
        userData,
        'email'
      );

      expect(result2.success).toBe(true);
      expect(result2.data!.id).toBe(userId); // Should return existing user

      // Cleanup
      await crudService.delete(userId);
    });
  });
});
