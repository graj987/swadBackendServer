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
} from "../controllers/usersController.js";

import { protect } from "../middleware/auth.js";            // ✅ correct user auth
import { protectAdmin } from "../middleware/adminMiddleware.js"; // admin auth

import multer from "multer";

const upload = multer({ dest: "uploads/" });

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, upload.single("avatar"), updateUserProfile);

// ADMIN ONLY
router.get("/", protectAdmin, getAllUsers);
router.get("/:id", protectAdmin, getUserById);
router.delete("/:id", protectAdmin, deleteUserById);
router.get("/count", getUsersCount);

export default router;
