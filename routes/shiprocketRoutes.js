import express from "express";

import {protectAdmin} from "../middleware/adminMiddleware.js";
import { isAuthenticated } from "../middleware/auth.js";
import { cancelShipmentController, createShipmentController, generateAWBController, generateLabelController, generateManifestController, shiprocketWebhookController} from "../controllers/shiprocketController.js";
import { getLiveTrackingController } from "../services/shiprocketServices.js";


const router = express.Router();

/* ---------------- ADMIN ONLY ---------------- */

// Create Shiprocket order
router.post(
  "/order/:orderId/create",
  protectAdmin,
  createShipmentController
);

router.post(
  "/order/:orderId/awb",
  protectAdmin,
  generateAWBController
);

router.post(
  "/manifest",
  protectAdmin,
  generateManifestController
);


router.get(
  "/track/:awb",
  isAuthenticated,
  getLiveTrackingController
);

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
