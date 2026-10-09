import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth.js";

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// Demo users - log in as either to test chat in two windows.
const USERS = [
  { userId: 1, name: "Ada", email: "ada@threadbase.dev", password: "password" },
  { userId: 2, name: "Linus", email: "linus@threadbase.dev", password: "password" },
];

// POST /auth/login -> { accessToken, user }
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const found = USERS.find((u) => u.email === email && u.password === password);
  if (!found) return res.status(401).json({ error: "Invalid credentials" });

  const JWT_SECRET = process.env.JWT_SECRET || "threadbase_dev_secret_change_in_production";
  const accessToken = jwt.sign(
    { userId: found.userId, name: found.name },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ accessToken, user: { userId: found.userId, name: found.name } });
});

// A normal protected route (unchanged, uses the HTTP verifyToken).
app.get("/api/me", verifyToken, (req, res) => res.json({ user: req.user }));

// Task 1: Wrap Express app with HTTP server and attach Socket.io with CORS
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", credentials: true },
});

// Task 2: JWT authentication middleware for sockets
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("No token provided"));
  try {
    const JWT_SECRET = process.env.JWT_SECRET || "threadbase_dev_secret_change_in_production";
    const payload = jwt.verify(token, JWT_SECRET);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// Task 3: Rooms and broadcasting
io.on("connection", (socket) => {
  socket.on("room:join", (roomId) => {
    socket.join(roomId);
  });

  socket.on("chat:message", ({ roomId, text }) => {
    const message = {
      id: crypto.randomUUID(),
      text,
      user: socket.data.user?.name,
      timestamp: Date.now(),
      at: Date.now(),
    };
    io.to(roomId).emit("chat:message", message);
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
  console.log("  POST /auth/login");
  console.log("  Socket.io: live chat enabled");
});

