
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import Address from "../models/address.js";
import { User } from "../models/userModel.js";
import { calculateDeliveryCharge } from "../utils/deliveryCharge.js";
import { syncOrderWithShiprocket } from "../utils/syncOrder.js";
import Notification from "../models/notification.js";
import {io} from "../server.js";





/* ================= CREATE ORDER ================= */
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user.id;
    const { addressId, paymentMethod = "COD" } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    /* ---------------- CART ---------------- */
    const cart = await Cart.findOne({ user: userId }).session(session);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    /* ---------------- ADDRESS ---------------- */
    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    const formattedAddress = {
      name: address.name,
      phone: address.phone,
      line1: `${address.house}, ${address.street}`,
      city: address.city,
      pincode: address.pincode,
    };

    /* ---------------- PAYMENT ---------------- */
    if (!["COD", "Online"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const user = await User.findById(userId).session(session);

    if (paymentMethod === "COD" && !user.codEligible) {
      return res.status(400).json({
        success: false,
        message: "COD not allowed for your account",
      });
    }

    /* ---------------- PRICE + STOCK ---------------- */
    let subtotal = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product).session(session);

      if (!product) {
        throw { status: 400, message: "Invalid product in cart" };
      }

      const variant = product.variants.find(
        (v) => v.weight === item.variant.weight
      );

      if (!variant) {
        throw {
          status: 400,
          message: `Variant ${item.variant.weight} no longer available`,
        };
      }

      if (variant.stock < item.quantity) {
        throw {
          status: 409,
          message: `${product.name} (${variant.weight}) out of stock`,
        };
      }

      // Deduct stock
      variant.stock -= item.quantity;
      await product.save({ session });

      const itemTotal = item.quantity * item.variant.price;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        variant: {
          weight: item.variant.weight,
          price: item.variant.price,
        },
        quantity: item.quantity,
        priceAtPurchase: item.variant.price,
      });
    }

    /* ---------------- CHARGES ---------------- */
    const deliveryCharge = calculateDeliveryCharge(address.city);
    const tax = Math.round(subtotal * 0.12);
    const codCharge = paymentMethod === "COD" ? 20 : 0;
    const totalAmount = subtotal + tax + deliveryCharge + codCharge;

    /* ---------------- CREATE ORDER ---------------- */
    const order = await Order.create(
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
        },
      ],
      { session }
    );

    /* ---------------- CLEANUP ---------------- */
    await Cart.deleteOne({ user: userId }).session(session);

    const notification = await Notification.create({
      type: "order",
      title: "New Order",
      message: `Order ${order[0]._id} placed`,
      link: `/admin/orders/${order[0]._id}`,
    });

    io.emit("admin-notification", notification);

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: order[0],
    });
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

    if (!productId) return res.status(400).json({ success: false, message: "Product ID required" });

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
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
    return res.status(500).json({ success: false, message: "Stock check error" });
  }
};


export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product")
      .sort({ createdAt: -1 });

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
    }).populate("items.product");

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
    // 🔐 ADMIN ONLY — enforce via middleware
    const count = await Order.countDocuments();
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


