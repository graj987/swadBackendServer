// controllers/pricePreviewController.js
import Product from "../models/productModel.js";
import Address from "../models/address.js";
import { calculateDeliveryCharge } from "../utils/deliveryCharge.js";
import { detectRegionFromPincode } from "../utils/pincodeRegions.js";

export const getPricePreview = async (req, res) => {
  try {
    const { products, addressId, paymentMethod } = req.body;
    const userId = req.userId;

    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No products provided" });
    }

    if (!addressId) {
      return res
        .status(400)
        .json({ success: false, message: "Address is required" });
    }

    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // REGION BASED DELIVERY CHARGE
    const region = detectRegionFromPincode(address.pincode);
    const deliveryCharge = calculateDeliveryCharge(region);

    // FETCH PRODUCT DATA
    const productIds = products.map((p) => p.product);
    const dbProducts = await Product.find({ _id: { $in: productIds } });

    let subtotal = 0;

    for (const item of products) {
      const dbProduct = dbProducts.find(
        (p) => p._id.toString() === item.product,
      );

      if (!dbProduct) continue;

      const variant = dbProduct.variants[item.variantIndex];

      if (!variant) continue;

      subtotal += variant.price * item.quantity;
    }

    const tax = Math.round(subtotal * 0.12);
    const codCharge = paymentMethod === "COD" ? 20 : 0;

    const totalAmount = subtotal + tax + deliveryCharge + codCharge;

    return res.json({
      success: true,
      data: {
        subtotal,
        tax,
        deliveryCharge,
        codCharge,
        totalAmount,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to calculate price preview",
    });
  }
};
