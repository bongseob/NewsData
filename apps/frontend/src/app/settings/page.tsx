import { Sidebar } from "../components/Sidebar";
import { SourceConfigManager } from "./SourceConfigManager";

export default function SettingsPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="수집 설정" />
        <section className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-7 border-b border-line pb-6">
            <p className="text-sm font-medium text-ink-500">수집 설정 관리</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">수집 설정</h2>
            <p className="mt-2 text-sm text-ink-500">
              출처별 수집 주기, 자동 수집/발행 여부, 검색 조건(Query)을 관리합니다.
            </p>
          </header>
          <SourceConfigManager />
        </section>
      </div>
    </main>
  );
}
