import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
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
}
