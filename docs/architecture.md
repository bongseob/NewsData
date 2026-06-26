# Architecture

## Boundaries

The backend API accepts requests, creates jobs, and exposes status. It does not run external API calls, image downloads, or Playwright publishing inside request handling.

Long-running work is handled by workers:

- fetch queue: NewsData.io and Newswire API collection
- process queue: source-specific normalization, duplicate handling, embargo handling, asset preparation
- publish queue: Playwright publishing through d-maker.kr admin pages
- callback queue: Newswire callback after verified public publication

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
