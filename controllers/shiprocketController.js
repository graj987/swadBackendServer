import {
  createShiprocketOrder,
  generateAWB,
  generateManifest,
  cancelShipment,
} from "../services/shiprocketServices.js";
import Order from "../models/order.js";

/* ---------------- CREATE SHIPMENT ---------------- */
export const createShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipping = await createShiprocketOrder(orderId);
    res.json({ success: true, shipping });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------- GENERATE AWB ---------------- */
export const generateAWBController = async (req, res) => {
  try {
    const { orderId } = req.params;
    const awb = await generateAWB(orderId);
    res.json({ success: true, awb });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


/* ---------------- MANIFEST (BULK) ---------------- */
export const generateManifestController = async (req, res) => {
  try {
    const { shipmentIds } = req.body;
    const manifestUrl = await generateManifest(shipmentIds);
    res.json({ success: true, manifestUrl });
  } catch (err) {
  console.error("Shiprocket error:", err.response?.data || err.message);

  res.status(500).json({
    success: false,
    message: err.response?.data?.message || err.message || "Server error",
  });
}
};
export const cancelShipmentController = async (req, res) => {
  try {
    const { orderId } = req.params;
    await cancelShipment(orderId);
    res.json({ success: true, message: "Shipment cancelled / RTO initiated" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
export const generateLabelController = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const labelUrl = await generateLabel(shipmentId);

    if (!labelUrl)
      return res.status(404).json({ success: false, message: "Label not ready" });

    res.json({ success: true, labelUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const shiprocketWebhookController = async (req, res) => {
  try {
    const event = req.body;

    const awb = event.awb || event.awb_code;
    if (!awb) return res.sendStatus(200);

    const order = await Order.findOne({ "shipping.awb": awb });
    if (!order) return res.sendStatus(200);

    const status = String(
      event.current_status || event.status || ""
    ).toLowerCase();

    if (!status) return res.sendStatus(200);

    order.shipping.status = status;
    order.shipping.trackHistory.push({
      status,
      location: event.location || "",
      message: event.message || "",
      date: new Date(),
    });

    if (status === "delivered") {
      order.orderStatus = "delivered";
    }

    if (["cancelled", "rto"].includes(status)) {
      order.orderStatus = "cancelled";
    }

    await order.save();
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(200);
  }
};