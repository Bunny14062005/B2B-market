const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pool = require("../config/db");
const Buyer = require("../models/Buyer");
const authenticateUser = require("../middleware/auth");
const { sendPasswordResetEmail } = require("../services/emailService");

const router = express.Router();

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "An account with this information already exists",
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Invalid related record",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const getSafeUser = (user) => ({
  id: user.user_id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  buyer: user.buyer_id || null,
  vendor: user.vendor_id || null,
  isActive: Boolean(user.is_active),
  createdAt: user.created_at,
});

// REGISTER
router.post("/register", async (req, res) => {
  let connection;

  try {
    const {
      name,
      email,
      password,
      phone,
      role,
      companyName,
      address,
      businessType,
    } = req.body;

    if (!name || !email || !password || !phone || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, phone and role are required",
      });
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof phone !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and phone must contain valid text",
      });
    }

    if (!["buyer", "vendor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be buyer or vendor",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanEmail || !cleanPhone) {
      return res.status(400).json({
        success: false,
        message: "Fields cannot contain only spaces",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters",
      });
    }

    let cleanCompanyName = "";
    let cleanAddress = "";
    let cleanBusinessType = "";

    if (role === "vendor") {
      if (
        typeof companyName !== "string" ||
        typeof address !== "string" ||
        typeof businessType !== "string" ||
        !companyName.trim() ||
        !address.trim() ||
        !businessType.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "All vendor business fields are required",
        });
      }

      cleanCompanyName = companyName.trim();
      cleanAddress = address.trim();
      cleanBusinessType = businessType.trim();
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT_SECRET is not configured",
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();

    const [existingUsers] = await connection.execute(
      "SELECT user_id FROM users WHERE email = ?",
      [cleanEmail],
    );

    if (existingUsers.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const otherBusinessTable = role === "buyer" ? "vendors" : "buyers";

    const [otherBusiness] = await connection.execute(
      `SELECT 1 FROM ${otherBusinessTable} WHERE email = ?`,
      [cleanEmail],
    );

    if (otherBusiness.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "This email is already registered under another business role",
      });
    }

    let buyerId = null;
    let vendorId = null;

    if (role === "buyer") {
      let buyer = await Buyer.findByEmail(cleanEmail, connection);

      if (!buyer) {
        buyer = await Buyer.create(
          {
            companyName: null,
            contactName: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            address: null,
            businessType: null,
          },
          connection,
        );
      }

      buyerId = buyer.buyer_id;
    }

    if (role === "vendor") {
      const [existingVendor] = await connection.execute(
        "SELECT vendor_id FROM vendors WHERE email = ?",
        [cleanEmail],
      );

      if (existingVendor.length > 0) {
        vendorId = existingVendor[0].vendor_id;
      } else {
        const [vendorResult] = await connection.execute(
          `INSERT INTO vendors
           (company_name, contact_name, email, phone, address, business_type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            cleanCompanyName,
            cleanName,
            cleanEmail,
            cleanPhone,
            cleanAddress,
            cleanBusinessType,
          ],
        );

        vendorId = vendorResult.insertId;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [userResult] = await connection.execute(
      `INSERT INTO users
       (name, email, password, phone, role, buyer_id, vendor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        cleanEmail,
        hashedPassword,
        cleanPhone,
        role,
        buyerId,
        vendorId,
      ],
    );

    const [users] = await connection.execute(
      "SELECT * FROM users WHERE user_id = ?",
      [userResult.insertId],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: getSafeUser(users[0]),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    return handleError(res, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT_SECRET is not configured",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [cleanEmail],
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.user_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: getSafeUser(user),
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET PROFILE
router.get("/profile", authenticateUser, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE user_id = ?", [
      req.user.user_id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: getSafeUser(rows[0]),
    });
  } catch (error) {
    handleError(res, error);
  }
});

// UPDATE PROFILE
router.put("/profile", authenticateUser, async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      !phone.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required",
      });
    }

    const [result] = await pool.execute(
      `UPDATE users
       SET name = ?, phone = ?
       WHERE user_id = ?`,
      [name.trim(), phone.trim(), req.user.user_id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const [rows] = await pool.execute("SELECT * FROM users WHERE user_id = ?", [
      req.user.user_id,
    ]);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: getSafeUser(rows[0]),
    });
  } catch (error) {
    handleError(res, error);
  }
});

// DEACTIVATE PROFILE
router.delete("/profile", authenticateUser, async (req, res) => {
  try {
    const [result] = await pool.execute(
      "UPDATE users SET is_active = 0 WHERE user_id = ?",
      [req.user.user_id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User account deactivated successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
});

// FORGOT PASSWORD
router.put("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const [rows] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? AND is_active = 1 LIMIT 1",
      [cleanEmail],
    );

    if (rows.length > 0) {
      const userId = rows[0].user_id;
      const resetToken = crypto.randomBytes(32).toString("hex");

      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      const expiry = new Date(Date.now() + 15 * 60 * 1000);

      await pool.execute(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = ? AND used_at IS NULL`,
        [userId],
      );

      await pool.execute(
        `INSERT INTO password_reset_tokens
         (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`,
        [userId, hashedToken, expiry],
      );

      const frontendUrl = process.env.FRONTEND_URL;

      if (!frontendUrl) {
        await pool.execute(
          "DELETE FROM password_reset_tokens WHERE token_hash = ?",
          [hashedToken],
        );

        throw new Error("FRONTEND_URL is not configured");
      }

      const resetLink = `${frontendUrl.replace(/\/+$/, "")}/reset-password?token=${resetToken}`;

      try {
        await sendPasswordResetEmail(cleanEmail, resetLink);
      } catch (emailError) {
        await pool.execute(
          "DELETE FROM password_reset_tokens WHERE token_hash = ?",
          [hashedToken],
        );

        throw emailError;
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "If an active account exists with that email, a password reset link has been sent.",
    });
  } catch (error) {
    handleError(res, error);
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  let connection;

  try {
    const { token, newPassword } = req.body;

    if (
      typeof token !== "string" ||
      typeof newPassword !== "string" ||
      !token ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required",
      });
    }

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    connection = await pool.getConnection();

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT user_id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND expires_at > NOW()
         AND used_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [hashedToken],
    );

    if (rows.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link",
      });
    }

    const userId = rows[0].user_id;

    await connection.execute(
      "UPDATE users SET password = ? WHERE user_id = ?",
      [hashedPassword, userId],
    );

    await connection.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [userId],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    return handleError(res, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;
