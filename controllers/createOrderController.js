// controllers/orderController.js
import mongoose from "mongoose";
import Cart         from "../models/cart.js";
import Address      from "../models/address.js";
import Order        from "../models/order.js";
import Product      from "../models/productModel.js";
import { User } from "../models/userModel.js";
import Notification from "../models/notification.js";
import TrafficLog   from "../models/TraficLog.js";
import { io }       from "../server.js";

import { calculatePricing }         from "../utils/pricengine.js";
import { syncOrderWithShiprocket }  from "../utils/syncOrder.js";

// ─────────────────────────────────────────────────────────────────
//  Helper — is this the user's first ever order?
//  Runs inside the session for transaction consistency.
// ─────────────────────────────────────────────────────────────────
async function getIsFirstOrder(userId, session) {
  const count = await Order.countDocuments({ user: userId }).session(session);
  return count === 0;
}

// ─────────────────────────────────────────────────────────────────
//  POST /api/orders/price-preview
//  Returns full pricing breakdown — no order created.
//  Called by frontend on every address + payment method change.
// ─────────────────────────────────────────────────────────────────
export const pricePreview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethod } = req.body;

    if (!addressId || !paymentMethod) {
      return res.status(400).json({ success: false, message: "addressId and paymentMethod required" });
    }
    if (!["COD", "Online"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    // ── Cart ──
    const cartDoc = await Cart.findOne({ user: userId }).lean();
    if (!cartDoc?.items?.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // ── Address ──
    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    // ── Build subtotal ──
    let subtotal = 0;
    const lineItems = [];

    for (const item of cartDoc.items) {
      const product = await Product.findById(item.product).lean();
      if (!product) return res.status(400).json({ success: false, message: "Invalid product in cart" });

      const variant = product.variants.find((v) => v.weight === item.variant?.weight);
      if (!variant) return res.status(400).json({ success: false, message: `Variant not found for ${product.name}` });

      const lineTotal = variant.price * item.quantity;
      subtotal += lineTotal;
      lineItems.push({
        name: product.name, weight: variant.weight,
        qty: item.quantity, unitPrice: variant.price, lineTotal,
      });
    }

    // ── First order check ──
    const isFirstOrder = await getIsFirstOrder(userId, null);

    // ── Pricing ──
    const pricing = calculatePricing(subtotal, paymentMethod, isFirstOrder, address.city);

    return res.json({
      success: true,
      data: { ...pricing, lineItems },
    });

  } catch (err) {
    console.error("Price preview error:", err);
    return res.status(500).json({ success: false, message: "Failed to calculate pricing" });
  }
};

// ─────────────────────────────────────────────────────────────────
//  POST /api/orders/postorders
//  Creates the order. Uses same pricingEngine — no price drift.
// ─────────────────────────────────────────────────────────────────
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user.id;
    const {
      addressId,
      paymentMethod = "COD",
      trafficSource,
      sessionId,
    } = req.body;

    if (!userId) throw { status: 401, message: "Unauthorized" };
    if (!["COD", "Online"].includes(paymentMethod)) {
      throw { status: 400, message: "Invalid payment method" };
    }

    /* ── Cart ── */
    const cartDoc = await Cart.findOne({ user: userId }).session(session).lean(false);
    if (!cartDoc || cartDoc.items.length === 0) {
      throw { status: 400, message: "Cart empty" };
    }

    /* ── Address ── */
    const address = await Address.findOne({ _id: addressId, userId }).session(session);
    if (!address) throw { status: 404, message: "Address not found" };

    const formattedAddress = {
      name:    address.name.trim(),
      phone:   address.phone,
      line1:   `${address.house}, ${address.street}`,
      city:    address.city.trim(),
      state:   address.state.trim(),
      pincode: String(address.pincode),
      country: "India",
    };

    /* ── COD eligibility ── */
    const user = await User.findById(userId).session(session);
    if (paymentMethod === "COD" && !user.codEligible) {
      throw { status: 400, message: "COD not allowed" };
    }

    /* ── First order check (inside transaction — race-condition safe) ── */
    const isFirstOrder = await getIsFirstOrder(userId, session);

    /* ── Stock validation + subtotal ── */
    let subtotal = 0;
    const orderItems = [];

    for (const item of cartDoc.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) throw { status: 400, message: "Invalid product" };

      const variant = product.variants.find((v) => v.weight === item.variant.weight);
      if (!variant || variant.stock < item.quantity) {
        throw { status: 409, message: `${product.name} out of stock` };
      }

      subtotal += variant.price * item.quantity;

      orderItems.push({
        product:         product._id,
        variant:         { weight: variant.weight },
        quantity:        item.quantity,
        priceAtPurchase: variant.price,
      });

      // Decrement stock atomically inside transaction
      await Product.updateOne(
        { _id: product._id, "variants.weight": variant.weight },
        { $inc: { "variants.$.stock": -item.quantity } },
        { session }
      );
    }

    /* ── Pricing — single source of truth ── */
    const pricing = calculatePricing(subtotal, paymentMethod, isFirstOrder, address.city);

    const now = new Date();

    /* ── Create Order ── */
    const [order] = await Order.create(
      [{
        user:    userId,
        items:   orderItems,
        address: formattedAddress,

        // Pricing breakdown
        subtotal:       pricing.subtotal,
        baseAmount:     pricing.baseAmount,
        gstAmount:      pricing.gstAmount,
        deliveryCharge: pricing.deliveryCharge,
        codCharge:      pricing.codCharge,
        totalAmount:    pricing.totalAmount,

        // Promo tracking
        isFirstOrder:  pricing.isFirstOrder,
        deliverySaved: pricing.deliverySaved,

        // Shiprocket sync fields (set after sync)
        shiprocketSynced:    false,
        shiprocketSyncFailed: false,

        paymentMethod,
        paymentStatus: "pending",
        orderStatus:   "created",

        orderNumber: `SB-${Date.now()}`,
        orderMonth:  now.getMonth() + 1,
        orderYear:   now.getFullYear(),

        isRevenueCounted: false,
        trafficSource:    trafficSource || "direct",
        sessionId:        sessionId || null,

        statusHistory: [{ status: "created", date: now }],
      }],
      { session }
    );

    /* ── Traffic log ── */
    if (trafficSource || sessionId) {
      await TrafficLog.create([{
        userId,
        orderId:       order._id,
        trafficSource: trafficSource || "direct",
        sessionId:     sessionId || null,
        event:         "order_created",
        createdAt:     now,
      }], { session }).catch(() => {}); // non-critical — don't fail order
    }

    /* ── Clear cart for COD (Online clears after payment verify) ── */
    if (paymentMethod === "COD") {
      cartDoc.items = [];
      await cartDoc.save({ session });
    }

    await session.commitTransaction();

    /* ── Post-commit: Notification + Socket + Shiprocket (async, non-blocking) ── */
    // These run AFTER the transaction commits so they don't affect order creation.

    // In-app notification
    Notification.create({
      userId,
      type:    "order_placed",
      title:   "Order Placed!",
      message: `Your order #${order.orderNumber} has been placed successfully.`,
      orderId: order._id,
      read:    false,
    }).catch((e) => console.error("Notification create failed:", e));

    // Real-time socket event
    io.to(String(userId)).emit("order:placed", {
      orderId:     order._id,
      orderNumber: order.orderNumber,
      totalAmount: pricing.totalAmount,
      isFirstOrder: pricing.isFirstOrder,
    });

    // Shiprocket sync — only for COD (Online syncs after payment verify)
    if (paymentMethod === "COD") {
      const authHeader = req.headers.authorization;
      syncOrderWithShiprocket(String(order._id), authHeader);
      // Fire-and-forget — don't await, customer already has their response
    }

    return res.status(201).json({
      success: true,
      data: order,      // keeps your existing frontend contract (data, not order)
      pricing,          // extra — for confirmation screen
    });

  } catch (err) {
    await session.abortTransaction();
    console.error("Create order error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Order creation failed",
    });
  } finally {
    session.endSession();
  }
};