-- MySQL test schema initialization script

-- Create test database (already created by Docker, but ensure it exists)
CREATE DATABASE IF NOT EXISTS testdb;
USE testdb;

-- Create sample tables for testing

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_email (email),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table (for foreign key testing)
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    total_amount DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_date TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_order_number (order_number),
    INDEX idx_user_orders (user_id, order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data
INSERT INTO roles (role_name, description) VALUES
    ('admin', 'Administrator with full access'),
    ('user', 'Regular user with limited access'),
    ('moderator', 'Moderator with intermediate access');

INSERT INTO users (username, email, full_name) VALUES
    ('admin', 'admin@example.com', 'System Administrator'),
    ('john_doe', 'john@example.com', 'John Doe'),
    ('jane_smith', 'jane@example.com', 'Jane Smith');

INSERT INTO user_roles (user_id, role_id) VALUES
    (1, 1), -- admin has admin role
    (2, 2), -- john_doe has user role
    (3, 2); -- jane_smith has user role

INSERT INTO orders (user_id, order_number, total_amount, status) VALUES
    (2, 'ORD-2024-001', 99.99, 'completed'),
    (2, 'ORD-2024-002', 149.50, 'processing'),
    (3, 'ORD-2024-003', 79.99, 'pending');

SELECT 'MySQL test schema initialized successfully' AS message;
