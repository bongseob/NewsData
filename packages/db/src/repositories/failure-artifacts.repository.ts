import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PublishFailedStep } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface FailureArtifactRow extends RowDataPacket {
  id: number;
  article_id: number | null;
  publish_job_id: number | null;
  failed_step: PublishFailedStep | string;
  screenshot_path: string | null;
  html_snapshot_path: string | null;
  current_url: string | null;
  error_message: string;
  created_at: Date;
  article_title?: string | null;
  publish_status?: string | null;
}

export interface FailureArtifactCountRow extends RowDataPacket {
  total: number;
}

export interface ListFailureArtifactsInput {
  limit?: number;
  offset?: number;
}

export class FailureArtifactsRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    articleId?: number | null;
    publishJobId?: number | null;
    failedStep: PublishFailedStep | string;
    screenshotPath?: string | null;
    htmlSnapshotPath?: string | null;
    currentUrl?: string | null;
    errorMessage: string;
  }): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO failure_artifacts (
        article_id,
        publish_job_id,
        failed_step,
        screenshot_path,
        html_snapshot_path,
        current_url,
        error_message
      ) VALUES (
        :articleId,
        :publishJobId,
        :failedStep,
        :screenshotPath,
        :htmlSnapshotPath,
        :currentUrl,
        :errorMessage
      )`,
      {
        articleId: input.articleId ?? null,
        publishJobId: input.publishJobId ?? null,
        failedStep: input.failedStep,
        screenshotPath: input.screenshotPath ?? null,
        htmlSnapshotPath: input.htmlSnapshotPath ?? null,
        currentUrl: input.currentUrl ?? null,
        errorMessage: input.errorMessage
      }
    );

    return result.insertId;
  }

  async list(input: ListFailureArtifactsInput = {}): Promise<FailureArtifactRow[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    const [rows] = await this.db.execute<FailureArtifactRow[]>(
      `SELECT fa.*,
              a.title AS article_title,
              pj.status AS publish_status
       FROM failure_artifacts fa
       LEFT JOIN articles a ON a.id = fa.article_id
       LEFT JOIN publish_jobs pj ON pj.id = fa.publish_job_id
       ORDER BY fa.created_at DESC, fa.id DESC
       LIMIT ${limit} OFFSET ${offset}`
    );

    return rows;
  }

  async count(): Promise<number> {
    const [rows] = await this.db.execute<FailureArtifactCountRow[]>(
      "SELECT COUNT(*) AS total FROM failure_artifacts"
    );

    return rows[0]?.total ?? 0;
  }
}
