/**
 * MDF File Import Manager
 * Handles importing SQL Server MDF database files
 */

import { Logger } from '../utils/logger';
import { MSSQLConnector } from '../connectors/mssql-connector';
import { DatabaseError } from '../utils/error-handler';
import * as path from 'path';
import * as fs from 'fs';

/**
 * MDF file information
 */
export interface MDFFileInfo {
  mdfPath: string;
  ldfPath?: string; // Optional log file
  databaseName?: string; // Auto-detected or specified
}

/**
 * Attach options
 */
export interface AttachOptions {
  databaseName?: string; // Name to attach as (defaults to filename)
  fileMove?: boolean; // Move files to SQL Server data directory
  readOnly?: boolean; // Attach as read-only
  forceDetach?: boolean; // Force detach if database exists
}

/**
 * MDF Import result
 */
export interface MDFImportResult {
  success: boolean;
  databaseName: string;
  attached: boolean;
  message: string;
  fileInfo?: {
    mdfSize: number;
    ldfSize?: number;
    location: string;
  };
}

/**
 * MDF File Import Manager
 */
export class MDFImportManager {
  private logger: Logger;

  constructor(private sqlServerConnector: MSSQLConnector) {
    this.logger = new Logger('MDFImportManager');
  }

  /**
   * Import MDF file by attaching to SQL Server
   */
  async importMDF(
    fileInfo: MDFFileInfo,
    options: AttachOptions = {}
  ): Promise<MDFImportResult> {
    try {
      this.logger.info('Starting MDF import', {
        mdfPath: fileInfo.mdfPath,
        databaseName: options.databaseName
      });

      // 1. Validate files exist
      if (!fs.existsSync(fileInfo.mdfPath)) {
        throw new DatabaseError(`MDF file not found: ${fileInfo.mdfPath}`);
      }

      // 2. Get database name
      const databaseName = options.databaseName ||
                          fileInfo.databaseName ||
                          this.extractDatabaseName(fileInfo.mdfPath);

      // 3. Check if database already exists
      const exists = await this.databaseExists(databaseName);

      if (exists) {
        if (options.forceDetach) {
          this.logger.info('Database exists, detaching first', { databaseName });
          await this.detachDatabase(databaseName);
        } else {
          throw new DatabaseError(
            `Database '${databaseName}' already exists. Use forceDetach: true to override.`
          );
        }
      }

      // 4. Auto-detect log file if not provided
      let ldfPath = fileInfo.ldfPath;
      if (!ldfPath) {
        ldfPath = this.findLogFile(fileInfo.mdfPath);
      }

      // 5. Get file sizes
      const mdfSize = fs.statSync(fileInfo.mdfPath).size;
      const ldfSize = ldfPath && fs.existsSync(ldfPath)
        ? fs.statSync(ldfPath).size
        : undefined;

      // 6. Attach database
      await this.attachDatabase(databaseName, fileInfo.mdfPath, ldfPath, options);

      this.logger.info('MDF imported successfully', {
        databaseName,
        mdfSize,
        ldfSize
      });

      return {
        success: true,
        databaseName,
        attached: true,
        message: `Database '${databaseName}' attached successfully`,
        fileInfo: {
          mdfSize,
          ldfSize,
          location: fileInfo.mdfPath
        }
      };
    } catch (error) {
      this.logger.error('MDF import failed', { error });
      throw error;
    }
  }

  /**
   * Attach database using CREATE DATABASE FOR ATTACH
   */
  private async attachDatabase(
    databaseName: string,
    mdfPath: string,
    ldfPath?: string,
    options: AttachOptions = {}
  ): Promise<void> {
    // Build file list
    const files: string[] = [`(FILENAME = N'${mdfPath}')`];

    if (ldfPath && fs.existsSync(ldfPath)) {
      files.push(`(FILENAME = N'${ldfPath}')`);
    }

    // Build CREATE DATABASE statement
    let query = `
      CREATE DATABASE [${databaseName}]
      ON ${files.join(',\n')}
      FOR ATTACH
    `;

    // Add read-only option
    if (options.readOnly) {
      query += ' WITH (READONLY)';
    }

    try {
      await this.sqlServerConnector.executeQuery(query);
      this.logger.info('Database attached', { databaseName });
    } catch (error: any) {
      // Handle common errors
      if (error.message?.includes('already exists')) {
        throw new DatabaseError(`Database '${databaseName}' already exists`);
      }
      if (error.message?.includes('access denied') || error.message?.includes('permission')) {
        throw new DatabaseError(
          `Permission denied. SQL Server service account needs read access to: ${mdfPath}`
        );
      }
      if (error.message?.includes('log file') && !ldfPath) {
        // Try attach without log file (will create new log)
        this.logger.warn('Log file not found, attaching without log file');
        await this.attachWithoutLog(databaseName, mdfPath);
        return;
      }
      throw error;
    }
  }

  /**
   * Attach database without log file
   */
  private async attachWithoutLog(
    databaseName: string,
    mdfPath: string
  ): Promise<void> {
    const query = `
      CREATE DATABASE [${databaseName}]
      ON (FILENAME = N'${mdfPath}')
      FOR ATTACH_REBUILD_LOG
    `;

    await this.sqlServerConnector.executeQuery(query);
    this.logger.info('Database attached with rebuilt log', { databaseName });
  }

