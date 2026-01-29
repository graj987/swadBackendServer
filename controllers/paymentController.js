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
    const { orderId } = req.body;
    if (!orderId)
      return res
        .status(400)
        .json({ ok: false, message: "orderId is required" });

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

export const verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      throw new Error("Missing payment fields");
    }

    /* ---------------- SIGNATURE VERIFY ---------------- */
    const expected = crypto
      .createHmac("sha256", RZ_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      throw new Error("Invalid Razorpay signature");
    }

    /* ---------------- FETCH PAYMENT ---------------- */
    const { data: p } = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { auth: { username: RZ_KEY_ID, password: RZ_KEY_SECRET } },
    );

    if (p.status !== "captured") {
      throw new Error("Payment not captured");
    }

    /* ---------------- ORDER ---------------- */
    const order = await Order.findOne({ razorpay_order_id }).session(session);
    if (!order) throw new Error("Order not found");

    // Idempotency
    if (order.paymentStatus === "paid") {
      await session.commitTransaction();
      return res.json({ ok: true, alreadyProcessed: true });
    }

    /* ---------------- AMOUNT CHECK ---------------- */
    if (p.amount !== order.totalAmount * 100) {
      order.paymentStatus = "failed";
      await order.save({ session });
      await refundPayment(razorpay_payment_id);
      throw new Error("Amount mismatch");
    }

    /* ---------------- CURRENCY + CARD CHECK ---------------- */
    if (p.currency !== "INR") {
      order.paymentStatus = "failed";
      await order.save({ session });
      await refundPayment(razorpay_payment_id);
      throw new Error("Non-INR payment blocked");
    }

    if (p.method === "card" && p.card?.country !== "IN") {
      order.paymentStatus = "failed";
      await order.save({ session });
      await refundPayment(razorpay_payment_id);
      throw new Error("Foreign card blocked");
    }

    /* ---------------- MARK SUCCESS ---------------- */
    order.paymentStatus = "paid";
    order.orderStatus = "preparing";
    order.razorpay_payment_id = p.id;
    order.paymentDetails = p;

    order.statusHistory.push({
      status: "paid",
      date: new Date(),
    });

    await order.save({ session });

    /* ---------------- LINK PAYMENT ---------------- */
    await Payment.findOneAndUpdate(
      { razorpay_payment_id },
      {
        $set: {
          order: order._id,
          signatureVerified: true,
          ip: req.headers["x-forwarded-for"] || req.ip,
          userAgent: req.get("User-Agent"),
        },
      },
      { session },
    );

    await createShiprocketOrder(order._id)
      .then(() => console.log("Shiprocket order auto-created"))
      .catch((err) =>
        console.error("Shiprocket auto-create failed:", err.message),
      );

    await session.commitTransaction();

    return res.json({
      ok: true,
      orderId: order._id,
      shipmentCreated: true,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("verifyPayment:", err.message);

    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};

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
