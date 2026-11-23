const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === "ER_DUP_ENTRY") {
    const message = error.message || "";

    let field = "Value";

    if (message.includes("email")) {
      field = "Email";
    } else if (message.includes("name")) {
      field = "Name";
    }

    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Referenced record does not exist",
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Cannot delete this record because it is being used",
    });
  }

  if (
    error.code === "ER_DATA_TOO_LONG" ||
    error.code === "ER_TRUNCATED_WRONG_VALUE" ||
    error.code === "ER_WARN_DATA_OUT_OF_RANGE"
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid data format or value",
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

module.exports = errorHandler;
