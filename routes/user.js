const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pool = require("../config/db");
const authenticateUser = require("../middleware/auth");

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

    if (
      !name ||
      !email ||
      !password ||
      !phone ||
      !role ||
      !companyName ||
      !address ||
      !businessType
    ) {
      return res.status(400).json({
        success: false,
        message: "All registration fields are required",
      });
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof phone !== "string" ||
      typeof companyName !== "string" ||
      typeof address !== "string" ||
      typeof businessType !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields must contain valid text",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanCompanyName = companyName.trim();
    const cleanAddress = address.trim();
    const cleanBusinessType = businessType.trim();

    if (
      !cleanName ||
      !cleanEmail ||
      !cleanPhone ||
      !cleanCompanyName ||
      !cleanAddress ||
      !cleanBusinessType
    ) {
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

    if (!["buyer", "vendor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be buyer or vendor",
      });
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

    const businessTable = role === "buyer" ? "buyers" : "vendors";
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

    let businessId;

    const [existingBusiness] = await connection.execute(
      `SELECT ${role}_id FROM ${businessTable} WHERE email = ?`,
      [cleanEmail],
    );

    if (existingBusiness.length > 0) {
      businessId = existingBusiness[0][`${role}_id`];
    } else {
      const [businessResult] = await connection.execute(
        `INSERT INTO ${businessTable}
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

      businessId = businessResult.insertId;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const buyerId = role === "buyer" ? businessId : null;
    const vendorId = role === "vendor" ? businessId : null;

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

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [rows] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ?",
      [cleanEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await pool.execute(
      `UPDATE users
       SET reset_password_token = ?,
           reset_password_expires = ?
       WHERE user_id = ?`,
      [hashedToken, expiry, rows[0].user_id],
    );

    return res.status(200).json({
      success: true,
      message: "Password reset token generated successfully",
      resetToken,
      expiresIn: "15 minutes",
    });
  } catch (error) {
    handleError(res, error);
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required",
      });
    }

    if (typeof resetToken !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const [rows] = await pool.execute(
      `SELECT user_id FROM users
       WHERE reset_password_token = ?
       AND reset_password_expires > NOW()`,
      [hashedToken],
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.execute(
      `UPDATE users
       SET password = ?,
           reset_password_token = NULL,
           reset_password_expires = NULL
       WHERE user_id = ?`,
      [hashedPassword, rows[0].user_id],
    );

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
