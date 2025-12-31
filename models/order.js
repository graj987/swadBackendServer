import mongoose from "mongoose";

const orderProductSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: { type: Number, required: true, min: 1 },
  priceAtPurchase: { type: Number, required: true },
});

const addressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  city: { type: String, required: true },
  pincode: { type: String, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    products: [orderProductSchema],

    address: addressSchema,

    // -----------------------------
    // PRICE BREAKDOWN (Mandatory)
    // -----------------------------
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    codCharge: { type: Number, default: 0 },

    // Final payable amount (server authority)
    totalAmount: { type: Number, required: true },

    // -----------------------------
    // PAYMENT STATUS
    // -----------------------------
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

    orderStatus: {
      type: String,
      enum: ["preparing", "shipped", "delivered", "cancelled"],
      default: "preparing",
    },

    // -----------------------------
    // RAZORPAY FIELDS
    // -----------------------------
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },

    paymentDetails: {
      type: Object,
      default: {},
    },

    // -----------------------------
    // ORDER STATUS HISTORY
    // -----------------------------
    statusHistory: [
      {
        status: String,
        date: { type: Date, default: Date.now },
      },
    ],

    // -----------------------------
    // SHIPROCKET FIELDS
    // -----------------------------
    shiprocketOrderId: { type: String, default: null },
    shipmentId: { type: String, default: null },
    awb: { type: String, default: null },
    trackingUrl: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
