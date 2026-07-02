# 무료 해외 뉴스 애그리게이터 개편 계획

이 문서는 서비스를 **뉴스와이어 제외 + 무료 해외 뉴스 다중 소스 수집 전문 서비스**로 개편하기 위한 구현 계획이다.
`prd.md` / `PROJECT_RULES.md`의 상위 규칙을 따르며, 진행하면서 이 문서를 갱신한다.

상태 표기: `[ ]` 미착수 · `[~]` 진행 중 · `[x]` 완료 · `[!]` 결정/외부 확인 필요

---

## 0. 확정된 결정 (2026-07-02)

1. **발행 모드 — 법적 리스크 회피**
   - 소스를 **라이선스 정책**으로 구분한다.
     - `PUBLIC_DOMAIN` (SEC, Federal Reserve 등 미 정부): **전문 번역 발행 허용**.
     - `LICENSED` (BBC, Guardian, NPR, Reuters, NewsData 색인 매체 등 저작권 소스): **전문 재배포 금지**. → **AI 한국어 요약(사실 위주) + 출처 표기 + 원문 링크**만 발행.
   - 즉, 저작권 소스는 원문 번역 본문을 d-maker.kr에 싣지 않고, 새로 생성한 요약과 링크만 발행한다.
2. **Reuters** — 폐지된 공개 RSS 대신 **GDELT 도메인 필터(`domain:reuters.com`)** 로 대체한다.
3. **수집 방식** — 당분간 **수동 트리거만**. 자동 주기 폴링(스케줄러)은 **후순위 보류**.
4. **우선순위** — 정부 피드 → 검색 API → 방송사 RSS 순서(아래 로드맵).
5. **계획 관리** — 본 문서로 관리한다.

---

## 1. 현재 아키텍처 진단

| 요소 | 현황 | 개편 함의 |
|---|---|---|
| 소스 추상화 | 없음. fetch/process 워커가 NewsData 전용 하드코딩 | **어댑터 패턴 도입 필수** |
| 스케줄러 | 없음 | 수동 트리거만 하므로 당장 불필요(보류) |
| `source_configs` | `enabled/auto_fetch_enabled/fetch_interval_minutes/query` 컬럼 존재 | 소스별 설정(피드 URL 등) 저장에 재사용 |
| 본문 크롤러 | `apps/worker/src/crawl/crawl-article.ts` (axios) | RSS/XML 파서 의존성 추가 필요 |
| 중복 제거 | `UNIQUE(articles.source, external_id)` — 소스 내부만 | **교차 소스 dedup 필요** |
| 파이프라인 | 크롤 → 제목 번역 → 썸네일/워터마크 → AI 요약·SEO → 발행 | 정규화 이후 단계 재사용 |
| 발행 | 전문 번역 본문을 d-maker.kr에 업로드 | 저작권 소스는 요약+링크 모드로 분기 필요 |

---

## 2. 소스 목록 및 통합 방식

| 소스 | 통합 방식 | 키 | 본문 확보 | 라이선스 정책 | 비고 |
|---|---|---|---|---|---|
| NewsData.io | 검색 REST JSON | O | 크롤 | `LICENSED` | 구현 완료(발행 모드는 요약+링크로 전환 필요) |
| GDELT | 검색 REST JSON(DOC 2.0) | X | 크롤 | `LICENSED` | 전 세계·키워드. Reuters는 `domain:reuters.com`로 여기서 수집 |
| Guardian API | 검색 REST JSON | O(무료) | **API 본문 제공** | `LICENSED` | 본문 크롤 불필요하나 발행은 요약+링크 |
| BBC | RSS | X | 크롤 | `LICENSED` | 요약+링크 |
| NPR | RSS | X | 크롤 | `LICENSED` | 요약+링크 |
| SEC News | RSS(+EDGAR) | X(User-Agent 필수) | 크롤/일부 API | `PUBLIC_DOMAIN` | **전문 발행 가능**, 금융·규제 |
| Federal Reserve | RSS(`press_all.xml`) | X | 크롤 | `PUBLIC_DOMAIN` | **전문 발행 가능** |
| ~~Reuters RSS~~ | (폐지) | - | - | - | GDELT 도메인 필터로 대체 |

