-- 기사에 소스 라이선스 정책과 교차 소스 dedup용 정규화 URL을 추가한다.
-- license_policy: PUBLIC_DOMAIN(전문 발행) / LICENSED(요약+링크). 발행 정책 분기에 사용.
-- canonical_url: 여러 매체의 동일 기사 판별용(교차 소스 dedup 기반).
ALTER TABLE articles
  ADD COLUMN license_policy VARCHAR(16) DEFAULT NULL COMMENT '소스 라이선스 정책(PUBLIC_DOMAIN/LICENSED)',
  ADD COLUMN canonical_url VARCHAR(1000) DEFAULT NULL COMMENT '정규화 원문 URL(교차 소스 dedup)',
  ADD INDEX idx_articles_canonical_url (canonical_url(255));
