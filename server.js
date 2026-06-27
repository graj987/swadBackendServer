import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { Server } from "socket.io";

dotenv.config();

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
import brandRoutes from "./routes/brandRoutes.js";
import offerRoutes from "./routes/offerRoutes.js";
import Offer from "./models/offer.js";
import adminBlogRoutes from "./routes/adminBlogRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import { webhookHandler } from "./controllers/paymentController.js";

connectDB();

const app = express();
app.set("trust proxy", 1); // IMPORTANT for Render

/* ================= HTTP SERVER ================= */
const server = http.createServer(app);

/* ================= SECURITY ================= */

app.use(helmet());
app.use(compression());

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Always allow production domains; dev origins come from env
const CORS_ORIGINS = [
  "https://swadbest.com",
  "https://www.swadbest.com",
  "https://swadbestadminpannel.onrender.com",
  "http://localhost:5173",
  ...allowedOrigins,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "50kb" }));

/* ================= RATE LIMIT ================= */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/users/forgot-password", authLimiter);
app.use("/api/payments", paymentLimiter);

/* ================= SOCKET.IO ================= */

export const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🔔 Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Admin disconnected:", socket.id);
  });
});

/* ================= HEALTH ================= */

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "SwadBest API",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
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
app.use("/api/admin/notification", notificationadmin);
app.use("/api/offers", offerRoutes);
app.use("/api/instagram", brandRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/admin/blogs", adminBlogRoutes);

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler
);
/* ================= ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error("Global Error:", err);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});


setInterval(async () => {
  try {
    const now = new Date();
    await Offer.updateMany(
      { endTime: { $lt: now }, isActive: true },
      { isActive: false }
    );
  } catch (err) {
    console.error("Offer auto-expire error:", err);
  }
}, 60 * 1000);


const PORT = process.env.PORT || 5000;

server.listen(PORT, () =>
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`)
);
