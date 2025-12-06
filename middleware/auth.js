// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export const protect = async (req, res, next) => {
  try {
    // quick sanity: ensure secret exists
    if (!process.env.JWT_SECRET) {
      console.error("protect middleware: missing JWT_SECRET");
      return res.status(500).json({ message: "Server misconfigured" });
    }

    // Accept token from Authorization header (Bearer) OR cookie named 'token' (optional)
    const rawAuth = req.headers?.authorization || "";
    const headerToken = typeof rawAuth === "string" ? rawAuth.trim() : "";
    let token = null;

    if (headerToken && headerToken.toLowerCase().startsWith("bearer ")) {
      token = headerToken.split(" ")[1].trim();
    } else if (req.cookies && req.cookies.token) {
      // optional: requires cookie-parser middleware
      token = String(req.cookies.token).trim();
    }

    if (!token) {
      // don't leak internals — a simple message is enough
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        console.warn("JWT expired for token:", err.expiredAt);
        return res.status(401).json({ message: "Token expired" });
      }
      console.warn("JWT verify failed:", err && err.name ? err.name : err);
      return res.status(401).json({ message: "Not authorized, invalid token" });
    }

    // Validate decoded payload
    if (!decoded || !decoded.id) {
      return res.status(401).json({ message: "Not authorized, invalid token payload" });
    }

    // Fetch user (omit password). Select only needed fields if you want.
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    // Attach minimal info to request for downstream handlers
    req.user = user;
    // Optionally attach id only if you prefer: req.userId = user._id;

    return next();
  } catch (err) {
    console.error("protect middleware error:", err);
    return res.status(500).json({ message: "Authentication error" });
  }
};
