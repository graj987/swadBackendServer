
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import { calculateDeliveryCharge } from "../utils/deliveryCharge.js";
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





export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { products, address, paymentMethod } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!Array.isArray(products) || products.length === 0 || !address) {
      return res.status(400).json({ success: false, message: "Invalid order data" });
    }

    // --------------------------------------------------
    // 1️⃣ COD FRAUD PROTECTION — Backend Level Check
    // --------------------------------------------------
    if (paymentMethod === "COD") {
      const codCheck = await axios.get(
        `${process.env.BASE_URL}/api/cod/check`,
        { headers: { Authorization: req.headers.authorization } }
      );

      if (!codCheck.data.codAllowed) {
        throw { status: 403, message: codCheck.data.message };
      }
    }

    // --------------------------------------------------
    // 2️⃣ FETCH PRODUCTS
    // --------------------------------------------------
    const productIds = products.map((p) => p.product);
    const dbProducts = await Product.find({ _id: { $in: productIds } }).session(session);

    let subtotal = 0;
    const orderProducts = [];

    // --------------------------------------------------
    // 3️⃣ VALIDATE PRODUCTS + CHECK STOCK
    // --------------------------------------------------
    for (const item of products) {
      const dbProduct = dbProducts.find((p) => p._id.toString() === item.product);

      if (!dbProduct) throw { status: 400, message: "Invalid product in cart" };

      const qty = Math.max(1, Number(item.quantity || 1));

      if (dbProduct.stock < qty) {
        throw { status: 409, message: `${dbProduct.name} is out of stock` };
      }

      subtotal += dbProduct.price * qty;

      orderProducts.push({
        product: dbProduct._id,
        quantity: qty,
        priceAtPurchase: dbProduct.price,
      });

      // Reduce stock
      dbProduct.stock -= qty;
      await dbProduct.save({ session });
    }


    // GST = 12% (your selection)
    const tax = Math.round(subtotal * 0.12);

    // Delivery charge (using region lookup)
    const pincode = address.pincode?.toString();
    let region = "metro";

    // Fetch region from our pincode API
    try {
      const pinRes = await axios.get(`${process.env.BASE_URL}/api/pincode/${pincode}`);
      region = pinRes.data.region || "metro";
    } catch {
      region = "remote"; // fallback if postal API fails
    }

    const deliveryCharge = calculateDeliveryCharge(region);

    // COD Charge (only if allowed)
    const codCharge = paymentMethod === "COD" ? 20 : 0;

    // FINAL PRICE — server authoritative
    const totalAmount = subtotal + tax + deliveryCharge + codCharge;

    // --------------------------------------------------
    // 5️⃣ CREATE ORDER (transaction safe)
    // --------------------------------------------------
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

          address,
          paymentMethod,

          paymentStatus: "pending",
          statusHistory: [{ status: "preparing", date: new Date() }],

          // helpful for COD fraud detection later
          region,
        },
      ],
      { session }
    );

    // After order is successfully created:
    await axios.post(
      `${process.env.BASE_URL}/api/shiprocket/create-orde`,
      { orderId: order._id },
      { headers: { Authorization: req.headers.authorization } }
    );

    // Auto-generate AWB
    await axios.post(
      `${process.env.BASE_URL}/api/shiprocket/awb`,
      { orderId: order._id },
      { headers: { Authorization: req.headers.authorization } }
    );

    // Auto-generate shipping label
    await axios.get(
      `${process.env.BASE_URL}/api/shiprocket/label/${order._id}`,
      { headers: { Authorization: req.headers.authorization } }
    );

    await session.commitTransaction();

    return res.status(201).json({ success: true, data: order });


  } catch (err) {
    await session.abortTransaction();

    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Order creation failed",
    });
  } finally {
    session.endSession();
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

    order.orderStatus = status;
    order.statusHistory.push({ status });

    await order.save();

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status" });
  }
};
