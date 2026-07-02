import axios from "axios";
import {
  ARTICLE_SOURCES,
  type NewsDataArticle,
  type NewsDataFetchQuery,
  type NewsDataResponse,
  type NormalizedArticle
} from "@newsdata/shared";
import type { SourceAdapter, SourceFetchConfig } from "./types.js";
import { canonicalizeUrl } from "./url.js";

const MAX_PAGES = 5;

const PAID_PLAN_MARKERS = [
  "ONLY AVAILABLE IN PAID",
  "ONLY AVAILABLE IN PROFESSIONAL",
  "ONLY AVAILABLE IN CORPORATE"
];

function filterPaidPlanPlaceholder(value: string | null | undefined): string | null {
  if (!value) return null;
  return PAID_PLAN_MARKERS.some((m) => value.toUpperCase().includes(m))
    ? null
    : value;
}

function buildNewsDataUrl(
  apiKey: string,
  query: NewsDataFetchQuery,
  nextPage?: string
): string {
  const endpoint = query.from_date || query.to_date ? "archive" : "news";
  const params = new URLSearchParams();
  params.set("apikey", apiKey);

  if (nextPage) {
    params.set("page", nextPage);
  } else {
    if (query.q) params.set("q", query.q);
    if (query.category) params.set("category", query.category);
    if (query.country) params.set("country", query.country);
    if (query.language) params.set("language", query.language);
    if (query.from_date) params.set("from_date", query.from_date);
    if (query.to_date) params.set("to_date", query.to_date);
    if (query.domain) params.set("domain", query.domain);
    if (query.domainurl) params.set("domainurl", query.domainurl);
    if (query.prioritydomain) params.set("prioritydomain", query.prioritydomain);
    if (query.removeduplicate !== undefined) {
      params.set("removeduplicate", String(query.removeduplicate));
    }
    if (query.size) params.set("size", String(query.size));
  }

  return `https://newsdata.io/api/1/${endpoint}?${params.toString()}`;
}

function redactApiKey(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("apikey")) {
    parsed.searchParams.set("apikey", "[redacted]");
  }
  return parsed.toString();
}

function formatNewsDataRequestError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : "Unknown NewsData.io request error";
  }

  const status = error.response?.status;
  const data = error.response?.data;
  const body =
    typeof data === "string" ? data : data ? JSON.stringify(data) : "";
  const statusText = status ? `HTTP ${status}` : "request failed";
  return body
    ? `NewsData.io ${statusText}: ${body}`
    : `NewsData.io ${statusText}: ${error.message}`;
}

function normalizeArticle(article: NewsDataArticle): NormalizedArticle | null {
  if (!article.article_id) return null;

  const url = article.link || "";
  const keywords = Array.isArray(article.keywords)
    ? article.keywords
        .map((keyword) => String(keyword).trim())
        .filter((keyword) => keyword.length > 0)
        .slice(0, 20)
    : null;
  // NewsData.io country는 전체 국가명 배열(예: ["south korea"])이다.
  const country = Array.isArray(article.country)
    ? article.country.join(",") || null
    : null;
  const language = Array.isArray(article.language)
    ? article.language.join(",") || null
    : null;

  return {
    source: ARTICLE_SOURCES.newsdata,
    externalId: article.article_id,
    title: article.title,
    summary: article.description ?? null,
    body: filterPaidPlanPlaceholder(article.content),
    url,
    canonicalUrl: canonicalizeUrl(url),
    publisher: article.source_id || "NewsData.io",
    pressTime: article.pubDate ?? null,
    language,
    country,
    imageUrl: article.image_url ?? null,
    keywords,
    licensePolicy: "LICENSED",
    crawlUserAgent: null,
    rawPayload: article
  };
}

export const newsDataAdapter: SourceAdapter = {
  source: ARTICLE_SOURCES.newsdata,
  licensePolicy: "LICENSED",

  async fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]> {
    const apiKey = process.env.NEWSDATA_API_KEY;
    if (!apiKey) {
      throw new Error("NEWSDATA_API_KEY is not set");
    }

    const query = config.query as NewsDataFetchQuery;
    const collected: NormalizedArticle[] = [];
    let nextPage: string | undefined;
    let pageNum = 0;

    while (pageNum < MAX_PAGES) {
      const url = buildNewsDataUrl(apiKey, query, nextPage);
      console.log(`[Fetch:newsdata] Page ${pageNum + 1} GET ${redactApiKey(url)}`);

      const response = await axios
        .get<NewsDataResponse>(url, {
          timeout: 15000,
          validateStatus: (status) => status >= 200 && status < 300
        })
        .catch((error: unknown) => {
          throw new Error(formatNewsDataRequestError(error));
        });

      const data = response.data;
      if (data.status && data.status !== "success") {
        throw new Error(`NewsData.io API returned status: ${data.status}`);
      }

      const articles = data.results ?? [];
      if (articles.length === 0) {
        console.log(`[Fetch:newsdata] No more results on page ${pageNum + 1}.`);
        break;
      }

      for (const article of articles) {
        const normalized = normalizeArticle(article);
        if (!normalized) {
          console.warn("[Fetch:newsdata] Skipping article without article_id.");
          continue;
        }
        collected.push(normalized);
      }

      nextPage = data.nextPage ?? undefined;
      if (!nextPage) {
        console.log("[Fetch:newsdata] No nextPage token. Pagination complete.");
        break;
      }
      pageNum++;
    }

    return collected;
  }
};
