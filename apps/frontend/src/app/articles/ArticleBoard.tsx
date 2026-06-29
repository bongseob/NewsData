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
  thumbnail_local_path?: string | null;
}

interface ArticleBoardProps {
  tab: BoardTab;
  items: BoardArticle[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
}

const TABS: { key: BoardTab; label: string }[] = [
  { key: "pending", label: "미검토" },
  { key: "selected", label: "선별됨" },
  { key: "ready", label: "발행 대상" },
  { key: "excluded", label: "제외함" }
];

type BulkAction =
  | { kind: "review"; reviewState: string; label: string; confirm: string }
  | { kind: "ready"; label: string; confirm: string }
  | { kind: "unready"; label: string; confirm: string };

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
  search
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

  const goTab = (key: BoardTab) => {
    const params = new URLSearchParams();
    params.set("tab", key);
    if (search) params.set("search", search);
    router.push(`/articles?${params.toString()}`);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    params.set("tab", tab);
    const value = searchInput.trim();
    if (value) params.set("search", value);
    router.push(`/articles?${params.toString()}`);
  };

  const goPage = (target: number) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (search) params.set("search", search);
    if (target > 1) params.set("page", String(target));
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

      const data = (await res.json()) as { updated?: number };
      setMessage(`${data.updated ?? 0}건 처리되었습니다.`);
      setSelected(new Set());
      router.refresh();
    } catch {
      setMessage("서버 연결 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <header className="mb-5 border-b border-line pb-5">
        <p className="text-sm font-medium text-ink-500">수집 → 선별 → 번역 → 발행 대상</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">기사 큐레이션</h2>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              t.key === tab
                ? "bg-[#1167b1] text-white"
                : "border border-line bg-white text-ink-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
        <form onSubmit={submitSearch} className="ml-auto flex items-center gap-2">
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

      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
        <table className="w-full text-left text-sm">
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
              <th className="px-4 py-3 font-semibold">수정 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-500">
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
                      <div className="h-12 w-12 overflow-hidden rounded bg-slate-100">
                        <img
                          src={`${API_BASE}/uploads/thumbnails/${article.thumbnail_local_path.split("/").pop()}`}
                          alt={article.title}
                          className="h-full w-full object-cover"
                        />
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
                      <p className="truncate">{article.title}</p>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {article.country ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink-700">
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
