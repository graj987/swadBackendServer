import express from "express";
import multer from "multer";
import {
  registerUser,
  loginUser,
  logoutUser,
  verification,
  forgotPassword,
  verifyOTP,
  resetPassword,
  resendOTP,
  refreshToken,
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  changePassword,
} from "../controllers/usersController.js";

import { isAuthenticated } from "../middleware/auth.js";

import { userSchema, validateUser } from "../validators/userValidate.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),     // required for cloudinary upload_stream
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});
/* ================= AUTH ================= */

// Register
router.post(
  "/register",
  validateUser(userSchema),
  registerUser
);

// Email verification (Bearer token)
router.get("/verify", verification);

// Login / Logout
router.post("/login", loginUser);
router.post("/logout", isAuthenticated, logoutUser);

/* ================= PASSWORD RESET (INDUSTRY FLOW) ================= */

// 1️⃣ Send OTP
router.post("/forgot-password", forgotPassword);

// 2️⃣ Verify OTP → get resetToken
router.post("/verify-otp", verifyOTP);
// 2b. Resend OTP
router.post("/resend-otp", resendOTP);

// 3️⃣ Reset password (token-based)
router.post("/reset-password", resetPassword);
// Authorization: Bearer <resetToken>

router.post("/refresh", refreshToken);
router.post("/change-password", changePassword);
/* ================= USER PROFILE ================= */

router.get("/profile", isAuthenticated, getUserProfile);
router.post(
  "/upload-avatar",
  isAuthenticated,
  upload.single("image"),
  uploadAvatar
);

router.put(
  "/profile",
  isAuthenticated,
  updateUserProfile 
);



export default router;
