const express = require("express");

const Buyer = require("../models/Buyer");
const pool = require("../config/db");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

const isValidId = (id) => /^[1-9]\d*$/.test(id);

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "A company profile with this information already exists",
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Referenced record does not exist",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

router.use(authenticateUser);

// GET LOGGED-IN BUYER PROFILE
router.get("/me", authorizeRole("buyer"), async (req, res) => {
  try {
    const buyerId = req.user.buyer_id;

    if (!buyerId) {
      return res.status(404).json({
        success: false,
        message:
          "Company profile not found. Please create your company profile.",
      });
    }

    const buyer = await Buyer.findById(buyerId);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message:
          "Company profile not found. Please create your company profile.",
      });
    }

    return res.status(200).json({
      success: true,
      buyer,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// CREATE LOGGED-IN BUYER PROFILE
router.post("/me", authorizeRole("buyer"), async (req, res) => {
  let connection;

  try {
    const userId = req.user.user_id;

    const { companyName, contactName, phone, address, businessType } = req.body;

    const fields = [companyName, contactName, phone, address, businessType];

    if (fields.some((field) => typeof field !== "string" || !field.trim())) {
      return res.status(400).json({
        success: false,
        message: "All company profile fields are required",
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      "SELECT * FROM users WHERE user_id = ? FOR UPDATE",
      [userId],
    );

    const user = userRows[0];

    if (!user || user.role !== "buyer") {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message: "Only buyer accounts can create company profiles",
      });
    }

    if (user.buyer_id) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Your company profile already exists",
      });
    }

    const [existingBuyer] = await connection.execute(
      "SELECT buyer_id FROM buyers WHERE email = ?",
      [user.email],
    );

    if (existingBuyer.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "A company profile with this email already exists",
      });
    }

    const [buyerResult] = await connection.execute(
      `INSERT INTO buyers
       (company_name, contact_name, email, phone, address, business_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        companyName.trim(),
        contactName.trim(),
        user.email,
        phone.trim(),
        address.trim(),
        businessType.trim(),
      ],
    );

    await connection.execute(
      "UPDATE users SET buyer_id = ? WHERE user_id = ?",
      [buyerResult.insertId, userId],
    );

    const [buyerRows] = await connection.execute(
      "SELECT * FROM buyers WHERE buyer_id = ?",
      [buyerResult.insertId],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Company profile created successfully",
      buyer: buyerRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    handleError(res, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// UPDATE LOGGED-IN BUYER PROFILE
router.put("/me", authorizeRole("buyer"), async (req, res) => {
  try {
    const buyerId = req.user.buyer_id;

    if (!buyerId) {
      return res.status(404).json({
        success: false,
        message: "Please create your company profile first",
      });
    }

    const existingBuyer = await Buyer.findById(buyerId);

    if (!existingBuyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer profile not found",
      });
    }

    const { companyName, contactName, phone, address, businessType } = req.body;

    const fields = [companyName, contactName, phone, address, businessType];

    if (fields.some((field) => typeof field !== "string" || !field.trim())) {
      return res.status(400).json({
        success: false,
        message: "All company profile fields are required",
      });
    }

    const buyer = await Buyer.update(buyerId, {
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      email: existingBuyer.email,
      phone: phone.trim(),
      address: address.trim(),
      businessType: businessType.trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Company profile updated successfully",
      buyer,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ADMIN-ONLY ROUTES
router.use(authorizeRole("admin"));

// CREATE BUYER
router.post("/", async (req, res) => {
  try {
    const { companyName, contactName, email, phone, address, businessType } =
      req.body;

    const fields = [
      companyName,
      contactName,
      email,
      phone,
      address,
      businessType,
    ];

    if (fields.some((field) => typeof field !== "string" || !field.trim())) {
      return res.status(400).json({
        success: false,
        message: "All buyer fields are required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const buyer = await Buyer.create({
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      address: address.trim(),
      businessType: businessType.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Buyer created successfully",
      buyer,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET ALL BUYERS
router.get("/", async (req, res) => {
  try {
    const buyers = await Buyer.findAll();

    return res.status(200).json({
      success: true,
      count: buyers.length,
      buyers,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET BUYER BY ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid buyer ID",
      });
    }

    const buyer = await Buyer.findById(Number(id));

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    return res.status(200).json({
      success: true,
      buyer,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// UPDATE BUYER
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid buyer ID",
      });
    }

    const buyerId = Number(id);
    const existingBuyer = await Buyer.findById(buyerId);

    if (!existingBuyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    const { companyName, contactName, email, phone, address, businessType } =
      req.body;

    const updatedData = {
      companyName:
        companyName === undefined ? existingBuyer.company_name : companyName,
      contactName:
        contactName === undefined ? existingBuyer.contact_name : contactName,
      email: email === undefined ? existingBuyer.email : email,
      phone: phone === undefined ? existingBuyer.phone : phone,
      address: address === undefined ? existingBuyer.address : address,
      businessType:
        businessType === undefined ? existingBuyer.business_type : businessType,
    };

    if (
      Object.values(updatedData).some(
        (field) => typeof field !== "string" || !field.trim(),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields must contain valid text",
      });
    }

    updatedData.email = updatedData.email.trim().toLowerCase();

    if (!isValidEmail(updatedData.email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const buyer = await Buyer.update(buyerId, {
      companyName: updatedData.companyName.trim(),
      contactName: updatedData.contactName.trim(),
      email: updatedData.email,
      phone: updatedData.phone.trim(),
      address: updatedData.address.trim(),
      businessType: updatedData.businessType.trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Buyer updated successfully",
      buyer,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// DEACTIVATE BUYER BUSINESS
router.delete("/:id", async (req, res) => {
  let connection;

  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid buyer ID",
      });
    }

    const buyerId = Number(id);
    const buyer = await Buyer.findById(buyerId);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();

    await connection.execute(
      "UPDATE buyers SET is_active = 0 WHERE buyer_id = ?",
      [buyerId],
    );

    await connection.execute(
      "UPDATE users SET is_active = 0 WHERE buyer_id = ?",
      [buyerId],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Buyer business deactivated successfully",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
});

// ACTIVATE OR DEACTIVATE BUYER BUSINESS
router.patch("/:id/status", async (req, res) => {
  let connection;

  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!isValidId(id) || typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Valid buyer ID and isActive boolean are required",
      });
    }

    const buyerId = Number(id);
    const buyer = await Buyer.findById(buyerId);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();

    await connection.execute(
      "UPDATE buyers SET is_active = ? WHERE buyer_id = ?",
      [isActive, buyerId],
    );

    await connection.execute(
      "UPDATE users SET is_active = ? WHERE buyer_id = ?",
      [isActive, buyerId],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Buyer business ${
        isActive ? "activated" : "deactivated"
      } successfully`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
