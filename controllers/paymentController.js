// controllers/paymentController.js
import Razorpay from "razorpay";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import Product from "../models/productModel.js";
import mongoose from "mongoose";
import Address from "../models/address.js";

import Order from "../models/order.js";
import Payment from "../models/payment.js";

dotenv.config();

const { RZ_KEY_ID, RZ_KEY_SECRET, RZ_WEBHOOK_SECRET } = process.env;

if (!RZ_KEY_ID || !RZ_KEY_SECRET || !RZ_WEBHOOK_SECRET) {
  console.error("❌ Razorpay env vars missing");
  process.exit(1);
}
function calculateDeliveryCharge(address, subtotal) {
  // Example logic
  if (!address) return 0;

  if (subtotal > 500) return 0; // free delivery above ₹500

  return 40; // default delivery
}

const razorpay = new Razorpay({
  key_id: RZ_KEY_ID,
  key_secret: RZ_KEY_SECRET,
});

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

export const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.body;

    if (!userId)
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });

    if (!orderId)
      return res.status(400).json({
        ok: false,
        message: "orderId required",
      });

    /* ================= FIND ORDER ================= */

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order)
      return res.status(404).json({
        ok: false,
        message: "Order not found",
      });

    /* ================= ALREADY PAID ================= */

    if (order.paymentStatus === "paid") {
      return res.json({
        ok: true,
        alreadyPaid: true,
        orderId: order._id,
      });
    }

    /* ================= AMOUNT VALIDATION ================= */

    const amount = Number(order.totalAmount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Invalid order amount",
      });
    }

    const amountPaise = Math.round(amount * 100);

    /* ================= CREATE RAZORPAY ORDER ================= */

    const razorOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `swad_${order._id}`,
      notes: {
        orderId: order._id.toString(),
        userId: userId.toString(),
      },
    });

    console.log("✅ Razorpay Order Created:", razorOrder.id);

    /* ================= UPDATE ORDER ================= */

    order.razorpay_order_id = razorOrder.id;
    order.paymentStatus = "processing";
    order.paymentInitiatedAt = new Date();

    await order.save();

    /* ================= CREATE PAYMENT RECORD ================= */

    await Payment.create({
      razorpay_order_id: razorOrder.id,
      user: userId,
      order: order._id,
      amount_paise: amountPaise,
      currency: "INR",
      status: "created",
      notes: {
        source: "checkout",
      },
    });

    /* ================= RESPONSE ================= */

    return res.json({
      ok: true,
      razorpayOrder: razorOrder,
    });
  } catch (err) {
    console.error("createRazorpayOrder error:", err);

    return res.status(500).json({
      ok: false,
      message: "Failed to initiate payment",
    });
  }
};

