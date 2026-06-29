import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Queue } from "bullmq";
import {
  FetchJobsRepository,
  type FetchJobRow,
  type MysqlPool
} from "@newsdata/db";
import {
  ARTICLE_SOURCES,
  JOB_STATUSES,
  JOB_TRIGGER_TYPES,
  NEWSDATA_CATEGORIES,
  NEWSDATA_PRIORITY_DOMAINS,
  QUEUE_NAMES,
  type ArticleSource,
  type JobStatus,
  type NewsDataFetchQuery
} from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";
import { FETCH_QUEUE } from "../queue/queue.tokens.js";

export interface CreateFetchJobRequest {
  source: ArticleSource;
  query?: Record<string, unknown>;
}

export interface ListFetchJobsRequest {
  source?: ArticleSource;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}

export interface CreateFetchJobResult {
  accepted: true;
  queue: string;
  fetchJobId: number;
  queueJobId: string;
  source: ArticleSource;
  query: NewsDataFetchQuery;
}

export interface CancelFetchJobResult {
  canceled: true;
  fetchJobId: number;
  status: typeof JOB_STATUSES.canceled;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: MysqlPool,
    @Inject(FETCH_QUEUE) private readonly fetchQueue: Queue
  ) {}

  private normalizeNewsDataQuery(query: Record<string, unknown> = {}): NewsDataFetchQuery {
    const allowedKeys = new Set([
      "q",
      "category",
      "country",
      "language",
      "from_date",
      "to_date",
      "domain",
      "domainurl",
      "prioritydomain",
      "removeduplicate",
      "size"
    ]);

    for (const key of Object.keys(query)) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(`Unsupported NewsData.io query field: ${key}`);
      }
    }

    const normalized: NewsDataFetchQuery = {};
    const stringFields = [
      "q",
      "from_date",
      "to_date",
      "domain"
    ] as const;

    for (const field of stringFields) {
      const value = query[field];
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "string") {
        throw new BadRequestException(`${field} must be a string.`);
      }
      normalized[field] = value.trim();
    }

    const category = query.category;
    if (category !== undefined && category !== null && category !== "") {
      if (typeof category !== "string") {
        throw new BadRequestException("category must be a string.");
      }
      normalized.category = this.normalizeCommaSeparatedValues({
        fieldName: "category",
        value: category,
        allowedValues: NEWSDATA_CATEGORIES
      });
    }

    const country = query.country;
    if (country !== undefined && country !== null && country !== "") {
      if (typeof country !== "string") {
        throw new BadRequestException("country must be a string.");
      }
      normalized.country = this.normalizeCommaSeparatedValues({
        fieldName: "country",
        value: country,
        pattern: /^[a-z]{2}$/i
      }).toLowerCase();
    }

    const language = query.language;
    if (language !== undefined && language !== null && language !== "") {
      if (typeof language !== "string") {
        throw new BadRequestException("language must be a string.");
      }
      normalized.language = this.normalizeCommaSeparatedValues({
        fieldName: "language",
        value: language,
        pattern: /^[a-z]{2}$/i
      }).toLowerCase();
    }

    const domainurl = query.domainurl;
    if (domainurl !== undefined && domainurl !== null && domainurl !== "") {
      if (typeof domainurl !== "string") {
        throw new BadRequestException("domainurl must be a string.");
      }
      normalized.domainurl = this.normalizeCommaSeparatedValues({
        fieldName: "domainurl",
        value: domainurl,
        pattern: /^https?:\/\/\S+$/i
      });
    }

    const prioritydomain = query.prioritydomain;
    if (prioritydomain !== undefined && prioritydomain !== null && prioritydomain !== "") {
      if (typeof prioritydomain !== "string") {
        throw new BadRequestException("prioritydomain must be a string.");
      }
      if (!NEWSDATA_PRIORITY_DOMAINS.includes(prioritydomain as never)) {
        throw new BadRequestException("prioritydomain must be top, medium, or low.");
      }
      normalized.prioritydomain = prioritydomain as NewsDataFetchQuery["prioritydomain"];
    }

    if (query.removeduplicate !== undefined && query.removeduplicate !== null && query.removeduplicate !== "") {
      const value = Number(query.removeduplicate);
      if (!Number.isInteger(value) || ![0, 1].includes(value)) {
        throw new BadRequestException("removeduplicate must be 0 or 1.");
      }
      normalized.removeduplicate = value;
    }

    if (query.size !== undefined && query.size !== null && query.size !== "") {
      const value = Number(query.size);
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        throw new BadRequestException("size must be an integer from 1 to 50.");
      }
      normalized.size = value;
    }

    if (normalized.from_date && normalized.to_date && normalized.from_date > normalized.to_date) {
      throw new BadRequestException("from_date must be earlier than or equal to to_date.");
    }

    return normalized;
  }

  private normalizeCommaSeparatedValues(input: {
    fieldName: string;
    value: string;
    allowedValues?: readonly string[];
    pattern?: RegExp;
  }): string {
    const values = input.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (values.length === 0) {
      throw new BadRequestException(`${input.fieldName} must include at least one value.`);
    }

    if (values.length > 5) {
      throw new BadRequestException(`${input.fieldName} can include up to 5 comma-separated values.`);
    }

    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length !== values.length) {
      throw new BadRequestException(`${input.fieldName} must not contain duplicate values.`);
    }

    const allowedValueSet = input.allowedValues
      ? new Set<string>(input.allowedValues)
      : null;
    const invalidAllowedValues = allowedValueSet
      ? values.filter((value) => !allowedValueSet.has(value))
      : [];
    if (invalidAllowedValues.length > 0) {
      throw new BadRequestException(
        `Unsupported NewsData.io ${input.fieldName} value: ${invalidAllowedValues.join(", ")}`
      );
    }

    if (input.pattern) {
      const invalidPatternValues = values.filter((value) => !input.pattern?.test(value));
      if (invalidPatternValues.length > 0) {
        throw new BadRequestException(
          `Invalid ${input.fieldName} value format: ${invalidPatternValues.join(", ")}`
        );
      }
    }

    return values.join(",");
  }

  async createFetchJob(input: CreateFetchJobRequest): Promise<CreateFetchJobResult> {
    if (input.source !== ARTICLE_SOURCES.newsdata) {
      throw new BadRequestException("Manual fetch currently supports only NEWSDATA.");
    }

    const query = this.normalizeNewsDataQuery(input.query);
    const fetchJobId = await new FetchJobsRepository(this.pool).create({
      source: input.source,
      triggerType: JOB_TRIGGER_TYPES.manual,
      status: JOB_STATUSES.pending,
      requestPayload: query
    });

    const queueJobId = `fetch-${fetchJobId}`;
    await this.fetchQueue.add(
      "manual-fetch",
      {
        fetchJobId,
        source: input.source,
        query
      },
      {
        jobId: queueJobId
      }
    );

    return {
      accepted: true,
      queue: QUEUE_NAMES.fetch,
      fetchJobId,
      queueJobId,
      source: input.source,
      query
    };
  }

  async listFetchJobs(input: ListFetchJobsRequest): Promise<{ items: FetchJobRow[]; total: number }> {
    if (input.source && input.source !== ARTICLE_SOURCES.newsdata) {
      throw new BadRequestException("Fetch job list currently supports only NEWSDATA filtering.");
    }

    const repository = new FetchJobsRepository(this.pool);
    const [items, total] = await Promise.all([
      repository.list(input),
      repository.count(input)
    ]);

    return { items, total };
  }

  findFetchJob(id: number): Promise<FetchJobRow | null> {
    return new FetchJobsRepository(this.pool).findById(id);
  }

  async cancelFetchJob(id: number): Promise<CancelFetchJobResult> {
    const repository = new FetchJobsRepository(this.pool);
    const fetchJob = await repository.findById(id);
    if (!fetchJob) {
      throw new NotFoundException("Fetch job not found.");
    }

    if (fetchJob.status === JOB_STATUSES.canceled) {
      return {
        canceled: true,
        fetchJobId: id,
        status: JOB_STATUSES.canceled
      };
    }

    if (fetchJob.status !== JOB_STATUSES.pending) {
      throw new BadRequestException("Only pending fetch jobs can be canceled.");
    }

    const queueJob = await this.fetchQueue.getJob(`fetch-${id}`);
    if (queueJob) {
      await queueJob.remove();
    }

    await repository.updateStatus(id, JOB_STATUSES.canceled, "Canceled by user.");

    return {
      canceled: true,
      fetchJobId: id,
      status: JOB_STATUSES.canceled
    };
  }
}
