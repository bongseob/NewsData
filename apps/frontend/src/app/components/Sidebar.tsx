import Link from "next/link";

const navItems = [
  { label: "대시보드", href: "/" },
  { label: "수집 설정", href: "/settings" },
  { label: "수동 수집", href: "/manual-fetch" },
  { label: "기사 큐레이션", href: "/articles" },
  { label: "발행 요청", href: "/publish-requests" },
  { label: "Queue 상태", href: "/queues" },
  { label: "실패 로그", href: "/failure-logs" }
];

export function Sidebar({ active }: { active: string }): JSX.Element {
  return (
    <aside className="border-b border-line bg-white px-5 py-5 lg:border-b-0 lg:border-r">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
          d-maker.kr
        </p>
        <h1 className="mt-2 text-xl font-bold">NewsData Admin</h1>
      </div>
      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {navItems.map((item) => (
          <Link
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              item.label === active
                ? "bg-[#e8f1fb] text-[#0f5f9f]"
                : "text-ink-700 hover:bg-slate-100"
            }`}
            href={item.href}
            key={item.label}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
