/**
 * Logging utility using Winston
 */

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';

/**
 * Custom log format for console output
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

/**
 * JSON format for production logging
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Logger configuration
 */
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat === 'json' ? jsonFormat : consoleFormat,
  defaultMeta: { service: 'db-schema-mapper' },
  transports: [
    new winston.transports.Console({
      format: logFormat === 'json' ? jsonFormat : consoleFormat
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: jsonFormat
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: jsonFormat
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: string): winston.Logger {
  return logger.child({ context });
}

export default logger;
