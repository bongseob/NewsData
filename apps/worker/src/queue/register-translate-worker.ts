import { Worker, type ConnectionOptions } from "bullmq";
import {
  appendTranslationAttribution,
  QUEUE_NAMES,
  TRANSLATION_TARGETS,
  type TranslateJobData
} from "@newsdata/shared";
import { ArticlesRepository, createMysqlPool } from "@newsdata/db";
import { translateToKorean } from "../translate/openai.js";

const pool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const articlesRepo = new ArticlesRepository(pool);

export function registerTranslateWorker(
  connection: ConnectionOptions
): Worker<TranslateJobData> {
  return new Worker<TranslateJobData>(
    QUEUE_NAMES.translate,
    async (job) => {
      const { articleId, target } = job.data;
      console.log(`[Translate] job accepted: ${job.id}`, job.data);

      if (target !== TRANSLATION_TARGETS.body) {
        throw new Error(`Unsupported translation target: ${target}`);
      }

      const article = await articlesRepo.findById(articleId);
      if (!article) {
        throw new Error(`Article not found: ${articleId}`);
      }

      const sourceBody = article.original_body || article.body;
      if (!sourceBody) {
        throw new Error(`No source body is available for article: ${articleId}`);
      }

      const translatedBody = await translateToKorean(sourceBody);
      if (!translatedBody) {
        throw new Error(`Translation returned empty body for article: ${articleId}`);
      }

      const attributedBody = appendTranslationAttribution(
        translatedBody,
        article.source_url
      );

      await articlesRepo.updateBodyTranslation(
        articleId,
        attributedBody,
        new Date()
      );

      console.log(`[Translate] body translated for article ${articleId}`);
      return { articleId, target };
    },
    { connection }
  );
}
