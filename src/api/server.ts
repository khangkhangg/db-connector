/**
 * REST API Server for DB Schema Mapper Connector
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createLogger } from '../utils/logger';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import schemaRoutes from './routes/schema';
import migrationRoutes from './routes/migration';
import monitoringRoutes from './routes/monitoring';
import auditRoutes from './routes/audit';
import syncRoutes from './routes/sync';
import connectionsRoutes from './routes/connections';

const logger = createLogger('APIServer');

export interface ServerConfig {
  port?: number;
  host?: string;
  enableAuth?: boolean;
  enableRateLimit?: boolean;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  corsOrigins?: string[];
}

export class APIServer {
  private app: express.Application;
  private config: Required<ServerConfig>;
  private server: any;

  constructor(config: ServerConfig = {}) {
    this.config = {
      port: config.port || parseInt(process.env.API_PORT || '1001'),
      host: config.host || process.env.API_HOST || '0.0.0.0',
      enableAuth: config.enableAuth ?? (process.env.API_ENABLE_AUTH !== 'false'),
      enableRateLimit: config.enableRateLimit ?? true,
      rateLimitWindowMs: config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
      rateLimitMaxRequests: config.rateLimitMaxRequests || 100,
      corsOrigins: config.corsOrigins || ['*']
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Security headers (allow inline scripts and event handlers for UI)
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick and other inline event handlers
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    if (this.config.enableRateLimit) {
      const limiter = rateLimit({
        windowMs: this.config.rateLimitWindowMs,
        max: this.config.rateLimitMaxRequests,
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false
      });

      this.app.use('/api/', limiter);
    }

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });

    // Authentication (if enabled)
    if (this.config.enableAuth) {
      this.app.use('/api/', authMiddleware);
    }
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Serve static files (UI) - no auth required
    const publicPath = path.join(__dirname, '../../public');
    this.app.use(express.static(publicPath));

    // Root redirect to UI
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });

    // Health check (no auth required)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // API version info
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'DB Schema Mapper Connector API',
        version: '1.0.0',
        endpoints: {
          schema: '/api/schema',
          migration: '/api/migration',
          monitoring: '/api/monitoring',
          audit: '/api/audit',
          sync: '/api/sync',
          connections: '/api/connections'
        }
      });
    });

    // Connection management routes (no auth for local client use)
    this.app.use('/api/connections', connectionsRoutes);

    // Mount other route handlers
    this.app.use('/api/schema', schemaRoutes);
    this.app.use('/api/migration', migrationRoutes);
    this.app.use('/api/monitoring', monitoringRoutes);
    this.app.use('/api/audit', auditRoutes);
    this.app.use('/api/sync', syncRoutes);

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        const startupMessage = `
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  🚀 DB Schema Mapper Connector - API Server Started       ║
║                                                            ║
║  URL: http://localhost:${this.config.port}                          ║
║  Host: ${this.config.host}                                   ║
║  Auth: ${this.config.enableAuth ? 'Enabled' : 'Disabled'}                                   ║
║  Rate Limit: ${this.config.enableRateLimit ? 'Enabled' : 'Disabled'}                            ║
║                                                            ║
║  📖 Open http://localhost:${this.config.port} in your browser        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
        `;
        console.log(startupMessage);

        logger.info('API Server started', {
          host: this.config.host,
          port: this.config.port,
          auth: this.config.enableAuth,
          rateLimit: this.config.enableRateLimit
        });
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: Error) => {
          if (err) {
            logger.error('Error stopping server', { error: err });
            reject(err);
          } else {
            logger.info('API Server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new APIServer();

  server.start().catch(error => {
    logger.error('Failed to start server', { error });
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
}
