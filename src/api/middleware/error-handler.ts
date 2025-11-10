/**
 * Error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ErrorHandler');

export interface APIError extends Error {
  statusCode?: number;
  details?: any;
}

/**
 * Error handler middleware
 */
export function errorHandler(
  err: APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('API error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Async handler wrapper
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create API error
 */
export function createAPIError(
  message: string,
  statusCode: number = 500,
  details?: any
): APIError {
  const error = new Error(message) as APIError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
