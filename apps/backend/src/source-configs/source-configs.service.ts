import { Inject, Injectable } from "@nestjs/common";
import {
  SourceConfigsRepository,
  type MysqlPool,
  type SourceConfigRow
} from "@newsdata/db";
import type { ArticleSource } from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";

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

@Injectable()
export class SourceConfigsService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: MysqlPool) {}

  findAll(): Promise<SourceConfigRow[]> {
    return new SourceConfigsRepository(this.pool).findAll();
  }

  findById(id: number): Promise<SourceConfigRow | null> {
    return new SourceConfigsRepository(this.pool).findById(id);
  }

  async create(input: CreateSourceConfigInput): Promise<{ id: number }> {
    const id = await new SourceConfigsRepository(this.pool).create(input);
    return { id };
  }

  async update(id: number, input: UpdateSourceConfigInput): Promise<void> {
    await new SourceConfigsRepository(this.pool).update(id, input);
  }

  async delete(id: number): Promise<void> {
    await new SourceConfigsRepository(this.pool).delete(id);
  }
}
