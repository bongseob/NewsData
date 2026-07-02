import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile
} from "@nestjs/common";
import { createReadStream, existsSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  ArticleReviewState,
  ArticleSource,
  ArticleStatus
} from "@newsdata/shared";
import type { ArticleSortColumn, ArticleSortOrder } from "@newsdata/db";
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
    @Query("fetchJobId") fetchJobId?: string,
    @Query("sort") sort?: string,
    @Query("order") order?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    const input = {
      status,
      reviewState,
      source,
      search,
      fetchJobId: fetchJobId ? Number(fetchJobId) : undefined,
      sort: sort as ArticleSortColumn | undefined,
      order: order as ArticleSortOrder | undefined,
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

  @Get("review-counts")
  countByReviewState() {
    return this.articlesService.countByReviewState();
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

  @Post("translate-bodies")
  translateBodies(@Body() body: { ids: number[] }) {
    return this.articlesService.translateBodies(body?.ids);
  }

  @Get(":id")
  async findById(@Param("id") id: string) {
    const article = await this.articlesService.findById(Number(id));
    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    return article;
  }

  @Get(":id/thumbnail/download")
  async downloadThumbnail(
    @Param("id") id: string,
    @Res({ passthrough: true })
    res: { setHeader(name: string, value: string): void }
  ) {
    const article = await this.articlesService.findById(Number(id));
    if (!article?.thumbnail_local_path || !article.thumbnail_is_generated) {
      throw new NotFoundException("Generated thumbnail not found.");
    }

    const filename = basename(article.thumbnail_local_path);
    const filePath = join(process.cwd(), "uploads", "thumbnails", filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException("Generated thumbnail file not found.");
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return new StreamableFile(createReadStream(filePath));
  }

  @Post(":id/translate-body")
  translateBody(@Param("id") id: string) {
    return this.articlesService.translateBody(Number(id));
  }

  @Post(":id/generate-image")
  generateCopyrightSafeImage(@Param("id") id: string) {
    return this.articlesService.generateCopyrightSafeImage(Number(id));
  }

  @Post(":id/generate-content")
  generateContent(
    @Param("id") id: string,
    @Body() body: { target?: string }
  ) {
    return this.articlesService.generateContent(Number(id), body?.target);
  }

  @Get(":id/generate-content/:jobId")
  getContentGenerationStatus(
    @Param("id") id: string,
    @Param("jobId") jobId: string
  ) {
    return this.articlesService.getContentGenerationStatus(Number(id), jobId);
  }

  @Patch(":id/translations")
  saveTranslations(
    @Param("id") id: string,
    @Body()
    body: {
      translatedTitle?: string | null;
      translatedSubtitle?: string | null;
      translatedBody?: string | null;
      keywords?: string[] | string | null;
    }
  ) {
    return this.articlesService.saveTranslations(Number(id), body ?? {});
  }
}
