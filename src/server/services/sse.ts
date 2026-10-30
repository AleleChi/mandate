import { Response } from 'express';

export interface SSEClient {
  id: string;
  userId: string;
  role: string;
  res: Response;
}

let clients: SSEClient[] = [];

export function getSSEClients(): SSEClient[] {
  return [...clients];
}

export function clearSSEClientsForTest() {
  clients = [];
}

export function addSSEClient(userId: string, role: string, res: Response): string {
  const id = Math.random().toString(36).substring(2, 9);
  
  // Set headers for SSE stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevent Nginx buffering
  });

  // Prevent connection timeouts
  res.write(': sse-connection-open\n\n');

  const client: SSEClient = { id, userId, role, res };
  clients.push(client);

  console.log(`[SSE] Client ${id} connected (User: ${userId}, Role: ${role}). Total: ${clients.length}`);

  // Send an initial handshake event
  res.write(`data: ${JSON.stringify({ type: 'handshake', clientId: id })}\n\n`);

  res.on('close', () => {
    clients = clients.filter(c => c.id !== id);
    console.log(`[SSE] Client ${id} disconnected. Total: ${clients.length}`);
  });

  return id;
}

export function broadcastSSEEvent(type: string, data: any) {
  console.log(`[SSE] Broadcasting event of type "${type}" to ${clients.length} active clients.`);
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  clients.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error(`[SSE] Error writing to client ${client.id}:`, err);
    }
  });
}

/**
 * Emit event strictly to a specific user ID
 */
export function emitSSEEventToUser(userId: string, type: string, data: any) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  const targets = clients.filter(c => c.userId === userId);
  targets.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error(`[SSE] Error writing to user ${userId} (client ${client.id}):`, err);
    }
  });
}

/**
 * Emit event strictly to a list of user IDs
 */
export function emitSSEEventToUsers(userIds: string[], type: string, data: any) {
  const userSet = new Set(userIds);
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  const targets = clients.filter(c => userSet.has(c.userId));
  targets.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error(`[SSE] Error writing to user ${client.userId} (client ${client.id}):`, err);
    }
  });
}

/**
 * Emit event strictly to users with specific roles
 */
export function emitSSEEventToRoles(roles: string[], type: string, data: any) {
  const roleSet = new Set(roles);
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  const targets = clients.filter(c => roleSet.has(c.role));
  targets.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error(`[SSE] Error writing to role ${client.role} (client ${client.id}):`, err);
    }
  });
}

/**
 * Emit announcement event strictly to audience members + admins
 */
export function emitSSEEventToAudience(audienceType: string, type: string, data: any, targetUserId?: string | null) {
  const adminRoles = new Set(['admin', 'super_admin']);
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });

  clients.forEach(client => {
    let shouldDeliver = false;

    if (adminRoles.has(client.role)) {
      shouldDeliver = true;
    } else if (audienceType === 'everyone') {
      shouldDeliver = client.role === 'parent' || client.role === 'volunteer';
    } else if (audienceType === 'all_parents') {
      shouldDeliver = client.role === 'parent';
    } else if (audienceType === 'all_volunteers') {
      shouldDeliver = client.role === 'volunteer';
    } else if (audienceType === 'selected_parent') {
      shouldDeliver = client.role === 'parent' && Boolean(targetUserId && client.userId === targetUserId);
    } else if (audienceType === 'selected_volunteer') {
      shouldDeliver = client.role === 'volunteer' && Boolean(targetUserId && client.userId === targetUserId);
    }

    if (shouldDeliver) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.error(`[SSE] Error writing audience event to client ${client.id}:`, err);
      }
    }
  });
}

// Keep-alive heartbeat every 15 seconds
setInterval(() => {
  clients.forEach(client => {
    try {
      client.res.write(': keep-alive\n\n');
    } catch (_) {}
  });
}, 15000);
