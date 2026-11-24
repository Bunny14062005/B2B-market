const express = require("express");

const Buyer = require("../models/Buyer");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

// Buyer records are created during user registration and managed by admins.
router.use(authenticateUser, authorizeRole("admin"));

const isValidId = (id) => /^[1-9]\d*$/.test(id);

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Email already exists",
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

// CREATE BUYER
router.post("/", async (req, res) => {
  try {
    const { companyName, contactName, email, phone, address, businessType } =
      req.body;

    if (
      !companyName ||
      !contactName ||
      !email ||
      !phone ||
      !address ||
      !businessType
    ) {
      return res.status(400).json({
        success: false,
        message: "All buyer fields are required",
      });
    }

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
        message: "All fields must contain valid text",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
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

    const fields = Object.values(updatedData);

    if (fields.some((field) => typeof field !== "string" || !field.trim())) {
      return res.status(400).json({
        success: false,
        message: "All fields must contain valid text",
      });
    }

    updatedData.email = updatedData.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedData.email)) {
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

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE buyers SET is_active = 0 WHERE buyer_id = ?", [buyerId]);
      await connection.execute("UPDATE users SET is_active = 0 WHERE buyer_id = ?", [buyerId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(200).json({
      success: true,
      message: "Buyer business deactivated successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ACTIVATE OR DEACTIVATE BUYER BUSINESS
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!isValidId(id) || typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "Valid buyer ID and isActive boolean are required" });
    }

    const buyer = await Buyer.findById(Number(id));

    if (!buyer) {
      return res.status(404).json({ success: false, message: "Buyer not found" });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE buyers SET is_active = ? WHERE buyer_id = ?", [isActive, Number(id)]);
      await connection.execute("UPDATE users SET is_active = ? WHERE buyer_id = ?", [isActive, Number(id)]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(200).json({ success: true, message: `Buyer business ${isActive ? "activated" : "deactivated"} successfully` });
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
