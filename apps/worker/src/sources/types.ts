import type {
  ArticleSource,
  LicensePolicy,
  NormalizedArticle
} from "@newsdata/shared";

export interface SourceFetchConfig {
  /** fetch_jobs.request_payload 에 저장된 소스별 수집 파라미터. */
  query: Record<string, unknown>;
}

/**
 * 소스별 수집 어댑터. fetch()는 페이지네이션/피드 파싱을 내부에서 처리하고
 * 소스 무관 NormalizedArticle 배열을 반환한다.
 */
export interface SourceAdapter {
  source: ArticleSource;
  licensePolicy: LicensePolicy;
  fetch(config: SourceFetchConfig): Promise<NormalizedArticle[]>;
}
