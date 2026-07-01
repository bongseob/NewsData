# Project Rules

이 문서는 `d-maker.kr` 뉴스 자동/수동 수집 및 업로드 시스템의 합의된 구축 규칙이다. Codex, Claude, 기타 자동화 에이전트는 구현 전에 이 문서를 우선 참조한다.

## 1. Product Scope

- 목표는 NewsData.io 및 뉴스와이어 API에서 뉴스를 수집하고, 전처리 후 `d-maker.kr` 관리자 페이지를 통해 자동 또는 수동 발행하는 통합 관리 시스템을 구축하는 것이다.
- `prd.md`가 제품 요구사항의 원본 문서다.
- 구현은 사용자와 추가 합의가 끝난 뒤 진행한다. 설계 합의 없이 임의로 코드를 생성하지 않는다.

## 2. Architecture Decisions

- Backend: NestJS
- Frontend/Admin: Next.js
- Database: MySQL 8.4
- ORM: 사용하지 않는다.
- DB access: `mysql2/promise` 기반 repository layer를 사용한다.
- Migration: SQL 파일 기반 migration을 사용한다.
- Queue: Redis + BullMQ
- Worker: NestJS 또는 Node.js TypeScript worker
- Publisher: Playwright 기반 d-maker.kr 관리자 페이지 자동 업로드
- Storage: 1차는 local volume, 필요 시 S3-compatible storage로 확장 가능하게 설계한다.

## 3. Repository Layout

권장 구조:

```text
apps/backend
  NestJS API

apps/frontend
  Next.js admin UI

apps/worker
  background jobs, API fetchers, processor, Playwright publisher, callback sender

packages/db
  SQL migrations, mysql pool, transaction helpers, repositories

packages/shared
  shared types, constants, status values

docs
  architecture, operation, API integration notes
```

## 4. Backend Rules

- 비즈니스 로직은 NestJS service에 둔다.
- SQL은 service에 직접 흩뿌리지 않고 repository 계층에 둔다.
- DB 트랜잭션은 명시적으로 처리한다.
- 외부 API 호출, 이미지 다운로드, Playwright 발행처럼 오래 걸리는 작업은 API request 안에서 직접 실행하지 않는다. 반드시 queue/worker로 분리한다.
- API는 작업 생성, 상태 조회, 재시도 요청을 담당한다.

## 5. Database Rules

- MySQL 8.4를 기준으로 설계한다.
- 원본 API 응답은 JSON 컬럼에 보관한다.
- 중복 방지는 `source + external_id` unique key를 기본으로 한다.
- NewsData.io는 `article_id`를 `external_id`로 사용한다.
- 뉴스와이어는 제공 식별자, `send_id`, `pid` 등 실제 응답 샘플 확인 후 stable external id를 확정한다.
- 발행 이력은 별도 publish log에 저장한다.
- 실패 이력은 원인, 단계, 에러 메시지, 재시도 횟수, snapshot path를 포함한다.
- 삭제는 기본적으로 hard delete가 아니라 soft state로 처리한다.

## 6. Source Processing Rules

### NewsData.io

- `article_id` 기준으로 중복 저장을 방지한다.
- 원본 출처 publisher credit을 보존하고 발행 화면에서 표시 가능하게 저장한다.
- 이미지/비디오는 저작권 리스크 때문에 원본 전체 사용이 아니라 썸네일 렌더링 정책을 따른다.
- 기본 발행 상태는 `DRAFT`다.
- source/category/keyword 설정에 따라 자동 발행으로 전환할 수 있다.

### Newswire

- `insert`, `update`, `delete` action을 반드시 처리한다.
- `insert`: 신규 수집/발행 대상이다.
- `update`: 우리 시스템의 원본/정규화 데이터만 갱신한다.
- `delete`: 우리 시스템에서 비노출/삭제 상태만 표시한다.
- 이미 d-maker.kr에 발행된 기사는 Playwright로 자동 수정/삭제하지 않는다.
- `press_time`이 미래인 경우 `EMBARGOED`로 보류하고 노출/발행하지 않는다.
- `photo.url` 등 외부 이미지 직접 링크는 금지한다. 반드시 다운로드 후 내부 저장소에 저장한 파일을 사용한다.
- 기본 발행 상태는 `READY_TO_PUBLISH`다.

## 7. Article Status Rules

기본 상태:

```text
DRAFT
READY_TO_PUBLISH
EMBARGOED
PUBLISHING
PUBLISHED
FAILED
DELETED
```

- `DRAFT`: 관리자 검수 대기, 자동 발행하지 않는다.
- `READY_TO_PUBLISH`: 발행 queue 대상이다.
- `EMBARGOED`: `press_time` 도달 전까지 발행하지 않는다.
- `PUBLISHING`: Playwright 발행 진행 중이다.
- `PUBLISHED`: d-maker.kr 공개 URL 검증이 완료된 상태다.
- `FAILED`: 수집, 전처리, 이미지 처리, 발행, 콜백 중 실패한 상태다.
- `DELETED`: 원본 삭제 action을 반영한 비노출 상태다.

## 8. d-maker.kr Publish Rules

