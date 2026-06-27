import productModel from "../models/productModel.js";

const Product = productModel;

export const getProducts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const filter = { isAvailable: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("getProducts error:", error);
    res.status(500).json({ success: false, message: "Error fetching products" });
  }
};

export const getProductHero = async (req, res) => {
  try {
    const product = await Product.findOne({ isHero: true }).lean();

    if (!product) {
      return res.status(404).json({ success: false, message: "No hero product set" });
    }

    const variant = product.variants[product.heroVariantIndex ?? 0];

    if (!variant) {
      return res.status(404).json({ success: false, message: "Hero variant not configured" });
    }

    res.json({
      success: true,
      id: product._id,
      name: product.name,
      image: product.image,
      weight: variant.weight,
      price: variant.price,
      stock: variant.stock,
      // Full variants array — needed by frontend hero panel size selector
      variants: product.variants,
      heroVariantIndex: product.heroVariantIndex ?? 0,
    });

  } catch (err) {
    console.error("getProductHero error:", err);
    res.status(500).json({ success: false, message: "Server error" });
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


export const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    // 1️⃣ Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 2️⃣ Check if already reviewed
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res
        .status(400)
        .json({ message: "You have already reviewed this product" });
    }

    // 3️⃣ Create review object
    const review = {
      user: req.user._id,
      name: req.user.name,
      rating: Number(rating),
      comment,
    };

    // 4️⃣ Push review
    product.reviews.push(review);

    // 5️⃣ Update review count
    product.numReviews = product.reviews.length;

    // 6️⃣ Recalculate average rating
    product.rating =
      product.reviews.reduce((acc, item) => acc + item.rating, 0) /
      product.reviews.length;

    await product.save();

    res.status(201).json({ message: "Review added successfully" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const getLatestProducts = async (req, res) => {
  try {
    const products = await Product.find({
      isAvailable: true
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .select(
        "name category image variants rating numReviews deal isFeatured createdAt"
      )
      .lean();

    const formattedProducts = products.map((product) => {
      const basePrice = product.variants?.[0]?.price || 0;

      let finalPrice = basePrice;

      if (
        product.deal?.isActive &&
        product.deal?.discountPercent &&
        new Date() >= new Date(product.deal.startAt) &&
        new Date() <= new Date(product.deal.endAt)
      ) {
        finalPrice = Math.round(
          basePrice - (basePrice * product.deal.discountPercent) / 100
        );
      }

      return {
        ...product,
        basePrice,
        finalPrice,
      };
    });

    res.status(200).json({
      success: true,
      count: formattedProducts.length,
      data: formattedProducts,
    });
  } catch (error) {
    console.error("LATEST PRODUCTS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error while fetching latest products",
    });
  }
};