require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const pool = require("./config/db");

const errorHandler = require("./middleware/errorHandler");

const cartRoutes = require("./routes/cart");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const companyRoutes = require("./routes/company");
const vendorRoutes = require("./routes/vendor");
const productRoutes = require("./routes/product");
const buyerRoutes = require("./routes/buyer");
const categoryRoutes = require("./routes/category");
const orderRoutes = require("./routes/order");
const reviewRoutes = require("./routes/review");

const app = express();

app.use(
  cors({
    origin: "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api", adminRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/products", productRoutes);
app.use("/api/buyers", buyerRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.query("SELECT DATABASE() AS databaseName");

    console.log("MySQL connected successfully!");
    console.log("Connected database:", rows[0].databaseName);

    connection.release();

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MySQL connection failed:", error.message);
    process.exit(1);
  }
};

startServer();
