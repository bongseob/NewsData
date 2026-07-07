"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NEWSDATA_CATEGORIES,
  NEWSDATA_CATEGORY_LABELS,
  NEWSDATA_COUNTRIES,
  NEWSDATA_LANGUAGES,
  NEWSDATA_PRIORITY_DOMAIN_LABELS,
  NEWSDATA_PRIORITY_DOMAINS,
  type NewsDataCategory,
  type NewsDataCountry,
  type NewsDataLanguage,
  type NewsDataPriorityDomain,
  type NewsDataSource
} from "@newsdata/shared";
import { API_BASE } from "../../lib/api-base";
import {
  DEFAULT_FORM,
  EMPTY_FORM,
  formToQuery,
  isSameForm,
  queryToForm,
  type FetchFormState,
  type FetchRangeMode
} from "./fetch-form";

interface FetchJob {
  id: number;
  source: string;
  trigger_type: string;
  status: string;
  request_payload: unknown | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

interface FetchJobsResponse {
  items: FetchJob[];
  total: number;
}

const statusLabels: Record<string, string> = {
  PREPARED: "준비됨",
  PENDING: "대기",
  RUNNING: "진행 중",
  SUCCEEDED: "성공",
  FAILED: "실패",
  RETRYING: "재시도",
  CANCELED: "취소"
};

const MAX_COMMA_VALUES = 5;

const RECENT_SEARCH_KEY_PREFIX = "manual-fetch:recent-search:";
const MAX_RECENT_SEARCHES = 8;

// GDELT는 5초당 1요청 제한이 있고 Reuters도 같은 엔드포인트를 공유한다.
// 여유를 두어 큐 제출을 5초간 막는다.
const GDELT_COOLDOWN_MS = 5000;

// GDELT 계열(엔드포인트 공유) 여부.
function isGdeltFamilySource(source: SourceTab): boolean {
  return source === "gdelt" || source === "reuters";
}

// 워커가 GDELT rate limit(429)·차단으로 실패시킨 잡인지 판별.
function isRateLimitError(message: string | null | undefined): boolean {
  return !!message && (message.includes("rate limit") || message.includes("요청 제한"));
}

function recentSearchKey(sourceParam: string): string {
  return `${RECENT_SEARCH_KEY_PREFIX}${sourceParam}`;
}

function readRecentSearches(sourceParam: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(recentSearchKey(sourceParam));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(sourceParam: string, terms: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(recentSearchKey(sourceParam), JSON.stringify(terms));
  } catch {
    // 저장 실패(용량 초과·프라이빗 모드 등)는 조용히 무시한다.
  }
}

// 최근 검색어 칩 목록. 클릭하면 검색어 입력을 채운다.
function RecentSearches({
  items,
  onPick,
  onClear
}: {
  items: string[];
  onPick: (term: string) => void;
  onClear: () => void;
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-ink-500">최근 검색어</span>
      {items.map((term) => (
        <button
          key={term}
          type="button"
          onClick={() => onPick(term)}
          className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs text-ink-700 hover:bg-slate-100"
        >
          {term}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 text-xs font-semibold text-red-600 hover:underline"
      >
        지우기
      </button>
    </div>
  );
}

function parseCommaValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinSelectedValues(values: readonly string[]): string {
  return values.join(",");
}

// NewsData.io domainurl은 프로토콜/경로/`www.` 없는 순수 호스트만 허용한다.
// (예: "https://www.bbc.com/news" → "bbc.com")
function normalizeDomainHost(value: string): string {
  let host = value.trim();
  if (!host) return "";
  host = host.replace(/^[a-z]+:\/\//i, "");
  host = host.split("/")[0].split("?")[0];
  host = host.replace(/^www\./i, "");
  return host.trim().toLowerCase();
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function compactPayload(payload: unknown): string {
  if (!payload) return "-";
  const parsed = typeof payload === "string" ? safeParse(payload) : payload;
  if (!parsed || typeof parsed !== "object") return String(payload);

  const entries = Object.entries(parsed as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.length > 0 ? entries.join(", ") : "-";
}

type SourceTab = "newsdata" | "sec" | "fed" | "gdelt" | "reuters" | "guardian";

const SOURCE_TABS: { key: SourceTab; label: string; disabled?: boolean }[] = [
  { key: "newsdata", label: "NewsData.io" },
  { key: "sec", label: "SEC" },
  { key: "fed", label: "Federal Reserve" },
  { key: "gdelt", label: "GDELT" },
  { key: "reuters", label: "Reuters" },
  { key: "guardian", label: "The Guardian" }
];

const SOURCE_PARAM_BY_TAB: Record<SourceTab, string> = {
  newsdata: "NEWSDATA",
  sec: "SEC",
  fed: "FED",
  gdelt: "GDELT",
  reuters: "REUTERS",
  guardian: "GUARDIAN"
};

const FEED_SOURCES: SourceTab[] = ["sec", "fed"];

interface FetchPreset {
  id: number;
  name: string;
  source: string;
  query: Record<string, unknown>;
  created_at: string;
}

export function ManualFetchManager(): JSX.Element {
  const [activeSource, setActiveSource] = useState<SourceTab>("newsdata");
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<NewsDataCategory[]>([]);
  const [countries, setCountries] = useState<NewsDataCountry[]>(["us"]);
  const [languages, setLanguages] = useState<NewsDataLanguage[]>(["en"]);
  const [fetchRange, setFetchRange] = useState<FetchRangeMode>("latest");
  const [countryToAdd, setCountryToAdd] = useState<"" | NewsDataCountry>("");
  const [languageToAdd, setLanguageToAdd] = useState<"" | NewsDataLanguage>("");
  const [domainUrl, setDomainUrl] = useState("");
  const [domainUrlToAdd, setDomainUrlToAdd] = useState("");
  const [priorityDomain, setPriorityDomain] = useState<"" | NewsDataPriorityDomain>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [domain, setDomain] = useState("");
  const [availableSources, setAvailableSources] = useState<NewsDataSource[]>([]);
  const [sourceToAdd, setSourceToAdd] = useState("");
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceLabels, setSourceLabels] = useState<Record<string, string>>({});
  const [size, setSize] = useState("10");
  const [removeDuplicate, setRemoveDuplicate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<FetchJob[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  // 프리셋 관련 React 상태 추가
  const [presets, setPresets] = useState<FetchPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | "">("");
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState(false);

  // 키워드 검색 소스(GDELT/Reuters/Guardian)용 상태
  const [keywordQ, setKeywordQ] = useState("");
  const [keywordCount, setKeywordCount] = useState("50");

  // 소스별 최근 검색어 (localStorage 기반)
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // GDELT/Reuters 큐 제출 쿨다운 (rate limit 예방). 쿨다운 종료 epoch(ms).
  const [gdeltCooldownUntil, setGdeltCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // 수정 모드 관련 React 상태 추가
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [submittingSubmitId, setSubmittingSubmitId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const countryString = useMemo(() => joinSelectedValues(countries), [countries]);
  const languageString = useMemo(() => joinSelectedValues(languages), [languages]);

  const sourceParam = SOURCE_PARAM_BY_TAB[activeSource];

  // 개별 입력 상태를 단일 폼 모델로 읽어낸다 (제출·수정·프리셋 저장 공통 입력).
  const readForm = useCallback(
    (): FetchFormState => ({
      q,
      categories,
      countries,
      languages,
      fetchRange,
      fromDate,
      toDate,
      domainUrl,
      priorityDomain,
      domain,
      size,
      removeDuplicate
    }),
    [
      q,
      categories,
      countries,
      languages,
      fetchRange,
      fromDate,
      toDate,
      domainUrl,
      priorityDomain,
      domain,
      size,
      removeDuplicate
    ]
  );

  // 폼 모델을 개별 입력 상태에 일괄 반영한다 (프리셋 불러오기·작업 수정 공통).
  const applyForm = useCallback((form: FetchFormState) => {
    setQ(form.q);
    setCategories(form.categories);
    setCountries(form.countries);
    setLanguages(form.languages);
    setFetchRange(form.fetchRange);
    setFromDate(form.fromDate);
    setToDate(form.toDate);
    setDomainUrl(form.domainUrl);
    setDomainUrlToAdd("");
    setPriorityDomain(form.priorityDomain);
    setDomain(form.domain);
    setSourceToAdd("");
    setSize(form.size);
    setRemoveDuplicate(form.removeDuplicate);
  }, []);

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    setPresetsError(false);
    try {
      const res = await fetch(`${API_BASE}/jobs/presets?source=${sourceParam}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        setPresetsError(true);
        return;
      }
      const data = await res.json();
      setPresets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load presets:", error);
      setPresetsError(true);
    } finally {
      setPresetsLoading(false);
    }
  }, [sourceParam]);

  const loadJobs = useCallback(async () => {
    const res = await fetch(`${API_BASE}/jobs/fetch?source=${sourceParam}&limit=10`, {
      cache: "no-store"
    });
    if (!res.ok) return;

    const data = (await res.json()) as FetchJobsResponse;
    setJobs(data.items ?? []);
    setTotal(data.total ?? 0);
  }, [sourceParam]);

  const selectedPreset = useMemo(
    () =>
      selectedPresetId === ""
        ? null
        : presets.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId, presets]
  );

  // 선택된 프리셋 대비 폼이 수정되었는지 (덮어쓰기 버튼/뱃지 노출용).
  const isPresetDirty = useMemo(
    () =>
      selectedPreset !== null &&
      !isSameForm(readForm(), queryToForm(selectedPreset.query)),
    [selectedPreset, readForm]
  );

  // 수정 취소 및 입력값 초기화
  const cancelEditMode = useCallback(() => {
    setEditingJobId(null);
    setMessage(null);
    applyForm(EMPTY_FORM);
  }, [applyForm]);

  // 큐 최종 제출 요청
  const submitJob = async (id: number) => {
    setSubmittingSubmitId(id);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/jobs/fetch/${id}/submit`, {
        method: "POST"
      });
      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`큐 제출 실패: ${errorText}`);
        return;
      }
      setMessage(`작업 #${id}이(가) 수집 대기열(Queue)에 성공적으로 제출되었습니다.`);
      // GDELT/Reuters는 5초당 1요청 제한 → 다음 큐 제출을 잠시 막는다.
      if (isGdeltFamilySource(activeSource)) {
        setGdeltCooldownUntil(Date.now() + GDELT_COOLDOWN_MS);
      }
      await loadJobs();
    } catch {
      setMessage("큐 제출 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmittingSubmitId(null);
    }
  };

  // 실패한 작업을 같은 조건으로 재등록 후 즉시 큐 제출한다.
  // (백엔드는 FAILED 잡의 재제출을 허용하지 않으므로 새 잡을 만든다.)
  const retryJob = async (job: FetchJob) => {
    setRetryingId(job.id);
    setMessage(null);

    const payload =
      typeof job.request_payload === "string"
        ? safeParse(job.request_payload)
        : job.request_payload;
    const query =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

    try {
      const createRes = await fetch(`${API_BASE}/jobs/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: job.source, query })
      });
      if (!createRes.ok) {
        const errorText = await createRes.text();
        setMessage(`재시도 등록 실패: ${errorText}`);
        return;
      }
      const created = await createRes.json();
      const newId = created.fetchJobId as number;

      const submitRes = await fetch(`${API_BASE}/jobs/fetch/${newId}/submit`, {
        method: "POST"
      });
      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        setMessage(`재시도 큐 제출 실패(작업 #${newId} 생성됨): ${errorText}`);
        await loadJobs();
        return;
      }

      setMessage(`작업 #${job.id}을(를) 새 작업 #${newId}(으)로 재시도했습니다.`);
      // GDELT/Reuters는 5초당 1요청 제한 → 다음 제출/재시도를 잠시 막는다.
      if (isGdeltFamilySource(activeSource)) {
        setGdeltCooldownUntil(Date.now() + GDELT_COOLDOWN_MS);
      }
      await loadJobs();
    } catch {
      setMessage("재시도 처리 중 오류가 발생했습니다.");
    } finally {
      setRetryingId(null);
    }
  };

  // 수정 모드 진입 (기존 페이로드 폼 바인딩)
  const startEditJob = (job: FetchJob) => {
    setEditingJobId(job.id);
    setSelectedPresetId("");
    setMessage(null);
    applyForm(queryToForm(job.request_payload));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 수정된 내용 백엔드 PATCH 전송
  const saveEditJob = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingJobId) return;

    setSubmitting(true);
    setMessage(null);

    const query = formToQuery(readForm());

    try {
      const res = await fetch(`${API_BASE}/jobs/fetch/${editingJobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`수집 설정 수정 실패: ${errorText}`);
        return;
      }

      setMessage(`작업 #${editingJobId}의 수집 설정이 성공적으로 업데이트되었습니다.`);
      cancelEditMode();
      await loadJobs();
    } catch {
      setMessage("수정 사항 저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void loadJobs();
    void loadPresets();
  }, [loadJobs, loadPresets]);

  // 소스 전환 시 해당 소스의 최근 검색어를 불러온다.
  useEffect(() => {
    setRecentSearches(readRecentSearches(sourceParam));
  }, [sourceParam]);

  // 쿨다운이 진행 중일 때만 카운트다운을 위해 현재 시각을 갱신한다.
  useEffect(() => {
    if (gdeltCooldownUntil <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= gdeltCooldownUntil) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [gdeltCooldownUntil]);

  const isGdeltFamily = isGdeltFamilySource(activeSource);
  const gdeltCooldownRemaining = isGdeltFamily
    ? Math.max(0, Math.ceil((gdeltCooldownUntil - now) / 1000))
    : 0;

  // 검색 성공 시 현재 소스의 최근 검색어에 추가(중복 제거, 최신순, 최대 개수 제한).
  const addRecentSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      setRecentSearches((current) => {
        const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(
          0,
          MAX_RECENT_SEARCHES
        );
        writeRecentSearches(sourceParam, next);
        return next;
      });
    },
    [sourceParam]
  );

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    writeRecentSearches(sourceParam, []);
  }, [sourceParam]);

  // 프리셋 선택 적용 핸들러
  const handleSelectPreset = (presetId: number | "") => {
    // 수정 모드 중에는 프리셋으로 폼을 덮어쓰지 않는다.
    if (editingJobId !== null) return;

    setSelectedPresetId(presetId);
    setMessage(null);

    if (presetId === "") {
      applyForm(EMPTY_FORM);
      return;
    }

    const targetPreset = presets.find((p) => p.id === presetId);
    if (!targetPreset) return;

    applyForm(queryToForm(targetPreset.query));
  };

  // 프리셋 등록 핸들러
  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setMessage("프리셋 이름을 입력해 주세요.");
      return;
    }
    setSavingPreset(true);
    setMessage(null);

    const query = formToQuery(readForm());
    const name = presetName.trim();

    try {
      const res = await fetch(`${API_BASE}/jobs/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          source: sourceParam,
          query
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`프리셋 저장 실패: ${errorText}`);
        return;
      }

      const newId = (await res.json()) as number;
      setMessage(`프리셋 "${name}" 저장 완료`);
      setPresetName("");
      await loadPresets();
      // 방금 저장한 프리셋을 선택 상태로 (수정 모드가 아닐 때만)
      if (editingJobId === null && typeof newId === "number") {
        setSelectedPresetId(newId);
      }
    } catch {
      setMessage("프리셋 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingPreset(false);
    }
  };

  // 선택된 프리셋을 현재 폼 내용으로 덮어쓰기(수정)
  const handleUpdatePreset = async () => {
    if (selectedPresetId === "") return;
    const target = presets.find((p) => p.id === selectedPresetId);
    if (!target) return;

    setSavingPreset(true);
    setMessage(null);

    const query = formToQuery(readForm());

    try {
      const res = await fetch(`${API_BASE}/jobs/presets/${selectedPresetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: target.name, query })
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`프리셋 수정 실패: ${errorText}`);
        return;
      }

      setMessage(`프리셋 "${target.name}" 수정 완료`);
      await loadPresets();
    } catch {
      setMessage("프리셋 수정 중 오류가 발생했습니다.");
    } finally {
      setSavingPreset(false);
    }
  };

  // 프리셋 삭제 핸들러
  const handleDeletePreset = async (id: number) => {
    const confirmed = window.confirm("이 프리셋을 삭제할까요?");
    if (!confirmed) return;

    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/jobs/presets/${id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`프리셋 삭제 실패: ${errorText}`);
        return;
      }

      setMessage("프리셋 삭제 완료");
      if (selectedPresetId === id) {
        setSelectedPresetId("");
      }
      await loadPresets();
    } catch {
      setMessage("프리셋 삭제 중 오류가 발생했습니다.");
    }
  };

  const toggleCategory = (category: NewsDataCategory) => {
    setMessage(null);
    setCategories((current) => {
      if (current.includes(category)) {
        return current.filter((item) => item !== category);
      }
      if (current.length >= MAX_COMMA_VALUES) {
        setMessage(`카테고리는 최대 ${MAX_COMMA_VALUES}개까지 선택할 수 있습니다.`);
        return current;
      }
      return [...current, category];
    });
  };

  const addCountry = () => {
    if (!countryToAdd) return;
    setMessage(null);
    setCountries((current) => {
      if (current.includes(countryToAdd)) {
        setMessage("이미 선택된 국가입니다.");
        return current;
      }
      if (current.length >= MAX_COMMA_VALUES) {
        setMessage(`국가는 최대 ${MAX_COMMA_VALUES}개까지 선택할 수 있습니다.`);
        return current;
      }
      return [...current, countryToAdd];
    });
    setCountryToAdd("");
  };

  const addLanguage = () => {
    if (!languageToAdd) return;
    setMessage(null);
    setLanguages((current) => {
      if (current.includes(languageToAdd)) {
        setMessage("이미 선택된 언어입니다.");
        return current;
      }
      if (current.length >= MAX_COMMA_VALUES) {
        setMessage(`언어는 최대 ${MAX_COMMA_VALUES}개까지 선택할 수 있습니다.`);
        return current;
      }
      return [...current, languageToAdd];
    });
    setLanguageToAdd("");
  };

  const addDomainUrl = () => {
    // NewsData.io domainurl은 프로토콜/경로 없는 순수 도메인(예: bbc.com)만 허용한다.
    const value = normalizeDomainHost(domainUrlToAdd);
    if (!value) return;
    setMessage(null);
    const current = parseCommaValues(domainUrl);
    if (current.includes(value)) {
      setMessage("이미 추가된 도메인 URL입니다.");
      return;
    }
    if (current.length >= MAX_COMMA_VALUES) {
      setMessage(`도메인 URL은 최대 ${MAX_COMMA_VALUES}개까지 추가할 수 있습니다.`);
      return;
    }
    setDomainUrl([...current, value].join(","));
    setDomainUrlToAdd("");
  };

  const removeDomainUrl = (value: string) => {
    setMessage(null);
    setDomainUrl(parseCommaValues(domainUrl).filter((item) => item !== value).join(","));
  };

  const loadSources = async () => {
    setMessage(null);
    setLoadingSources(true);
    try {
      const params = new URLSearchParams();
      if (countries[0]) params.set("country", countries[0]);
      if (categories[0]) params.set("category", categories[0]);
      if (languages[0]) params.set("language", languages[0]);
      if (priorityDomain) params.set("prioritydomain", priorityDomain);

      const res = await fetch(`${API_BASE}/newsdata/sources?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        setMessage(`소스 목록을 불러오지 못했습니다: ${text || res.status}`);
        return;
      }
      const sources = (await res.json()) as NewsDataSource[];
      setAvailableSources(sources);
      if (sources.length === 0) {
        setMessage("선택한 조건에 해당하는 소스가 없습니다. 국가/카테고리/언어를 조정해 보세요.");
      }
    } catch {
      setMessage("소스 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoadingSources(false);
    }
  };

  const addSource = () => {
    if (!sourceToAdd) return;
    setMessage(null);
    const current = parseCommaValues(domain);
    if (current.includes(sourceToAdd)) {
      setMessage("이미 추가된 소스입니다.");
      return;
    }
    if (current.length >= MAX_COMMA_VALUES) {
      setMessage(`도메인(소스)은 최대 ${MAX_COMMA_VALUES}개까지 추가할 수 있습니다.`);
      return;
    }
    const picked = availableSources.find((item) => item.id === sourceToAdd);
    if (picked) {
      setSourceLabels((prev) => ({
        ...prev,
        [picked.id]: picked.name || picked.id
      }));
    }
    setDomain([...current, sourceToAdd].join(","));
    setSourceToAdd("");
  };

  const removeDomain = (value: string) => {
    setMessage(null);
    setDomain(parseCommaValues(domain).filter((item) => item !== value).join(","));
  };

  const validateCommaInput = (label: string, value: string): boolean => {
    const values = parseCommaValues(value);
    if (values.length > MAX_COMMA_VALUES) {
      setMessage(`${label}은 쉼표로 구분해 최대 ${MAX_COMMA_VALUES}개까지 입력할 수 있습니다.`);
      return false;
    }
    if (new Set(values).size !== values.length) {
      setMessage(`${label}에 중복 값이 있습니다.`);
      return false;
    }
    return true;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    if (!validateCommaInput("도메인 URL", domainUrl)) {
      setSubmitting(false);
      return;
    }

    if (domain.trim() && parseCommaValues(domainUrl).length > 0) {
      setMessage(
        "도메인과 도메인 URL은 함께 사용할 수 없습니다. 둘 중 하나만 입력해 주세요."
      );
      setSubmitting(false);
      return;
    }

    if (fetchRange === "archive" && (!fromDate || !toDate)) {
      setMessage("기간 검색은 시작일과 종료일을 모두 입력해야 합니다.");
      setSubmitting(false);
      return;
    }

    const query = formToQuery(readForm());

    try {
      const res = await fetch(`${API_BASE}/jobs/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceParam, query })
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`수집 요청 실패: ${errorText}`);
        return;
      }

