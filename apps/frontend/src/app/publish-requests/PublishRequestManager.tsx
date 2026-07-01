"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../lib/api-base";

export interface ReadyArticle {
  id: number;
  title: string;
  translated_title: string | null;
  publisher_credit: string | null;
  updated_at: string | null;
}

export interface PublishJob {
  id: number;
  article_id: number;
  status: string;
  requested_by: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  article_title: string | null;
  article_status: string | null;
}

interface PublishRequestManagerProps {
  readyArticles: ReadyArticle[];
  publishJobs: PublishJob[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "대기",
  RUNNING: "실행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
  RETRYING: "재시도",
  CANCELED: "취소"
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  RUNNING: "bg-blue-100 text-blue-700",
  RETRYING: "bg-amber-100 text-amber-700",
  SUCCEEDED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELED: "bg-slate-100 text-ink-700"
};

const ACTIVE_STATUSES = ["PENDING", "RUNNING", "RETRYING"];

export function PublishRequestManager({
  readyArticles,
  publishJobs
}: PublishRequestManagerProps): JSX.Element {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobs, setJobs] = useState<PublishJob[]>(publishJobs);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const hasActiveJobs = jobs.some((job) => ACTIVE_STATUSES.includes(job.status));

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/publish-requests?limit=20`, {
        cache: "no-store"
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: PublishJob[] };
      if (Array.isArray(data.items)) {
        setJobs(data.items);
        setLastUpdated(new Date());
      }
    } catch {
      // 폴링 중 일시적 오류는 무시하고 다음 주기에 재시도한다.
    }
  }, []);

  const republish = useCallback(
    async (jobId: number) => {
      if (
        !window.confirm(
          "이 기사를 다시 발행 요청할까요? d-maker에 기사가 다시 등록됩니다."
        )
      ) {
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/publish-requests/${jobId}/republish`,
          { method: "POST" }
        );
        if (!res.ok) {
          setMessage(`재발행 실패: ${await res.text()}`);
          return;
        }
        setMessage("재발행 요청을 등록했습니다.");
        void refreshJobs();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "재발행 실패");
      }
    },
    [refreshJobs, router]
  );

  // 진행 중인 작업이 있으면 3초, 없으면 20초 간격으로 상태를 모니터링한다.
  useEffect(() => {
    const delay = hasActiveJobs ? 3000 : 20000;
    const timer = setInterval(() => {
      void refreshJobs();
    }, delay);
    return () => clearInterval(timer);
  }, [hasActiveJobs, refreshJobs]);

  const allSelected = useMemo(
    () =>
      readyArticles.length > 0 &&
      readyArticles.every((article) => selectedIds.includes(article.id)),
    [readyArticles, selectedIds]
  );

  function toggleArticle(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : readyArticles.map((article) => article.id));
  }

  async function requestPublish() {
    if (selectedIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/publish-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds })
      });

      if (!res.ok) {
        setMessage(`발행 요청 실패: ${await res.text()}`);
        return;
      }

      const data = (await res.json()) as {
        queued?: unknown[];
        skipped?: unknown[];
      };
      setSelectedIds([]);
      setMessage(
        `발행 요청 ${data.queued?.length ?? 0}건 등록, ${data.skipped?.length ?? 0}건 제외`
      );
      router.refresh();
      void refreshJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "발행 요청 실패");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold">발행 대상 기사</h3>
            <p className="mt-1 text-sm text-ink-500">
              READY_TO_PUBLISH 상태 기사만 발행 queue에 등록합니다.
            </p>
          </div>
          <button
            className="rounded-md bg-[#0f5f9f] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={selectedIds.length === 0 || isSubmitting}
            onClick={requestPublish}
            type="button"
          >
            {isSubmitting ? "요청 중..." : `발행 요청 (${selectedIds.length})`}
          </button>
        </div>

        {message ? (
          <div className="border-b border-line bg-slate-50 px-5 py-3 text-sm text-ink-700">
            {message}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs text-ink-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    checked={allSelected}
                    onChange={toggleAll}
                    type="checkbox"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">기사</th>
                <th className="px-4 py-3 font-semibold">출처</th>
                <th className="px-4 py-3 font-semibold">수정 시간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {readyArticles.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-ink-500" colSpan={4}>
                    발행 대상 기사가 없습니다.
                  </td>
                </tr>
              ) : (
                readyArticles.map((article) => (
                  <tr className="hover:bg-slate-50" key={article.id}>
                    <td className="px-4 py-3">
                      <input
                        checked={selectedIds.includes(article.id)}
                        onChange={() => toggleArticle(article.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <Link
                        className="font-semibold text-[#0f5f9f] hover:underline"
                        href={`/articles/${article.id}`}
                      >
                        {article.translated_title || article.title}
                      </Link>
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
      </section>

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="flex items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">발행 진행 상태</h3>
            {hasActiveJobs ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                모니터링 중
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-500">
            {lastUpdated ? (
              <span>갱신 {lastUpdated.toLocaleTimeString("ko-KR")}</span>
            ) : null}
            <button
              className="rounded-md border border-line px-2.5 py-1 font-semibold text-ink-700 hover:bg-slate-50"
              onClick={() => void refreshJobs()}
              type="button"
            >
              새로고침
            </button>
          </div>
        </div>
        <div className="divide-y divide-line">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-500">
              발행 요청 이력이 없습니다.
            </div>
          ) : (
            jobs.map((job) => (
              <div className="p-4" key={job.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      className="truncate text-sm font-semibold text-[#0f5f9f] hover:underline"
                      href={`/articles/${job.article_id}`}
                    >
                      {job.article_title || `기사 #${job.article_id}`}
                    </Link>
                    <p className="mt-1 text-xs text-ink-500">
                      요청 #{job.id} · 기사 #{job.article_id}
                      {job.retry_count > 0 ? ` · 재시도 ${job.retry_count}회` : ""}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_STYLES[job.status] ?? "bg-slate-100 text-ink-700"
                    }`}
                  >
                    {STATUS_LABELS[job.status] ?? job.status}
                  </span>
                </div>
                {job.error_message ? (
                  <p className="mt-2 line-clamp-2 text-xs text-red-600">
                    {job.error_message}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-ink-500">
                    {new Date(job.updated_at || job.created_at).toLocaleString("ko-KR")}
                  </p>
                  {ACTIVE_STATUSES.includes(job.status) ? null : (
                    <button
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-[#0f5f9f] hover:bg-slate-50"
                      onClick={() => void republish(job.id)}
                      type="button"
                    >
                      재발행
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
