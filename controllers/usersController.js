import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import { Session } from "../models/sessionModel.js";
import { verifyMail } from "./emailVerify/verifyMail.js";
import { sendOtpEmail } from "./emailVerify/sendOtpMail.js";
import {
  sendWelcomeEmail,
  sendLoginNotification,
  sendPasswordChangedEmail,
} from "./emailVerify/emailServices.js";
import cloudinary from "cloudinary";
import streamifier from "streamifier";
import Notification from "../models/notification.js"
import { io } from "../server.js";


cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file buffer to cloudinary
const uploadBufferToCloudinary = (buffer, folder = "products") =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
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

    const notification = await Notification.create({
      type: "user",
      title: "New User",
      message: `${user.name} just registered`,
      link: `/admin/users`,
    });

    io.emit("admin-notification", notification);

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

    await sendWelcomeEmail(user.email, user.name).catch((e) =>
      console.error("Welcome email failed:", e.message)
    );
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

    // Reset active sessions
    await Session.deleteMany({ userId: user._id });
    await Session.create({ userId: user._id });

    const accessToken = signToken({ id: user._id }, "1d");
    const refreshToken = signToken({ id: user._id }, "7d");

    user.isLoggedIn = true;
    await user.save();

    sendLoginNotification(user.email, user.name).catch((e) =>
      console.error("Login notification email failed:", e.message)
    );

    return res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,

        // ✔ IMPORTANT FOR CHECKOUT PAGE
        codEligible: user.codEligible,
        deliveredCount: user.deliveredCount,
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
    await sendPasswordChangedEmail(user.email, user.name);

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
/* =====================================================
   RESEND OTP (same flow as forgot-password)
===================================================== */
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, message: "Email required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(200).json({ success: true, message: "If the email exists, an OTP was sent" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendOtpEmail(otp, email).catch((e) =>
      console.error("OTP email failed:", e.message)
    );

    return res.json({ success: true, message: "OTP resent" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   REFRESH TOKEN
===================================================== */
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token)
      return res.status(400).json({ success: false, message: "Refresh token required" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }

    const user = await User.findById(decoded.id).select("_id isBlocked");
    if (!user || user.isBlocked)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const accessToken = signToken({ id: user._id }, "1d");
    return res.json({ success: true, accessToken });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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


export const uploadAvatar = async (req, res) => {
  try {
    /* ================= VALIDATION ================= */
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Only image files are allowed",
      });
    }

    /* ================= FIND USER ================= */
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /* ================= DELETE OLD AVATAR ================= */
    if (user.avatar) {
      try {
        const publicId = user.avatar
          .split("/")
          .pop()
          .split(".")[0];

        await cloudinary.uploader.destroy(`avatars/${publicId}`);
      } catch (err) {
        console.warn("Failed to delete old avatar:", err.message);
      }
    }

    /* ================= UPLOAD NEW AVATAR ================= */
    const uploadResult = await uploadBufferToCloudinary(
      req.file.buffer,
      "avatars"
    );

    /* ================= SAVE ================= */
    user.avatar = uploadResult.secure_url;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Avatar updated successfully",
      url: uploadResult.secure_url,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({
      success: false,
      message: "Avatar upload failed",
    });
  }
};


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
    const { name, phone, avatar } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update allowed fields only
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (avatar) user.avatar = avatar;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

