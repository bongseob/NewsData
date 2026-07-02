export const ARTICLE_SOURCES = {
  newsdata: "NEWSDATA",
  sec: "SEC",
  fed: "FED",
  gdelt: "GDELT",
  reuters: "REUTERS",
  guardian: "GUARDIAN"
} as const;

export type ArticleSource = (typeof ARTICLE_SOURCES)[keyof typeof ARTICLE_SOURCES];
