
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import Address from "../models/address.js";
import { User } from "../models/userModel.js";
import { calculateDeliveryCharge } from "../utils/deliveryCharge.js";
import { syncOrderWithShiprocket } from "../utils/syncOrder.js";
import Notification from "../models/notification.js";
import {io} from "../server.js";
import PDFDocument from "pdfkit";
import Cart from "../models/cart.js";



/* ================= CREATE ORDER ================= */
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user.id;
    const { addressId, paymentMethod = "COD" } = req.body;

    if (!userId) {
      throw { status: 401, message: "Unauthorized" };
    }

    /* ---------------- CART ---------------- */
    const cartDoc = await Cart.findOne({ user: userId })
      .session(session)
      .lean(false);

    if (!cartDoc || cartDoc.items.length === 0) {
      throw { status: 400, message: "Cart is empty" };
    }

    /* ---------------- ADDRESS ---------------- */
    const address = await Address.findOne({ _id: addressId, userId })
      .session(session)
      .lean();

    if (!address) {
      throw { status: 404, message: "Address not found" };
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
      throw { status: 400, message: "Invalid payment method" };
    }

    const user = await User.findById(userId).session(session);

    if (paymentMethod === "COD" && !user.codEligible) {
      throw { status: 400, message: "COD not allowed for your account" };
    }

    /* ---------------- PRICE + STOCK ---------------- */
    let subtotal = 0;
    const orderItems = [];

    for (const item of cartDoc.items) {
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
          message: `Variant ${item.variant.weight} not available`,
        };
      }

      if (variant.stock < item.quantity) {
        throw {
          status: 409,
          message: `${product.name} (${variant.weight}) out of stock`,
        };
      }

      // ✅ Deduct stock safely
      variant.stock -= item.quantity;
      await product.save({ session });

      const itemTotal = item.quantity * variant.price;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        variant: {
          weight: variant.weight,
          price: variant.price,
        },
        quantity: item.quantity,
        priceAtPurchase: variant.price,
      });
    }

    /* ---------------- CHARGES ---------------- */
    const deliveryCharge = calculateDeliveryCharge(address.city);
    const tax = Math.round(subtotal * 0.12);
    const codCharge = paymentMethod === "COD" ? 20 : 0;
    const totalAmount = subtotal + tax + deliveryCharge + codCharge;

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
          orderStatus: "placed",
          paymentStatus: paymentMethod === "COD" ? "pending" : "initiated",
        },
      ],
      { session }
    );

    /* ---------------- CLEAR CART (DON'T DELETE) ---------------- */
    cartDoc.items = [];
    await cartDoc.save({ session });

    /* ---------------- NOTIFICATION ---------------- */
    const notification = await Notification.create(
      [
        {
          type: "order",
          title: "New Order",
          message: `Order ${order._id} placed`,
          link: `/admin/orders/${order._id}`,
        },
      ],
      { session }
    );

    io.emit("admin-notification", notification[0]);

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: order,
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



export const generateInvoice = async (req, res) => {
  const order = await Order.findById(req.params.orderId)
    .populate("products.product")
    .populate("address");

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const doc = new PDFDocument({ margin: 40 });

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=invoice-${order._id}.pdf`
  );
  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  // HEADER
  doc.fontSize(20).text("INVOICE", { align: "center" });
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`Order ID: ${order._id}`);
  doc.text(`Date: ${order.createdAt.toDateString()}`);
  doc.text(`Payment: ${order.paymentMethod}`);
  doc.moveDown();

  // ADDRESS
  doc.text("Bill To:", { underline: true });
  doc.text(order.address.name);
  doc.text(
    `${order.address.house}, ${order.address.street}, ${order.address.city}`
  );
  doc.text(`${order.address.state} - ${order.address.pincode}`);
  doc.moveDown();

  // TABLE HEADER
  doc.fontSize(11).text("Product", 40);
  doc.text("Qty", 300);
  doc.text("Price", 350);
  doc.text("Total", 430);
  doc.moveDown();

  let total = 0;

  order.products.forEach((item) => {
    const price = item.variant.price * item.quantity;
    total += price;

    doc.text(item.product.name, 40);
    doc.text(item.quantity.toString(), 300);
    doc.text(`₹${item.variant.price}`, 350);
    doc.text(`₹${price}`, 430);
    doc.moveDown();
  });

  doc.moveDown();
  doc.fontSize(12).text(`Grand Total: ₹${order.totalAmount}`, {
    align: "right",
  });

  doc.end();
};