      const data = await res.json();
      setMessage(`수집 작업 #${data.fetchJobId} 등록 완료`);
      addRecentSearch(q);
      await loadJobs();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // 피드 소스(SEC/Fed)는 폼 입력 없이 설정된 RSS에서 수집한다.
  const submitFeedFetch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/jobs/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceParam, query: {} })
      });
      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`수집 요청 실패: ${errorText}`);
        return;
      }
      const data = await res.json();
      setMessage(`수집 작업 #${data.fetchJobId} 등록 완료`);
      await loadJobs();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // 키워드 검색 소스(GDELT/Reuters/Guardian) 수집 요청
  const submitKeywordFetch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const query: Record<string, unknown> = {};
    const q = keywordQ.trim();
    if (q) query.q = q;
    const count = Number(keywordCount) || 50;
    if (activeSource === "guardian") query.pageSize = count;
    else query.maxrecords = count;

    if (!q && activeSource !== "reuters") {
      setMessage("검색어를 입력해 주세요.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/jobs/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceParam, query })
      });
      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`수집 요청 실패: ${errorText}`);
        return;
      }
      const data = await res.json();
      setMessage(`수집 작업 #${data.fetchJobId} 등록 완료`);
      if (q) addRecentSearch(q);
      await loadJobs();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelJob = async (id: number) => {
    const confirmed = window.confirm(`대기 중인 수집 작업 #${id}을 취소할까요?`);
    if (!confirmed) return;

    setCancelingId(id);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/jobs/fetch/${id}/cancel`, {
        method: "POST"
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessage(`취소 실패: ${errorText}`);
        return;
      }

      setMessage(`수집 작업 #${id} 취소 완료`);
      await loadJobs();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            disabled={tab.disabled}
            onClick={() => setActiveSource(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
              tab.key === activeSource
                ? "bg-[#1167b1] text-white"
                : tab.disabled
                  ? "cursor-not-allowed border border-line bg-slate-50 text-ink-300"
                  : "border border-line bg-white text-ink-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
            {tab.disabled && (
              <span className="rounded-full bg-ink-200 px-2 py-0.5 text-[10px] font-bold text-ink-500">
                준비 중
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[520px_1fr]">
        {activeSource === "newsdata" ? (
          <form
        onSubmit={editingJobId !== null ? saveEditJob : submit}
        className="rounded-lg border border-line bg-white p-6 shadow-panel"
      >
        <h3 className="text-base font-bold">NewsData.io 수동 수집</h3>

        {/* 수정 모드 알림 배너 */}
        {editingJobId !== null && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex justify-between items-center shadow-sm">
            <span>⚠️ <strong>작업 #{editingJobId}</strong>의 수집 설정을 편집하고 있습니다. (미제출 상태)</span>
            <button
              type="button"
              onClick={cancelEditMode}
              className="text-xs font-bold text-amber-900 underline hover:no-underline"
            >
              편집 취소
            </button>
          </div>
        )}

        {/* 프리셋 컨트롤 패널 (수정 모드에서는 숨김) */}
        {editingJobId === null && (
          <div className="mt-4 rounded-md border border-dashed border-line bg-slate-50 p-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <span className="flex items-center gap-2 text-xs font-bold text-ink-700">
                  수집 프리셋 불러오기
                  {isPresetDirty && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      수정됨
                    </span>
                  )}
                </span>
                <div className="flex gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(event) =>
                      handleSelectPreset(event.target.value === "" ? "" : Number(event.target.value))
                    }
                    disabled={presetsLoading}
                    className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink-700 disabled:bg-slate-100"
                  >
                    <option value="">
                      {presetsLoading
                        ? "프리셋 불러오는 중..."
                        : "-- 프리셋 선택 안 함 (신규 입력) --"}
                    </option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} (키워드: {String((preset.query as any)?.q || "-")})
                      </option>
                    ))}
                  </select>
                  {selectedPresetId !== "" && (
                    <>
                      <button
                        type="button"
                        disabled={savingPreset || !isPresetDirty}
                        onClick={handleUpdatePreset}
                        title={isPresetDirty ? "현재 설정으로 이 프리셋 덮어쓰기" : "변경 사항 없음"}
                        className="whitespace-nowrap rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        덮어쓰기
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(Number(selectedPresetId))}
                        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
                {presetsError && (
                  <span className="text-[11px] text-red-600">
                    프리셋 목록을 불러오지 못했습니다.{" "}
                    <button
                      type="button"
                      onClick={() => void loadPresets()}
                      className="font-semibold underline hover:no-underline"
                    >
                      다시 시도
                    </button>
                  </span>
                )}
                {!presetsLoading && !presetsError && presets.length === 0 && (
                  <span className="text-[11px] text-ink-500">
                    저장된 프리셋이 없습니다. 아래에서 현재 설정을 프리셋으로 저장할 수 있습니다.
                  </span>
                )}
              </div>

              <div className="border-t border-line border-dashed my-1"></div>

              <div className="grid gap-1.5">
                <span className="text-xs font-bold text-ink-700">현재 설정을 새 프리셋으로 저장</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="예: IT 및 AI 뉴스 수집"
                    className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={savingPreset || !presetName.trim()}
                    onClick={handleSavePreset}
                    className="whitespace-nowrap rounded-md bg-ink-800 text-white px-4 py-1.5 text-xs font-semibold hover:bg-ink-900 disabled:opacity-50"
                  >
                    {savingPreset ? "저장 중..." : "새 프리셋 저장"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-4">
          <div className="grid gap-1 text-sm">
            <label className="grid gap-1">
              <span className="font-semibold text-ink-700">검색어 q</span>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="rounded-md border border-line px-3 py-2"
                placeholder="예: AI, 반도체, 증권"
              />
            </label>
            <RecentSearches
              items={recentSearches}
              onPick={(term) => setQ(term)}
              onClear={clearRecentSearches}
            />
          </div>

          <fieldset className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-ink-700">
                카테고리
              </legend>
              <span className="text-xs text-ink-500">
                {categories.length}/{MAX_COMMA_VALUES} 선택
              </span>
            </div>
            <div className="grid max-h-64 gap-2 overflow-auto rounded-md border border-line p-3 sm:grid-cols-2">
              {NEWSDATA_CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={categories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="font-semibold text-ink-700">
                      {category}
                    </span>
                    <span className="ml-1 text-xs text-ink-500">
                      {NEWSDATA_CATEGORY_LABELS[category]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-500">
              선택한 카테고리는 쉼표로 연결해 NewsData.io API에 전달합니다.
            </p>
          </fieldset>

          <fieldset className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-ink-700">국가</legend>
              <span className="text-xs text-ink-500">
                {countries.length}/{MAX_COMMA_VALUES} 선택
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={countryToAdd}
                onChange={(event) =>
                  setCountryToAdd(event.target.value as "" | NewsDataCountry)
                }
                className="rounded-md border border-line px-3 py-2 text-sm"
              >
                <option value="">국가 선택</option>
                {NEWSDATA_COUNTRIES.map((country) => (
                  <option
                    key={country.value}
                    value={country.value}
                    disabled={countries.includes(country.value)}
                  >
                    {country.label} ({country.value})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addCountry}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
              >
                추가
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {countries.length === 0 ? (
                <span className="text-xs text-ink-500">선택된 국가가 없습니다.</span>
              ) : (
                countries.map((country) => (
                  <span
                    key={country}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700"
                  >
                    {country}
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2">
              <span className="text-xs text-ink-500">생성 문자열: {countryString || "-"}</span>
              <button
                type="button"
                onClick={() => {
                  setCountries([]);
                  setCountryToAdd("");
                }}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                국가 초기화
              </button>
            </div>
          </fieldset>

          <fieldset className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-ink-700">언어</legend>
              <span className="text-xs text-ink-500">
                {languages.length}/{MAX_COMMA_VALUES} 선택
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={languageToAdd}
                onChange={(event) =>
                  setLanguageToAdd(event.target.value as "" | NewsDataLanguage)
                }
                className="rounded-md border border-line px-3 py-2 text-sm"
              >
                <option value="">언어 선택</option>
                {NEWSDATA_LANGUAGES.map((language) => (
                  <option
                    key={language.value}
                    value={language.value}
                    disabled={languages.includes(language.value)}
                  >
                    {language.label} ({language.value})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLanguage}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
              >
                추가
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {languages.length === 0 ? (
                <span className="text-xs text-ink-500">선택된 언어가 없습니다.</span>
              ) : (
                languages.map((language) => (
                  <span
                    key={language}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700"
                  >
                    {language}
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2">
              <span className="text-xs text-ink-500">생성 문자열: {languageString || "-"}</span>
              <button
                type="button"
                onClick={() => {
                  setLanguages([]);
                  setLanguageToAdd("");
                }}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                언어 초기화
              </button>
            </div>
          </fieldset>

          <fieldset className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-ink-700">도메인 URL</legend>
              <span className="text-xs text-ink-500">
                {parseCommaValues(domainUrl).length}/{MAX_COMMA_VALUES}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              프로토콜 없이 순수 도메인만 입력합니다(예: bbc.com). 붙여넣은 URL은 자동으로 정리됩니다.
              NewsData.io가 색인한 도메인만 유효합니다.
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={domainUrlToAdd}
                onChange={(event) => setDomainUrlToAdd(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDomainUrl();
                  }
                }}
                disabled={domain.trim().length > 0}
                className="min-w-0 rounded-md border border-line px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                placeholder="bbc.com"
              />
              <button
                type="button"
                onClick={addDomainUrl}
                disabled={domain.trim().length > 0}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-ink-400"
              >
                추가
              </button>
            </div>
            {domain.trim().length > 0 && (
              <span className="text-xs text-amber-700">
                도메인을 입력하면 도메인 URL은 사용할 수 없습니다. (NewsData.io는 둘 중 하나만 허용)
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {parseCommaValues(domainUrl).length === 0 ? (
                <span className="text-xs text-ink-500">추가된 도메인 URL이 없습니다.</span>
              ) : (
                parseCommaValues(domainUrl).map((url) => (
                  <span
                    key={url}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700"
                  >
                    {url}
                    <button
                      type="button"
                      onClick={() => removeDomainUrl(url)}
                      className="text-ink-500 hover:text-red-700"
                      aria-label={`${url} 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2">
              <span className="min-w-0 break-all text-xs text-ink-500">
                생성 문자열: {domainUrl || "-"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDomainUrl("");
                  setDomainUrlToAdd("");
                }}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                도메인 URL 초기화
              </button>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-ink-700">우선순위 도메인</span>
              <select
                value={priorityDomain}
                onChange={(event) =>
                  setPriorityDomain(event.target.value as "" | NewsDataPriorityDomain)
                }
                className="rounded-md border border-line px-3 py-2"
              >
                <option value="">전체</option>
                {NEWSDATA_PRIORITY_DOMAINS.map((value) => (
                  <option key={value} value={value}>
                    {value} - {NEWSDATA_PRIORITY_DOMAIN_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-ink-700">수집 건수</span>
              <input
                type="number"
                min={1}
                max={50}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="rounded-md border border-line px-3 py-2"
              />
            </label>
          </div>

          <fieldset className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-ink-700">도메인(뉴스 소스)</legend>
              <span className="text-xs text-ink-500">
                {parseCommaValues(domain).length}/{MAX_COMMA_VALUES}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              위에서 선택한 국가/카테고리/언어 기준으로 NewsData.io가 색인한 소스를 불러온 뒤
              골라 담습니다. 직접 입력이 아니라 목록에서 선택해야 유효합니다.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadSources}
                disabled={loadingSources || parseCommaValues(domainUrl).length > 0}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-ink-400"
              >
                {loadingSources ? "불러오는 중…" : "소스 불러오기"}
              </button>
              {availableSources.length > 0 && (
                <span className="text-xs text-ink-500">{availableSources.length}개 소스</span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={sourceToAdd}
                onChange={(event) => setSourceToAdd(event.target.value)}
                disabled={availableSources.length === 0 || parseCommaValues(domainUrl).length > 0}
                className="min-w-0 rounded-md border border-line px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {availableSources.length === 0 ? "먼저 소스를 불러오세요" : "소스 선택"}
                </option>
                {availableSources.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={parseCommaValues(domain).includes(item.id)}
                  >
                    {item.name || item.id} ({item.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addSource}
                disabled={!sourceToAdd || parseCommaValues(domainUrl).length > 0}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-ink-400"
              >
                추가
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {parseCommaValues(domain).length === 0 ? (
                <span className="text-xs text-ink-500">추가된 소스가 없습니다.</span>
              ) : (
                parseCommaValues(domain).map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700"
                  >
                    {sourceLabels[id] ? `${sourceLabels[id]} (${id})` : id}
                    <button
                      type="button"
                      onClick={() => removeDomain(id)}
                      className="text-ink-500 hover:text-red-700"
                      aria-label={`${id} 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2">
              <span className="min-w-0 break-all text-xs text-ink-500">
                생성 문자열: {domain || "-"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDomain("");
                  setSourceToAdd("");
                }}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                도메인 초기화
              </button>
            </div>
            {parseCommaValues(domainUrl).length > 0 && (
              <span className="text-xs text-amber-700">
                도메인 URL을 추가하면 도메인은 사용할 수 없습니다. (NewsData.io는 둘 중 하나만 허용)
              </span>
            )}
          </fieldset>

          <fieldset className="grid gap-3 rounded-md border border-line p-3">
            <legend className="text-sm font-semibold text-ink-700">수집 범위</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setFetchRange("latest");
                  setFromDate("");
                  setToDate("");
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  fetchRange === "latest"
                    ? "bg-[#1167b1] text-white"
                    : "border border-line bg-white text-ink-700 hover:bg-slate-50"
                }`}
              >
                최신 뉴스
              </button>
              <button
                type="button"
                onClick={() => setFetchRange("archive")}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  fetchRange === "archive"
                    ? "bg-[#1167b1] text-white"
                    : "border border-line bg-white text-ink-700 hover:bg-slate-50"
                }`}
              >
                기간 검색
              </button>
            </div>
            <p className="text-xs text-ink-500">
              최신 뉴스는 날짜 없이 최신 뉴스 endpoint를 사용합니다. 기간 검색은 날짜를 입력하고 archive endpoint를 사용합니다.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-ink-700">시작일</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  disabled={fetchRange === "latest"}
                  className="rounded-md border border-line px-3 py-2 disabled:bg-slate-100 disabled:text-ink-300"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-ink-700">종료일</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  disabled={fetchRange === "latest"}
                  className="rounded-md border border-line px-3 py-2 disabled:bg-slate-100 disabled:text-ink-300"
                />
              </label>
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={removeDuplicate}
              onChange={(event) => setRemoveDuplicate(event.target.checked)}
              className="h-4 w-4"
            />
            NewsData.io 중복 제거 요청
          </label>
        </div>

        {message && (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-ink-700">
            {message}
          </p>
        )}

        {editingJobId !== null ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={cancelEditMode}
              className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
            >
              수정 취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? "설정 저장 중..." : "설정 수정 완료"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:opacity-50"
          >
            {submitting ? "수집 요청 중..." : "수집 작업 등록"}
          </button>
        )}
      </form>
        ) : FEED_SOURCES.includes(activeSource) ? (
          <form
            onSubmit={submitFeedFetch}
            className="rounded-lg border border-line bg-white p-6 shadow-panel"
          >
            <h3 className="text-base font-bold">
              {activeSource === "sec"
                ? "SEC 보도자료 수집"
                : "Federal Reserve 보도자료 수집"}
            </h3>
            <p className="mt-3 text-sm text-ink-500">
              설정된 공식 RSS 피드에서 최신 보도자료를 수집합니다. 미국 정부 자료(퍼블릭
              도메인)로 전문 번역 발행이 가능합니다.
            </p>
            {message && (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-ink-700">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:opacity-50"
            >
              {submitting ? "수집 요청 중..." : "수집 작업 등록"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={submitKeywordFetch}
            className="rounded-lg border border-line bg-white p-6 shadow-panel"
          >
            <h3 className="text-base font-bold">
              {SOURCE_TABS.find((t) => t.key === activeSource)?.label} 키워드 수집
            </h3>
            <p className="mt-3 text-sm text-ink-500">
              {activeSource === "reuters"
                ? "GDELT를 통해 Reuters(reuters.com) 기사를 검색해 수집합니다. 검색어는 선택입니다."
                : activeSource === "gdelt"
                  ? "GDELT 글로벌 뉴스 색인에서 키워드로 최신 기사를 검색해 수집합니다."
                  : "The Guardian Open Platform에서 키워드로 기사를 검색해 수집합니다(본문 제공)."}
              {activeSource === "guardian" && " GUARDIAN_API_KEY 필요."}
            </p>
            <div className="mt-5 grid gap-1 text-sm">
              <label className="grid gap-1">
                <span className="font-semibold text-ink-700">
                  검색어 q{activeSource === "reuters" ? " (선택)" : ""}
                </span>
                <input
                  value={keywordQ}
                  onChange={(event) => setKeywordQ(event.target.value)}
                  className="rounded-md border border-line px-3 py-2"
                  placeholder="예: artificial intelligence, tariffs"
                />
              </label>
              <RecentSearches
                items={recentSearches}
                onPick={(term) => setKeywordQ(term)}
                onClear={clearRecentSearches}
              />
            </div>
            <label className="mt-4 grid gap-1 text-sm">
              <span className="font-semibold text-ink-700">수집 건수</span>
              <input
                type="number"
                min={1}
                max={activeSource === "guardian" ? 200 : 250}
                value={keywordCount}
                onChange={(event) => setKeywordCount(event.target.value)}
                className="rounded-md border border-line px-3 py-2"
              />
            </label>
            {message && (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-ink-700">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:opacity-50"
            >
              {submitting ? "수집 요청 중..." : "수집 작업 등록"}
            </button>
          </form>
        )}

      <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">최근 수집 작업</h3>
            <p className="mt-1 text-xs text-ink-500">총 {total}건</p>
          </div>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-md bg-slate-50 p-8 text-center text-sm text-ink-500">
            등록된 수집 작업이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">조건</th>
                  <th className="px-4 py-3 font-semibold">생성 시간</th>
                  <th className="px-4 py-3 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-500">
                      #{job.id}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                        {statusLabels[job.status] ?? job.status}
                      </span>
                      {job.error_message && (
                        <p className="mt-1 max-w-xs text-xs text-red-600">
                          {job.error_message}
                        </p>
                      )}
                      {isRateLimitError(job.error_message) && (
                        <p className="mt-1 max-w-xs rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          GDELT는 5초당 1회만 요청할 수 있습니다. 잠시 후 오른쪽
                          <strong> 재시도</strong> 버튼으로 다시 수집해 주세요.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {compactPayload(job.request_payload)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                      {new Date(job.created_at).toLocaleString("ko-KR")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <div className="flex gap-2">
                        {job.status === "PREPARED" ? (
                          <>
                            {activeSource === "newsdata" && (
                              <button
                                type="button"
                                onClick={() => startEditJob(job)}
                                className="rounded-md border border-amber-200 px-2.5 py-1 font-semibold text-amber-700 hover:bg-amber-50"
                              >
                                수정
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void submitJob(job.id)}
                              disabled={
                                submittingSubmitId === job.id ||
                                gdeltCooldownRemaining > 0
                              }
                              title={
                                gdeltCooldownRemaining > 0
                                  ? `GDELT는 5초당 1회만 요청할 수 있습니다. ${gdeltCooldownRemaining}초 후 다시 제출하세요.`
                                  : undefined
                              }
                              className="rounded-md bg-[#1167b1] px-2.5 py-1 font-semibold text-white hover:bg-[#0e5a9b] disabled:opacity-50"
                            >
                              {submittingSubmitId === job.id
                                ? "제출 중..."
                                : gdeltCooldownRemaining > 0
                                  ? `${gdeltCooldownRemaining}초 후 제출`
                                  : "큐 제출"}
                            </button>
                          </>
                        ) : job.status === "PENDING" ? (
                          <button
                            type="button"
                            onClick={() => void cancelJob(job.id)}
                            disabled={cancelingId === job.id}
                            className="rounded-md border border-red-200 px-2.5 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {cancelingId === job.id ? "취소 중..." : "취소"}
                          </button>
                        ) : job.status === "SUCCEEDED" ? (
                          <a
                            href={`/articles?fetchJobId=${job.id}`}
                            className="rounded-md border border-line px-2.5 py-1 font-semibold text-[#0f5f9f] hover:bg-slate-50"
                          >
                            기사 보기
                          </a>
                        ) : job.status === "FAILED" ? (
                          <button
                            type="button"
                            onClick={() => void retryJob(job)}
                            disabled={retryingId === job.id || gdeltCooldownRemaining > 0}
                            title={
                              gdeltCooldownRemaining > 0
                                ? `GDELT는 5초당 1회만 요청할 수 있습니다. ${gdeltCooldownRemaining}초 후 재시도하세요.`
                                : "같은 조건으로 새 작업을 만들어 다시 수집합니다."
                            }
                            className="rounded-md border border-[#1167b1] px-2.5 py-1 font-semibold text-[#1167b1] hover:bg-slate-50 disabled:opacity-50"
                          >
                            {retryingId === job.id
                              ? "재시도 중..."
                              : gdeltCooldownRemaining > 0
                                ? `${gdeltCooldownRemaining}초 후 재시도`
                                : "재시도"}
                          </button>
                        ) : (
                          <span className="text-ink-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
