import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";

const API_BASE = "http://127.0.0.1:4000";

async function getArticle(id: string) {
  try {
    const res = await fetch(`${API_BASE}/articles/${id}`, {
      cache: "no-store"
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function ArticleDetailPage({
  params
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const article = await getArticle(params.id);

  if (!article) {
    notFound();
  }

  const thumbnail = article.thumbnail_local_path
    ? `${API_BASE}/uploads/thumbnails/${article.thumbnail_local_path.split("/").pop()}`
    : null;

  // raw_payload는 JSON 문자열 또는 객체로 저장되어 있을 수 있음
  let rawPayloadStr: string;
  try {
    const parsed =
      typeof article.raw_payload === "string"
        ? JSON.parse(article.raw_payload)
        : article.raw_payload;
    rawPayloadStr = JSON.stringify(parsed, null, 2);
  } catch {
    rawPayloadStr = String(article.raw_payload);
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="Draft 검수" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          {/* Breadcrumb */}
          <div className="mb-5 flex items-center gap-2 text-sm text-ink-500">
            <Link href="/drafts" className="hover:text-[#0f5f9f]">
              Draft 검수
            </Link>
            <span>/</span>
            <span className="font-mono text-xs">#{article.id}</span>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_480px]">
            {/* ── Left: Article content ── */}
            <div className="space-y-5">
              <div className="rounded-lg border border-line bg-white p-6 shadow-panel">
                <div className="mb-4 flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                    {article.status}
                  </span>
                  <span className="text-xs font-medium text-[#0f5f9f]">
                    {article.source}
                  </span>
                  <span className="text-xs text-slate-400">
                    &middot; {article.publisher_credit || "N/A"}
                  </span>
                </div>

                <h2 className="text-xl font-bold leading-snug">
                  {article.title}
                </h2>

                {article.subtitle && (
                  <p className="mt-2 text-sm text-ink-500">
                    {article.subtitle}
                  </p>
                )}

                {thumbnail && (
                  <div className="mt-5 overflow-hidden rounded-lg">
                    <img
                      src={thumbnail}
                      alt={article.title}
                      className="w-full"
                    />
                  </div>
                )}

                {article.body && (
                  <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                    {article.body}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Metadata + Raw payload ── */}
            <div className="space-y-5">
              {/* Metadata */}
              <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
                <h3 className="mb-3 text-sm font-bold">메타데이터</h3>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">external_id</dt>
                    <dd className="break-all font-mono text-ink-700">
                      {article.external_id}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">source_url</dt>
                    <dd className="break-all text-right">
                      {article.source_url ? (
                        <a
                          href={article.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0f5f9f] hover:underline"
                        >
                          원문 보기
                        </a>
                      ) : (
                        <span className="text-ink-500">N/A</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">press_time</dt>
                    <dd className="text-ink-700">
                      {article.press_time
                        ? new Date(article.press_time).toLocaleString("ko-KR")
                        : "N/A"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">created_at</dt>
                    <dd className="text-ink-700">
                      {article.created_at
                        ? new Date(article.created_at).toLocaleString("ko-KR")
                        : "N/A"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">updated_at</dt>
                    <dd className="text-ink-700">
                      {article.updated_at
                        ? new Date(article.updated_at).toLocaleString("ko-KR")
                        : "N/A"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Raw payload */}
              <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
                <h3 className="mb-3 text-sm font-bold">원본 Payload</h3>
                <pre className="max-h-[600px] overflow-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                  {rawPayloadStr}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
