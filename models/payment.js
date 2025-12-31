import mongoose from "mongoose";

/* ----------------------- REFUND SUB-SCHEMA ------------------------ */
const RefundSchema = new mongoose.Schema(
  {
    refund_id: String,
    amount_paise: Number,
    status: String,
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ----------------------- CARD SUB-SCHEMA -------------------------- */
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

/* ----------------------- MAIN PAYMENT SCHEMA ---------------------- */
const PaymentSchema = new mongoose.Schema(
  {
    razorpay_payment_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    razorpay_order_id: { type: String, index: true },

    /* ----- Relations ----- */
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    /* ----- Money ----- */
    amount_paise: { type: Number, required: true }, // stored in paise
    currency: { type: String, default: "INR" },

    /* ----- Status ----- */
    method: String, // card/upi/netbanking/wallet
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

    /* ----- Method extra info ----- */
    card: { type: CardSchema, default: null },
    vpa: String,
    bank: String,

    /* ----- Razorpay raw payload ----- */
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },

    /* ----- Refund tracking ----- */
    refunds: { type: [RefundSchema], default: [] },

    /* ----- Security & verification ----- */
    signature_verified: { type: Boolean, default: false },
    verification_notes: String,
    ip: String,
    userAgent: String,

    /* ----- Razorpay timestamps ----- */
    created_at_unix: Number,
    captured_at_unix: Number,

    /* ----- Notes (Razorpay supports this) ----- */
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },

    /* ----- Metadata ----- */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

/* ================================================================
   STATIC: Create or Update Payment from Razorpay Object
================================================================ */
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

  /* ------- Save card info ------- */
  if (p.method === "card" && p.card) {
    doc.card = {
      network: p.card.network,
      brand: p.card.brand,
      last4: p.card.last4,
      issuer: p.card.issuer,
      country: p.card.country,
    };
  }

  /* ------- Save UPI info ------- */
  if (p.vpa) doc.vpa = p.vpa;

  /* ------- Save bank info ------- */
  if (p.bank) doc.bank = p.bank;

  /* ------- Refund arrays (if Razorpay sent) ------- */
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

  /* ------- Link order/user if available ------- */
  if (opts.orderRef) doc.order = opts.orderRef;
  if (opts.userRef) doc.user = opts.userRef;

  /* ------- Upsert Payment ------- */
  const updated = await this.findOneAndUpdate(
    { razorpay_payment_id: p.id },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return updated;
};

/* ================================================================
   METHOD: Add single refund
================================================================ */
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
