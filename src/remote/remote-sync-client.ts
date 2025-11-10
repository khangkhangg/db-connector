/**
 * Remote sync client for pushing schema to remote application
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { DatabaseSchema, RemoteSyncConfig, SchemaSyncResult } from '../schema/types';
import { createLogger } from '../utils/logger';
import { RemoteSyncError, retryWithBackoff } from '../utils/error-handler';

export class RemoteSyncClient {
  private logger = createLogger('RemoteSyncClient');
  private client: AxiosInstance;

  constructor(private config: RemoteSyncConfig) {
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'User-Agent': 'DB-Schema-Mapper/1.0.0'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => this.handleError(error)
    );
  }

  /**
   * Push schema to remote application
   */
  async pushSchema(schema: DatabaseSchema): Promise<SchemaSyncResult> {
    this.logger.info('Pushing schema to remote application', {
      database: schema.databaseName,
      tables: schema.tables.length
    });

    try {
      const result = await retryWithBackoff(
        () => this.performPushSchema(schema),
        this.config.retryAttempts || 3,
        this.config.retryDelay || 5000
      );

      this.logger.info('Schema push successful', {
        schemaVersion: result.schemaVersion
      });

      return result;
    } catch (error) {
      this.logger.error('Schema push failed', { error });
      throw new RemoteSyncError(
        `Failed to push schema: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Perform the actual schema push
   */
  private async performPushSchema(schema: DatabaseSchema): Promise<SchemaSyncResult> {
    const response = await this.client.post('/api/schema/sync', {
      schema,
      metadata: {
        pushedAt: new Date(),
        source: 'db-schema-mapper'
      }
    });

    return {
      success: true,
      message: response.data.message || 'Schema synchronized successfully',
      schemaVersion: response.data.schemaVersion,
      timestamp: new Date()
    };
  }

  /**
   * Pull schema from remote application
   */
  async pullSchema(databaseName: string): Promise<DatabaseSchema> {
    this.logger.info('Pulling schema from remote application', { databaseName });

    try {
      const response = await retryWithBackoff(
        () => this.client.get(`/api/schema/${databaseName}`),
        this.config.retryAttempts || 3,
        this.config.retryDelay || 5000
      );

      this.logger.info('Schema pull successful');

      return response.data.schema;
    } catch (error) {
      this.logger.error('Schema pull failed', { error });
      throw new RemoteSyncError(
        `Failed to pull schema: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Compare local schema with remote schema
   */
  async compareWithRemote(localSchema: DatabaseSchema): Promise<any> {
    this.logger.info('Comparing local schema with remote', {
      database: localSchema.databaseName
    });

    try {
      const response = await this.client.post('/api/schema/compare', {
        localSchema
      });

      return response.data;
    } catch (error) {
      this.logger.error('Schema comparison failed', { error });
      throw new RemoteSyncError(
        `Failed to compare schemas: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Test connectivity to remote application
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health');
      return response.status === 200;
    } catch (error) {
      this.logger.error('Remote connection test failed', { error });
      return false;
    }
  }

  /**
   * Get remote application version
   */
  async getRemoteVersion(): Promise<string> {
    try {
      const response = await this.client.get('/api/version');
      return response.data.version;
    } catch (error) {
      this.logger.error('Failed to get remote version', { error });
      throw new RemoteSyncError(
        `Failed to get remote version: ${(error as Error).message}`,
        { error }
      );
    }
  }

  /**
   * Handle axios errors
   */
  private handleError(error: AxiosError): Promise<never> {
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.message || error.message;
      const status = error.response.status;

      this.logger.error('Remote API error', {
        status,
        message,
        endpoint: error.config?.url
      });

      throw new RemoteSyncError(
        `Remote API error (${status}): ${message}`,
        {
          status,
          endpoint: error.config?.url,
          response: error.response.data
        }
      );
    } else if (error.request) {
      // Request made but no response received
      this.logger.error('No response from remote server', {
        endpoint: error.config?.url
      });

      throw new RemoteSyncError(
        'No response from remote server',
        { endpoint: error.config?.url }
      );
    } else {
      // Error in request setup
      throw new RemoteSyncError(
        `Request setup error: ${error.message}`,
        { error }
      );
    }
  }
}
