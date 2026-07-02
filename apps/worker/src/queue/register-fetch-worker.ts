import { Queue, Worker, type ConnectionOptions } from "bullmq";
import {
  JOB_STATUSES,
  QUEUE_NAMES,
  type FetchJobData,
  type ProcessArticleJobData
} from "@newsdata/shared";
import {
  ArticlesRepository,
  createMysqlPool,
  FetchJobsRepository,
  type MysqlPool
} from "@newsdata/db";
import { getSourceAdapter } from "../sources/registry.js";

const pool: MysqlPool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const fetchJobsRepo = new FetchJobsRepository(pool);
const articlesRepo = new ArticlesRepository(pool);

export function registerFetchWorker(connection: ConnectionOptions): Worker {
  const processQueue = new Queue(QUEUE_NAMES.process, { connection });

  const worker = new Worker(
    QUEUE_NAMES.fetch,
    async (job) => {
      const { fetchJobId, source, query } = job.data as FetchJobData;

      const adapter = getSourceAdapter(source);

      const fetchJob = await fetchJobsRepo.findById(fetchJobId);
      if (fetchJob?.status === JOB_STATUSES.canceled) {
        console.log(`[Fetch] Job ${job.id} skipped canceled fetchJobId=${fetchJobId}`);
        return { skipped: true, reason: "canceled" };
      }

      console.log(`[Fetch] Job ${job.id} started source=${source} fetchJobId=${fetchJobId}`);
      await fetchJobsRepo.updateStatus(fetchJobId, JOB_STATUSES.running);

      const articles = await adapter.fetch({ query: query as Record<string, unknown> });

      let totalDuplicates = 0;
      let totalQueued = 0;

      for (const article of articles) {
        const existing = await articlesRepo.findBySourceExternalId(
          article.source,
          article.externalId
        );
        if (existing) {
          totalDuplicates++;
        }

        const jobData: ProcessArticleJobData = { article, fetchJobId };
        // BullMQ 커스텀 잡 ID는 ':'를 포함할 수 없다(예: RSS guid가 URL인 경우).
        const safeExternalId = article.externalId.replace(/[^A-Za-z0-9_-]/g, "_");
        await processQueue.add("process-article", jobData, {
          jobId: `${source}-${fetchJobId}-${safeExternalId}`,
          removeOnComplete: 100,
          removeOnFail: 200
        });
        totalQueued++;
      }

      console.log(
        `[Fetch] Job ${job.id} done collected=${articles.length}, queued=${totalQueued}, existing=${totalDuplicates}`
      );

      await fetchJobsRepo.updateStatus(fetchJobId, JOB_STATUSES.succeeded);

      return {
        totalCollected: articles.length,
        totalQueued,
        totalDuplicates
      };
    },
    {
      connection,
      stalledInterval: 30000
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { fetchJobId } = job.data as FetchJobData;
    console.error(
      `[Fetch] Job ${job.id} FAILED fetchJobId=${fetchJobId}: ${err.message}`
    );
    if (fetchJobId) {
      await fetchJobsRepo.updateStatus(
        fetchJobId,
        JOB_STATUSES.failed,
        err.message
      );
    }
  });

  return worker;
}
