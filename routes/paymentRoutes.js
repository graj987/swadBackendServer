// routes/paymentRoutes.js
import express from "express";
import { createRazorpayOrder, paymentSuccess, verifyPayment, webhookHandler } from "../controllers/paymentController.js";
import { isAuthenticated } from "../middleware/auth.js";

const router = express.Router();


router.post("/create-order", isAuthenticated, createRazorpayOrder);
router.post("/verify", isAuthenticated, verifyPayment);
router.post("/webhook", express.raw({ type: "application/json" }), webhookHandler);
router.get("/success/:orderId", paymentSuccess);

export default router;
