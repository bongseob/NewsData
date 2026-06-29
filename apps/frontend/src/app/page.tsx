import Link from "next/link";
import { ARTICLE_STATUSES } from "@newsdata/shared";
import { FetchButton } from "./FetchButton";
import { Sidebar } from "./components/Sidebar";
import { API_BASE } from "../lib/api-base";

const statusLabels: Record<string, string> = {
  DRAFT: "검수 대기",
  READY_TO_PUBLISH: "발행 대기",
  EMBARGOED: "엠바고",
  PUBLISHING: "발행 중",
  PUBLISHED: "발행 완료",
  FAILED: "실패",
  DELETED: "비노출"
};

async function getArticles() {
  try {
    const res = await fetch(`${API_BASE}/articles?limit=10`, {
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch {
    return [];
  }
}

async function getStatusCounts() {
  try {
    const res = await fetch(`${API_BASE}/articles/status-counts`, {
      cache: "no-store"
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function HomePage(): Promise<JSX.Element> {
  const articles = await getArticles();
  const counts = await getStatusCounts();
  const countsMap = Object.fromEntries(
    counts.map((c: any) => [c.status, c.count])
  );

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="대시보드" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-500">운영 대시보드</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                수집, 검수, 발행 상태
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/drafts"
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-sm hover:bg-slate-50"
              >
                Draft 검수
              </Link>
              <FetchButton />
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.values(ARTICLE_STATUSES).map((status) => (
              <article
                className="rounded-lg border border-line bg-white p-5 shadow-panel"
                key={status}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-500">
                      {statusLabels[status] ?? status}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      {status}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-500">
                    {countsMap[status] ?? 0}건
                  </span>
                </div>
                <strong className="mt-5 block text-3xl font-bold">
                  {countsMap[status] ?? 0}
                </strong>
              </article>
            ))}
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold">최근 수집된 기사</h3>
                <Link
                  href="/drafts"
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
                >
                  전체 보기
                </Link>
              </div>
              <div className="divide-y divide-line">
                {articles.length === 0 ? (
                  <div className="py-4 text-sm text-ink-500">기사가 없습니다.</div>
                ) : (
                  articles.map((article: any) => (
                    <Link
                      href={`/articles/${article.id}`}
                      key={article.id}
                      className="grid gap-3 py-4 transition hover:bg-slate-50 sm:grid-cols-[80px_1fr_90px]"
                    >
                      {article.thumbnail_local_path ? (
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-slate-100">
                          <img
                            src={`${API_BASE}/uploads/thumbnails/${article.thumbnail_local_path.split("/").pop()}`}
                            alt={article.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-ink-300">
                          No Image
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {article.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-ink-500">
                          {article.body}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                          <span className="text-[#0f5f9f]">
                            {article.source}
                          </span>
                          <span>&middot;</span>
                          <span>
                            {article.publisher_credit || "N/A"}
                          </span>
                        </div>
                      </div>
                      <span className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-center text-xs font-semibold text-ink-700">
                        {statusLabels[article.status] ?? article.status}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <h3 className="text-base font-bold">운영 기준</h3>
              <dl className="mt-4 grid gap-4">
                <div>
                  <dt className="text-xs font-semibold uppercase text-ink-500">
                    NewsData.io
                  </dt>
                  <dd className="mt-1 text-sm font-medium">기본 Draft 저장</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-ink-500">
                    Newswire
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    insert/update/delete action 처리
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-ink-500">
                    Publisher
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    Playwright worker에서만 실행
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
