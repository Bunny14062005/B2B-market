const pool = require("../config/db");

const Buyer = {
  async findById(buyerId) {
    const [rows] = await pool.execute(
      "SELECT * FROM buyers WHERE buyer_id = ?",
      [buyerId],
    );

    return rows[0] || null;
  },

  async findByEmail(email) {
    const [rows] = await pool.execute("SELECT * FROM buyers WHERE email = ?", [
      email.toLowerCase().trim(),
    ]);

    return rows[0] || null;
  },

  async findAll() {
    const [rows] = await pool.execute(
      "SELECT * FROM buyers ORDER BY created_at DESC",
    );

    return rows;
  },

  async create(buyerData) {
    const { companyName, contactName, email, phone, address, businessType } =
      buyerData;

    const [result] = await pool.execute(
      `INSERT INTO buyers
       (company_name, contact_name, email, phone, address, business_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        companyName.trim(),
        contactName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        address.trim(),
        businessType.trim(),
      ],
    );

    return this.findById(result.insertId);
  },

  async update(buyerId, buyerData) {
    const { companyName, contactName, email, phone, address, businessType } =
      buyerData;

    await pool.execute(
      `UPDATE buyers
       SET company_name = ?,
           contact_name = ?,
           email = ?,
           phone = ?,
           address = ?,
           business_type = ?
       WHERE buyer_id = ?`,
      [
        companyName,
        contactName,
        email.toLowerCase().trim(),
        phone,
        address,
        businessType,
        buyerId,
      ],
    );

    return this.findById(buyerId);
  },

  async delete(buyerId) {
    const [result] = await pool.execute(
      "DELETE FROM buyers WHERE buyer_id = ?",
      [buyerId],
    );

    return result.affectedRows > 0;
  },
};

module.exports = Buyer;
