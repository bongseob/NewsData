import { Sidebar } from "../components/Sidebar";
import { API_BASE } from "../../lib/api-base";
import {
  ArticleBoard,
  type BoardArticle,
  type BoardSortColumn,
  type BoardTab,
  type ReviewCounts
} from "./ArticleBoard";

const TAB_QUERY: Record<BoardTab, string> = {
  pending: "reviewState=PENDING",
  selected: "reviewState=SELECTED",
  ready: "status=READY_TO_PUBLISH",
  excluded: "reviewState=EXCLUDED"
};

const VALID_TABS: BoardTab[] = ["pending", "selected", "ready", "excluded"];
const VALID_SOURCES = ["NEWSDATA", "NEWSWIRE"];
const VALID_SORTS: BoardSortColumn[] = ["updated_at", "created_at", "press_time"];
const VALID_ORDERS = ["asc", "desc"];

const PAGE_SIZE = 50;

interface ArticlesResponse {
  items: BoardArticle[];
  total: number;
}

async function getArticles(
  tab: BoardTab,
  search: string,
  source: string,
  sort: BoardSortColumn,
  order: string,
  offset: number
): Promise<ArticlesResponse> {
  const params = new URLSearchParams(TAB_QUERY[tab]);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (search) {
    params.set("search", search);
  }
  if (source) {
    params.set("source", source);
  }
  if (sort) {
    params.set("sort", sort);
  }
  if (order) {
    params.set("order", order);
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

async function getReviewCounts(): Promise<ReviewCounts> {
  const empty: ReviewCounts = {
    pending: 0,
    selected: 0,
    ready: 0,
    excluded: 0,
    selectedTranslated: 0,
    selectedUntranslated: 0
  };

  try {
    const res = await fetch(`${API_BASE}/articles/review-counts`, {
      cache: "no-store"
    });
    if (!res.ok) return empty;

    const rows: Array<{
      review_state: string;
      ready_count: number;
      total: number;
      translated: number;
      untranslated: number;
    }> = await res.json();

    const counts: ReviewCounts = { ...empty };

    for (const row of rows) {
      const readyCount = Number(row.ready_count) || 0;
      if (row.review_state === "PENDING") {
        counts.pending = Number(row.total) || 0;
      } else if (row.review_state === "SELECTED") {
        counts.ready = readyCount;
        counts.selected = Number(row.total) || 0;
        counts.selectedTranslated = Number(row.translated) || 0;
        counts.selectedUntranslated = Number(row.untranslated) || 0;
      } else if (row.review_state === "EXCLUDED") {
        counts.excluded = Number(row.total) || 0;
      }
    }

    return counts;
  } catch {
    return empty;
  }
}

export default async function ArticlesPage({
  searchParams
}: {
  searchParams: {
    tab?: string;
    search?: string;
    page?: string;
    source?: string;
    sort?: string;
    order?: string;
  };
}): Promise<JSX.Element> {
  const tab: BoardTab = VALID_TABS.includes(searchParams.tab as BoardTab)
    ? (searchParams.tab as BoardTab)
    : "pending";
  const search = searchParams.search?.trim() ?? "";
  const source = VALID_SOURCES.includes(searchParams.source ?? "")
    ? (searchParams.source as string)
    : "";
  const sort: BoardSortColumn = VALID_SORTS.includes(
    searchParams.sort as BoardSortColumn
  )
    ? (searchParams.sort as BoardSortColumn)
    : "updated_at";
  const order = VALID_ORDERS.includes(searchParams.order ?? "")
    ? (searchParams.order as string)
    : "desc";
  const page = Math.max(Number(searchParams.page ?? "1") || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { items, total } = await getArticles(
    tab,
    search,
    source,
    sort,
    order,
    offset
  );

  const reviewCounts = await getReviewCounts();

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
          source={source}
          sort={sort}
          order={order}
          reviewCounts={reviewCounts}
        />
      </div>
    </main>
  );
}
