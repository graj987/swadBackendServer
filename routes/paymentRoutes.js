// routes/paymentRoutes.js
import express from "express";
import { createRazorpayOrder, verifyPayment, webhookHandler } from "../controllers/paymentController.js";

const router = express.Router();


router.post("/create-order", createRazorpayOrder);
router.post("/verify", express.json(), verifyPayment);
router.post("/webhook", express.raw({ type: "application/json" }), webhookHandler);

export default router;
