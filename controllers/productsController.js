import productModel from "../models/productModel.js";
const Product = productModel;

export const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Error fetching product" });
  }
};

export const addProduct = async (req, res) => {
  try {
    const { name, price, category } = req.body;

    if (!name || !price || !req.file) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const uploadRes = await cloudinary.uploader.upload(req.file.path, {
      folder: "products",
    });

    const product = await Product.create({
      name,
      price,
      category,
      image: uploadRes.secure_url,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Product upload failed" });
  }
};

export const getProductsCount = async (req, res) => {
  try {
    const count = await Product.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("getProductsCount:", err);
    res.status(500).json({ message: "Failed to fetch products count", error: err.message });
  }
};