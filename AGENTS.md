# Agent Instructions

이 저장소의 에이전트 작업 규칙은 `PROJECT_RULES.md`를 기준으로 한다.

작업 순서:

1. `prd.md`를 제품 요구사항 원본으로 읽는다.
2. `PROJECT_RULES.md`에서 합의된 기술/운영 규칙을 확인한다.
3. 구현 전 사용자 합의가 필요한 미정 사항이 있으면 먼저 질문한다.
4. 임의로 ORM, DB 직접 발행, API request 내부 Playwright 실행 구조를 도입하지 않는다.

주요 고정 결정:

- Backend: NestJS
- Frontend: Next.js
- DB: MySQL 8.4
- ORM: 없음
- SQL access: `mysql2/promise` + repository
- Queue: Redis + BullMQ
- Publisher: Playwright worker
- d-maker.kr 수정/삭제 자동화: 하지 않음

