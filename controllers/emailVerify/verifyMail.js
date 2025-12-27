import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_VERIFY_URL = process.env.FRONTEND_URL + "/verify";

const resend = new Resend(process.env.RESEND_API_KEY);

export const verifyMail = async (token, email) => {
  try {
    // Load HTML template
    const templatePath = path.join(__dirname, "template.hbs");
    const emailTemplateSource = fs.readFileSync(templatePath, "utf-8");
    const template = handlebars.compile(emailTemplateSource);

    // Build verification URL
    const verifyLink = `${FRONTEND_VERIFY_URL}?token=${encodeURIComponent(token)}`;

    const htmlToSend = template({
      verifyLink,
      year: new Date().getFullYear(),
    });

    // Send email via Resend
    await resend.emails.send({
      from: "SwadBest <onboarding@resend.dev>",
      to: email,
      subject: "Verify Your Email",
      html: htmlToSend,
    });

    console.log("Verification email sent →", email);
    return true;

  } catch (err) {
    console.error("verifyMail error:", err.message);
    return false;
  }
};
