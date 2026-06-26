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

export interface CreateFetchJobInput {
  source: ArticleSource;
  triggerType: JobTriggerType;
  status: JobStatus;
  requestPayload?: Record<string, unknown> | null;
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
}
