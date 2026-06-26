# Claude Instructions

이 프로젝트에서 작업할 때는 먼저 `PROJECT_RULES.md`와 `prd.md`를 읽고 따른다.

핵심 규칙:

- 구현 전에 사용자와 합의된 범위를 확인한다.
- Backend는 NestJS, Frontend는 Next.js다.
- DB는 MySQL 8.4다.
- ORM은 사용하지 않는다.
- DB 접근은 `mysql2/promise`와 repository layer로 처리한다.
- d-maker.kr 발행은 DB 직접 연동이 아니라 Playwright 관리자 페이지 자동 업로드 방식이다.
- Playwright 작업은 API request 안에서 실행하지 않고 worker/queue에서 실행한다.
- 뉴스와이어 `update/delete`는 우리 시스템 데이터만 갱신하고, 이미 발행된 d-maker.kr 기사를 자동 수정/삭제하지 않는다.
- NewsData.io 기본 상태는 `DRAFT`, 뉴스와이어 기본 상태는 `READY_TO_PUBLISH`다.
- 코드 생성 전에 `PROJECT_RULES.md`의 architecture, status, publish, security 규칙을 확인한다.

