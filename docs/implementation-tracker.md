# Implementation Tracker

이 문서는 `prd.md`와 `PROJECT_RULES.md` 기준으로 남은 구현 대상을 추적하기 위한 체크리스트다.

상태 표기:

- `[ ]` 미착수
- `[~]` 진행 중
- `[x]` 완료
- `[!]` 사용자 입력 또는 외부 증거 필요

## 0. 진행 기준

- [x] Backend는 NestJS를 사용한다.
- [x] Frontend/Admin은 Next.js를 사용한다.
- [x] DB는 MySQL 8.4를 사용한다.
- [x] ORM 없이 `mysql2/promise` + repository layer를 사용한다.
- [x] Queue는 Redis + BullMQ를 사용한다.
- [x] API request 내부에서 Playwright를 실행하지 않고 worker로 분리한다.
- [x] 구현 완료 항목은 typecheck/build 통과 후 이 문서에 체크한다.

### 2026-07-01 상태 점검

- [x] 현재 브랜치: `main`.
- [x] 현재 HEAD: `03a503d feat: 수동 수집 화면에 소스 선택 탭 추가`.
- [x] `origin/main`과 동기화됨: `git rev-list --left-right --count HEAD...origin/main` = `0 0`.
- [x] working tree clean.
- [x] `npm run typecheck` 통과.
- [x] `npm run build` 통과.
- [x] WP-3 완료: `POST /articles/:id/translate-body`와 `POST /articles/translate-bodies`는 translate queue에 enqueue하고, DeepL 호출은 worker에서 수행한다.
- [!] 다음 우선순위는 WP-4 큐레이션 → 발행 브리지다.

## 1. 현재 구현됨

- [x] Monorepo 기본 구조: `apps/backend`, `apps/frontend`, `apps/worker`, `packages/db`, `packages/shared`.
- [x] MySQL/Redis `docker-compose.yml` 기본 구성.
- [x] 초기 SQL schema: articles, article_assets, fetch_jobs, publish_jobs, publish_logs, callback_logs, failure_artifacts, source_configs.
- [x] shared constants: sources, statuses, queues, trigger types.
- [x] Backend health endpoint.
- [x] Backend manual fetch job 생성 API: `POST /jobs/fetch`.
- [x] Backend fetch job 목록/상세 조회 API: `GET /jobs/fetch`, `GET /jobs/fetch/:id`.
- [x] Backend articles list/detail/status-count API.
- [x] NewsData.io fetch worker 기본 구현.
- [x] NewsData.io process worker 기본 구현: article upsert, 원문 crawl fallback, DeepL 번역 fallback, thumbnail 저장.
- [x] Frontend dashboard 기본 화면.
- [x] Frontend NewsData.io 수동 수집 조건 입력 화면.
- [x] Frontend Draft 목록/상세 화면.
- [x] Frontend API base URL 환경 변수화: `NEXT_PUBLIC_API_BASE`.
- [x] Source config CRUD repository/API/UI 기본 구현.
- [x] `.gitignore` 정상화로 `.env`, build output, runtime thumbnail, temporary script 분리.
- [x] article `review_state`(PENDING/SELECTED/EXCLUDED) 큐레이션 플래그 도입 (migration 003).
- [x] article `country` 컬럼 도입 및 기존 데이터 백필 (migration 004).
- [x] 큐레이션 보드 UI: 탭(미검토/선별됨/발행 대상/제외함) + 검색/페이지네이션 + 체크박스 일괄작업.
- [x] 번역문 수동 편집 UI/API (제목/부제목/본문).

## 1A. 수동 큐레이션 워크플로 (변경된 우선순위)

> 발행 자동화보다 **뉴스 수집 → 1차 선별 → 번역 → 최종 발행 대상 선별**의 수동 큐레이션이 핵심 가치다.
> 수동 정리가 충분히 안정화된 뒤 발행 자동화(섹션 6 이후)를 진행한다.
> 선별은 `status`(생명주기)와 분리된 `review_state` 플래그로 모델링하며, 제외는 hard delete 없이 숨김 보관한다.

### 데이터/상태 모델

