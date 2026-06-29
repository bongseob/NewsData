ALTER TABLE articles
  ADD COLUMN original_title VARCHAR(500) NULL AFTER body,
  ADD COLUMN original_subtitle VARCHAR(500) NULL AFTER original_title,
  ADD COLUMN original_body MEDIUMTEXT NULL AFTER original_subtitle,
  ADD COLUMN translated_title VARCHAR(500) NULL AFTER original_body,
  ADD COLUMN translated_subtitle VARCHAR(500) NULL AFTER translated_title,
  ADD COLUMN translated_body MEDIUMTEXT NULL AFTER translated_subtitle,
  ADD COLUMN title_translated_at DATETIME(3) NULL AFTER translated_body,
  ADD COLUMN body_translated_at DATETIME(3) NULL AFTER title_translated_at;

UPDATE articles
SET
  original_title = COALESCE(original_title, title),
  original_subtitle = COALESCE(original_subtitle, subtitle),
  original_body = COALESCE(original_body, body),
  translated_title = COALESCE(translated_title, title)
WHERE original_title IS NULL
   OR original_subtitle IS NULL
   OR original_body IS NULL
   OR translated_title IS NULL;
