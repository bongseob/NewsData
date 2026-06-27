import { Worker, Queue, type ConnectionOptions } from "bullmq";
import axios from "axios";
import { QUEUE_NAMES, ARTICLE_SOURCES } from "@newsdata/shared";

export function registerFetchWorker(connection: ConnectionOptions): Worker {
  const processQueue = new Queue(QUEUE_NAMES.process, { connection });

  return new Worker(
    QUEUE_NAMES.fetch,
    async (job) => {
      console.log(`fetch job accepted: ${job.id}`);
      const apiKey = process.env.NEWSDATA_API_KEY;
      if (!apiKey) {
        throw new Error("NEWSDATA_API_KEY is not set");
      }

      // Query setup: AI (especially Physical AI) or Macroeconomics, Language English
      const query = `("Physical AI" OR AI OR Macroeconomics)`;
      const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=en`;
      
      console.log(`Fetching from NewsData.io: ${url}`);
      const response = await axios.get(url);
      const articles = response.data.results || [];
      
      console.log(`Fetched ${articles.length} articles`);
      
      for (const article of articles) {
        await processQueue.add("process-article", {
          source: ARTICLE_SOURCES.newsdata,
          articleData: article,
        });
      }
    },
    { connection }
  );
}
