// middleware/protectAdmin.js
import jwt from "jsonwebtoken";
import Admin from "../models/admin.js";

export const protectAdmin = async (req, res, next) => {
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
      console.error("JWT verify error:", err);
      return res.status(401).json({ message: "Not authorized, token invalid" });
    }

    const admin = await Admin.findById(decoded.id).select("-password");

    if (!admin) {
      return res.status(401).json({ message: "Not authorized, not an admin" });
    }

    req.admin = admin;
    return next();
  } catch (err) {
    console.error("protectAdmin error:", err);
    return res.status(500).json({ message: "Auth error", error: err.message });
  }
};
