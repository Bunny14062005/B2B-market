const express = require("express");

const Order = require("../models/Order");
const authenticateUser = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");
const { canTransitionOrder } = require("../utils/orderStatus");

const router = express.Router();

const isValidId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const handleError = (res, error) => {
  if (error.code === "BUYER_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: "Buyer not found",
    });
  }

  if (error.code === "PRODUCT_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "INSUFFICIENT_STOCK") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "ORDER_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  if (error.code === "VENDOR_ORDER_NOT_FOUND") {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "ORDER_ALREADY_CANCELLED") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (
    error.code === "ORDER_CANNOT_BE_CANCELLED" ||
    error.code === "ORDER_CANNOT_BE_UPDATED" ||
    error.code === "INVALID_VENDOR_STATUS"
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "RESTOCK_FAILED") {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE ORDER
router.post("/", authenticateUser, authorizeRole("buyer"), async (req, res) => {
  try {
    const { buyer, items } = req.body;

    if (Number(buyer) !== req.user.buyer_id) {
      return res.status(403).json({
        success: false,
        message: "You can only create orders for your own buyer account",
      });
    }

    if (!isValidId(buyer)) {
      return res.status(400).json({
        success: false,
        message: "A valid buyer ID is required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required",
      });
    }

    for (const item of items) {
      if (!item || !isValidId(item.product)) {
        return res.status(400).json({
          success: false,
          message: "A valid product ID is required",
        });
      }

      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a positive whole number",
        });
      }
    }

    const order = await Order.create({
      buyer: Number(buyer),
      items: items.map((item) => ({
        product: Number(item.product),
        quantity: item.quantity,
      })),
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET VENDOR ORDERS
router.get(
  "/vendor/my-orders",
  authenticateUser,
  authorizeRole("vendor"),
  async (req, res) => {
    try {
      if (!req.user.vendor_id) {
        return res.status(403).json({
          success: false,
          message: "Vendor profile is not linked to this account",
        });
      }

      const orders = await Order.findByVendorId(req.user.vendor_id);

      return res.status(200).json({
        success: true,
        count: orders.length,
        orders,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

// UPDATE VENDOR FULFILLMENT STATUS
router.put(
  "/vendor/:orderId/status",
  authenticateUser,
  authorizeRole("vendor"),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      if (!isValidId(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      if (!["Shipped", "Delivered"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be Shipped or Delivered",
        });
      }

      if (!req.user.vendor_id) {
        return res.status(403).json({
          success: false,
          message: "Vendor profile is not linked to this account",
        });
      }

      const order = await Order.updateVendorFulfillmentStatus(
        Number(orderId),
        req.user.vendor_id,
        status,
      );

      return res.status(200).json({
        success: true,
        message: "Vendor fulfillment status updated successfully",
        order,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

// GET ALL ORDERS
router.get(
  "/",
  authenticateUser,
  authorizeRole("admin", "buyer"),
  async (req, res) => {
    try {
      const orders =
        req.user.role === "admin"
          ? await Order.findAll()
          : await Order.findByBuyerId(req.user.buyer_id);

      return res.status(200).json({
        success: true,
        count: orders.length,
        orders,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

// GET ORDER BY ID
router.get(
  "/:id",
  authenticateUser,
  authorizeRole("admin", "buyer"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      const order = await Order.findById(Number(id));

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (req.user.role === "buyer" && order.buyer._id !== req.user.buyer_id) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own orders",
        });
      }

      return res.status(200).json({
        success: true,
        order,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

// UPDATE ORDER STATUS
router.put(
  "/:id",
  authenticateUser,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      const orderId = Number(id);
      const existingOrder = await Order.findById(orderId);

      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (!canTransitionOrder(existingOrder.status, status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change an order from ${existingOrder.status} to ${status}`,
        });
      }

      const order = await Order.updateStatus(orderId, status);

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        order,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

// CANCEL ORDER
router.put(
  "/:id/cancel",
  authenticateUser,
  authorizeRole("admin", "buyer"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      if (req.user.role === "buyer") {
        const order = await Order.findById(Number(id));

        if (!order) {
          return res.status(404).json({
            success: false,
            message: "Order not found",
          });
        }

        if (order.buyer._id !== req.user.buyer_id) {
          return res.status(403).json({
            success: false,
            message: "You can only cancel your own orders",
          });
        }
      }

      const cancelledOrder = await Order.cancel(Number(id));

      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully",
        order: cancelledOrder,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
);

module.exports = router;
