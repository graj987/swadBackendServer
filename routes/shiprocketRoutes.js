import express from "express";

import {protectAdmin} from "../middleware/adminMiddleware.js";
import { isAuthenticated } from "../middleware/auth.js";
import { cancelShipmentController, createShipmentController, generateAWBController, generateLabelController, generateManifestController, shiprocketWebhookController} from "../controllers/shiprocketController.js";
import { getLiveTracking } from "../services/shiprocketServices.js";


const router = express.Router();

/* ---------------- ADMIN ONLY ---------------- */

// Create Shiprocket order
router.post(
  "/order/:orderId/create",
  protectAdmin,
  createShipmentController
);

// Assign courier + generate AWB
router.post(
  "/order/:orderId/awb",
  protectAdmin,
  generateAWBController
);

// Generate manifest (BULK)
router.post(
  "/manifest",
  protectAdmin,
  generateManifestController
);

/* ---------------- PUBLIC / USER ---------------- */

// Track by AWB
router.get(
  "/track/:awb",
  isAuthenticated,
  getLiveTracking
);

/* ---------------- SHIPROCKET ---------------- */

// Webhook (NO AUTH)
router.post(
  "/webhook",
  express.json(),
  shiprocketWebhookController
);

router.post(
  "/order/:orderId/cancel",

  protectAdmin,
  cancelShipmentController
);

router.get(
  "/label/:shipmentId",
  protectAdmin,
  generateLabelController
);


export default router;
