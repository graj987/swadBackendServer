import mongoose from "mongoose";

/* ================= ORDER ITEM ================= */

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // 🔥 VARIANT SNAPSHOT (CRITICAL)
    variant: {
      weight: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    // For auditing / refunds (explicit)
    priceAtPurchase: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

/* ================= ADDRESS ================= */

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    city: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  { _id: false }
);

/* ================= ORDER ================= */

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Order must contain at least one item",
      },
    },

    address: {
      type: addressSchema,
      required: true,
    },

    /* ================= PRICE BREAKDOWN ================= */

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    tax: {
      type: Number,
      default: 0,
      min: 0,
    },

    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    codCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    /* ================= PAYMENT ================= */

    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    /* ================= ORDER STATUS ================= */

    orderStatus: {
      type: String,
      enum: ["preparing", "shipped", "delivered", "cancelled"],
      default: "preparing",
    },

    statusHistory: [
      {
        status: String,
        date: { type: Date, default: Date.now },
      },
    ],

    /* ================= RAZORPAY ================= */

    razorpay_order_id: String,
    razorpay_payment_id: String,
    razorpay_signature: String,

    paymentDetails: {
      type: Object,
      default: {},
    },

    /* ================= SHIPROCKET ================= */

    shiprocketOrderId: { type: String, default: null },
    shipmentId: { type: String, default: null },
    awb: { type: String, default: null },
    trackingUrl: { type: String, default: null },
  },
  { timestamps: true }
);

/* ================= EXPORT ================= */

const Order = mongoose.model("Order", orderSchema);
export default Order;
