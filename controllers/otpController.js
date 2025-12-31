import { resend } from "../utils/resendClient.js";
import Otp from "../models/otp.js";



const otpStore = {}; // In-memory — replace with Redis later

export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save or update OTP in DB
    await Otp.findOneAndUpdate(
      { email },
      {
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        verified: false,
        attempts: 0,
      },
      { upsert: true }
    );

    // Send OTP email
    await resend.emails.send({
      from: "SwadBest <onboarding@resend.dev>",
      to: email,
      subject: "Your SwadBest OTP Code",
      html: `
        <h2>Your OTP is ${otp}</h2>
        <p>Valid for 5 minutes.</p>
      `,
    });

    res.json({ success: true, message: "OTP sent" });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// ------------------------
// VERIFY OTP
// ------------------------
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = await Otp.findOne({ email });
    if (!record) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({ success: false, message: "Too many attempts" });
    }

    if (record.otp !== otp) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    record.verified = true;
    await record.save();

    res.json({ success: true, message: "OTP verified" });

  } catch (err) {
    res.status(500).json({ success: false, message: "OTP verification failed" });
  }
};


