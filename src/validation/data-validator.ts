/**
 * Data validation layer for ensuring data integrity
 */

import * as Joi from 'joi';
import { ColumnMetadata, StandardDataType } from '../schema/types';
import { createLogger } from '../utils/logger';
import { SchemaValidationError } from '../utils/error-handler';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | Promise<boolean>;
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Data validator
 */
export class DataValidator {
  private logger = createLogger('DataValidator');

  /**
   * Validate data against rules
   */
  async validate(
    data: Record<string, any>,
    rules: ValidationRule[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      const value = data[rule.field];

      // Check required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: rule.field,
          message: rule.message || `${rule.field} is required`,
          value
        });
        continue;
      }

      // Skip further validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (rule.type) {
        const typeValid = this.validateType(value, rule.type);
        if (!typeValid) {
          errors.push({
            field: rule.field,
            message: rule.message || `${rule.field} must be of type ${rule.type}`,
            value
          });
          continue;
        }
      }

      // Length validation (strings)
      if (typeof value === 'string') {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push({
            field: rule.field,
            message: rule.message || `${rule.field} must be at least ${rule.minLength} characters`,
            value
          });
        }

        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          errors.push({
            field: rule.field,
            message: rule.message || `${rule.field} must be at most ${rule.maxLength} characters`,
            value
          });
        }
      }

      // Range validation (numbers)
      if (typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push({
            field: rule.field,
            message: rule.message || `${rule.field} must be at least ${rule.min}`,
            value
          });
        }

        if (rule.max !== undefined && value > rule.max) {
          errors.push({
            field: rule.field,
            message: rule.message || `${rule.field} must be at most ${rule.max}`,
            value
          });
        }
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string') {
        if (!rule.pattern.test(value)) {
          errors.push({
            field: rule.field,
            message: rule.message || `${rule.field} format is invalid`,
            value
          });
        }
      }

      // Custom validation
      if (rule.custom) {
        try {
          const customValid = await rule.custom(value);
          if (!customValid) {
            errors.push({
              field: rule.field,
              message: rule.message || `${rule.field} validation failed`,
              value
            });
          }
        } catch (error) {
          errors.push({
            field: rule.field,
            message: `${rule.field} validation error: ${(error as Error).message}`,
            value
          });
        }
      }
    }

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors
    };

    if (!result.valid) {
      this.logger.warn('Validation failed', { errors });
    }

    return result;
  }

  /**
   * Validate type
   */
  private validateType(value: any, type: string): boolean {
    switch (type.toLowerCase()) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      case 'email':
        return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'url':
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      case 'uuid':
        return typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      default:
        return true;
    }
  }

  /**
   * Create validation rules from column metadata
   */
  createRulesFromColumns(columns: ColumnMetadata[]): ValidationRule[] {
    return columns.map(col => {
      const rule: ValidationRule = {
        field: col.name,
        required: !col.nullable && !col.isAutoIncrement
      };

      // Add type validation
      rule.type = this.mapStandardTypeToValidationType(col.standardType);

      // Add length validation
      if (col.maxLength) {
        rule.maxLength = col.maxLength;
      }

      // Add range validation for numeric types
      if (col.precision && col.scale !== undefined) {
        const maxValue = Math.pow(10, col.precision - col.scale) - Math.pow(10, -col.scale);
        rule.max = maxValue;
        rule.min = -maxValue;
      }

      return rule;
    });
  }

  /**
   * Map standard data type to validation type
   */
  private mapStandardTypeToValidationType(standardType: StandardDataType): string {
    const typeMap: Record<StandardDataType, string> = {
      [StandardDataType.TINYINT]: 'integer',
      [StandardDataType.SMALLINT]: 'integer',
      [StandardDataType.INT]: 'integer',
      [StandardDataType.BIGINT]: 'integer',
      [StandardDataType.DECIMAL]: 'number',
      [StandardDataType.NUMERIC]: 'number',
      [StandardDataType.FLOAT]: 'number',
      [StandardDataType.REAL]: 'number',
      [StandardDataType.DOUBLE]: 'number',
      [StandardDataType.CHAR]: 'string',
      [StandardDataType.VARCHAR]: 'string',
      [StandardDataType.TEXT]: 'string',
      [StandardDataType.NCHAR]: 'string',
      [StandardDataType.NVARCHAR]: 'string',
      [StandardDataType.NTEXT]: 'string',
      [StandardDataType.BINARY]: 'string',
      [StandardDataType.VARBINARY]: 'string',
      [StandardDataType.BLOB]: 'string',
      [StandardDataType.DATE]: 'date',
      [StandardDataType.TIME]: 'string',
      [StandardDataType.DATETIME]: 'date',
      [StandardDataType.DATETIME2]: 'date',
      [StandardDataType.TIMESTAMP]: 'date',
      [StandardDataType.BOOLEAN]: 'boolean',
      [StandardDataType.BIT]: 'boolean',
      [StandardDataType.UUID]: 'uuid',
      [StandardDataType.JSON]: 'string',
      [StandardDataType.XML]: 'string',
      [StandardDataType.UNKNOWN]: 'string'
    };

    return typeMap[standardType] || 'string';
  }

  /**
   * Validate using Joi schema
   */
  async validateWithJoi(data: Record<string, any>, schema: Joi.ObjectSchema): Promise<ValidationResult> {
    try {
      await schema.validateAsync(data, { abortEarly: false });
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors: ValidationError[] = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));

        return { valid: false, errors };
      }

      throw error;
    }
  }

  /**
   * Sanitize data for security
   */
  sanitize(data: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        sanitized[key] = value;
        continue;
      }

      if (typeof value === 'string') {
        // Trim whitespace
        let sanitizedValue = value.trim();

        // Remove potential SQL injection patterns (basic)
        sanitizedValue = sanitizedValue.replace(/['";\\]/g, '');

        // Remove potential XSS patterns
        sanitizedValue = sanitizedValue.replace(/<script[^>]*>.*?<\/script>/gi, '');
        sanitizedValue = sanitizedValue.replace(/<[^>]+>/g, '');

        sanitized[key] = sanitizedValue;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
