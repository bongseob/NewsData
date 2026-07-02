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
 * (예: Reuters는 domain:reuters.com). GDELT는 5초당 1요청 제한이 있으나
 * fetch 잡당 1요청이므로 수동 트리거에서는 문제되지 않는다.
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
        throw new Error("GDELT rate limit(5초당 1요청)에 걸렸습니다. 잠시 후 재시도하세요.");
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
