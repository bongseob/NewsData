# Operations

## Environment

Use `.env.example` as the key list. Keep actual secrets in `.env` or deployment secret storage.

Required secret classes:

- NewsData.io API key
- Newswire API key
- d-maker.kr admin ID/password
- MySQL credentials

## Local Services

Start infrastructure:

```powershell
docker compose up -d mysql redis
```

Stop infrastructure:

```powershell
docker compose down
```

The initial SQL migration is mounted into the MySQL container at startup from `packages/db/migrations`.

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

Apply the initial schema manually when needed:

```powershell
docker cp packages/db/migrations/001_initial_schema.sql mysql:/tmp/001_initial_schema.sql
docker exec mysql mysql -unews -p<local password> newsdata -e "source /tmp/001_initial_schema.sql"
```

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
