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

export interface ListArticlesInput {
  status?: ArticleStatus;
  source?: ArticleSource;
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

  async list(input: ListArticlesInput = {}): Promise<ArticleRow[]> {
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    if (input.status) {
      where.push("a.status = :status");
      params.status = input.status;
    }

    if (input.source) {
      where.push("a.source = :source");
      params.source = input.source;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
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

  async countByStatus(): Promise<ArticleStatusCountRow[]> {
    const [rows] = await this.db.execute<ArticleStatusCountRow[]>(
      `SELECT status, COUNT(*) AS count
       FROM articles
       GROUP BY status
       ORDER BY status`
    );

    return rows;
  }
}
