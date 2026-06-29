import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type {
  ArticleReviewState,
  ArticleSource,
  ArticleStatus
} from "@newsdata/shared";
import { ARTICLE_REVIEW_STATES, ARTICLE_STATUSES } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface ArticleRow extends RowDataPacket {
  id: number;
  source: ArticleSource;
  external_id: string;
  status: ArticleStatus;
  review_state: ArticleReviewState;
  title: string;
  subtitle: string | null;
  body: string | null;
  original_title: string | null;
  original_subtitle: string | null;
  original_body: string | null;
  translated_title: string | null;
  translated_subtitle: string | null;
  translated_body: string | null;
  title_translated_at: Date | null;
  body_translated_at: Date | null;
  publisher_credit: string | null;
  country: string | null;
  source_url: string | null;
  public_url: string | null;
  press_time: Date | null;
  raw_payload: unknown;
  created_at: Date;
  updated_at: Date;
  thumbnail_local_path?: string | null;
}

export interface ArticleStatusCountRow extends RowDataPacket {
  status: ArticleStatus;
  count: number;
}

export interface ArticleListCountRow extends RowDataPacket {
  total: number;
}

export interface ListArticlesInput {
  status?: ArticleStatus;
  reviewState?: ArticleReviewState;
  source?: ArticleSource;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateTranslationsInput {
  translatedTitle?: string | null;
  translatedSubtitle?: string | null;
  translatedBody?: string | null;
}

export interface UpsertArticleInput {
  source: ArticleSource;
  externalId: string;
  status: ArticleStatus;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  originalTitle?: string | null;
  originalSubtitle?: string | null;
  originalBody?: string | null;
  translatedTitle?: string | null;
  translatedSubtitle?: string | null;
  translatedBody?: string | null;
  titleTranslatedAt?: Date | null;
  bodyTranslatedAt?: Date | null;
  publisherCredit?: string | null;
  country?: string | null;
  sourceUrl?: string | null;
  pressTime?: Date | null;
  rawPayload: unknown;
}

export class ArticlesRepository {
  constructor(private readonly db: Db) {}

  async findById(id: number): Promise<ArticleRow | null> {
    const [rows] = await this.db.execute<ArticleRow[]>(
      "SELECT * FROM articles WHERE id = :id LIMIT 1",
      { id }
    );

    return rows[0] ?? null;
  }

  async findBySourceExternalId(
    source: ArticleSource,
    externalId: string
  ): Promise<ArticleRow | null> {
    const [rows] = await this.db.execute<ArticleRow[]>(
      "SELECT * FROM articles WHERE source = :source AND external_id = :externalId LIMIT 1",
      { source, externalId }
    );

    return rows[0] ?? null;
  }