export const verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Missing payment fields",
      });
    }

    /* ================= SIGNATURE VERIFY ================= */

    const expectedSignature = crypto
      .createHmac("sha256", RZ_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Invalid signature",
      });
    }

    /* ================= FETCH PAYMENT FROM RAZORPAY ================= */

    const { data: razorpayPayment } = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        auth: {
          username: RZ_KEY_ID,
          password: RZ_KEY_SECRET,
        },
      },
    );

    if (razorpayPayment.status !== "captured") {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        message: "Payment not captured",
      });
    }

    /* ================= FIND ORDER ================= */

    const order = await Order.findOne({
      razorpay_order_id,
    }).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        ok: false,
        message: "Order not found",
      });
    }

    /* ================= IDEMPOTENCY ================= */

    if (order.paymentStatus === "paid") {
      await session.commitTransaction();
      return res.json({
        ok: true,
        orderId: order._id,
        alreadyProcessed: true,
      });
    }

    /* ================= AMOUNT VALIDATION ================= */

    const expectedAmountPaise = Math.round(order.totalAmount * 100);

    if (expectedAmountPaise !== razorpayPayment.amount) {
      throw new Error("Amount mismatch detected");
    }

    /* ================= STOCK LOCK + DEDUCT ================= */

    for (const item of order.items) {
      const product = await Product.findById(item.product).session(session);

      if (!product) throw new Error("Product missing");

      const variant = product.variants.find(
        (v) => v.weight === item.variant.weight,
      );

      if (!variant || variant.stock < item.quantity) {
        throw new Error("Stock unavailable during verification");
      }

      variant.stock -= item.quantity;
      await product.save({ session });
    }

    /* ================= CLEAR CART ================= */

    await Cart.updateOne(
      { user: order.user },
      { $set: { items: [] } },
      { session },
    );

    /* ================= UPDATE ORDER ================= */

    order.paymentStatus = "paid";
    order.orderStatus = "placed";
    order.razorpay_payment_id = razorpay_payment_id;
    order.razorpay_signature = razorpay_signature;
    order.paymentDetails = razorpayPayment;

    order.statusHistory.push({
      status: "placed",
      date: new Date(),
    });

    await order.save({ session });

    /* ================= UPDATE PAYMENT ================= */

    await Payment.findOneAndUpdate(
      { razorpay_order_id },
      {
        $set: {
          razorpay_payment_id,
          status: "captured",
          signature_verified: true,
          order: order._id,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          raw: razorpayPayment,
        },
      },
      { upsert: true, session },
    );

    await session.commitTransaction();

    return res.json({
      ok: true,
      orderId: order._id,
    });
  } catch (err) {
    await session.abortTransaction();

    console.error("verifyPayment error:", err);

    return res.status(500).json({
      ok: false,
      message: "Payment verification failed",
    });
  } finally {
    session.endSession();
  }
};

export const webhookHandler = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) return res.status(400).send("missing-signature");

    const expected = crypto
      .createHmac("sha256", RZ_WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    if (expected !== signature) {
      console.warn("Invalid webhook signature");
      return res.status(400).send("invalid-signature");
    }

    const event = JSON.parse(req.body.toString());

    if (!["payment.captured", "order.paid"].includes(event.event)) {
      return res.status(200).send("ignored");
    }

    const p = event?.payload?.payment?.entity;
    if (!p?.id || !p?.order_id) {
      return res.status(400).send("invalid-payload");
    }

    const order = await Order.findOne({ razorpay_order_id: p.order_id });
    if (!order) return res.status(200).send("no-order");

    // Idempotency protection
    if (order.paymentStatus === "paid") {
      return res.status(200).send("already-processed");
    }

    // Currency enforcement
    if (String(p.currency).toUpperCase() !== "INR") {
      order.paymentStatus = "failed";
      await order.save();
      try {
        await refundPayment(p.id);
      } catch {}
      return res.status(200).send("non-inr-refunded");
    }

    // Foreign card block
    if (p.method === "card") {
      const issuerCountry = p.card?.country?.toUpperCase();
      if (issuerCountry && issuerCountry !== "IN") {
        order.paymentStatus = "failed";
        await order.save();
        try {
          await refundPayment(p.id);
        } catch {}
        return res.status(200).send("foreign-card-refunded");
      }
    }

    // Mark success
    order.paymentStatus = "paid";
    order.orderStatus = "preparing";
    order.razorpay_payment_id = p.id;
    order.paymentDetails = p;

    order.statusHistory.push({
      status: "paid",
      date: new Date(),
    });

    await order.save();

    // Log / upsert payment safely
    await Payment.findOneAndUpdate(
      { razorpay_payment_id: p.id },
      {
        $set: {
          order: order._id,
          signatureVerified: true,
        },
      },
      { upsert: true },
    );

    // Shipment creation (isolated)
    try {
      await createShiprocketOrder(order._id);
      console.log("Shipment created via webhook");
    } catch (err) {
      console.error("Shipment creation failed:", err.message);
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(500).send("server-error");
  }
};

export const paymentSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Order not found",
      });
    }

    if (order.paymentStatus !== "paid") {
      return res.status(400).json({
        ok: false,
        message: "Payment not completed",
        paymentStatus: order.paymentStatus,
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Payment successful",
      orderId: order._id,
      paymentId: order.razorpay_payment_id,
      amount: order.totalAmount,
      status: order.orderStatus,
    });
  } catch (error) {
    console.error("paymentSuccess error:", error);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
};
