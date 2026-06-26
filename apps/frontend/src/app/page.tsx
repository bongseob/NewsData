import { ARTICLE_STATUSES } from "@newsdata/shared";

const navItems = [
  "Dashboard",
  "수집 설정",
  "수동 수집",
  "기사 목록",
  "Draft 검수",
  "발행 요청",
  "Queue 상태",
  "실패 로그"
];

export default function HomePage(): JSX.Element {
  return (
    <main className="shell">
      <aside className="sidebar">
        <h1>NewsData Admin</h1>
        <nav>
          {navItems.map((item) => (
            <a href="#" key={item}>
              {item}
            </a>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="pageHeader">
          <div>
            <p>운영 대시보드</p>
            <h2>수집, 검수, 발행 상태</h2>
          </div>
          <button type="button">수동 수집</button>
        </header>
        <div className="statusGrid">
          {Object.values(ARTICLE_STATUSES).map((status) => (
            <article className="statusCard" key={status}>
              <span>{status}</span>
              <strong>0</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
