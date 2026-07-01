# NewsData d-maker Publisher

NewsData.io and Newswire collection, processing, and d-maker.kr publishing system.

## Stack

- Backend: NestJS
- Frontend/Admin: Next.js
- DB: MySQL 8.4
- ORM: none
- SQL access: `mysql2/promise` repository layer
- Queue: Redis + BullMQ
- Publisher: Playwright worker

## Repository Layout

```text
apps/backend    NestJS API
apps/frontend   Next.js admin UI
apps/worker     BullMQ workers, fetchers, processor, publisher, callback sender
packages/db     SQL migrations, mysql pool, transaction helpers, repositories
packages/shared shared status values, queue names, source constants
docs            architecture and operation notes
```

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill API keys and d-maker.kr admin credentials in `.env`.
3. Use the local app DB account in `.env`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=news
MYSQL_PASSWORD=<local password>
MYSQL_DATABASE=newsdata
```

4. Start MySQL and Redis:

```powershell
docker compose up -d mysql redis
```

5. Install dependencies:

```powershell
npm install
```

6. Run apps as needed:

```powershell
npm run dev:backend
npm run dev:frontend
npm run dev:worker
```

## Security

Do not commit `.env`. Shared configuration names belong in `.env.example`; real API keys, DB credentials, and d-maker.kr account values belong in `.env` or deployment secrets only.

## Current Implementation Status

Current implemented scope:

- Monorepo foundation for NestJS backend, Next.js admin UI, BullMQ workers, shared constants, and MySQL repositories.
- SQL migrations `001` through `004` for the initial schema, original/translated article fields, `review_state`, and article `country`.
- NewsData.io manual fetch API and admin UI, including category/country/language/domain filters, duplicate prevention, deterministic fetch job ids, and pending-job cancellation.
- Source configuration CRUD repository, backend API, and admin UI.
- NewsData.io fetch/process worker path with duplicate handling, title-only DeepL translation by default, original body preservation, thumbnail preparation, and country normalization.
- Article dashboard with review tabs, search, source filter, sort/order controls, tab counts, selected/untranslated counts, bulk review-state actions, and ready/unready transitions.
- Article detail workflow with original/translated fields, manual translation editing, and worker-backed manual body translation action.
- Worker-backed body translation queue for single-article and bulk selected-article requests.

Validation status:

- `npm run typecheck` passes across all workspaces.
- `npm run build` passes across all workspaces.

Known next work:

- Add the curation-to-publish bridge: publish job repository, publish request API, queue enqueue, status transitions, dry-run worker path, and admin UI action.
- Refresh runtime verification with local MySQL/Redis/backend/frontend/worker running together.

Newswire response mapping and d-maker.kr Playwright selectors are intentionally not finalized until real samples and DOM evidence are captured.
