import express from "express";
import multer from "multer";

import {
  registerAdmin,
  loginAdmin,
  getAllOrders,
  getAllUsers,
  addProduct,
  deleteProduct,
  getProducts,
  verifyAdmin,
  uploadImage,
  getStats,
  usersCount,
  getProductsCount,
  getOrdersCount,
  getProductById,
  updateProduct,
  updateOrderStatus,
  setHeroProduct,
  getHeroProduct,
  getDashboardData,
 
} from "../controllers/adminController.js";

import { protectAdmin } from "../middleware/adminMiddleware.js";
import { getAdminNotifications } from "../controllers/adminNotificationController.js";


const router = express.Router();

// ------------------- MULTER (Memory Storage for Cloudinary) -------------------
const upload = multer({
  storage: multer.memoryStorage(),     // required for cloudinary upload_stream
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

// ------------------- PUBLIC ROUTES -------------------
// Register is protected — only existing admins can create new admins
router.post("/register", protectAdmin, registerAdmin);
router.post("/login", loginAdmin);

// ------------------- PROTECTED ADMIN ROUTES -------------------
router.get("/verify", protectAdmin, verifyAdmin);

// Orders
router.get("/orders", protectAdmin, getAllOrders);
router.get("/orders/count", protectAdmin, getOrdersCount);

// Users
router.get("/users", protectAdmin, getAllUsers);
router.get("/users/count", protectAdmin, usersCount);

// Stats
router.get("/stats", protectAdmin, getStats);
router.get("/dashboard", protectAdmin, getDashboardData);

// ------------------- PRODUCTS -------------------
router.get("/products", protectAdmin, getProducts);
router.get("/products/count", protectAdmin, getProductsCount);
router.get("/products/:id", protectAdmin, getProductById);
router.put("/products/:id", protectAdmin, updateProduct);
router.put("/hero", protectAdmin, setHeroProduct);
router.get("/hero", protectAdmin, getHeroProduct);
router.get("/notifications", protectAdmin, getAdminNotifications)


router.post(
  "/products",
  protectAdmin,
  upload.single("image"),   // REQUIRED, matches fd.append("image")
  addProduct
);

router.delete("/products/:id", protectAdmin, deleteProduct);

// ------------------- CLOUDINARY IMAGE UPLOAD -------------------
router.post(
  "/upload",
  protectAdmin,
  upload.single("image"), // MUST match the field name
  uploadImage
);

router.put(
  "/orders/:id/status",
  protectAdmin,
  updateOrderStatus
);


export default router;
