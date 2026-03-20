// import axios from "axios";

// export const syncOrderWithShiprocket = async (orderId, authHeader) => {
//   try {
   
//     await axios.post(
//       `${process.env.BASE_URL}/api/shiprocket/create-order`,
//       { orderId },
//       { headers: { Authorization: authHeader } }
//     );

   
//     await axios.post(
//       `${process.env.BASE_URL}/api/shiprocket/awb`,
//       { orderId },
//       { headers: { Authorization: authHeader } }
//     );

  
//     await axios.get(
//       `${process.env.BASE_URL}/api/shiprocket/label/${orderId}`,
//       { headers: { Authorization: authHeader } }
//     );

//     console.log("Shiprocket sync success for order:", orderId);

//   } catch (err) {
//     console.error("Shiprocket sync failed:", err.response?.data || err.message);
//   }
// };
// utils/syncOrder.js
// ─────────────────────────────────────────────────────────────────
//  Shiprocket order sync utility
//  Called AFTER order is created and payment is confirmed.
//
//  Flow:
//    1. Create Shiprocket order  → gets shiprocket_order_id
//    2. Assign AWB               → gets tracking number
//    3. Generate shipping label  → ready for pickup
//
//  This runs async — never block the customer response waiting for it.
//  Failures are logged and can be retried from admin panel.
// ─────────────────────────────────────────────────────────────────

import axios from "axios";
import Order from "../models/order.js";

const BASE_URL = process.env.BASE_URL;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * withRetry — wraps an async fn with simple retry logic
 */
async function withRetry(fn, retries = MAX_RETRIES, label = "") {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === retries + 1;
      console.error(`[Shiprocket] ${label} attempt ${attempt} failed:`, err.response?.data || err.message);
      if (isLast) throw err;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

/**
 * syncOrderWithShiprocket
 *
 * @param {string} orderId      — MongoDB Order _id
 * @param {string} authHeader   — "Bearer <token>" for internal API calls
 *
 * Steps:
 *   1. POST /api/shiprocket/create-order  → creates shipment on Shiprocket
 *   2. POST /api/shiprocket/awb           → assigns courier + AWB number
 *   3. GET  /api/shiprocket/label/:id     → generates shipping label PDF
 *
 * On success: updates Order document with shiprocketOrderId + awbCode
 * On failure: marks Order.shiprocketSyncFailed = true (for admin retry)
 */
export const syncOrderWithShiprocket = async (orderId, authHeader) => {
  try {
    // ── Step 1: Create Shiprocket order ──
    await withRetry(
      () => axios.post(
        `${BASE_URL}/api/shiprocket/create-order`,
        { orderId },
        { headers: { Authorization: authHeader }, timeout: 10000 }
      ),
      MAX_RETRIES,
      "create-order"
    );

    // ── Step 2: Assign AWB (courier + tracking number) ──
    await withRetry(
      () => axios.post(
        `${BASE_URL}/api/shiprocket/awb`,
        { orderId },
        { headers: { Authorization: authHeader }, timeout: 10000 }
      ),
      MAX_RETRIES,
      "awb"
    );

    // ── Step 3: Generate shipping label ──
    await withRetry(
      () => axios.get(
        `${BASE_URL}/api/shiprocket/label/${orderId}`,
        { headers: { Authorization: authHeader }, timeout: 10000 }
      ),
      MAX_RETRIES,
      "label"
    );

    // ── Mark sync complete on Order ──
    await Order.findByIdAndUpdate(orderId, {
      shiprocketSynced:    true,
      shiprocketSyncedAt:  new Date(),
      shiprocketSyncFailed: false,
    });

    console.log(`[Shiprocket] ✅ Sync complete for order: ${orderId}`);

  } catch (err) {
    console.error(`[Shiprocket] ❌ Sync failed for order ${orderId}:`, err.response?.data || err.message);

    // Mark for admin retry — don't crash, order is already placed
    await Order.findByIdAndUpdate(orderId, {
      shiprocketSynced:    false,
      shiprocketSyncFailed: true,
      shiprocketSyncError: err.response?.data?.message || err.message,
    }).catch(() => {}); // silent — don't throw from cleanup
  }
};