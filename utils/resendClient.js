// utils/resendClient.js
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.RESEND_API_KEY) {
  console.error("❌ Missing RESEND_API_KEY in environment variables");
  process.exit(1);
}

// ✅ SINGLE resend client instance
export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Helper function for sending emails safely
 * Returns: { success: boolean, error?: string }
 */
export async function sendEmail({ to, subject, html }) {
  try {
    const response = await resend.emails.send({
      from: "SwadBest <noreply@swadbest.com>",
      to,
      subject,
      html,
    });

    return {
      success: true,
      id: response?.id || null,
    };
  } catch (err) {
    console.error("📩 Email send error:", err?.message || err);
    return {
      success: false,
      error: err?.message,
    };
  }
}
