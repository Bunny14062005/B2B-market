const pool = require("../config/db");

const Product = {
  async findById(productId) {
    const [rows] = await pool.execute(
      `SELECT
         p.*,
         c.name AS category,
         v.company_name AS vendor_name
       FROM products p
       INNER JOIN categories c ON p.category_id = c.category_id
       INNER JOIN vendors v ON p.vendor_id = v.vendor_id
       WHERE p.product_id = ?
       LIMIT 1`,
      [productId],
    );

    return rows[0] || null;
  },

  async findAll() {
    const [rows] = await pool.execute(
      `SELECT
         p.*,
         c.name AS category,
         v.company_name AS vendor_name
       FROM products p
       INNER JOIN categories c ON p.category_id = c.category_id
       INNER JOIN vendors v ON p.vendor_id = v.vendor_id
       ORDER BY p.created_at DESC`,
    );

    return rows;
  },

  async create(productData) {
    const { name, price, quantity, category_id, vendor_id } = productData;

    const [result] = await pool.execute(
      `INSERT INTO products
       (name, price, quantity, category_id, vendor_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), price, quantity, category_id, vendor_id],
    );

    return this.findById(result.insertId);
  },

  async update(productId, productData) {
    const { name, price, quantity, category_id, vendor_id } = productData;

    await pool.execute(
      `UPDATE products
       SET name = ?,
           price = ?,
           quantity = ?,
           category_id = ?,
           vendor_id = ?
       WHERE product_id = ?`,
      [name.trim(), price, quantity, category_id, vendor_id, productId],
    );

    return this.findById(productId);
  },

  async delete(productId) {
    const [result] = await pool.execute(
      "DELETE FROM products WHERE product_id = ?",
      [productId],
    );

    return result.affectedRows > 0;
  },
};

module.exports = Product;
