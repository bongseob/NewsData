import type { ArticleSource } from "@newsdata/shared";
import type { SourceAdapter } from "./types.js";
import { newsDataAdapter } from "./newsdata.js";
import { secAdapter } from "./sec.js";
import { fedAdapter } from "./fed.js";
import { gdeltAdapter, reutersAdapter } from "./gdelt.js";
import { guardianAdapter } from "./guardian.js";

/**
 * 소스 → 수집 어댑터 레지스트리. 새 소스는 여기 등록만 하면 fetch/process
 * 워커가 자동으로 처리한다.
 */
export const SOURCE_ADAPTERS: Partial<Record<ArticleSource, SourceAdapter>> = {
  [newsDataAdapter.source]: newsDataAdapter,
  [secAdapter.source]: secAdapter,
  [fedAdapter.source]: fedAdapter,
  [gdeltAdapter.source]: gdeltAdapter,
  [reutersAdapter.source]: reutersAdapter,
  [guardianAdapter.source]: guardianAdapter
};

export function getSourceAdapter(source: ArticleSource): SourceAdapter {
  const adapter = SOURCE_ADAPTERS[source];
  if (!adapter) {
    throw new Error(`No source adapter registered for: ${source}`);
  }
  return adapter;
}
