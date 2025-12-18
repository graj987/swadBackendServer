import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  verification,
  forgotPassword,
  verifyOTP,
  resetPassword,
  getUserProfile,
  updateUserProfile,
} from "../controllers/usersController.js";

import { isAuthenticated } from "../middleware/auth.js";

import multer from "multer";
import { userSchema, validateUser } from "../validators/userValidate.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/* ================= AUTH ================= */

// Register
router.post(
  "/register",
  validateUser(userSchema),
  registerUser
);

// Email verification (Bearer token)
router.post("/verify", verification);

// Login / Logout
router.post("/login", loginUser);
router.post("/logout", isAuthenticated, logoutUser);

/* ================= PASSWORD RESET (INDUSTRY FLOW) ================= */

// 1️⃣ Send OTP
router.post("/forgot-password", forgotPassword);

// 2️⃣ Verify OTP → get resetToken
router.post("/verify-otp", verifyOTP); 
// email + otp in BODY (NOT URL)

// 3️⃣ Reset password (token-based)
router.post("/reset-password", resetPassword);
// Authorization: Bearer <resetToken>

router.post("/change-password", resetPassword);
/* ================= USER PROFILE ================= */

router.get("/profile", isAuthenticated, getUserProfile);

router.put(
  "/profile",
  isAuthenticated,
  upload.single("avatar"),
  updateUserProfile
);



export default router;