- d-maker.kr 발행은 DB 직접 insert나 내부 API 호출이 아니라 Playwright로 관리자 페이지에 로그인하여 업로드한다.
- 관리자 로그인 URL: `https://www.d-maker.kr/admin/adminLoginForm.html`
- 기사/보도자료 작성 URL: `https://www.d-maker.kr/news/adminArticleWriteForm.html?mode=input`
- 공개 URL 패턴: `https://www.d-maker.kr/news/articleView.html?idxno={idxno}`
- 자동화 전용 관리자 계정을 사용한다.
- 로그인 방식은 ID/PASSWORD다.
- CAPTCHA/OTP는 없는 전제로 설계한다.
- 계정 정보는 `.env` 또는 운영 Secret으로 관리한다.
- Playwright는 `storageState`를 재사용하고, 세션 만료 시 ID/PASSWORD로 재로그인한다.

발행 흐름:

```text
1. storageState로 관리자 세션 복원 시도
2. 작성 화면 접근
3. 로그인 화면으로 튕기면 ID/PASSWORD 로그인
4. storageState 갱신
5. 작성 화면 재접근
6. 기사 필드 입력
7. 이미지 업로드
8. 발행
9. idxno 추출
10. 공개 URL 접근 및 제목 확인
11. publish_log 저장
12. 뉴스와이어이면 callback queue 생성
```

## 9. d-maker.kr Field Defaults

자동 입력 기본값:

```text
등급: 일반기사
상태: 미승인
섹션 1차: 뉴스
섹션 2차: 선택없음
기자명: 데일리메이커
기자이메일: dmaker3015@gmail.com
```

필수 입력 필드:

```text
grade
status
section1
section2
reporter_name
reporter_email
title
subtitle
body
keywords
thumbnail
attachments
```

## 10. Playwright Reliability Rules

- Playwright 작업은 queue worker에서만 실행한다.
- API request thread에서 Playwright를 실행하지 않는다.
- 발행 성공은 버튼 클릭이 아니라 공개 URL 검증으로 판단한다.
- 성공 기준:
  - `idxno`를 확보한다.
  - `https://www.d-maker.kr/news/articleView.html?idxno={idxno}`에 접근 가능하다.
  - 공개 페이지에서 발행한 제목이 확인된다.
- 실패 시 아래 증거를 저장한다.
  - screenshot
  - HTML snapshot
  - current URL
  - article id
  - error message
  - failed step: `LOGIN`, `OPEN_FORM`, `FILL_FORM`, `UPLOAD_IMAGE`, `SUBMIT`, `VERIFY`
- 중복 업로드 방지는 1차로 내부 `publish_log`와 article state 기준으로 처리한다.

## 11. Callback Rules

- 뉴스와이어 기사가 d-maker.kr에 성공적으로 발행되어 공개 URL이 생성되면 뉴스와이어 callback을 호출한다.
- 내부망 주소는 callback URL로 전달하지 않는다.
- callback 실패는 별도 queue에 저장하고 재시도한다.
- callback 요청/응답은 callback log에 남긴다.

## 12. Admin UI Rules

Next.js 관리자 화면은 최소 다음 기능을 제공한다.

- dashboard
- 수집 설정 관리
- 수동 수집 요청
- 기사 목록
- Draft 검수
- 발행 요청
- 발행 queue 상태
- 실패 로그
- 재시도
- 원본 payload 보기
- Playwright 실패 screenshot/HTML snapshot 보기
- source별 자동/수동 발행 정책 설정

## 13. Security Rules

- API keys, d-maker.kr 관리자 계정, DB credentials는 코드에 커밋하지 않는다.
- `.env.example`에는 key 이름만 둔다.
- 뉴스와이어 HMAC 생성은 공통 모듈로 분리한다.
- `X-Timestamp`는 UTC millisecond 기준으로 생성한다.
- 서버 시간은 NTP로 동기화되어야 하며, 5분 이상 차이 나면 뉴스와이어 호출 실패 가능성을 고려한다.

## Local Database Convention

- Local development database name: `newsdata`
- Local development application DB user: `news`
- Application code must connect with the application DB user, not the MySQL `root` user.
- MySQL `root` credentials are local runtime/admin information only and must not be used by application code.
- DB passwords must be stored only in `.env` or deployment secret storage.
- Do not commit real DB passwords, API keys, or d-maker.kr account values.
- `.env.example` must contain only environment variable names and safe placeholders.

## Encoding Rules

- All repository text files must be saved as UTF-8.
- Korean documents must not be saved as ANSI, CP949, EUC-KR, or mixed encoding.
- When reading Korean files in PowerShell, set the console to UTF-8 first if output looks broken.
- Broken terminal display is not enough evidence that a file is corrupted; verify the file encoding before rewriting content.
- New Markdown, SQL, TypeScript, JSON, YAML, and env example files should use UTF-8 without BOM unless a tool requires otherwise.
- Do not rewrite large Korean documents only to fix display issues unless the source encoding and desired conversion are confirmed.

## 14. Implementation Discipline

- 구현 전에 합의된 요구사항을 이 문서에 반영한다.
- 불명확한 외부 API 응답 구조는 추측하지 않는다. 실제 샘플을 확보한 뒤 mapper를 확정한다.
- d-maker.kr 관리자 화면 selector는 실제 DOM 확인 후 selector map으로 분리한다.
- SQL schema, repository, worker state transition은 테스트 가능한 단위로 나눈다.
- 자동화가 실패할 수 있는 모든 외부 경계는 로그와 재시도 정책을 가진다.
