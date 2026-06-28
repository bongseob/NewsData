import { Worker, Queue, type ConnectionOptions } from "bullmq";
import axios from "axios";
import {
  QUEUE_NAMES,
  ARTICLE_SOURCES,
  JOB_STATUSES,
  type NewsDataResponse,
  type NewsDataFetchQuery,
  type FetchJobData
} from "@newsdata/shared";
import {
  createMysqlPool,
  FetchJobsRepository,
  type MysqlPool
} from "@newsdata/db";

const MAX_PAGES = 5;

// ── DB pool (워커 전역에서 재사용) ──────────────────────────────────
const pool: MysqlPool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const fetchJobsRepo = new FetchJobsRepository(pool);

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function buildNewsDataUrl(
  apiKey: string,
  query: NewsDataFetchQuery,
  nextPage?: string
): string {
  const params = new URLSearchParams();
  params.set("apikey", apiKey);

  if (nextPage) {
    params.set("page", nextPage);
  } else {
    if (query.q) params.set("q", query.q);
    if (query.category) params.set("category", query.category);
    if (query.country) params.set("country", query.country);
    if (query.language) params.set("language", query.language);
    if (query.from_date) params.set("from_date", query.from_date);
    if (query.to_date) params.set("to_date", query.to_date);
    if (query.domain) params.set("domain", query.domain);
    if (query.removeduplicate !== undefined)
      params.set("removeduplicate", String(query.removeduplicate));
    if (query.size) params.set("size", String(query.size));
  }

  return `https://newsdata.io/api/1/news?${params.toString()}`;
}

// ────────────────────────────────────────────────────────────────────
// Worker
// ────────────────────────────────────────────────────────────────────

export function registerFetchWorker(connection: ConnectionOptions): Worker {
  const processQueue = new Queue(QUEUE_NAMES.process, { connection });

  const worker = new Worker(
    QUEUE_NAMES.fetch,
    async (job) => {
      const { fetchJobId, source, query } = job.data as FetchJobData;

      if (source !== ARTICLE_SOURCES.newsdata) {
        throw new Error(`Unsupported source for this worker: ${source}`);
      }

      const apiKey = process.env.NEWSDATA_API_KEY;
      if (!apiKey) {
        throw new Error("NEWSDATA_API_KEY is not set");
      }

      console.log(`[Fetch] Job ${job.id} started — fetchJobId=${fetchJobId}`);

      // 1. fetch_jobs 상태를 RUNNING으로 변경
      await fetchJobsRepo.updateStatus(fetchJobId, JOB_STATUSES.running);

      const fetchQuery: NewsDataFetchQuery = query as NewsDataFetchQuery;
      let nextPage: string | undefined;
      let totalCollected = 0;
      let totalDuplicates = 0;
      let pageNum = 0;

      // 2. 페이지네이션 루프
      while (pageNum < MAX_PAGES) {
        const url = buildNewsDataUrl(apiKey, fetchQuery, nextPage);
        console.log(`[Fetch] Page ${pageNum + 1} — GET ${url}`);

        const response = await axios.get<NewsDataResponse>(url, {
          timeout: 15000,
          validateStatus: (status) => status >= 200 && status < 300
        });

        const data = response.data;

        // API 수준 에러 체크
        if (data.status && data.status !== "success") {
          throw new Error(
            `NewsData.io API returned status: ${data.status}`
          );
        }

        const articles = data.results ?? [];
        if (articles.length === 0) {
          console.log(`[Fetch] No more results on page ${pageNum + 1}.`);
          break;
        }

        // 3. 수집된 각 기사 → process 큐에 적재
        for (const article of articles) {
          await processQueue.add(
            "process-article",
            {
              source: ARTICLE_SOURCES.newsdata,
              articleData: article,
              fetchJobId
            },
            {
              jobId: `newsdata-${article.article_id}`,
              // 동일 article_id 중복 적재 방지
              removeOnComplete: 100,
              removeOnFail: 200
            }
          );
          totalCollected++;
        }

        // 4. 다음 페이지 확인
        nextPage = data.nextPage ?? undefined;
        if (!nextPage) {
          console.log(`[Fetch] No nextPage token — pagination complete.`);
          break;
        }

        pageNum++;
      }

      console.log(
        `[Fetch] Job ${job.id} done — collected=${totalCollected}, duplicates=${totalDuplicates}, pages=${pageNum + 1}`
      );

      // 5. fetch_jobs → SUCCEEDED
      await fetchJobsRepo.updateStatus(fetchJobId, JOB_STATUSES.succeeded);

      return { totalCollected, totalDuplicates, pages: pageNum + 1 };
    },
    {
      connection,
      stalledInterval: 30000
    }
  );

  // Worker 레벨 에러 핸들링
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { fetchJobId } = job.data as FetchJobData;
    console.error(
      `[Fetch] Job ${job.id} FAILED — fetchJobId=${fetchJobId}: ${err.message}`
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
