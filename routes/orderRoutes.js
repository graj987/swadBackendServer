// routes/orderRoutes.js
import express from "express";
import {

  createOrder,
  getOrdersCount,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  checkStock,
  generateInvoice,
} from "../controllers/orderController.js";
import { isAuthenticated } from "../middleware/auth.js";
import { getPricePreview } from "../controllers/pricePreviewController.js";

const router = express.Router();

/* ORDER ROUTES */
router.post("/postorders", isAuthenticated, createOrder);        //Create new order
router.get("/my", isAuthenticated, getMyOrders); //Get all user's orders
router.get("/count", getOrdersCount);
router.get("/:id", isAuthenticated, getOrderById);
//make route to cange order
router.put("/update/:id", isAuthenticated, updateOrderStatus);
router.put("/cancel/:id", isAuthenticated, cancelOrder);
router.post("/price-preview", isAuthenticated, getPricePreview);
router.post("/check-stock", isAuthenticated, checkStock);
router.get(
  "/:orderId/invoice",
  isAuthenticated,
  generateInvoice
); 


export default router;
