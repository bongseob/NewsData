import type { ArticleSource } from "./sources.js";

/**
 * NewsData.io API response types
 * Reference: https://newsdata.io/documentation
 */

export interface NewsDataArticle {
  article_id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  link?: string | null;
  source_id?: string | null;
  pubDate?: string | null;
  image_url?: string | null;
  category?: string[] | null;
  country?: string[] | null;
  language?: string[] | null;
  keywords?: string[] | null;
  creator?: string[] | null;
  video_url?: string | null;
}

export interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: NewsDataArticle[];
  nextPage?: string | null;
}

/**
 * Query parameters for manual/scheduled fetch
 */
export interface NewsDataFetchQuery {
  q?: string;
  category?: string;
  country?: string;
  language?: string;
  from_date?: string;
  to_date?: string;
  domain?: string;
  removeduplicate?: number;
  size?: number;
}

/**
 * Fetch worker job data
 */
export interface FetchJobData {
  fetchJobId: number;
  source: ArticleSource;
  query: NewsDataFetchQuery | Record<string, unknown>;
}
