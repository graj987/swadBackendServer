import express from "express";
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";

import productRoutes from "./routes/productsRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import shiprocketRoutes from "./routes/shiprocketRoutes.js";
import codRoutes from "./routes/codRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import cartWishlistRoutes from "./routes/cartWishlistRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import notificationadmin from "./routes/adminNotificationRoutes.js";
import { shiprocketWebhook } from "./controllers/shiprocketController.js";

connectDB();

const app = express();

/* ================= HTTP SERVER ================= */
const server = http.createServer(app);

/* ================= SOCKET.IO ================= */
export const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",        // local frontend
      "https://swadbest.com"          // production frontend
    ],
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("🔔 Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Admin disconnected:", socket.id);
  });
});

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.json({ message: "API running..." });
});

/* ================= ROUTES ================= */
app.use("/api/users", usersRoutes);
app.use("/api/products", productRoutes);
app.use("/api/address", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/shiprocket", shiprocketRoutes);
app.use("/api/cod", codRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/cart", cartWishlistRoutes);
app.use("/api/admin/notification", notificationadmin );

/* ================= SHIPROCKET WEBHOOK ================= */
app.post(
  "/api/shiprocket/webhook",
  express.raw({ type: "application/json" }),
  shiprocketWebhook
);

/* ================= ERROR HANDLER ================= */
app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`)
);
