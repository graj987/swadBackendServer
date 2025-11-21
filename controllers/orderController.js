import Product from "../models/productModel.js";
import Order from "../models/order.js";

/**
 * Products
 */
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    return res.json(products);
  } catch (err) {
    return res.status(500).json({ message: "Error fetching products" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json(product);
  } catch (err) {
    return res.status(500).json({ message: "Error fetching product" });
  }
};

export const addProduct = async (req, res) => {
  try {
    const p = new Product(req.body);
    await p.save();
    return res.status(201).json(p);
  } catch (err) {
    return res.status(400).json({ message: "Error adding product" });
  }
};

/**
 * Orders
 * - products: [{ product: productId, quantity }]
 * - totalAmount is computed server-side from product.price * qty (paise or rupees depending on your product.price)
 */
export const createOrder = async (req, res) => {
  try {
    const { user, products, address } = req.body;
    if (!user || !Array.isArray(products) || products.length === 0 || !address) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // load product docs and compute total
    const ids = products.map(p => p.product);
    const dbProducts = await Product.find({ _id: { $in: ids } }).select("price");
    const priceMap = new Map(dbProducts.map(dp => [dp._id.toString(), dp.price || 0]));

    let computedTotal = 0;
    for (const it of products) {
      const price = priceMap.get(String(it.product));
      if (price === undefined) return res.status(400).json({ message: `Invalid product id: ${it.product}` });
      const qty = Math.max(1, parseInt(it.quantity || 1, 10));
      computedTotal += price * qty;
    }

    // optionally: if client sent totalAmount, ensure it matches
    if (req.body.totalAmount !== undefined) {
      const clientTotal = Number(req.body.totalAmount);
      if (isNaN(clientTotal) || Math.round(clientTotal) !== Math.round(computedTotal)) {
        return res.status(400).json({ message: "Total amount mismatch" });
      }
    }

    const order = new Order({
      user,
      products: products.map(p => ({ product: p.product, quantity: p.quantity || 1 })),
      totalAmount: computedTotal,
      address,
      paymentStatus: "pending",
      orderStatus: "preparing"
    });

    await order.save();
    return res.status(201).json(order);
  } catch (err) {
    console.error("createOrder err:", err);
    return res.status(500).json({ message: "Error creating order" });
  }
};

export const getOrdersByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const orders = await Order.find({ user: userId })
      .populate("products.product")
      .sort({ createdAt: -1 });
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: "Error fetching orders" });
  }
};
