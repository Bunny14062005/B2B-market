const express = require("express");

const Company = require("../models/Company");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

const isValidId = (id) =>
  /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));

const validateCompany = (body) => {
  const { companyName, email, phone, address, businessDescription } = body;

  if (
    typeof companyName !== "string" ||
    typeof email !== "string" ||
    typeof phone !== "string" ||
    typeof address !== "string"
  ) {
    return "Company name, email, phone and address are required";
  }

  if (
    !companyName.trim() ||
    !email.trim() ||
    !phone.trim() ||
    !address.trim()
  ) {
    return "Required fields cannot contain only spaces";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Please provide a valid email address";
  }

  if (
    businessDescription !== undefined &&
    typeof businessDescription !== "string"
  ) {
    return "Business description must be a string";
  }

  return null;
};

router.get("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const companies = await Company.findAll();

    return res.status(200).json({
      success: true,
      count: companies.length,
      companies,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch companies",
    });
  }
});

router.get(
  "/:id",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID",
        });
      }

      const company = await Company.findById(Number(id));

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
  },
);

router.post("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const validationError = validateCompany(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const { companyName, email, phone, address, businessDescription } =
      req.body;

    const company = await Company.create({
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: address.trim(),
      businessDescription: businessDescription
        ? businessDescription.trim()
        : "",
    });

    return res.status(201).json({
      success: true,
      message: "Company created successfully",
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to create company",
    });
  }
});

router.put(
  "/:id",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID",
        });
      }

      const validationError = validateCompany(req.body);

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }

      const existingCompany = await Company.findById(Number(id));

      if (!existingCompany) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      const { companyName, email, phone, address, businessDescription } =
        req.body;

      const company = await Company.update(Number(id), {
        companyName: companyName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        businessDescription: businessDescription
          ? businessDescription.trim()
          : "",
      });

      return res.status(200).json({
        success: true,
        message: "Company updated successfully",
        company,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Failed to update company",
      });
    }
  },
);

router.delete(
  "/:id",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID",
        });
      }

      const existingCompany = await Company.findById(Number(id));

      if (!existingCompany) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      const deleted = await Company.delete(Number(id));

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Company deleted successfully",
      });
    } catch (error) {
      console.error(error);

      if (error.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).json({
          success: false,
          message:
            "Company cannot be deleted because other records depend on it",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to delete company",
      });
    }
  },
);

module.exports = router;
