// sendOtpEmail.js
// ─────────────────────────────────────────────────────────────────
//  Password reset OTP email
//  Template: emails/otp-reset.hbs
// ─────────────────────────────────────────────────────────────────

import { Resend }        from "resend";
import dotenv            from "dotenv";
import fs                from "fs";
import path              from "path";
import { fileURLToPath } from "url";
import handlebars        from "handlebars";

dotenv.config();

const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "emails", "otp-reset.hbs");

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOtpEmail = async (otp, email) => {
  try {
    const source   = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    const template = handlebars.compile(source);
    const html     = template({ otp, year: new Date().getFullYear() });

    await resend.emails.send({
      from:    "SwadBest Security <security@swadbest.com>",
      to:      email,
      subject: "Your SwadBest Password Reset Code",
      html,
    });

    console.log("[Email] ✅ OTP sent →", email);
    return true;

  } catch (err) {
    console.error("[Email] ❌ OTP send failed:", err.message);
    throw err; // re-throw so the caller can handle (e.g. return 500)
  }
};
