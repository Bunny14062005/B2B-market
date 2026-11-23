const express = require("express");

const Category = require("../models/Category");
const pool = require("../config/db");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

const isValidId = (id) =>
  /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Category name already exists",
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Cannot delete this category because products are linked to it",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE CATEGORY
router.post("/", authenticateUser, authorizeRole("admin"), async (req, res) => {
  try {
    const { name, description = "" } = req.body;

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

    const category = await Category.create({
      name: name.trim(),
      description: description.trim(),
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

// GET ALL CATEGORIES
router.get("/", async (req, res) => {
  try {
    const categories = await Category.findAll();

    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET CATEGORY BY ID
router.get("/:id", async (req, res) => {
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

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// UPDATE CATEGORY
router.put("/:id", authenticateUser, authorizeRole("admin"), async (req, res) => {
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

    const { name, description } = req.body;

    const updatedName = name === undefined ? existingCategory.name : name;

    const updatedDescription =
      description === undefined ? existingCategory.description : description;

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

    const category = await Category.update(categoryId, {
      name: updatedName.trim(),
      description: updatedDescription.trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// DELETE CATEGORY
router.delete("/:id", authenticateUser, authorizeRole("admin"), async (req, res) => {
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
});

module.exports = router;
