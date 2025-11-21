// routes/orderRoutes.js
import express from "express";
import {
  getProducts,
  getProductById,
  addProduct,
  createOrder,
  getOrdersByUser,
} from "../controllers/orderController.js";

const router = express.Router();

/* PRODUCT ROUTES */
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.post("/products", addProduct);

/* ORDER ROUTES */
router.post("/orders", createOrder);         // Create new order
router.get("/orders/user/:userId", getOrdersByUser);  // Get all user's orders

export default router;
