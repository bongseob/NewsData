import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query
} from "@nestjs/common";
import { PublishService } from "./publish.service.js";

@Controller("publish-requests")
export class PublishController {
  constructor(
    @Inject(PublishService) private readonly publishService: PublishService
  ) {}

  @Get()
  list(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.publishService.list({
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  }

  @Get(":id")
  findById(@Param("id", ParseIntPipe) id: number) {
    return this.publishService.findById(id);
  }

  @Post()
  requestPublish(
    @Body() body: { ids?: number[]; requestedBy?: string | null }
  ) {
    return this.publishService.requestPublish(
      body?.ids,
      body?.requestedBy
    );
  }

  @Post(":id/retry")
  retry(@Param("id", ParseIntPipe) id: number) {
    return this.publishService.retry(id);
  }

  @Post(":id/republish")
  republish(@Param("id", ParseIntPipe) id: number) {
    return this.publishService.republish(id);
  }
}
