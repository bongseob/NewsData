import { Inject, Injectable } from "@nestjs/common";
import {
  ArticlesRepository,
  type ArticleRow,
  type ArticleStatusCountRow,
  type MysqlPool
} from "@newsdata/db";
import type { ArticleSource, ArticleStatus } from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";

export interface ListArticlesRequest {
  status?: ArticleStatus;
  source?: ArticleSource;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ArticlesService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: MysqlPool) {}

  list(input: ListArticlesRequest): Promise<ArticleRow[]> {
    return new ArticlesRepository(this.pool).list(input);
  }

  countByStatus(): Promise<ArticleStatusCountRow[]> {
    return new ArticlesRepository(this.pool).countByStatus();
  }

  findById(id: number): Promise<ArticleRow | null> {
    return new ArticlesRepository(this.pool).findById(id);
  }
}
