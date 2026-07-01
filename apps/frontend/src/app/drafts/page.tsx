import Link from "next/link";
import { Sidebar } from "../components/Sidebar";
import { API_BASE } from "../../lib/api-base";

async function getDrafts() {
  try {
    const res = await fetch(
      `${API_BASE}/articles?status=DRAFT&limit=50`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch {
    return [];
  }
}

export default async function DraftsPage(): Promise<JSX.Element> {
  const drafts = await getDrafts();

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="Draft 목록" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 border-b border-line pb-6">
            <p className="text-sm font-medium text-ink-500">검수 대기</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
              Draft 목록 ({drafts.length}건)
            </h2>
          </header>

          {drafts.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-10 text-center text-sm text-ink-500 shadow-panel">
              검수 대기 중인 기사가 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-slate-50 text-xs uppercase text-ink-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold">썸네일</th>
                    <th className="px-4 py-3 font-semibold">제목</th>
                    <th className="px-4 py-3 font-semibold">출처</th>
                    <th className="px-4 py-3 font-semibold">수집 시간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {drafts.map((article: any) => (
                    <tr
                      key={article.id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-ink-500">
                        {article.id}
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
                        <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">
                          {article.body}
                        </p>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
