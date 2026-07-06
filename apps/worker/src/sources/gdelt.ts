import axios from "axios";
import {
  ARTICLE_SOURCES,
  type ArticleSource,
  type NormalizedArticle
} from "@newsdata/shared";
import type { SourceAdapter, SourceFetchConfig } from "./types.js";
import { canonicalizeUrl } from "./url.js";

const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const USER_AGENT = "DailyMaker News Bot dmaker3015@gmail.com";

// GDELT는 5초당 1요청 제한이 있고 Reuters 어댑터도 같은 엔드포인트를 쓴다.
// 실제 요청은 워커가 큐를 소비하며 비동기로 보내므로, 여기서 모듈 레벨로
// 요청을 직렬화하고 호출 간격을 최소 6초(제한 5초 + 여유)로 강제한다.
// 두 어댑터 인스턴스가 이 게이트를 공유해 엔드포인트 전체를 함께 스로틀한다.
const GDELT_MIN_INTERVAL_MS = 6000;
// 429(제한 초과)를 받으면 GDELT가 IP를 한동안 차단한다. 그동안은 요청을 보내도
// 계속 실패하므로, 이 시간만큼 새 요청을 아예 보내지 않고 빠르게 실패시킨다.
const GDELT_RATE_LIMIT_BACKOFF_MS = 60000;
let gdeltThrottleChain: Promise<void> = Promise.resolve();
let lastGdeltRequestAt = 0;
let gdeltBlockedUntil = 0;

function throttleGdelt(): Promise<void> {
  const run = gdeltThrottleChain.then(async () => {
    const waitMs = lastGdeltRequestAt + GDELT_MIN_INTERVAL_MS - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastGdeltRequestAt = Date.now();
  });
  // 앞선 호출이 실패해도 다음 호출이 영구히 막히지 않도록 체인 오류를 흡수한다.
  gdeltThrottleChain = run.catch(() => undefined);
  return run;
}

// 429 발생 시 백오프 창을 설정한다(GDELT/Reuters 공유).
function markGdeltRateLimited(): void {
  gdeltBlockedUntil = Date.now() + GDELT_RATE_LIMIT_BACKOFF_MS;
}

// 백오프 창이 남아 있으면 남은 초를, 없으면 0을 반환한다.
function gdeltBlockRemainingSec(): number {
  return Math.max(0, Math.ceil((gdeltBlockedUntil - Date.now()) / 1000));
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

// GDELT seendate: "YYYYMMDDTHHMMSSZ" → ISO 8601
function parseSeenDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, y, mo, da, h, mi, s] = m;
  return `${y}-${mo}-${da}T${h}:${mi}:${s}Z`;
}

function normalizeGdeltArticle(
  source: ArticleSource,
  article: GdeltArticle
): NormalizedArticle | null {
  const url = article.url ?? "";
  const title = article.title?.trim();
  if (!url || !title) return null;

  return {
    source,
    externalId: url,
    title,
    summary: null,
    body: null, // GDELT는 메타데이터만 → process 단계에서 원문 크롤
    url,
    canonicalUrl: canonicalizeUrl(url),
    publisher: article.domain || null,
    pressTime: parseSeenDate(article.seendate),
    language: article.language || null,
    country: article.sourcecountry || null,
    imageUrl: article.socialimage || null,
    keywords: null,
    licensePolicy: "LICENSED",
    crawlUserAgent: null,
    rawPayload: article
  };
}

/**
 * GDELT DOC 2.0 기반 검색 어댑터. `forcedDomain`을 주면 특정 매체로 한정한다
 * (예: Reuters는 domain:reuters.com). GDELT는 5초당 1요청 제한이 있어
 * 실제 요청 전에 모듈 레벨 throttleGdelt()로 호출 간격을 확보한다
 * (GDELT/Reuters 어댑터가 공유). 단일 워커 프로세스 기준으로 동작한다.
 */
function createGdeltAdapter(
  source: ArticleSource,
  forcedDomain?: string
): SourceAdapter {
  return {
    source,
    licensePolicy: "LICENSED",

    async fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]> {
      const q = String(config.query.q ?? "").trim();
      const parts: string[] = [];
      if (q) parts.push(q);
      if (forcedDomain) parts.push(`domain:${forcedDomain}`);
      const query = parts.join(" ").trim();
      if (!query) {
        throw new Error("GDELT 검색어(q)가 필요합니다.");
      }

      const maxrecords = Math.min(
        Math.max(Number(config.query.maxrecords) || 50, 1),
        250
      );
      // 기본은 최근 3일. 전체 기간 검색은 느려 타임아웃이 잦다.
      const timespan = String(config.query.timespan ?? "").trim() || "3d";

      // 이미 429로 차단된 상태면 요청을 보내지 않고 즉시 실패시킨다
      // (차단 창 동안 계속 두드리면 차단이 더 길어질 수 있다).
      const blockRemaining = gdeltBlockRemainingSec();
      if (blockRemaining > 0) {
        throw new Error(
          `GDELT 요청 제한으로 일시 차단된 상태입니다. 약 ${blockRemaining}초 후 재시도하세요.`
        );
      }

      // 5초당 1요청 제한 준수: 직전 GDELT 호출과 최소 간격을 확보한다.
      await throttleGdelt();

      const response = await axios.get(GDELT_URL, {
        timeout: 30000,
        headers: { "User-Agent": USER_AGENT },
        params: {
          query,
          mode: "ArtList",
          format: "json",
          sort: "DateDesc",
          timespan,
          maxrecords: String(maxrecords)
        },
        validateStatus: (status) => status >= 200 && status < 500
      });

      if (response.status === 429) {
        markGdeltRateLimited();
        throw new Error(
          `GDELT rate limit(5초당 1요청)에 걸렸습니다. 약 ${gdeltBlockRemainingSec()}초 후 재시도하세요.`
        );
      }
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error(
          `GDELT 응답이 JSON이 아닙니다: ${String(response.data).slice(0, 120)}`
        );
      }

      const articles: GdeltArticle[] = response.data.articles ?? [];
      const collected: NormalizedArticle[] = [];
      for (const article of articles) {
        const normalized = normalizeGdeltArticle(source, article);
        if (normalized) collected.push(normalized);
      }
      return collected;
    }
  };
}

export const gdeltAdapter = createGdeltAdapter(ARTICLE_SOURCES.gdelt);
export const reutersAdapter = createGdeltAdapter(
  ARTICLE_SOURCES.reuters,
  "reuters.com"
);
