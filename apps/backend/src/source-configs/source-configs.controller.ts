import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post
} from "@nestjs/common";
import type { ArticleSource } from "@newsdata/shared";
import { SourceConfigsService } from "./source-configs.service.js";

interface CreateConfigBody {
  source: ArticleSource;
  name: string;
  enabled?: boolean;
  autoFetchEnabled?: boolean;
  autoPublishEnabled?: boolean;
  fetchIntervalMinutes?: number | null;
  query?: Record<string, unknown> | null;
}

interface UpdateConfigBody {
  name?: string;
  enabled?: boolean;
  autoFetchEnabled?: boolean;
  autoPublishEnabled?: boolean;
  fetchIntervalMinutes?: number | null;
  query?: Record<string, unknown> | null;
}

@Controller("source-configs")
export class SourceConfigsController {
  constructor(
    @Inject(SourceConfigsService)
    private readonly service: SourceConfigsService
  ) {}

  @Get()
  list() {
    return this.service.findAll();
  }

  @Get(":id")
  async findById(@Param("id", ParseIntPipe) id: number) {
    const config = await this.service.findById(id);
    if (!config) {
      throw new NotFoundException("Source config not found.");
    }
    return config;
  }

  @Post()
  create(@Body() body: CreateConfigBody) {
    if (!body.source || !body.name?.trim()) {
      throw new BadRequestException("source and name are required.");
    }
    return this.service.create(body);
  }

  @Patch(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateConfigBody
  ) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.service.delete(id);
    return { deleted: true, id };
  }
}
