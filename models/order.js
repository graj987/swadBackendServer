import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variant: {
      weight: { type: String, required: true },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    priceAtPurchase: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },
  },
  { _id: false }
);

const ORDER_STATUSES = ["placed", "preparing", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "initiated", "paid", "failed"];

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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

    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    codCharge: { type: Number, default: 0, min: 0 },

    totalAmount: { type: Number, required: true, min: 0 },

    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
      index: true,
    },

    razorpay_order_id: {
      type: String,
      index: true,
      sparse: true,
    },

    razorpay_payment_id: {
      type: String,
      index: true,
      sparse: true,
    },

    razorpay_signature: {
      type: String,
      select: false,
    },

    paymentDetails: {
      type: Object,
      default: {},
      select: false,
    },

    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "placed",
      index: true,
    },

    statusHistory: [
      {
        status: { type: String, required: true },
        date: { type: Date, default: Date.now },
      },
    ],

    shipping: {
      shipmentId: { type: String, default: null },
      awb: { type: String, default: null },
      courierName: { type: String, default: null },
      courierId: { type: String, default: null },
      status: {
        type: String,
        enum: [
          "not_created",
          "created",
          "awb_assigned",
          "pickup_scheduled",
          "shipped",
          "in_transit",
          "out_for_delivery",
          "delivered",
          "rto",
          "cancelled",
          "failed",
        ],
        default: "not_created",
      },
      package: {
        weight: Number,
        length: Number,
        breadth: Number,
        height: Number,
      },
      labelUrl: String,
      manifestUrl: String,
      invoiceUrl: String,
      lastError: {
        message: String,
        code: String,
        date: Date,
      },
      trackHistory: [
        {
          status: String,
          location: String,
          message: String,
          raw: Object,
          date: { type: Date, default: Date.now },
        },
      ],
    },

    orderNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    orderMonth: { type: Number, index: true },
    orderYear: { type: Number, index: true },

    isPaidOrder: {
      type: Boolean,
      default: false,
      index: true,
    },

    isRevenueCounted: {
      type: Boolean,
      default: false,
    },

    refund: {
      isRefunded: { type: Boolean, default: false },
      refundAmount: { type: Number, default: 0 },
      refundReason: String,
      refundedAt: Date,
    },

    createdByAdmin: {
      type: Boolean,
      default: false,
    },

    adminNotes: {
      type: String,
      default: "",
    },

    trafficSource: { type: String },
    sessionId: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ "shipping.awb": 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderMonth: 1, orderYear: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;