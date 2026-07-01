import { Sidebar } from "../components/Sidebar";
import { API_BASE } from "../../lib/api-base";

interface QueueJob {
  id: string | number | undefined;
  name: string;
  state: string;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  data: Record<string, unknown>;
}

interface QueueStatus {
  name: string;
  counts: Record<string, number>;
  recentJobs: QueueJob[];
}

async function getQueues(): Promise<QueueStatus[]> {
  try {
    const res = await fetch(`${API_BASE}/queues`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function formatTime(value: number | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export default async function QueuesPage(): Promise<JSX.Element> {
  const queues = await getQueues();

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="Queue 상태" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 border-b border-line pb-6">
            <p className="text-sm font-medium text-ink-500">
              BullMQ 작업 대기/실행/실패 현황
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Queue 상태</h2>
          </header>

          <div className="grid gap-5">
            {queues.length === 0 ? (
              <div className="rounded-lg border border-line bg-white p-10 text-center text-sm text-ink-500 shadow-panel">
                큐 상태를 불러오지 못했습니다.
              </div>
            ) : (
              queues.map((queue) => (
                <section
                  className="overflow-hidden rounded-lg border border-line bg-white shadow-panel"
                  key={queue.name}
                >
                  <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-bold">{queue.name}</h3>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      {Object.entries(queue.counts).map(([key, value]) => (
                        <span
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-ink-700"
                          key={key}
                        >
                          {key} {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-line bg-slate-50 text-xs text-ink-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Job ID</th>
                          <th className="px-4 py-3 font-semibold">작업명</th>
                          <th className="px-4 py-3 font-semibold">상태</th>
                          <th className="px-4 py-3 font-semibold">시도</th>
                          <th className="px-4 py-3 font-semibold">생성</th>
                          <th className="px-4 py-3 font-semibold">오류</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {queue.recentJobs.length === 0 ? (
                          <tr>
                            <td className="px-4 py-6 text-center text-ink-500" colSpan={6}>
                              최근 작업이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          queue.recentJobs.map((job) => (
                            <tr className="hover:bg-slate-50" key={`${queue.name}-${job.id}`}>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                {job.id ?? "-"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {job.name}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {job.state}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {job.attemptsMade}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                                {formatTime(job.timestamp)}
                              </td>
                              <td className="max-w-md px-4 py-3 text-xs text-red-600">
                                {job.failedReason || "-"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
