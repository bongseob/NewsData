import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ArticlesRepository,
  type ArticleRow,
  type ArticleSortColumn,
  type ArticleSortOrder,
  type ArticleStatusCountRow,
  type MysqlPool,
  type ReviewStateCountRow
} from "@newsdata/db";
import type {
  ArticleReviewState,
  ArticleSource,
  ArticleStatus
} from "@newsdata/shared";
import { ARTICLE_REVIEW_STATES } from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";

export interface ListArticlesRequest {
  status?: ArticleStatus;
  reviewState?: ArticleReviewState;
  source?: ArticleSource;
  search?: string;
  sort?: ArticleSortColumn;
  order?: ArticleSortOrder;
  limit?: number;
  offset?: number;
}

export interface TranslateBodyResult {
  articleId: number;
  translatedBody: string;
  bodyTranslatedAt: Date;
}

export interface SaveTranslationsRequest {
  translatedTitle?: string | null;
  translatedSubtitle?: string | null;
  translatedBody?: string | null;
}

const VALID_REVIEW_STATES: ReadonlySet<string> = new Set(
  Object.values(ARTICLE_REVIEW_STATES)
);

@Injectable()
export class ArticlesService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: MysqlPool) {}

  list(input: ListArticlesRequest): Promise<ArticleRow[]> {
    return new ArticlesRepository(this.pool).list(input);
  }

  count(input: ListArticlesRequest): Promise<number> {
    return new ArticlesRepository(this.pool).count(input);
  }

  countByStatus(): Promise<ArticleStatusCountRow[]> {
    return new ArticlesRepository(this.pool).countByStatus();
  }

  countByReviewState(): Promise<ReviewStateCountRow[]> {
    return new ArticlesRepository(this.pool).countByReviewState();
  }

  findById(id: number): Promise<ArticleRow | null> {
    return new ArticlesRepository(this.pool).findById(id);
  }

  async translateBody(id: number): Promise<TranslateBodyResult> {
    const repository = new ArticlesRepository(this.pool);
    const article = await repository.findById(id);
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    const sourceBody = article.original_body || article.body;
    if (!sourceBody) {
      throw new BadRequestException("번역할 원문 본문이 없습니다.");
    }

    const translatedBody = await this.translateToKorean(sourceBody);
    const translatedAt = new Date();
    await repository.updateBodyTranslation(id, translatedBody, translatedAt);

    return {
      articleId: id,
      translatedBody,
      bodyTranslatedAt: translatedAt
    };
  }

  private normalizeIds(ids: unknown): number[] {
    if (!Array.isArray(ids)) {
      throw new BadRequestException("ids는 배열이어야 합니다.");
    }

    const normalized = Array.from(
      new Set(
        ids
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    if (normalized.length === 0) {
      throw new BadRequestException("유효한 기사 id가 없습니다.");
    }

    return normalized;
  }

  async setReviewState(
    ids: unknown,
    reviewState: string
  ): Promise<{ updated: number }> {
    if (!VALID_REVIEW_STATES.has(reviewState)) {
      throw new BadRequestException("허용되지 않은 review_state 값입니다.");
    }

    const normalizedIds = this.normalizeIds(ids);
    const updated = await new ArticlesRepository(this.pool).updateReviewState(
      normalizedIds,
      reviewState as ArticleReviewState
    );

    return { updated };
  }

  async markReadyToPublish(ids: unknown): Promise<{ updated: number }> {
    const normalizedIds = this.normalizeIds(ids);
    const updated = await new ArticlesRepository(this.pool).markReadyToPublish(
      normalizedIds
    );

    return { updated };
  }

  async revertReadyToDraft(ids: unknown): Promise<{ updated: number }> {
    const normalizedIds = this.normalizeIds(ids);
    const updated = await new ArticlesRepository(this.pool).revertReadyToDraft(
      normalizedIds
    );

    return { updated };
  }

  async saveTranslations(
    id: number,
    input: SaveTranslationsRequest
  ): Promise<ArticleRow> {
    const repository = new ArticlesRepository(this.pool);
    const article = await repository.findById(id);
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    const trim = (value?: string | null): string | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    await repository.updateTranslations(id, {
      translatedTitle: trim(input.translatedTitle),
      translatedSubtitle: trim(input.translatedSubtitle),
      translatedBody: trim(input.translatedBody)
    });

    const updated = await repository.findById(id);
    if (!updated) {
      throw new NotFoundException("Article not found.");
    }

    return updated;
  }

  private async translateToKorean(text: string): Promise<string> {
    const deeplApiKey = process.env.DEEPL_API_KEY;
    if (!deeplApiKey) {
      throw new BadRequestException("DEEPL_API_KEY가 설정되어 있지 않습니다.");
    }

    const isPro = !deeplApiKey.endsWith(":fx");
    const apiUrl = isPro
      ? "https://api.deepl.com/v2/translate"
      : "https://api-free.deepl.com/v2/translate";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${deeplApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: [text],
        target_lang: "KO"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`본문 번역 실패: ${errorText}`);
    }

    const data = (await response.json()) as {
      translations?: Array<{ text?: string }>;
    };
    const translated = data.translations?.[0]?.text;
    if (!translated) {
      throw new BadRequestException("본문 번역 응답에 번역문이 없습니다.");
    }

    return translated;
  }
}
