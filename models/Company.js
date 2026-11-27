const pool = require("../config/db");

const formatCompany = (company) => {
  if (!company) return null;

  return {
    _id: company.company_id,
    recordType: "company",
    companyName: company.company_name,
    email: company.email,
    phone: company.phone,
    address: company.address,
    businessDescription: company.business_description,
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
};

const formatVendorCompany = (vendor) => ({
  _id: vendor.vendor_id,
  recordType: "vendor",
  companyName: vendor.company_name,
  contactName: vendor.contact_name,
  email: vendor.email,
  phone: vendor.phone,
  address: vendor.address,
  businessType: vendor.business_type,
  businessDescription: vendor.business_type,
  createdAt: vendor.created_at,
  updatedAt: vendor.updated_at || null,
});

const Company = {
  async findAll() {
    const [companyRows, vendorRows] = await Promise.all([
      pool.execute("SELECT * FROM companies ORDER BY company_id DESC"),
      pool.execute("SELECT * FROM vendors ORDER BY created_at DESC"),
    ]);

    const companies = companyRows[0].map(formatCompany);
    const vendorCompanies = vendorRows[0].map(formatVendorCompany);

    return [...vendorCompanies, ...companies].sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );
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
