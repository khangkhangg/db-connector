/**
 * WebSocket Server for real-time push notifications
 */

import { Server as WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { createLogger } from '../utils/logger';
import { ChangeRecord } from '../change-tracking/changelog-manager';

const logger = createLogger('WebSocketServer');

export interface WSClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>; // Set of table names the client is subscribed to
  metadata?: any;
}

export class ChangeNotificationWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupWebSocketServer();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: WSClient = {
        id: clientId,
        ws,
        subscriptions: new Set()
      };

      this.clients.set(clientId, client);
      logger.info('WebSocket client connected', { clientId, totalClients: this.clients.size });

      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        clientId,
        message: 'Connected to DB Connector WebSocket Server',
        timestamp: new Date().toISOString()
      });

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (error: any) {
          logger.error('Failed to parse WebSocket message', {
            clientId,
            error: error.message
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info('WebSocket client disconnected', {
          clientId,
          totalClients: this.clients.size
        });
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        logger.error('WebSocket client error', {
          clientId,
          error: error.message
        });
      });
    });

    logger.info('WebSocket server initialized on path: /ws');
  }

  /**
   * Handle messages from clients
   */
  private handleClientMessage(client: WSClient, message: any): void {
    const { type, payload } = message;

    switch (type) {
      case 'subscribe':
        this.handleSubscribe(client, payload);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(client, payload);
        break;

      case 'ping':
        this.sendToClient(client, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      default:
        logger.warn('Unknown message type from client', {
          clientId: client.id,
          type
        });
    }
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(client: WSClient, payload: any): void {
    const { tables } = payload;

    if (!tables || !Array.isArray(tables)) {
      this.sendToClient(client, {
        type: 'error',
        message: 'Invalid subscribe payload. Expected: { tables: string[] }'
      });
      return;
    }

    for (const tableName of tables) {
      client.subscriptions.add(tableName);
    }

    logger.info('Client subscribed to tables', {
      clientId: client.id,
      tables,
      totalSubscriptions: client.subscriptions.size
    });

    this.sendToClient(client, {
      type: 'subscribed',
      tables,
      message: `Subscribed to ${tables.length} table(s)`,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(client: WSClient, payload: any): void {
    const { tables } = payload;

    if (!tables || !Array.isArray(tables)) {
      this.sendToClient(client, {
        type: 'error',
        message: 'Invalid unsubscribe payload. Expected: { tables: string[] }'
      });
      return;
    }

    for (const tableName of tables) {
      client.subscriptions.delete(tableName);
    }

    logger.info('Client unsubscribed from tables', {
      clientId: client.id,
      tables,
      totalSubscriptions: client.subscriptions.size
    });

    this.sendToClient(client, {
      type: 'unsubscribed',
      tables,
      message: `Unsubscribed from ${tables.length} table(s)`,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast a change to all subscribed clients
   */
  broadcastChange(change: ChangeRecord): void {
    let sentCount = 0;

    for (const client of this.clients.values()) {
      // Check if client is subscribed to this table or subscribed to all tables
      if (client.subscriptions.has(change.tableName) || client.subscriptions.has('*')) {
        this.sendToClient(client, {
          type: 'change',
          data: {
            tableName: change.tableName,
            operation: change.operation,
            recordId: change.recordId,
            newData: change.newData,
            oldData: change.oldData,
            timestamp: change.timestamp.toISOString(),
            changeId: change.id
          }
        });
        sentCount++;
      }
    }

    if (sentCount > 0) {
      logger.debug('Broadcasted change to clients', {
        tableName: change.tableName,
        operation: change.operation,
        clientCount: sentCount
      });
    }
  }

  /**
   * Broadcast multiple changes in batch
   */
  broadcastBatchChanges(changes: ChangeRecord[]): void {
    if (changes.length === 0) return;

    // Group changes by table
    const changesByTable = new Map<string, ChangeRecord[]>();
    for (const change of changes) {
      const existing = changesByTable.get(change.tableName) || [];
      existing.push(change);
      changesByTable.set(change.tableName, existing);
    }

    for (const client of this.clients.values()) {
      const relevantChanges: ChangeRecord[] = [];

      // Collect all relevant changes for this client
      for (const [tableName, tableChanges] of changesByTable) {
        if (client.subscriptions.has(tableName) || client.subscriptions.has('*')) {
          relevantChanges.push(...tableChanges);
        }
      }

      if (relevantChanges.length > 0) {
        this.sendToClient(client, {
          type: 'batch_changes',
          data: {
            changes: relevantChanges.map(c => ({
              tableName: c.tableName,
              operation: c.operation,
              recordId: c.recordId,
              newData: c.newData,
              oldData: c.oldData,
              timestamp: c.timestamp.toISOString(),
              changeId: c.id
            })),
            count: relevantChanges.length
          }
        });
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(client: WSClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error: any) {
        logger.error('Failed to send message to client', {
          clientId: client.id,
          error: error.message
        });
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(data);
        } catch (error: any) {
          logger.error('Failed to broadcast to client', {
            clientId: client.id,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close all connections and shutdown
   */
  shutdown(): void {
    logger.info('Shutting down WebSocket server', { clientCount: this.clients.size });

    for (const client of this.clients.values()) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch (error: any) {
        logger.error('Error closing client connection', {
          clientId: client.id,
          error: error.message
        });
      }
    }

    this.clients.clear();
    this.wss.close();
  }
}
