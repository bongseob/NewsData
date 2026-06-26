import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import {
  FetchJobsRepository,
  type MysqlPool
} from "@newsdata/db";
import {
  JOB_STATUSES,
  JOB_TRIGGER_TYPES,
  QUEUE_NAMES,
  type ArticleSource
} from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";
import { FETCH_QUEUE } from "../queue/queue.tokens.js";

export interface CreateFetchJobRequest {
  source: ArticleSource;
  query?: Record<string, unknown>;
}

export interface CreateFetchJobResult {
  accepted: true;
  queue: string;
  fetchJobId: number;
  queueJobId: string;
  source: ArticleSource;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: MysqlPool,
    @Inject(FETCH_QUEUE) private readonly fetchQueue: Queue
  ) {}

  async createFetchJob(input: CreateFetchJobRequest): Promise<CreateFetchJobResult> {
    const fetchJobId = await new FetchJobsRepository(this.pool).create({
      source: input.source,
      triggerType: JOB_TRIGGER_TYPES.manual,
      status: JOB_STATUSES.pending,
      requestPayload: input.query ?? null
    });

    const queueJob = await this.fetchQueue.add("manual-fetch", {
      fetchJobId,
      source: input.source,
      query: input.query ?? {}
    });

    return {
      accepted: true,
      queue: QUEUE_NAMES.fetch,
      fetchJobId,
      queueJobId: String(queueJob.id),
      source: input.source
    };
  }
}
