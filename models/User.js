const pool = require("../config/db");

const User = {
  async findByEmail(email) {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    return rows[0] || null;
  },

  async findById(userId) {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE user_id = ? LIMIT 1",
      [userId],
    );

    return rows[0] || null;
  },

  async create(userData) {
    const {
      name,
      email,
      password,
      phone,
      role,
      buyer_id = null,
      vendor_id = null,
    } = userData;

    const [result] = await pool.execute(
      `INSERT INTO users
       (name, email, password, phone, role, buyer_id, vendor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email.toLowerCase().trim(),
        password,
        phone,
        role,
        buyer_id,
        vendor_id,
      ],
    );

    return this.findById(result.insertId);
  },

  async update(userId, userData) {
    const allowedFields = [
      "name",
      "email",
      "password",
      "phone",
      "is_active",
      "reset_password_token",
      "reset_password_expires",
    ];

    const fields = Object.keys(userData).filter((field) =>
      allowedFields.includes(field),
    );

    if (fields.length === 0) {
      return this.findById(userId);
    }

    const values = fields.map((field) => userData[field]);

    const setClause = fields.map((field) => `${field} = ?`).join(", ");

    await pool.execute(`UPDATE users SET ${setClause} WHERE user_id = ?`, [
      ...values,
      userId,
    ]);

    return this.findById(userId);
  },

  async delete(userId) {
    const [result] = await pool.execute("DELETE FROM users WHERE user_id = ?", [
      userId,
    ]);

    return result.affectedRows > 0;
  },
};

module.exports = User;
