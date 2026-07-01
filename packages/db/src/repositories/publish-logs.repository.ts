import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PublishFailedStep } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface PublishLogRow extends RowDataPacket {
  id: number;
  publish_job_id: number;
  article_id: number;
  status: string;
  failed_step: PublishFailedStep | null;
  idxno: string | null;
  public_url: string | null;
  current_url: string | null;
  error_message: string | null;
  created_at: Date;
  article_title?: string | null;
}

export class PublishLogsRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    publishJobId: number;
    articleId: number;
    status: string;
    failedStep?: PublishFailedStep | null;
    idxno?: string | null;
    publicUrl?: string | null;
    currentUrl?: string | null;
    errorMessage?: string | null;
  }): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO publish_logs (
        publish_job_id,
        article_id,
        status,
        failed_step,
        idxno,
        public_url,
        current_url,
        error_message
      ) VALUES (
        :publishJobId,
        :articleId,
        :status,
        :failedStep,
        :idxno,
        :publicUrl,
        :currentUrl,
        :errorMessage
      )`,
      {
        publishJobId: input.publishJobId,
        articleId: input.articleId,
        status: input.status,
        failedStep: input.failedStep ?? null,
        idxno: input.idxno ?? null,
        publicUrl: input.publicUrl ?? null,
        currentUrl: input.currentUrl ?? null,
        errorMessage: input.errorMessage ?? null
      }
    );

    return result.insertId;
  }
}
