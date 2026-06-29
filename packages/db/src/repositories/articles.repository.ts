import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { ArticleSource, ArticleStatus } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface ArticleRow extends RowDataPacket {
  id: number;
  source: ArticleSource;
  external_id: string;
  status: ArticleStatus;
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
  source?: ArticleSource;
  search?: string;
  limit?: number;
  offset?: number;
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
           body = :translatedBody,
           body_translated_at = :translatedAt,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = :id`,
      { id, translatedBody, translatedAt }
    );
  }
}
