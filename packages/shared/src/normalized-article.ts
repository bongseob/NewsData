import type { ArticleSource } from "./sources.js";

/**
 * 소스의 저작권/재배포 정책.
 * - PUBLIC_DOMAIN: 미 정부 자료 등, 전문 번역 발행 허용.
 * - LICENSED: 저작권 소스. 전문 재배포 금지 → 요약 + 원문 링크만 발행.
 */
export type LicensePolicy = "PUBLIC_DOMAIN" | "LICENSED";

/**
 * 모든 소스 어댑터가 생성하는 소스 무관 정규 기사 모델.
 * fetch 워커가 이 배열을 만들어 process 큐로 넘기고, process 워커는
 * 이 모델만 알고 이후 공통 파이프라인(크롤/번역/썸네일/업서트)을 수행한다.
 *
 * 주의: BullMQ 잡 데이터는 JSON 직렬화되므로 Date 대신 ISO 문자열을 쓴다.
 */
export interface NormalizedArticle {
  source: ArticleSource;
  externalId: string;
  title: string;
  summary: string | null;
  /** 소스가 본문을 직접 제공하면 채운다. 없으면 process 단계에서 크롤한다. */
  body: string | null;
  url: string;
  /** 교차 소스 중복 판별용 정규화 URL. */
  canonicalUrl: string;
  publisher: string | null;
  /** ISO 8601 문자열(발표 시각) 또는 null. */
  pressTime: string | null;
  language: string | null;
  country: string | null;
  imageUrl: string | null;
  keywords: string[] | null;
  licensePolicy: LicensePolicy;
  /** 원문 크롤 시 사용할 User-Agent(예: SEC는 연락처 UA 필요). null이면 기본 UA. */
  crawlUserAgent: string | null;
  rawPayload: unknown;
}

/** process 큐 잡 데이터. */
export interface ProcessArticleJobData {
  article: NormalizedArticle;
  fetchJobId: number;
}
