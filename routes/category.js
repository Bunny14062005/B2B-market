const express = require("express");

const Category = require("../models/Category");
const pool = require("../config/db");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

const isValidId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Category name already exists for this vendor",
    });
  }

  if (
    error.code === "ER_ROW_IS_REFERENCED_2" ||
    error.code === "ER_NO_REFERENCED_ROW_2"
  ) {
    return res.status(409).json({
      success: false,
      message:
        "Cannot complete this operation because related records exist or the vendor is invalid",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const getCategoryVendorId = (req) => {
  if (req.user.role === "vendor") {
    return Number(req.user.vendor_id);
  }

  return null;
};

const isValidVendorId = (id) => isValidId(id);

// CREATE CATEGORY — ADMIN ONLY
router.post("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const { name, description = "", vendor_id } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (typeof description !== "string") {
      return res.status(400).json({
        success: false,
        message: "Description must be valid text",
      });
    }

    if (!isValidVendorId(vendor_id)) {
      return res.status(400).json({
        success: false,
        message: "A valid vendor must be selected",
      });
    }

    const [vendors] = await pool.execute(
      "SELECT vendor_id FROM vendors WHERE vendor_id = ? LIMIT 1",
      [Number(vendor_id)],
    );

    if (vendors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const category = await Category.create({
      name: name.trim(),
      description: description.trim(),
      vendor_id: Number(vendor_id),
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET CATEGORIES — ADMIN SEES ALL, VENDOR SEES OWN
router.get(
  "/",
  authenticateUser,
  authorizeRole("admin", "vendor"),
  async (req, res) => {
    try {
      const vendorId = getCategoryVendorId(req);

      if (
        req.user.role === "vendor" &&
        (!Number.isSafeInteger(vendorId) || vendorId <= 0)
      ) {
        return res.status(403).json({
          success: false,
          message: "Vendor account is not properly linked",
        });
      }

      const categories = await Category.findAll(vendorId);

      return res.status(200).json({
        success: true,
        count: categories.length,
        categories,
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// GET CATEGORY BY ID — CHECK VENDOR OWNERSHIP
router.get(
  "/:id",
  authenticateUser,
  authorizeRole("admin", "vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      const category = await Category.findById(Number(id));

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      if (
        req.user.role === "vendor" &&
        Number(category.vendor_id) !== Number(req.user.vendor_id)
      ) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      return res.status(200).json({
        success: true,
        category,
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// UPDATE CATEGORY — ADMIN ONLY
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
          message: "Invalid category ID",
        });
      }

      const categoryId = Number(id);

      const existingCategory = await Category.findById(categoryId);

      if (!existingCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      const { name, description, vendor_id } = req.body;

      const updatedName = name === undefined ? existingCategory.name : name;

      const updatedDescription =
        description === undefined
          ? existingCategory.description || ""
          : description;

      const updatedVendorId =
        vendor_id === undefined ? existingCategory.vendor_id : vendor_id;

      if (typeof updatedName !== "string" || !updatedName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      if (typeof updatedDescription !== "string") {
        return res.status(400).json({
          success: false,
          message: "Description must be valid text",
        });
      }

      if (!isValidVendorId(updatedVendorId)) {
        return res.status(400).json({
          success: false,
          message: "A valid vendor must be selected",
        });
      }

      const [vendors] = await pool.execute(
        "SELECT vendor_id FROM vendors WHERE vendor_id = ? LIMIT 1",
        [Number(updatedVendorId)],
      );

      if (vendors.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      // PREVENT REASSIGNMENT WHEN PRODUCTS ARE LINKED
      if (Number(updatedVendorId) !== Number(existingCategory.vendor_id)) {
        const [linkedProducts] = await pool.execute(
          `SELECT product_id
           FROM products
           WHERE category_id = ?
           LIMIT 1`,
          [categoryId],
        );

        if (linkedProducts.length > 0) {
          return res.status(409).json({
            success: false,
            message:
              "Cannot reassign this category because products are linked to it. Reassign or remove those products first.",
          });
        }
      }

      const category = await Category.update(categoryId, {
        name: updatedName.trim(),
        description: updatedDescription.trim(),
        vendor_id: Number(updatedVendorId),
      });

      return res.status(200).json({
        success: true,
        message: "Category updated successfully",
        category,
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// DELETE CATEGORY — ADMIN ONLY
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
          message: "Invalid category ID",
        });
      }

      const categoryId = Number(id);

      const category = await Category.findById(categoryId);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      const [linkedProducts] = await pool.execute(
        `SELECT product_id
         FROM products
         WHERE category_id = ?
         LIMIT 1`,
        [categoryId],
      );

      if (linkedProducts.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot delete this category because products are linked to it",
        });
      }

      await Category.delete(categoryId);

      return res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

module.exports = router;
