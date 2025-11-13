/**
 * Auto-discovery for local SQL Server instances
 * Similar to SQL Server Management Studio's server discovery
 */

import * as mssql from 'mssql';
import { createLogger } from '../utils/logger';
import { DatabaseConnectionError } from '../utils/error-handler';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);
const logger = createLogger('MSSQLDiscovery');

export interface DiscoveredInstance {
  instanceName: string;
  serverName: string;
  version?: string;
  isClustered?: boolean;
  isLocal: boolean;
  displayName: string;
}

export interface DiscoveredDatabase {
  name: string;
  size?: string;
  owner?: string;
  createDate?: Date;
}

export interface LocalConnectionResult {
  success: boolean;
  pool?: mssql.ConnectionPool;
  instance?: DiscoveredInstance;
  databases?: DiscoveredDatabase[];
  error?: string;
}

/**
 * SQL Server instance discovery and auto-connection manager
 */
export class MSSQLDiscoveryManager {
  private logger = createLogger('MSSQLDiscoveryManager');

  /**
   * Discover all SQL Server instances on the local machine
   * Uses SQL Server Browser service and registry scanning
   */
  async discoverLocalInstances(): Promise<DiscoveredInstance[]> {
    this.logger.info('Discovering local SQL Server instances...');
    const instances: DiscoveredInstance[] = [];

    try {
      // Method 1: Try SQL Server Browser service (UDP port 1434)
      const browserInstances = await this.discoverViaBrowser();
      instances.push(...browserInstances);

      // Method 2: Check common default instances
      const defaultInstances = await this.checkDefaultInstances();
      instances.push(...defaultInstances);

      // Method 3: Windows-specific registry scan (if on Windows)
      if (os.platform() === 'win32') {
        const registryInstances = await this.discoverViaRegistry();
        instances.push(...registryInstances);
      }

      // Remove duplicates
      const uniqueInstances = this.deduplicateInstances(instances);

      this.logger.info(`Discovered ${uniqueInstances.length} SQL Server instances`, {
        instances: uniqueInstances.map(i => i.displayName)
      });

      return uniqueInstances;
    } catch (error) {
      this.logger.error('Failed to discover instances', { error });
      return instances;
    }
  }

  /**
   * Discover instances using SQL Server Browser service
   */
  private async discoverViaBrowser(): Promise<DiscoveredInstance[]> {
    // SQL Server Browser uses UDP port 1434 for instance discovery
    // The mssql library doesn't expose this directly, but we can try known patterns
    const instances: DiscoveredInstance[] = [];

    // This would require a UDP implementation, which is complex
    // For now, we'll rely on other methods
    return instances;
  }

  /**
   * Check common default SQL Server instances
   */
  private async checkDefaultInstances(): Promise<DiscoveredInstance[]> {
    const instances: DiscoveredInstance[] = [];
    const commonInstances = [
      { server: 'localhost', instance: '' },           // Default instance
      { server: '(local)', instance: '' },             // Default instance alias
      { server: '.', instance: '' },                   // Default instance short alias
      { server: 'localhost', instance: 'SQLEXPRESS' }, // SQL Express
      { server: 'localhost', instance: 'MSSQLSERVER' },// Named instance
      { server: os.hostname(), instance: '' },         // Machine name
      { server: os.hostname(), instance: 'SQLEXPRESS' }
    ];

    for (const { server, instance } of commonInstances) {
      const serverName = instance ? `${server}\\${instance}` : server;
      const displayName = instance ? `${server}\\${instance}` : `${server} (Default)`;

      instances.push({
        instanceName: instance || 'MSSQLSERVER',
        serverName,
        displayName,
        isLocal: true
      });
    }

    return instances;
  }

  /**
   * Discover instances via Windows registry
   * Works only on Windows systems
   */
  private async discoverViaRegistry(): Promise<DiscoveredInstance[]> {
    const instances: DiscoveredInstance[] = [];

    try {
      // Query registry for installed SQL Server instances
      const regQuery = 'reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server" /s';
      const { stdout } = await execAsync(regQuery);

      // Parse registry output to find instance names
      const lines = stdout.split('\n');
      const instancePattern = /Instance Names\\SQL/;
      let inInstanceSection = false;

      for (const line of lines) {
        if (instancePattern.test(line)) {
          inInstanceSection = true;
          continue;
        }

        if (inInstanceSection && line.trim().startsWith('REG_SZ')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const instanceName = parts[0];
            const serverName = instanceName === 'MSSQLSERVER'
              ? os.hostname()
              : `${os.hostname()}\\${instanceName}`;

            instances.push({
              instanceName,
              serverName,
              displayName: serverName,
              isLocal: true
            });
          }
        }

        if (line.trim() === '') {
          inInstanceSection = false;
        }
      }
    } catch (error) {
      this.logger.debug('Registry scan failed (may not be on Windows)', { error });
    }

