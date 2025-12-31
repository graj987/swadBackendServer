import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";

export const isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // No token
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    // Verify
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch user
    const user = await User.findById(decoded.id).select("_id role email status isBlocked");

    if (!user || user.isBlocked || user.status === "deleted") {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Attach to req
    req.user = {
      id: user._id.toString(),
      role: user.role || "user",
      email: user.email
    };

    req.userId = user._id.toString();

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
