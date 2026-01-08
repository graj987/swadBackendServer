import Cart from "../models/cart.js";
import Wishlist from "../models/wishlist.js";
import Product from "../models/productModel.js";

/* ================= ADD TO CART ================= */
export const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    let { productId, quantity = 1 } = req.body;

    quantity = Math.max(1, Number(quantity));

    if (!productId)
      return res.status(400).json({ success: false, message: "Product ID required" });

    const product = await Product.findById(productId);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    if (product.stock < quantity)
      return res.status(400).json({ success: false, message: "Insufficient stock" });

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = await Cart.create({
        user: userId,
        items: [{ product: productId, quantity }],
      });
    } else {
      const item = cart.items.find(i => i.product.toString() === productId);
      if (item) item.quantity += quantity;
      else cart.items.push({ product: productId, quantity });
      await cart.save();
    }

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { products: productId } }
    );

    res.json({ success: true, message: "Added to cart" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Cart error" });
  }
};

/* ================= GET CART ================= */
export const getCart = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id })
    .populate("items.product");

  res.json({
    items: cart ? cart.items : [],
  });
};

/* ================= UPDATE CART QTY ================= */
export const updateCartItem = async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId || quantity < 1)
    return res.status(400).json({ message: "Invalid request" });

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ message: "Cart not found" });

  const item = cart.items.find(i => i.product.toString() === productId);
  if (!item) return res.status(404).json({ message: "Item not found" });

  item.quantity = quantity;
  await cart.save();

  res.json({ success: true });
};

/* ================= REMOVE CART ITEM ================= */
export const removeCartItem = async (req, res) => {
  const { productId } = req.params;

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ message: "Cart not found" });

  cart.items = cart.items.filter(i => i.product.toString() !== productId);
  await cart.save();

  res.json({ success: true });
};

/* ================= TOGGLE WISHLIST ================= */
export const toggleWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ success: false, message: "Product ID required" });

    const productExists = await Product.exists({ _id: productId });
    if (!productExists)
      return res.status(404).json({ success: false, message: "Product not found" });

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      await Wishlist.create({ user: userId, products: [productId] });
      return res.json({ success: true, action: "added" });
    }

    const exists = wishlist.products.some(p => p.toString() === productId);

    if (exists) {
      wishlist.products.pull(productId);
      await wishlist.save();
      return res.json({ success: true, action: "removed" });
    }

    wishlist.products.push(productId);
    await wishlist.save();
    res.json({ success: true, action: "added" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Wishlist error" });
  }
};

/* ================= MOVE WISHLIST TO CART ================= */
export const moveWishlistToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    let { productId, quantity = 1 } = req.body;

    quantity = Math.max(1, Number(quantity));

    const product = await Product.findById(productId);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    if (product.stock < quantity)
      return res.status(400).json({ success: false, message: "Insufficient stock" });

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = await Cart.create({
        user: userId,
        items: [{ product: productId, quantity }],
      });
    } else {
      const item = cart.items.find(i => i.product.toString() === productId);
      if (item) item.quantity += quantity;
      else cart.items.push({ product: productId, quantity });
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

/* ================= GET WISHLIST ================= */
export const getWishlist = async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user.id })
    .populate("products");

  res.json({
    products: wishlist ? wishlist.products : [],
  });
};

/* ================= COUNTS ================= */
export const getCounts = async (req, res) => {
  try {
    const userId = req.user.id;

    const [cart, wishlist] = await Promise.all([
      Cart.findOne({ user: userId }).select("items.quantity"),
      Wishlist.findOne({ user: userId }).select("products"),
    ]);

    const cartCount = cart
      ? cart.items.reduce((s, i) => s + i.quantity, 0)
      : 0;

    const wishlistCount = wishlist ? wishlist.products.length : 0;

    res.json({ cartCount, wishlistCount });
  } catch (err) {
    res.status(500).json({ cartCount: 0, wishlistCount: 0 });
  }
};
