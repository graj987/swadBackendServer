
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import Address from "../models/address.js";
import {User} from "../models/userModel.js";  
import { calculateDeliveryCharge } from "../utils/deliveryCharge.js";
import { syncOrderWithShiprocket } from "../utils/syncOrder.js";
import axios from "axios";

/* ---------------- PRODUCTS ---------------- */

export const getProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .select("name price image")
      .lean();

    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching products" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    res.json({ success: true, data: product });
  } catch {
    res.status(500).json({ success: false, message: "Error fetching product" });
  }
};

export const addProduct = async (req, res) => {
  try {
    const { name, price, image } = req.body;

    if (!name || !price || price <= 0) {
      return res.status(400).json({ success: false, message: "Invalid product data" });
    }

    const product = await Product.create({ name, price, image });
    res.status(201).json({ success: true, data: product });
  } catch {
    res.status(400).json({ success: false, message: "Error adding product" });
  }
};

/* ---------------- ORDERS ---------------- */
// Convert Address to match the Order schema


export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { products, addressId, paymentMethod } = req.body;
    const userId = req.userId;

    /* ---------------- AUTH CHECK ---------------- */
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    /* ---------------- PAYMENT CHECK ---------------- */
    const validPayments = ["Online", "COD"];
    if (!validPayments.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    /* ---------------- ADDRESS CHECK ---------------- */
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address is required" });
    }

    const address = await Address.findOne({ _id: addressId, userId }).lean();

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // Validate required fields
    const required = ["name", "phone", "house", "street", "pincode", "city", "state"];
    for (const f of required) {
      if (!address[f]) {
        return res.status(400).json({
          success: false,
          message: `Address missing field: ${f}`,
        });
      }
    }

    /* ---------------------------------------------------
       FIX: Format address exactly as Order model requires
    ----------------------------------------------------*/
    const formattedAddress = {
      line1: `${address.house}, ${address.street}`,
      line2: address.landmark || "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      name: address.name,
      phone: address.phone,
    };

    /* ---------------- REGION ---------------- */
    let region = "remote";
    const metros = ["Delhi", "Mumbai", "Chennai", "Kolkata", "Bengaluru", "Hyderabad", "Pune", "Ahmedabad"];

    if (metros.includes(address.city)) region = "metro";
    else if (["Bihar", "UP", "Jharkhand"].includes(address.state)) region = "local";

    const deliveryCharge = calculateDeliveryCharge(region);

    /* ---------------- COD CHECK ---------------- */
    const user = await User.findById(userId);
    if (paymentMethod === "COD" && !user.codEligible) {
      return res.status(400).json({
        success: false,
        message: "COD not available for your account",
      });
    }

    const codCharge = paymentMethod === "COD" ? 20 : 0;

    /* ---------------- PRODUCT VALIDATION ---------------- */
    const productIds = products.map((p) => p.product);
    const dbProducts = await Product.find({ _id: { $in: productIds } }).session(session);

    let subtotal = 0;
    const orderProducts = [];

    for (const item of products) {
      const dbProduct = dbProducts.find((p) => p._id.toString() === item.product);

      if (!dbProduct) throw { status: 400, message: "Invalid product" };

      const qty = Math.max(1, item.quantity);

      if (dbProduct.stock < qty) {
        throw { status: 409, message: `${dbProduct.name} is out of stock` };
      }

      subtotal += dbProduct.price * qty;

      orderProducts.push({
        product: dbProduct._id,
        quantity: qty,
        priceAtPurchase: dbProduct.price,
      });

      dbProduct.stock -= qty;
      await dbProduct.save({ session });
    }

    /* ---------------- PRICE CALCULATION ---------------- */
    const tax = Math.round(subtotal * 0.12);
    const totalAmount = subtotal + tax + deliveryCharge + codCharge;

    /* ---------------- CREATE ORDER ---------------- */
    const [order] = await Order.create(
      [
        {
          user: userId,
          products: orderProducts,
          subtotal,
          tax,
          deliveryCharge,
          codCharge,
          totalAmount,
          address: formattedAddress, // <-- FIXED
          paymentMethod,
          region,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      data: order,
    });

  } catch (err) {
    await session.abortTransaction();

    console.error("Order creation error →", err);

    return res.status(err.status || 500).json({
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
    const orders = await Order.find({ user: req.userId })
      .populate("products.product")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });
  } catch {
    res.status(500).json({ success: false, message: "Error fetching orders" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate("products.product");

    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    res.json({ success: true, data: order });
  } catch {
    res.status(500).json({ success: false, message: "Error fetching order" });
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
  try {
    const { status } = req.body;
    const { id } = req.params;

    const allowed = ["packed", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    // If delivered → increment counter
    if (status === "delivered") {
      await User.findByIdAndUpdate(order.user, { $inc: { deliveredCount: 1 } });

      const user = await User.findById(order.user);

      // Unlock COD after 2 delivered orders
      if (user.deliveredCount >= 2 && !user.codEligible) {
        user.codEligible = true;
        await user.save();
      }
    }
    await order.save();

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status" });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      _id: id,
      user: req.userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Already cancelled
    if (order.orderStatus === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled"
      });
    }

    // Delivered -> can't cancel
    if (order.orderStatus === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Delivered orders cannot be cancelled"
      });
    }

    // Shipped -> block cancellation (Shiprocket reject)
    if (order.orderStatus === "shipped") {
      return res.status(400).json({
        success: false,
        message: "Order already shipped. Contact support for help"
      });
    }

    // Allowed only in preparing/processing
    order.orderStatus = "cancelled";

    order.statusHistory.push({
      status: "cancelled",
      date: new Date()
    });

    await order.save();

    return res.json({
      success: true,
      message: "Order cancelled successfully",
      data: order
    });

  } catch (err) {
    console.error("Cancel error:", err);
    return res.status(500).json({
      success: false,
      message: "Error cancelling order"
    });
  }
};


