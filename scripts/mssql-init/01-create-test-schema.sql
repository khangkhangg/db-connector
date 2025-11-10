-- MSSQL test schema initialization script
-- Note: This needs to be run manually after the container starts
-- Or use a custom initialization script in your CI/CD pipeline

-- Create test database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'testdb')
BEGIN
    CREATE DATABASE testdb;
END
GO

USE testdb;
GO

-- Create sample tables for testing

-- Users table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) NOT NULL UNIQUE,
        email NVARCHAR(100) NOT NULL UNIQUE,
        full_name NVARCHAR(100),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        is_active BIT DEFAULT 1,
        CONSTRAINT idx_email UNIQUE (email),
        INDEX idx_username (username)
    );
END
GO

-- Roles table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'roles')
BEGIN
    CREATE TABLE roles (
        id INT IDENTITY(1,1) PRIMARY KEY,
        role_name NVARCHAR(50) NOT NULL UNIQUE,
        description NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT GETDATE()
    );
END
GO

-- User roles junction table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'user_roles')
BEGIN
    CREATE TABLE user_roles (
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        assigned_at DATETIME2 DEFAULT GETDATE(),
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );
END
GO

-- Orders table (for foreign key testing)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'orders')
BEGIN
    CREATE TABLE orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        order_number NVARCHAR(50) NOT NULL UNIQUE,
        total_amount DECIMAL(10, 2) NOT NULL,
        status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
        order_date DATETIME2 DEFAULT GETDATE(),
        shipped_date DATETIME2 NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_order_number (order_number),
        INDEX idx_user_orders (user_id, order_date)
    );
END
GO

-- Insert sample data
IF NOT EXISTS (SELECT * FROM roles)
BEGIN
    INSERT INTO roles (role_name, description) VALUES
        ('admin', 'Administrator with full access'),
        ('user', 'Regular user with limited access'),
        ('moderator', 'Moderator with intermediate access');
END
GO

IF NOT EXISTS (SELECT * FROM users)
BEGIN
    INSERT INTO users (username, email, full_name) VALUES
        ('admin', 'admin@example.com', 'System Administrator'),
        ('john_doe', 'john@example.com', 'John Doe'),
        ('jane_smith', 'jane@example.com', 'Jane Smith');
END
GO

IF NOT EXISTS (SELECT * FROM user_roles)
BEGIN
    INSERT INTO user_roles (user_id, role_id) VALUES
        (1, 1), -- admin has admin role
        (2, 2), -- john_doe has user role
        (3, 2); -- jane_smith has user role
END
GO

IF NOT EXISTS (SELECT * FROM orders)
BEGIN
    INSERT INTO orders (user_id, order_number, total_amount, status) VALUES
        (2, 'ORD-2024-001', 99.99, 'completed'),
        (2, 'ORD-2024-002', 149.50, 'processing'),
        (3, 'ORD-2024-003', 79.99, 'pending');
END
GO

SELECT 'MSSQL test schema initialized successfully' AS message;
GO
