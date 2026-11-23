const express = require("express");

const pool = require("../config/db");

const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

const handleError = (res, error) => {
  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// BUYER DASHBOARD
router.get(
  "/buyer/dashboard",
  authenticateUser,
  authorizeRole("buyer"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Welcome to the buyer dashboard",
      buyer: {
        id: req.user.buyer_id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  },
);

// VENDOR DASHBOARD
router.get(
  "/vendor/dashboard",
  authenticateUser,
  authorizeRole("vendor"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Welcome to vendor dashboard",
      vendor: {
        id: req.user.vendor_id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  },
);

// ADMIN DASHBOARD
router.get(
  "/admin/dashboard",
  authenticateUser,
  authorizeRole("admin"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Welcome to admin dashboard",
      admin: {
        id: req.user.user_id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  },
);

// GET ALL USERS (ADMIN ONLY)
// Optional filter: /api/admin/users?role=buyer
router.get(
  "/admin/users",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { role } = req.query;

      let sql = `
        SELECT
          user_id,
          name,
          email,
          phone,
          role,
          buyer_id,
          vendor_id,
          is_active,
          created_at
        FROM users
      `;

      const values = [];

      if (role) {
        if (!["buyer", "vendor", "admin"].includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role filter",
          });
        }

        sql += " WHERE role = ?";
        values.push(role);
      }

      sql += " ORDER BY created_at DESC";

      const [rows] = await pool.execute(sql, values);

      const users = rows.map((user) => ({
        id: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        buyer: user.buyer_id,
        vendor: user.vendor_id,
        isActive: Boolean(user.is_active),
        createdAt: user.created_at,
      }));

      return res.status(200).json({
        success: true,
        count: users.length,
        users,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

// ACTIVATE OR DEACTIVATE A USER (ADMIN ONLY)
router.patch(
  "/admin/users/:id/status",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { isActive } = req.body;

      if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: "Invalid user ID" });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).json({ success: false, message: "isActive must be true or false" });
      }

      if (userId === req.user.user_id && !isActive) {
        return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
      }

      const [result] = await pool.execute(
        "UPDATE users SET is_active = ? WHERE user_id = ?",
        [isActive, userId],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(200).json({
        success: true,
        message: `User account ${isActive ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

module.exports = router;
