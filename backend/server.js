import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.js";
import reportRoutes from "./routes/reports.js";
import aiRoutes from "./routes/aiAnalysis.js";
import graphRoutes from "./routes/graph.js";
import analyticsRoutes from "./routes/analytics.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*", credentials: true },
});

// Make io available to route handlers (e.g. to push real-time fraud alerts)
app.set("io", io);

// Optional horizontal-scaling path: if REDIS_URL is set, attach the Redis
// adapter so fraud-alert broadcasts fan out correctly across multiple
// backend instances behind a load balancer (each instance otherwise only
// knows about sockets connected to itself). Entirely optional — the app
// runs single-instance with the in-memory adapter if this isn't configured
// or Redis isn't reachable, which is expected for local/demo use.
if (process.env.REDIS_URL) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("Socket.IO Redis adapter connected — ready for multi-instance scaling");
    })
    .catch((err) => {
      console.warn("Redis adapter unavailable, falling back to single-instance Socket.IO:", err.message);
    });
}

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Global rate limit — tighten per-route (esp. /api/ai) in production
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "citizen-fraud-shield-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/analytics", analyticsRoutes);

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

io.on("connection", (socket) => {
  // Officers/analysts join a room to receive live fraud alerts
  socket.on("join-room", (role) => socket.join(role));
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`API listening on :${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed", err);
    process.exit(1);
  });
