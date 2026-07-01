import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  ArticlesRepository,
  PublishJobsRepository,
  type MysqlPool,
  type PublishJobRow
} from "@newsdata/db";
import {
  ARTICLE_STATUSES,
  JOB_STATUSES,
  QUEUE_NAMES,
  type PublishJobData
} from "@newsdata/shared";
import { MYSQL_POOL } from "../database/database.tokens.js";
import { PUBLISH_QUEUE } from "../queue/queue.tokens.js";

export interface PublishRequestResult {
  queue: string;
  queued: Array<{
    articleId: number;
    publishJobId: number;
    queueJobId: string | undefined;
  }>;
  skipped: Array<{
    articleId: number;
    reason: string;
  }>;
}

@Injectable()
export class PublishService {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: MysqlPool,
    @Inject(PUBLISH_QUEUE) private readonly publishQueue: Queue<PublishJobData>
  ) {}

  async list(input: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: PublishJobRow[]; total: number }> {
    const repository = new PublishJobsRepository(this.pool);
    const [items, total] = await Promise.all([
      repository.list(input),
      repository.count(input)
    ]);

    return { items, total };
  }

  async findById(id: number): Promise<PublishJobRow> {
    const job = await new PublishJobsRepository(this.pool).findById(id);
    if (!job) {
      throw new NotFoundException("Publish job not found.");
    }

    return job;
  }

  async requestPublish(
    ids: unknown,
    requestedBy?: string | null
  ): Promise<PublishRequestResult> {
    const normalizedIds = this.normalizeIds(ids);
    const articlesRepository = new ArticlesRepository(this.pool);
    const publishJobsRepository = new PublishJobsRepository(this.pool);
    const articles = await articlesRepository.findByIds(normalizedIds);
    const articleById = new Map(articles.map((article) => [article.id, article]));

    const queued: PublishRequestResult["queued"] = [];
    const skipped: PublishRequestResult["skipped"] = [];

    for (const id of normalizedIds) {
      const article = articleById.get(id);
      if (!article) {
        skipped.push({ articleId: id, reason: "NOT_FOUND" });
        continue;
      }

      if (article.status !== ARTICLE_STATUSES.readyToPublish) {
        skipped.push({ articleId: id, reason: "NOT_READY_TO_PUBLISH" });
        continue;
      }

      if (await publishJobsRepository.hasActiveJob(id)) {
        skipped.push({ articleId: id, reason: "ACTIVE_PUBLISH_JOB_EXISTS" });
        continue;
      }

      const publishJobId = await publishJobsRepository.create({
        articleId: id,
        status: JOB_STATUSES.pending,
        requestedBy: requestedBy?.trim() || null
      });
      const queueJobId = `publish-${publishJobId}`;
      const job = await this.publishQueue.add(
        "publish-article",
        { articleId: id, publishJobId },
        {
          jobId: queueJobId,
          attempts: 2,
          backoff: {
            type: "exponential",
            delay: 30000
          }
        }
      );

      queued.push({ articleId: id, publishJobId, queueJobId: job.id });
    }

    return {
      queue: QUEUE_NAMES.publish,
      queued,
      skipped
    };
  }

  async retry(id: number): Promise<{
    publishJobId: number;
    queue: string;
    queueJobId: string | undefined;
    status: "QUEUED";
  }> {
    const repository = new PublishJobsRepository(this.pool);
    const publishJob = await repository.findById(id);
    if (!publishJob) {
      throw new NotFoundException("Publish job not found.");
    }

    if (publishJob.status !== JOB_STATUSES.failed) {
      throw new BadRequestException("Only failed publish jobs can be retried.");
    }

    await repository.incrementRetryCount(id);
    await repository.updateStatus(id, JOB_STATUSES.pending, null);
    const job = await this.publishQueue.add(
      "publish-article",
      { articleId: publishJob.article_id, publishJobId: id },
      {
        jobId: `publish-${id}-retry-${Date.now()}`,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );

    return {
      publishJobId: id,
      queue: QUEUE_NAMES.publish,
      queueJobId: job.id,
      status: "QUEUED"
    };
  }

  /**
   * 이미 발행(또는 실패)된 기사를 다시 발행 요청한다.
   * 기사 상태를 발행 대기로 되돌리고 새 발행 job을 생성한다.
   */
  async republish(id: number): Promise<{
    publishJobId: number;
    articleId: number;
    queue: string;
    queueJobId: string | undefined;
    status: "QUEUED";
  }> {
    const publishJobsRepository = new PublishJobsRepository(this.pool);
    const articlesRepository = new ArticlesRepository(this.pool);

    const publishJob = await publishJobsRepository.findById(id);
    if (!publishJob) {
      throw new NotFoundException("Publish job not found.");
    }

    const articleId = publishJob.article_id;
    if (await publishJobsRepository.hasActiveJob(articleId)) {
      throw new BadRequestException(
        "이미 진행 중인 발행 작업이 있어 재발행할 수 없습니다."
      );
    }

    // 재발행을 위해 기사 상태를 발행 대기로 되돌린다.
    await articlesRepository.updateStatus(
      articleId,
      ARTICLE_STATUSES.readyToPublish
    );

    const publishJobId = await publishJobsRepository.create({
      articleId,
      status: JOB_STATUSES.pending,
      requestedBy: publishJob.requested_by
    });
    const queueJobId = `publish-${publishJobId}`;
    const job = await this.publishQueue.add(
      "publish-article",
      { articleId, publishJobId },
      {
        jobId: queueJobId,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );

    return {
      publishJobId,
      articleId,
      queue: QUEUE_NAMES.publish,
      queueJobId: job.id,
      status: "QUEUED"
    };
  }

  private normalizeIds(ids: unknown): number[] {
    if (!Array.isArray(ids)) {
      throw new BadRequestException("ids must be an array.");
    }

    const normalized = Array.from(
      new Set(
        ids
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    if (normalized.length === 0) {
      throw new BadRequestException("No valid article ids were provided.");
    }

    return normalized;
  }
}
