# B2B Wholesale System API

An Express and MySQL backend for a B2B wholesale marketplace. It supports buyer, vendor, and admin accounts; catalog and category management; carts; transactional ordering; and verified-purchase reviews.

## Setup

1. Create a MySQL database and configure `.env` from the following fields:

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=b2b_wholesale_mysql
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   JWT_SECRET=a_long_random_secret
   ```

2. For a new empty database, run [`database/schema.sql`](database/schema.sql), then apply lifecycle migrations:

   ```bash
   npm run migrate
   ```

3. Start the API:

   ```bash
   npm run dev
   ```

4. Run automated tests:

   ```bash
   npm test
   ```

## Roles and access

| Role | Access |
| --- | --- |
| Admin | Manages users, buyer/vendor businesses, categories, company details, and order status. |
| Vendor | Manages only products belonging to its linked vendor business. |
| Buyer | Manages its own cart, creates/views/cancels its own orders, and reviews delivered purchases. |

## Lifecycle rules

- `DELETE /api/users/profile` deactivates the user rather than deleting history.
- `DELETE /api/buyers/:id` and `DELETE /api/vendors/:id` deactivate the business and linked user; vendor deactivation also archives its products.
- `DELETE /api/products/:id` archives a product. Use `PATCH /api/products/:id/availability` with `{ "isAvailable": true }` to restore it.
- Archived products are excluded from the public catalog, carts, and new orders.
- Order flow is `Pending → Shipped → Delivered`. Use the cancel endpoint to cancel an eligible order because it safely restores stock.

## Key endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/users/register` | Register a buyer or vendor user and business. |
| POST | `/api/users/login` | Get a JWT. |
| GET | `/api/products` | Browse available products. |
| POST | `/api/products` | Create a product as its vendor or an admin. |
| PATCH | `/api/products/:id/availability` | Archive or restore a product. |
| POST | `/api/cart/items` | Add a product to the authenticated buyer's cart. |
| POST | `/api/orders` | Create an order as the authenticated buyer. |
| PUT | `/api/orders/:id/cancel` | Cancel an eligible own order or an admin-selected order. |
| POST | `/api/reviews` | Review a product from a delivered order. |

All protected requests require `Authorization: Bearer <token>`.
