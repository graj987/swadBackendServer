import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://swadbest.com",
    "https://www.swadbest.com",
    "https://swadbestadminpannel.onrender.com"
  ],
  credentials: true,
}));

app.use(express.json({ limit: "10kb" }));

/* ================= RATE LIMIT ================= */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

app.use("/api", apiLimiter);
app.use("/api/payments", paymentLimiter);

/* ================= SOCKET.IO ================= */

export const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://swadbest.com",
      "https://www.swadbest.com",
      "https://swadbestadminpannel.onrender.com"
    ],
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
