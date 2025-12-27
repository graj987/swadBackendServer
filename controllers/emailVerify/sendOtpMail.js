import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOtpEmail = async (otp, email) => {
  try {
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Password Reset OTP</title>

      <style>
        body {
          background-color: #f5f7fa;
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: #ffffff;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          border: 1px solid #e6e6e6;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          color: #28a745;
        }
        .otp-box {
          text-align: center;
          background-color: #f0fff4;
          border: 1px solid #c7f5d6;
          padding: 15px;
          font-size: 32px;
          font-weight: bold;
          border-radius: 8px;
          color: #1e8b37;
          letter-spacing: 4px;
          margin: 20px 0;
        }
        .info {
          font-size: 15px;
          margin-bottom: 20px;
          line-height: 1.5;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          font-size: 13px;
          color: #777;
        }
      </style>
    </head>

    <body>
      <div class="container">
        <div class="header">
          <h1>SwadBest Security</h1>
        </div>

        <p class="info">
          Use the OTP below to reset your password.<br/>
          This code is valid for the next <strong>10 minutes</strong>.
        </p>

        <div class="otp-box">${otp}</div>

        <p class="info">
          If you didn’t request a password reset, you can safely ignore this email.
        </p>

        <div class="footer">
          © ${new Date().getFullYear()} SwadBest. All rights reserved.
        </div>
      </div>
    </body>
    </html>
    `;

    // Send using Resend
    const result = await resend.emails.send({
      from: "SwadBest Security <onboarding@resend.dev>",
      to: email,
      subject: "Your SwadBest Password Reset OTP",
      html: htmlTemplate,
    });

    console.log("OTP sent →", email);
    return result;

  } catch (err) {
    console.error("sendOtpEmail error:", err.message);
    throw err;
  }
};
