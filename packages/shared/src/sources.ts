export const ARTICLE_SOURCES = {
  newsdata: "NEWSDATA"
} as const;

export type ArticleSource = (typeof ARTICLE_SOURCES)[keyof typeof ARTICLE_SOURCES];
