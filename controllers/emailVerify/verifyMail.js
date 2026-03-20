// verifyMail.js
// ─────────────────────────────────────────────────────────────────
//  Email verification mailer
//  Template: emails/verify-email.hbs
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
const TEMPLATE_PATH = path.join(__dirname, "emails", "verify-email.hbs");

const FRONTEND_VERIFY_URL = process.env.FRONTEND_URL + "/verify";
const resend = new Resend(process.env.RESEND_API_KEY);

export const verifyMail = async (token, email) => {
  try {
    const source   = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    const template = handlebars.compile(source);

    const verifyLink = `${FRONTEND_VERIFY_URL}?token=${encodeURIComponent(token)}`;

    const html = template({
      verifyLink,
      email,       // shown in "belongs to {{email}}" line
      year: new Date().getFullYear(),
    });

    await resend.emails.send({
      from:    "SwadBest <no-reply@swadbest.com>",
      to:      email,
      subject: "Verify Your SwadBest Email Address",
      html,
    });

    console.log("[Email] ✅ Verification email sent →", email);
    return true;

  } catch (err) {
    console.error("[Email] ❌ verifyMail failed:", err.message);
    return false;
  }
};
