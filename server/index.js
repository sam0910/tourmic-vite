import { WebSocketServer } from "ws";
import os from "os";

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (let iface of Object.values(interfaces)) {
        for (let addr of iface) {
            if (addr.family === "IPv4" && !addr.internal) {
                return addr.address;
            }
        }
    }
    return "127.0.0.1"; // Fallback to localhost
}

const IP = getLocalIP();

const wss = new WebSocketServer({
    port: 8080,
    perMessageDeflate: false, // Disable compression for audio streaming
    clientTracking: true, // Add this
});

const broadcastAudio = (data, sender) => {
    wss.clients.forEach((client) => {
        if (client !== sender && client.readyState === 1) {
            client.send(data);
        }
    });
};

wss.on("connection", (ws, req) => {
    console.log(`Client connected from ${req.socket.remoteAddress}`);
    console.log(`Total connected clients: ${wss.clients.size}`);

    // Add ping/pong for connection stability
    ws.isAlive = true;
    ws.on("pong", () => {
        ws.isAlive = true;
    });

    ws.binaryType = "arraybuffer"; // Changed from nodebuffer

    ws.on("message", (data, isBinary) => {
        if (!isBinary) {
            console.log("Received non-binary data, skipping");
            return;
        }
        // Forward the raw PCM data directly
        console.log("Broadcasting PCM chunk:", data.byteLength, "bytes");
        broadcastAudio(data, ws);
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });

    ws.on("close", () => {
        console.log("Client disconnected");
        console.log(`Remaining clients: ${wss.clients.size}`);
    });
});

// Add heartbeat to detect stale connections
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on("close", () => {
    clearInterval(interval);
});
//
console.log(`WebSocket server started on port http://${IP}:8080`);
