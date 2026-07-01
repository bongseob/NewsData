import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { JobStatus } from "@newsdata/shared";
import { JOB_STATUSES } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface PublishJobRow extends RowDataPacket {
  id: number;
  article_id: number;
  status: JobStatus | string;
  requested_by: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  article_title?: string | null;
  article_status?: string | null;
  publisher_credit?: string | null;
  source_url?: string | null;
  public_url?: string | null;
}

export interface PublishJobCountRow extends RowDataPacket {
  total: number;
}

export interface ListPublishJobsInput {
  status?: string;
  limit?: number;
  offset?: number;
}

export class PublishJobsRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    articleId: number;
    status?: JobStatus;
    requestedBy?: string | null;
  }): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO publish_jobs (
        article_id,
        status,
        requested_by
      ) VALUES (
        :articleId,
        :status,
        :requestedBy
      )`,
      {
        articleId: input.articleId,
        status: input.status ?? JOB_STATUSES.pending,
        requestedBy: input.requestedBy ?? null
      }
    );

    return result.insertId;
  }

  async findById(id: number): Promise<PublishJobRow | null> {
    const [rows] = await this.db.execute<PublishJobRow[]>(
      `SELECT pj.*,
              a.title AS article_title,
              a.status AS article_status,
              a.publisher_credit,
              a.source_url,
              a.public_url
       FROM publish_jobs pj
       JOIN articles a ON a.id = pj.article_id
       WHERE pj.id = :id
       LIMIT 1`,
      { id }
    );

    return rows[0] ?? null;
  }

  async hasActiveJob(articleId: number): Promise<boolean> {
    const [rows] = await this.db.execute<PublishJobCountRow[]>(
      `SELECT COUNT(*) AS total
       FROM publish_jobs
       WHERE article_id = :articleId
         AND status IN (:pending, :running, :retrying)`,
      {
        articleId,
        pending: JOB_STATUSES.pending,
        running: JOB_STATUSES.running,
        retrying: JOB_STATUSES.retrying
      }
    );

    return (rows[0]?.total ?? 0) > 0;
  }

  async list(input: ListPublishJobsInput = {}): Promise<PublishJobRow[]> {
    const { sql: whereSql, params } = this.buildListWhere(input);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    const [rows] = await this.db.execute<PublishJobRow[]>(
      `SELECT pj.*,
              a.title AS article_title,
              a.status AS article_status,
              a.publisher_credit,
              a.source_url,
              a.public_url
       FROM publish_jobs pj
       JOIN articles a ON a.id = pj.article_id
       ${whereSql}
       ORDER BY pj.created_at DESC, pj.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return rows;
  }

  async count(input: ListPublishJobsInput = {}): Promise<number> {
    const { sql: whereSql, params } = this.buildListWhere(input);
    const [rows] = await this.db.execute<PublishJobCountRow[]>(
      `SELECT COUNT(*) AS total
       FROM publish_jobs pj
       JOIN articles a ON a.id = pj.article_id
       ${whereSql}`,
      params
    );

    return rows[0]?.total ?? 0;
  }

  async updateStatus(
    id: number,
    status: JobStatus,
    errorMessage?: string | null
  ): Promise<void> {
    await this.db.execute(
      `UPDATE publish_jobs
       SET status = :status,
           error_message = :errorMessage,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = :id`,
      {
        id,
        status,
        errorMessage: errorMessage ?? null
      }
    );
  }

  async incrementRetryCount(id: number): Promise<void> {
    await this.db.execute(
      `UPDATE publish_jobs
       SET retry_count = retry_count + 1,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = :id`,
      { id }
    );
  }

  private buildListWhere(input: ListPublishJobsInput): {
    sql: string;
    params: Record<string, string>;
  } {
    const where: string[] = [];
    const params: Record<string, string> = {};

    if (input.status) {
      where.push("pj.status = :status");
      params.status = input.status;
    }

    return {
      sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
      params
    };
  }
}