- [x] `review_state` 컬럼 추가: `PENDING`(미검토) / `SELECTED`(선별 채택) / `EXCLUDED`(제외·숨김) (migration 003).
- [x] 최종 발행 대상 선별 = `SELECTED` + `DRAFT` → `READY_TO_PUBLISH` 전환 (WHERE 가드).
- [x] `EXCLUDED` 기사는 기본 목록에서 숨기고 제외함 탭에서만 노출.
- [x] `country` 컬럼 추가 및 raw_payload 백필, 신규 수집 시 worker 저장 (migration 004).

### Backend

- [x] `GET /articles?reviewState=...` 필터 추가.
- [x] `POST /articles/review-state` 일괄 채택/제외/복구.
- [x] `POST /articles/mark-ready` 최종 발행 대상 확정(일괄).
- [x] `POST /articles/unmark-ready` 발행 대상 → 선별 단계 되돌리기(일괄, 가드).
- [x] `PATCH /articles/:id/translations` 번역문 수동 편집 저장.

### Admin UI

- [x] 기사 큐레이션 보드(`/articles`): 4단계 탭 + 검색 + pagination.
- [x] 체크박스 다중 선택 + 탭별 일괄 액션바.
- [x] 목록에 국가(country) 컬럼 표시.
- [x] 상세 화면 번역문 편집기(제목/부제목/본문) + 단건 선별 액션.
- [x] 상세 메타데이터에 국가 표시.
- [x] 수동 수집 시작일/종료일 기본값을 오늘로 설정.
### WP-1. 보드 필터/정렬 확장 (근시일)

목표: 현재 탭(reviewState/status) + 검색 단일 축을 source/정렬까지 확장한다.

- [x] `GET /articles`에 `sort` 파라미터 추가: `updated_at`(기본) / `created_at` / `press_time`, `order=desc|asc`.
  - 파일: [articles.repository.ts](packages/db/src/repositories/articles.repository.ts) `list()` — 고정 `ORDER BY a.updated_at DESC, a.id DESC`를 화이트리스트 기반 동적 정렬로 교체(컬럼명은 코드 상수로만, 사용자 입력 직접 주입 금지).
  - 파일: [articles.controller.ts](apps/backend/src/articles/articles.controller.ts) `list()` 쿼리 파라미터 추가, [articles.service.ts](apps/backend/src/articles/articles.service.ts) `ListArticlesRequest` 확장.
- [x] 보드에 source 드롭다운 필터 추가(NEWSDATA 외 향후 NEWSWIRE 대비).
  - 파일: [ArticleBoard.tsx](apps/frontend/src/app/articles/ArticleBoard.tsx) 검색 폼 옆에 source select, [page.tsx](apps/frontend/src/app/articles/page.tsx) `searchParams.source`를 쿼리에 반영.
- [x] 보드에 정렬 드롭다운(수정시간/수집시간/발표시간) 추가.
- [x] press_time 컬럼을 보드 목록에 노출(엠바고/최신성 판단용).

### WP-2. 탭별 건수 뱃지 / 번역 현황 집계

목표: 각 단계에 몇 건이 쌓였는지 한눈에 보이게 한다.

- [x] `GET /articles/review-counts` 추가: review_state별 건수 + `READY_TO_PUBLISH` 건수 반환.
  - 파일: [articles.repository.ts](packages/db/src/repositories/articles.repository.ts)에 `countByReviewState()` 추가(EXCLUDED 포함), controller/service 위임.
- [x] 보드 탭 라벨에 건수 뱃지 표시(미검토 N · 선별됨 N · 발행 대상 N · 제외함 N).
- [x] 선별됨 단계의 본문 번역 진행률 표시: `body_translated_at IS NULL` 미번역 건수 집계.

### WP-3. 일괄 번역 큐 연동 (PROJECT_RULES 4 준수)

목표: 단건 본문 번역(`POST /articles/:id/translate-body`)과 일괄 본문 번역을 DeepL 동기 호출이 아닌 queue/worker 방식으로 처리해 PROJECT_RULES("외부 API 호출은 worker로 분리")를 준수한다.

