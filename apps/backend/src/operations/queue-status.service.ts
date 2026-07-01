import { Inject, Injectable } from "@nestjs/common";
import type { Job, JobType, Queue } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";
import {
  CALLBACK_QUEUE,
  CONTENT_QUEUE,
  FETCH_QUEUE,
  IMAGE_QUEUE,
  PROCESS_QUEUE,
  PUBLISH_QUEUE,
  TRANSLATE_QUEUE
} from "../queue/queue.tokens.js";

const JOB_TYPES: JobType[] = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed"
];

@Injectable()
export class QueueStatusService {
  constructor(
    @Inject(FETCH_QUEUE) private readonly fetchQueue: Queue,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
    @Inject(TRANSLATE_QUEUE) private readonly translateQueue: Queue,
    @Inject(IMAGE_QUEUE) private readonly imageQueue: Queue,
    @Inject(CONTENT_QUEUE) private readonly contentQueue: Queue,
    @Inject(PUBLISH_QUEUE) private readonly publishQueue: Queue,
    @Inject(CALLBACK_QUEUE) private readonly callbackQueue: Queue
  ) {}

  async listQueues() {
    const queues = this.getQueues();

    const items = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [counts, jobs] = await Promise.all([
          queue.getJobCounts(...JOB_TYPES),
          queue.getJobs(JOB_TYPES, 0, 9, true)
        ]);

        return {
          name,
          counts,
          recentJobs: await Promise.all(jobs.map((job) => this.serializeJob(job)))
        };
      })
    );

    return { items };
  }

  private getQueues(): Array<{ name: string; queue: Queue }> {
    return [
      { name: QUEUE_NAMES.fetch, queue: this.fetchQueue },
      { name: QUEUE_NAMES.process, queue: this.processQueue },
      { name: QUEUE_NAMES.translate, queue: this.translateQueue },
      { name: QUEUE_NAMES.image, queue: this.imageQueue },
      { name: QUEUE_NAMES.content, queue: this.contentQueue },
      { name: QUEUE_NAMES.publish, queue: this.publishQueue },
      { name: QUEUE_NAMES.callback, queue: this.callbackQueue }
    ];
  }

  private async serializeJob(job: Job) {
    return {
      id: job.id,
      name: job.name,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || null,
      timestamp: job.timestamp,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      data: job.data
    };
  }
}
