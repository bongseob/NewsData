import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Queue } from "bullmq";
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
  ArticleStatus,
  ContentGenerationJobData,
  ContentGenerationJobResult,
  ContentGenerationTarget,
  ImageGenerationJobData,
  TranslateJobData
} from "@newsdata/shared";
import {
  ARTICLE_REVIEW_STATES,
  appendTranslationAttribution,
  CONTENT_GENERATION_TARGETS,
  IMAGE_JOB_TYPES,
  QUEUE_NAMES,
  TRANSLATION_TARGETS
} from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";
import {
  CONTENT_QUEUE,
  IMAGE_QUEUE,
  TRANSLATE_QUEUE
} from "../queue/queue.tokens.js";

export interface ListArticlesRequest {
  status?: ArticleStatus;
  reviewState?: ArticleReviewState;
  source?: ArticleSource;
  search?: string;
  fetchJobId?: number;
  sort?: ArticleSortColumn;
  order?: ArticleSortOrder;
  limit?: number;
  offset?: number;
}

export interface TranslateBodyResult {
  articleId: number;
  queue: string;
  queueJobId: string | undefined;
  status: "QUEUED";
}

export interface TranslateBodiesResult {
  queue: string;
  queued: Array<{
    articleId: number;
    queueJobId: string | undefined;
  }>;
  skipped: Array<{
    articleId: number;
    reason: string;
  }>;
}

export interface GenerateImageResult {
  articleId: number;
  queue: string;
  queueJobId: string | undefined;
  status: "QUEUED";
}

export interface GenerateContentResult {
  articleId: number;
  target: ContentGenerationTarget;
  queue: string;
  queueJobId: string | undefined;
  status: "QUEUED";
}

export interface ContentGenerationStatus {
  articleId: number;
  target: ContentGenerationTarget;
  status: string;
  suggestions: string[] | null;
  failedReason: string | null;
}

export interface SaveTranslationsRequest {
  translatedTitle?: string | null;
  translatedSubtitle?: string | null;
  translatedBody?: string | null;
  // 발행용 SEO 키워드. 수집 원본 keywords와 분리해 seo_keywords에 저장한다.
  seoKeywords?: string[] | string | null;
  // AI 재작성 기사 본문(LICENSED 발행용). 편집기에서 검토·수정 후 저장한다.
  rewrittenBody?: string | null;
}

const VALID_REVIEW_STATES: ReadonlySet<string> = new Set(
  Object.values(ARTICLE_REVIEW_STATES)
);

