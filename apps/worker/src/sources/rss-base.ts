import Parser from "rss-parser";
import type {
  ArticleSource,
  LicensePolicy,
  NormalizedArticle
} from "@newsdata/shared";
import { canonicalizeUrl } from "./url.js";

export interface RssFetchOptions {
  source: ArticleSource;
  feedUrls: string[];
  userAgent: string;
  publisher: string;
  licensePolicy: LicensePolicy;
  /** 정규화 기사에 실을 국가(예: "united states"). */
  country?: string | null;
  language?: string | null;
  /** 피드당 최대 수집 건수(기본 30). */
  limitPerFeed?: number;
}

type RssItem = Parser.Item & {
  "content:encoded"?: string;
  category?: string | string[];
};

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractImageUrl(item: RssItem): string | null {
  const enclosureUrl = item.enclosure?.url;
  if (enclosureUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(enclosureUrl)) {
    return enclosureUrl;
  }
  return null;
}

function extractKeywords(item: RssItem): string[] | null {
  const raw = item.categories ?? item.category;
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  const keywords = list
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0)
    .slice(0, 20);
  return keywords.length > 0 ? keywords : null;
}

function mapItem(item: RssItem, opts: RssFetchOptions): NormalizedArticle | null {
  const url = item.link ?? "";
  const externalId = item.guid || url;
  const title = item.title?.trim();
  if (!externalId || !title) return null;

  // content:encoded > content > null. RSS 요약은 summary로 별도 보관.
  const fullContent =
    (typeof item["content:encoded"] === "string" && item["content:encoded"]) ||
    (typeof item.content === "string" && item.content) ||
    null;

  return {
    source: opts.source,
    externalId,
    title,
    summary: item.contentSnippet?.trim() ?? null,
    body: fullContent,
    url,
    canonicalUrl: canonicalizeUrl(url),
    publisher: opts.publisher,
    pressTime: toIso(item.isoDate ?? item.pubDate),
    language: opts.language ?? "en",
    country: opts.country ?? null,
    imageUrl: extractImageUrl(item),
    keywords: extractKeywords(item),
    licensePolicy: opts.licensePolicy,
    // 피드 소스는 원문 크롤에도 동일 User-Agent를 쓴다(SEC 등 UA 게이팅 대응).
    crawlUserAgent: opts.userAgent,
    rawPayload: item
  };
}

/**
 * 설정된 RSS 피드들을 fetch·파싱해 NormalizedArticle 배열로 반환한다.
 * 개별 피드 실패는 로그만 남기고 나머지 피드는 계속 처리한다.
 */
export async function fetchRssFeeds(
  opts: RssFetchOptions
): Promise<NormalizedArticle[]> {
  const parser = new Parser<{ [key: string]: unknown }, RssItem>({
    timeout: 15000,
    headers: { "User-Agent": opts.userAgent }
  });
  const limit = opts.limitPerFeed ?? 30;
  const collected: NormalizedArticle[] = [];

  for (const feedUrl of opts.feedUrls) {
    try {
      console.log(`[Fetch:${opts.source}] GET ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items ?? []).slice(0, limit);
      for (const item of items) {
        const normalized = mapItem(item as RssItem, opts);
        if (normalized) collected.push(normalized);
      }
    } catch (error) {
      console.error(
        `[Fetch:${opts.source}] Feed failed ${feedUrl}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return collected;
}

/** config.query.feedUrls 가 문자열 배열이면 사용, 아니면 기본 피드를 쓴다. */
export function resolveFeedUrls(
  query: Record<string, unknown>,
  defaults: string[]
): string[] {
  const raw = query.feedUrls;
  if (Array.isArray(raw)) {
    const urls = raw.map((u) => String(u).trim()).filter(Boolean);
    if (urls.length > 0) return urls;
  }
  return defaults;
}
