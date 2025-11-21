// backend/models/Payment.js
import mongoose from 'mongoose';

const RefundSchema = new mongoose.Schema({
  refund_id: { type: String },
  amount_paise: { type: Number },
  status: { type: String },
  created_at: { type: Date, default: Date.now },
}, { _id: false });

const CardSchema = new mongoose.Schema({
  network: { type: String },      // e.g., VISA, MASTERCARD
  brand: { type: String },        // e.g., 'Visa'
  last4: { type: String },        // last 4 digits if available
  issuer: { type: String },       // bank / issuer name
  country: { type: String },      // issuer country code e.g. 'IN'
}, { _id: false });

const PaymentSchema = new mongoose.Schema({
  // Primary Razorpay identifiers
  razorpay_payment_id: { type: String, required: true, unique: true, index: true },
  razorpay_order_id: { type: String, index: true },

  // References
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },

  // Monetary fields
  amount_paise: { type: Number, required: true },   // always store paise (integer)
  currency: { type: String, default: 'INR' },

  // Payment method & status
  method: { type: String }, // e.g., "card", "upi", "netbanking", "wallet"
  status: { type: String, enum: ['created','authorized','captured','failed','refunded','refund_processing'], default: 'created' },

  // Card / UPI / Bank specific info
  card: { type: CardSchema, default: null },
  vpa: { type: String, default: null },     // for UPI (user@bank)
  bank: { type: String, default: null },    // bank name if available
  acquirer_data: { type: mongoose.Schema.Types.Mixed, default: null },

  // Raw payload from Razorpay (store for audits)
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Refunds history (array to track partial / multiple refunds)
  refunds: { type: [RefundSchema], default: [] },

  // Verification & security
  signature_verified: { type: Boolean, default: false },
  verification_notes: { type: String, default: null },

  // Audit / anti-fraud signals
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  attempts: { type: Number, default: 0 },

  // Arbitrary metadata
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },

}, { timestamps: true });

// Static helper: create or update payment from a Razorpay payment object (webhook or API)
PaymentSchema.statics.createOrUpdateFromRazorpay = async function(razorpayPaymentObj, opts = {}) {
  /**
   * razorpayPaymentObj: full payment object returned by Razorpay (webhook.payload.payment.entity or GET /payments/:id)
   * opts: { orderRef: ObjectId, userRef: ObjectId, signatureVerified: Boolean, ip, userAgent }
   */
  const Payment = this;
  const p = razorpayPaymentObj;

  if (!p || !p.id) throw new Error('Invalid razorpay payment object');

  const doc = {
    razorpay_payment_id: p.id,
    razorpay_order_id: p.order_id || null,
    amount_paise: p.amount || 0,
    currency: p.currency || 'INR',
    method: p.method || null,
    status: p.status || null,
    raw: p,
    signature_verified: !!opts.signatureVerified,
    verification_notes: opts.verificationNotes || null,
    ip: opts.ip || null,
    userAgent: opts.userAgent || null,
    meta: opts.meta || {}
  };

  // card details
  if (p.card) {
    doc.card = {
      network: p.card.network || null,
      brand: p.card.brand || null,
      last4: p.card.last4 || null,
      issuer: p.card.issuer || null,
      country: p.card.country || null
    };
  }

  if (p.vpa) doc.vpa = p.vpa;
  if (p.bank) doc.bank = p.bank;
  if (p.acquirer_data) doc.acquirer_data = p.acquirer_data;

  // handle refunds array if present
  if (p.refunds && Array.isArray(p.refunds) && p.refunds.length > 0) {
    doc.refunds = (p.refunds || []).map(r => ({
      refund_id: r.id || null,
      amount_paise: r.amount || 0,
      status: r.status || null,
      created_at: r.created_at ? new Date(r.created_at * 1000) : new Date()
    }));
  }

  if (opts.orderRef) doc.order = opts.orderRef;
  if (opts.userRef) doc.user = opts.userRef;

  // upsert by razorpay_payment_id
  const updated = await Payment.findOneAndUpdate(
    { razorpay_payment_id: p.id },
    { $set: doc, $inc: { attempts: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();

  return updated;
};

// Instance method: add a refund record
PaymentSchema.methods.addRefund = async function(refundObj = {}) {
  this.refunds.push({
    refund_id: refundObj.id || refundObj.refund_id || null,
    amount_paise: refundObj.amount || refundObj.amount_paise || 0,
    status: refundObj.status || 'unknown',
    created_at: refundObj.created_at ? new Date(refundObj.created_at * 1000) : new Date()
  });
  // update status if fully refunded or partial logic (consumer can adjust)
  this.status = refundObj.status === 'processed' || refundObj.status === 'completed' ? 'refunded' : this.status;
  return this.save();
};

export default mongoose.model('Payment', PaymentSchema);
