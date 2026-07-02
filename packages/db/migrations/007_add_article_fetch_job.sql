-- articles에 최초 수집 작업 연결 컬럼 추가.
-- 기사가 어느 수집 요청(fetch_jobs)에서 처음 수집됐는지 추적한다.
-- upsert 중복 시에는 최초 값을 보존한다(COALESCE, 애플리케이션 레벨).
ALTER TABLE articles
  ADD COLUMN fetch_job_id BIGINT UNSIGNED DEFAULT NULL COMMENT '이 기사를 최초로 수집한 fetch_jobs.id',
  ADD INDEX idx_articles_fetch_job_id (fetch_job_id);