  async upsertCollectedArticle(input: UpsertArticleInput): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO articles (
        source,
        external_id,
        status,
        title,
        subtitle,
        body,
        original_title,
        original_subtitle,
        original_body,
        translated_title,
        translated_subtitle,
        translated_body,
        title_translated_at,
        body_translated_at,
        publisher_credit,
        country,
        source_url,
        press_time,
        raw_payload
      ) VALUES (
        :source,
        :externalId,
        :status,
        :title,
        :subtitle,
        :body,
        :originalTitle,
        :originalSubtitle,
        :originalBody,
        :translatedTitle,
        :translatedSubtitle,
        :translatedBody,
        :titleTranslatedAt,
        :bodyTranslatedAt,
        :publisherCredit,
        :country,
        :sourceUrl,
        :pressTime,
        :rawPayload
      )
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        body = VALUES(body),
        original_title = VALUES(original_title),
        original_subtitle = VALUES(original_subtitle),
        original_body = VALUES(original_body),
        translated_title = VALUES(translated_title),
        translated_subtitle = VALUES(translated_subtitle),
        translated_body = VALUES(translated_body),
        title_translated_at = VALUES(title_translated_at),
        body_translated_at = VALUES(body_translated_at),
        publisher_credit = VALUES(publisher_credit),
        country = VALUES(country),
        source_url = VALUES(source_url),
        press_time = VALUES(press_time),
        raw_payload = VALUES(raw_payload),
        updated_at = CURRENT_TIMESTAMP(3)`,
      {
        source: input.source,
        externalId: input.externalId,
        status: input.status,
        title: input.title,
        subtitle: input.subtitle ?? null,
        body: input.body ?? null,
        originalTitle: input.originalTitle ?? null,
        originalSubtitle: input.originalSubtitle ?? null,
        originalBody: input.originalBody ?? null,
        translatedTitle: input.translatedTitle ?? null,
        translatedSubtitle: input.translatedSubtitle ?? null,
        translatedBody: input.translatedBody ?? null,
        titleTranslatedAt: input.titleTranslatedAt ?? null,
        bodyTranslatedAt: input.bodyTranslatedAt ?? null,
        publisherCredit: input.publisherCredit ?? null,
        country: input.country ?? null,
        sourceUrl: input.sourceUrl ?? null,
        pressTime: input.pressTime ?? null,
        rawPayload: JSON.stringify(input.rawPayload)
      }
    );

    if (result.insertId > 0) {
      return result.insertId;
    }

    const existing = await this.findBySourceExternalId(input.source, input.externalId);
    if (!existing) {
      throw new Error("Article upsert succeeded but article could not be reloaded.");
    }

    return existing.id;
  }

  private buildListWhere(input: ListArticlesInput): { sql: string; params: Record<string, string | number> } {
    const where: string[] = [];
    const params: Record<string, string | number> = {};

    if (input.status) {
      where.push("a.status = :status");
      params.status = input.status;
    }

    if (input.reviewState) {
      where.push("a.review_state = :reviewState");
      params.reviewState = input.reviewState;
    } else {
      // 제외(EXCLUDED) 기사는 명시적으로 요청할 때만 노출한다.
      where.push("a.review_state <> :excludedReviewState");
      params.excludedReviewState = ARTICLE_REVIEW_STATES.excluded;
    }

    if (input.source) {
      where.push("a.source = :source");
      params.source = input.source;
    }

    if (input.search) {
      where.push("(a.title LIKE :search OR a.publisher_credit LIKE :search)");
      params.search = `%${input.search}%`;
    }

    const sql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    return { sql, params };
  }

  async list(input: ListArticlesInput = {}): Promise<ArticleRow[]> {
    const { sql: whereSql, params } = this.buildListWhere(input);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    const [rows] = await this.db.execute<ArticleRow[]>(
      `SELECT a.*, aa.local_path as thumbnail_local_path
       FROM articles a
       LEFT JOIN article_assets aa ON a.id = aa.article_id AND aa.asset_type = 'THUMBNAIL'
       ${whereSql}
       ORDER BY a.updated_at DESC, a.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return rows;
  }

  async count(input: ListArticlesInput = {}): Promise<number> {
    const { sql: whereSql, params } = this.buildListWhere(input);

    const [rows] = await this.db.execute<ArticleListCountRow[]>(
      `SELECT COUNT(*) AS total FROM articles a ${whereSql}`,
      params
    );

    return rows[0]?.total ?? 0;
  }

  async countByStatus(): Promise<ArticleStatusCountRow[]> {
    const [rows] = await this.db.execute<ArticleStatusCountRow[]>(
      `SELECT status, COUNT(*) AS count
       FROM articles
       GROUP BY status
       ORDER BY status`
    );

    return rows;
  }

  async updateBodyTranslation(
    id: number,
    translatedBody: string,
    translatedAt: Date
  ): Promise<void> {
    await this.db.execute(
      `UPDATE articles
       SET translated_body = :translatedBody,
           body_translated_at = :translatedAt,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = :id`,
      { id, translatedBody, translatedAt }
    );
  }

