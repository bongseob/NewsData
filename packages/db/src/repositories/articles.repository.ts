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
}
