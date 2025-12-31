// routes/orderRoutes.js
import express from "express";
import {
  getProducts,
  getProductById,
  addProduct,
  createOrder,
  getOrdersCount,
  getMyOrders,
  getOrderById,
} from "../controllers/orderController.js";
import { isAuthenticated } from "../middleware/auth.js";

const router = express.Router();

/* PRODUCT ROUTES */
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.post("/products", addProduct);
/* ORDER ROUTES */
router.post("/postorders", isAuthenticated, createOrder);        //Create new order
router.get("/my", isAuthenticated, getMyOrders); //Get all user's orders
router.get("/count", getOrdersCount);
router.get("/:id", isAuthenticated, getOrderById);


export default router;
