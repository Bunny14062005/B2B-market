const pool = require("../config/db");

const Vendor = {
  async findById(vendorId) {
    const [rows] = await pool.execute(
      "SELECT * FROM vendors WHERE vendor_id = ?",
      [vendorId],
    );

    return rows[0] || null;
  },

  async findByEmail(email) {
    const [rows] = await pool.execute("SELECT * FROM vendors WHERE email = ?", [
      email.toLowerCase().trim(),
    ]);

    return rows[0] || null;
  },

  async findAll() {
    const [rows] = await pool.execute(
      "SELECT * FROM vendors ORDER BY created_at DESC",
    );

    return rows;
  },

  async create(vendorData) {
    const { companyName, contactName, email, phone, address, businessType } =
      vendorData;

    const [result] = await pool.execute(
      `INSERT INTO vendors
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

  async update(vendorId, vendorData) {
    const { companyName, contactName, email, phone, address, businessType } =
      vendorData;

    await pool.execute(
      `UPDATE vendors
       SET company_name = ?,
           contact_name = ?,
           email = ?,
           phone = ?,
           address = ?,
           business_type = ?
       WHERE vendor_id = ?`,
      [
        companyName,
        contactName,
        email.toLowerCase().trim(),
        phone,
        address,
        businessType,
        vendorId,
      ],
    );

    return this.findById(vendorId);
  },

  async delete(vendorId) {
    const [result] = await pool.execute(
      "DELETE FROM vendors WHERE vendor_id = ?",
      [vendorId],
    );

    return result.affectedRows > 0;
  },
};

module.exports = Vendor;
