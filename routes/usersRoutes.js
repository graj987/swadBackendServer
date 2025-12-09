import express from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  deleteUserById,
  getUserById,
  getUsersCount,
  verification,
  logoutUser,
  forgotPassword,
  verifyOTP,
  changePassword,
} from "../controllers/usersController.js";



import { isAuthenticated } from "../middleware/auth.js";            // ✅ correct user auth
import { protectAdmin } from "../middleware/adminMiddleware.js"; // admin auth

import multer from "multer";
import { userSchema, validateUser } from "../validators/userValidate.js";

const upload = multer({ dest: "uploads/" });

const router = express.Router();


// Auth
router.post("/register",validateUser(userSchema), registerUser);
router.post("/verify", verification);
router.post("/login", loginUser);
router.post("/logout", isAuthenticated, logoutUser);
router.post("/forgot-password",forgotPassword); 
router.post("/verify_otp/:email",verifyOTP)
router.post("/change-password/:email",changePassword)

// User profile
router.get("/profile", isAuthenticated, getUserProfile);
router.put("/profile", isAuthenticated, upload.single("avatar"), updateUserProfile);

// ADMIN ONLY
router.get("/", protectAdmin, getAllUsers);
router.get("/count", protectAdmin, getUsersCount);
router.get("/:id", protectAdmin, getUserById);
router.delete("/:id", protectAdmin, deleteUserById);

export default router;
