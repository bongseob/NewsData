import { ARTICLE_STATUSES } from "@newsdata/shared";

const navItems = [
  "대시보드",
  "수집 설정",
  "수동 수집",
  "기사 목록",
  "Draft 검수",
  "발행 요청",
  "Queue 상태",
  "실패 로그"
];

const statusLabels: Record<string, string> = {
  DRAFT: "검수 대기",
  READY_TO_PUBLISH: "발행 대기",
  EMBARGOED: "엠바고",
  PUBLISHING: "발행 중",
  PUBLISHED: "발행 완료",
  FAILED: "실패",
  DELETED: "비노출"
};

const recentJobs = [
  {
    source: "NEWSDATA",
    title: "수동 수집 요청",
    status: "PENDING",
    time: "방금 전"
  },
  {
    source: "NEWSWIRE",
    title: "정기 수집 대기",
    status: "READY",
    time: "5분 주기"
  }
];

export default function HomePage(): JSX.Element {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <aside className="border-b border-line bg-white px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
              d-maker.kr
            </p>
            <h1 className="mt-2 text-xl font-bold">NewsData Admin</h1>
          </div>
          <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {navItems.map((item, index) => (
              <a
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  index === 0
                    ? "bg-[#e8f1fb] text-[#0f5f9f]"
                    : "text-ink-700 hover:bg-slate-100"
                }`}
                href="#"
                key={item}
              >
                {item}
              </a>
            ))}
          </nav>
        </aside>

        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-500">운영 대시보드</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                수집, 검수, 발행 상태
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-sm hover:bg-slate-50"
                type="button"
              >
                기사 목록
              </button>
              <button
                className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b]"
                type="button"
              >
                수동 수집
              </button>
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
                    0건
                  </span>
                </div>
                <strong className="mt-5 block text-3xl font-bold">0</strong>
              </article>
            ))}
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold">최근 작업</h3>
                <button
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
                  type="button"
                >
                  전체 보기
                </button>
              </div>
              <div className="divide-y divide-line">
                {recentJobs.map((job) => (
                  <div
                    className="grid gap-2 py-4 sm:grid-cols-[120px_1fr_90px]"
                    key={`${job.source}-${job.title}`}
                  >
                    <span className="text-xs font-bold text-[#0f5f9f]">
                      {job.source}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{job.title}</p>
                      <p className="mt-1 text-xs text-ink-500">{job.time}</p>
                    </div>
                    <span className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-center text-xs font-semibold text-ink-700">
                      {job.status}
                    </span>
                  </div>
                ))}
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
