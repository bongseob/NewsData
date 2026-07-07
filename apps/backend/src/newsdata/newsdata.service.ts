import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  NewsDataSource,
  NewsDataSourcesQuery,
  NewsDataSourcesResponse
} from "@newsdata/shared";
import { requireEnv } from "../config/env.js";

@Injectable()
export class NewsDataService {
  async listSources(query: NewsDataSourcesQuery): Promise<NewsDataSource[]> {
    const apiKey = requireEnv("NEWSDATA_API_KEY");

    const params = new URLSearchParams();
    params.set("apikey", apiKey);
    if (query.country) params.set("country", query.country);
    if (query.category) params.set("category", query.category);
    if (query.language) params.set("language", query.language);
    if (query.prioritydomain) params.set("prioritydomain", query.prioritydomain);

    const url = `https://newsdata.io/api/1/sources?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw new HttpException(
        `NewsData.io sources 요청 실패: ${message}`,
        HttpStatus.BAD_GATEWAY
      );
    }

    const bodyText = await response.text();
    if (!response.ok) {
      throw new HttpException(
        `NewsData.io sources HTTP ${response.status}: ${bodyText}`,
        HttpStatus.BAD_GATEWAY
      );
    }

    let parsed: NewsDataSourcesResponse;
    try {
      parsed = JSON.parse(bodyText) as NewsDataSourcesResponse;
    } catch {
      throw new HttpException(
        "NewsData.io sources 응답을 해석할 수 없습니다.",
        HttpStatus.BAD_GATEWAY
      );
    }

    return Array.isArray(parsed.results) ? parsed.results : [];
  }
}
