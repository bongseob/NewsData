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
- [ ] 구현 완료 항목은 typecheck/build 통과 후 이 문서에 체크한다.

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

## 2. 기반 정리

- [ ] 현재 진행 중 변경분을 검토하고 커밋 단위로 분리한다.
- [ ] `.env.example`이 실제 secret 없이 필요한 키 이름만 포함하는지 재확인한다.
- [ ] tracked runtime placeholder와 ignored runtime artifact 경계를 재확인한다.
- [ ] `README.md`의 Current Implementation Status를 최신 상태로 갱신한다.
- [ ] `docs/architecture.md`의 Open Inputs를 현재 결정/미결정 상태로 갱신한다.
- [ ] 최소 smoke test 절차를 `docs/operations.md`에 추가한다.

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
- [ ] 기사 목록 화면 추가: 검색, source/status 필터, pagination.
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
- [ ] local DB migration clean apply 검증.
- [ ] backend boot 검증.
- [ ] frontend boot 검증.
- [ ] worker boot 검증.
- [~] manual NewsData fetch end-to-end 검증: typecheck 통과, 실제 API/DB/worker runtime 검증 필요.
- [ ] Draft article detail view 검증.
- [ ] source config CRUD end-to-end 검증.
- [ ] publish request API 검증.
- [ ] publish worker dry-run 검증.
- [ ] d-maker real publish 검증.
- [ ] callback worker 검증.

## 14. 권장 구현 순서

1. 기반 정리 및 현재 변경분 커밋.
2. DB repository 확장: publish/log/artifact/callback.
3. 수동 발행 요청 API + publish queue enqueue.
4. Draft 상세 UI 발행 요청 버튼.
5. publish worker를 article id 기반으로 재구성.
6. Playwright selector map 및 storageState 구현.
7. d-maker 실제 submit/검증/publish log/failure artifact 구현.
8. callback worker 구현.
9. source config 기반 자동 수집 scheduler 구현.
10. Newswire sample 확보 후 Newswire fetch/process/callback 완성.
## 15. Manual NewsData.io Fetch Updates

- [x] NewsData.io category supports 18 allowed values.
- [x] NewsData.io category supports comma-separated multi-select values, max 5.
- [x] NewsData.io country supports comma-separated values, max 5.
- [x] NewsData.io language supports comma-separated values, max 5.
- [x] NewsData.io domainurl supports comma-separated values, max 5.
- [x] NewsData.io prioritydomain supports `top`, `medium`, `low`.
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
