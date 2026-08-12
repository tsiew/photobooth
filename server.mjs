import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT || 8080);
const wss = new WebSocketServer({ port });
const rooms = new Map();

function broadcast(room, message, except) {
  for (const client of rooms.get(room) || []) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }
}

wss.on("connection", (socket) => {
  let currentRoom = "";
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "join") {
        currentRoom = String(message.room || "").toUpperCase();
        if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
        const members = rooms.get(currentRoom);
        if (members.size >= 2) return socket.send(JSON.stringify({ type: "room-full" }));
        members.add(socket);
       if (members.size === 2) {
  broadcast(
    currentRoom,
    { type: "peer-ready", from: "server" },
    socket
  );
}
      if (currentRoom) broadcast(currentRoom, message, socket);
    } catch { socket.send(JSON.stringify({ type: "error", message: "Invalid message" })); }
  });
  socket.on("close", () => {
    if (!currentRoom) return;
    rooms.get(currentRoom)?.delete(socket);
    broadcast(currentRoom, { type: "peer-left", from: "server" });
    if (!rooms.get(currentRoom)?.size) rooms.delete(currentRoom);
  });
});

console.log(`Sweetframe signaling server is listening on ws://localhost:${port}`);
