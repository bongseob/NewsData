import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
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
  async list(
    @Query("status") status?: ArticleStatus,
    @Query("source") source?: ArticleSource,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    const input = {
      status,
      source,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    };
    const [items, total] = await Promise.all([
      this.articlesService.list(input),
      this.articlesService.count(input)
    ]);
    return { items, total };
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

  @Post(":id/translate-body")
  translateBody(@Param("id") id: string) {
    return this.articlesService.translateBody(Number(id));
  }
}
