const pool = require("../config/db");

const formatCompany = (company) => {
  if (!company) return null;

  return {
    _id: company.company_id,
    companyName: company.company_name,
    email: company.email,
    phone: company.phone,
    address: company.address,
    businessDescription: company.business_description,
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
};

const Company = {
  async findAll() {
    const [rows] = await pool.execute(
      "SELECT * FROM companies ORDER BY company_id DESC",
    );

    return rows.map(formatCompany);
  },

  async findById(companyId) {
    const [rows] = await pool.execute(
      "SELECT * FROM companies WHERE company_id = ? LIMIT 1",
      [companyId],
    );

    return formatCompany(rows[0]);
  },

  async create(companyData) {
    const {
      companyName,
      email,
      phone,
      address,
      businessDescription = "",
    } = companyData;

    const [result] = await pool.execute(
      `INSERT INTO companies
       (company_name, email, phone, address, business_description)
       VALUES (?, ?, ?, ?, ?)`,
      [
        companyName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        address.trim(),
        businessDescription.trim(),
      ],
    );

    return this.findById(result.insertId);
  },

  async update(companyId, companyData) {
    const {
      companyName,
      email,
      phone,
      address,
      businessDescription = "",
    } = companyData;

    await pool.execute(
      `UPDATE companies
       SET company_name = ?,
           email = ?,
           phone = ?,
           address = ?,
           business_description = ?
       WHERE company_id = ?`,
      [
        companyName.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        address.trim(),
        businessDescription.trim(),
        companyId,
      ],
    );

    return this.findById(companyId);
  },

  async delete(companyId) {
    const [result] = await pool.execute(
      "DELETE FROM companies WHERE company_id = ?",
      [companyId],
    );

    return result.affectedRows > 0;
  },
};

module.exports = Company;
