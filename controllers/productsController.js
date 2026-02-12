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

export const getProductHero = async (req, res) => {
  try {
    const product = await Product.findOne({ isHero: true });

    if (!product) {
      return res.status(404).json({ success: false });
    }

    const variant = product.variants[product.heroVariantIndex];

    if (!variant || variant.stock === 0) {
      return res.status(404).json({ success: false });
    }

    res.json({
      success: true,
      id: product._id,
      weight: variant.weight,
      price: variant.price,
      stock: variant.stock,
    });

  } catch (err) {
    res.status(500).json({ success: false });
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

export const getProductsCount = async (req, res) => {
  try {
    const count = await Product.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("getProductsCount:", err);
    res.status(500).json({ message: "Failed to fetch products count", error: err.message });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const query = req.query.query;

    if (!query || query.trim() === "") {
      return res.json([]);
    }

    const results = await Product.find(
      {
        name: { $regex: query, $options: "i" }
      },
      "name image price _id category"
    )
      .limit(10)
      .lean();

    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};

export const toggleFeaturedProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.isFeatured = !product.isFeatured;
    await product.save();

    res.json({
      success: true,
      isFeatured: product.isFeatured,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update featured status" });
  }
};

export const setDealOfTheDay = async (req, res) => {
  try {
    const { discountPercent, startAt, endAt } = req.body;

    if (!discountPercent || !startAt || !endAt) {
      return res.status(400).json({ message: "Invalid deal data" });
    }

    if (new Date(startAt) >= new Date(endAt)) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.deal = {
      isActive: true,
      discountPercent,
      startAt,
      endAt,
    };

    await product.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to set deal" });
  }
};

export const removeDeal = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.deal = {
      isActive: false,
    };

    await product.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Failed to remove deal" });
  }
};

export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({
      isFeatured: true,
      isAvailable: true,
    })
    .sort({ createdAt: -1 })
    .lean();

    const safe = products.map(p => {
      const variant =
        p.variants?.[p.heroVariantIndex] ??
        p.variants?.[0] ??
        null;

      return {
        ...p,
        price: variant?.price || 0,
      };
    });

    res.json({
      success: true,
      data: safe,
    });

  } catch (err) {
    console.error("FEATURED ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getDealsOfTheDay = async (req, res) => {
  try {
    const now = new Date();

    const products = await Product.find({
      "deal.isActive": true,
      "deal.startAt": { $lte: now },
      "deal.endAt": { $gte: now },
      isAvailable: true,
    }).lean();

    const safe = products.map(p => {
      const variant =
        p.variants?.[p.heroVariantIndex] ??
        p.variants?.[0] ??
        null;

      return {
        ...p,
        price: variant?.price || 0,
        discountPercent: p.deal?.discountPercent || 0,
      };
    });

    res.json({
      success: true,
      data: safe,
    });

  } catch (err) {
    console.error("DEALS ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


