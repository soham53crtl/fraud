import { io } from "socket.io-client";

// The backend serves Socket.IO from the same host as the REST API, one
// level up from the /api prefix (see backend/server.js).
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_BASE = API_BASE.replace(/\/api\/?$/, "");

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_BASE, { autoConnect: false, transports: ["websocket", "polling"] });
  }
  return socket;
}

// Investigators (police_officer / cyber_analyst) join their role room to
// receive fraud-alert broadcasts pushed from POST /api/reports.
export function connectAndJoin(role) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit("join-room", role);
  return s;
}

export function disconnectSocket() {
  if (socket && socket.connected) socket.disconnect();
}
