import {
  createShiprocketOrder,
  generateAWB,
  generateManifest,
  cancelShipment,
  generateLabel,
} from "../services/shiprocketServices.js";
import Order from "../models/order.js";
import { trackByAWB } from "../services/shiprocketServices.js";


const normalizeStatus = (s = "") => {
  s = s.toLowerCase();

  if (s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("transit")) return "in_transit";
  if (s.includes("pickup") || s.includes("shipped")) return "shipped";
  if (s.includes("rto")) return "rto";
  if (s.includes("cancel")) return "cancelled";

  return "created";
};


export const createShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId)
      return res.status(400).json({ success: false, message: "orderId required" });

    const shipping = await createShiprocketOrder(orderId);

    res.json({ success: true, shipping });
  } catch (err) {
    console.error("Create Shipment Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const generateAWBController = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId)
      return res.status(400).json({ success: false, message: "orderId required" });

    const awb = await generateAWB(orderId);

    res.json({ success: true, awb });
  } catch (err) {
  console.error("❌ SHIPROCKET AWB ERROR:");
  console.error(err.response?.data || err.message);
  throw err;
}

};

/* -------------------------------------------------- */
/* GENERATE MANIFEST (BULK)                            */
/* -------------------------------------------------- */
export const generateManifestController = async (req, res) => {
  try {
    const { shipmentIds } = req.body;

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0)
      return res.status(400).json({
        success: false,
        message: "shipmentIds must be a non-empty array",
      });

    const manifestUrl = await generateManifest(shipmentIds);

    res.json({ success: true, manifestUrl });
  } catch (err) {
    console.error("Manifest Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* -------------------------------------------------- */
/* CANCEL SHIPMENT                                    */
/* -------------------------------------------------- */
export const cancelShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId)
      return res.status(400).json({ success: false, message: "orderId required" });

    await cancelShipment(orderId);

    res.json({ success: true, message: "Shipment cancelled" });
  } catch (err) {
    console.error("Cancel Shipment Error:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

export const generateLabelController = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    if (!shipmentId)
      return res.status(400).json({ success: false, message: "shipmentId required" });

    const labelUrl = await generateLabel(shipmentId);

    res.json({ success: true, labelUrl });
  } catch (err) {
    console.error("Label Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const shiprocketWebhookController = async (req, res) => {
  try {
    // verify webhook source
    if (req.headers["x-api-key"] !== process.env.SHIPROCKET_WEBHOOK_KEY)
      return res.sendStatus(401);

    const event = req.body;
    const awb = event.awb || event.awb_code;
    if (!awb) return res.sendStatus(200);

    const order = await Order.findOne({ "shipping.awb": awb });
    if (!order) return res.sendStatus(200);

    // prevent overwriting final state
    const finalStates = ["delivered", "cancelled", "rto"];
    if (finalStates.includes(order.shipping.status)) {
      return res.sendStatus(200);
    }

    const status = normalizeStatus(event.current_status || event.status);

    order.shipping.status = status;

    order.shipping.trackHistory.push({
      status,
      location: event.location || "",
      message: event.message || "",
      raw: event,
      date: new Date(),
    });

    if (status === "delivered") order.orderStatus = "delivered";
    if (status === "rto" || status === "cancelled") order.orderStatus = "cancelled";

    await order.save();

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(200);
  }
};


export const getLiveTrackingController = async (req, res) => {
  try {
    const { awb } = req.params;

    if (!awb) {
      return res.status(400).json({
        success: false,
        message: "AWB required",
      });
    }

    try {
      // call SERVICE (not Shiprocket directly)
      const data = await trackByAWB(awb);

      return res.json({
        success: true,
        source: "shiprocket",
        data,
      });
    } catch (err) {
      // fallback to DB tracking
      const order = await Order.findOne({ "shipping.awb": awb });

      if (!order || !order.shipping?.trackHistory?.length) {
        throw new Error("No tracking available");
      }

      return res.json({
        success: true,
        source: "cached",
        data: {
          tracking_data: {
            shipment_track_activities: order.shipping.trackHistory,
          },
        },
      });
    }
  } catch (err) {
    console.error("Tracking Error:", err.message);
    res.status(500).json({
      success: false,
      message: "Tracking unavailable",
    });
  }
};
