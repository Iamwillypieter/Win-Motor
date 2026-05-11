/**
 * SSEManager — singleton that manages Server-Sent Events clients.
 *
 * Each connected client is stored with:
 *   - userId: string
 *   - role: string (CASHIER | WAREHOUSE | OWNER)
 *   - controller: ReadableStreamDefaultController
 *   - heartbeatInterval: NodeJS.Timeout
 *
 * Safe for single-instance deployment. For multi-instance, replace with
 * Redis Pub/Sub.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;

class SSEManager {
  constructor() {
    /** @type {Map<string, { userId: string, role: string, controller: ReadableStreamDefaultController, heartbeatInterval: ReturnType<typeof setInterval> }>} */
    this.clients = new Map();
  }

  /**
   * Register a new SSE client.
   *
   * @param {string} clientId - Unique ID for this connection (e.g. userId + timestamp)
   * @param {string} userId - Authenticated user's ID
   * @param {string} role - User's role (CASHIER | WAREHOUSE | OWNER)
   * @param {ReadableStreamDefaultController} controller - Stream controller
   */
  register(clientId, userId, role, controller) {
    // Send initial connection confirmation
    try {
      controller.enqueue(
        `data: ${JSON.stringify({ type: "connected", clientId })}\n\n`
      );
    } catch {
      // Controller may already be closed
      return;
    }

    // Set up heartbeat to keep the connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        controller.enqueue(`: heartbeat\n\n`);
      } catch {
        // Connection closed — clean up
        this.unregister(clientId);
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.clients.set(clientId, { userId, role, controller, heartbeatInterval });
  }

  /**
   * Unregister a client and clean up its heartbeat timer.
   *
   * @param {string} clientId
   */
  unregister(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      clearInterval(client.heartbeatInterval);
      this.clients.delete(clientId);
    }
  }

  /**
   * Broadcast an event to all clients that have one of the specified roles.
   *
   * @param {{ type: string, data: unknown }} event
   * @param {string[]} roles - Array of roles to target (e.g. ["WAREHOUSE"])
   */
  broadcastToRole(event, roles) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      if (roles.includes(client.role)) {
        try {
          client.controller.enqueue(payload);
        } catch {
          // Connection closed — clean up stale client
          this.unregister(clientId);
        }
      }
    }
  }

  /**
   * Broadcast an event to a specific user (all their active connections).
   *
   * @param {{ type: string, data: unknown }} event
   * @param {string} userId - Target user's ID
   */
  broadcastToUser(event, userId) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      if (client.userId === userId) {
        try {
          client.controller.enqueue(payload);
        } catch {
          // Connection closed — clean up stale client
          this.unregister(clientId);
        }
      }
    }
  }

  /**
   * Return the number of currently connected clients.
   * @returns {number}
   */
  get clientCount() {
    return this.clients.size;
  }

  /**
   * Return list of unique online users (deduplicated by userId).
   * @returns {Array<{ userId: string, role: string }>}
   */
  getOnlineUsers() {
    const seen = new Map();
    for (const client of this.clients.values()) {
      if (!seen.has(client.userId)) {
        seen.set(client.userId, { userId: client.userId, role: client.role });
      }
    }
    return Array.from(seen.values());
  }
}

// Singleton — reuse across hot-reloads in Next.js dev mode
// Gunakan global object agar tidak hilang saat hot reload
const globalForSSE = globalThis;

if (!globalForSSE._sseManager) {
  globalForSSE._sseManager = new SSEManager();
  console.log("[SSEManager] New instance created");
}

/** @type {SSEManager} */
const sseManager = globalForSSE._sseManager;

export default sseManager;
