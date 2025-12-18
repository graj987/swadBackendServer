import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";

export const isAuthenticated = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;

    // 1️⃣ Check header
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No token provided",
      });
    }

    // 2️⃣ Extract token
    const token = auth.split(" ")[1];

    // 3️⃣ Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Invalid or expired token",
      });
    }

    // 4️⃣ Find user
    const user = await User.findById(decoded.id).select("_id role email");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User not found",
      });
    }

    // 5️⃣ ATTACH USER (🔥 FIX)
    req.user = {
      id: user._id,
      role: user.role || "user",
      email: user.email,
    };

    // 🔥 THIS LINE FIXES YOUR CHECKOUT / ORDER ISSUE
    req.userId = user._id;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};
