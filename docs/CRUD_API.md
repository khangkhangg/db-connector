# CRUD API Documentation

Complete guide for using the CRUD operations layer in DB Schema Mapper Connector.

## Table of Contents

- [Overview](#overview)
- [Core Components](#core-components)
- [Query Builder](#query-builder)
- [Repository Pattern](#repository-pattern)
- [CRUD Service](#crud-service)
- [Transaction Management](#transaction-management)
- [Data Validation](#data-validation)
- [Connection Pool Monitoring](#connection-pool-monitoring)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

The CRUD API provides a safe, performant, and auditable way to perform Create, Read, Update, and Delete operations on your database with the following features:

- **Parameterized Queries**: SQL injection protection
- **Transaction Support**: ACID compliance with automatic rollback
- **Repository Pattern**: Clean separation of data access logic
- **Data Validation**: Type-safe validation before database operations
- **Connection Pooling**: Efficient database connection management
- **Monitoring**: Real-time metrics and health checks
- **Idempotency**: Built-in support for idempotent operations

## Core Components

### 1. Query Builder

Safe SQL query construction with parameterized values.

```typescript
import { QueryBuilder } from './query/query-builder';
import { DatabaseType } from './schema/types';

const builder = new QueryBuilder(DatabaseType.MySQL);

// Build SELECT query
const { query, params } = builder.buildSelect(
  'users',
  ['id', 'username', 'email'],
  [{ column: 'is_active', operator: '=', value: true }],
  undefined,
  { limit: 10, orderBy: 'created_at', orderDirection: 'DESC' }
);
// Result: SELECT `id`, `username`, `email` FROM `users` WHERE `is_active` = ? ORDER BY `created_at` DESC LIMIT 10
```

**Supported Operations:**
- `buildSelect()` - SELECT queries with WHERE, JOIN, ORDER BY, LIMIT
- `buildInsert()` - INSERT queries with automatic ID return
- `buildUpdate()` - UPDATE queries (requires WHERE clause)
- `buildDelete()` - DELETE queries (requires WHERE clause)
- `buildCount()` - COUNT queries
- `buildExists()` - EXISTS queries
- `buildBatchInsert()` - Batch INSERT for multiple rows
- `buildUpsert()` - INSERT with ON DUPLICATE KEY UPDATE

### 2. Repository Pattern

Base repository provides standard CRUD operations for any entity.

```typescript
import { BaseRepository } from './data-access/base-repository';
import { BaseDatabaseConnector } from './connectors/base-connector';

interface User {
  id: number;
  username: string;
  email: string;
}

class UserRepository extends BaseRepository<User> {
  constructor(connector: BaseDatabaseConnector) {
    super(connector, 'users', 'id');
  }

  // Add custom methods
  async findByUsername(username: string): Promise<User | null> {
    return this.findOne([
      { column: 'username', operator: '=', value: username }
    ]);
  }
}
```

**Repository Methods:**
- `findAll(options?)` - Get all records
- `findById(id)` - Find by primary key
- `findOne(where)` - Find single record by conditions
- `findMany(where, options?)` - Find multiple records
- `create(data)` - Insert new record
- `update(id, data)` - Update existing record
- `delete(id)` - Delete record
- `count(where?)` - Count records
- `exists(where)` - Check if record exists
- `batchCreate(data[])` - Bulk insert
- `updateMany(where, data)` - Update multiple records
- `deleteMany(where)` - Delete multiple records

### 3. CRUD Service

High-level service with transaction support and validation.

```typescript
import { CrudService } from './data-access/crud-service';

const userService = new CrudService(userRepository, connector);

// Create with automatic transaction and validation
const result = await userService.create({
  username: 'johndoe',
  email: 'john@example.com'
});

if (result.success) {
  console.log('User created:', result.data);
} else {
  console.error('Error:', result.error);
}
```

**Service Methods:**
- `create(data)` - Create with transaction
- `update(id, data)` - Update with transaction
- `delete(id)` - Delete with transaction
- `batchCreate(data[])` - Batch create with transaction
- `updateMany(where, data)` - Update multiple with transaction
- `createIdempotent(key, data, uniqueField)` - Idempotent create
- `findById(id)` - Read operations (no transaction)
- `findOne(where)`, `findMany(where)`, etc.

## Query Builder

### SELECT Queries

```typescript
// Simple select
const { query, params } = builder.buildSelect('users');
// SELECT * FROM `users`

// With WHERE conditions
const { query, params } = builder.buildSelect(
  'users',
  ['id', 'username'],
  [
    { column: 'age', operator: '>=', value: 18 },
    { column: 'is_active', operator: '=', value: true }
  ]
);
// SELECT `id`, `username` FROM `users` WHERE `age` >= ? AND `is_active` = ?

// With JOIN
const { query, params } = builder.buildSelect(
  'users',
  ['users.id', 'users.username', 'roles.name as role'],
  undefined,
  [
    {
      type: 'INNER',
      table: 'user_roles',
      on: 'users.id = user_roles.user_id'
    },
    {
      type: 'INNER',
      table: 'roles',
      on: 'user_roles.role_id = roles.id'
    }
  ]
);

// With pagination
const { query, params } = builder.buildSelect(
  'users',
  ['*'],
  undefined,
  undefined,
  { limit: 10, offset: 20, orderBy: 'created_at', orderDirection: 'DESC' }
);
```

### INSERT Queries

```typescript
// Single insert
const { query, params } = builder.buildInsert('users', {
  username: 'johndoe',
  email: 'john@example.com',
  age: 30
});
// MySQL: INSERT INTO `users` (`username`, `email`, `age`) VALUES (?, ?, ?)
// MSSQL: INSERT INTO [users] ([username], [email], [age]) VALUES (@param0, @param1, @param2); SELECT SCOPE_IDENTITY() AS id

// Batch insert
const { query, params } = builder.buildBatchInsert('users', [
  { username: 'user1', email: 'user1@example.com' },
  { username: 'user2', email: 'user2@example.com' }
]);
// INSERT INTO `users` (`username`, `email`) VALUES (?, ?), (?, ?)
```

### UPDATE Queries

```typescript
// Update requires WHERE clause for safety
const { query, params } = builder.buildUpdate(
  'users',
  { email: 'newemail@example.com', updated_at: new Date() },
  [{ column: 'id', operator: '=', value: 123 }]
);
// UPDATE `users` SET `email` = ?, `updated_at` = ? WHERE `id` = ?

// Update multiple records
const { query, params } = builder.buildUpdate(
  'users',
  { is_active: false },
  [{ column: 'last_login', operator: '<', value: '2024-01-01' }]
);
```

### DELETE Queries

```typescript
// Delete requires WHERE clause for safety
const { query, params } = builder.buildDelete('users', [
  { column: 'id', operator: '=', value: 123 }
]);
// DELETE FROM `users` WHERE `id` = ?

// Delete with multiple conditions
const { query, params } = builder.buildDelete('users', [
  { column: 'is_active', operator: '=', value: false },
  { column: 'created_at', operator: '<', value: '2023-01-01' }
]);
```

### WHERE Operators

Supported operators:
- `=` - Equal
- `!=` - Not equal
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal
- `LIKE` - Pattern matching
- `IN` - Value in list
- `IS NULL` - Is null
- `IS NOT NULL` - Is not null

```typescript
// IN operator
{ column: 'status', operator: 'IN', value: ['active', 'pending'] }

// NULL check
{ column: 'deleted_at', operator: 'IS NULL' }

// LIKE operator
{ column: 'username', operator: 'LIKE', value: '%john%' }
```

## Repository Pattern

### Creating a Repository

```typescript
interface Order {
  id: number;
  user_id: number;
  order_number: string;
  total_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  created_at: Date;
}

class OrderRepository extends BaseRepository<Order> {
  constructor(connector: BaseDatabaseConnector) {
    super(connector, 'orders', 'id');
  }

  // Custom query methods
  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    return this.findOne([
      { column: 'order_number', operator: '=', value: orderNumber }
    ]);
  }

  async findUserOrders(userId: number): Promise<Order[]> {
    return this.findMany(
      [{ column: 'user_id', operator: '=', value: userId }],
      { orderBy: 'created_at', orderDirection: 'DESC' }
    );
  }

  async findPendingOrders(): Promise<Order[]> {
    return this.findMany([
      { column: 'status', operator: '=', value: 'pending' }
    ]);
  }

  async getTotalRevenue(): Promise<number> {
    const results = await this.executeRaw<{ total: number }>(
      'SELECT SUM(total_amount) as total FROM orders WHERE status = ?',
      ['completed']
    );
    return results[0]?.total || 0;
  }
}
```

### Using Repositories

```typescript
// Create repository
const orderRepo = new OrderRepository(connector);

// Find all orders
const allOrders = await orderRepo.findAll({ limit: 100 });

// Find by ID
const order = await orderRepo.findById(123);

// Find with conditions
const userOrders = await orderRepo.findUserOrders(456);

// Count
const pendingCount = await orderRepo.count([
  { column: 'status', operator: '=', value: 'pending' }
]);

// Check existence
const exists = await orderRepo.exists([
  { column: 'order_number', operator: '=', value: 'ORD-2024-001' }
]);

// Create
const newOrder = await orderRepo.create({
  user_id: 123,
  order_number: 'ORD-2024-NEW',
  total_amount: 99.99,
  status: 'pending'
});

// Update
await orderRepo.update(newOrder.id, {
  status: 'processing'
});

// Delete
await orderRepo.delete(newOrder.id);
```

## CRUD Service

### Creating a Service

```typescript
class OrderService extends CrudService<Order> {
  private validator = new DataValidator();

  // Validation hooks
  protected async validateCreate(data: Partial<Order>): Promise<void> {
    const result = await this.validator.validate(data as Record<string, any>, [
      { field: 'user_id', required: true, type: 'integer', min: 1 },
      { field: 'order_number', required: true, minLength: 10, maxLength: 50 },
      { field: 'total_amount', required: true, type: 'number', min: 0 },
      {
        field: 'status',
        required: true,
        custom: (value) => ['pending', 'processing', 'completed', 'cancelled'].includes(value)
      }
    ]);

    if (!result.valid) {
      throw new Error(`Validation failed: ${result.errors.map(e => e.message).join(', ')}`);
    }

    // Additional business logic validation
    if (data.total_amount && data.total_amount > 10000) {
      throw new Error('Order amount exceeds maximum allowed');
    }
  }

  protected async validateUpdate(id: number | string, data: Partial<Order>): Promise<void> {
    // Prevent changing order number
    if (data.order_number) {
      throw new Error('Order number cannot be changed');
    }
  }

  protected async validateDelete(id: number | string): Promise<void> {
    const order = await this.getRepository().findById(id);
    if (order?.status === 'completed') {
      throw new Error('Cannot delete completed orders');
    }
  }
}
```

### Using Services

```typescript
const orderService = new OrderService(orderRepo, connector);

// Create with validation and transaction
const result = await orderService.create({
  user_id: 123,
  order_number: 'ORD-2024-001',
  total_amount: 99.99,
  status: 'pending'
});

if (result.success) {
  console.log('Order created:', result.data);
} else {
  console.error('Failed to create order:', result.error);
}

// Update with validation
const updateResult = await orderService.update(order.id, {
  status: 'processing'
});

// Batch create
const batchResult = await orderService.batchCreate([
  { user_id: 1, order_number: 'ORD-1', total_amount: 50 },
  { user_id: 2, order_number: 'ORD-2', total_amount: 75 }
]);

// Idempotent create (prevents duplicates)
const idempotentResult = await orderService.createIdempotent(
  'unique-request-id-123',
  { user_id: 1, order_number: 'ORD-UNIQUE', total_amount: 100 },
  'order_number'
);
```

## Transaction Management

### Basic Transactions

```typescript
import { TransactionManager } from './transaction/transaction-manager';

const txManager = new TransactionManager(connector);

// Execute in transaction
await txManager.executeInTransaction(async (ctx) => {
  // All operations in this block are part of the same transaction
  await ctx.executeQuery('INSERT INTO orders (user_id, total) VALUES (?, ?)', [1, 100]);
  await ctx.executeQuery('UPDATE users SET balance = balance - ? WHERE id = ?', [100, 1]);

  // If any operation fails, entire transaction is rolled back
});
```

### Manual Transaction Control

```typescript
// Begin transaction
const txContext = await txManager.beginTransaction({
  isolationLevel: IsolationLevel.READ_COMMITTED
});

try {
  // Perform operations
  await txContext.executeQuery('UPDATE inventory SET quantity = quantity - 1 WHERE product_id = ?', [123]);
  await txContext.executeQuery('INSERT INTO order_items (order_id, product_id) VALUES (?, ?)', [456, 123]);

  // Commit if all succeeded
  await txManager.commit(txContext);
} catch (error) {
  // Rollback on error
  await txManager.rollback(txContext, error.message);
  throw error;
}
```

### Idempotent Transactions

```typescript
// This ensures operation runs exactly once, even if called multiple times
const result = await txManager.executeIdempotent(
  'payment-transaction-xyz',
  async (ctx) => {
    await ctx.executeQuery('INSERT INTO payments (user_id, amount) VALUES (?, ?)', [1, 50]);
    await ctx.executeQuery('UPDATE accounts SET balance = balance + ? WHERE user_id = ?', [50, 1]);
    return { success: true };
  },
  async (key) => {
    // Check if already processed
    const results = await connector.executeQuery(
      'SELECT * FROM payments WHERE idempotency_key = ?',
      [key]
    );
    return results.length > 0 ? { success: true } : null;
  }
);
```

## Data Validation

### Rule-Based Validation

```typescript
import { DataValidator } from './validation/data-validator';

const validator = new DataValidator();

const result = await validator.validate(
  {
    username: 'johndoe',
    email: 'invalid-email',
    age: 15
  },
  [
    {
      field: 'username',
      required: true,
      minLength: 3,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_]+$/
    },
    {
      field: 'email',
      required: true,
      type: 'email'
    },
    {
      field: 'age',
      required: true,
      type: 'integer',
      min: 18,
      max: 120
    }
  ]
);

if (!result.valid) {
  console.log('Validation errors:', result.errors);
  // [
  //   { field: 'email', message: 'email format is invalid', value: 'invalid-email' },
  //   { field: 'age', message: 'age must be at least 18', value: 15 }
  // ]
}
```

### Column-Based Validation

```typescript
// Generate validation rules from database schema
const tableSchema = await connector.readTableSchema('users');
const rules = validator.createRulesFromColumns(tableSchema.columns);

// Validate against schema
const result = await validator.validate(userData, rules);
```

## Connection Pool Monitoring

### Setup Monitoring

```typescript
import { ConnectionPoolMonitor } from './monitoring/connection-pool-monitor';

const monitor = new ConnectionPoolMonitor(connector, {
  poolUtilization: 80,      // Alert at 80% utilization
  slowQueryTime: 1000,      // Alert for queries > 1 second
  failureRate: 0.1          // Alert if 10% of operations fail
});

// Start monitoring (checks every 60 seconds)
monitor.startMonitoring(60000);
```

### Metrics Collection

```typescript
// Get pool metrics
const poolMetrics = await monitor.getPoolMetrics();
console.log(poolMetrics);
// {
//   timestamp: Date,
//   totalConnections: 5,
//   activeConnections: 3,
//   idleConnections: 2,
//   waitingRequests: 0,
//   poolSize: { min: 2, max: 10 },
//   utilizationPercent: 30
// }

// Get query metrics
const queryMetrics = monitor.getQueryMetrics();
console.log(queryMetrics);
// {
//   totalQueries: 1000,
//   successfulQueries: 995,
//   failedQueries: 5,
//   averageExecutionTime: 50,
//   slowQueries: 10,
//   slowQueryThreshold: 1000
// }

// Health check
const health = await monitor.getHealthStatus();
if (!health.healthy) {
  console.error('Pool is unhealthy:', health.issues);
}
```

### Record Operations

```typescript
// Record query execution (for custom operations)
const startTime = Date.now();
try {
  await connector.executeQuery('SELECT * FROM users');
  monitor.recordQueryExecution(Date.now() - startTime, true);
} catch (error) {
  monitor.recordQueryExecution(Date.now() - startTime, false);
}
```

## Best Practices

### 1. Always Use Parameterized Queries

```typescript
// ❌ BAD: SQL injection vulnerable
const query = `SELECT * FROM users WHERE username = '${username}'`;

// ✅ GOOD: Parameterized query
const { query, params } = builder.buildSelect(
  'users',
  ['*'],
  [{ column: 'username', operator: '=', value: username }]
);
```

### 2. Use Transactions for Multiple Operations

```typescript
// ❌ BAD: No transaction
await orderRepo.create(orderData);
await inventoryRepo.update(productId, { quantity: newQuantity });

// ✅ GOOD: Wrapped in transaction
await txManager.executeInTransaction(async (ctx) => {
  await ctx.executeQuery('INSERT INTO orders ...', []);
  await ctx.executeQuery('UPDATE inventory ...', []);
});
```

### 3. Validate Before Database Operations

```typescript
// ❌ BAD: No validation
await userRepo.create(userData);

// ✅ GOOD: Validate first
const validation = await validator.validate(userData, rules);
if (!validation.valid) {
  throw new Error('Invalid data');
}
await userRepo.create(userData);
```

### 4. Handle Errors Gracefully

```typescript
// ❌ BAD: No error handling
const user = await userRepo.findById(123);
console.log(user.email); // May crash if user is null

// ✅ GOOD: Proper error handling
try {
  const user = await userRepo.findById(123);
  if (!user) {
    throw new Error('User not found');
  }
  console.log(user.email);
} catch (error) {
  logger.error('Failed to get user', { error });
  // Handle error appropriately
}
```

### 5. Use Idempotency for Critical Operations

```typescript
// ✅ GOOD: Idempotent payment processing
await paymentService.createIdempotent(
  requestId, // Unique request ID
  paymentData,
  'transaction_id' // Unique field
);
```

### 6. Monitor Pool Health

```typescript
// ✅ GOOD: Regular health checks
setInterval(async () => {
  const health = await monitor.getHealthStatus();
  if (!health.healthy) {
    alertOpsTeam(health.issues);
  }
}, 60000);
```

## Examples

See `examples/crud-usage.ts` for complete working examples of all features.

Run examples:
```bash
npm run dev examples/crud-usage.ts
```

## API Reference

### QueryBuilder
- `buildSelect(table, columns?, where?, joins?, options?)`
- `buildInsert(table, data)`
- `buildUpdate(table, data, where)`
- `buildDelete(table, where)`
- `buildCount(table, where?)`
- `buildExists(table, where)`
- `buildBatchInsert(table, data[])`
- `buildUpsert(table, data, uniqueColumns)`

### BaseRepository<T>
- `findAll(options?): Promise<T[]>`
- `findById(id): Promise<T | null>`
- `findOne(where): Promise<T | null>`
- `findMany(where, options?): Promise<T[]>`
- `create(data): Promise<T>`
- `update(id, data): Promise<boolean>`
- `delete(id): Promise<boolean>`
- `count(where?): Promise<number>`
- `exists(where): Promise<boolean>`
- `batchCreate(data[]): Promise<void>`
- `updateMany(where, data): Promise<number>`
- `deleteMany(where): Promise<number>`

### CrudService<T>
- `create(data): Promise<CrudOperationResult<T>>`
- `update(id, data): Promise<CrudOperationResult<boolean>>`
- `delete(id): Promise<CrudOperationResult<boolean>>`
- `batchCreate(data[]): Promise<CrudOperationResult<void>>`
- `updateMany(where, data): Promise<CrudOperationResult<number>>`
- `createIdempotent(key, data, uniqueField): Promise<CrudOperationResult<T>>`
- All read methods from BaseRepository

### TransactionManager
- `beginTransaction(options?): Promise<TransactionContext>`
- `commit(context): Promise<void>`
- `rollback(context, reason?): Promise<void>`
- `executeInTransaction<T>(operation, options?): Promise<T>`
- `executeIdempotent<T>(key, operation, checkExisting, options?): Promise<T>`

### DataValidator
- `validate(data, rules): Promise<ValidationResult>`
- `validateWithJoi(data, schema): Promise<ValidationResult>`
- `createRulesFromColumns(columns): ValidationRule[]`
- `sanitize(data): Record<string, any>`

### ConnectionPoolMonitor
- `startMonitoring(intervalMs?): void`
- `stopMonitoring(): void`
- `getPoolMetrics(): Promise<PoolMetrics>`
- `getQueryMetrics(): QueryMetrics`
- `getConnectionMetrics(): ConnectionMetrics`
- `getHealthStatus(): Promise<HealthStatus>`
- `recordQueryExecution(timeMs, success): void`
- `recordConnectionAttempt(timeMs, success, error?): void`
- `resetMetrics(): void`
