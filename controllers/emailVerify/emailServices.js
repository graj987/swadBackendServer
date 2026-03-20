// emailService.js
// ─────────────────────────────────────────────────────────────────
//  SwadBest — Central Email Service
//  All transactional emails go through here.
//  Templates are in /emails/*.hbs
//  Renderer: handlebars (same as verifyMail.js)
// ─────────────────────────────────────────────────────────────────

import { Resend }       from "resend";
import dotenv           from "dotenv";
import fs               from "fs";
import path             from "path";
import { fileURLToPath } from "url";
import handlebars       from "handlebars";

dotenv.config();

const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, "emails");

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_DEFAULT  = "SwadBest <no-reply@swadbest.com>";
const FROM_SECURITY = "SwadBest Security <security@swadbest.com>";
const FROM_SUPPORT  = "SwadBest <support@swadbest.com>";
const SHOP_URL      = process.env.FRONTEND_URL || "https://swadbest.com";

// ─────────────────────────────────────────────────────────────────
//  Template loader with in-memory cache
// ─────────────────────────────────────────────────────────────────
const _cache = new Map();

function loadTemplate(name) {
  if (_cache.has(name)) return _cache.get(name);
  const filePath = path.join(TEMPLATES_DIR, `${name}.hbs`);
  const source   = fs.readFileSync(filePath, "utf-8");
  const compiled = handlebars.compile(source);
  _cache.set(name, compiled);
  return compiled;
}

function render(templateName, data) {
  const template = loadTemplate(templateName);
  return template({ ...data, year: new Date().getFullYear() });
}

// ─────────────────────────────────────────────────────────────────
//  Generic send wrapper — handles logging + error isolation
// ─────────────────────────────────────────────────────────────────
async function sendEmail({ from, to, subject, html, label }) {
  try {
    await resend.emails.send({ from, to, subject, html });
    console.log(`[Email] ✅ ${label} → ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] ❌ ${label} failed for ${to}:`, err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
//  1. WELCOME EMAIL
// ─────────────────────────────────────────────────────────────────
export const sendWelcomeEmail = async (email, name) => {
  const html = render("welcome", {
    name,
    shopUrl: SHOP_URL,
  });

  return sendEmail({
    from:    FROM_DEFAULT,
    to:      email,
    subject: `Welcome to SwadBest, ${name}! 🎉`,
    html,
    label:   "WelcomeEmail",
  });
};

// ─────────────────────────────────────────────────────────────────
//  2. LOGIN NOTIFICATION
// ─────────────────────────────────────────────────────────────────
export const sendLoginNotification = async (email, ip, device) => {
  const html = render("security", {
    accentColor:  "linear-gradient(90deg,#ea580c,#f97316)",
    icon:         "🔔",
    subject:      "New Login Detected",
    preheader:    `A new login was detected on your SwadBest account from ${device}.`,
    heading:      "New login to your account",
    bodyText:     `Hello,<br/><br/>A new sign-in was detected on your <strong>SwadBest</strong> account. Here are the details:`,
    showDetails:  true,
    device,
    ip,
    time:         new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST",
    warningText:  "Please reset your password immediately and contact our support team.",
  });

  return sendEmail({
    from:    FROM_SECURITY,
    to:      email,
    subject: "New Login to Your SwadBest Account",
    html,
    label:   "LoginNotification",
  });
};

// ─────────────────────────────────────────────────────────────────
//  3. PASSWORD CHANGED
// ─────────────────────────────────────────────────────────────────
export const sendPasswordChangedEmail = async (email) => {
  const html = render("security", {
    accentColor:  "linear-gradient(90deg,#ea580c,#f97316)",
    icon:         "🔑",
    subject:      "Password Updated",
    preheader:    "Your SwadBest account password was changed successfully.",
    heading:      "Your password was changed",
    bodyText:     "This is a confirmation that the password for your <strong>SwadBest</strong> account was successfully updated.",
    showDetails:  false,
    warningText:  "Please reset your password again immediately and contact our support team at support@swadbest.com.",
  });

  return sendEmail({
    from:    FROM_SECURITY,
    to:      email,
    subject: "Your SwadBest Password Has Been Updated",
    html,
    label:   "PasswordChanged",
  });
};

// ─────────────────────────────────────────────────────────────────
//  4. ACCOUNT DELETED
// ─────────────────────────────────────────────────────────────────
export const sendAccountDeletedEmail = async (email) => {
  const html = render("security", {
    accentColor:  "linear-gradient(90deg,#dc2626,#ef4444)",
    icon:         "🗑️",
    subject:      "Account Deleted",
    preheader:    "Your SwadBest account has been permanently deleted.",
    heading:      "Your account has been deleted",
    bodyText:     "Your <strong>SwadBest</strong> account and all associated data have been permanently deleted as requested.",
    showDetails:  false,
    warningText:  "If you did not request account deletion, contact our support team immediately at support@swadbest.com.",
  });

  return sendEmail({
    from:    FROM_SUPPORT,
    to:      email,
    subject: "Your SwadBest Account Has Been Deleted",
    html,
    label:   "AccountDeleted",
  });
};
