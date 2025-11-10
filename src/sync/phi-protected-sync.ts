/**
 * PHI-Protected Data Synchronization
 * Masks PHI data during transfer to external systems
 */

import { Logger } from '../utils/logger';
import { SyncConfig } from './types';

/**
 * PHI protection configuration
 */
export interface PHIProtectionConfig {
  enabled: boolean;
  phiFields: string[];
  maskInTransit: boolean; // Mask data during network transfer
  maskInLogs: boolean; // Mask data in logs
  encryptInTransit: boolean; // Require SSL/TLS
  auditPHIAccess: boolean; // Log all PHI access
}

/**
 * PHI-aware field definition
 */
export interface PHIFieldDefinition {
  fieldName: string;
  tableName?: string;
  maskPattern?: 'full' | 'partial' | 'hash';
}

/**
 * Default PHI field patterns
 */
const DEFAULT_PHI_PATTERNS = [
  // Patient identifiers
  'ssn', 'social_security', 'social_security_number',
  'patient_id', 'patient_number', 'patient_name',
  'mrn', 'medical_record', 'medical_record_number',

  // Demographics
  'dob', 'date_of_birth', 'birthdate', 'birth_date',
  'first_name', 'last_name', 'middle_name', 'full_name',
  'address', 'street', 'city', 'zip', 'postal_code',
  'phone', 'telephone', 'mobile', 'cell_phone',
  'email', 'email_address',

  // Medical information
  'diagnosis', 'diagnoses', 'condition',
  'medication', 'prescription', 'drug',
  'treatment', 'procedure', 'surgery',
  'lab_result', 'test_result', 'vital_sign',
  'blood_type', 'allergy', 'allergies',

  // Insurance
  'insurance_id', 'insurance_number', 'policy_number',
  'subscriber_id', 'group_number',

  // Financial
  'credit_card', 'card_number', 'account_number',
  'bank_account', 'routing_number',

  // Security
  'password', 'token', 'secret', 'api_key', 'private_key'
];

/**
 * PHI Protection Manager
 */
export class PHIProtectionManager {
  private logger: Logger;
  private phiPatterns: Set<string>;

  constructor(private config: PHIProtectionConfig) {
    this.logger = new Logger('PHIProtectionManager');
    this.phiPatterns = new Set([
      ...DEFAULT_PHI_PATTERNS,
      ...config.phiFields.map(f => f.toLowerCase())
    ]);

    this.logger.info('PHI protection initialized', {
      enabled: config.enabled,
      customFields: config.phiFields.length
    });
  }

  /**
   * Check if a field contains PHI
   */
  isPHIField(fieldName: string, tableName?: string): boolean {
    const lowerField = fieldName.toLowerCase();

    // Check direct match
    if (this.phiPatterns.has(lowerField)) {
      return true;
    }

    // Check if field name contains any PHI pattern
    for (const pattern of this.phiPatterns) {
      if (lowerField.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mask PHI data in a row
   */
  maskRowData(row: Record<string, any>, tableName?: string): Record<string, any> {
    if (!this.config.enabled) {
      return row;
    }

    const masked: Record<string, any> = {};

    for (const [key, value] of Object.entries(row)) {
      if (this.isPHIField(key, tableName)) {
        masked[key] = this.maskValue(value, key);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Mask a single value
   */
  private maskValue(value: any, fieldName: string): any {
    if (value === null || value === undefined) {
      return value;
    }

    const lowerField = fieldName.toLowerCase();

    // SSN format
    if (lowerField.includes('ssn') || lowerField.includes('social_security')) {
      return '***-**-****';
    }

    // Email
    if (lowerField.includes('email')) {
      return '***@***.***';
    }

    // Phone
    if (lowerField.includes('phone') || lowerField.includes('mobile')) {
      return '***-***-****';
    }

    // Credit card
    if (lowerField.includes('credit') || lowerField.includes('card')) {
      return '****-****-****-****';
    }

    // Date of birth
    if (lowerField.includes('dob') || lowerField.includes('birth')) {
      return '****-**-**';
    }

    // Generic masking
    if (typeof value === 'string') {
      if (value.length <= 4) {
        return '***';
      }
      // Show first and last character, mask middle
      return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
    }

    return '***PHI***';
  }

  /**
   * Mask PHI in batch data
   */
  maskBatchData(
    rows: any[],
    tableName?: string
  ): any[] {
    if (!this.config.enabled) {
      return rows;
    }

    return rows.map(row => this.maskRowData(row, tableName));
  }

  /**
   * Validate sync config for PHI protection
   */
  validateSyncConfig(config: SyncConfig): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check SSL/TLS
    if (this.config.encryptInTransit) {
      if (!config.source.ssl) {
        errors.push('Source database SSL/TLS is not enabled');
      }
      if (!config.target.ssl) {
        errors.push('Target database SSL/TLS is not enabled');
      }
    }

    // Check for PHI in table configs
    for (const table of config.tables) {
      if (table.columns) {
        const phiColumns = table.columns.filter(col => this.isPHIField(col, table.sourceTable));

        if (phiColumns.length > 0) {
          warnings.push(
            `Table ${table.sourceTable} contains PHI columns: ${phiColumns.join(', ')}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Get PHI fields in a table schema
   */
  getPHIFieldsInTable(
    columns: string[],
    tableName?: string
  ): string[] {
    return columns.filter(col => this.isPHIField(col, tableName));
  }

  /**
   * Create audit log entry for PHI access
   */
  async auditPHIAccess(
    userId: string,
    action: string,
    tableName: string,
    columns: string[],
    rowCount: number
  ): Promise<void> {
    if (!this.config.auditPHIAccess) {
      return;
    }

    const phiColumns = this.getPHIFieldsInTable(columns, tableName);

    if (phiColumns.length > 0) {
      this.logger.warn('PHI Access', {
        userId,
        action,
        tableName,
        phiColumns,
        rowCount,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Create default PHI protection config
 */
export function createDefaultPHIProtection(
  additionalFields?: string[]
): PHIProtectionConfig {
  return {
    enabled: true,
    phiFields: additionalFields || [],
    maskInTransit: false, // Don't mask data being synced
    maskInLogs: true, // Mask in logs
    encryptInTransit: true, // Require SSL/TLS
    auditPHIAccess: true // Audit all PHI access
  };
}

/**
 * Example usage configurations
 */
export const PHI_PROTECTION_EXAMPLES = {
  /**
   * Strict HIPAA compliance - maximum protection
   */
  strict: {
    enabled: true,
    phiFields: [],
    maskInTransit: true, // Mask during transfer
    maskInLogs: true,
    encryptInTransit: true,
    auditPHIAccess: true
  },

  /**
   * Standard protection - balanced
   */
  standard: {
    enabled: true,
    phiFields: [],
    maskInTransit: false, // Don't mask actual data
    maskInLogs: true, // Mask in logs only
    encryptInTransit: true,
    auditPHIAccess: true
  },

  /**
   * Development - minimal protection
   */
  development: {
    enabled: true,
    phiFields: [],
    maskInTransit: false,
    maskInLogs: false,
    encryptInTransit: false,
    auditPHIAccess: false
  },

  /**
   * Alerts only - protect PHI in alerts
   */
  alertsOnly: {
    enabled: true,
    phiFields: [],
    maskInTransit: false, // Don't mask synced data
    maskInLogs: true, // Mask in logs and alerts
    encryptInTransit: true,
    auditPHIAccess: true
  }
};
