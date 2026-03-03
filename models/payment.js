import mongoose from "mongoose";

/* ================= REFUND ================= */

const RefundSchema = new mongoose.Schema(
  {
    refund_id: String,
    amount_paise: Number,
    status: String,
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ================= CARD ================= */

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

/* ================= PAYMENT ================= */

const PaymentSchema = new mongoose.Schema(
  {
    /* Razorpay IDs */
    razorpay_payment_id: {
      type: String,
      sparse: true, // ⚠ remove unique here
    },

    razorpay_order_id: String,

    /* Relations */
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /* Amount */
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
    },

    /* Lifecycle timestamps */
    paidAt: Date,
    failedAt: Date,
    refundedAt: Date,

    /* Verification */
    signature_verified: {
      type: Boolean,
      default: false,
    },

    webhook_processed: {
      type: Boolean,
      default: false,
    },

    verification_notes: String,
    ip: String,
    userAgent: String,

    /* Safe subset of Razorpay data */
    notes: Object,

    raw: {
      type: Object,
      select: false, // ⚡ prevents heavy payload fetch
    },

    created_at_unix: Number,
    captured_at_unix: Number,

    vpa: String,
    bank: String,

    card: CardSchema,

    refunds: {
      type: [RefundSchema],
      default: [],
    },
  },
  { timestamps: true }
);

/* ================= INDEXES (ONLY HERE) ================= */

PaymentSchema.index(
  { razorpay_payment_id: 1 },
  { unique: true, sparse: true }
);

PaymentSchema.index({ razorpay_order_id: 1 });

PaymentSchema.index({ user: 1, createdAt: -1 }); // user history fast

PaymentSchema.index({ order: 1 }); // order lookup

/* ================= STATIC UPSERT ================= */

PaymentSchema.statics.createOrUpdateFromRazorpay =
  async function (p, opts = {}) {
    if (!p?.id)
      throw new Error("Invalid Razorpay payment object");

    const doc = {
      razorpay_payment_id: p.id,
      razorpay_order_id: p.order_id || null,
      amount_paise: p.amount,
      currency: p.currency,
      method: p.method,
      status: p.status,
      signature_verified: !!opts.signatureVerified,
      verification_notes: opts.verificationNotes || null,
      ip: opts.ip || null,
      userAgent: opts.userAgent || null,
      notes: p.notes || {},
      created_at_unix: p.created_at || null,
      captured_at_unix: p.captured_at || null,
      raw: p,
    };

    /* lifecycle tracking */
    if (p.status === "captured") doc.paidAt = new Date();
    if (p.status === "failed") doc.failedAt = new Date();

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

    if (opts.orderRef) doc.order = opts.orderRef;
    if (opts.userRef) doc.user = opts.userRef;

    return this.findOneAndUpdate(
      { razorpay_payment_id: p.id },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  };

/* ================= ADD REFUND ================= */

PaymentSchema.methods.addRefund = async function (r = {}) {
  this.refunds.push({
    refund_id: r.id || r.refund_id,
    amount_paise: r.amount || r.amount_paise || 0,
    status: r.status || "unknown",
    created_at: r.created_at
      ? new Date(r.created_at * 1000)
      : new Date(),
  });

  if (["processed", "completed"].includes(r.status)) {
    this.status = "refunded";
    this.refundedAt = new Date();
  }

  return this.save();
};

export default mongoose.models.Payment ||
  mongoose.model("Payment", PaymentSchema);