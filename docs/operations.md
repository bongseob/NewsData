# Operations

## Environment

Use `.env.example` as the key list. Keep actual secrets in `.env` or deployment secret storage.

Required secret classes:

- NewsData.io API key
- Newswire API key
- d-maker.kr admin ID/password
- MySQL credentials
- image generation API key for generated replacement thumbnails

Generated replacement thumbnails use:

```env
OPENAI_API_KEY=<secret>
OPENAI_IMAGE_GENERATION_URL=https://api.openai.com/v1/images/generations
IMAGE_GENERATION_MODEL=gpt-image-1
IMAGE_GENERATION_SIZE=1536x1024
```

## Local Services

Start infrastructure:

```powershell
docker compose up -d mysql redis
```

Stop infrastructure:

```powershell
docker compose down
```

SQL migrations live in `packages/db/migrations`. Current migrations are:

- `001_initial_schema.sql`
- `002_article_original_translation_columns.sql`
- `003_article_review_state.sql`
- `004_article_country.sql`

## Local MySQL

The local development database is:

```text
database: newsdata
application user: news
```

The application must use the `news` user from `.env`. Do not configure application code to use the MySQL `root` account.

Local credentials belong in `.env` only:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=news
MYSQL_PASSWORD=<local password>
MYSQL_DATABASE=newsdata
```

For the current local Docker setup, the MySQL container name is `mysql`. Verify application DB access with:

```powershell
docker exec mysql mysql -unews -p<local password> -D newsdata -e "SELECT DATABASE() AS database_name, CURRENT_USER() AS account_name;"
```

Apply migrations manually when needed. For a fresh local database, apply them in numeric order:

```powershell
docker cp packages/db/migrations/001_initial_schema.sql mysql:/tmp/001_initial_schema.sql
docker exec mysql mysql -unews -p<local password> newsdata -e "source /tmp/001_initial_schema.sql"
docker cp packages/db/migrations/002_article_original_translation_columns.sql mysql:/tmp/002_article_original_translation_columns.sql
docker exec mysql mysql -unews -p<local password> newsdata -e "source /tmp/002_article_original_translation_columns.sql"
docker cp packages/db/migrations/003_article_review_state.sql mysql:/tmp/003_article_review_state.sql
docker exec mysql mysql -unews -p<local password> newsdata -e "source /tmp/003_article_review_state.sql"
docker cp packages/db/migrations/004_article_country.sql mysql:/tmp/004_article_country.sql
docker exec mysql mysql -unews -p<local password> newsdata -e "source /tmp/004_article_country.sql"
```

## Validation

Run the repository-level checks before marking implementation items complete:

```powershell
npm run typecheck
npm run build
```

The latest status review on 2026-07-01 passed both commands on `main` at commit `03a503d`.

Runtime verification still needs a full local services pass with MySQL, Redis, backend, frontend, and worker running together.

## Smoke Tests

With MySQL, Redis, backend, frontend, and worker running:

1. Create a NewsData.io manual fetch job from `/manual-fetch`.
2. Confirm the fetch job moves out of `PENDING`.
3. Open `/articles`, select one or more `SELECTED` articles, and request `본문 일괄 번역`.
4. Open an article detail page and request `본문 번역 요청`.
5. Confirm translate jobs are accepted by the worker and `articles.translated_body` / `body_translated_at` are updated after completion.
6. On an article detail page, request `저작권 대체 이미지 생성`.
7. Confirm the image job is accepted by the worker and a new `THUMBNAIL` row is inserted into `article_assets`.
8. Mark selected articles as `READY_TO_PUBLISH`; publish dry-run verification is still pending WP-4.

## Encoding

All repository text files should be UTF-8. If Korean text appears broken in PowerShell, set the console to UTF-8 before inspecting files:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

Treat broken terminal output as a display problem until encoding is verified. Do not mass-rewrite Korean documents just because a terminal preview is broken.

## Failure Artifacts

Playwright publish failures should save:

- screenshot
- HTML snapshot
- current URL
- article id
- error message
- failed step: `LOGIN`, `OPEN_FORM`, `FILL_FORM`, `UPLOAD_IMAGE`, `SUBMIT`, `VERIFY`

Artifacts should be stored under `PLAYWRIGHT_ARTIFACT_DIR` and referenced from `failure_artifacts`.
