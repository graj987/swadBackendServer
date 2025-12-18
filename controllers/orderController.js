
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Order from "../models/order.js";


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

    const { products, address } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!Array.isArray(products) || products.length === 0 || !address) {
      return res.status(400).json({ success: false, message: "Invalid order data" });
    }

    const productIds = products.map(p => p.product);
    const dbProducts = await Product.find({ _id: { $in: productIds } }).session(session);

    let totalAmount = 0;
    const orderProducts = [];

    for (const item of products) {
      const dbProduct = dbProducts.find(p => p._id.toString() === item.product);
      if (!dbProduct) {
        throw { status: 400, message: "Invalid product in cart" };
      }

      const qty = Math.max(1, Number(item.quantity || 1));

      if (dbProduct.stock < qty) {
        throw { status: 409, message: `${dbProduct.name} out of stock` };
      }

      totalAmount += dbProduct.price * qty;

      orderProducts.push({
        product: dbProduct._id,
        quantity: qty,
        priceAtPurchase: dbProduct.price,
      });

      dbProduct.stock -= qty;
      await dbProduct.save({ session });
    }

    const [order] = await Order.create(
      [{
        user: userId,
        products: orderProducts,
        totalAmount,
        address,
        statusHistory: [{ status: "preparing" }],
      }],
      { session }
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
