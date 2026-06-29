import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { ArticleSource } from "@newsdata/shared";
import type { MysqlConnection, MysqlPool } from "../pool.js";

type Db = MysqlPool | MysqlConnection;

export interface SourceConfigRow extends RowDataPacket {
  id: number;
  source: ArticleSource;
  name: string;
  enabled: number;
  auto_fetch_enabled: number;
  auto_publish_enabled: number;
  fetch_interval_minutes: number | null;
  query: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSourceConfigInput {
  source: ArticleSource;
  name: string;
  enabled?: boolean;
  autoFetchEnabled?: boolean;
  autoPublishEnabled?: boolean;
  fetchIntervalMinutes?: number | null;
  query?: Record<string, unknown> | null;
}

export interface UpdateSourceConfigInput {
  name?: string;
  enabled?: boolean;
  autoFetchEnabled?: boolean;
  autoPublishEnabled?: boolean;
  fetchIntervalMinutes?: number | null;
  query?: Record<string, unknown> | null;
}

export class SourceConfigsRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<SourceConfigRow[]> {
    const [rows] = await this.db.execute<SourceConfigRow[]>(
      "SELECT * FROM source_configs ORDER BY source, id"
    );
    return rows;
  }

  async findById(id: number): Promise<SourceConfigRow | null> {
    const [rows] = await this.db.execute<SourceConfigRow[]>(
      "SELECT * FROM source_configs WHERE id = :id LIMIT 1",
      { id }
    );
    return rows[0] ?? null;
  }

  async create(input: CreateSourceConfigInput): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO source_configs (
        source, name, enabled,
        auto_fetch_enabled, auto_publish_enabled,
        fetch_interval_minutes, query
      ) VALUES (
        :source, :name, :enabled,
        :autoFetchEnabled, :autoPublishEnabled,
        :fetchIntervalMinutes, :query
      )`,
      {
        source: input.source,
        name: input.name,
        enabled: input.enabled ? 1 : 0,
        autoFetchEnabled: input.autoFetchEnabled ? 1 : 0,
        autoPublishEnabled: input.autoPublishEnabled ? 1 : 0,
        fetchIntervalMinutes: input.fetchIntervalMinutes ?? null,
        query: input.query ? JSON.stringify(input.query) : null
      }
    );
    return result.insertId;
  }

  async update(id: number, input: UpdateSourceConfigInput): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, string | number | null> = { id };

    if (input.name !== undefined) {
      sets.push("name = :name");
      params.name = input.name;
    }
    if (input.enabled !== undefined) {
      sets.push("enabled = :enabled");
      params.enabled = input.enabled ? 1 : 0;
    }
    if (input.autoFetchEnabled !== undefined) {
      sets.push("auto_fetch_enabled = :autoFetchEnabled");
      params.autoFetchEnabled = input.autoFetchEnabled ? 1 : 0;
    }
    if (input.autoPublishEnabled !== undefined) {
      sets.push("auto_publish_enabled = :autoPublishEnabled");
      params.autoPublishEnabled = input.autoPublishEnabled ? 1 : 0;
    }
    if (input.fetchIntervalMinutes !== undefined) {
      sets.push("fetch_interval_minutes = :fetchIntervalMinutes");
      params.fetchIntervalMinutes = input.fetchIntervalMinutes;
    }
    if (input.query !== undefined) {
      sets.push("query = :query");
      params.query = input.query ? JSON.stringify(input.query) : null;
    }

    if (sets.length === 0) return;

    await this.db.execute(
      `UPDATE source_configs SET ${sets.join(", ")} WHERE id = :id`,
      params
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(
      "DELETE FROM source_configs WHERE id = :id",
      { id }
    );
  }
}
