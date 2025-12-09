import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import Product from "../models/productModel.js";
import Order from "../models/order.js";
import {User} from "../models/userModel.js";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import cloudinary from "cloudinary";
import streamifier from "streamifier";
import dotenv from "dotenv";
dotenv.config();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const uploadBufferToCloudinary = (buffer, folder = "products") =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

// @desc Register new admin
export const registerAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const adminExists = await Admin.findOne({ email });
    if (adminExists)
      return res.status(400).json({ message: "Admin already exists" });

    const admin = await Admin.create({ name, email, password });
    res.status(201).json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      token: generateToken(admin._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Login admin
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isMatch = await admin.matchPassword(password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      token: generateToken(admin._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Get all orders (Admin only)
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("user", "name email");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select("-password")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // newest first

    const total = await User.countDocuments();

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      users
    });

  } catch (err) {
    console.error("getAllUsers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// @desc Add new product (Admin only)
export const addProduct = async (req, res) => {
  try {
    const { name, description, price, image, category } = req.body;

    const product = new Product({
      name,
      description,
      price,
      image,
      category,
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Delete product (Admin only)
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const [usersCount, productsCount, ordersCount] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments()
    ]);
    return res.json({ usersCount, productsCount, ordersCount });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({ message: "Failed to fetch stats", error: err.message });
  }
};
export const usersCount = async (req,res) => {
  try {
    const count = await User.countDocuments();
    res.json({ count });
  }
  catch (err) {
    console.error("usersCount:", err);
    res.status(500).json({ message: "Failed to fetch users count", error: err.message });
  }
};
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error("getProducts error:", err);
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};
export const getOrdersCount = async (req,res) => {
  try {
    const count = await Order.countDocuments();
    res.json({ count });
  }
  catch (err) {
    console.error("getOrdersCount:", err);
    res.status(500).json({ message: "Failed to fetch orders count", error: err.message });
  }
};

export const getProductsCount = async (req,res) => {
  try {
    const count = await Product.countDocuments();
    res.json({ count });
  }
  catch (err) {
    console.error("getProductsCount:", err);
    res.status(500).json({ message: "Failed to fetch products count", error: err.message });
  }
};  
export const verifyAdmin = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided." });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token missing." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    res.json({ admin });
  } catch (err) {
    console.log(err);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};
export const uploadImage = async (req, res) => {
  try {
    // multer will place file in req.file
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = req.body?.folder || "products";
    const result = await uploadBufferToCloudinary(req.file.buffer, folder);

    return res.json({
      secure_url: result.secure_url,
      public_id: result.public_id,
      raw: result,
    });
  } catch (err) {
    console.error("uploadImage error:", err);
    return res.status(500).json({ message: "Upload failed", error: err.message || String(err) });
  }
};