- [x] `packages/shared/src/queues.ts` `QUEUE_NAMES`에 `translate` 큐 추가(또는 process 큐 job type 분기).
- [x] translate job 데이터 계약 정의: `{ articleId, target: "BODY" | "TITLE" | "SUBTITLE" }`.
- [x] Backend producer: `POST /articles/translate-bodies` `{ ids: number[] }` — 선별됨 다건에 대해 article별 translate job enqueue.
  - 파일: [queue.providers.ts](apps/backend/src/queue/queue.providers.ts)에 translate 큐 producer 추가, articles.service에서 enqueue.
- [x] Worker consumer: `apps/worker/src/queue/register-translate-worker.ts` 신규 — DeepL 호출 후 [articles.repository.ts](packages/db/src/repositories/articles.repository.ts) `updateBodyTranslation` 사용.
  - 기존 [register-process-worker.ts](apps/worker/src/queue/register-process-worker.ts)의 `translateToKorean` 헬퍼를 공용 모듈로 추출해 재사용.
- [x] 단건 `translate-body`도 동일 큐 enqueue 방식으로 이전(동기 DeepL 호출 제거). 호환을 위해 enqueue 후 job id 반환.
- [x] 보드 "선별됨" 탭에 `본문 일괄 번역` 액션 추가([ArticleBoard.tsx](apps/frontend/src/app/articles/ArticleBoard.tsx)).
- [x] DeepL 사용량/실패 처리: 실패 시 article 변경 없이 재시도(BullMQ retry), 실패 로그 남김.

### WP-4. 큐레이션 → 발행 브리지 (수동 정리 안정화 후 → 섹션 6 연결)

목표: 큐레이션이 끝난 `READY_TO_PUBLISH` 건을 발행 파이프라인에 안전하게 넘기는 최소 연결부. d-maker 실제 DOM은 `[!]`라 1차는 enqueue + 상태 전환 + dry-run까지.

- [ ] `PublishJobsRepository` 추가(섹션 3과 연계): create/find/active job 조회.
- [ ] `POST /articles/publish` `{ ids: number[] }` — `READY_TO_PUBLISH`만 publish job 생성 + publish 큐 enqueue(가드: 이미 active publish job 있으면 skip).
- [ ] article 상태 `READY_TO_PUBLISH → PUBLISHING` 전환은 worker 시작 시점에 수행.
- [ ] publish job 데이터 계약 정의: `{ articleId, publishJobId }` (기사 본문은 worker가 DB 재조회).
- [ ] dry-run publish worker: 실제 Playwright 없이 상태 전환/로그만 검증(`apps/worker/src/queue/register-publish-worker.ts` 확장).
- [ ] 보드 "발행 대상" 탭에 `발행 요청` 일괄 액션 추가.
- [ ] 이후 실제 Playwright 발행은 섹션 6 체크리스트로 이어서 진행.

### 후속(우선순위 낮음)

- [ ] 큐레이션 단계 전환 이력/감사 로그(누가/언제 review_state·status 변경).
- [ ] 번역문 버전 보관(편집 전/후 비교).

## 2. 기반 정리

- [ ] 현재 진행 중 변경분을 검토하고 커밋 단위로 분리한다.
- [ ] `.env.example`이 실제 secret 없이 필요한 키 이름만 포함하는지 재확인한다.
- [ ] tracked runtime placeholder와 ignored runtime artifact 경계를 재확인한다.
- [x] `README.md`의 Current Implementation Status를 최신 상태로 갱신한다.
- [x] `docs/architecture.md`의 Open Inputs를 현재 결정/미결정 상태로 갱신한다.
- [x] 최소 smoke test 절차를 `docs/operations.md`에 추가한다.

## 3. DB Repository 확장

