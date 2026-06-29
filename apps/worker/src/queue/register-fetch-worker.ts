import { Queue, Worker, type ConnectionOptions } from "bullmq";
import axios from "axios";
import {
  ARTICLE_SOURCES,
  JOB_STATUSES,
  QUEUE_NAMES,
  type FetchJobData,
  type NewsDataFetchQuery,
  type NewsDataResponse
} from "@newsdata/shared";
import {
  ArticlesRepository,
  createMysqlPool,
  FetchJobsRepository,
  type MysqlPool
} from "@newsdata/db";

const MAX_PAGES = 5;

const pool: MysqlPool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const fetchJobsRepo = new FetchJobsRepository(pool);
const articlesRepo = new ArticlesRepository(pool);

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
    if (query.domainurl) params.set("domainurl", query.domainurl);
    if (query.prioritydomain) params.set("prioritydomain", query.prioritydomain);
    if (query.removeduplicate !== undefined) {
      params.set("removeduplicate", String(query.removeduplicate));
    }
    if (query.size) params.set("size", String(query.size));
  }

  return `https://newsdata.io/api/1/news?${params.toString()}`;
}

function redactApiKey(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("apikey")) {
    parsed.searchParams.set("apikey", "[redacted]");
  }
  return parsed.toString();
}

export function registerFetchWorker(connection: ConnectionOptions): Worker {
  const processQueue = new Queue(QUEUE_NAMES.process, { connection });

  const worker = new Worker(
    QUEUE_NAMES.fetch,
    async (job) => {
      const { fetchJobId, source, query } = job.data as FetchJobData;

      if (source !== ARTICLE_SOURCES.newsdata) {
        throw new Error(`Unsupported source for this worker: ${source}`);
      }

      const fetchJob = await fetchJobsRepo.findById(fetchJobId);
      if (fetchJob?.status === JOB_STATUSES.canceled) {
        console.log(`[Fetch] Job ${job.id} skipped canceled fetchJobId=${fetchJobId}`);
        return {
          skipped: true,
          reason: "canceled"
        };
      }

      const apiKey = process.env.NEWSDATA_API_KEY;
      if (!apiKey) {
        throw new Error("NEWSDATA_API_KEY is not set");
      }

      console.log(`[Fetch] Job ${job.id} started fetchJobId=${fetchJobId}`);
      await fetchJobsRepo.updateStatus(fetchJobId, JOB_STATUSES.running);

      const fetchQuery = query as NewsDataFetchQuery;
      let nextPage: string | undefined;
      let pageNum = 0;
      let pagesFetched = 0;
      let totalCollected = 0;
      let totalDuplicates = 0;
      let totalQueued = 0;

      while (pageNum < MAX_PAGES) {
        const url = buildNewsDataUrl(apiKey, fetchQuery, nextPage);
        console.log(`[Fetch] Page ${pageNum + 1} GET ${redactApiKey(url)}`);

        const response = await axios.get<NewsDataResponse>(url, {
          timeout: 15000,
          validateStatus: (status) => status >= 200 && status < 300
        });

        const data = response.data;
        if (data.status && data.status !== "success") {
          throw new Error(`NewsData.io API returned status: ${data.status}`);
        }

        pagesFetched++;
        const articles = data.results ?? [];
        if (articles.length === 0) {
          console.log(`[Fetch] No more results on page ${pageNum + 1}.`);
          break;
        }

        for (const article of articles) {
          if (!article.article_id) {
            console.warn("[Fetch] Skipping NewsData.io article without article_id.");
            continue;
          }

          const existing = await articlesRepo.findBySourceExternalId(
            ARTICLE_SOURCES.newsdata,
            article.article_id
          );
          if (existing) {
            totalDuplicates++;
          }

          await processQueue.add(
            "process-article",
            {
              source: ARTICLE_SOURCES.newsdata,
              articleData: article,
              fetchJobId
            },
            {
              jobId: `newsdata-${fetchJobId}-${article.article_id}`,
              removeOnComplete: 100,
              removeOnFail: 200
            }
          );
          totalCollected++;
          totalQueued++;
        }

        nextPage = data.nextPage ?? undefined;
        if (!nextPage) {
          console.log("[Fetch] No nextPage token. Pagination complete.");
          break;
        }

        pageNum++;
      }

      console.log(
        `[Fetch] Job ${job.id} done collected=${totalCollected}, queued=${totalQueued}, existing=${totalDuplicates}, pages=${pagesFetched}`
      );

      await fetchJobsRepo.updateStatus(fetchJobId, JOB_STATUSES.succeeded);

      return { totalCollected, totalQueued, totalDuplicates, pages: pagesFetched };
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
