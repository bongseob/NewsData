import { ARTICLE_SOURCES, type NormalizedArticle } from "@newsdata/shared";
import type { SourceAdapter, SourceFetchConfig } from "./types.js";
import { fetchRssFeeds, resolveFeedUrls } from "./rss-base.js";

// SEC는 요청 시 연락처가 포함된 User-Agent를 요구한다.
const SEC_USER_AGENT = "DailyMaker News Bot dmaker3015@gmail.com";

// press-release RSS만 수집한다(EDGAR 파일링은 후속).
const DEFAULT_FEEDS = ["https://www.sec.gov/news/pressreleases.rss"];

export const secAdapter: SourceAdapter = {
  source: ARTICLE_SOURCES.sec,
  licensePolicy: "PUBLIC_DOMAIN",

  async fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]> {
    const feedUrls = resolveFeedUrls(config.query, DEFAULT_FEEDS);
    return fetchRssFeeds({
      source: ARTICLE_SOURCES.sec,
      feedUrls,
      userAgent: SEC_USER_AGENT,
      publisher: "U.S. Securities and Exchange Commission",
      licensePolicy: "PUBLIC_DOMAIN",
      country: "united states",
      language: "en"
    });
  }
};
