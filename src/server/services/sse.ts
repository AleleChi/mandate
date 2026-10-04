import { Response } from 'express';

interface SSEClient {
  id: string;
  userId: string;
  role: string;
  res: Response;
}

let clients: SSEClient[] = [];

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

// Keep-alive heartbeat every 15 seconds
setInterval(() => {
  clients.forEach(client => {
    try {
      client.res.write(': keep-alive\n\n');
    } catch (_) {}
  });
}, 15000);