통합 패턴은 **A) 검색형 REST API**(NewsData·GDELT·Guardian)와 **B) 피드형 RSS**(BBC·NPR·SEC·Fed) 둘로 수렴한다.

---

## 3. 목표 아키텍처

```
[수동 트리거/UI] ──> [fetch queue]
                         │  adapter = SOURCE_ADAPTERS[source]
                         ▼
                 adapter.fetch(config) ─> NormalizedArticle[]
                         │  (교차 dedup 체크: canonical_url)
                         ▼
                    [process queue]  ← 소스 무관(제네릭)
              본문 정책에 따라 크롤 or 요약전용 → 제목 번역 → 썸네일/워터마크
                         ▼
                 articles(upsert) → 큐레이션 → 발행(정책 분기)
```

### 3.1 신규 핵심 요소

- **`NormalizedArticle`** 정규 타입 (`packages/shared`)
  ```ts
  interface NormalizedArticle {
    source: ArticleSource;
    externalId: string;        // 소스별 고유 ID (없으면 canonical URL 해시)
    title: string;
    summary: string | null;    // 소스 제공 요약/설명
    body: string | null;       // 소스가 본문을 주면 채움(Guardian/정부)
    url: string;               // 원문 링크
    canonicalUrl: string;      // 정규화된 dedup 키
    publisher: string | null;
    pressTime: Date | null;
    language: string | null;
    country: string | null;
    imageUrl: string | null;
    keywords: string[] | null;
    rawPayload: unknown;
  }
  ```
- **`SourceAdapter`** 인터페이스 (`apps/worker/src/sources/*`)
  ```ts
  interface SourceAdapter {
    source: ArticleSource;
    licensePolicy: "PUBLIC_DOMAIN" | "LICENSED";
    fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]>;
  }
  ```
  `SOURCE_ADAPTERS: Record<ArticleSource, SourceAdapter>` 레지스트리로 등록.
- **제네릭 fetch/process 워커**: 소스 분기 제거, 어댑터에 위임.
- **발행 정책 분기**: 발행 단계에서 `licensePolicy`(또는 article에 저장한 정책)에 따라
  - `PUBLIC_DOMAIN` → 기존처럼 전문 번역 본문 발행.
  - `LICENSED` → AI 한국어 요약(`translated_summary`) + 출처/원문 링크만 발행, 전문 본문은 발행 페이로드에서 제외.

### 3.2 라이선스 정책 저장

- `articles`에 `license_policy VARCHAR(16)` 컬럼 추가(소스 어댑터 값 복사) → 발행 시점에 소스 상수에 의존하지 않고 기사 단위로 판단.
- 또는 소스→정책 매핑 상수만 두고 발행 시 조회. (컬럼 저장이 이력 관점에서 안전 → 권장)

---

## 4. 단계별 로드맵 (수동 트리거 기준)

### Phase 0 — 어댑터 추상화 리팩터 (기능 동등, 신규 소스 0개)
- [ ] `NormalizedArticle`, `SourceAdapter`, `SOURCE_ADAPTERS` 정의(`packages/shared` + `apps/worker/src/sources`)
- [ ] 현 NewsData 로직을 `sources/newsdata.ts` 어댑터로 이관
- [ ] fetch 워커: 어댑터 dispatch 구조로 제네릭화
- [ ] process 워커: `NormalizedArticle` 소비로 제네릭화(소스 분기 제거)
- [ ] NewsData 수집 파리티 검증(기존과 동일 결과)

### Phase 1 — 뉴스와이어 제거
- [ ] `ARTICLE_SOURCES`에서 `newswire`, `NEWSWIRE_ACTIONS` 제거
- [ ] UI 정리: `ManualFetchManager` 탭, `ArticleBoard` SOURCE_OPTIONS, `articles/page` VALID_SOURCES, `settings/SourceConfigManager`
- [ ] `DELETED` 상태 정리(뉴스와이어 delete 트리거였음) — enum/문서에서 정합성 맞춤
- [ ] `prd.md` / `PROJECT_RULES.md`에서 뉴스와이어 규칙 제거·개편 반영

