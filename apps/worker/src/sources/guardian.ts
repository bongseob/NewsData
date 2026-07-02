import axios from "axios";
import { ARTICLE_SOURCES, type NormalizedArticle } from "@newsdata/shared";
import type { SourceAdapter, SourceFetchConfig } from "./types.js";
import { canonicalizeUrl } from "./url.js";

const GUARDIAN_URL = "https://content.guardianapis.com/search";
const USER_AGENT = "DailyMaker News Bot dmaker3015@gmail.com";

interface GuardianResult {
  id?: string;
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  sectionName?: string;
  fields?: {
    body?: string;
    thumbnail?: string;
    trailText?: string;
    byline?: string;
  };
}

// Guardian fields.body는 HTML이므로 태그를 제거해 평문 본문으로 저장한다.
function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function normalizeGuardianResult(result: GuardianResult): NormalizedArticle | null {
  const url = result.webUrl ?? "";
  const externalId = result.id || url;
  const title = result.webTitle?.trim();
  if (!externalId || !title) return null;

  return {
    source: ARTICLE_SOURCES.guardian,
    externalId,
    title,
    summary: stripHtml(result.fields?.trailText),
    body: stripHtml(result.fields?.body),
    url,
    canonicalUrl: canonicalizeUrl(url),
    publisher: "The Guardian",
    pressTime: result.webPublicationDate ?? null,
    language: "en",
    country: null,
    imageUrl: result.fields?.thumbnail ?? null,
    keywords: null,
    licensePolicy: "LICENSED",
    crawlUserAgent: null,
    rawPayload: result
  };
}

export const guardianAdapter: SourceAdapter = {
  source: ARTICLE_SOURCES.guardian,
  licensePolicy: "LICENSED",

  async fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]> {
    const apiKey = process.env.GUARDIAN_API_KEY;
    if (!apiKey) {
      throw new Error("GUARDIAN_API_KEY is not set");
    }

    const q = String(config.query.q ?? "").trim();
    const section = String(config.query.section ?? "").trim();
    const pageSize = Math.min(
      Math.max(Number(config.query.pageSize) || 50, 1),
      200
    );

    const response = await axios.get(GUARDIAN_URL, {
      timeout: 20000,
      headers: { "User-Agent": USER_AGENT },
      params: {
        "api-key": apiKey,
        q: q || undefined,
        section: section || undefined,
        "show-fields": "body,thumbnail,trailText,byline",
        "order-by": "newest",
        "page-size": String(pageSize)
      },
      validateStatus: (status) => status >= 200 && status < 500
    });

    const payload = response.data?.response;
    if (!payload || payload.status !== "ok") {
      throw new Error(
        `Guardian API 오류: ${payload?.message || `HTTP ${response.status}`}`
      );
    }

    const results: GuardianResult[] = payload.results ?? [];
    const collected: NormalizedArticle[] = [];
    for (const result of results) {
      const normalized = normalizeGuardianResult(result);
      if (normalized) collected.push(normalized);
    }
    return collected;
  }
};
