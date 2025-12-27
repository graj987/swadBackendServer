// emailService.js
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// ---------- 1. WELCOME EMAIL ----------
export const sendWelcomeEmail = async (email, name) => {
  try {
    const html = `
    <div style="font-family: Arial; max-width:600px; margin:20px auto; padding:25px; border:1px solid #eee; border-radius:10px;">
      <h2 style="text-align:center; color:#28a745;">Welcome to SwadBest, ${name}!</h2>

      <p>Hello ${name},</p>
      <p>Thank you for joining SwadBest. Your account is now verified and ready to use.</p>
      <p>We're excited to have you with us 🎉</p>

      <p style="margin-top:30px; color:#777; font-size:14px; text-align:center;">
        © ${new Date().getFullYear()} SwadBest — Eat Fresh, Eat Best.
      </p>
    </div>
    `;

    await resend.emails.send({
      from: "SwadBest <onboarding@resend.dev>",
      to: email,
      subject: "Welcome to SwadBest 🎉",
      html,
    });

    console.log("Welcome email sent →", email);
    return true;

  } catch (err) {
    console.error("WelcomeMail error:", err.message);
    return false;
  }
};


// ---------- 2. LOGIN NOTIFICATION EMAIL ----------
export const sendLoginNotification = async (email, ip, device) => {
  try {
    const html = `
    <div style="font-family: Arial; max-width:600px; margin:20px auto; padding:25px; border:1px solid #eee; border-radius:10px;">
      <h2 style="text-align:center; color:#28a745;">New Login Detected</h2>

      <p>Hello,</p>
      <p>A new login was detected on your SwadBest account.</p>

      <div style="background:#f1fff3; padding:15px; border-radius:8px; border:1px solid #c3efc8;">
        <p><strong>Device:</strong> ${device}</p>
        <p><strong>IP Address:</strong> ${ip}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      </div>

      <p>If this wasn't you, please reset your password immediately.</p>

      <p style="margin-top:30px; color:#777; font-size:14px; text-align:center;">
        © ${new Date().getFullYear()} SwadBest Security
      </p>
    </div>
    `;

    await resend.emails.send({
      from: "SwadBest Security <onboarding@resend.dev>",
      to: email,
      subject: "New Login to Your SwadBest Account",
      html,
    });

    console.log("Login notification sent →", email);
    return true;

  } catch (err) {
    console.error("LoginNotification error:", err.message);
    return false;
  }
};


// ---------- 3. PASSWORD CHANGE CONFIRMATION EMAIL ----------
export const sendPasswordChangedEmail = async (email) => {
  try {
    const html = `
    <div style="font-family: Arial; max-width:600px; margin:20px auto; padding:25px; border:1px solid #eee; border-radius:10px;">
      <h2 style="text-align:center; color:#28a745;">Password Updated Successfully</h2>

      <p>Hello,</p>
      <p>This is to confirm that your SwadBest account password was changed successfully.</p>

      <p>If you did not make this change, please reset your password immediately.</p>

      <p style="margin-top:30px; color:#777; font-size:14px; text-align:center;">
        © ${new Date().getFullYear()} SwadBest Security
      </p>
    </div>
    `;

    await resend.emails.send({
      from: "SwadBest Security <onboarding@resend.dev>",
      to: email,
      subject: "Your SwadBest Password Has Been Updated",
      html,
    });

    console.log("Password change email sent →", email);
    return true;

  } catch (err) {
    console.error("PasswordChanged error:", err.message);
    return false;
  }
};


// ---------- 4. ACCOUNT DELETED EMAIL ----------
export const sendAccountDeletedEmail = async (email) => {
  try {
    const html = `
    <div style="font-family: Arial; max-width:600px; margin:20px auto; padding:25px; border:1px solid #eee; border-radius:10px;">
      <h2 style="text-align:center; color:#d9534f;">Account Deleted</h2>

      <p>Hello,</p>
      <p>Your SwadBest account has been successfully deleted as requested.</p>

      <p>If you did not request this action, contact our support team immediately.</p>

      <p style="margin-top:30px; color:#777; font-size:14px; text-align:center;">
        © ${new Date().getFullYear()} SwadBest Support
      </p>
    </div>
    `;

    await resend.emails.send({
      from: "SwadBest Support <onboarding@resend.dev>",
      to: email,
      subject: "Your SwadBest Account Has Been Deleted",
      html,
    });

    console.log("Account deletion email sent →", email);
    return true;

  } catch (err) {
    console.error("AccountDeleted error:", err.message);
    return false;
  }
};
