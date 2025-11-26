// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export const protect = async (req, res, next) => {
  console.log("AUTH HEADER:", req.headers.authorization);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Distinguish expired token vs other JWT errors
      if (err.name === "TokenExpiredError") {
        console.warn("JWT verify failed (user): TokenExpiredError", err.expiredAt);
        return res.status(401).json({ message: "TokenExpiredError: jwt expired", expiredAt: err.expiredAt });
      }
      console.error("JWT verify failed (user):", err);
      return res.status(401).json({ message: "Not authorized, invalid token" });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error("protect (user) middleware error:", err);
    return res.status(500).json({ message: "Auth error", error: err.message });
  }

};
