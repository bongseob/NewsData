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

interface StatusStyle {
  accent: string;
  tint: string;
  value: string;
  badge: string;
}

const statusStyles: Record<string, StatusStyle> = {
  DRAFT: {
    accent: "border-t-amber-400",
    tint: "from-amber-50",
    value: "text-amber-600",
    badge: "bg-amber-100 text-amber-700"
  },
  READY_TO_PUBLISH: {
    accent: "border-t-sky-400",
    tint: "from-sky-50",
    value: "text-sky-600",
    badge: "bg-sky-100 text-sky-700"
  },
  EMBARGOED: {
    accent: "border-t-purple-400",
    tint: "from-purple-50",
    value: "text-purple-600",
    badge: "bg-purple-100 text-purple-700"
  },
  PUBLISHING: {
    accent: "border-t-indigo-400",
    tint: "from-indigo-50",
    value: "text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700"
  },
  PUBLISHED: {
    accent: "border-t-emerald-400",
    tint: "from-emerald-50",
    value: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700"
  },
  FAILED: {
    accent: "border-t-rose-400",
    tint: "from-rose-50",
    value: "text-rose-600",
    badge: "bg-rose-100 text-rose-700"
  },
  DELETED: {
    accent: "border-t-slate-400",
    tint: "from-slate-100",
    value: "text-slate-500",
    badge: "bg-slate-200 text-slate-600"
  }
};

const fallbackStatusStyle: StatusStyle = {
  accent: "border-t-slate-300",
  tint: "from-slate-50",
  value: "text-ink-950",
  badge: "bg-slate-100 text-ink-500"
};

// 대시보드에 노출할 상태. 실제 워크플로에서 값이 채워지는 상태만 표시한다.
// EMBARGOED / DELETED 는 각각 press_time 기반 엠바고 스케줄러, 뉴스와이어 delete
// 연동이 아직 없어 항상 0이므로 제외한다. (해당 기능 도입 시 다시 추가)
const DASHBOARD_STATUSES: string[] = [
  ARTICLE_STATUSES.draft,
  ARTICLE_STATUSES.readyToPublish,
  ARTICLE_STATUSES.publishing,
  ARTICLE_STATUSES.published,
  ARTICLE_STATUSES.failed
];

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
          <header className="mb-7 flex flex-col gap-4 rounded-xl bg-gradient-to-r from-[#0f5f9f] via-[#1876c9] to-[#3aa0e3] px-6 py-6 text-white shadow-panel sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">운영 대시보드</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                수집, 검수, 발행 상태
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/drafts"
                className="rounded-md bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur transition hover:bg-white/25"
              >
                Draft 목록
              </Link>
              <FetchButton />
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {DASHBOARD_STATUSES.map((status) => {
              const style = statusStyles[status] ?? fallbackStatusStyle;
              return (
                <article
                  className={`rounded-lg border border-line border-t-4 ${style.accent} bg-gradient-to-b ${style.tint} to-white px-4 py-3 shadow-panel transition hover:-translate-y-0.5 hover:shadow-md`}
                  key={status}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-700">
                      {statusLabels[status] ?? status}
                    </p>
                    <span className="text-[10px] font-medium text-slate-400">
                      {status}
                    </span>
                  </div>
                  <strong className={`mt-1 block text-2xl font-bold ${style.value}`}>
                    {countsMap[status] ?? 0}
                  </strong>
                </article>
              );
            })}
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
                      <span
                        className={`self-start rounded-full px-2.5 py-1 text-center text-xs font-semibold ${
                          (statusStyles[article.status] ?? fallbackStatusStyle).badge
                        }`}
                      >
                        {statusLabels[article.status] ?? article.status}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <h3 className="text-base font-bold">운영 기준</h3>
              <dl className="mt-4 grid gap-3">
                <div className="rounded-lg border-l-4 border-sky-400 bg-sky-50/60 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase text-sky-700">
                    NewsData.io
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink-700">
                    기본 Draft 저장
                  </dd>
                </div>
                <div className="rounded-lg border-l-4 border-emerald-400 bg-emerald-50/60 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase text-emerald-700">
                    번역·발행
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink-700">
                    OpenAI 번역 후 d-maker.kr 발행
                  </dd>
                </div>
                <div className="rounded-lg border-l-4 border-purple-400 bg-purple-50/60 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase text-purple-700">
                    Publisher
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink-700">
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
