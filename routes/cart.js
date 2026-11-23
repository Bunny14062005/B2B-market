const express = require("express");

const Cart = require("../models/Cart");
const pool = require("../config/db");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

router.use(authenticateUser, authorizeRole("buyer"));

const isValidId = (id) =>
  /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));

// GET OR CREATE CART
const getOrCreateCart = async (buyerId) => {
  let cart = await Cart.findByBuyerId(buyerId);

  if (!cart) {
    try {
      await Cart.create(buyerId);
    } catch (error) {
      // Another simultaneous request may have created the cart.
      if (error.code !== "ER_DUP_ENTRY") {
        throw error;
      }
    }

    cart = await Cart.findByBuyerId(buyerId);
  }

  return cart;
};

// ADD PRODUCT TO CART
router.post("/items", async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!isValidId(String(productId || ""))) {
      return res.status(400).json({
        success: false,
        message: "A valid product ID is required",
      });
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive whole number",
      });
    }

    const [productRows] = await pool.execute(
      `SELECT product_id, quantity
       FROM products
       WHERE product_id = ?
       LIMIT 1`,
      [Number(productId)],
    );

    const product = productRows[0];

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const cart = await getOrCreateCart(req.user.buyer_id);

    const [existingItems] = await pool.execute(
      `SELECT quantity
       FROM cart_items
       WHERE cart_id = ? AND product_id = ?
       LIMIT 1`,
      [cart._id, Number(productId)],
    );

    const requestedQuantity = (existingItems[0]?.quantity || 0) + quantity;

    if (requestedQuantity > product.quantity) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
        availableStock: product.quantity,
        requestedQuantity,
      });
    }

    await Cart.addItem(cart._id, Number(productId), quantity);

    const updatedCart = await Cart.findByBuyerId(req.user.buyer_id);

    return res.status(200).json({
      success: true,
      message: "Product added to cart successfully",
      cart: updatedCart,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to add product to cart",
    });
  }
});

// GET BUYER CART
router.get("/", async (req, res) => {
  try {
    const cart = await Cart.findByBuyerId(req.user.buyer_id);

    return res.status(200).json({
      success: true,
      cart: cart || {
        buyer: req.user.buyer_id,
        items: [],
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch cart",
    });
  }
});

// UPDATE CART ITEM QUANTITY
router.put("/items/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!isValidId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive whole number",
      });
    }

    const [productRows] = await pool.execute(
      `SELECT product_id, quantity
       FROM products
       WHERE product_id = ?
       LIMIT 1`,
      [Number(productId)],
    );

    const product = productRows[0];

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const cart = await Cart.findByBuyerId(req.user.buyer_id);

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const existingItem = cart.items.find(
      (item) => item.product._id === Number(productId),
    );

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }

    if (quantity > product.quantity) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
        availableStock: product.quantity,
        requestedQuantity: quantity,
      });
    }

    await Cart.updateItem(cart._id, Number(productId), quantity);

    const updatedCart = await Cart.findByBuyerId(req.user.buyer_id);

    return res.status(200).json({
      success: true,
      message: "Cart quantity updated successfully",
      cart: updatedCart,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to update cart",
    });
  }
});

// REMOVE PRODUCT FROM CART
router.delete("/items/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const cart = await Cart.findByBuyerId(req.user.buyer_id);

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const existingItem = cart.items.find(
      (item) => item.product._id === Number(productId),
    );

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in cart",
      });
    }

    await Cart.removeItem(cart._id, Number(productId));

    const updatedCart = await Cart.findByBuyerId(req.user.buyer_id);

    return res.status(200).json({
      success: true,
      message: "Product removed from cart successfully",
      cart: updatedCart,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove product from cart",
    });
  }
});

// CLEAR CART
router.delete("/", async (req, res) => {
  try {
    const cart = await Cart.findByBuyerId(req.user.buyer_id);

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    await Cart.clearItems(cart._id);

    const updatedCart = await Cart.findByBuyerId(req.user.buyer_id);

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
      cart: updatedCart,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to clear cart",
    });
  }
});

module.exports = router;