  /**
   * Detach database
   */
  async detachDatabase(databaseName: string): Promise<void> {
    try {
      // First, set database to single user to close connections
      await this.sqlServerConnector.executeQuery(`
        ALTER DATABASE [${databaseName}]
        SET SINGLE_USER WITH ROLLBACK IMMEDIATE
      `);

      // Detach
      await this.sqlServerConnector.executeQuery(`
        EXEC sp_detach_db @dbname = N'${databaseName}'
      `);

      this.logger.info('Database detached', { databaseName });
    } catch (error) {
      this.logger.error('Failed to detach database', { databaseName, error });
      throw error;
    }
  }

  /**
   * Check if database exists
   */
  private async databaseExists(databaseName: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM sys.databases
      WHERE name = @databaseName
    `;

    const result = await this.sqlServerConnector.executeQuery<any[]>(
      query,
      [databaseName]
    );

    return result[0]?.count > 0;
  }

  /**
   * Extract database name from MDF filename
   */
  private extractDatabaseName(mdfPath: string): string {
    const filename = path.basename(mdfPath, '.mdf');
    return filename;
  }

  /**
   * Find log file (.ldf) based on MDF path
   */
  private findLogFile(mdfPath: string): string | undefined {
    const dir = path.dirname(mdfPath);
    const baseName = path.basename(mdfPath, '.mdf');

    // Common log file patterns
    const patterns = [
      `${baseName}.ldf`,
      `${baseName}_log.ldf`,
      `${baseName}_Log.LDF`
    ];

    for (const pattern of patterns) {
      const ldfPath = path.join(dir, pattern);
      if (fs.existsSync(ldfPath)) {
        this.logger.info('Found log file', { ldfPath });
        return ldfPath;
      }
    }

    this.logger.warn('No log file found', { mdfPath });
    return undefined;
  }

  /**
   * List attached databases
   */
  async listDatabases(): Promise<string[]> {
    const query = `
      SELECT name
      FROM sys.databases
      WHERE database_id > 4 -- Exclude system databases
      ORDER BY name
    `;

    const result = await this.sqlServerConnector.executeQuery<any[]>(query);
    return result.map(r => r.name);
  }

  /**
   * Get database file information
   */
  async getDatabaseFiles(databaseName: string): Promise<{
    dataFiles: string[];
    logFiles: string[];
  }> {
    const query = `
      SELECT
        type_desc,
        physical_name
      FROM sys.master_files
      WHERE database_id = DB_ID(@databaseName)
    `;

    const result = await this.sqlServerConnector.executeQuery<any[]>(
      query,
      [databaseName]
    );

    return {
      dataFiles: result
        .filter(f => f.type_desc === 'ROWS')
        .map(f => f.physical_name),
      logFiles: result
        .filter(f => f.type_desc === 'LOG')
        .map(f => f.physical_name)
    };
  }

  /**
   * Backup database to file
   */
  async backupDatabase(
    databaseName: string,
    backupPath: string
  ): Promise<void> {
    this.logger.info('Starting database backup', { databaseName, backupPath });

    const query = `
      BACKUP DATABASE [${databaseName}]
      TO DISK = N'${backupPath}'
      WITH FORMAT, INIT,
      NAME = N'${databaseName}-Full Database Backup',
      SKIP, NOREWIND, NOUNLOAD, STATS = 10
    `;

    await this.sqlServerConnector.executeQuery(query);

    this.logger.info('Database backup completed', {
      databaseName,
      backupPath,
      size: fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0
    });
  }

  /**
   * Restore database from backup
   */
  async restoreDatabase(
    backupPath: string,
    databaseName?: string,
    options: {
      replace?: boolean;
      recovery?: boolean;
    } = {}
  ): Promise<void> {
    if (!fs.existsSync(backupPath)) {
      throw new DatabaseError(`Backup file not found: ${backupPath}`);
    }

    const targetDbName = databaseName || this.extractDatabaseName(backupPath);

    this.logger.info('Starting database restore', {
      backupPath,
      databaseName: targetDbName
    });

    let query = `
      RESTORE DATABASE [${targetDbName}]
      FROM DISK = N'${backupPath}'
    `;

    if (options.replace) {
      query += ' WITH REPLACE';
    }

    if (options.recovery === false) {
      query += ', NORECOVERY';
    }

    await this.sqlServerConnector.executeQuery(query);

    this.logger.info('Database restore completed', { databaseName: targetDbName });
  }

  /**
   * Get MDF file information without attaching
   */
  async getMDFInfo(mdfPath: string): Promise<{
    databaseName: string;
    fileSize: number;
    hasLogFile: boolean;
    logFileSize?: number;
  }> {
    if (!fs.existsSync(mdfPath)) {
      throw new DatabaseError(`MDF file not found: ${mdfPath}`);
    }

    const databaseName = this.extractDatabaseName(mdfPath);
    const fileSize = fs.statSync(mdfPath).size;
    const ldfPath = this.findLogFile(mdfPath);
    const hasLogFile = !!ldfPath;
    const logFileSize = ldfPath && fs.existsSync(ldfPath)
      ? fs.statSync(ldfPath).size
      : undefined;

    return {
      databaseName,
      fileSize,
      hasLogFile,
      logFileSize
    };
  }
}

/**
 * Helper function to create MDF import manager
 */
export async function createMDFImportManager(
  sqlServerConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
  }
): Promise<MDFImportManager> {
  const connector = new MSSQLConnector(sqlServerConfig);
  await connector.connect();
  return new MDFImportManager(connector);
}
