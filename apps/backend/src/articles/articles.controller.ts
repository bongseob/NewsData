import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import type {
  ArticleReviewState,
  ArticleSource,
  ArticleStatus
} from "@newsdata/shared";
import { ArticlesService } from "./articles.service.js";

@Controller("articles")
export class ArticlesController {
  constructor(
    @Inject(ArticlesService) private readonly articlesService: ArticlesService
  ) {}

  @Get()
  async list(
    @Query("status") status?: ArticleStatus,
    @Query("reviewState") reviewState?: ArticleReviewState,
    @Query("source") source?: ArticleSource,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    const input = {
      status,
      reviewState,
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

  @Post("review-state")
  setReviewState(
    @Body() body: { ids: number[]; reviewState: string }
  ) {
    return this.articlesService.setReviewState(body?.ids, body?.reviewState);
  }

  @Post("mark-ready")
  markReadyToPublish(@Body() body: { ids: number[] }) {
    return this.articlesService.markReadyToPublish(body?.ids);
  }

  @Post("unmark-ready")
  revertReadyToDraft(@Body() body: { ids: number[] }) {
    return this.articlesService.revertReadyToDraft(body?.ids);
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

  @Patch(":id/translations")
  saveTranslations(
    @Param("id") id: string,
    @Body()
    body: {
      translatedTitle?: string | null;
      translatedSubtitle?: string | null;
      translatedBody?: string | null;
    }
  ) {
    return this.articlesService.saveTranslations(Number(id), body ?? {});
  }
}
