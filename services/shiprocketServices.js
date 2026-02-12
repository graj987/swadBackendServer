import axios from "axios";
import Order from "../models/order.js";
import { getShiprocketToken } from "../utils/shiprocketClient.js";

const BASE = process.env.SHIPROCKET_BASE;
const PICKUP = process.env.SHIPROCKET_PICKUP || "Primary";
const DEFAULT_WEIGHT = 0.5;


/* -------------------------------------------------- */
/* CORE API CALL (WITH AUTO RETRY)                    */
/* -------------------------------------------------- */
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
    });
  } catch (err) {
    // retry once if token expired
    if (retry && err.response?.status === 401) {
      return srAPI(method, endpoint, data, false);
    }

    console.error("SHIPROCKET ERROR:", err.response?.data || err.message);
    throw err;
  }
};

/* -------------------------------------------------- */
/* SERVICEABILITY CHECK                               */
/* -------------------------------------------------- */
export const checkServiceability = async ({
  pickup,
  delivery,
  weight,
  cod = false,
}) => {
  console.log("🔎 Checking serviceability with:", { pickup, delivery, weight, cod });

  const url =
    `/courier/serviceability?pickup_postcode=${pickup}` +
    `&delivery_postcode=${delivery}` +
    `&weight=${weight}` +
    `&cod=${cod ? 1 : 0}`;

  console.log("🔎 URL:", url);

  const res = await srAPI("get", url);
  const body = res.data;

  console.log("🔎 Shiprocket response status:", body?.status);

  // Shiprocket sometimes returns HTTP 200 even when logically failed
  if (!body || body.status !== 200) {
    console.error("❌ Serviceability API logical failure:", body);
    return [];
  }

  const couriers = body?.data?.available_courier_companies;

  if (!Array.isArray(couriers)) {
    console.error("❌ Courier list missing in response:", body);
    return [];
  }

  console.log(`✅ Found ${couriers.length} courier options`);

  return couriers;
};



