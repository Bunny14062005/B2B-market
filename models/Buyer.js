const pool = require("../config/db");

const optionalText = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const Buyer = {
  async findById(buyerId, executor = pool) {
    const [rows] = await executor.execute(
      "SELECT * FROM buyers WHERE buyer_id = ?",
      [buyerId],
    );

    return rows[0] || null;
  },

  async findByEmail(email, executor = pool) {
    const [rows] = await executor.execute(
      "SELECT * FROM buyers WHERE email = ?",
      [email.toLowerCase().trim()],
    );

    return rows[0] || null;
  },

  async findAll() {
    const [rows] = await pool.execute(
      "SELECT * FROM buyers ORDER BY created_at DESC",
    );

    return rows;
  },

  async setActive(buyerId, isActive) {
    await pool.execute("UPDATE buyers SET is_active = ? WHERE buyer_id = ?", [
      isActive,
      buyerId,
    ]);

    return this.findById(buyerId);
  },

  async create(buyerData, executor = pool) {
    const { companyName, contactName, email, phone, address, businessType } =
      buyerData;

    const [result] = await executor.execute(
      `INSERT INTO buyers
       (company_name, contact_name, email, phone, address, business_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        optionalText(companyName),
        contactName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        optionalText(address),
        optionalText(businessType),
      ],
    );

    return this.findById(result.insertId, executor);
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
        optionalText(companyName),
        contactName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        optionalText(address),
        optionalText(businessType),
        buyerId,
      ],
    );

    return this.findById(buyerId);
  },
};

module.exports = Buyer;
