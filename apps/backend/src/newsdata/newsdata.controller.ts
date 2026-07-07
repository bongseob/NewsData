import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { NewsDataPriorityDomain } from "@newsdata/shared";
import { NewsDataService } from "./newsdata.service.js";

@Controller("newsdata")
export class NewsDataController {
  constructor(
    @Inject(NewsDataService) private readonly newsDataService: NewsDataService
  ) {}

  @Get("sources")
  listSources(
    @Query("country") country?: string,
    @Query("category") category?: string,
    @Query("language") language?: string,
    @Query("prioritydomain") prioritydomain?: NewsDataPriorityDomain
  ) {
    return this.newsDataService.listSources({
      country,
      category,
      language,
      prioritydomain
    });
  }
}
