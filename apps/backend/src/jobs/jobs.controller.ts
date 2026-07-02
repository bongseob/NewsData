import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import type { ArticleSource, JobStatus } from "@newsdata/shared";
import { JobsService } from "./jobs.service.js";

interface CreateFetchJobRequest {
  source: ArticleSource;
  query?: Record<string, unknown>;
}

@Controller("jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Post("fetch")
  createFetchJob(@Body() body: CreateFetchJobRequest) {
    return this.jobsService.createFetchJob(body);
  }

  @Get("fetch")
  listFetchJobs(
    @Query("source") source?: ArticleSource,
    @Query("status") status?: JobStatus,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.jobsService.listFetchJobs({
      source,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  }

  @Get("fetch/:id")
  async findFetchJob(@Param("id", ParseIntPipe) id: number) {
    const job = await this.jobsService.findFetchJob(id);
    if (!job) {
      throw new NotFoundException("Fetch job not found.");
    }
    return job;
  }

  @Post("fetch/:id/cancel")
  cancelFetchJob(@Param("id", ParseIntPipe) id: number) {
    return this.jobsService.cancelFetchJob(id);
  }

  @Post("presets")
  createPreset(@Body() body: { name: string; source: string; query: Record<string, unknown> }) {
    return this.jobsService.createPreset(body.name, body.source, body.query);
  }

  @Get("presets")
  listPresets(@Query("source") source: string) {
    return this.jobsService.listPresets(source);
  }

  @Delete("presets/:id")
  deletePreset(@Param("id", ParseIntPipe) id: number) {
    return this.jobsService.deletePreset(id);
  }

  @Patch("fetch/:id")
  updateFetchJob(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { query: Record<string, unknown> }
  ) {
    return this.jobsService.updateFetchJob(id, body.query);
  }

  @Post("fetch/:id/submit")
  submitFetchJob(@Param("id", ParseIntPipe) id: number) {
    return this.jobsService.submitFetchJob(id);
  }
}
