-- articles 테이블에 AI 요약 및 SEO 키워드 저장 컬럼 추가
ALTER TABLE articles
  ADD COLUMN translated_summary TEXT DEFAULT NULL COMMENT 'AI 3문장 요약본',
  ADD COLUMN seo_keywords JSON DEFAULT NULL COMMENT 'AI 추출 SEO 키워드 목록';
