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
      return res.status(401).json({ ok:false, message:"Unauthorized" });

    if (!orderId)
      return res.status(400).json({ ok:false, message:"orderId required" });

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order)
      return res.status(404).json({ ok:false, message:"Order not found" });

    if (order.paymentStatus === "paid")
      return res.json({ ok:true, alreadyPaid:true });

    /* ✅ VALIDATE AMOUNT */
    const amount = Number(order.totalAmount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        ok:false,
        message:"Invalid order amount",
      });
    }

    const amountPaise = Math.round(amount * 100);

    /* ✅ PREVENT DUPLICATE RAZORPAY ORDERS */
    if (order.razorpay_order_id) {
      return res.json({
        ok:true,
        razorpayOrder:{
          id: order.razorpay_order_id,
          amount: amountPaise,
          currency:"INR",
        },
      });
    }

    /* ✅ CREATE RAZORPAY ORDER */
    const razorOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `swad_${order._id}`,
      notes: {
        orderId: order._id.toString(),
        userId: userId.toString(),
      },
    });

    order.razorpay_order_id = razorOrder.id;
    await order.save();

    res.json({
      ok:true,
      razorpayOrder: razorOrder,
    });

  } catch (err) {
    console.error("createRazorpayOrder:", err);
    res.status(500).json({
      ok:false,
      message:"Failed to initiate payment",
    });
  }
};

export const verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, message: "Missing fields" });
    }

    /* -------- SIGNATURE VERIFY -------- */
    const expected = crypto
      .createHmac("sha256", RZ_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ ok: false, message: "Invalid signature" });
    }

    /* -------- FETCH PAYMENT FROM RAZORPAY -------- */
    const { data: p } = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { auth: { username: RZ_KEY_ID, password: RZ_KEY_SECRET } }
    );

    if (p.status !== "captured") {
      return res.status(400).json({ ok: false, message: "Payment not captured" });
    }

    /* -------- FIND PAYMENT RECORD -------- */
    const payment = await Payment.findOne({
      razorpay_order_id,
    }).session(session);

    if (!payment) {
      return res.status(404).json({ ok: false, message: "Payment not found" });
    }

    /* -------- IDEMPOTENCY CHECK -------- */
    if (payment.order_created && payment.order) {
      await session.commitTransaction();
      return res.json({
        ok: true,
        orderId: payment.order,
        alreadyProcessed: true,
      });
    }

    if (payment.amount_paise !== p.amount) {
      return res.status(400).json({ ok: false, message: "Amount mismatch" });
    }

    /* -------- CREATE ORDER FROM SNAPSHOT -------- */
    const snapshot = payment.checkout_snapshot;

    if (!snapshot?.products?.length) {
      return res.status(400).json({ ok: false, message: "Invalid snapshot" });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of snapshot.products) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        throw new Error("Product missing during verification");
      }

      const variant = product.variants.find(
        (v) => v.weight === item.variantWeight
      );

      if (!variant || variant.stock < item.quantity) {
        throw new Error("Stock changed before payment verification");
      }

      variant.stock -= item.quantity;
      await product.save({ session });

      subtotal += item.price * item.quantity;

      orderItems.push({
        product: product._id,
        variant: { weight: variant.weight },
        quantity: item.quantity,
        priceAtPurchase: item.price,
      });
    }

    const tax = Math.round(subtotal * 0.12);
    const deliveryCharge = calculateDeliveryCharge(snapshot.address.city);
    const totalAmount = subtotal + tax + deliveryCharge;

    if (Math.round(totalAmount * 100) !== p.amount) {
      throw new Error("Recalculated amount mismatch");
    }

    const now = new Date();

    const [order] = await Order.create(
      [
        {
          user: payment.user,
          items: orderItems,
          address: snapshot.address,
          subtotal,
          tax,
          deliveryCharge,
          totalAmount,
          paymentMethod: snapshot.paymentMethod,
          paymentStatus: "paid",
          orderStatus: "preparing",
          razorpay_order_id,
          razorpay_payment_id: razorpay_payment_id,
          statusHistory: [{ status: "paid", date: now }],
        },
      ],
      { session }
    );

    /* -------- UPDATE PAYMENT -------- */
    payment.order = order._id;
    payment.status = "captured";
    payment.signature_verified = true;
    payment.order_created = true;
    payment.ip = req.ip;
    payment.userAgent = req.get("User-Agent");

    await payment.save({ session });

    await session.commitTransaction();

    return res.json({
      ok: true,
      orderId: order._id,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("verifyPayment error:", err.message);
    return res.status(500).json({
      ok: false,
      message: "Verification failed",
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
      try { await refundPayment(p.id); } catch {}
      return res.status(200).send("non-inr-refunded");
    }

    // Foreign card block
    if (p.method === "card") {
      const issuerCountry = p.card?.country?.toUpperCase();
      if (issuerCountry && issuerCountry !== "IN") {
        order.paymentStatus = "failed";
        await order.save();
        try { await refundPayment(p.id); } catch {}
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
      { upsert: true }
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
