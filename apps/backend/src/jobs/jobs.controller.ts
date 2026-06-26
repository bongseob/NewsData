import { Body, Controller, Post } from "@nestjs/common";
import { QUEUE_NAMES, type ArticleSource } from "@newsdata/shared";

interface CreateFetchJobRequest {
  source: ArticleSource;
  query?: Record<string, unknown>;
}

@Controller("jobs")
export class JobsController {
  @Post("fetch")
  createFetchJob(@Body() body: CreateFetchJobRequest): {
    queue: string;
    accepted: true;
    source: ArticleSource;
  } {
    return {
      queue: QUEUE_NAMES.fetch,
      accepted: true,
      source: body.source
    };
  }
}
