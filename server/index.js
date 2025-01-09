const clients = new Set();

const broadcastAudio = (data, sender) => {
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
};

Bun.serve({
  port: 8080,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return; // Return if upgrade successful
    }
    return new Response('Upgrade failed', { status: 400 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log('Client connected');
      console.log(`Total connected clients: ${clients.size}`);

      // Setup ping interval for this client
      ws.pinger = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 30000);
    },
    message(ws, data) {
      if (data instanceof ArrayBuffer) {
        broadcastAudio(data, ws);
      } else {
        console.log('Received non-binary data, skipping');
      }
    },
    close(ws) {
      clients.delete(ws);
      clearInterval(ws.pinger);
      console.log('Client disconnected');
      console.log(`Remaining clients: ${clients.size}`);
    },
    error(ws, error) {
      console.error('WebSocket error:', error);
      clients.delete(ws);
      clearInterval(ws.pinger);
    },
  },
});

console.log(`WebSocket server started on port http://localhost:8080`);
