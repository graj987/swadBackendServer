import express from "express";
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import connectDB from "./config/db.js";

import productRoutes from "./routes/productsRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import shiprocketRoutes from "./routes/shiprocketRoutes.js";
import codRoutes from "./routes/codRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import cartWishlistRoutes from "./routes/cartWishlistRoutes.js"
import { shiprocketWebhook } from "./controllers/shiprocketController.js";
import addressRoutes from "./routes/addressRoutes.js";


connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health check route (optional but useful)
app.get("/", (req, res) => {
  res.json({ message: "API running..." });
});

// API Routes
app.use("/api/users", usersRoutes);         // ⭐ ALL Auth + OTP + Profile
app.use("/api/products", productRoutes);  
app.use("/api/address",addressRoutes)  // Products
app.use("/api/orders", orderRoutes);        // Orders
app.use("/api/admin", adminRoutes);         // Admin operations
app.use("/api/payments", paymentRoutes);    // Payment gateway routes
app.use("/api/shiprocket", shiprocketRoutes);
app.use("/api/cod", codRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/cart",cartWishlistRoutes)   ;     // Orders
app.post("/api/shiprocket/webhook", 
  express.raw({ type: "application/json" }), 
  shiprocketWebhook
);



// Global error handler (optional but recommended)
app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