export const createShiprocketOrder = async (orderId) => {
  // prevent duplicate shipment creation
  const order = await Order.findOneAndUpdate(
    { _id: orderId, "shipping.shipmentId": null },
    { $set: { "shipping.status": "creating" } },
    { new: true }
  ).populate("items.product");

  if (!order) throw new Error("Shipment already created or order missing");

  const addr = order.address;

  const [firstName, ...rest] = addr.name.trim().split(" ");
  const lastName = rest.join(" ") || "NA";

  const pincode = String(addr.pincode).replace(/\D/g, "");
  if (pincode.length !== 6) throw new Error("Invalid billing pincode");

  const subTotal = order.items.reduce(
    (sum, i) => sum + i.priceAtPurchase * i.quantity,
    0
  );

  const payload = {
    order_id: order._id.toString(),
    order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
    pickup_location: PICKUP,

    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: addr.line1,
    billing_city: addr.city,
    billing_state: addr.state,
    billing_pincode: pincode,
    billing_country: "India",
    billing_email: "orders@swadbest.com",
    billing_phone: addr.phone,

    shipping_is_billing: true,

    order_items: order.items.map((i) => ({
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
    weight: DEFAULT_WEIGHT,
  };
  
  const sr = await srAPI("post", "/orders/create/adhoc", payload);
  console.log("🚀 Shiprocket RAW RESPONSE:", JSON.stringify(sr.data, null, 2));

  order.shipping.shipmentId = sr.data.shipment_id;
  order.shipping.status = "created";

  // snapshot logistics data
  order.shipping.package = {
    weight: DEFAULT_WEIGHT,
    length: 10,
    breadth: 10,
    height: 10,
  };

  await order.save();

  return order.shipping;
};

export const generateAWB = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order?.shipping?.shipmentId) throw new Error("Shipment not created");

  // already generated → return existing
  if (order.shipping.awb) return order.shipping.awb;

  /* -------------------------------------------------- */
  /* CHECK SERVICEABILITY                               */
  /* -------------------------------------------------- */
  const couriers = await checkServiceability({
    pickup: process.env.PICKUP_PINCODE,
    delivery: order.address.pincode,
    weight: 1,
    cod: false,
  });

  if (!couriers.length) {
    order.shipping.lastError = {
      message: "No courier serviceable for this route",
      date: new Date(),
    };
    await order.save();
    throw new Error("No courier serviceable");
  }

  /* -------------------------------------------------- */
  /* CALL SHIPROCKET AWB API                            */
  /* -------------------------------------------------- */
  let sr;
  try {
    sr = await srAPI("post", "/courier/assign/awb", {
      shipment_id: [Number(order.shipping.shipmentId)],
    });
  } catch (err) {
    order.shipping.lastError = {
      message: err.message,
      date: new Date(),
    };
    await order.save();
    throw err;
  }

  const response = sr?.data;

  console.log("📦 AWB RAW RESPONSE:", JSON.stringify(response, null, 2));

  /* -------------------------------------------------- */
  /* VALIDATE RESPONSE                                  */
  /* -------------------------------------------------- */
  if (!response || response.status !== 1) {
    order.shipping.lastError = {
      message: response?.message || "Shiprocket AWB rejected",
      raw: response,
      date: new Date(),
    };
    await order.save();

    throw new Error(response?.message || "AWB assignment rejected");
  }

  const awbData = response?.response?.data?.[0];

  if (!awbData?.awb_code) {
    order.shipping.lastError = {
      message: "AWB structure missing",
      raw: response,
      date: new Date(),
    };
    await order.save();

    throw new Error("AWB generation failed");
  }

  /* -------------------------------------------------- */
  /* SAVE SUCCESS                                       */
  /* -------------------------------------------------- */
  order.shipping.awb = awbData.awb_code;
  order.shipping.courierId = awbData.courier_company_id;
  order.shipping.courierName = awbData.courier_name;
  order.shipping.status = "shipped";
  order.orderStatus = "shipped";

  await order.save();

  console.log(`✅ AWB GENERATED: ${awbData.awb_code}`);

  return awbData.awb_code;
};

/* -------------------------------------------------- */
/* MANIFEST                                           */
/* -------------------------------------------------- */
export const generateManifest = async (shipmentIds = []) => {
  if (!shipmentIds.length) throw new Error("shipmentIds required");

  const sr = await srAPI("post", "/manifests/generate", {
    shipment_id: shipmentIds.map(Number),
  });

  return sr.data?.manifest_url || null;
};

/* -------------------------------------------------- */
/* CANCEL SHIPMENT                                    */
/* -------------------------------------------------- */
export const cancelShipment = async (orderId) => {
  const order = await Order.findById(orderId);

  if (!order?.shipping?.awb) throw new Error("AWB not generated");

  await srAPI("post", "/orders/cancel", {
    awb: [order.shipping.awb],
  });

  order.shipping.status = "cancelled";
  order.orderStatus = "cancelled";

  await order.save();
};

/* -------------------------------------------------- */
/* GENERATE LABEL                                     */
/* -------------------------------------------------- */
export const generateLabel = async (shipmentId) => {
  if (!shipmentId) throw new Error("shipmentId required");

  const sr = await srAPI("post", "/courier/generate/label", {
    shipment_id: [Number(shipmentId)],
  });

  const labelUrl = sr.data?.label_url;
  if (!labelUrl) throw new Error("Label not generated yet");

  await Order.updateOne(
    { "shipping.shipmentId": shipmentId },
    { $set: { "shipping.labelUrl": labelUrl } }
  );

  return labelUrl;
};
/* -------------------------------------------------- */
/* LIVE TRACKING                                      */
/* -------------------------------------------------- */
export const getLiveTrackingController = async (req, res) => {
  try {
    const { awb } = req.params;

    if (!awb) {
      return res.status(400).json({
        success: false,
        message: "AWB required",
      });
    }

    // Try live tracking from Shiprocket
    try {
      const sr = await srAPI("get", `/courier/track/awb/${awb}`);

      return res.json({
        success: true,
        source: "shiprocket",
        data: sr.data,
      });
    } catch (err) {
      // fallback to DB tracking history
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
export const trackByAWB = async (awb) => {
  return srAPI("get", `/courier/track/awb/${awb}`);
};
