// utils/notify.js
import { Resend } from "resend";
import twilio from "twilio";

// -------------------------
// RESEND SETUP (Email)
// -------------------------
const RESEND_KEY = process.env.RESEND_API_KEY;
const resend =
  RESEND_KEY
    ? new Resend(RESEND_KEY)
    : null;

if (!RESEND_KEY) {
  console.warn("⚠️ WARN: RESEND_API_KEY missing. Email sending disabled.");
}

// -------------------------
// TWILIO SETUP (SMS + WhatsApp)
// -------------------------
const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const twClient =
  TW_SID && TW_TOKEN
    ? twilio(TW_SID, TW_TOKEN)
    : null;

if (!TW_SID || !TW_TOKEN) {
  console.warn("⚠️ WARN: Twilio keys missing. SMS/WhatsApp disabled.");
}

// -------------------------
// SEND EMAIL
// -------------------------
export async function sendEmail({
  to,
  subject,
  html,
  from = process.env.RESEND_EMAIL_FROM || "no-reply@yourstore.com",
}) {
  if (!resend) {
    console.error("❌ Email service not initialized");
    return { error: "Email service offline" };
  }

  try {
    const res = await resend.emails.send({ from, to, subject, html });
    console.log("📧 Email sent:", res);
    return res;
  } catch (err) {
    console.error("❌ Email send error:", err);
    return { error: err.message };
  }
}

// -------------------------
// SEND SMS
// -------------------------
export async function sendSms({
  to,
  body,
  from = process.env.TWILIO_SMS_FROM,
}) {
  if (!twClient) {
    console.error("❌ Twilio SMS not initialized");
    return { error: "SMS service offline" };
  }

  try {
    const res = await twClient.messages.create({ body, from, to });
    console.log("📱 SMS sent:", res.sid);
    return res;
  } catch (err) {
    console.error("❌ SMS send error:", err);
    return { error: err.message };
  }
}

// -------------------------
// SEND WHATSAPP MESSAGE
// -------------------------
export async function sendWhatsApp({
  to,   // must be: whatsapp:+91xxxxxxxxxx
  body,
  from = process.env.TWILIO_WHATSAPP_FROM, // e.g. whatsapp:+14155238886
}) {
  if (!twClient) {
    console.error("❌ Twilio WhatsApp not initialized");
    return { error: "WhatsApp service offline" };
  }

  try {
    const res = await twClient.messages.create({ body, from, to });
    console.log("💬 WhatsApp sent:", res.sid);
    return res;
  } catch (err) {
    console.error("❌ WhatsApp send error:", err);
    return { error: err.message };
  }
}
