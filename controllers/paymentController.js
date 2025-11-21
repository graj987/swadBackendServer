// controllers/paymentController.js
import Razorpay from 'razorpay';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

import Order from '../models/order.js';
import Payment from '../models/payment.js';

dotenv.config();

const { RZ_KEY_ID, RZ_KEY_SECRET, RZ_WEBHOOK_SECRET } = process.env;
if (!RZ_KEY_ID || !RZ_KEY_SECRET || !RZ_WEBHOOK_SECRET) {
  console.error('Missing Razorpay env vars (RZ_KEY_ID, RZ_KEY_SECRET, RZ_WEBHOOK_SECRET)');
  process.exit(1);
}

const razorpay = new Razorpay({ key_id: RZ_KEY_ID, key_secret: RZ_KEY_SECRET });

/**
 * Helper: refund a payment (full or partial)
 * @param {string} paymentId
 * @param {number} [amountPaise] optional amount in paise
 */
async function refundPayment(paymentId, amountPaise) {
  try {
    if (amountPaise) {
      return await razorpay.payments.refund(paymentId, { amount: amountPaise });
    }
    return await razorpay.payments.refund(paymentId);
  } catch (err) {
    console.error('refundPayment err', err && err.response ? err.response.data : err.message);
    throw err;
  }
}

/**
 * Create a Razorpay order for an existing DB order
 * Body: { orderId: "<mongoOrderId>" }
 * Returns the razorpay order object
 */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ ok: false, message: 'orderId required' });

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) return res.status(404).json({ ok: false, message: 'Order not found' });

    // amount stored in order.totalAmount — assume same units as product.price.
    // Convert to paise if your stored price is in rupees.
    // Here we assume totalAmount is in rupees; convert:
    const amountPaise = Math.round(orderDoc.totalAmount * 100);

    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${orderDoc._id}`,
      payment_capture: 1
    };

    const rzOrder = await razorpay.orders.create(options);

    orderDoc.razorpay_order_id = rzOrder.id;
    await orderDoc.save();

    return res.json({ ok: true, razorpayOrder: rzOrder, order: orderDoc });
  } catch (err) {
    console.error('createRazorpayOrder err', err && err.response ? err.response.data : err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Verify payment called by frontend after successful checkout
 * Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, message: 'Missing fields' });
    }

    // 1) verify signature
    const generated = crypto.createHmac('sha256', RZ_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated !== razorpay_signature) {
      return res.status(400).json({ ok: false, message: 'Invalid signature' });
    }

    // 2) fetch canonical payment object from Razorpay
    const paymentResp = await axios.get(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      auth: { username: RZ_KEY_ID, password: RZ_KEY_SECRET }
    });
    const paymentObj = paymentResp.data;

    // 3) persist Payment record
    const savedPayment = await Payment.createOrUpdateFromRazorpay(paymentObj, {
      signatureVerified: true,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // 4) find order and attach payment
    const orderDoc = await Order.findOne({ razorpay_order_id: razorpay_order_id });
    if (orderDoc) {
      orderDoc.razorpay_payment_id = razorpay_payment_id;
      orderDoc.razorpay_signature = razorpay_signature;
      orderDoc.paymentDetails = paymentObj;
    }

    // 5) India-only enforcement
    if (String(paymentObj.currency).toUpperCase() !== 'INR') {
      if (orderDoc) orderDoc.paymentStatus = 'failed';
      await Payment.updateOne({ razorpay_payment_id }, { $set: { verification_notes: 'Rejected: non-INR' } });
      try { await refundPayment(razorpay_payment_id); } catch (e) { console.error('refund failed', e); }
      if (orderDoc) await orderDoc.save();
      return res.status(200).json({ ok: false, reason: 'non-INR', refunded: true });
    }

    if (paymentObj.method === 'card') {
      const issuerCountry = paymentObj.card && paymentObj.card.country ? paymentObj.card.country.toUpperCase() : null;
      if (issuerCountry && issuerCountry !== 'IN') {
        if (orderDoc) orderDoc.paymentStatus = 'failed';
        await Payment.updateOne({ razorpay_payment_id }, { $set: { verification_notes: 'Rejected: non-Indian card' } });
        try { await refundPayment(razorpay_payment_id); } catch (e) { console.error('refund failed', e); }
        if (orderDoc) await orderDoc.save();
        return res.status(200).json({ ok: false, reason: 'non-Indian-card', refunded: true });
      }
    }

    // 6) accept payment
    if (orderDoc) {
      orderDoc.paymentStatus = 'paid';
      orderDoc.orderStatus = orderDoc.orderStatus || 'preparing';
      await orderDoc.save();
      // link payment -> order if not linked
      await Payment.findOneAndUpdate(
        { razorpay_payment_id },
        { $set: { order: orderDoc._id } },
        { new: true }
      );
    }

    return res.json({ ok: true, payment: savedPayment, order: orderDoc ? orderDoc._id : null });
  } catch (err) {
    console.error('verifyPayment err', err && err.response ? err.response.data : err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Webhook handler (authoritative)
 * Set this URL in Razorpay Dashboard webhooks with the same RZ_WEBHOOK_SECRET
 */
export const webhookHandler = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const bodyString = JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', RZ_WEBHOOK_SECRET).update(bodyString).digest('hex');

  if (expected !== signature) {
    console.warn('Invalid webhook signature');
    return res.status(400).send('invalid signature');
  }

  const ev = req.body;
  try {
    if (ev.event === 'payment.captured' || ev.event === 'order.paid') {
      const paymentEntity = ev.payload.payment.entity;

      // upsert Payment
      const savedPayment = await Payment.createOrUpdateFromRazorpay(paymentEntity, {
        signatureVerified: true
      });

      // find associated order
      const orderDoc = await Order.findOne({ razorpay_order_id: paymentEntity.order_id });

      // India-only checks
      if (String(paymentEntity.currency).toUpperCase() !== 'INR') {
        if (orderDoc) orderDoc.paymentStatus = 'failed';
        await Payment.updateOne({ razorpay_payment_id: paymentEntity.id }, { $set: { verification_notes: 'Rejected: non-INR' } });
        try { await refundPayment(paymentEntity.id); } catch (e) { console.error('refund err', e); }
        if (orderDoc) await orderDoc.save();
        return res.status(200).send('non-inr-refunded');
      }

      if (paymentEntity.method === 'card') {
        const issuerCountry = paymentEntity.card && paymentEntity.card.country ? paymentEntity.card.country.toUpperCase() : null;
        if (issuerCountry && issuerCountry !== 'IN') {
          if (orderDoc) orderDoc.paymentStatus = 'failed';
          await Payment.updateOne({ razorpay_payment_id: paymentEntity.id }, { $set: { verification_notes: 'Rejected: non-Indian card' } });
          try { await refundPayment(paymentEntity.id); } catch (e) { console.error('refund err', e); }
          if (orderDoc) await orderDoc.save();
          return res.status(200).send('non-indian-card-refunded');
        }
      }

      // Accept
      if (orderDoc) {
        orderDoc.paymentStatus = 'paid';
        orderDoc.orderStatus = orderDoc.orderStatus || 'preparing';
        orderDoc.razorpay_payment_id = paymentEntity.id;
        orderDoc.paymentDetails = paymentEntity;
        await orderDoc.save();
      }

      return res.status(200).send('ok');
    }

    // ignore other events
    return res.status(200).send('ignored');
  } catch (err) {
    console.error('webhook processing error', err);
    return res.status(500).send('server error');
  }
};
