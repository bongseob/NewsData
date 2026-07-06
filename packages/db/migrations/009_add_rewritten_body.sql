-- LICENSED 기사 발행용: 번역 본문을 근거로 자체 문장으로 재작성한 기사 본문 저장 컬럼
ALTER TABLE articles
  ADD COLUMN rewritten_body MEDIUMTEXT DEFAULT NULL COMMENT 'AI 재작성 기사 본문(LICENSED 발행용)',
  ADD COLUMN rewritten_at DATETIME DEFAULT NULL COMMENT '재작성 본문 생성 시각';
