const pool = require("../config/db");

const Cart = {
  async findByBuyerId(buyerId) {
    const [cartRows] = await pool.execute(
      `SELECT *
       FROM carts
       WHERE buyer_id = ?
       LIMIT 1`,
      [buyerId],
    );

    if (cartRows.length === 0) {
      return null;
    }

    const cart = cartRows[0];

    const [items] = await pool.execute(
      `SELECT
         ci.cart_item_id,
         ci.cart_id,
         ci.product_id,
         ci.quantity,
         ci.created_at,
         ci.updated_at,
         p.name AS product_name,
         p.price AS product_price,
         p.quantity AS product_stock,
         p.category_id,
         c.name AS category,
         p.vendor_id,
         p.average_rating,
         p.num_reviews
       FROM cart_items ci
       INNER JOIN products p
         ON ci.product_id = p.product_id
       INNER JOIN categories c
         ON p.category_id = c.category_id
       WHERE ci.cart_id = ?
       ORDER BY ci.cart_item_id ASC`,
      [cart.cart_id],
    );

    return {
      _id: cart.cart_id,
      buyer: cart.buyer_id,
      items: items.map((item) => ({
        _id: item.cart_item_id,
        product: {
          _id: item.product_id,
          name: item.product_name,
          price: Number(item.product_price),
          quantity: item.product_stock,
          category: item.category,
          vendor: item.vendor_id,
          averageRating: Number(item.average_rating),
          numReviews: item.num_reviews,
        },
        quantity: item.quantity,
      })),
      createdAt: cart.created_at,
      updatedAt: cart.updated_at,
    };
  },

  async create(buyerId) {
    const [result] = await pool.execute(
      "INSERT INTO carts (buyer_id) VALUES (?)",
      [buyerId],
    );

    return result.insertId;
  },

  async addItem(cartId, productId, quantity) {
    await pool.execute(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
       quantity = quantity + VALUES(quantity)`,
      [cartId, productId, quantity],
    );
  },

  async updateItem(cartId, productId, quantity) {
    const [result] = await pool.execute(
      `UPDATE cart_items
       SET quantity = ?
       WHERE cart_id = ? AND product_id = ?`,
      [quantity, cartId, productId],
    );

    return result.affectedRows > 0;
  },

  async removeItem(cartId, productId) {
    const [result] = await pool.execute(
      `DELETE FROM cart_items
       WHERE cart_id = ? AND product_id = ?`,
      [cartId, productId],
    );

    return result.affectedRows > 0;
  },

  async clearItems(cartId) {
    await pool.execute("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
  },
};

module.exports = Cart;
