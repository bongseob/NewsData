import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { API_BASE } from "../../../lib/api-base";
import { BodyTranslationButton } from "./BodyTranslationButton";
import { ImageGenerationButton } from "./ImageGenerationButton";
import { TranslationEditor } from "./TranslationEditor";
import { ArticleActions } from "./ArticleActions";

interface ArticleDetail {
  id: number;
  source: string;
  external_id: string;
  status: string;
  review_state: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  original_title: string | null;
  original_subtitle: string | null;
  original_body: string | null;
  translated_title: string | null;
  translated_subtitle: string | null;
  translated_body: string | null;
  title_translated_at: string | null;
  body_translated_at: string | null;
  keywords: string[] | string | null;
  publisher_credit: string | null;
  country: string | null;
  source_url: string | null;
  press_time: string | null;
  raw_payload: unknown;
  created_at: string | null;
  updated_at: string | null;
  thumbnail_local_path?: string | null;
  thumbnail_source_url?: string | null;
  thumbnail_is_generated?: number | boolean | null;
}

async function getArticle(id: string): Promise<ArticleDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/articles/${id}`, {
      cache: "no-store"
    });
    if (!res.ok) return null;
    return (await res.json()) as ArticleDetail;
  } catch {
    return null;
  }
}

function stringifyPayload(payload: unknown): string {
  try {
    const parsed =
      typeof payload === "string" ? JSON.parse(payload) : payload;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(payload);
  }
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ko-KR") : "N/A";
}

function normalizeKeywords(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value.map((keyword) => String(keyword).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((keyword) => String(keyword).trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
    }
  }

  return [];
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
  const thumbnailFilename = article.thumbnail_local_path?.split("/").pop() ?? null;
  const isGeneratedThumbnail =
    !!article.thumbnail_is_generated ||
    article.thumbnail_source_url?.startsWith("generated:");
  const thumbnailDownloadUrl =
    isGeneratedThumbnail && thumbnailFilename
      ? `${API_BASE}/articles/${article.id}/thumbnail/download`
      : null;
  const rawPayloadStr = stringifyPayload(article.raw_payload);
  const originalBody = article.original_body || article.body;
  const translatedBody = article.translated_body;
  const displayTitle = article.translated_title || article.title;
  const keywords = normalizeKeywords(article.keywords);

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="기사 큐레이션" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <div className="mb-5 flex items-center gap-2 text-sm text-ink-500">
            <Link href="/articles" className="hover:text-[#0f5f9f]">
              기사 큐레이션
            </Link>
            <span>/</span>
            <span className="font-mono text-xs">#{article.id}</span>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_480px]">
            <div className="space-y-5">
              <article className="rounded-lg border border-line bg-white p-6 shadow-panel">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                    {article.status}
                  </span>
                  <span className="text-xs font-medium text-[#0f5f9f]">
                    {article.source}
                  </span>
                  <span className="text-xs text-slate-400">
                    &middot; {article.publisher_credit || "N/A"}
                  </span>
                  {article.title_translated_at && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      제목 번역 완료
                    </span>
                  )}
                  {article.body_translated_at ? (
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                      본문 번역 완료
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      본문 미번역
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold leading-snug">
                  {displayTitle}
                </h2>

                {article.original_title && article.original_title !== displayTitle && (
                  <p className="mt-2 text-xs text-ink-500">
                    원문 제목: {article.original_title}
                  </p>
                )}

                {article.subtitle && (
                  <p className="mt-3 text-sm text-ink-500">
                    {article.subtitle}
                  </p>
                )}

                {thumbnail && (
                  <div className="mt-5 overflow-hidden rounded-lg border border-line bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink-500">
                          대표 이미지
                        </span>
                        {isGeneratedThumbnail ? (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                            AI 대체 이미지
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-ink-500">
                            수집 이미지
                          </span>
                        )}
                      </div>
                      {thumbnailDownloadUrl && (
                        <a
                          href={thumbnailDownloadUrl}
                          className="rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-50"
                        >
                          이미지 다운로드
                        </a>
                      )}
                    </div>
                    <img
                      src={thumbnail}
                      alt={displayTitle}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="mt-5">
                  <ImageGenerationButton
                    articleId={article.id}
                    currentThumbnailLocalPath={article.thumbnail_local_path}
                  />
                </div>

                <div className="mt-5">
                  <BodyTranslationButton
                    articleId={article.id}
                    disabled={!originalBody}
                  />
                </div>

                <TranslationEditor
                  articleId={article.id}
                  initialTitle={article.translated_title ?? ""}
                  initialSubtitle={article.translated_subtitle ?? ""}
                  initialBody={translatedBody ?? ""}
                  initialKeywords={keywords}
                />

                {originalBody && (
                  <section className="mt-6">
                    <h3 className="mb-2 text-sm font-bold">원문 본문</h3>
                    <div className="whitespace-pre-wrap rounded-md border border-line p-4 text-sm leading-relaxed text-ink-700">
                      {originalBody}
                    </div>
                  </section>
                )}
              </article>
            </div>

            <div className="space-y-5">
              <ArticleActions
                articleId={article.id}
                status={article.status}
                reviewState={article.review_state}
              />

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
                    <dt className="text-ink-500">국가</dt>
                    <dd className="text-right text-ink-700">
                      {article.country || "N/A"}
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
                    <dt className="text-ink-500">keywords</dt>
                    <dd className="flex flex-wrap justify-end gap-1 text-right">
                      {keywords.length > 0 ? (
                        keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-ink-700"
                          >
                            {keyword}
                          </span>
                        ))
                      ) : (
                        <span className="text-ink-500">N/A</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">press_time</dt>
                    <dd className="text-ink-700">
                      {formatDate(article.press_time)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">created_at</dt>
                    <dd className="text-ink-700">
                      {formatDate(article.created_at)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">updated_at</dt>
                    <dd className="text-ink-700">
                      {formatDate(article.updated_at)}
                    </dd>
                  </div>
                </dl>
              </div>

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
