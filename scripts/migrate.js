require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");

const migrationsDirectory = path.join(__dirname, "..", "database", "migrations");

const splitStatements = (sql) =>
  sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

const migrate = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.execute(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );

    const migrationFiles = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const migrationName of migrationFiles) {
      const [applied] = await connection.execute(
        "SELECT 1 FROM schema_migrations WHERE migration_name = ? LIMIT 1",
        [migrationName],
      );

      if (applied.length > 0) {
        console.log(`Skipped ${migrationName} (already applied)`);
        continue;
      }

      const sql = await fs.readFile(
        path.join(migrationsDirectory, migrationName),
        "utf8",
      );

      await connection.beginTransaction();

      try {
        for (const statement of splitStatements(sql)) {
          await connection.query(statement);
        }

        await connection.execute(
          "INSERT INTO schema_migrations (migration_name) VALUES (?)",
          [migrationName],
        );
        await connection.commit();
        console.log(`Applied ${migrationName}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    connection.release();
    await pool.end();
  }
};

migrate().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
