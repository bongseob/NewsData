export const ARTICLE_SOURCES = {
  newsdata: "NEWSDATA",
  newswire: "NEWSWIRE"
} as const;

export type ArticleSource = (typeof ARTICLE_SOURCES)[keyof typeof ARTICLE_SOURCES];

export const NEWSWIRE_ACTIONS = {
  insert: "insert",
  update: "update",
  delete: "delete"
} as const;

export type NewswireAction = (typeof NEWSWIRE_ACTIONS)[keyof typeof NEWSWIRE_ACTIONS];