@Injectable()
export class ArticlesService {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: MysqlPool,
    @Inject(TRANSLATE_QUEUE)
    private readonly translateQueue: Queue<TranslateJobData>,
    @Inject(IMAGE_QUEUE)
    private readonly imageQueue: Queue<ImageGenerationJobData>,
    @Inject(CONTENT_QUEUE)
    private readonly contentQueue: Queue<
      ContentGenerationJobData,
      ContentGenerationJobResult
    >
  ) {}

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

  async findById(id: number): Promise<ArticleRow | null> {
    const article = await new ArticlesRepository(this.pool).findById(id);
    if (article?.translated_body) {
      article.translated_body = appendTranslationAttribution(
        article.translated_body,
        article.source_url
      );
    }

    return article;
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

    const job = await this.enqueueBodyTranslation(id);

    return {
      articleId: id,
      queue: QUEUE_NAMES.translate,
      queueJobId: job.id,
      status: "QUEUED"
    };
  }

  // 번역 본문을 근거로 재작성 기사를 생성하는 잡을 큐에 등록한다(LICENSED 발행용).
  async rewriteArticle(id: number): Promise<TranslateBodyResult> {
    const repository = new ArticlesRepository(this.pool);
    const article = await repository.findById(id);
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    const sourceBody =
      article.translated_body || article.original_body || article.body;
    if (!sourceBody) {
      throw new BadRequestException(
        "재작성할 번역 본문이 없습니다. 본문 번역을 먼저 진행하세요."
      );
    }

    const job = await this.enqueueRewrite(id);

    return {
      articleId: id,
      queue: QUEUE_NAMES.translate,
      queueJobId: job.id,
      status: "QUEUED"
    };
  }

  async translateBodies(ids: unknown): Promise<TranslateBodiesResult> {
    const normalizedIds = this.normalizeIds(ids);
    const repository = new ArticlesRepository(this.pool);
    const articles = await repository.findByIds(normalizedIds);
    const articleById = new Map(articles.map((article) => [article.id, article]));

    const queued: TranslateBodiesResult["queued"] = [];
    const skipped: TranslateBodiesResult["skipped"] = [];

    for (const id of normalizedIds) {
      const article = articleById.get(id);
      if (!article) {
        skipped.push({ articleId: id, reason: "NOT_FOUND" });
        continue;
      }

      const sourceBody = article.original_body || article.body;
      if (!sourceBody) {
        skipped.push({ articleId: id, reason: "NO_BODY" });
        continue;
      }

      const job = await this.enqueueBodyTranslation(id);
      queued.push({ articleId: id, queueJobId: job.id });
    }

    return {
      queue: QUEUE_NAMES.translate,
      queued,
      skipped
    };
  }

  async generateCopyrightSafeImage(id: number): Promise<GenerateImageResult> {
    const repository = new ArticlesRepository(this.pool);
    const article = await repository.findById(id);
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    const sourceText = [
      article.translated_title || article.title,
      article.translated_subtitle || article.subtitle,
      article.translated_body || article.original_body || article.body
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!sourceText.trim()) {
      throw new BadRequestException("이미지 생성에 사용할 기사 내용이 없습니다.");
    }

    const job = await this.imageQueue.add(
      "generate-thumbnail",
      {
        articleId: id,
        type: IMAGE_JOB_TYPES.generateThumbnail
      },
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );

    return {
      articleId: id,
      queue: QUEUE_NAMES.image,
      queueJobId: job.id,
      status: "QUEUED"
    };
  }

  async generateContent(
    id: number,
    target: unknown
  ): Promise<GenerateContentResult> {
    const normalizedTarget = this.normalizeContentTarget(target);
    const repository = new ArticlesRepository(this.pool);
    const article = await repository.findById(id);
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    if (
      normalizedTarget === CONTENT_GENERATION_TARGETS.subtitle &&
      article.translated_subtitle
    ) {
      throw new BadRequestException("이미 번역 부제목이 있습니다.");
    }

    if (
      normalizedTarget === CONTENT_GENERATION_TARGETS.keywords &&
      this.normalizeKeywords(article.seo_keywords).length > 0
    ) {
      throw new BadRequestException("이미 키워드가 있습니다.");
    }

    const sourceText = [
      article.translated_title || article.title,
      article.translated_body || article.original_body || article.body
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!sourceText.trim()) {
      throw new BadRequestException("생성에 사용할 기사 내용이 없습니다.");
    }

    const job = await this.contentQueue.add(
      `generate-${normalizedTarget.toLowerCase()}`,
      {
        articleId: id,
        target: normalizedTarget
      },
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );

    return {
      articleId: id,
      target: normalizedTarget,
      queue: QUEUE_NAMES.content,
      queueJobId: job.id,
      status: "QUEUED"
    };
  }

  async getContentGenerationStatus(
    id: number,
    jobId: string
  ): Promise<ContentGenerationStatus> {
    const job = await this.contentQueue.getJob(jobId);
    if (!job || job.data.articleId !== id) {
      throw new NotFoundException("Content generation job not found.");
    }

    const state = await job.getState();
    const returnValue = job.returnvalue as ContentGenerationJobResult | null;

    return {
      articleId: id,
      target: job.data.target,
      status: state,
      suggestions: returnValue?.suggestions ?? null,
      failedReason: job.failedReason || null
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

  private normalizeContentTarget(target: unknown): ContentGenerationTarget {
    if (
      target === CONTENT_GENERATION_TARGETS.subtitle ||
      target === "subtitle"
    ) {
      return CONTENT_GENERATION_TARGETS.subtitle;
    }
    if (
      target === CONTENT_GENERATION_TARGETS.keywords ||
      target === "keywords"
    ) {
      return CONTENT_GENERATION_TARGETS.keywords;
    }

    throw new BadRequestException("지원하지 않는 생성 대상입니다.");
  }

  private normalizeKeywords(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((keyword) => String(keyword).trim())
        .filter((keyword) => keyword.length > 0)
        .slice(0, 20);
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return this.normalizeKeywords(parsed);
        }
      } catch {
        return value
          .split(",")
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)
          .slice(0, 20);
      }
    }

    return [];
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
    const translatedBody = trim(input.translatedBody);
    const seoKeywords =
      input.seoKeywords === undefined
        ? undefined
        : this.normalizeKeywords(input.seoKeywords);

    await repository.updateTranslations(id, {
      translatedTitle: trim(input.translatedTitle),
      translatedSubtitle: trim(input.translatedSubtitle),
      translatedBody:
        typeof translatedBody === "string"
          ? appendTranslationAttribution(translatedBody, article.source_url)
          : translatedBody,
      seoKeywords,
      rewrittenBody: trim(input.rewrittenBody)
    });

    const updated = await repository.findById(id);
    if (!updated) {
      throw new NotFoundException("Article not found.");
    }

    return updated;
  }

  private enqueueBodyTranslation(articleId: number) {
    return this.translateQueue.add(
      "translate-body",
      {
        articleId,
        target: TRANSLATION_TARGETS.body
      },
      {
        // 기사별 고정 jobId로 진행 중(대기·활성·지연)인 같은 기사의 중복 번역 잡을
        // 차단한다(이중 과금·이중 번역 방지). 완료/최종 실패 시 잡을 제거해 jobId를
        // 풀어, 이후 재번역 요청은 정상적으로 새로 등록되게 한다.
        jobId: `translate-body-${articleId}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );
  }

  private enqueueRewrite(articleId: number) {
    return this.translateQueue.add(
      "rewrite-article",
      {
        articleId,
        target: TRANSLATION_TARGETS.rewrite
      },
      {
        // 기사별 고정 jobId로 진행 중 중복 재작성 잡을 차단(이중 과금 방지).
        // 완료/최종 실패 시 잡을 제거해 이후 재생성 요청이 정상 등록되게 한다.
        jobId: `rewrite-${articleId}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );
  }
}
