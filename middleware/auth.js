import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";

export const isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch full user fields needed for verification + COD eligibility
    const user = await User.findById(decoded.id).select(
      "_id role email status isBlocked codEligible deliveredCount"
    );

    if (!user || user.isBlocked || user.status === "deleted") {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Attach minimal needed data for controllers
    req.user = {
      id: user._id.toString(),
      role: user.role || "user",
      email: user.email,
      codEligible: user.codEligible,
      deliveredCount: user.deliveredCount,
    };

    req.userId = user._id.toString();

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
