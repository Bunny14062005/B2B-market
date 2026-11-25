const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

const sendPasswordResetEmail = async (email, resetLink) => {
  await transporter.sendMail({
    from: `"B2B Market" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset Your B2B Market Password",
    text: `We received a request to reset your password.

Click the following link to reset your password:

${resetLink}

This link expires in 15 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 30px; color: #343A36;">
        <h2 style="color: #24483D;">B2B Market</h2>
        <h3>Reset Your Password</h3>
        <p>We received a request to reset your B2B Market account password.</p>
        <p>Click the button below to create a new password.</p>
        <a href="${resetLink}" style="display: inline-block; background: #24483D; color: white; padding: 13px 24px; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p style="margin-top: 25px; font-size: 13px; color: #777D76;">
          This link expires in 15 minutes. If you did not request this, please ignore this email.
        </p>
      </div>
    `,
  });
};

module.exports = { sendPasswordResetEmail };
