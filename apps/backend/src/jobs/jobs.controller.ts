import { Body, Controller, Inject, Post } from "@nestjs/common";
import type { ArticleSource } from "@newsdata/shared";
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
}
