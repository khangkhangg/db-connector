/**
 * Custom error types and error handling utilities
 */

import logger from './logger';

/**
 * Base custom error class
 */
export class BaseError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

/**
 * Database connection error
 */
export class DatabaseConnectionError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'DB_CONNECTION_ERROR', 503, details);
  }
}

/**
 * Schema reading error
 */
export class SchemaReadError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_READ_ERROR', 500, details);
  }
}

/**
 * Schema validation error
 */
export class SchemaValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_VALIDATION_ERROR', 400, details);
  }
}

/**
 * Schema mapping error
 */
export class SchemaMappingError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_MAPPING_ERROR', 500, details);
  }
}

/**
 * Remote sync error
 */
export class RemoteSyncError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'REMOTE_SYNC_ERROR', 502, details);
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
  }
}

/**
 * Global error handler
 */
export function handleError(error: Error | BaseError): void {
  if (error instanceof BaseError) {
    logger.error(`[${error.code}] ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
      stack: error.stack
    });
  } else {
    logger.error(`Unexpected error: ${error.message}`, {
      stack: error.stack
    });
  }
}

/**
 * Async error wrapper for try-catch blocks
 */
export async function asyncErrorHandler<T>(
  fn: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    handleError(error as Error);
    throw new BaseError(
      errorMessage,
      'ASYNC_OPERATION_ERROR',
      500,
      { originalError: (error as Error).message }
    );
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, {
          error: (error as Error).message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Validate required environment variables
 */
export function validateRequiredEnvVars(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}`,
      { missingVars: missing }
    );
  }
}
