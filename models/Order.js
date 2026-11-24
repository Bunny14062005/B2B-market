const pool = require("../config/db");

const Order = {
  async findById(orderId) {
    const [orderRows] = await pool.execute(
      `SELECT
         o.*,
         b.company_name AS buyer_company_name,
         b.contact_name AS buyer_contact_name,
         b.email AS buyer_email
       FROM orders o
       INNER JOIN buyers b ON o.buyer_id = b.buyer_id
       WHERE o.order_id = ?
       LIMIT 1`,
      [orderId],
    );

    if (orderRows.length === 0) {
      return null;
    }

    const order = orderRows[0];

    const [itemRows] = await pool.execute(
      `SELECT
         oi.order_item_id,
         oi.quantity,
         oi.unit_price,
         p.product_id,
         p.name AS product_name,
         p.price AS product_price,
         p.quantity AS product_stock,
         c.name AS product_category
       FROM order_items oi
       INNER JOIN products p ON oi.product_id = p.product_id
       INNER JOIN categories c ON p.category_id = c.category_id
       WHERE oi.order_id = ?
       ORDER BY oi.order_item_id ASC`,
      [orderId],
    );

    return {
      _id: order.order_id,
      buyer: {
        _id: order.buyer_id,
        companyName: order.buyer_company_name,
        contactName: order.buyer_contact_name,
        email: order.buyer_email,
      },
      items: itemRows.map((item) => ({
        _id: item.order_item_id,
        product: {
          _id: item.product_id,
          name: item.product_name,
          price: Number(item.product_price),
          quantity: item.product_stock,
          category: item.product_category,
        },
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })),
      totalAmount: Number(order.total_amount),
      status: order.status,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  },

  async findAll() {
    const [rows] = await pool.execute(
      "SELECT order_id FROM orders ORDER BY created_at DESC",
    );

    return Promise.all(rows.map((row) => this.findById(row.order_id)));
  },

  async findByBuyerId(buyerId) {
    const [rows] = await pool.execute(
      "SELECT order_id FROM orders WHERE buyer_id = ? ORDER BY created_at DESC",
      [buyerId],
    );

    return Promise.all(rows.map((row) => this.findById(row.order_id)));
  },

  // CREATE ORDER AND DEDUCT STOCK IN ONE TRANSACTION
  async create(orderData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { buyer, items } = orderData;

      const [buyerRows] = await connection.execute(
        "SELECT buyer_id FROM buyers WHERE buyer_id = ? LIMIT 1",
        [buyer],
      );

      if (buyerRows.length === 0) {
        const error = new Error("Buyer not found");
        error.code = "BUYER_NOT_FOUND";
        throw error;
      }

      let totalAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const [productRows] = await connection.execute(
          `SELECT product_id, name, price, quantity
           FROM products
           WHERE product_id = ? AND is_available = 1
           FOR UPDATE`,
          [item.product],
        );

        const product = productRows[0];

        if (!product) {
          const error = new Error(`Product ${item.product} not found`);
          error.code = "PRODUCT_NOT_FOUND";
          throw error;
        }

        if (product.quantity < item.quantity) {
          const error = new Error(`Insufficient stock for ${product.name}`);
          error.code = "INSUFFICIENT_STOCK";
          throw error;
        }

        const unitPrice = Number(product.price);

        totalAmount += unitPrice * item.quantity;

        orderItems.push({
          product: product.product_id,
          quantity: item.quantity,
          unitPrice,
        });

        await connection.execute(
          `UPDATE products
           SET quantity = quantity - ?
           WHERE product_id = ?`,
          [item.quantity, item.product],
        );
      }

      totalAmount = Number(totalAmount.toFixed(2));

      const [orderResult] = await connection.execute(
        `INSERT INTO orders (buyer_id, total_amount, status)
         VALUES (?, ?, 'Pending')`,
        [buyer, totalAmount],
      );

      const orderId = orderResult.insertId;

      for (const item of orderItems) {
        await connection.execute(
          `INSERT INTO order_items
           (order_id, product_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`,
          [orderId, item.product, item.quantity, item.unitPrice],
        );
      }

      await connection.commit();

      return this.findById(orderId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // UPDATE ORDER STATUS
  async updateStatus(orderId, status) {
    await pool.execute("UPDATE orders SET status = ? WHERE order_id = ?", [
      status,
      orderId,
    ]);

    return this.findById(orderId);
  },

  // CANCEL ORDER AND RESTOCK PRODUCTS IN ONE TRANSACTION
  async cancel(orderId) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [orderRows] = await connection.execute(
        `SELECT order_id, status
         FROM orders
         WHERE order_id = ?
         FOR UPDATE`,
        [orderId],
      );

      const order = orderRows[0];

      if (!order) {
        const error = new Error("Order not found");
        error.code = "ORDER_NOT_FOUND";
        throw error;
      }

      if (order.status === "Cancelled") {
        const error = new Error("Order is already cancelled");
        error.code = "ORDER_ALREADY_CANCELLED";
        throw error;
      }

      if (["Shipped", "Delivered"].includes(order.status)) {
        const error = new Error(
          "Cannot cancel an order that has been shipped or delivered",
        );
        error.code = "ORDER_CANNOT_BE_CANCELLED";
        throw error;
      }

      const [items] = await connection.execute(
        `SELECT product_id, quantity
         FROM order_items
         WHERE order_id = ?`,
        [orderId],
      );

      for (const item of items) {
        const [productRows] = await connection.execute(
          `SELECT product_id
           FROM products
           WHERE product_id = ?
           FOR UPDATE`,
          [item.product_id],
        );

        if (productRows.length === 0) {
          const error = new Error(
            `Failed to restock product with ID ${item.product_id}`,
          );
          error.code = "RESTOCK_FAILED";
          throw error;
        }

        await connection.execute(
          `UPDATE products
           SET quantity = quantity + ?
           WHERE product_id = ?`,
          [item.quantity, item.product_id],
        );
      }

      await connection.execute(
        `UPDATE orders
         SET status = 'Cancelled'
         WHERE order_id = ?`,
        [orderId],
      );

      await connection.commit();

      return this.findById(orderId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = Order;
