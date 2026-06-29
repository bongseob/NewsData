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
  domainurl?: string;
  prioritydomain?: NewsDataPriorityDomain;
  removeduplicate?: number;
  size?: number;
}

export const NEWSDATA_CATEGORIES = [
  "top",
  "business",
  "crime",
  "domestic",
  "education",
  "entertainment",
  "environment",
  "food",
  "health",
  "lifestyle",
  "other",
  "politics",
  "science",
  "sports",
  "technology",
  "tourism",
  "world",
  "religion"
] as const;

export type NewsDataCategory = (typeof NEWSDATA_CATEGORIES)[number];

export const NEWSDATA_CATEGORY_LABELS: Record<NewsDataCategory, string> = {
  top: "주요 헤드라인",
  business: "경제, 금융, 기업",
  crime: "범죄",
  domestic: "국내 뉴스",
  education: "교육",
  entertainment: "연예, 영화, 음악",
  environment: "환경, 기후",
  food: "음식, 외식",
  health: "건강, 의료",
  lifestyle: "생활, 패션, 문화",
  other: "기타",
  politics: "정치",
  science: "과학",
  sports: "스포츠",
  technology: "IT, AI, 반도체",
  tourism: "여행, 관광",
  world: "국제 뉴스",
  religion: "종교"
};

export const NEWSDATA_PRIORITY_DOMAINS = [
  "top",
  "medium",
  "low"
] as const;

export type NewsDataPriorityDomain =
  (typeof NEWSDATA_PRIORITY_DOMAINS)[number];

export const NEWSDATA_PRIORITY_DOMAIN_LABELS: Record<NewsDataPriorityDomain, string> = {
  top: "상위 우선순위 도메인",
  medium: "중간 우선순위 도메인",
  low: "낮은 우선순위 도메인"
};

export const NEWSDATA_COUNTRIES = [
  { value: "kr", label: "대한민국" },
  { value: "us", label: "미국" },
  { value: "jp", label: "일본" },
  { value: "cn", label: "중국" },
  { value: "gb", label: "영국" },
  { value: "de", label: "독일" },
  { value: "fr", label: "프랑스" },
  { value: "ca", label: "캐나다" },
  { value: "au", label: "호주" },
  { value: "in", label: "인도" },
  { value: "sg", label: "싱가포르" },
  { value: "hk", label: "홍콩" },
  { value: "tw", label: "대만" },
  { value: "id", label: "인도네시아" },
  { value: "my", label: "말레이시아" },
  { value: "th", label: "태국" },
  { value: "vn", label: "베트남" },
  { value: "ph", label: "필리핀" },
  { value: "br", label: "브라질" },
  { value: "mx", label: "멕시코" },
  { value: "es", label: "스페인" },
  { value: "it", label: "이탈리아" },
  { value: "nl", label: "네덜란드" },
  { value: "se", label: "스웨덴" },
  { value: "ch", label: "스위스" },
  { value: "ae", label: "아랍에미리트" },
  { value: "sa", label: "사우디아라비아" },
  { value: "tr", label: "튀르키예" },
  { value: "za", label: "남아프리카공화국" }
] as const;

export type NewsDataCountry = (typeof NEWSDATA_COUNTRIES)[number]["value"];

export const NEWSDATA_LANGUAGES = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "영어" },
  { value: "ja", label: "일본어" },
  { value: "zh", label: "중국어" },
  { value: "de", label: "독일어" },
  { value: "fr", label: "프랑스어" },
  { value: "es", label: "스페인어" },
  { value: "it", label: "이탈리아어" },
  { value: "pt", label: "포르투갈어" },
  { value: "ru", label: "러시아어" },
  { value: "ar", label: "아랍어" },
  { value: "hi", label: "힌디어" },
  { value: "id", label: "인도네시아어" },
  { value: "ms", label: "말레이어" },
  { value: "th", label: "태국어" },
  { value: "vi", label: "베트남어" },
  { value: "tr", label: "터키어" },
  { value: "nl", label: "네덜란드어" },
  { value: "sv", label: "스웨덴어" },
  { value: "no", label: "노르웨이어" },
  { value: "fi", label: "핀란드어" },
  { value: "da", label: "덴마크어" },
  { value: "pl", label: "폴란드어" },
  { value: "cs", label: "체코어" },
  { value: "uk", label: "우크라이나어" }
] as const;

export type NewsDataLanguage = (typeof NEWSDATA_LANGUAGES)[number]["value"];

/**
 * Fetch worker job data
 */
export interface FetchJobData {
  fetchJobId: number;
  source: ArticleSource;
  query: NewsDataFetchQuery | Record<string, unknown>;
}
