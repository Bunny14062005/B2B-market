-- Preserve business history by archiving instead of deleting records.
ALTER TABLE buyers
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER business_type;

ALTER TABLE vendors
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER business_type;

ALTER TABLE products
  ADD COLUMN is_available TINYINT(1) NOT NULL DEFAULT 1 AFTER num_reviews;
