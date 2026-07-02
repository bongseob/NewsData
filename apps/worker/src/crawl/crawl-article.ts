import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface CrawlResult {
  title: string | null;
  content: string | null;
  excerpt: string | null;
  byline: string | null;
  length: number;
  sourceUrl: string;
}

const DEFAULT_CRAWL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export interface CrawlOptions {
  /** 소스별 크롤 User-Agent(예: SEC는 연락처 포함 UA 요구). 미지정 시 일반 브라우저 UA. */
  userAgent?: string | null;
  timeoutMs?: number;
}

export async function crawlArticle(
  url: string,
  options: CrawlOptions = {}
): Promise<CrawlResult | null> {
  const { userAgent, timeoutMs = 15000 } = options;
  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      responseType: "text",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": userAgent || DEFAULT_CRAWL_UA
      },
      validateStatus: (status) => status >= 200 && status < 400
    });

    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    if (!parsed) {
      console.warn(`[Crawl] Readability failed: ${url}`);
      return null;
    }

    return {
      title: parsed.title ?? null,
      content: parsed.textContent ?? null,
      excerpt: parsed.excerpt ?? null,
      byline: parsed.byline ?? null,
      length: parsed.length ?? 0,
      sourceUrl: url
    };
  } catch (error) {
    console.error(
      `[Crawl] Failed for ${url}:`,
      error instanceof Error ? error.message : "Unknown error"
    );
    return null;
  }
}
