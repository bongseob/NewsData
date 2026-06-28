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

export async function crawlArticle(
  url: string,
  timeoutMs = 15000
): Promise<CrawlResult | null> {
  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      responseType: "text",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/126.0.0.0 Safari/537.36"
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
