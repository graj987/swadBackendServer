// controllers/shiprocketController.js
import axios from "axios";
import Order from "../models/order.js";
import { getShiprocketToken } from "../utils/shiprocketClient.js";

/* --------------------------------------------------
  🔵 Helper: Safe API Call Wrapper
-------------------------------------------------- */
const srAPI = async (method, url, data = null) => {
  const token = await getShiprocketToken();

  try {
    return await axios({
      method,
      url,
      data,
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    console.error("Shiprocket API Error:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Shiprocket API failed");
  }
};

/* --------------------------------------------------
  🟢 1) CREATE SHIPROCKET ORDER
-------------------------------------------------- */
export const createShiprocketOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId).populate("products.product");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.shiprocketOrderId) {
      return res.json({ success: true, message: "Already synced", order });
    }

    const items = order.products.map((p) => ({
      name: p.product.name,
      sku: p.product._id.toString(),
      units: p.quantity,
      selling_price: p.priceAtPurchase
    }));

    const payload = {
      order_id: order._id.toString(),
      order_date: new Date().toISOString(),
      pickup_location: process.env.SR_PICKUP || "Primary",

      billing_customer_name: order.address.name,
      billing_last_name: "",
      billing_address: order.address.line1,
      billing_city: order.address.city,
      billing_pincode: order.address.pincode,
      billing_state: "NA",
      billing_country: "India",
      billing_email: order.email || "support@swadbest.com",
      billing_phone: order.address.phone,

      shipping_is_billing: true,
      order_items: items,

      payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
      sub_total: order.totalAmount,

      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5
    };

    const sr = await srAPI(
      "post",
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      payload
    );

    order.shiprocketOrderId = sr.data.order_id;
    order.shipmentId = sr.data.shipment_id;
    await order.save();

    res.json({ success: true, message: "Shiprocket order created", order });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* --------------------------------------------------
  🟡 2) GENERATE AWB
-------------------------------------------------- */
export const generateAWB = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (!order.shipmentId) {
      return res.status(400).json({
        success: false,
        message: "Create Shiprocket order first"
      });
    }

    // First attempt — without courier_id
    let awbRes = await srAPI(
      "post",
      "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
      { shipment_id: order.shipmentId }
    );

    let awb = awbRes.data?.awb_code;

    // Some shipments require courier assignment explicitly
    if (!awb && awbRes.data?.courier_id) {
      awbRes = await srAPI(
        "post",
        "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
        {
          shipment_id: order.shipmentId,
          courier_id: awbRes.data.courier_id
        }
      );
      awb = awbRes.data?.awb_code;
    }

    if (!awb) throw new Error("Shiprocket did not return an AWB");

    order.awb = awb;
    order.trackingUrl = `https://shiprocket.co/tracking/${awb}`;
    await order.save();

    res.json({ success: true, awb });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* --------------------------------------------------
  🔵 3) TRACK SHIPMENT
-------------------------------------------------- */
export const getTracking = async (req, res) => {
  try {
    const { awb } = req.params;

    const response = await srAPI(
      "get",
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`
    );

    res.json({ success: true, tracking: response.data });

  } catch (err) {
    res.status(500).json({ success: false, message: "Tracking failed" });
  }
};

/* --------------------------------------------------
  🔴 4) WEBHOOK HANDLER
  (Set webhook URL in Shiprocket dashboard)
-------------------------------------------------- */
export const shiprocketWebhook = async (req, res) => {
  try {
    const ev = req.body;
    const awb = ev.awb || ev.awb_code;

    if (!awb) return res.status(200).send("No AWB");

    const order = await Order.findOne({ awb });
    if (!order) return res.status(200).send("Order not found");

    const status = (ev.current_status || ev.status || "").toLowerCase();

    order.orderStatus = status;
    order.statusHistory.push({ status, date: new Date() });
    await order.save();

    res.status(200).send("OK");

  } catch (err) {
    res.status(500).send("Webhook Error");
  }
};
export const generateLabel = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order || !order.shipmentId)
      return res.status(400).json({ success: false, message: "Shipment not found" });

    const token = await getShiprocketToken();

    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/generate/label?shipment_ids=${order.shipmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const pdfUrl = response.data?.data?.label_url;

    if (!pdfUrl)
      return res.status(500).json({ success: false, message: "Label not generated" });

    order.trackingUrl = pdfUrl;
    await order.save();

    res.json({ success: true, labelUrl: pdfUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: "Label generation failed" });
  }
};
export const generateManifest = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const token = await getShiprocketToken();

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/manifests/generate",
      { shipment_id: shipmentId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const manifestUrl = response.data?.manifest_url;
    if (!manifestUrl)
      return res.status(500).json({ success: false, message: "Manifest not available" });

    res.json({ success: true, manifestUrl });
  } catch {
    res.status(500).json({ success: false, message: "Manifest failed" });
  }
};
