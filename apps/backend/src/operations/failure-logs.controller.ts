import { Controller, Get, Inject, Query } from "@nestjs/common";
import { FailureLogsService } from "./failure-logs.service.js";

@Controller("failure-logs")
export class FailureLogsController {
  constructor(
    @Inject(FailureLogsService)
    private readonly failureLogsService: FailureLogsService
  ) {}

  @Get()
  list(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.failureLogsService.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  }
}
