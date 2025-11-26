// middleware/adminMiddleware.js
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/admin.js"; // keep your model as-is (make sure model file uses mongoose.models.Model || mongoose.model(...))

export const protectAdmin = async (req, res, next) => {
  try {
    // 1) ensure DB is connected
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (mongoose.connection.readyState !== 1) {
      console.error("protectAdmin: DB not ready (readyState=", mongoose.connection.readyState, ")");
      return res.status(503).json({ message: "Service unavailable: database not connected" });
    }

    // 2) grab and validate Authorization header
    const rawAuth = req.headers.authorization || req.headers.Authorization;
    if (!rawAuth || typeof rawAuth !== "string") {
      return res.status(401).json({ message: "Not authorized, no token provided" });
    }

    // Accept only: "Bearer <token>"
    const parts = rawAuth.split(" ");
    if (parts.length !== 2 || parts[0].trim() !== "Bearer") {
      // common broken forms: "Bearerundefined", '"Bearer token"', "Bearer: token", object headers
      console.error("protectAdmin: malformed Authorization header:", rawAuth);
      return res.status(401).json({ message: "Not authorized, malformed token" });
    }

    const token = parts[1].trim();
    if (!token) {
      return res.status(401).json({ message: "Not authorized, empty token" });
    }

    // 3) verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("protectAdmin: JWT verification failed:", err && err.message);
      if (err && err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(401).json({ message: "Not authorized, invalid token" });
    }

    // 4) support multiple token payload shapes
    const adminId = decoded.id || decoded._id || decoded.adminId;
    if (!adminId) {
      console.error("protectAdmin: token missing admin id payload:", decoded);
      return res.status(401).json({ message: "Not authorized, invalid token payload" });
    }

    // 5) fetch admin record (exclude password)
    const admin = await Admin.findById(adminId).select("-password").lean();
    if (!admin) {
      console.error("protectAdmin: admin not found for id:", adminId);
      return res.status(401).json({ message: "Not authorized, admin not found" });
    }

    // attach and continue
    req.admin = admin;
    return next();
  } catch (err) {
    // unexpected
    console.error("protectAdmin error:", err && err.message, err);
    return res.status(500).json({ message: "Auth middleware error", error: err?.message || "unknown" });
  }
};

export default protectAdmin;
