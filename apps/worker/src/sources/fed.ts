import { ARTICLE_SOURCES, type NormalizedArticle } from "@newsdata/shared";
import type { SourceAdapter, SourceFetchConfig } from "./types.js";
import { fetchRssFeeds, resolveFeedUrls } from "./rss-base.js";

const FED_USER_AGENT = "DailyMaker News Bot dmaker3015@gmail.com";

// Federal Reserve 전체 보도자료 피드.
const DEFAULT_FEEDS = ["https://www.federalreserve.gov/feeds/press_all.xml"];

export const fedAdapter: SourceAdapter = {
  source: ARTICLE_SOURCES.fed,
  licensePolicy: "PUBLIC_DOMAIN",

  async fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]> {
    const feedUrls = resolveFeedUrls(config.query, DEFAULT_FEEDS);
    return fetchRssFeeds({
      source: ARTICLE_SOURCES.fed,
      feedUrls,
      userAgent: FED_USER_AGENT,
      publisher: "U.S. Federal Reserve",
      licensePolicy: "PUBLIC_DOMAIN",
      country: "united states",
      language: "en"
    });
  }
};
