import express from "express";
import { 
  createShiprocketOrder, 
  generateAWB, 
  generateManifest, 
  getTracking, 
  shiprocketWebhook 
} from "../controllers/shiprocketController.js";
import { isAuthenticated } from "../middleware/auth.js";

const router = express.Router();

// Create order inside Shiprocket
router.post("/create-order", isAuthenticated, createShiprocketOrder);

// Assign AWB
router.post("/awb", isAuthenticated, generateAWB);

// Get tracking
router.get("/track/:awb", isAuthenticated, getTracking);

// Manifest
router.get("/manifest/:shipmentId", isAuthenticated, generateManifest);

// Webhook (MUST start with /)
router.post("/webhook", express.raw({ type: "application/json" }), shiprocketWebhook);

export default router;
