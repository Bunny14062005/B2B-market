const pool = require("../config/db");

const Category = {
  async findById(categoryId) {
    const [rows] = await pool.execute(
      "SELECT * FROM categories WHERE category_id = ? LIMIT 1",
      [categoryId],
    );

    return rows[0] || null;
  },

  async findByName(name) {
    const [rows] = await pool.execute(
      "SELECT * FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [name.trim()],
    );

    return rows[0] || null;
  },

  async findAll() {
    const [rows] = await pool.execute(
      "SELECT * FROM categories ORDER BY created_at DESC",
    );

    return rows;
  },

  async create(categoryData) {
    const { name, description = "" } = categoryData;

    const [result] = await pool.execute(
      `INSERT INTO categories (name, description)
       VALUES (?, ?)`,
      [name.trim(), description.trim()],
    );

    return this.findById(result.insertId);
  },

  async update(categoryId, categoryData) {
    const { name, description = "" } = categoryData;

    await pool.execute(
      `UPDATE categories
       SET name = ?, description = ?
       WHERE category_id = ?`,
      [name.trim(), description.trim(), categoryId],
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
