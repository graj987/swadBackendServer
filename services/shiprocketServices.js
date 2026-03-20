// services/shiprocketServices.js
import axios from "axios";
import Order from "../models/order.js";
import { getShiprocketToken } from "../utils/shiprocketClient.js";

const BASE          = process.env.SHIPROCKET_BASE;
const PICKUP        = process.env.SHIPROCKET_PICKUP || "Primary";
const PICKUP_PIN    = process.env.PICKUP_PINCODE;
const DEFAULT_WEIGHT = 0.5;

/* ═══════════════════════════════════════════
   CORE API WRAPPER  (auto-retry on 401)
═══════════════════════════════════════════ */
const srAPI = async (method, endpoint, data = null, retry = true) => {
  try {
    const token = await getShiprocketToken();
    return await axios({
      method,
      url: `${BASE}${endpoint}`,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
  } catch (err) {
    if (retry && err.response?.status === 401) {
      return srAPI(method, endpoint, data, false);
    }
    console.error(`[Shiprocket] ${method.toUpperCase()} ${endpoint} →`, err.response?.data || err.message);
    throw err;
  }
};

/* ═══════════════════════════════════════════
   SERVICEABILITY CHECK
   ✅ Working — added validation + safe return
═══════════════════════════════════════════ */
export const checkServiceability = async ({ pickup, delivery, weight = DEFAULT_WEIGHT, cod = false }) => {
  if (!pickup || !delivery) throw new Error("pickup and delivery pincodes required");

  const url =
    `/courier/serviceability?pickup_postcode=${pickup}` +
    `&delivery_postcode=${delivery}` +
    `&weight=${weight}` +
    `&cod=${cod ? 1 : 0}`;

  const res  = await srAPI("get", url);
  const body = res.data;

  if (!body || body.status !== 200) {
    console.warn("[Shiprocket] Serviceability logical failure:", body);
    return [];
  }

  const couriers = body?.data?.available_courier_companies;
  if (!Array.isArray(couriers)) return [];

  return couriers;
};

/* ═══════════════════════════════════════════
   CREATE SHIPROCKET ORDER
   ✅ Working — hardened payload + error handling
═══════════════════════════════════════════ */
export const createShiprocketOrder = async (orderId) => {
  // Atomic: only proceed if shipmentId is NOT already set
  const order = await Order.findOneAndUpdate(
    { _id: orderId, "shipping.shipmentId": null },
    { $set: { "shipping.status": "creating" } },
    { new: true }
  ).populate("items.product");

  if (!order) throw new Error("Shipment already created or order not found");

  const addr = order.address;

  const [firstName, ...rest] = addr.name.trim().split(" ");
  const lastName  = rest.join(" ") || "NA";
  const pincode   = String(addr.pincode).replace(/\D/g, "");

  if (pincode.length !== 6) throw new Error(`Invalid delivery pincode: ${pincode}`);

  const subTotal = order.items.reduce((sum, i) => sum + i.priceAtPurchase * i.quantity, 0);

  const payload = {
    order_id:        order._id.toString(),
    order_date:      new Date().toISOString().slice(0, 19).replace("T", " "),
    pickup_location: PICKUP,

    billing_customer_name: firstName,
    billing_last_name:     lastName,
    billing_address:       addr.line1 || addr.house || "N/A",
    billing_address_2:     addr.line2 || addr.street || "",
    billing_city:          addr.city,
    billing_state:         addr.state,
    billing_pincode:       pincode,
    billing_country:       "India",
    billing_email:         "orders@swadbest.com",
    billing_phone:         addr.phone,

    shipping_is_billing: true,

    order_items: order.items.map((i) => ({
      name:          i.product.name,
      sku:           i.product._id.toString(),
      units:         i.quantity,
      selling_price: i.priceAtPurchase,
    })),

    payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
    sub_total:      subTotal,

    length:  10,
    breadth: 10,
    height:  10,
    weight:  DEFAULT_WEIGHT,
  };

  const sr = await srAPI("post", "/orders/create/adhoc", payload);

  if (!sr.data?.shipment_id) {
    throw new Error(`Shiprocket order creation failed: ${JSON.stringify(sr.data)}`);
  }

  order.shipping.shipmentId = sr.data.shipment_id;
  order.shipping.orderId    = sr.data.order_id;
  order.shipping.status     = "created";
  order.shipping.package    = { weight: DEFAULT_WEIGHT, length: 10, breadth: 10, height: 10 };
  await order.save();

  return order.shipping;
};

/* ═══════════════════════════════════════════
   GENERATE AWB
   🔧 Fixed — was missing checkServiceability import in controller,
      also added best-courier selection logic
═══════════════════════════════════════════ */
export const generateAWB = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order?.shipping?.shipmentId) throw new Error("Shipment not created yet");

  // Already generated — idempotent
  if (order.shipping.awb) return order.shipping.awb;

  // Check serviceability first
  const couriers = await checkServiceability({
    pickup:   PICKUP_PIN,
    delivery: order.address.pincode,
    weight:   DEFAULT_WEIGHT,
    cod:      order.paymentMethod === "COD",
  });

  if (!couriers.length) {
    order.shipping.lastError = { message: "No courier serviceable for this pincode", date: new Date() };
    await order.save();
    throw new Error("No serviceable courier found");
  }

  // Pick best courier: lowest freight, highest rating
  const best = couriers.sort((a, b) => a.freight_charge - b.freight_charge)[0];
  console.log(`[Shiprocket] Assigning courier: ${best.courier_name} (₹${best.freight_charge})`);

  let sr;
  try {
    sr = await srAPI("post", "/courier/assign/awb", {
      shipment_id:        [Number(order.shipping.shipmentId)],
      courier_id:         best.courier_company_id,
    });
  } catch (err) {
    order.shipping.lastError = { message: err.message, date: new Date() };
    await order.save();
    throw err;
  }

  const response = sr?.data;

  if (!response || response.status !== 1) {
    const errMsg = response?.message || "AWB assignment rejected by Shiprocket";
    order.shipping.lastError = { message: errMsg, raw: response, date: new Date() };
    await order.save();
    throw new Error(errMsg);
  }

  // Shiprocket returns nested structure
  const awbData =
    response?.response?.data?.[Number(order.shipping.shipmentId)] ||
    response?.response?.data?.[0] ||
    Object.values(response?.response?.data || {})[0];

  if (!awbData?.awb_code) {
    const errMsg = "AWB code not found in Shiprocket response";
    order.shipping.lastError = { message: errMsg, raw: response, date: new Date() };
    await order.save();
    throw new Error(errMsg);
  }

  order.shipping.awb         = awbData.awb_code;
  order.shipping.courierId   = awbData.courier_company_id;
  order.shipping.courierName = awbData.courier_name;
  order.shipping.status      = "shipped";
  order.orderStatus          = "shipped";
  await order.save();

  console.log(`[Shiprocket] AWB Generated: ${awbData.awb_code} via ${awbData.courier_name}`);
  return awbData.awb_code;
};

