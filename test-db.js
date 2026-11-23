require("dotenv").config();

const pool = require("./config/db");

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();

    console.log("MySQL connected successfully!");

    const [rows] = await connection.query(
      "SELECT DATABASE() AS databaseName"
    );

    console.log("Connected database:", rows[0].databaseName);

    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:", error.message);
  } finally {
    await pool.end();
  }
};

testConnection();