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

This repository currently contains the initial monorepo skeleton, shared constants, SQL migration draft, DB repository foundation, backend/worker/frontend app stubs, and local MySQL/Redis Compose setup.

Newswire response mapping and d-maker.kr Playwright selectors are intentionally not finalized until real samples and DOM evidence are captured.
