// routes/shiprocketRoutes.js
import express        from "express";
import rateLimit      from "express-rate-limit";
import { protectAdmin }    from "../middleware/adminMiddleware.js";
import { isAuthenticated } from "../middleware/auth.js";

// ✅ All imports from controller only — NOT from services
import {
  createShipmentController,
  generateAWBController,
  generateManifestController,
  cancelShipmentController,
  generateLabelController,
  getShipmentController,
  getLiveTrackingController,
  getOrderTrackingTimeline,
  refreshTrackingController,
  checkServiceabilityController,
  shiprocketWebhookController,
} from "../controllers/shiprocketController.js";

const router = express.Router();

/* ─────────────────────────────────────────────
   RATE LIMITERS
───────────────────────────────────────────── */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max:      100,
  message:  { success: false, message: "Too many webhook requests" },
});

const trackingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max:      30,               // 30 tracking requests per minute per IP
  message:  { success: false, message: "Too many tracking requests — slow down" },
});

/* ═══════════════════════════════════════════
   ADMIN ROUTES
   All require protectAdmin middleware
═══════════════════════════════════════════ */

/**
 * GET /api/shipping/order/:orderId
 * Get full shipment details for an order
 */
router.get("/order/:orderId", protectAdmin, getShipmentController);

/**
 * POST /api/shipping/order/:orderId/create
 * Push order to Shiprocket and get a shipment ID
 */
router.post("/order/:orderId/create", protectAdmin, createShipmentController);

/**
 * POST /api/shipping/order/:orderId/awb
 * Assign courier and generate AWB number
 */
router.post("/order/:orderId/awb", protectAdmin, generateAWBController);

/**
 * POST /api/shipping/order/:orderId/cancel
 * Cancel a live shipment
 */
router.post("/order/:orderId/cancel", protectAdmin, cancelShipmentController);

/**
 * GET /api/shipping/label/:shipmentId
 * Generate and return shipping label PDF URL
 */
router.get("/label/:shipmentId", protectAdmin, generateLabelController);

/**
 * POST /api/shipping/manifest
 * Bulk generate manifest for an array of shipmentIds
 * Body: { shipmentIds: [123, 456] }
 */
router.post("/manifest", protectAdmin, generateManifestController);

/**
 * POST /api/shipping/track/refresh/:awb
 * Manually pull latest tracking events from Shiprocket
 */
router.post("/track/refresh/:awb", protectAdmin, refreshTrackingController);

/**
 * GET /api/shipping/serviceability?pickup=&delivery=&weight=&cod=
 * Check which couriers can service a pincode pair
 */
router.get("/serviceability", protectAdmin, checkServiceabilityController);

/* ═══════════════════════════════════════════
   AUTHENTICATED USER ROUTES
   Require isAuthenticated middleware
═══════════════════════════════════════════ */

/**
 * GET /api/shipping/track/:awb
 * Live tracking by AWB — user-facing
 * Falls back to DB cache if Shiprocket is unreachable
 */
router.get("/track/:awb", isAuthenticated, trackingLimiter, getLiveTrackingController);

/**
 * GET /api/shipping/order/:orderId/timeline
 * Get stored tracking timeline for an order
 */
router.get("/order/:orderId/timeline", isAuthenticated, getOrderTrackingTimeline);

/* ═══════════════════════════════════════════
   WEBHOOK  (Shiprocket → your server)
   No auth — verified via x-api-key header inside controller
   Rate-limited to prevent abuse
═══════════════════════════════════════════ */

/**
 * POST /api/shipping/webhook
 * Receives real-time status pushes from Shiprocket
 */
router.post("/webhook", webhookLimiter, shiprocketWebhookController);

export default router;