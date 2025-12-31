import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import { User } from "../models/userModel.js";
import cloudinary from "cloudinary";
import streamifier from "streamifier";

// --------------------------------------------------------
// CLOUDINARY CONFIG
// --------------------------------------------------------
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file buffer to cloudinary
const uploadBufferToCloudinary = (buffer, folder = "products") =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

// --------------------------------------------------------
// TOKEN GENERATION
// --------------------------------------------------------
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// --------------------------------------------------------
// ADMIN AUTH
// --------------------------------------------------------

// Register admin
export const registerAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });

    const adminExists = await Admin.findOne({ email });
    if (adminExists)
      return res
        .status(409)
        .json({ success: false, message: "Admin already exists" });

    const admin = await Admin.create({ name, email, password });

    res.status(201).json({
      success: true,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
      },
      token: generateToken(admin._id),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Login admin
export const loginAdmin = async (req, res) => {
  try {
    let { email, password } = req.body;
    email = email?.trim().toLowerCase();

    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });

    const admin = await Admin.findOne({ email });
    if (!admin)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    const isMatch = await admin.matchPassword(password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    res.json({
      success: true,
      admin: { _id: admin._id, name: admin.name, email: admin.email },
      token: generateToken(admin._id),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Verify admin token
export const verifyAdmin = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token missing" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    res.json({ admin });
  } catch (err) {
    console.error("verifyAdmin error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};

// --------------------------------------------------------
// PRODUCT MANAGEMENT
// --------------------------------------------------------

export const addProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;

    if (!name || !description || !price || !stock)
      return res.status(400).json({
        success: false,
        message: "Name, description, price and stock are required",
      });

    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "Product image required" });

    // Upload image to Cloudinary
    const uploadResult = await uploadBufferToCloudinary(req.file.buffer);

    const product = await Product.create({
      name,
      description,
      price,
      category,
      stock,
      image: uploadResult.secure_url,
    });

    res.status(201).json({ success: true, product });
  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get all products
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error("getProducts error:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (err) {
    console.error("getProductById error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



export const updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock, image, featured } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    product.name = name || product.name;
    product.description = description || product.description;
    product.price = price || product.price;
    product.category = category || product.category;
    product.stock = stock ?? product.stock;
    product.image = image || product.image;
    product.featured = featured ?? product.featured;

    await product.save();

    res.json({ success: true, product });
  } catch (err) {
    console.error("updateProduct error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// --------------------------------------------------------
// ORDERS
// --------------------------------------------------------

export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("user", "name email");
    res.json(orders);
  } catch (err) {
    console.error("getAllOrders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

export const getOrdersCount = async (req, res) => {
  try {
    const count = await Order.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("getOrdersCount error:", err);
    res.status(500).json({ message: "Failed to fetch orders count" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.orderStatus = status;
    await order.save();

    return res.json({
      success: true,
      message: "Order status updated",
      order,
    });
  } catch (err) {
    console.error("Order status update error:", err);
    res.status(500).json({ message: "Server Error" });
  }
};

// --------------------------------------------------------
// USERS
// --------------------------------------------------------

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("getAllUsers error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

export const usersCount = async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("usersCount error:", err);
    res.status(500).json({ message: "Failed to fetch users count" });
  }
};

// --------------------------------------------------------
// STATS
// --------------------------------------------------------

export const getStats = async (req, res) => {
  try {
    const [usersCount, productsCount, ordersCount] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
    ]);

    res.json({ usersCount, productsCount, ordersCount });
  } catch (err) {
    console.error("getStats error:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};

// --------------------------------------------------------
// EXTRA — PRODUCTS COUNT
// --------------------------------------------------------

export const getProductsCount = async (req, res) => {
  try {
    const count = await Product.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("getProductsCount error:", err);
    res.status(500).json({ message: "Failed to fetch products count" });
  }
};

// --------------------------------------------------------
// IMAGE UPLOAD (Cloudinary)
// --------------------------------------------------------

export const uploadImage = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file provided" });

    const folder = req.body?.folder || "products";

    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      folder
    );

    res.json({
      secure_url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (err) {
    console.error("uploadImage error:", err);
    res.status(500).json({
      message: "Upload failed",
      error: err.message || String(err),
    });
  }
};
