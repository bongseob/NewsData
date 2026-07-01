import Link from "next/link";
import { Sidebar } from "../components/Sidebar";
import { API_BASE } from "../../lib/api-base";

interface FailureLog {
  id: number;
  article_id: number | null;
  publish_job_id: number | null;
  failed_step: string;
  screenshot_path: string | null;
  html_snapshot_path: string | null;
  current_url: string | null;
  error_message: string;
  created_at: string;
  article_title: string | null;
  publish_status: string | null;
}

async function getFailureLogs(): Promise<FailureLog[]> {
  try {
    const res = await fetch(`${API_BASE}/failure-logs?limit=100`, {
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function fileName(path: string | null): string {
  if (!path) return "-";
  return path.split(/[\\/]/).pop() || path;
}

export default async function FailureLogsPage(): Promise<JSX.Element> {
  const logs = await getFailureLogs();

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="실패 로그" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 border-b border-line pb-6">
            <p className="text-sm font-medium text-ink-500">
              Playwright 발행 실패 단계와 증거 파일
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">실패 로그</h2>
          </header>

          <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-slate-50 text-xs text-ink-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">시간</th>
                    <th className="px-4 py-3 font-semibold">기사</th>
                    <th className="px-4 py-3 font-semibold">단계</th>
                    <th className="px-4 py-3 font-semibold">오류</th>
                    <th className="px-4 py-3 font-semibold">증거</th>
                    <th className="px-4 py-3 font-semibold">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {logs.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-ink-500" colSpan={6}>
                        실패 로그가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr className="align-top hover:bg-slate-50" key={log.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                          {new Date(log.created_at).toLocaleString("ko-KR")}
                        </td>
                        <td className="max-w-xs px-4 py-3">
                          {log.article_id ? (
                            <Link
                              className="font-semibold text-[#0f5f9f] hover:underline"
                              href={`/articles/${log.article_id}`}
                            >
                              {log.article_title || `기사 #${log.article_id}`}
                            </Link>
                          ) : (
                            "-"
                          )}
                          {log.publish_job_id ? (
                            <p className="mt-1 text-xs text-ink-500">
                              발행 요청 #{log.publish_job_id}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                          {log.failed_step}
                        </td>
                        <td className="max-w-md px-4 py-3 text-xs text-red-600">
                          {log.error_message}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-ink-500">
                          <p>스크린샷: {fileName(log.screenshot_path)}</p>
                          <p className="mt-1">HTML: {fileName(log.html_snapshot_path)}</p>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs">
                          {log.current_url ? (
                            <a
                              className="break-all text-[#0f5f9f] hover:underline"
                              href={log.current_url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {log.current_url}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
