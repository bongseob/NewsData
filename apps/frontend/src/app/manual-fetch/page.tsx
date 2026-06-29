import { Sidebar } from "../components/Sidebar";
import { ManualFetchManager } from "./ManualFetchManager";

export default function ManualFetchPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="수동 수집" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 border-b border-line pb-6">
            <p className="text-sm font-medium text-ink-500">NewsData.io</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">수동 수집</h2>
            <p className="mt-2 text-sm text-ink-500">
              NewsData.io 조건을 직접 입력해 fetch queue에 수집 작업을 등록합니다.
            </p>
          </header>
          <ManualFetchManager />
        </section>
      </div>
    </main>
  );
}