### Phase 2 — 정부 피드 (저작권 안전, 피드 파이프라인 검증)
- [ ] RSS 파서 의존성 추가(`rss-parser` 권장) + `sources/rss-base.ts` 공통 어댑터
- [ ] `sources/sec.ts`(User-Agent 필수), `sources/fed.ts`
- [ ] 피드 URL 등 설정은 `source_configs.query`에 저장
- [ ] `license_policy = PUBLIC_DOMAIN`로 전문 번역 발행 경로 확인
- [ ] 교차 소스 dedup 1차: `canonical_url` 정규화 + 컬럼/인덱스 추가

### Phase 3 — 검색형 API 확장
- [ ] `sources/gdelt.ts`(무키, Reuters 도메인 필터 포함)
- [ ] `sources/guardian.ts`(무료 키, `show-fields=body` 본문 수신)
- [ ] 수동 수집 키워드 UI를 소스 탭으로 재사용(프리셋/폼 추상화 활용)
- [ ] `license_policy = LICENSED` → **요약+링크 발행 모드** 구현·검증

### Phase 4 — 방송사 RSS
- [ ] `sources/bbc.ts`, `sources/npr.ts`
- [ ] 요약+링크 발행 모드 적용
- [ ] 소스별 크롤 안정화(User-Agent, 백오프, 실패 아티팩트)

### Phase 5 — 운영 UX / dedup 고도화 / 대시보드
- [ ] 소스 관리 화면(활성/비활성, 소스별 설정) — `source_configs` 활용
- [ ] 교차 소스 dedup 고도화(제목 해시/유사도)
- [ ] 대시보드 소스별 수집 카운트

### 보류 (후순위)
- [ ] 자동 주기 폴링 스케줄러(BullMQ repeatable) — `source_configs.auto_fetch_enabled/fetch_interval_minutes` 이미 준비됨. 수동 운영이 안정된 뒤 도입.
- [ ] 엠바고(press_time 기반) — 스케줄러 도입 시 함께 검토.

---

## 5. 교차 관심사

- **발행 정책 분기(핵심)**: `LICENSED` 소스는 전문 번역 본문을 발행 페이로드에서 제외하고 요약+링크만. 발행 워커/서비스에 분기 추가.
- **본문 확보**: Guardian/정부는 본문 직접 제공, 그 외는 `crawl-article` 사용. GDELT는 URL만 → 크롤 필수.
- **교차 소스 중복**: 같은 사건을 여러 매체가 보도 → `canonical_url`(쿼리스트링 제거·호스트 정규화) 기준 1차 dedup, 이후 제목 유사도로 고도화.
- **번역/언어**: 소스 대부분 영어(GDELT 다국어). 기존 OpenAI 번역 파이프라인 재사용. SEC/Fed는 금융·규제 전문용어 → 번역 품질 점검.
- **정중한 수집(politeness)**: SEC 등은 User-Agent 필수, 소스별 동시성 제한·백오프, RSS는 ETag/Last-Modified 활용.
- **의존성 추가**: `rss-parser`(또는 `fast-xml-parser`), 필요 시 본문 추출 개선용 `cheerio`/추출 라이브러리 검토.

---

## 6. 결정/확인 남은 항목

- [!] 저작권 소스 요약 발행 시 이미지 정책: 원문 썸네일 대신 자체 생성 이미지(이미 워터마크/AI 이미지 기능 있음)만 사용할지.
- [!] `LICENSED` 요약 길이/형식(현행 AI 3문장 요약 재사용 여부).
- [!] Guardian 무료 키 발급 및 `.env` 관리(`GUARDIAN_API_KEY`).
- [!] SEC EDGAR User-Agent 문자열(연락처 포함) 확정.

---

## 7. 추천 시작 스프린트

**Phase 0(어댑터 리팩터) + Phase 1(뉴스와이어 제거) + Phase 2(SEC·Fed)**.
여기서 어댑터·RSS·발행 정책 분기·dedup의 뼈대가 완성되면, 이후 소스(GDELT/Guardian/BBC/NPR)는 어댑터 파일 추가로 확장된다.
