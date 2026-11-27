const pool = require("../config/db");

const Category = {
  async findById(categoryId) {
    const [rows] = await pool.execute(
      `SELECT c.*, v.company_name AS vendor_name
       FROM categories c
       INNER JOIN vendors v ON c.vendor_id = v.vendor_id
       WHERE c.category_id = ?
       LIMIT 1`,
      [categoryId],
    );

    return rows[0] || null;
  },

  async findByName(name, vendorId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM categories
       WHERE LOWER(name) = LOWER(?)
       AND vendor_id = ?
       LIMIT 1`,
      [name.trim(), vendorId],
    );

    return rows[0] || null;
  },

  async findAll(vendorId = null) {
    let query = `
      SELECT c.*, v.company_name AS vendor_name
      FROM categories c
      INNER JOIN vendors v ON c.vendor_id = v.vendor_id
    `;

    const values = [];

    if (vendorId !== null) {
      query += " WHERE c.vendor_id = ?";
      values.push(vendorId);
    }

    query += " ORDER BY c.created_at DESC";

    const [rows] = await pool.execute(query, values);

    return rows;
  },

  async create(categoryData) {
    const { name, description = "", vendor_id } = categoryData;

    const [result] = await pool.execute(
      `INSERT INTO categories (vendor_id, name, description)
       VALUES (?, ?, ?)`,
      [vendor_id, name.trim(), description.trim()],
    );

    return this.findById(result.insertId);
  },

  async update(categoryId, categoryData) {
    const { name, description = "", vendor_id } = categoryData;

    await pool.execute(
      `UPDATE categories
       SET vendor_id = ?, name = ?, description = ?
       WHERE category_id = ?`,
      [vendor_id, name.trim(), description.trim(), categoryId],
    );

    return this.findById(categoryId);
  },

  async delete(categoryId) {
    const [result] = await pool.execute(
      "DELETE FROM categories WHERE category_id = ?",
      [categoryId],
    );

    return result.affectedRows > 0;
  },
};

module.exports = Category;
