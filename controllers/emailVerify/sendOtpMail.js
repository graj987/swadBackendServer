// sendOtpEmail.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export const sendOtpEmail = async (otp, email) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS, // must be app password if Gmail
      },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      html: `<p>Your OTP is <strong>${otp}</strong> — valid for 10 minutes.</p>`
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (err) {
    console.error('sendOtpEmail error:', err);
    throw err;
  }
};
