import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import { Session } from "../models/sessionModel.js";
import { verifyMail } from "./emailVerify/verifyMail.js";
import { sendOtpEmail } from "./emailVerify/sendOtpMail.js";

/* =====================================================
   HELPERS
===================================================== */
const signToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

/* =====================================================
   REGISTER
===================================================== */
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "All fields required" });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ success: false, message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    const verifyToken = signToken({ id: user._id }, "1d");
    await verifyMail(verifyToken, email);

    user.token = verifyToken;
    await user.save();

    return res.status(201).json({
      success: true,
      message: "Registered successfully. Verify your email.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   EMAIL VERIFICATION
===================================================== */
export const verification = async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ success: false, message: "Token missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isVerified = true;
    user.token = null;
    await user.save();

    return res.json({ success: true, message: "Email verified" });

  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
/* =====================================================
   LOGIN
===================================================== */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email & password required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (!user.isVerified)
      return res.status(403).json({ success: false, message: "Verify email first" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    await Session.deleteMany({ userId: user._id });
    await Session.create({ userId: user._id });

    const accessToken = signToken({ id: user._id }, "1d");
    const refreshToken = signToken({ id: user._id }, "7d");

    user.isLoggedIn = true;
    await user.save();

    return res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================================
   LOGOUT
===================================================== */
export const logoutUser = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    await Session.deleteMany({ userId });
    await User.findByIdAndUpdate(userId, { isLoggedIn: false });

    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================================
   FORGOT PASSWORD (SEND OTP)
===================================================== */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;

    await user.save();
    await sendOtpEmail(otp, email);

    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================================
   VERIFY OTP → ISSUE RESET TOKEN
===================================================== */
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    if (Date.now() > user.otpExpiry)
      return res.status(400).json({ success: false, message: "OTP expired" });

    if (otp !== user.otp)
      return res.status(400).json({ success: false, message: "Wrong OTP" });

    const resetToken = signToken(
      { id: user._id, purpose: "password_reset" },
      "15m"
    );

    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    return res.json({
      success: true,
      resetToken,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================================
   RESET PASSWORD (TOKEN BASED)
===================================================== */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token)
      return res.status(400).json({
        success: false,
        message: "Reset token required",
      });

    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    if (decoded.purpose !== "password_reset")
      return res.status(403).json({
        success: false,
        message: "Invalid reset token",
      });

    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
export const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok)
      return res.status(401).json({ success: false, message: "Current password wrong" });
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: "Weak new password" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================================
   PROFILE
===================================================== */
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await User.findById(userId).select("-password");
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const { name, password } = req.body;
    const user = await User.findById

    (userId);
    if (name) user.name = name;
    if (password && password.length >= 6) {
      user.password = await bcrypt.hash(password, 10);
    }
    await user.save();
    return res.json({ success: true, message: "Profile updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};