import mongoose from "mongoose";

/* ---------------- REFUND SUB-SCHEMA ---------------- */
const RefundSchema = new mongoose.Schema(
  {
    refund_id: String,
    amount_paise: Number,
    status: String,
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ---------------- CARD SUB-SCHEMA ---------------- */
const CardSchema = new mongoose.Schema(
  {
    network: String,
    brand: String,
    last4: String,
    issuer: String,
    country: String,
  },
  { _id: false }
);

/* ---------------- MAIN PAYMENT SCHEMA ---------------- */
const PaymentSchema = new mongoose.Schema(
  {
    razorpay_payment_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    razorpay_order_id: {
      type: String,
      index: true,
      required: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    amount_paise: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    method: String,

    status: {
      type: String,
      enum: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
        "refund_processing",
      ],
      default: "created",
      index: true,
    },

    card: { type: CardSchema, default: null },
    vpa: String,
    bank: String,

    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    refunds: {
      type: [RefundSchema],
      default: [],
    },

    signature_verified: {
      type: Boolean,
      default: false,
      index: true,
    },

    verification_notes: String,
    ip: String,
    userAgent: String,

    created_at_unix: Number,
    captured_at_unix: Number,

    notes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /* ENTERPRISE CHECKOUT SNAPSHOT */
    checkout_snapshot: {
      products: [
        {
          product: { type: mongoose.Schema.Types.ObjectId },
          variantWeight: String,
          quantity: Number,
          price: Number,
        },
      ],
      address: {
        name: String,
        phone: String,
        line1: String,
        city: String,
        state: String,
        pincode: String,
      },
      paymentMethod: String,
    },

    order_created: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/* ---------------- STATIC: UPSERT FROM RAZORPAY ---------------- */
PaymentSchema.statics.createOrUpdateFromRazorpay = async function (
  p,
  opts = {}
) {
  if (!p || !p.id) throw new Error("Invalid Razorpay payment object");

  const doc = {
    razorpay_payment_id: p.id,
    razorpay_order_id: p.order_id || null,
    amount_paise: p.amount,
    currency: p.currency,
    method: p.method,
    status: p.status,
    raw: p,
    signature_verified: !!opts.signatureVerified,
    verification_notes: opts.verificationNotes || null,
    ip: opts.ip || null,
    userAgent: opts.userAgent || null,
    notes: p.notes || {},
    created_at_unix: p.created_at || null,
    captured_at_unix: p.captured_at || null,
  };

  if (p.method === "card" && p.card) {
    doc.card = {
      network: p.card.network,
      brand: p.card.brand,
      last4: p.card.last4,
      issuer: p.card.issuer,
      country: p.card.country,
    };
  }

  if (p.vpa) doc.vpa = p.vpa;
  if (p.bank) doc.bank = p.bank;

  if (Array.isArray(p.refunds?.items)) {
    doc.refunds = p.refunds.items.map((r) => ({
      refund_id: r.id,
      amount_paise: r.amount,
      status: r.status,
      created_at: r.created_at
        ? new Date(r.created_at * 1000)
        : new Date(),
    }));
  }

  if (opts.orderRef) doc.order = opts.orderRef;
  if (opts.userRef) doc.user = opts.userRef;

  return this.findOneAndUpdate(
    { razorpay_payment_id: p.id },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

/* ---------------- METHOD: ADD REFUND ---------------- */
PaymentSchema.methods.addRefund = async function (r = {}) {
  this.refunds.push({
    refund_id: r.id || r.refund_id,
    amount_paise: r.amount || r.amount_paise || 0,
    status: r.status || "unknown",
    created_at: r.created_at
      ? new Date(r.created_at * 1000)
      : new Date(),
  });

  if (r.status === "processed" || r.status === "completed") {
    this.status = "refunded";
  }

  return this.save();
};

export default mongoose.model("Payment", PaymentSchema);