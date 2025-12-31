// controllers/paymentController.js
import Razorpay from "razorpay";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

import Order from "../models/order.js";
import Payment from "../models/payment.js";

dotenv.config();

const { RZ_KEY_ID, RZ_KEY_SECRET, RZ_WEBHOOK_SECRET } = process.env;

if (!RZ_KEY_ID || !RZ_KEY_SECRET || !RZ_WEBHOOK_SECRET) {
  console.error("❌ Razorpay env vars missing");
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: RZ_KEY_ID,
  key_secret: RZ_KEY_SECRET,
});

/* ============================================================
   HELPER → Refund (full or partial)
============================================================ */
async function refundPayment(paymentId, amountPaise = null) {
  try {
    if (amountPaise) {
      return await razorpay.payments.refund(paymentId, { amount: amountPaise });
    }
    return await razorpay.payments.refund(paymentId);
  } catch (err) {
    console.error("Refund error:", err.response?.data || err.message);
    throw err;
  }
}

/* ============================================================
   1️⃣ CREATE RAZORPAY ORDER
============================================================ */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId)
      return res.status(400).json({ ok: false, message: "orderId is required" });

    const order = await Order.findById(orderId);
    if (!order)
      return res.status(404).json({ ok: false, message: "Order not found" });

    const amountPaise = Math.round(order.totalAmount * 100);

    const rzOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `swad_${order._id}`,
      payment_capture: 1,
    });

    order.razorpay_order_id = rzOrder.id;
    await order.save();

    return res.json({ ok: true, razorpayOrder: rzOrder });
  } catch (err) {
    console.error("createRazorpayOrder:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/* ============================================================
   2️⃣ VERIFY PAYMENT (CALLED BY FRONTEND)
============================================================ */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, message: "Missing fields" });
    }

    // verify signature
    const generatedSignature = crypto
      .createHmac("sha256", RZ_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ ok: false, message: "Invalid signature" });
    }

    // fetch authoritative payment data
    const paymentResp = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        auth: { username: RZ_KEY_ID, password: RZ_KEY_SECRET },
      }
    );

    const p = paymentResp.data;

    // persist payment to DB
    const savedPayment = await Payment.createOrUpdateFromRazorpay(p, {
      signatureVerified: true,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // find corresponding order
    const order = await Order.findOne({ razorpay_order_id });

    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // India-only enforcement
    if (p.currency.toUpperCase() !== "INR") {
      order.paymentStatus = "failed";
      await order.save();

      try {
        await refundPayment(razorpay_payment_id);
      } catch (e) {
        console.error("Auto refund failed:", e);
      }

      return res.json({
        ok: false,
        reason: "non-INR",
        refunded: true,
      });
    }

    // blocked foreign cards
    if (p.method === "card") {
      const country = p.card?.country?.toUpperCase();
      if (country && country !== "IN") {
        order.paymentStatus = "failed";
        await order.save();

        try {
          await refundPayment(razorpay_payment_id);
        } catch (e) {
          console.error("Refund foreign card:", e);
        }

        return res.json({
          ok: false,
          reason: "non-Indian-card",
          refunded: true,
        });
      }
    }

    // Accept payment
    order.paymentStatus = "paid";
    order.orderStatus = "preparing";
    order.razorpay_payment_id = p.id;
    order.paymentDetails = p;

    await order.save();

    await Payment.findOneAndUpdate(
      { razorpay_payment_id },
      { $set: { order: order._id } }
    );

    return res.json({ ok: true, orderId: order._id, payment: savedPayment });
  } catch (err) {
    console.error("verifyPayment:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/* ============================================================
   3️⃣ WEBHOOK HANDLER (MOST IMPORTANT — AUTHORITATIVE)
============================================================ */
export const webhookHandler = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const bodyString = JSON.stringify(req.body);

    const expected = crypto
      .createHmac("sha256", RZ_WEBHOOK_SECRET)
      .update(bodyString)
      .digest("hex");

    if (expected !== signature) {
      console.warn("❌ Invalid webhook signature");
      return res.status(400).send("invalid signature");
    }

    const ev = req.body;

    if (["payment.captured", "order.paid"].includes(ev.event)) {
      const p = ev.payload.payment.entity;

      // upsert payment
      const savedPayment = await Payment.createOrUpdateFromRazorpay(p, {
        signatureVerified: true,
      });

      // find associated order
      const order = await Order.findOne({
        razorpay_order_id: p.order_id,
      });

      if (!order) return res.status(200).send("no-order");

      // India-only enforcement
      if (String(p.currency).toUpperCase() !== "INR") {
        order.paymentStatus = "failed";
        await order.save();

        try {
          await refundPayment(p.id);
        } catch (e) {
          console.error("Webhook refund error:", e);
        }

        return res.status(200).send("non-inr-refunded");
      }

      // block foreign cards
      if (p.method === "card") {
        const issuerCountry = p.card?.country?.toUpperCase();
        if (issuerCountry && issuerCountry !== "IN") {
          order.paymentStatus = "failed";
          await order.save();

          try {
            await refundPayment(p.id);
          } catch (e) {
            console.error("Webhook refund card:", e);
          }

          return res.status(200).send("foreign-card-refunded");
        }
      }

      // Accept payment
      order.paymentStatus = "paid";
      order.orderStatus = "preparing";
      order.razorpay_payment_id = p.id;
      order.paymentDetails = p;
      await order.save();

      return res.status(200).send("ok");
    }

    return res.status(200).send("ignored");
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("server error");
  }
};
