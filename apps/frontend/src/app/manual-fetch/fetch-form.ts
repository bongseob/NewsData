import type {
  NewsDataCategory,
  NewsDataCountry,
  NewsDataLanguage,
  NewsDataPriorityDomain
} from "@newsdata/shared";

export type FetchRangeMode = "latest" | "archive";

/**
 * NewsData.io 수동 수집 폼의 단일 상태 모델.
 * 화면 입력값과 1:1로 대응하며, 프리셋/수정 작업의 왕복도 이 모델을 기준으로 한다.
 */
export interface FetchFormState {
  q: string;
  categories: NewsDataCategory[];
  countries: NewsDataCountry[];
  languages: NewsDataLanguage[];
  fetchRange: FetchRangeMode;
  fromDate: string;
  toDate: string;
  domainUrl: string;
  priorityDomain: "" | NewsDataPriorityDomain;
  domain: string;
  size: string;
  removeDuplicate: boolean;
}

/** 완전히 빈 폼 (프리셋 해제·수정 취소 시 사용). */
export const EMPTY_FORM: FetchFormState = {
  q: "",
  categories: [],
  countries: [],
  languages: [],
  fetchRange: "latest",
  fromDate: "",
  toDate: "",
  domainUrl: "",
  priorityDomain: "",
  domain: "",
  size: "10",
  removeDuplicate: true
};

/** 최초 진입 시 기본값 (미국/영어 선택). */
export const DEFAULT_FORM: FetchFormState = {
  ...EMPTY_FORM,
  countries: ["us"],
  languages: ["en"]
};

function parseCommaValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 폼 모델 → NewsData.io API 쿼리.
 * 폼에서 쿼리를 만드는 유일한 지점 (제출·수정·프리셋 저장 공통).
 */
export function formToQuery(form: FetchFormState): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  if (form.q.trim()) query.q = form.q.trim();
  if (form.categories.length > 0) query.category = form.categories.join(",");
  if (form.countries.length > 0) query.country = form.countries.join(",");
  if (form.languages.length > 0) query.language = form.languages.join(",");
  if (form.domainUrl.trim()) query.domainurl = parseCommaValues(form.domainUrl).join(",");
  if (form.priorityDomain) query.prioritydomain = form.priorityDomain;
  if (form.fetchRange === "archive") {
    query.from_date = form.fromDate;
    query.to_date = form.toDate;
  }
  if (form.domain.trim()) query.domain = form.domain.trim();
  if (form.size.trim()) query.size = Number(form.size);
  query.removeduplicate = form.removeDuplicate ? 1 : 0;
  return query;
}

/**
 * 저장된 쿼리(객체 또는 JSON 문자열) → 폼 모델.
 * 쿼리에서 폼을 복원하는 유일한 지점 (프리셋 불러오기·작업 수정 공통).
 */
export function queryToForm(input: unknown): FetchFormState {
  const qry = normalizeQueryInput(input);
  const asString = (value: unknown): string =>
    value === undefined || value === null ? "" : String(value);
  const splitField = <T extends string>(value: unknown): T[] =>
    typeof value === "string" && value
      ? (value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean) as T[])
      : [];

  const hasArchive = Boolean(qry.from_date || qry.to_date);

  return {
    q: asString(qry.q),
    categories: splitField<NewsDataCategory>(qry.category),
    countries: splitField<NewsDataCountry>(qry.country),
    languages: splitField<NewsDataLanguage>(qry.language),
    fetchRange: hasArchive ? "archive" : "latest",
    fromDate: asString(qry.from_date),
    toDate: asString(qry.to_date),
    domainUrl: asString(qry.domainurl),
    priorityDomain: (qry.prioritydomain as NewsDataPriorityDomain) || "",
    domain: asString(qry.domain),
    size:
      qry.size === undefined || qry.size === null || qry.size === ""
        ? "10"
        : String(qry.size),
    removeDuplicate:
      qry.removeduplicate === undefined || qry.removeduplicate === null
        ? true
        : Number(qry.removeduplicate) !== 0
  };
}

/** 두 폼이 실질적으로 같은지 (프리셋 대비 "수정됨" 판별용). */
export function isSameForm(a: FetchFormState, b: FetchFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 프리셋 query 컬럼은 mysql2가 객체로 파싱해 주지만, 문자열로 넘어오는 경우도 방어한다.
 */
function normalizeQueryInput(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof input === "object") return input as Record<string, unknown>;
  return {};
}
