/**
 * Authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '../../utils/logger';

const logger = createLogger('AuthMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

/**
 * Authentication middleware
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip auth for public endpoints
  if (req.path === '/' || req.path.startsWith('/health')) {
    return next();
  }

  // Get token from header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No authorization header provided'
    });
    return;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization header format. Use: Bearer <token>'
    });
    return;
  }

  const token = parts[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Attach user to request
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role
    };

    logger.debug('User authenticated', {
      userId: req.user.id,
      username: req.user.username
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', { error });

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}`
      });
      return;
    }

    next();
  };
}

/**
 * Generate JWT token
 */
export function generateToken(userId: string, username: string, role: string): string {
  return jwt.sign(
    { userId, username, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Verify token
 */
export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}