    return instances;
  }

  /**
   * Remove duplicate instances from the list
   */
  private deduplicateInstances(instances: DiscoveredInstance[]): DiscoveredInstance[] {
    const seen = new Set<string>();
    const unique: DiscoveredInstance[] = [];

    for (const instance of instances) {
      const key = instance.serverName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(instance);
      }
    }

    return unique;
  }

  /**
   * Connect to local SQL Server using Windows Authentication
   * Similar to how SQL Server Management Studio connects
   */
  async connectToLocalInstance(
    serverName: string = 'localhost',
    options: {
      database?: string;
      applicationName?: string;
      encrypt?: boolean;
      trustServerCertificate?: boolean;
    } = {}
  ): Promise<LocalConnectionResult> {
    this.logger.info('Attempting local connection using Windows Authentication', {
      server: serverName,
      database: options.database
    });

    try {
      // Try Windows Authentication (Trusted Connection)
      const config: mssql.config = {
        server: serverName,
        database: options.database || 'master',
        options: {
          encrypt: options.encrypt ?? false,
          trustServerCertificate: options.trustServerCertificate ?? true,
          enableArithAbort: true
        },
        authentication: {
          type: 'default' // Uses Windows Authentication on Windows, falls back to ntlm
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        }
      };

      // Try connection
      const pool = await mssql.connect(config);

      this.logger.info('Successfully connected to local SQL Server', {
        server: serverName
      });

      // Get instance information
      const instance = await this.getInstanceInfo(pool, serverName);

      // Get available databases
      const databases = await this.getDatabases(pool);

      return {
        success: true,
        pool,
        instance,
        databases
      };
    } catch (error) {
      this.logger.error('Failed to connect to local instance', {
        server: serverName,
        error
      });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Auto-connect to any available local SQL Server instance
   * Tries all discovered instances until one succeeds
   */
  async autoConnectLocal(options?: {
    preferredInstance?: string;
    database?: string;
  }): Promise<LocalConnectionResult> {
    this.logger.info('Auto-connecting to local SQL Server...');

    // Discover instances
    const instances = await this.discoverLocalInstances();

    if (instances.length === 0) {
      return {
        success: false,
        error: 'No local SQL Server instances found'
      };
    }

    // Try preferred instance first
    if (options?.preferredInstance) {
      const preferred = instances.find(i =>
        i.serverName.toLowerCase() === options.preferredInstance?.toLowerCase() ||
        i.instanceName.toLowerCase() === options.preferredInstance?.toLowerCase()
      );

      if (preferred) {
        const result = await this.connectToLocalInstance(preferred.serverName, {
          database: options.database
        });

        if (result.success) {
          return result;
        }
      }
    }

    // Try each instance until one succeeds
    for (const instance of instances) {
      this.logger.debug('Trying instance', { instance: instance.displayName });

      const result = await this.connectToLocalInstance(instance.serverName, {
        database: options.database
      });

      if (result.success) {
        this.logger.info('Successfully auto-connected', {
          instance: instance.displayName
        });
        return result;
      }
    }

    return {
      success: false,
      error: `Failed to connect to any of ${instances.length} discovered instances`
    };
  }

  /**
   * Get instance information
   */
  private async getInstanceInfo(
    pool: mssql.ConnectionPool,
    serverName: string
  ): Promise<DiscoveredInstance> {
    try {
      const result = await pool.request().query(`
        SELECT
          SERVERPROPERTY('ProductVersion') as Version,
          SERVERPROPERTY('IsClustered') as IsClustered,
          SERVERPROPERTY('Edition') as Edition,
          @@SERVERNAME as ServerName
      `);

      const row = result.recordset[0];

      return {
        instanceName: serverName,
        serverName: row.ServerName || serverName,
        version: row.Version,
        isClustered: row.IsClustered === 1,
        isLocal: true,
        displayName: row.ServerName || serverName
      };
    } catch (error) {
      this.logger.error('Failed to get instance info', { error });
      return {
        instanceName: serverName,
        serverName,
        displayName: serverName,
        isLocal: true
      };
    }
  }

  /**
   * Get list of databases on the instance
   */
  private async getDatabases(pool: mssql.ConnectionPool): Promise<DiscoveredDatabase[]> {
    try {
      const result = await pool.request().query(`
        SELECT
          name,
          CAST(size * 8.0 / 1024 AS DECIMAL(10,2)) as SizeMB,
          suser_sname(owner_sid) as Owner,
          create_date as CreateDate
        FROM sys.databases
        WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
        ORDER BY name
      `);

      return result.recordset.map((row: any) => ({
        name: row.name,
        size: `${row.SizeMB} MB`,
        owner: row.Owner,
        createDate: row.CreateDate
      }));
    } catch (error) {
      this.logger.error('Failed to get databases', { error });
      return [];
    }
  }

  /**
   * Test connection to a specific instance
   */
  async testConnection(serverName: string, database?: string): Promise<boolean> {
    const result = await this.connectToLocalInstance(serverName, { database });

    if (result.pool) {
      await result.pool.close();
    }

    return result.success;
  }

  /**
   * Get current Windows user info (for debugging)
   */
  async getCurrentUser(): Promise<{ username: string; domain?: string }> {
    try {
      const username = os.userInfo().username;
      const domain = process.env.USERDOMAIN;

      return {
        username,
        domain
      };
    } catch (error) {
      this.logger.error('Failed to get current user', { error });
      return { username: 'unknown' };
    }
  }
}