- [ ] `PublishJobsRepository` 추가.
- [ ] `PublishLogsRepository` 추가.
- [ ] `CallbackLogsRepository` 추가.
- [ ] `FailureArtifactsRepository` 추가.
- [ ] article 상태 전환 helper 추가: `DRAFT`, `READY_TO_PUBLISH`, `EMBARGOED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `DELETED`.
- [ ] publish 중복 방지 조회 추가: article state + active publish job 기준.
- [ ] callback retry count/status 갱신 메서드 추가.
- [ ] failure artifact 저장 메서드 추가.

## 4. Backend API

- [ ] `POST /articles/:id/publish` 발행 요청 API 추가.
- [ ] `GET /publish-jobs` 발행 job 목록 API 추가.
- [ ] `GET /publish-jobs/:id` 발행 job 상세 API 추가.
- [ ] `POST /publish-jobs/:id/retry` 발행 재시도 API 추가.
- [ ] `GET /failure-artifacts` 실패 artifact 목록 API 추가.
- [ ] `GET /failure-artifacts/:id` 실패 artifact 상세 API 추가.
- [ ] `GET /callback-logs` callback log 목록 API 추가.
- [x] `GET /jobs/fetch` 수집 job 목록 API 추가.
- [x] `GET /jobs/fetch/:id` 수집 job 상세 API 추가.
- [ ] 수동 수집 API가 source config query를 사용할 수 있게 확장.
- [x] NewsData.io 수동 수집 API 입력값 검증 추가: source/query/limit/offset/id.
- [x] NewsData.io category 18개 허용값 검증 추가.
- [x] NewsData.io category 쉼표 구분 최대 5개 검증 추가.
- [x] NewsData.io country 쉼표 구분 최대 5개 검증 추가.
- [x] NewsData.io language 쉼표 구분 최대 5개 검증 추가.
- [x] NewsData.io domainurl 쉼표 구분 최대 5개 검증 추가.
- [x] NewsData.io prioritydomain `top|medium|low` 검증 추가.

## 5. Admin UI

- [x] NewsData.io 수동 수집 조건 입력 화면 추가.
- [x] NewsData.io category 18개 다중 선택 UI 추가.
- [x] NewsData.io country/language/domainurl 쉼표 구분 입력 UI 추가.
- [x] NewsData.io prioritydomain 선택 UI 추가.
- [x] 기사 목록(큐레이션 보드) 화면 추가: 탭/검색/pagination + 국가 컬럼. (섹션 1A 참고)
- [ ] Draft 상세에서 발행 요청 버튼 추가.
- [ ] 발행 요청 중/완료/실패 상태 표시.
- [ ] 발행 queue 상태 화면 추가.
- [ ] 실패 로그 화면 추가.
- [ ] 실패 artifact screenshot/html snapshot 보기 추가.
- [ ] callback log 화면 추가.
- [ ] fetch job 상태 화면 추가.
- [ ] raw payload 보기 UX 개선.
- [ ] source별 자동/수동 발행 정책 설명 표시.

## 6. Publish Queue 및 d-maker.kr Publisher

- [ ] publish queue job data contract 정의.
- [ ] publish worker가 article id로 DB에서 기사/asset을 조회하도록 변경.
- [ ] `PUBLISHING` 상태 전환 구현.
- [ ] d-maker.kr selector map 파일 분리.
- [!] d-maker.kr 실제 login/write form DOM 확인 후 selector 확정.
- [ ] Playwright `storageState` 복원 구현.
- [ ] 세션 만료 시 ID/PASSWORD 재로그인 구현.
- [ ] 로그인 성공 후 `storageState` 갱신 구현.
- [ ] d-maker.kr 필드 기본값 적용: 등급, 상태, 섹션, 기자명, 기자 이메일.
- [ ] 제목/부제목/본문/키워드 입력 구현.
- [ ] thumbnail 업로드 구현.
- [ ] attachment 업로드 정책 결정 및 구현.
- [ ] 실제 등록 submit 구현.
- [ ] 등록 후 `idxno` 추출 구현.
- [ ] 공개 URL 생성: `https://www.d-maker.kr/news/articleView.html?idxno={idxno}`.
- [ ] 공개 URL 접속 검증 구현.
- [ ] 공개 페이지에서 제목 검증 구현.
- [ ] 성공 시 `publish_logs` 저장.
- [ ] 성공 시 article 상태 `PUBLISHED`, `public_url` 갱신.
- [ ] 실패 시 article 상태 `FAILED` 갱신.
- [ ] 실패 시 screenshot 저장.
- [ ] 실패 시 HTML snapshot 저장.
- [ ] 실패 시 current URL/error step/error message 저장.
- [ ] 실패 artifact를 `failure_artifacts`에 저장.

## 7. Callback Queue

