# Architecture

## Boundaries

The backend API accepts requests, creates jobs, and exposes status. It does not run external API calls, image downloads, or Playwright publishing inside request handling.

Long-running work is handled by workers:

- fetch queue: NewsData.io and Newswire API collection
- process queue: source-specific normalization, duplicate handling, embargo handling, asset preparation
- translate queue: worker-backed DeepL translation for explicit body translation requests
- image queue: worker-backed generation of copyright-safe replacement thumbnails
- publish queue: Playwright publishing through d-maker.kr admin pages
- callback queue: Newswire callback after verified public publication

## Current Implementation Snapshot

Implemented runtime paths:

- NewsData.io manual fetch job creation and cancellation.
- Fetch queue worker for NewsData.io API collection.
- Process queue worker for NewsData.io article normalization, duplicate upsert, title-only translation, article crawl fallback, thumbnail preparation, and country normalization.
- Source config CRUD through repository/API/admin UI.
- Article review board with `PENDING`, `SELECTED`, `EXCLUDED`, and `READY_TO_PUBLISH` views.
- Bulk review-state changes and `SELECTED`/`DRAFT` to `READY_TO_PUBLISH` transitions.
- Article detail editing for translated title, subtitle, and body fields.
- Translate queue worker for single and bulk body translation requests.
- Image queue worker for article-suitable generated replacement thumbnails when the source image has copyright risk.
- Content queue worker for generated subtitle candidates and generated article keywords.

Known implementation gaps against the target boundary:

- The publish queue worker exists, but the publish job repository, publish request API, durable status transitions, dry-run flow, and UI publish action are not connected yet.
- The callback worker exists as a queue placeholder only; Newswire callback persistence and retry behavior are not implemented.

## Persistence

MySQL stores normalized article state and raw API payloads. Duplicate prevention is based on `source + external_id`.

External source delete events are represented as article state transitions to `DELETED`; records are not hard-deleted by default.

## d-maker.kr Publishing

Publishing uses Playwright in the worker. The system does not insert directly into d-maker.kr DB and does not call an internal d-maker.kr article API.

The publisher must verify success by opening the public article URL and checking the published title. Button-click success alone is not sufficient.

## Open Inputs

- Newswire real response samples for `insert`, `update`, `delete`
- Stable Newswire external id decision after sample confirmation
- d-maker.kr login and article form selector map after DOM inspection
- Final auto-publish policy per source/config
- Manual fetch query and source-config query merge rules
- Runtime confirmation for clean migration apply from `001` through `004`
