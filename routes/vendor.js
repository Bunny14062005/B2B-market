const express = require("express");

const Vendor = require("../models/Vendor");
const pool = require("../config/db");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

// Vendor records are created during user registration and managed by admins.
router.use(authenticateUser, authorizeRole("admin"));

const isValidId = (id) => /^[1-9]\d*$/.test(id);

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Email already exists",
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Cannot delete this vendor because related records exist",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE VENDOR
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
        message: "All vendor fields are required and must contain valid text",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const vendor = await Vendor.create({
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      address: address.trim(),
      businessType: businessType.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      vendor,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET ALL VENDORS
router.get("/", async (req, res) => {
  try {
    const vendors = await Vendor.findAll();

    return res.status(200).json({
      success: true,
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET VENDOR BY ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findById(Number(id));

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    return res.status(200).json({
      success: true,
      vendor,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// UPDATE VENDOR
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendorId = Number(id);

    const existingVendor = await Vendor.findById(vendorId);

    if (!existingVendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const { companyName, contactName, email, phone, address, businessType } =
      req.body;

    const updatedData = {
      companyName:
        companyName === undefined ? existingVendor.company_name : companyName,
      contactName:
        contactName === undefined ? existingVendor.contact_name : contactName,
      email: email === undefined ? existingVendor.email : email,
      phone: phone === undefined ? existingVendor.phone : phone,
      address: address === undefined ? existingVendor.address : address,
      businessType:
        businessType === undefined
          ? existingVendor.business_type
          : businessType,
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedData.email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const vendor = await Vendor.update(vendorId, {
      companyName: updatedData.companyName.trim(),
      contactName: updatedData.contactName.trim(),
      email: updatedData.email,
      phone: updatedData.phone.trim(),
      address: updatedData.address.trim(),
      businessType: updatedData.businessType.trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Vendor updated successfully",
      vendor,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// DELETE VENDOR
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendorId = Number(id);

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const [products] = await pool.execute(
      "SELECT product_id FROM products WHERE vendor_id = ? LIMIT 1",
      [vendorId],
    );

    if (products.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete this vendor because products are linked to it",
      });
    }

    await Vendor.delete(vendorId);

    return res.status(200).json({
      success: true,
      message: "Vendor deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
