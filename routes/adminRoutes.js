import express from "express";
import multer from "multer";
import {
  registerAdmin,
  loginAdmin,
  getAllOrders,
  addProduct,
  deleteProduct,
  getAllUsers,
  getStats,
  usersCount,
  getProducts,
  getProductsCount,
  getOrdersCount,
  verifyAdmin,
  uploadImage,
} from "../controllers/adminController.js";
import { protectAdmin } from "../middleware/adminMiddleware.js";
import { protectSign } from "../middleware/signProtectMiddleware.js";

const router = express.Router();
const upload = multer();

// Public routes (you can disable register later)
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);

// Protected routes
router.get("/orders", protectAdmin, getAllOrders);
router.get("/orders/count", protectAdmin, getOrdersCount);
router.get("/stats", protectAdmin, getStats);  
router.get("/users", protectAdmin, getAllUsers);
router.get("/users/count", protectAdmin, usersCount);

router.post("/product", protectAdmin, addProduct);
router.delete("/product/:id", protectAdmin, deleteProduct);
router.get("/product", protectAdmin, getProducts);
router.get("/products/count", protectAdmin, getProductsCount);

router.get("/verify", verifyAdmin);
router.post("/upload", protectSign, upload.single("file"), uploadImage);

export default router;
