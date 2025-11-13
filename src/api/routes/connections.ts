/**
 * Connection management API routes
 * Supports auto-discovery, manual connections, and connection testing
 */

import { Router, Request, Response } from 'express';
import { MSSQLDiscoveryManager } from '../../discovery/mssql-discovery';
import { createAndConnectConnector } from '../../connectors/connector-factory';
import { createLogger } from '../../utils/logger';

const router = Router();
const logger = createLogger('ConnectionAPI');

// Store active connections (in production, use Redis or similar)
const activeConnections = new Map();

/**
 * POST /api/connections/discover
 * Auto-discover local SQL Server instances
 */
router.post('/discover', async (req: Request, res: Response) => {
  try {
    logger.info('Discovering local SQL Server instances');

    const discovery = new MSSQLDiscoveryManager();
    const instances = await discovery.discoverLocalInstances();

    logger.info(`Discovered ${instances.length} instances`);

    res.json({
      success: true,
      instances: instances.map(instance => ({
        instanceName: instance.instanceName,
        serverName: instance.serverName,
        displayName: instance.displayName,
        version: instance.version,
        isLocal: instance.isLocal,
        isClustered: instance.isClustered
      })),
      count: instances.length
    });
  } catch (error) {
    logger.error('Failed to discover instances', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to discover instances',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/connections/databases
 * Get list of databases for a specific server
 * Body: { server: string }
 */
router.post('/databases', async (req: Request, res: Response) => {
  try {
    const { server } = req.body;

    if (!server) {
      return res.status(400).json({
        success: false,
        message: 'Server name is required'
      });
    }

    logger.info('Getting databases for server', { server });

    const discovery = new MSSQLDiscoveryManager();
    const result = await discovery.connectToLocalInstance(server);

    if (!result.success || !result.databases) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to connect to server'
      });
    }

    // Close the connection after getting databases
    if (result.pool) {
      await result.pool.close();
    }

    res.json({
      success: true,
      databases: result.databases
    });
  } catch (error) {
    logger.error('Failed to get databases', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to get databases',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/connections/test
 * Test a database connection
 * Body: ConnectionConfig
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const config = req.body;

    logger.info('Testing connection', {
      type: config.type,
      server: config.server,
      database: config.database
    });

    // For Windows Auth
    if (config.type === 'MSSQL' && config.useWindowsAuth) {
      const discovery = new MSSQLDiscoveryManager();
      const result = await discovery.testConnection(config.server, config.database);

      return res.json({
        success: result,
        message: result ? 'Connection successful' : 'Connection failed'
      });
    }

    // For SQL Auth or other databases
    const connectorConfig = buildConnectorConfig(config);
    const connector = await createAndConnectConnector(config.type, connectorConfig);

    // Test query
    await connector.executeQuery('SELECT 1 as test');

    // Disconnect
    await connector.disconnect();

    res.json({
      success: true,
      message: 'Connection successful'
    });
  } catch (error) {
    logger.error('Connection test failed', { error });
    res.status(400).json({
      success: false,
      message: 'Connection test failed',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/connections/connect
 * Establish a new database connection
 * Body: ConnectionConfig
 */
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const config = req.body;

    logger.info('Establishing connection', {
      type: config.type,
      server: config.server,
      database: config.database
    });

    let connector;
    let connectionId;

    // For Windows Auth with MSSQL
    if (config.type === 'MSSQL' && config.useWindowsAuth) {
      const discovery = new MSSQLDiscoveryManager();
      const result = await discovery.connectToLocalInstance(config.server, {
        database: config.database
      });

      if (!result.success || !result.pool) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to connect'
        });
      }

      connectionId = `mssql-windows-${Date.now()}`;
      activeConnections.set(connectionId, result.pool);

      return res.json({
        success: true,
        message: 'Connected successfully',
        connectionId,
        connection: {
          type: config.type,
          server: config.server,
          database: config.database,
          authType: 'Windows Authentication',
          instance: result.instance
        }
      });
    }

    // For SQL Auth or other databases
    const connectorConfig = buildConnectorConfig(config);
    connector = await createAndConnectConnector(config.type, connectorConfig);

    connectionId = `${config.type.toLowerCase()}-${Date.now()}`;
    activeConnections.set(connectionId, connector);

    res.json({
      success: true,
      message: 'Connected successfully',
      connectionId,
      connection: {
        type: config.type,
        server: config.server,
        database: config.database,
        authType: config.useWindowsAuth ? 'Windows Authentication' : 'SQL Authentication'
      }
    });
  } catch (error) {
    logger.error('Failed to establish connection', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to establish connection',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/connections/disconnect
 * Disconnect an active connection
 * Body: { connectionId: string }
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        message: 'Connection ID is required'
      });
    }

    const connection = activeConnections.get(connectionId);

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    // Disconnect based on type
    if (connection.disconnect) {
      await connection.disconnect();
    } else if (connection.close) {
      await connection.close();
    }

    activeConnections.delete(connectionId);

    logger.info('Connection disconnected', { connectionId });

    res.json({
      success: true,
      message: 'Disconnected successfully'
    });
  } catch (error) {
    logger.error('Failed to disconnect', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/connections/active
 * Get list of active connections
 */
router.get('/active', (req: Request, res: Response) => {
  const connections = Array.from(activeConnections.entries()).map(([id, conn]) => ({
    connectionId: id,
    type: id.split('-')[0].toUpperCase(),
    active: true
  }));

  res.json({
    success: true,
    connections,
    count: connections.length
  });
});

/**
 * GET /api/connections/current-user
 * Get current Windows user (for Windows Authentication)
 */
router.get('/current-user', async (req: Request, res: Response) => {
  try {
    const discovery = new MSSQLDiscoveryManager();
    const user = await discovery.getCurrentUser();

    res.json({
      success: true,
      user: {
        username: user.username,
        domain: user.domain,
        fullName: user.domain ? `${user.domain}\\${user.username}` : user.username
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get current user',
      error: (error as Error).message
    });
  }
});

/**
 * Helper function to build connector configuration
 */
function buildConnectorConfig(config: any): any {
  // Normalize type to uppercase for comparison
  const type = config.type?.toUpperCase();

  if (type === 'MSSQL') {
    const mssqlConfig: any = {
      server: config.server || config.host,
      database: config.database,
      options: {
        encrypt: config.encrypt ?? false,
        trustServerCertificate: config.trustServerCertificate ?? true,
        enableArithAbort: true
      }
    };

    if (config.useWindowsAuth) {
      mssqlConfig.authentication = {
        type: 'default'
      };
    } else {
      mssqlConfig.user = config.username || config.user;
      mssqlConfig.password = config.password;
    }

    if (config.port) {
      mssqlConfig.port = config.port;
    }

    return mssqlConfig;
  } else if (type === 'MYSQL') {
    return {
      host: config.server || config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.username || config.user,
      password: config.password
    };
  } else if (type === 'POSTGRESQL') {
    return {
      host: config.server || config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username || config.user,
      password: config.password
    };
  }

  throw new Error(`Unsupported database type: ${config.type}`);
}

export default router;
