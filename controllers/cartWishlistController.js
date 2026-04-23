import Cart from "../models/cart.js";
import Wishlist from "../models/wishlist.js";
import Product from "../models/productModel.js";

/* ================= ADD TO CART ================= */
export const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    let { productId, quantity = 1, variant } = req.body;

    quantity = Math.max(1, Number(quantity));

    if (!productId || !variant)
      return res.status(400).json({
        success: false,
        message: "Product and variant are required",
      });

    if (!variant.price || !variant.weight)
      return res.status(400).json({
        success: false,
        message: "Invalid variant data",
      });

    const product = await Product.findById(productId);
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = await Cart.create({
        user: userId,
        items: [
          {
            product: productId,
            variant,
            quantity,
          },
        ],
      });
    } else {
      const item = cart.items.find(
        (i) =>
          i.product.toString() === productId &&
          i.variant.weight === variant.weight
      );

      if (item) {
        item.quantity += quantity;
      } else {
        cart.items.push({ product: productId, variant, quantity });
      }

      await cart.save();
    }

    // Remove from wishlist if exists
    await Wishlist.updateOne(
      { user: userId },
      { $pull: { products: productId } }
    );

    res.json({ success: true, message: "Added to cart" });
  } catch (err) {
    console.error("addToCart error:", err);
    res.status(500).json({ success: false, message: "Cart error" });
  }
};

/* ================= GET CART ================= */
export const getCart = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id }).populate(
    "items.product"
  );

  res.json({
    items: cart ? cart.items : [],
  });
};

/* ================= UPDATE CART QTY ================= */
export const updateCartItem = async (req, res) => {
  const { productId, weight, quantity } = req.body;

  if (!productId || !weight || quantity < 1)
    return res.status(400).json({ message: "Invalid request" });

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ message: "Cart not found" });

  const item = cart.items.find(
    (i) =>
      i.product.toString() === productId && i.variant.weight === weight
  );

  if (!item) return res.status(404).json({ message: "Item not found" });

  item.quantity = quantity;
  await cart.save();

  res.json({ success: true });
};

/* ================= REMOVE CART ITEM ================= */
export const removeCartItem = async (req, res) => {
  const { productId } = req.params;
  const { weight } = req.body;

  if (!weight) {
    return res.status(400).json({ message: "Variant weight required" });
  }

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    return res.status(404).json({ message: "Cart not found" });
  }

  const initialLength = cart.items.length;

  cart.items = cart.items.filter(
    (i) =>
      !(
        i.product.toString() === productId &&
        i.variant.weight === weight
      )
  );

  if (cart.items.length === initialLength) {
    return res.status(404).json({ message: "Item not found in cart" });
  }

  await cart.save();

  res.json({ success: true });
};


/* ================= TOGGLE WISHLIST ================= */
export const toggleWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId)
      return res
        .status(400)
        .json({ success: false, message: "Product ID required" });

    const productExists = await Product.exists({ _id: productId });
    if (!productExists)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      await Wishlist.create({ user: userId, products: [productId] });
      return res.json({ success: true, action: "added" });
    }

    const exists = wishlist.products.some(
      (p) => p.toString() === productId
    );

    if (exists) {
      wishlist.products.pull(productId);
      await wishlist.save();
      return res.json({ success: true, action: "removed" });
    }

    wishlist.products.push(productId);
    await wishlist.save();
    res.json({ success: true, action: "added" });
  } catch (err) {
    console.error("wishlist error:", err);
    res.status(500).json({ success: false, message: "Wishlist error" });
  }
};

/* ================= MOVE WISHLIST TO CART ================= */
export const moveWishlistToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    let { productId, quantity = 1, variant } = req.body;

    quantity = Math.max(1, Number(quantity));

    if (!variant)
      return res
        .status(400)
        .json({ success: false, message: "Variant required" });

    const product = await Product.findById(productId);
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = await Cart.create({
        user: userId,
        items: [{ product: productId, variant, quantity }],
      });
    } else {
      const item = cart.items.find(
        (i) =>
          i.product.toString() === productId &&
          i.variant.weight === variant.weight
      );

      if (item) item.quantity += quantity;
      else cart.items.push({ product: productId, variant, quantity });

      await cart.save();
    }

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { products: productId } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Operation failed" });
  }
};

/* ================= COUNTS ================= */
export const getCounts = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Unauthorized: user not found"
      });
    }

    console.log("Fetching counts for user:", req.user.id);

    const cart = await Cart.findOne({
      user: req.user.id
    });

    const wishlist = await Wishlist.findOne({
      user: req.user.id
    });

    // Safer reduce (in case items is missing)
    const cartCount =
      cart?.items?.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      ) || 0;

    // Safe length access
    const wishlistCount =
      wishlist?.products?.length || 0;

    return res.status(200).json({
      cartCount,
      wishlistCount
    });

  } catch (err) {

    console.error("getCounts Error:", err);

    return res.status(500).json({
      message: "Failed to fetch cart/wishlist counts",
      error: err.message
    });
  }
};

export const getWishlist = async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user.id })
    .populate("products");

  res.json({
    products: wishlist ? wishlist.products : [],
  });
};