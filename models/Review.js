const pool = require("../config/db");

const formatReview = (review) => {
  if (!review) return null;

  return {
    _id: review.review_id,
    product: {
      _id: review.product_id,
      name: review.product_name,
      price: Number(review.product_price),
      category: review.product_category,
    },
    user: {
      _id: review.user_id,
      name: review.user_name,
      role: review.user_role,
    },
    role: review.role,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    updatedAt: review.updated_at,
  };
};

const reviewSelect = `
  SELECT
    r.review_id,
    r.product_id,
    r.user_id,
    r.role,
    r.rating,
    r.comment,
    r.created_at,
    r.updated_at,
    p.name AS product_name,
    p.price AS product_price,
    c.name AS product_category,
    u.name AS user_name,
    u.role AS user_role
  FROM reviews r
  INNER JOIN products p ON r.product_id = p.product_id
  INNER JOIN categories c ON p.category_id = c.category_id
  INNER JOIN users u ON r.user_id = u.user_id
`;

const Review = {
  async findById(reviewId) {
    const [rows] = await pool.execute(
      `${reviewSelect}
       WHERE r.review_id = ?
       LIMIT 1`,
      [reviewId],
    );

    return formatReview(rows[0]);
  },

  async findAll() {
    const [rows] = await pool.execute(
      `${reviewSelect}
       ORDER BY r.created_at DESC, r.review_id DESC`,
    );

    return rows.map(formatReview);
  },

  async findByProduct(productId) {
    const [rows] = await pool.execute(
      `${reviewSelect}
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC, r.review_id DESC`,
      [productId],
    );

    return rows.map(formatReview);
  },

  async updateProductRating(connection, productId) {
    const [rows] = await connection.execute(
      `SELECT
         COUNT(*) AS numReviews,
         COALESCE(ROUND(AVG(rating), 1), 0) AS averageRating
       FROM reviews
       WHERE product_id = ?`,
      [productId],
    );

    await connection.execute(
      `UPDATE products
       SET average_rating = ?,
           num_reviews = ?
       WHERE product_id = ?`,
      [Number(rows[0].averageRating), Number(rows[0].numReviews), productId],
    );
  },

  async create(reviewData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Lock the product while its reviews and rating are updated.
      const [products] = await connection.execute(
        `SELECT product_id
         FROM products
         WHERE product_id = ?
         FOR UPDATE`,
        [reviewData.product],
      );

      if (products.length === 0) {
        const error = new Error("Product not found");
        error.code = "PRODUCT_NOT_FOUND";
        throw error;
      }

      const [result] = await connection.execute(
        `INSERT INTO reviews
         (product_id, user_id, role, rating, comment)
         VALUES (?, ?, ?, ?, ?)`,
        [
          reviewData.product,
          reviewData.user,
          reviewData.role,
          reviewData.rating,
          reviewData.comment,
        ],
      );

      await this.updateProductRating(connection, reviewData.product);

      await connection.commit();

      return this.findById(result.insertId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async update(reviewId, reviewData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [reviewRows] = await connection.execute(
        `SELECT review_id, product_id
         FROM reviews
         WHERE review_id = ?
         LIMIT 1
         FOR UPDATE`,
        [reviewId],
      );

      if (reviewRows.length === 0) {
        const error = new Error("Review not found");
        error.code = "REVIEW_NOT_FOUND";
        throw error;
      }

      const productId = reviewRows[0].product_id;

      await connection.execute(
        `SELECT product_id
         FROM products
         WHERE product_id = ?
         FOR UPDATE`,
        [productId],
      );

      const fields = [];
      const values = [];

      if (reviewData.rating !== undefined) {
        fields.push("rating = ?");
        values.push(reviewData.rating);
      }

      if (reviewData.comment !== undefined) {
        fields.push("comment = ?");
        values.push(reviewData.comment);
      }

      if (fields.length > 0) {
        await connection.execute(
          `UPDATE reviews
           SET ${fields.join(", ")}
           WHERE review_id = ?`,
          [...values, reviewId],
        );
      }

      await this.updateProductRating(connection, productId);

      await connection.commit();

      return this.findById(reviewId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async delete(reviewId) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [reviewRows] = await connection.execute(
        `SELECT review_id, product_id
         FROM reviews
         WHERE review_id = ?
         LIMIT 1
         FOR UPDATE`,
        [reviewId],
      );

      if (reviewRows.length === 0) {
        const error = new Error("Review not found");
        error.code = "REVIEW_NOT_FOUND";
        throw error;
      }

      const productId = reviewRows[0].product_id;

      await connection.execute(
        `SELECT product_id
         FROM products
         WHERE product_id = ?
         FOR UPDATE`,
        [productId],
      );

      await connection.execute("DELETE FROM reviews WHERE review_id = ?", [
        reviewId,
      ]);

      await this.updateProductRating(connection, productId);

      await connection.commit();

      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = Review;