- [ ] callback queue job data contract 정의.
- [ ] Newswire 기사 발행 성공 후 callback queue 생성.
- [ ] 내부망 URL callback 차단 로직 추가.
- [ ] Newswire callback URL 생성 규칙 확정.
- [ ] callback POST 구현.
- [ ] callback request payload 저장.
- [ ] callback response status/body 저장.
- [ ] callback 실패 retry 정책 구현.
- [ ] callback 최종 실패 상태 저장.

## 8. NewsData.io 수집/처리 고도화

- [x] manual fetch query 기반 NewsData.io fetch 구현.
- [x] NewsData.io category 다중 선택은 쉼표 구분 문자열로 API에 전달.
- [x] NewsData.io country/language/domainurl 다중 입력은 쉼표 구분 문자열로 API에 전달.
- [x] NewsData.io prioritydomain query 전달 구현.
- [ ] source config query 기반 NewsData.io fetch 구현.
- [ ] manual fetch query와 source config query 병합 규칙 확정.
- [~] `nextPage` pagination 처리 구현. 결과 count DB 저장은 미구현.
- [x] API key가 로그에 노출되지 않도록 NewsData.io 요청 URL redaction 구현.
- [x] duplicate count 계산 구현.
- [ ] image/video는 원본 전체 사용이 아닌 thumbnail 처리 정책으로 제한했는지 재확인.
- [ ] publisher credit 표시/저장 검증.
- [x] country(국가) 저장 및 목록/상세 표시: raw_payload country 배열을 컬럼으로 정규화.
- [x] 수동 수집 기본값은 최신 뉴스 모드로 설정하고, from_date/to_date는 기간 검색 모드에서만 전송.
- [ ] auto publish policy 적용: 기본 `DRAFT`, 설정 시 `READY_TO_PUBLISH`.

## 9. Newswire 수집/처리

- [!] Newswire `insert` 실제 response sample 확보.
- [!] Newswire `update` 실제 response sample 확보.
- [!] Newswire `delete` 실제 response sample 확보.
- [!] Newswire stable external id 결정: `send_id`, `pid`, 또는 다른 필드.
- [ ] Newswire HMAC 생성 공통 모듈 추가.
- [ ] `X-Timestamp` UTC millisecond 생성 구현.
- [ ] `/api/v1/request` 호출 구현.
- [ ] `/api/v1/send` 호출 구현.
- [ ] Newswire fetch worker branch 추가.
- [ ] Newswire mapper 추가.
- [ ] `insert` action 처리.
- [ ] `update` action 처리: 기존 데이터 갱신, 없으면 insert 처리.
- [ ] `delete` action 처리: hard delete 없이 `DELETED` 상태 전환.
- [ ] `press_time` 미래값 `EMBARGOED` 처리.
- [ ] Newswire image download/local storage 처리.
- [ ] Newswire 기본 발행 상태 `READY_TO_PUBLISH` 적용.
- [ ] Newswire callback 대상 메타데이터 저장.

## 10. 자동 수집 Scheduler

- [ ] scheduler 실행 위치 결정: worker process 내부 timer 또는 별도 worker.
- [ ] enabled + auto_fetch_enabled source config 조회.
- [ ] `fetch_interval_minutes` 기준 due 계산.
- [ ] 마지막 실행 시각 저장 위치 결정 및 구현.
- [ ] 중복 실행 방지 lock 구현.
- [ ] schedule trigger fetch job 생성.
- [ ] schedule fetch queue enqueue.
- [ ] scheduler 에러 로그/재시도 정책 구현.

## 11. 자동 발행 정책

- [ ] source config `auto_publish_enabled` 적용 위치 확정.
- [ ] process 완료 후 자동 발행 대상이면 `READY_TO_PUBLISH` 또는 publish queue enqueue.
- [ ] `EMBARGOED` 해제 시점 처리.
- [ ] embargo 해제 scheduler 또는 worker 구현.
- [ ] 자동 발행 실패 시 retry/보류 정책 구현.

## 12. 운영/보안

