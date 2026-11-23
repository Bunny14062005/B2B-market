const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication token is required",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token || token.includes(" ")) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "JWT_SECRET is not configured",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  if (!Number.isSafeInteger(Number(decoded.id)) || Number(decoded.id) <= 0) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE user_id = ? LIMIT 1",
      [Number(decoded.id)],
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authenticateUser;
