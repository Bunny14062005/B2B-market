const express = require("express");

const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
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
      message: "A duplicate value already exists",
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Referenced vendor or category does not exist",
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Cannot delete this product because related records exist",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const getProductDetails = async (productId) => {
  const [rows] = await pool.execute(
    `SELECT
       p.*,
       c.name AS category,
       v.vendor_id AS vendor_id,
       v.company_name AS vendor_company_name,
       v.contact_name AS vendor_contact_name,
       v.email AS vendor_email,
       v.phone AS vendor_phone,
       v.address AS vendor_address,
       v.business_type AS vendor_business_type
     FROM products p
     INNER JOIN categories c
       ON p.category_id = c.category_id
     INNER JOIN vendors v
       ON p.vendor_id = v.vendor_id
     WHERE p.product_id = ?
     LIMIT 1`,
    [productId],
  );

  return rows[0] || null;
};

const formatProduct = (product) => {
  if (!product) return null;

  return {
    _id: product.product_id,
    name: product.name,
    price: Number(product.price),
    quantity: product.quantity,
    category: product.category,
    vendor: {
      _id: product.vendor_id,
      companyName: product.vendor_company_name,
      contactName: product.vendor_contact_name,
      email: product.vendor_email,
      phone: product.vendor_phone,
      address: product.vendor_address,
      businessType: product.vendor_business_type,
    },
    averageRating: Number(product.average_rating),
    numReviews: product.num_reviews,
    isAvailable: Boolean(product.is_available),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
};

const findCategoryId = async (categoryName) => {
  const [rows] = await pool.execute(
    `SELECT category_id
     FROM categories
     WHERE LOWER(name) = LOWER(?)
     LIMIT 1`,
    [categoryName.trim()],
  );

  return rows[0]?.category_id || null;
};

const validateProduct = ({ name, price, quantity, category }) => {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof category !== "string" ||
    !category.trim()
  ) {
    return "Product name and category are required";
  }

  if (
    price === undefined ||
    price === null ||
    price === "" ||
    !Number.isFinite(Number(price)) ||
    Number(price) <= 0
  ) {
    return "Price must be a number greater than zero";
  }

  if (
    quantity === undefined ||
    quantity === null ||
    quantity === "" ||
    !Number.isSafeInteger(Number(quantity)) ||
    Number(quantity) < 0
  ) {
    return "Quantity must be a non-negative whole number";
  }

  return null;
};

