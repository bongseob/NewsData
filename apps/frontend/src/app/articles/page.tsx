import { Sidebar } from "../components/Sidebar";
import { API_BASE } from "../../lib/api-base";
import { ArticleBoard, type BoardArticle, type BoardTab } from "./ArticleBoard";

const TAB_QUERY: Record<BoardTab, string> = {
  pending: "reviewState=PENDING",
  selected: "reviewState=SELECTED",
  ready: "status=READY_TO_PUBLISH",
  excluded: "reviewState=EXCLUDED"
};

const VALID_TABS: BoardTab[] = ["pending", "selected", "ready", "excluded"];

const PAGE_SIZE = 50;

interface ArticlesResponse {
  items: BoardArticle[];
  total: number;
}

async function getArticles(
  tab: BoardTab,
  search: string,
  offset: number
): Promise<ArticlesResponse> {
  const params = new URLSearchParams(TAB_QUERY[tab]);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (search) {
    params.set("search", search);
  }

  try {
    const res = await fetch(`${API_BASE}/articles?${params.toString()}`, {
      cache: "no-store"
    });
    if (!res.ok) return { items: [], total: 0 };
    const data = await res.json();
    if (Array.isArray(data)) {
      return { items: data, total: data.length };
    }
    return { items: data.items ?? [], total: data.total ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

export default async function ArticlesPage({
  searchParams
}: {
  searchParams: { tab?: string; search?: string; page?: string };
}): Promise<JSX.Element> {
  const tab: BoardTab = VALID_TABS.includes(searchParams.tab as BoardTab)
    ? (searchParams.tab as BoardTab)
    : "pending";
  const search = searchParams.search?.trim() ?? "";
  const page = Math.max(Number(searchParams.page ?? "1") || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { items, total } = await getArticles(tab, search, offset);

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-ink-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_1fr]">
        <Sidebar active="기사 큐레이션" />
        <ArticleBoard
          tab={tab}
          items={items}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          search={search}
        />
      </div>
    </main>
  );
}
