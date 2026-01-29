import axios from "axios";
import Order from "../models/order.js";
import { getShiprocketToken } from "../utils/shiprocketClient.js";

const BASE = process.env.SHIPROCKET_BASE; // https://apiv2.shiprocket.in/v1/external
const PICKUP = process.env.SHIPROCKET_PICKUP || "Primary";

const srAPI = async (method, endpoint, data = null) => {
  const token = await getShiprocketToken();

  try {
    return await axios({
      method,
      url: `${BASE}${endpoint}`,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
  console.error("========== SHIPROCKET ERROR ==========");
  console.error("STATUS:", err.response?.status);
  console.error("DATA:", JSON.stringify(err.response?.data, null, 2));
  console.error("=====================================");

  throw err; // IMPORTANT: rethrow the ORIGINAL error
}

};
export const checkServiceability = async ({
  pickup,
  delivery,
  weight,
  cod = false,
}) => {
  const res = await srAPI(
    "get",
    `/courier/serviceability?pickup_postcode=${pickup}` +
    `&delivery_postcode=${delivery}` +
    `&weight=${weight}` +
    `&cod=${cod ? 1 : 0}`
  );

  return res.data?.available_courier_companies || [];
};


export const createShiprocketOrder = async (orderId) => {
  const order = await Order.findById(orderId).populate("items.product"); // ✅ correct path

  if (!order) throw new Error("Order not found");

  if (order.shipping?.shipmentId) return order.shipping;

  const addr = order.address;

  const fullAddress = addr.line1; // schema already normalized



// NAME SPLIT (REQUIRED BY SHIPROCKET)
const [firstName, ...rest] = addr.name.trim().split(" ");
const lastName = rest.join(" ") || "NA";

// PINCODE VALIDATION (REQUIRED)
const pincode = String(addr.pincode).replace(/\D/g, "");
if (pincode.length !== 6) {
  throw new Error("Invalid billing pincode");
}

// SUBTOTAL (STRICT)
const subTotal = order.items.reduce(
  (sum, i) => sum + i.priceAtPurchase * i.quantity,
  0
);

const payload = {
  order_id: order._id.toString(),
  order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
  pickup_location: "Home PRIMARY",

  billing_customer_name: firstName,
  billing_last_name: lastName,
  billing_address: addr.line1,
  billing_city: addr.city,
  billing_state: addr.state?.trim() || "Bihar",
  billing_pincode: pincode,
  billing_country: "India",
  billing_email: "orders@swadbest.com",
  billing_phone: addr.phone,

  shipping_is_billing: true,

  order_items: order.items.map(i => ({
    name: i.product.name,
    sku: i.product._id.toString(),
    units: i.quantity,
    selling_price: i.priceAtPurchase,
  })),

  payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
  sub_total: subTotal,

  length: 10,
  breadth: 10,
  height: 10,
  weight: 0.5,
};


  const sr = await srAPI("post", "/orders/create/adhoc", payload);

  order.shipping = {
    shiprocketOrderId: sr.data.order_id,
    shipmentId: sr.data.shipment_id,
    status: "created",
    trackHistory: [],
  };

  await order.save();
  return order.shipping;
};

export const generateAWB = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order?.shipping?.shipmentId) throw new Error("Shipment not created");

  if (order.shipping.awb) return order.shipping.awb;

  // (OPTIONAL) serviceability guard
  const couriers = await checkServiceability(
    order.address.pincode,
    order.address.pincode,
    0.5,
  );
  if (!couriers.length)
    throw new Error("No courier serviceable for this pincode");

  const sr = await srAPI("post", "/courier/assign/awb", {
    shipment_id: order.shipping.shipmentId,
  });

  if (!sr.data?.awb_code) throw new Error("AWB generation failed");

  order.shipping.awb = sr.data.awb_code;
  order.shipping.courierId = sr.data.courier_id;
  order.shipping.courierName = sr.data.courier_name;
  order.shipping.trackingUrl = `https://shiprocket.co/tracking/${sr.data.awb_code}`;
  order.shipping.status = "shipped";
  order.orderStatus = "shipped";

  await order.save();
  return sr.data.awb_code;
};


export const getLiveTracking = async (req, res) => {
  try {
    const { awb } = req.params;

    if (!awb) {
      return res.status(400).json({ success: false, message: "AWB required" });
    }

    // 1️⃣ Always try Shiprocket first
    try {
      const sr = await srAPI(
        "get",
        `/courier/track/awb/${awb}`
      );

      return res.json({
        success: true,
        source: "shiprocket",
        data: sr.data,
      });
    } catch (srErr) {
      // 2️⃣ Fallback to cached DB tracking
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
    return res.status(500).json({
      success: false,
      message: "Tracking unavailable",
    });
  }
};


export const generateManifest = async (shipmentIds = []) => {
  if (!Array.isArray(shipmentIds) || !shipmentIds.length)
    throw new Error("shipmentIds array required");

  const sr = await srAPI("post", "/manifests/generate", {
    shipment_id: shipmentIds.map(Number),
  });

  return sr.data?.manifest_url || null;
};
export const cancelShipment = async (orderId) => {
  const order = await Order.findById(orderId);

  if (!order?.shipping?.shipmentId) throw new Error("Shipment not created");

  if (!order.shipping.awb) throw new Error("AWB not generated");

  // Cancel shipment
  const sr = await srAPI("post", "/orders/cancel", {
    awb: [order.shipping.awb],
  });

  order.shipping.status = "cancelled";
  order.orderStatus = "cancelled";

  await order.save();
  return true;
};

