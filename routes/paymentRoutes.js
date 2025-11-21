import express from 'express';
import { createRazorpayOrder, verifyPayment, webhookHandler } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/create-order', createRazorpayOrder);   // body: { orderId }
router.post('/verify', verifyPayment);               // body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
router.post('/webhook', express.json({ type: '*/*' }), webhookHandler); // webhook must accept raw json; ensure body parser doesn't tamper signature

export default router;
