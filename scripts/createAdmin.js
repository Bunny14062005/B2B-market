require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const pool = require("../config/db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const createAdmin = async () => {
  try {
    const name = (await rl.question("Enter admin name: ")).trim();
    const email = (await rl.question("Enter admin email: "))
      .trim()
      .toLowerCase();
    const phone = (await rl.question("Enter admin phone: ")).trim();
    const password = await rl.question("Enter admin password: ");

    if (!name || !email || !phone || !password) {
      throw new Error("All fields are required");
    }

    if (password.length < 8) {
      throw new Error("Password must contain at least 8 characters");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }

    const [existingUsers] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    if (existingUsers.length > 0) {
      throw new Error("An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, phone, role)
       VALUES (?, ?, ?, ?, 'admin')`,
      [name, email, hashedPassword, phone],
    );

    console.log("Admin account created successfully");
    console.log({
      id: result.insertId,
      name,
      email,
      role: "admin",
    });
  } catch (error) {
    console.error("Admin creation failed:", error.message);
  } finally {
    rl.close();
    await pool.end();
  }
};

createAdmin();
