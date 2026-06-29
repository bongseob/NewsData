ALTER TABLE articles
  ADD COLUMN review_state VARCHAR(16) NOT NULL DEFAULT 'PENDING' AFTER status,
  ADD KEY idx_articles_review_state (status, review_state, updated_at);

-- 기존 DRAFT 기사는 미검토(PENDING)로 둔다. default 값으로 처리되지만 명시적으로 보정한다.
UPDATE articles
SET review_state = 'PENDING'
WHERE review_state IS NULL OR review_state = '';
