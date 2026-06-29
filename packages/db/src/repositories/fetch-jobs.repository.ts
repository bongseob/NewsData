import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { ArticleSource, JobStatus, JobTriggerType } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface FetchJobRow extends RowDataPacket {
  id: number;
  source: ArticleSource;
  trigger_type: JobTriggerType;
  status: JobStatus;
  request_payload: unknown | null;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface FetchJobListCountRow extends RowDataPacket {
  total: number;
}

export interface CreateFetchJobInput {
  source: ArticleSource;
  triggerType: JobTriggerType;
  status: JobStatus;
  requestPayload?: unknown | null;
}

export interface ListFetchJobsInput {
  source?: ArticleSource;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}

export class FetchJobsRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateFetchJobInput): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO fetch_jobs (
        source,
        trigger_type,
        status,
        request_payload
      ) VALUES (
        :source,
        :triggerType,
        :status,
        :requestPayload
      )`,
      {
        source: input.source,
        triggerType: input.triggerType,
        status: input.status,
        requestPayload: input.requestPayload
          ? JSON.stringify(input.requestPayload)
          : null
      }
    );

    return result.insertId;
  }

  async findById(id: number): Promise<FetchJobRow | null> {
    const [rows] = await this.db.execute<FetchJobRow[]>(
      "SELECT * FROM fetch_jobs WHERE id = :id LIMIT 1",
      { id }
    );

    return rows[0] ?? null;
  }

  private buildListWhere(input: ListFetchJobsInput): {
    sql: string;
    params: Record<string, string | number>;
  } {
    const where: string[] = [];
    const params: Record<string, string | number> = {};

    if (input.source) {
      where.push("source = :source");
      params.source = input.source;
    }

    if (input.status) {
      where.push("status = :status");
      params.status = input.status;
    }

    return {
      sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
      params
    };
  }

  async list(input: ListFetchJobsInput = {}): Promise<FetchJobRow[]> {
    const { sql: whereSql, params } = this.buildListWhere(input);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    const [rows] = await this.db.execute<FetchJobRow[]>(
      `SELECT *
       FROM fetch_jobs
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return rows;
  }

  async count(input: ListFetchJobsInput = {}): Promise<number> {
    const { sql: whereSql, params } = this.buildListWhere(input);
    const [rows] = await this.db.execute<FetchJobListCountRow[]>(
      `SELECT COUNT(*) AS total FROM fetch_jobs ${whereSql}`,
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
      `UPDATE fetch_jobs
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
}