// VENDOR: GET OWN PRODUCTS INCLUDING ARCHIVED PRODUCTS
router.get(
  "/vendor/my-products",
  authenticateUser,
  authorizeRole("vendor"),
  async (req, res) => {
    try {
      if (!req.user.vendor_id) {
        return res.status(404).json({
          success: false,
          message: "Vendor profile not found",
        });
      }

      const products = await Product.findByVendorId(req.user.vendor_id);

      return res.status(200).json({
        success: true,
        count: products.length,
        products: products.map((product) => ({
          _id: product.product_id,
          name: product.name,
          price: Number(product.price),
          quantity: product.quantity,
          category: product.category,
          vendor: {
            _id: product.vendor_id,
            companyName: product.vendor_name,
          },
          averageRating: Number(product.average_rating),
          numReviews: product.num_reviews,
          isAvailable: Boolean(product.is_available),
          createdAt: product.created_at,
          updatedAt: product.updated_at,
        })),
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// CREATE PRODUCT
router.post(
  "/",
  authenticateUser,
  authorizeRole("admin", "vendor"),
  async (req, res) => {
    try {
      const { name, price, quantity, category, vendor } = req.body;

      const validationError = validateProduct({
        name,
        price,
        quantity,
        category,
      });

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }

      if (vendor === undefined || !isValidId(String(vendor))) {
        return res.status(400).json({
          success: false,
          message: "Valid vendor ID is required",
        });
      }

      const vendorId = Number(vendor);

      if (req.user.role === "vendor" && req.user.vendor_id !== vendorId) {
        return res.status(403).json({
          success: false,
          message: "You can only create products for your own vendor account",
        });
      }

      const existingVendor = await Vendor.findById(vendorId);

      if (!existingVendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      const categoryId = await findCategoryId(category);

      if (!categoryId) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      const createdProduct = await Product.create({
        name: name.trim(),
        price: Number(price),
        quantity: Number(quantity),
        category_id: categoryId,
        vendor_id: vendorId,
      });

      const productDetails = await getProductDetails(createdProduct.product_id);

      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        product: formatProduct(productDetails),
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// GET ALL AVAILABLE PRODUCTS
router.get("/", async (req, res) => {
  try {
    const { search, category, sort } = req.query;

    const conditions = ["p.is_available = 1"];
    const values = [];

    if (search) {
      conditions.push("p.name LIKE ?");
      values.push(`%${search}%`);
    }

    if (category) {
      conditions.push("LOWER(c.name) = LOWER(?)");
      values.push(category);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    let sortOption = "p.created_at DESC";

    switch (sort) {
      case "price_asc":
        sortOption = "p.price ASC";
        break;
      case "price_desc":
        sortOption = "p.price DESC";
        break;
      case "name_asc":
        sortOption = "p.name ASC";
        break;
      case "name_desc":
        sortOption = "p.name DESC";
        break;
      case "oldest":
        sortOption = "p.created_at ASC";
        break;
      case "newest":
      default:
        sortOption = "p.created_at DESC";
    }

    const [rows] = await pool.execute(
      `SELECT
         p.*,
         c.name AS category,
         v.vendor_id AS vendor_id,
         v.company_name AS vendor_company_name,
         v.contact_name AS vendor_contact_name,
         v.email AS vendor_email,
         v.phone AS vendor_phone,
         v.address AS vendor_address,
         v.business_type AS vendor_business_type
       FROM products p
       INNER JOIN categories c
         ON p.category_id = c.category_id
       INNER JOIN vendors v
         ON p.vendor_id = v.vendor_id
       ${whereClause}
       ORDER BY ${sortOption}`,
      values,
    );

    const products = rows.map(formatProduct);

    return res.status(200).json({
      success: true,
      count: products.length,
      filters: {
        search: search || null,
        category: category || null,
        sort: sort || "newest",
      },
      products,
    });
  } catch (error) {
    handleError(res, error);
  }
});

// GET PRODUCT BY ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await getProductDetails(Number(id));

    if (!product || !product.is_available) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProduct(product),
    });
  } catch (error) {
    handleError(res, error);
  }
});

// UPDATE PRODUCT
router.put(
  "/:id",
  authenticateUser,
  authorizeRole("admin", "vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const productId = Number(id);
      const existingProduct = await getProductDetails(productId);

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (
        req.user.role === "vendor" &&
        req.user.vendor_id !== existingProduct.vendor_id
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own products",
        });
      }

      const { name, price, quantity, category, vendor } = req.body;

      const updatedData = {
        name: name === undefined ? existingProduct.name : name,
        price: price === undefined ? existingProduct.price : price,
        quantity: quantity === undefined ? existingProduct.quantity : quantity,
        category: category === undefined ? existingProduct.category : category,
        vendor: vendor === undefined ? existingProduct.vendor_id : vendor,
      };

      const validationError = validateProduct(updatedData);

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }

      if (!isValidId(String(updatedData.vendor))) {
        return res.status(400).json({
          success: false,
          message: "Invalid vendor ID",
        });
      }

      const vendorId = Number(updatedData.vendor);

      if (req.user.role === "vendor" && req.user.vendor_id !== vendorId) {
        return res.status(403).json({
          success: false,
          message: "You cannot transfer a product to another vendor",
        });
      }

      const existingVendor = await Vendor.findById(vendorId);

      if (!existingVendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      const categoryId = await findCategoryId(updatedData.category);

      if (!categoryId) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      await Product.update(productId, {
        name: updatedData.name.trim(),
        price: Number(updatedData.price),
        quantity: Number(updatedData.quantity),
        category_id: categoryId,
        vendor_id: vendorId,
      });

      const product = await getProductDetails(productId);

      return res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product: formatProduct(product),
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// ARCHIVE PRODUCT
router.delete(
  "/:id",
  authenticateUser,
  authorizeRole("admin", "vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const product = await getProductDetails(Number(id));

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (
        req.user.role === "vendor" &&
        req.user.vendor_id !== product.vendor_id
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own products",
        });
      }

      await Product.setAvailability(Number(id), false);

      return res.status(200).json({
        success: true,
        message: "Product archived successfully",
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// RESTORE OR ARCHIVE PRODUCT
router.patch(
  "/:id/availability",
  authenticateUser,
  authorizeRole("admin", "vendor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isAvailable } = req.body;

      if (!isValidId(id) || typeof isAvailable !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Valid product ID and isAvailable boolean are required",
        });
      }

      const product = await getProductDetails(Number(id));

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (
        req.user.role === "vendor" &&
        req.user.vendor_id !== product.vendor_id
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only change availability for your own products",
        });
      }

      const updatedProduct = await Product.setAvailability(
        Number(id),
        isAvailable,
      );

      return res.status(200).json({
        success: true,
        message: `Product ${isAvailable ? "restored" : "archived"} successfully`,
        product: updatedProduct,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

module.exports = router;
