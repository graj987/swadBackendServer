import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import Address from "../models/address.js";
import { User } from "../models/userModel.js";
import { calculateDeliveryCharge } from "../utils/deliveryCharge.js";
import { syncOrderWithShiprocket } from "../utils/syncOrder.js";
import Notification from "../models/notification.js";
import { io } from "../server.js";
import TrafficLog from "../models/TraficLog.js";

import Cart from "../models/cart.js";

/* ================= CREATE ORDER ================= */
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user.id;
    const {
      addressId,
      paymentMethod = "COD",
      trafficSource, // ✅ ADDED
      sessionId, // ✅ ADDED
    } = req.body;

    if (!userId) {
      throw { status: 401, message: "Unauthorized" };
    }

    /* ---------------- CART ---------------- */
    const cartDoc = await Cart.findOne({ user: userId })
      .session(session)
      .lean(false);

    if (!cartDoc || cartDoc.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart already processed or empty",
      });
    }

    const address = await Address.findOne({ _id: addressId, userId })
      .session(session)
      .lean();

    if (!address) {
      throw { status: 404, message: "Address not found" };
    }

    /* ---------------- ADDRESS VALIDATION ---------------- */
    const pincode = String(address.pincode).replace(/\D/g, "");
    if (pincode.length !== 6) {
      throw { status: 400, message: "Invalid pincode" };
    }

    if (!address.state || !address.state.trim()) {
      throw { status: 400, message: "State is required for delivery" };
    }

    const formattedAddress = {
      name: address.name.trim(),
      phone: address.phone,
      line1: `${address.house}, ${address.street}`,
      city: address.city.trim(),
      state: address.state.trim(),
      pincode,
      country: "India",
    };

    /* ---------------- PAYMENT ---------------- */
    if (!["COD", "Online"].includes(paymentMethod)) {
      throw { status: 400, message: "Invalid payment method" };
    }

    const user = await User.findById(userId).session(session);

    if (paymentMethod === "COD" && !user.codEligible) {
      throw { status: 400, message: "COD not allowed for your account" };
    }

    /* ---------------- PRICE + STOCK ---------------- */
    let subtotal = 0;
    const orderItems = [];
    let isDealOrder = false;

    for (const item of cartDoc.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) throw { status: 400, message: "Invalid product in cart" };

      const variant = product.variants.find(
        (v) => v.weight === item.variant.weight,
      );

      if (!variant) {
        throw { status: 400, message: "Variant not available" };
      }

      if (variant.stock < item.quantity) {
        throw {
          status: 409,
          message: `${product.name} (${variant.weight}) out of stock`,
        };
      }

      /* 🔥 DEAL PRICE LOGIC (CRITICAL) */
      let finalPrice = variant.price;

      if (
        product.isDealActive &&
        product.deal?.discountPercent &&
        finalPrice < variant.price
      ) {
        isDealOrder = true;
      }

      /* STOCK UPDATE */
      variant.stock -= item.quantity;
      await product.save({ session });

      /* SUBTOTAL */
      subtotal += item.quantity * finalPrice;

      /* LOCK PRICE AT PURCHASE */
      orderItems.push({
        product: product._id,
        variant: { weight: variant.weight },
        quantity: item.quantity,
        priceAtPurchase: finalPrice, // 🔒 IMPORTANT
      });
    }

    /* ---------------- CHARGES ---------------- */
    const deliveryCharge = calculateDeliveryCharge(address.city);
    const tax = Math.round(subtotal * 0.12);
    const codCharge = paymentMethod === "COD" ? 20 : 0;
    const totalAmount = subtotal + tax + deliveryCharge + codCharge;

    /* ---------------- ANALYTICS HELPERS ---------------- */
    const now = new Date();

    /* ---------------- CREATE ORDER ---------------- */
    const [order] = await Order.create(
      [
        {
          user: userId,
          items: orderItems,
          address: formattedAddress,

          subtotal,
          tax,
          deliveryCharge,
          codCharge,
          totalAmount,

          paymentMethod,
          paymentStatus: paymentMethod === "COD" ? "pending" : "initiated",
          orderStatus: "placed",

          // ✅ ADDED
          orderNumber: `ORD-${Date.now()}`,
          orderMonth: now.getMonth() + 1,
          orderYear: now.getFullYear(),

          // ✅ Revenue flags
          isDealOrder,
          isPaidOrder: paymentMethod === "Online" ? false : false,
          isRevenueCounted: false,

          // ✅ Conversion tracking
          trafficSource: trafficSource || "direct",
          sessionId: sessionId || null,

          // ✅ Status history init
          statusHistory: [{ status: "placed", date: now }],
        },
      ],
      { session },
    );

    /* ---------------- CLEAR CART ---------------- */
    cartDoc.items = [];
    await cartDoc.save({ session });

    await TrafficLog.updateMany(
      { sessionId, converted: false },
      {
        converted: true,
        convertedAt: new Date(),
      },
    );
    /* ---------------- NOTIFICATION ---------------- */

    const [notification] = await Notification.create(
      [
        {
          type: "order",
          title: "New Order",
          message: `Order ${order.orderNumber} placed`,
          link: `/admin/orders/${order._id}`,
        },
      ],
      { session },
    );

    io.emit("admin-notification", notification);

    await session.commitTransaction();

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    await session.abortTransaction();

    console.error("Create order error:", err);

    res.status(err.status || 500).json({
      success: false,
      message: err.message || "Order creation failed",
    });
  } finally {
    session.endSession();
  }
};

export const checkStock = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId)
      return res
        .status(400)
        .json({ success: false, message: "Product ID required" });

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.stock < quantity) {
      return res.status(409).json({
        success: false,
        message: "Out of stock",
        available: product.stock,
      });
    }

    return res.json({ success: true, message: "Stock available" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Stock check error" });
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .select("_id orderNumber totalAmount paymentStatus orderStatus createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: orders });
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
      .select(
        "_id totalAmount address shipping items createdAt orderStatus paymentStatus",
      )
      .populate({
        path: "items.product",
        select: "name image",
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({ success: true, data: order });
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch order" });
  }
};

export const getOrdersCount = async (req, res) => {
  try {
    const count = await Order.countDocuments().lean();
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch count" });
  }
};

export const updateOrderStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ["preparing", "shipped", "delivered", "cancelled"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found" });

  order.orderStatus = status;
  order.statusHistory.push({ status });

  if (status === "delivered") {
    await User.findByIdAndUpdate(order.user, {
      $inc: { deliveredCount: 1 },
    });
  }

  await order.save();
  res.json({ success: true, data: order });
};

export const cancelOrder = async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    user: req.user.id,
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  if (["shipped", "delivered"].includes(order.orderStatus)) {
    return res.status(400).json({
      success: false,
      message: "Order cannot be cancelled",
    });
  }

  order.orderStatus = "cancelled";
  order.statusHistory.push({ status: "cancelled" });
  await order.save();

  res.json({ success: true, message: "Order cancelled" });
};
