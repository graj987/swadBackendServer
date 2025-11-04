import express from "express";
import {
  registerAdmin,
  loginAdmin,
  getAllOrders,
  addProduct,
  deleteProduct,
} from "../controllers/adminController.js";
import { protectAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public routes (you can disable register later)
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);

// Protected routes
router.get("/orders", protectAdmin, getAllOrders);
router.post("/product", protectAdmin, addProduct);
router.delete("/product/:id", protectAdmin, deleteProduct);

export default router;
