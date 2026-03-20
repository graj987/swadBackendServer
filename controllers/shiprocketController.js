// controllers/shiprocketController.js
import Order from "../models/order.js";
import {
  createShiprocketOrder,
  generateAWB,
  generateManifest,
  cancelShipment,
  generateLabel,
  trackByAWB,
  checkServiceability,
} from "../services/shiprocketServices.js";

/* ─────────────────────────────────────────────
   HELPER: normalise Shiprocket status strings
   into consistent internal status keys
───────────────────────────────────────────── */
export const normalizeStatus = (s = "") => {
  s = s.toLowerCase();
  if (s.includes("delivered"))                        return "delivered";
  if (s.includes("out for delivery") || s.includes("out_for_delivery")) return "out_for_delivery";
  if (s.includes("transit"))                          return "in_transit";
  if (s.includes("pickup") || s.includes("shipped"))  return "shipped";
  if (s.includes("rto"))                              return "rto";
  if (s.includes("cancel"))                           return "cancelled";
  if (s.includes("created") || s.includes("packed"))  return "created";
  return "processing";
};

/* ═══════════════════════════════════════════
   CREATE SHIPMENT
   POST /api/shipping/order/:orderId/create
   Admin only
═══════════════════════════════════════════ */
export const createShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.shipping?.shipmentId) {
      return res.status(400).json({ success: false, message: "Shipment already created" });
    }

    if (order.paymentStatus !== "paid" && order.paymentMethod !== "COD") {
      return res.status(400).json({ success: false, message: "Cannot ship unpaid order" });
    }

    const shipping = await createShiprocketOrder(orderId);

    res.json({ success: true, message: "Shipment created", shipping });
  } catch (err) {
    console.error("[createShipment]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════
   GENERATE AWB
   POST /api/shipping/order/:orderId/awb
   Admin only
   🔧 Fixed: was throwing unhandled instead of responding
═══════════════════════════════════════════ */
export const generateAWBController = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ success: false, message: "orderId required" });

    const awb = await generateAWB(orderId);
    res.json({ success: true, awb });
  } catch (err) {
    console.error("[generateAWB]", err.response?.data || err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════
   GENERATE MANIFEST (bulk)
   POST /api/shipping/manifest
   Admin only
═══════════════════════════════════════════ */
export const generateManifestController = async (req, res) => {
  try {
    const { shipmentIds } = req.body;
    if (!Array.isArray(shipmentIds) || !shipmentIds.length) {
      return res.status(400).json({ success: false, message: "shipmentIds must be a non-empty array" });
    }

    const manifestUrl = await generateManifest(shipmentIds);
    res.json({ success: true, manifestUrl });
  } catch (err) {
    console.error("[generateManifest]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════
   CANCEL SHIPMENT
   POST /api/shipping/order/:orderId/cancel
   Admin only
═══════════════════════════════════════════ */
export const cancelShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ success: false, message: "orderId required" });

    await cancelShipment(orderId);
    res.json({ success: true, message: "Shipment cancelled successfully" });
  } catch (err) {
    console.error("[cancelShipment]", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════
   GENERATE LABEL
   GET /api/shipping/label/:shipmentId
   Admin only
═══════════════════════════════════════════ */
export const generateLabelController = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    if (!shipmentId) return res.status(400).json({ success: false, message: "shipmentId required" });

    const labelUrl = await generateLabel(shipmentId);
    res.json({ success: true, labelUrl });
  } catch (err) {
    console.error("[generateLabel]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════
   GET SHIPMENT DETAILS
   GET /api/shipping/order/:orderId
   Admin only
═══════════════════════════════════════════ */
export const getShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).select("shipping orderStatus paymentStatus");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (!order.shipping?.shipmentId) {
      return res.status(404).json({ success: false, message: "Shipment not created yet" });
    }

    const s = order.shipping;
    res.json({
      success: true,
      shipment: {
        shipmentId:   s.shipmentId,
        awb:          s.awb          || null,
        courier:      s.courierName  || null,
        courierId:    s.courierId    || null,
        status:       s.status,
        labelUrl:     s.labelUrl     || null,
        package:      s.package      || null,
        trackHistory: s.trackHistory || [],
        lastError:    s.lastError    || null,
      },
    });
  } catch (err) {
    console.error("[getShipment]", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch shipment" });
  }
};

/* ═══════════════════════════════════════════
   LIVE TRACKING  (user-facing)
   GET /api/shipping/track/:awb
   Authenticated user
   🔧 Fixed: now correctly imports from service,
      not from service AND controller separately
═══════════════════════════════════════════ */
export const getLiveTrackingController = async (req, res) => {
  try {
    const { awb } = req.params;
    if (!awb) return res.status(400).json({ success: false, message: "AWB required" });

    try {
      const sr = await trackByAWB(awb);
      return res.json({ success: true, source: "live", data: sr.data });
    } catch {
      // Fallback: return cached DB history
      const order = await Order.findOne({ "shipping.awb": awb })
        .select("shipping.status shipping.trackHistory shipping.courierName");

      if (!order?.shipping?.trackHistory?.length) {
        return res.status(404).json({ success: false, message: "No tracking data available yet" });
      }

      return res.json({
        success: true,
        source:  "cached",
        data: {
          tracking_data: {
            current_status:            order.shipping.status,
            courier_name:              order.shipping.courierName,
            shipment_track_activities: order.shipping.trackHistory,
          },
        },
      });
    }
  } catch (err) {
    console.error("[liveTracking]", err.message);
    res.status(500).json({ success: false, message: "Tracking unavailable" });
  }
};

/* ═══════════════════════════════════════════
   ORDER TRACKING TIMELINE  (user-facing)
   GET /api/shipping/order/:orderId/timeline
   Authenticated user
═══════════════════════════════════════════ */
export const getOrderTrackingTimeline = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .select("shipping orderStatus");

    if (!order?.shipping) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    res.json({
      success:  true,
      awb:      order.shipping.awb          || null,
      courier:  order.shipping.courierName  || null,
      status:   order.shipping.status       || "processing",
      timeline: order.shipping.trackHistory || [],
    });
  } catch (err) {
    console.error("[trackingTimeline]", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch timeline" });
  }
};

/* ═══════════════════════════════════════════
   REFRESH TRACKING  (admin — manual pull)
   POST /api/shipping/track/refresh/:awb
   Admin only
═══════════════════════════════════════════ */
export const refreshTrackingController = async (req, res) => {
  try {
    const { awb } = req.params;
    if (!awb) return res.status(400).json({ success: false, message: "AWB required" });

    const order = await Order.findOne({ "shipping.awb": awb });
    if (!order) return res.status(404).json({ success: false, message: "No order found for this AWB" });

    const sr         = await trackByAWB(awb);
    const activities = sr?.data?.tracking_data?.shipment_track_activities || [];

    if (!activities.length) {
      return res.json({ success: true, message: "No new tracking updates from carrier" });
    }

    // Deduplicate before pushing (avoid re-adding same event on repeated refresh)
    const existingMessages = new Set(order.shipping.trackHistory.map((h) => h.message + h.date));

    let added = 0;
    for (const act of activities) {
      const key = (act.activity || act.status || "") + (act.date || "");
      if (existingMessages.has(key)) continue;

      const status = normalizeStatus(act.status || act.activity);
      order.shipping.trackHistory.push({
        status,
        location: act.location || "",
        message:  act.activity || act.status || "",
        raw:      act,
        date:     new Date(act.date || Date.now()),
      });
      order.shipping.status = status;
      existingMessages.add(key);
      added++;
    }

    // Sync order status with latest shipping status
    const latestStatus = order.shipping.status;
    const orderStatusMap = {
      shipped:          "shipped",
      in_transit:       "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered:        "delivered",
      rto:              "rto",
      cancelled:        "cancelled",
    };
    if (orderStatusMap[latestStatus]) {
      order.orderStatus = orderStatusMap[latestStatus];
    }

    await order.save();

    res.json({
      success:  true,
      message:  `Tracking refreshed — ${added} new event(s)`,
      status:   order.shipping.status,
      timeline: order.shipping.trackHistory,
    });
  } catch (err) {
    console.error("[refreshTracking]", err.message);
    res.status(500).json({ success: false, message: "Failed to refresh tracking" });
  }
};

/* ═══════════════════════════════════════════
   SERVICEABILITY CHECK
   GET /api/shipping/serviceability?pickup=&delivery=&weight=&cod=
   Admin only
═══════════════════════════════════════════ */
export const checkServiceabilityController = async (req, res) => {
  try {
    const { pickup, delivery, weight, cod } = req.query;

    if (!pickup || !delivery) {
      return res.status(400).json({ success: false, message: "pickup and delivery pincodes required" });
    }

    const couriers = await checkServiceability({
      pickup,
      delivery,
      weight: parseFloat(weight) || DEFAULT_WEIGHT,
      cod:    cod === "true",
    });

    res.json({
      success:  true,
      count:    couriers.length,
      couriers: couriers.map((c) => ({
        courierId:   c.courier_company_id,
        name:        c.courier_name,
        rating:      c.rating,
        etd:         c.etd,
        cod:         c.cod,
        freight:     c.freight_charge,
        minWeight:   c.min_weight,
        maxWeight:   c.max_weight,
        recommended: c.is_surface,
      })),
    });
  } catch (err) {
    console.error("[serviceability]", err.message);
    res.status(500).json({ success: false, message: "Failed to check serviceability" });
  }
};

/* ═══════════════════════════════════════════
   SHIPROCKET WEBHOOK  (Shiprocket → your server)
   POST /api/shipping/webhook
   Rate-limited, no auth (verified via header key)
   🔧 Fixed: was missing status sync to orderStatus
═══════════════════════════════════════════ */
export const shiprocketWebhookController = async (req, res) => {
  try {
    // Verify webhook secret
    if (req.headers["x-api-key"] !== process.env.SHIPROCKET_WEBHOOK_KEY) {
      return res.sendStatus(401);
    }

    const event = req.body;
    const awb   = event.awb || event.awb_code;
    if (!awb) return res.sendStatus(200); // nothing to process

    const order = await Order.findOne({ "shipping.awb": awb });
    if (!order) return res.sendStatus(200);

    // Don't overwrite terminal states
    const FINAL = ["delivered", "cancelled", "rto"];
    if (FINAL.includes(order.shipping.status)) return res.sendStatus(200);

    const status = normalizeStatus(event.current_status || event.status || "");

    // Push to history
    order.shipping.trackHistory.push({
      status,
      location: event.location || "",
      message:  event.message  || event.current_status || "",
      raw:      event,
      date:     new Date(),
    });

    order.shipping.status = status;

    // Sync orderStatus
    const syncMap = {
      shipped:          "shipped",
      in_transit:       "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered:        "delivered",
      rto:              "rto",
      cancelled:        "cancelled",
    };
    if (syncMap[status]) order.orderStatus = syncMap[status];

    await order.save();

    console.log(`[Webhook] AWB ${awb} → ${status}`);
    res.sendStatus(200);
  } catch (err) {
    console.error("[webhook]", err.message);
    res.sendStatus(200); // always 200 to Shiprocket
  }
};

// Re-export DEFAULT_WEIGHT so controller can reference it
const DEFAULT_WEIGHT = 0.5;