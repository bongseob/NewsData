import { Sidebar } from "../components/Sidebar";
import { API_BASE } from "../../lib/api-base";
import {
  PublishRequestManager,
  type PublishJob,
  type ReadyArticle
} from "./PublishRequestManager";

async function getReadyArticles(): Promise<ReadyArticle[]> {
  try {
    const res = await fetch(
      `${API_BASE}/articles?status=READY_TO_PUBLISH&limit=100`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch {
    return [];
  }
}

async function getPublishJobs(): Promise<PublishJob[]> {
  try {
    const res = await fetch(`${API_BASE}/publish-requests?limit=20`, {
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export default async function PublishRequestsPage(): Promise<JSX.Element> {
  const [readyArticles, publishJobs] = await Promise.all([
    getReadyArticles(),
    getPublishJobs()
  ]);

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="발행 요청" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 border-b border-line pb-6">
            <p className="text-sm font-medium text-ink-500">
              큐레이션 완료 기사 발행 등록
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">발행 요청</h2>
          </header>
          <PublishRequestManager
            readyArticles={readyArticles}
            publishJobs={publishJobs}
          />
        </section>
      </div>
    </main>
  );
}
