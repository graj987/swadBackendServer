import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FRONTEND VERIFICATION PAGE
const FRONTEND_VERIFY_URL = process.env.FRONTEND_URL + "/verify";


export const verifyMail = async (token, email) => {
    try {
        // Load template
        const templatePath = path.join(__dirname, "template.hbs");
        const emailTemplateSource = fs.readFileSync(templatePath, "utf-8");

        const template = handlebars.compile(emailTemplateSource);

        // Build the correct verification link
        const verifyUrl = `${FRONTEND_VERIFY_URL}?token=${encodeURIComponent(token)}`;

        const htmlToSend = template({
            verifyLink: verifyUrl,
            year: new Date().getFullYear()
        });


        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,   // important
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,  // MUST be App Password
            },
        });


        const mailOptions = {
            from: `"SwadBest" <${process.env.MAIL_USER}>`,
            to: email,
            subject: "Verify Your Email",
            html: htmlToSend,
        };

        await transporter.sendMail(mailOptions);

        console.log("Verification email sent →", email);
        return true;
    } catch (err) {
        console.error("verifyMail error:", err.message);
        return false;
    }
};