  /**
   * 번역문 수동 편집을 저장한다. 전달된 필드만 갱신한다.
   * 제목/본문 번역 갱신 시 각 *_translated_at 도 현재 시각으로 갱신한다.
   */
  async updateTranslations(
    id: number,
    input: UpdateTranslationsInput
  ): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, string | number | null | Date> = { id };

    if (input.translatedTitle !== undefined) {
      sets.push("translated_title = :translatedTitle");
      sets.push("title_translated_at = CURRENT_TIMESTAMP(3)");
      params.translatedTitle = input.translatedTitle;
    }
    if (input.translatedSubtitle !== undefined) {
      sets.push("translated_subtitle = :translatedSubtitle");
      params.translatedSubtitle = input.translatedSubtitle;
    }
    if (input.translatedBody !== undefined) {
      sets.push("translated_body = :translatedBody");
      sets.push("body_translated_at = CURRENT_TIMESTAMP(3)");
      params.translatedBody = input.translatedBody;
    }

    if (sets.length === 0) {
      return;
    }

    sets.push("updated_at = CURRENT_TIMESTAMP(3)");

    await this.db.execute(
      `UPDATE articles SET ${sets.join(", ")} WHERE id = :id`,
      params
    );
  }

  /**
   * 여러 기사의 선별 상태(review_state)를 일괄 갱신한다.
   * @returns 실제로 갱신된 행 수
   */
  async updateReviewState(
    ids: number[],
    reviewState: ArticleReviewState
  ): Promise<number> {
    const { clause, params } = this.buildIdInClause(ids);
    if (!clause) {
      return 0;
    }

    const [result] = await this.db.execute<ResultSetHeader>(
      `UPDATE articles
       SET review_state = :reviewState,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id IN (${clause})`,
      { ...params, reviewState }
    );

    return result.affectedRows;
  }

  /**
   * 최종 발행 대상으로 확정한다.
   * SELECTED + DRAFT 인 기사만 READY_TO_PUBLISH 로 전환한다(잘못된 전환 방지).
   * @returns 실제로 전환된 행 수
   */
  async markReadyToPublish(ids: number[]): Promise<number> {
    const { clause, params } = this.buildIdInClause(ids);
    if (!clause) {
      return 0;
    }

    const [result] = await this.db.execute<ResultSetHeader>(
      `UPDATE articles
       SET status = :readyStatus,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id IN (${clause})
         AND review_state = :selectedReviewState
         AND status = :draftStatus`,
      {
        ...params,
        readyStatus: ARTICLE_STATUSES.readyToPublish,
        selectedReviewState: ARTICLE_REVIEW_STATES.selected,
        draftStatus: ARTICLE_STATUSES.draft
      }
    );

    return result.affectedRows;
  }

  /**
   * 발행 대상(READY_TO_PUBLISH)을 다시 선별 단계로 되돌린다.
   * READY_TO_PUBLISH 인 행만 DRAFT 로 전환하고 review_state 는 SELECTED 로 둔다.
   * @returns 실제로 전환된 행 수
   */
  async revertReadyToDraft(ids: number[]): Promise<number> {
    const { clause, params } = this.buildIdInClause(ids);
    if (!clause) {
      return 0;
    }

    const [result] = await this.db.execute<ResultSetHeader>(
      `UPDATE articles
       SET status = :draftStatus,
           review_state = :selectedReviewState,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id IN (${clause})
         AND status = :readyStatus`,
      {
        ...params,
        draftStatus: ARTICLE_STATUSES.draft,
        selectedReviewState: ARTICLE_REVIEW_STATES.selected,
        readyStatus: ARTICLE_STATUSES.readyToPublish
      }
    );

    return result.affectedRows;
  }

  private buildIdInClause(ids: number[]): {
    clause: string;
    params: Record<string, number>;
  } {
    const params: Record<string, number> = {};
    const placeholders: string[] = [];

    ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .forEach((id, index) => {
        const key = `id${index}`;
        params[key] = id;
        placeholders.push(`:${key}`);
      });

    return { clause: placeholders.join(", "), params };
  }
}
