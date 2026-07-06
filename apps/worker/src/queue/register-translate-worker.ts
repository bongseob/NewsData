import { Worker, type ConnectionOptions } from "bullmq";
import {
  appendTranslationAttribution,
  QUEUE_NAMES,
  TRANSLATION_TARGETS,
  type TranslateJobData
} from "@newsdata/shared";
import { ArticlesRepository, createMysqlPool } from "@newsdata/db";
import {
  translateToKorean,
  generateSummaryAndSEO,
  generateRewrittenArticle
} from "../translate/openai.js";

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

      if (
        target !== TRANSLATION_TARGETS.body &&
        target !== TRANSLATION_TARGETS.rewrite
      ) {
        throw new Error(`Unsupported translation target: ${target}`);
      }

      const article = await articlesRepo.findById(articleId);
      if (!article) {
        throw new Error(`Article not found: ${articleId}`);
      }

      // 재작성: 번역 본문을 근거로 자체 문장의 새 기사를 생성한다(LICENSED 발행용).
      if (target === TRANSLATION_TARGETS.rewrite) {
        const translatedBody = article.translated_body || article.original_body || article.body;
        if (!translatedBody) {
          throw new Error(`No source body to rewrite for article: ${articleId}`);
        }
        const rewritten = await generateRewrittenArticle(translatedBody);
        if (!rewritten) {
          throw new Error(`Rewrite returned empty text for article: ${articleId}`);
        }
        await articlesRepo.updateRewrittenBody(articleId, rewritten, new Date());
        console.log(`[Translate] rewritten article generated for ${articleId}`);
        return { articleId, target };
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

      // 본문 번역 결과를 활용해 요약 및 SEO 키워드 동시 생성
      console.log(`[Translate] Generating AI Summary and SEO for article ${articleId}...`);
      const aiResult = await generateSummaryAndSEO(translatedBody).catch((err) => {
        console.error(
          `[Translate] Failed to generate AI summary and SEO: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        return null;
      });

      await articlesRepo.updateBodyTranslation(
        articleId,
        attributedBody,
        new Date(),
        aiResult?.summary || null,
        aiResult?.keywords || null
      );

      console.log(`[Translate] body translated for article ${articleId}`);
      return { articleId, target };
    },
    { connection }
  );
}
