ALTER TABLE articles
  ADD COLUMN country VARCHAR(255) NULL AFTER publisher_credit;

-- 기존 기사의 국가 정보를 raw_payload.country(JSON 배열)에서 보정한다.
-- 예: ["turkey"] -> turkey, ["south korea","united states"] -> south korea,united states
UPDATE articles
SET country = REPLACE(
  REPLACE(
    REPLACE(JSON_EXTRACT(raw_payload, '$.country'), '[', ''),
    ']', ''
  ),
  '"', ''
)
WHERE country IS NULL
  AND JSON_EXTRACT(raw_payload, '$.country') IS NOT NULL
  AND JSON_TYPE(JSON_EXTRACT(raw_payload, '$.country')) = 'ARRAY';
