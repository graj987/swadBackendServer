import Order from "../models/order.js";
import axios from "axios";
import { getShiprocketToken } from "../utils/shiprocketClient.js";

// --------------------------------------------------
// 1️⃣ GET ALL ORDERS (filters supported)
// --------------------------------------------------
export const adminGetAllOrders = async (req, res) => {
  try {
    const { status, paymentStatus, search } = req.query;

    const filter = {};

    if (status) filter.orderStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (search) {
      filter.$or = [
        { "address.name": new RegExp(search, "i") },
        { "address.phone": new RegExp(search, "i") },
        { _id: search }
      ];
    }

    const orders = await Order.find(filter)
      .populate("products.product")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// --------------------------------------------------
// 2️⃣ UPDATE ORDER STATUS (Admin Override)
// --------------------------------------------------
export const adminUpdateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { orderId } = req.params;

    const allowed = ["preparing", "packed", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.orderStatus = status;
    order.statusHistory.push({ status, date: new Date() });
    await order.save();

    res.json({ success: true, data: order });

  } catch (err) {
    res.status(500).json({ success: false, message: "Status update failed" });
  }
};

// --------------------------------------------------
// 3️⃣ CANCEL ORDER
// --------------------------------------------------
export const adminCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.orderStatus = "cancelled";
    order.paymentStatus = "failed";
    order.statusHistory.push({ status: "cancelled", date: new Date() });

    await order.save();

    res.json({ success: true, message: "Order cancelled", data: order });

  } catch (err) {
    res.status(500).json({ success: false, message: "Cancel failed" });
  }
};

// --------------------------------------------------
// 4️⃣ SYNC ORDER WITH SHIPROCKET
// --------------------------------------------------
export const adminSyncShiprocket = async (req, res) => {
  try {
    const { orderId } = req.params;

    const token = await getShiprocketToken();

    const order = await Order.findById(orderId).populate("products.product");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.shiprocketOrderId) {
      return res.json({ success: true, message: "Already synced", data: order });
    }

    const items = order.products.map((i) => ({
      name: i.product.name,
      sku: i.product._id.toString(),
      units: i.quantity,
      selling_price: i.priceAtPurchase
    }));

    const payload = {
      order_id: order._id,
      order_date: new Date(),
      pickup_location: process.env.SR_PICKUP || "Primary",
      billing_customer_name: order.address.name,
      billing_address: order.address.line1,
      billing_city: order.address.city,
      billing_pincode: order.address.pincode,
      billing_country: "India",
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

    const sr = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    order.shiprocketOrderId = sr.data.order_id;
    order.shipmentId = sr.data.shipment_id;
    await order.save();

    res.json({ success: true, message: "Synced", data: order });

  } catch (err) {
    res.status(500).json({ success: false, message: "Sync failed" });
  }
};

// --------------------------------------------------
// 5️⃣ GENERATE AWB (Admin)
// --------------------------------------------------
export const adminGenerateAWB = async (req, res) => {
  try {
    const { orderId } = req.params;
    const token = await getShiprocketToken();
    const order = await Order.findById(orderId);

    if (!order.shipmentId)
      return res.status(400).json({ success: false, message: "Sync to Shiprocket first" });

    const awbRes = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
      { shipment_id: order.shipmentId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    order.awb = awbRes.data.awb_code;
    await order.save();

    res.json({ success: true, awb: order.awb });

  } catch (err) {
    res.status(500).json({ success: false, message: "AWB failed" });
  }
};

// --------------------------------------------------
// 6️⃣ PRINT LABEL
// --------------------------------------------------
export const adminPrintLabel = async (req, res) => {
  try {
    const { orderId } = req.params;
    const token = await getShiprocketToken();

    const order = await Order.findById(orderId);
    if (!order?.shipmentId)
      return res.status(400).json({ success: false, message: "No shipment" });

    const label = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/generate/label?shipment_id=${order.shipmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ success: true, label: label.data });

  } catch {
    res.status(500).json({ success: false, message: "Label error" });
  }
};

// --------------------------------------------------
// 7️⃣ TRACK ORDER
// --------------------------------------------------
export const adminTrackOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order?.awb) return res.status(400).json({ success: false, message: "No AWB" });

    const token = await getShiprocketToken();

    const track = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.awb}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ success: true, tracking: track.data });

  } catch {
    res.status(500).json({ success: false, message: "Tracking failed" });
  }
};