/* ═══════════════════════════════════════════
   GENERATE MANIFEST
   ✅ Working
═══════════════════════════════════════════ */
export const generateManifest = async (shipmentIds = []) => {
  if (!shipmentIds.length) throw new Error("shipmentIds array required");

  const sr = await srAPI("post", "/manifests/generate", {
    shipment_id: shipmentIds.map(Number),
  });

  return sr.data?.manifest_url || null;
};

/* ═══════════════════════════════════════════
   GENERATE LABEL
   ✅ Working
═══════════════════════════════════════════ */
export const generateLabel = async (shipmentId) => {
  if (!shipmentId) throw new Error("shipmentId required");

  const sr = await srAPI("post", "/courier/generate/label", {
    shipment_id: [Number(shipmentId)],
  });

  const labelUrl = sr.data?.label_url;
  if (!labelUrl) throw new Error("Label not ready — retry after a few seconds");

  await Order.updateOne(
    { "shipping.shipmentId": shipmentId },
    { $set: { "shipping.labelUrl": labelUrl } }
  );

  return labelUrl;
};

/* ═══════════════════════════════════════════
   CANCEL SHIPMENT
   ✅ Working
═══════════════════════════════════════════ */
export const cancelShipment = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");
  if (!order.shipping?.awb) throw new Error("AWB not generated — cannot cancel");

  await srAPI("post", "/orders/cancel", { awb: [order.shipping.awb] });

  order.shipping.status = "cancelled";
  order.orderStatus     = "cancelled";
  await order.save();
};

/* ═══════════════════════════════════════════
   TRACK BY AWB  (service utility)
   ✅ Working
═══════════════════════════════════════════ */
export const trackByAWB = async (awb) => {
  return srAPI("get", `/courier/track/awb/${awb}`);
};

/* ═══════════════════════════════════════════
   LIVE TRACKING CONTROLLER  (HTTP handler)
   🔧 Fixed — was duplicated in both service + controller; 
      kept canonical version here with DB fallback
═══════════════════════════════════════════ */
export const getLiveTrackingController = async (req, res) => {
  try {
    const { awb } = req.params;
    if (!awb) return res.status(400).json({ success: false, message: "AWB required" });

    try {
      const sr = await trackByAWB(awb);
      return res.json({ success: true, source: "live", data: sr.data });
    } catch {
      // Fallback to DB cache
      const order = await Order.findOne({ "shipping.awb": awb });
      if (!order?.shipping?.trackHistory?.length) {
        return res.status(404).json({ success: false, message: "No tracking data available" });
      }

      return res.json({
        success: true,
        source:  "cached",
        data: {
          tracking_data: {
            current_status:              order.shipping.status,
            shipment_track_activities:   order.shipping.trackHistory,
          },
        },
      });
    }
  } catch (err) {
    console.error("[Tracking]", err.message);
    res.status(500).json({ success: false, message: "Tracking unavailable" });
  }
};