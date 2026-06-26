import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query
} from "@nestjs/common";
import type { ArticleSource, ArticleStatus } from "@newsdata/shared";
import { ArticlesService } from "./articles.service.js";

@Controller("articles")
export class ArticlesController {
  constructor(
    @Inject(ArticlesService) private readonly articlesService: ArticlesService
  ) {}

  @Get()
  list(
    @Query("status") status?: ArticleStatus,
    @Query("source") source?: ArticleSource,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.articlesService.list({
      status,
      source,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  }

  @Get("status-counts")
  countByStatus() {
    return this.articlesService.countByStatus();
  }

  @Get(":id")
  async findById(@Param("id") id: string) {
    const article = await this.articlesService.findById(Number(id));
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    return article;
  }
}