- [ ] API key, DB credential, d-maker credential code hardcoding 없음 재점검.
- [ ] d-maker admin credential `.env` 사용 검증.
- [ ] Newswire HMAC secret handling 검증.
- [ ] server time/NTP 운영 체크 문서화.
- [ ] Playwright artifact 저장 경로 권한 확인.
- [ ] upload/static serving path 보안 점검.
- [ ] CORS 운영 정책 결정.
- [ ] 로그에 secret이 출력되지 않도록 점검.

## 13. 검증 체크리스트

- [x] `npm run typecheck` 통과.
- [x] `npm run build` 통과.
- [x] 2026-07-01 상태 점검에서 `main` / `03a503d` 기준 typecheck/build 재통과.
- [x] WP-3 번역 큐 구현 후 `npm run build` / `npm run typecheck` 재통과.
- [~] local DB migration clean apply 검증: 001 자동 mount, 002 적용 가정. 003(review_state)/004(country)는 로컬 `newsdata` DB에 적용·백필 완료. 신규 환경에서 001~004 순차 clean apply는 재검증 필요.
- [ ] backend boot 검증.
- [ ] frontend boot 검증.
- [ ] worker boot 검증.
- [~] manual NewsData fetch end-to-end 검증: typecheck 통과, 실제 API/DB/worker runtime 검증 필요.
- [ ] Draft article detail view 검증.
- [ ] 큐레이션 보드 end-to-end 검증: 일괄 채택/제외/복구, 최종 확정/되돌리기, 번역 편집 저장.
- [ ] source config CRUD end-to-end 검증.
- [ ] publish request API 검증.
- [ ] publish worker dry-run 검증.
- [ ] d-maker real publish 검증.
- [ ] callback worker 검증.

## 14. 권장 구현 순서

> 우선순위 변경: 수동 큐레이션 워크플로(섹션 1A)를 먼저 완성한다. 발행 자동화는 그 이후.

0. [x] 수동 큐레이션 워크플로 1차: review_state/country, 큐레이션 보드, 번역 편집, 일괄 선별/확정. (섹션 1A)
1. 보드 필터/정렬 확장 + 탭별 건수·번역 현황. (WP-1, WP-2)
2. 일괄 번역 큐 연동 및 단건 번역 worker 이전. (WP-3)
3. 큐레이션 → 발행 브리지: publish job/enqueue/상태전환/dry-run. (WP-4)
4. 기반 정리 및 현재 변경분 커밋.
5. DB repository 확장: publish/log/artifact/callback. (WP-4의 PublishJobsRepository 포함)
6. Draft/발행 대상 상세 UI 발행 요청 버튼.
7. publish worker를 article id 기반으로 재구성.
8. Playwright selector map 및 storageState 구현.
9. d-maker 실제 submit/검증/publish log/failure artifact 구현.
10. callback worker 구현.
11. source config 기반 자동 수집 scheduler 구현.
12. Newswire sample 확보 후 Newswire fetch/process/callback 완성.
## 15. Manual NewsData.io Fetch Updates

- [x] NewsData.io category supports 18 allowed values.
- [x] NewsData.io category supports comma-separated multi-select values, max 5.
- [x] NewsData.io country supports comma-separated values, max 5.
- [x] NewsData.io language supports comma-separated values, max 5.
- [x] NewsData.io domainurl supports comma-separated values, max 5.
- [x] NewsData.io prioritydomain supports `top`, `medium`, `low`.
- [x] NewsData.io requests with `from_date` or `to_date` use `/api/1/archive`; latest requests without dates use `/api/1/news`.
- [x] Manual fetch defaults to latest news mode with no dates; archive/date search is explicit.
- [x] NewsData.io country/language manual fetch UI uses dropdown selection.
- [x] NewsData.io country/language selected values generate comma-separated query strings.
- [x] NewsData.io country/language UI prevents duplicate selection and provides reset buttons.
- [x] NewsData.io process worker translates only article titles by default.
- [x] Article table stores original and translated title/body fields separately.
- [x] Article detail UI provides a manual "본문 번역하기" action.
- [x] Manual body translation stores translated body separately and preserves original body.
- [x] New manual fetch jobs use deterministic BullMQ job ids: `fetch-{fetchJobId}`.
- [x] Pending manual fetch jobs can be canceled through `POST /jobs/fetch/:id/cancel`.
- [x] Manual fetch UI shows a cancel action for pending jobs.
