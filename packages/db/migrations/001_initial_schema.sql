CREATE TABLE source_configs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  auto_fetch_enabled TINYINT(1) NOT NULL DEFAULT 0,
  auto_publish_enabled TINYINT(1) NOT NULL DEFAULT 0,
  fetch_interval_minutes INT UNSIGNED NULL,
  query JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_source_configs_source_name (source, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source VARCHAR(32) NOT NULL,
  external_id VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL,
  title VARCHAR(500) NOT NULL,
  subtitle VARCHAR(500) NULL,
  body MEDIUMTEXT NULL,
  original_title VARCHAR(500) NULL,
  original_subtitle VARCHAR(500) NULL,
  original_body MEDIUMTEXT NULL,
  translated_title VARCHAR(500) NULL,
  translated_subtitle VARCHAR(500) NULL,
  translated_body MEDIUMTEXT NULL,
  title_translated_at DATETIME(3) NULL,
  body_translated_at DATETIME(3) NULL,
  keywords JSON NULL,
  publisher_credit VARCHAR(255) NULL,
  source_url VARCHAR(1000) NULL,
  public_url VARCHAR(1000) NULL,
  press_time DATETIME(3) NULL,
  raw_payload JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_articles_source_external_id (source, external_id),
  KEY idx_articles_status_updated_at (status, updated_at),
  KEY idx_articles_press_time (press_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE article_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id BIGINT UNSIGNED NOT NULL,
  asset_type VARCHAR(32) NOT NULL,
  source_url VARCHAR(1000) NULL,
  local_path VARCHAR(1000) NOT NULL,
  content_type VARCHAR(120) NULL,
  byte_size BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_article_assets_article_id (article_id),
  CONSTRAINT fk_article_assets_article
    FOREIGN KEY (article_id) REFERENCES articles(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fetch_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source VARCHAR(32) NOT NULL,
  trigger_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  request_payload JSON NULL,
  error_message TEXT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_fetch_jobs_source_status (source, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE publish_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  requested_by VARCHAR(120) NULL,
  error_message TEXT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_publish_jobs_article_id (article_id),
  KEY idx_publish_jobs_status_updated_at (status, updated_at),
  CONSTRAINT fk_publish_jobs_article
    FOREIGN KEY (article_id) REFERENCES articles(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE publish_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  publish_job_id BIGINT UNSIGNED NOT NULL,
  article_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  failed_step VARCHAR(32) NULL,
  idxno VARCHAR(64) NULL,
  public_url VARCHAR(1000) NULL,
  current_url VARCHAR(1000) NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_publish_logs_article_id (article_id),
  CONSTRAINT fk_publish_logs_publish_job
    FOREIGN KEY (publish_job_id) REFERENCES publish_jobs(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_publish_logs_article
    FOREIGN KEY (article_id) REFERENCES articles(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE callback_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id BIGINT UNSIGNED NOT NULL,
  callback_url VARCHAR(1000) NOT NULL,
  request_payload JSON NOT NULL,
  response_status INT NULL,
  response_body MEDIUMTEXT NULL,
  status VARCHAR(32) NOT NULL,
  error_message TEXT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_callback_logs_article_id (article_id),
  CONSTRAINT fk_callback_logs_article
    FOREIGN KEY (article_id) REFERENCES articles(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE failure_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id BIGINT UNSIGNED NULL,
  publish_job_id BIGINT UNSIGNED NULL,
  failed_step VARCHAR(32) NOT NULL,
  screenshot_path VARCHAR(1000) NULL,
  html_snapshot_path VARCHAR(1000) NULL,
  current_url VARCHAR(1000) NULL,
  error_message TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_failure_artifacts_article_id (article_id),
  KEY idx_failure_artifacts_publish_job_id (publish_job_id),
  CONSTRAINT fk_failure_artifacts_article
    FOREIGN KEY (article_id) REFERENCES articles(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_failure_artifacts_publish_job
    FOREIGN KEY (publish_job_id) REFERENCES publish_jobs(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
