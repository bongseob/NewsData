"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { API_BASE } from "../../lib/api-base";

export type BoardTab = "pending" | "selected" | "ready" | "excluded";

export interface BoardArticle {
  id: number;
  title: string;
  status: string;
  review_state: string;
  source: string;
  publisher_credit: string | null;
  country: string | null;
  body: string | null;
  translated_body: string | null;
  original_body: string | null;
  body_translated_at: string | null;
  updated_at: string | null;
  created_at?: string | null;
  press_time?: string | null;
  thumbnail_local_path?: string | null;
  thumbnail_source_url?: string | null;
  thumbnail_is_generated?: number | boolean | null;
  fetch_job_id?: number | null;
}

export type BoardSortColumn = "updated_at" | "created_at" | "press_time";

export interface ReviewCounts {
  pending: number;
  selected: number;
  ready: number;
  excluded: number;
  selectedTranslated: number;
  selectedUntranslated: number;
}

interface ArticleBoardProps {
  tab: BoardTab;
  items: BoardArticle[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  source: string;
  sort: BoardSortColumn;
  order: string;
  fetchJobId?: number;
  reviewCounts?: ReviewCounts;
}

const SOURCE_OPTIONS = [
  { value: "", label: "전체 출처" },
  { value: "NEWSDATA", label: "NewsData.io" },
  { value: "NEWSWIRE", label: "뉴스와이어" }
];

const SORT_OPTIONS: { value: BoardSortColumn; label: string }[] = [
  { value: "updated_at", label: "수정 시간" },
  { value: "created_at", label: "수집 시간" },
  { value: "press_time", label: "발표 시간" }
];

const TABS: { key: BoardTab; label: string }[] = [
  { key: "pending", label: "미검토" },
  { key: "selected", label: "선별됨" },
  { key: "ready", label: "발행 대상" },
  { key: "excluded", label: "제외함" }
];

type BulkAction =
  | { kind: "review"; reviewState: string; label: string; confirm: string }
  | { kind: "ready"; label: string; confirm: string }
  | { kind: "unready"; label: string; confirm: string }
  | { kind: "translate"; label: string; confirm: string };

const TAB_ACTIONS: Record<BoardTab, BulkAction[]> = {
  pending: [
    {
      kind: "review",
      reviewState: "SELECTED",
      label: "선별 채택",
      confirm: "선택한 기사를 번역·검토 대상으로 채택할까요?"
    },
    {
      kind: "review",
      reviewState: "EXCLUDED",
      label: "제외",
      confirm: "선택한 기사를 제외(숨김)할까요?"
    }
  ],
  selected: [
    {
      kind: "translate",
      label: "본문 일괄 번역",
      confirm: "선택한 기사의 본문 번역 작업을 등록할까요? OpenAI 사용량이 차감됩니다."
    },
    {
      kind: "ready",
      label: "최종 발행 대상 확정",
      confirm: "선택한 기사를 최종 발행 대상으로 확정할까요?"
    },
    {
      kind: "review",
      reviewState: "EXCLUDED",
      label: "제외",
      confirm: "선택한 기사를 제외(숨김)할까요?"
    }
  ],
  ready: [
    {
      kind: "unready",
      label: "선별 단계로 되돌리기",
      confirm: "선택한 기사를 선별 단계(DRAFT)로 되돌릴까요?"
    }
  ],
  excluded: [
    {
      kind: "review",
      reviewState: "PENDING",
      label: "복구 (미검토로)",
      confirm: "선택한 기사를 미검토 상태로 복구할까요?"
    }
  ]
};

export function ArticleBoard({
  tab,
  items,
  total,
  page,
  pageSize,
  search,
  source,
  sort,
  order,
  fetchJobId,
  reviewCounts
}: ArticleBoardProps): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchInput, setSearchInput] = useState(search);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const allSelected = items.length > 0 && selected.size === items.length;
  const actions = TAB_ACTIONS[tab];
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const idsParam = useMemo(() => Array.from(selected), [selected]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );
  };

  const buildParams = (overrides: Record<string, string | undefined> = {}) => {
    const merged = {
      tab,
      search,
      source,
      sort,
      order,
      page: String(page),
      fetchJobId: fetchJobId ? String(fetchJobId) : undefined,
      ...overrides
    };
    const params = new URLSearchParams();
    if (merged.tab) params.set("tab", merged.tab);
    if (merged.search) params.set("search", merged.search);
    if (merged.source) params.set("source", merged.source);
    if (merged.sort && merged.sort !== "updated_at") params.set("sort", merged.sort);
    if (merged.order && merged.order !== "desc") params.set("order", merged.order);
    if (merged.page && merged.page !== "1") params.set("page", merged.page);
    if (merged.fetchJobId) params.set("fetchJobId", merged.fetchJobId);
    return params;
  };

  const goTab = (key: BoardTab) => {
    router.push(`/articles?${buildParams({ tab: key, page: "1" }).toString()}`);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = searchInput.trim();
    router.push(
      `/articles?${buildParams({ search: value || undefined, page: "1" }).toString()}`
    );
  };

  const changeSource = (value: string) => {
    router.push(
      `/articles?${buildParams({ source: value || undefined, page: "1" }).toString()}`
    );
  };

  const changeSort = (value: BoardSortColumn) => {
    router.push(
      `/articles?${buildParams({ sort: value, page: "1" }).toString()}`
    );
  };

  const toggleOrder = () => {
    const next = order === "asc" ? "desc" : "asc";
    router.push(
      `/articles?${buildParams({ order: next }).toString()}`
    );
  };

  const goPage = (target: number) => {
    router.push(`/articles?${buildParams({ page: String(target) }).toString()}`);
  };

  const clearFetchJobFilter = () => {
    const params = buildParams({ page: "1" });
    params.delete("fetchJobId");
    router.push(`/articles?${params.toString()}`);
  };

  const runAction = async (action: BulkAction) => {
    if (idsParam.length === 0) {
      setMessage("선택된 기사가 없습니다.");
      return;
    }
    if (!window.confirm(action.confirm)) return;

    setBusy(true);
    setMessage(null);

    try {
      const endpointPath =
        action.kind === "ready"
          ? "mark-ready"
          : action.kind === "unready"
            ? "unmark-ready"
            : action.kind === "translate"
              ? "translate-bodies"
              : "review-state";
      const endpoint = `${API_BASE}/articles/${endpointPath}`;
      const payload =
        action.kind === "review"
          ? { ids: idsParam, reviewState: action.reviewState }
          : { ids: idsParam };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        setMessage(`작업 실패: ${text}`);
        return;
      }

      const data = (await res.json()) as {
        updated?: number;
        queued?: Array<{ articleId: number }>;
        skipped?: Array<{ articleId: number; reason: string }>;
      };
      if (action.kind === "translate") {
        setMessage(
          `번역 작업 ${data.queued?.length ?? 0}건 등록, ${data.skipped?.length ?? 0}건 제외`
        );
      } else {
        setMessage(`${data.updated ?? 0}건 처리되었습니다.`);
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-w-0 px-5 py-6 sm:px-8 lg:px-10">
      <header className="mb-5 border-b border-line pb-5">
        <p className="text-sm font-medium text-ink-500">수집 → 선별 → 번역 → 발행 대상</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">기사 큐레이션</h2>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const count = reviewCounts
            ? t.key === "pending"
              ? reviewCounts.pending
              : t.key === "selected"
                ? reviewCounts.selected
                : t.key === "ready"
                  ? reviewCounts.ready
                  : reviewCounts.excluded
            : undefined;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => goTab(t.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                t.key === tab
                  ? "bg-[#1167b1] text-white"
                  : "border border-line bg-white text-ink-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                    t.key === tab
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-ink-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={source}
            onChange={(e) => changeSource(e.target.value)}
            className="rounded-md border border-line bg-white px-2 py-1.5 text-sm text-ink-700"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value as BoardSortColumn)}
            className="rounded-md border border-line bg-white px-2 py-1.5 text-sm text-ink-700"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleOrder}
            title={order === "asc" ? "오름차순" : "내림차순"}
            className="rounded-md border border-line bg-white px-2.5 py-1.5 text-sm font-semibold text-ink-700 hover:bg-slate-50"
          >
            {order === "asc" ? "↑" : "↓"}
          </button>
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="제목/출처 검색"
              className="rounded-md border border-line px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-slate-50"
            >
              검색
            </button>
          </form>
        </div>
      </div>

      {fetchJobId && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>
            수집 작업 <strong>#{fetchJobId}</strong> 에서 수집된 기사만 표시 중입니다.
          </span>
          <button
            type="button"
            onClick={clearFetchJobFilter}
            className="whitespace-nowrap text-xs font-semibold underline hover:no-underline"
          >
            필터 해제
          </button>
        </div>
      )}

      {tab === "selected" && reviewCounts && reviewCounts.selected > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md bg-blue-50 px-4 py-2 text-xs text-blue-700">
          <span className="font-semibold">번역 현황</span>
          <span>본문 번역 완료 {reviewCounts.selectedTranslated}건</span>
          <span>·</span>
          <span>미번역 {reviewCounts.selectedUntranslated}건</span>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3 shadow-panel">
          <span className="text-sm font-medium text-ink-700">
            {selected.size}건 선택됨
          </span>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void runAction(action)}
              className="rounded-md bg-[#1167b1] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
          {message && (
            <span className="text-xs text-ink-500">{message}</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs uppercase text-ink-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                />
              </th>
              <th className="px-4 py-3 font-semibold">썸네일</th>
              <th className="px-4 py-3 font-semibold">제목</th>
              <th className="px-4 py-3 font-semibold">국가</th>
              <th className="px-4 py-3 font-semibold">번역</th>
              <th className="px-4 py-3 font-semibold">출처</th>
              <th className="px-4 py-3 font-semibold">수집</th>
              <th className="px-4 py-3 font-semibold">발표 시간</th>
              <th className="px-4 py-3 font-semibold">수정 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-500">
                  해당 단계의 기사가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((article) => (
                <tr key={article.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(article.id)}
                      onChange={() => toggle(article.id)}
                      aria-label={`${article.id} 선택`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {article.thumbnail_local_path ? (
                      <div className="relative h-12 w-12 overflow-hidden rounded bg-slate-100">
                        <img
                          src={`${API_BASE}/uploads/thumbnails/${article.thumbnail_local_path.split("/").pop()}`}
                          alt={article.title}
                          className="h-full w-full object-cover"
                        />
                        {(article.thumbnail_is_generated ||
                          article.thumbnail_source_url?.startsWith("generated:")) && (
                          <span className="absolute bottom-0 left-0 right-0 bg-violet-700/90 py-0.5 text-center text-[9px] font-bold text-white">
                            AI
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-[10px] text-ink-300">
                        N/A
                      </div>
                    )}
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <Link
                      href={`/articles/${article.id}`}
                      className="font-semibold text-[#0f5f9f] hover:underline"
                    >
                      <p className="break-words whitespace-normal leading-relaxed text-sm">{article.title}</p>
                    </Link>
                  </td>
                  <td className="max-w-[8rem] px-4 py-3">
                    {article.country ? (
                      <span className="inline-block whitespace-normal break-words rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                        {article.country}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-300">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {article.body_translated_at ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                        본문 완료
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        미번역
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                    {article.publisher_credit || "N/A"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {article.fetch_job_id ? (
                      <Link
                        href={`/articles?${buildParams({
                          fetchJobId: String(article.fetch_job_id),
                          page: "1"
                        }).toString()}`}
                        className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-[#0f5f9f] hover:bg-slate-200"
                        title="이 수집 작업의 기사만 보기"
                      >
                        #{article.fetch_job_id}
                      </Link>
                    ) : (
                      <span className="text-ink-300">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                    {article.press_time
                      ? new Date(article.press_time).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                    {article.updated_at
                      ? new Date(article.updated_at).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
        <span>
          총 {total}건 · {page}/{totalPages} 페이지
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goPage(page - 1)}
            className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            이전
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goPage(page + 1)}
            className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}
