const express = require("express");

const Company = require("../models/Company");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

// CREATE COMPANY PROFILE
router.post("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const { companyName, email, phone, address, businessDescription } =
      req.body;

    if (
      typeof companyName !== "string" ||
      typeof email !== "string" ||
      typeof phone !== "string" ||
      typeof address !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Company name, email, phone and address are required",
      });
    }

    const cleanCompanyName = companyName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();

    if (!cleanCompanyName || !cleanEmail || !cleanPhone || !cleanAddress) {
      return res.status(400).json({
        success: false,
        message: "Required fields cannot contain only spaces",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    if (
      businessDescription !== undefined &&
      typeof businessDescription !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Business description must be a string",
      });
    }

    const existingCompany = await Company.findOne();

    if (existingCompany) {
      return res.status(409).json({
        success: false,
        message: "Company profile already exists",
      });
    }

    const company = await Company.create({
      companyName: cleanCompanyName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      businessDescription: businessDescription
        ? businessDescription.trim()
        : "",
    });

    return res.status(201).json({
      success: true,
      message: "Company profile created successfully",
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to create company profile",
    });
  }
});

// GET COMPANY PROFILE
router.get("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const company = await Company.findOne();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    return res.status(200).json({
      success: true,
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch company",
    });
  }
});

// UPDATE COMPANY PROFILE
router.put("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const { companyName, email, phone, address, businessDescription } =
      req.body;

    if (
      typeof companyName !== "string" ||
      !companyName.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof phone !== "string" ||
      !phone.trim() ||
      typeof address !== "string" ||
      !address.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Company name, email, phone, and address are required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    if (
      businessDescription !== undefined &&
      typeof businessDescription !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Business description must be a string",
      });
    }

    const existingCompany = await Company.findOne();

    if (!existingCompany) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    const company = await Company.update(existingCompany._id, {
      companyName: companyName.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      address: address.trim(),
      businessDescription:
        businessDescription === undefined
          ? existingCompany.businessDescription
          : businessDescription.trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Company profile updated successfully",
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to update company profile",
    });
  }
});

// DELETE COMPANY PROFILE
router.delete(
  "/",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const company = await Company.findOne();

      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      await Company.delete(company._id);

      return res.status(200).json({
        success: true,
        message: "Company profile deleted successfully",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete company profile",
      });
    }
  },
);

module.exports = router;
