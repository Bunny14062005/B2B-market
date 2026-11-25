const express = require("express");

const Review = require("../models/Review");
const Product = require("../models/Product");

const authenticateUser = require("../middleware/auth");

const router = express.Router();

const isValidId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const handleError = (res, error) => {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "You have already reviewed this product",
    });
  }

  if (error.code === "PRODUCT_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  if (error.code === "REVIEW_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: "Review not found",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE REVIEW
router.post("/", authenticateUser, async (req, res) => {
  try {
    if (!["buyer", "vendor"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only buyers and vendors can create reviews",
      });
    }

    const { product, rating, comment } = req.body;

    if (!product || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product and rating are required",
      });
    }

    if (!isValidId(product)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a whole number between 1 and 5",
      });
    }

    if (
      comment !== undefined &&
      (typeof comment !== "string" || comment.length > 1000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Comment must be text with a maximum of 1000 characters",
      });
    }

    const existingProduct = await Product.findById(Number(product));

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const review = await Review.create({
      product: Number(product),
      user: req.user.user_id,
      role: req.user.role,
      rating,
      comment: comment || "",
    });

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      review,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET ALL REVIEWS
router.get("/", authenticateUser, async (req, res) => {
  try {
    const reviews = await Review.findAll();

    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET REVIEWS FOR A PRODUCT
router.get("/product/:productId", authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(Number(productId));

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const reviews = await Review.findByProduct(Number(productId));

    return res.status(200).json({
      success: true,
      product: {
        id: product.product_id,
        name: product.name,
        averageRating: Number(product.average_rating),
        numReviews: product.num_reviews,
      },
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET REVIEW BY ID
router.get("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const review = await Review.findById(Number(id));

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    return res.status(200).json({
      success: true,
      review,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// UPDATE REVIEW
router.put("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    if (rating === undefined && comment === undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide a rating or comment to update",
      });
    }

    if (
      rating !== undefined &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a whole number between 1 and 5",
      });
    }

    if (
      comment !== undefined &&
      (typeof comment !== "string" || comment.length > 1000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Comment must be text with a maximum of 1000 characters",
      });
    }

    const reviewId = Number(id);
    const existingReview = await Review.findById(reviewId);

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const isOwner =
      Number(existingReview.user._id) === Number(req.user.user_id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own review",
      });
    }

    const updatedReview = await Review.update(reviewId, {
      rating,
      comment,
    });

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review: updatedReview,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE REVIEW
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    const reviewId = Number(id);
    const existingReview = await Review.findById(reviewId);

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const isOwner =
      Number(existingReview.user._id) === Number(req.user.user_id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own review",
      });
    }

    await Review.delete(reviewId);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
