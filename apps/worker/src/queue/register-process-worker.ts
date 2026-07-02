import { Worker, type ConnectionOptions } from "bullmq";
import {
  QUEUE_NAMES,
  ARTICLE_STATUSES,
  type ProcessArticleJobData
} from "@newsdata/shared";
import {
  createMysqlPool,
  ArticlesRepository,
  ArticleAssetsRepository
} from "@newsdata/db";
import axios from "axios";
import sharp from "sharp";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { crawlArticle } from "../crawl/crawl-article.js";
import { translateToKorean } from "../translate/openai.js";

// ────────────────────────────────────────────────────────────────────
// DB pool
// ────────────────────────────────────────────────────────────────────

const pool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const articlesRepo = new ArticlesRepository(pool);
const assetsRepo = new ArticleAssetsRepository(pool);

/**
 * 워커의 cwd는 apps/worker 이므로, 백엔드가 서빙하는
 * apps/backend/uploads/thumbnails 까지의 절대경로를 계산한다.
 */
const THUMBNAIL_DIR = resolve(
  process.cwd(),
  "..",
  "backend",
  "uploads",
  "thumbnails"
);

// ────────────────────────────────────────────────────────────────────
// Worker
// ────────────────────────────────────────────────────────────────────

export function registerProcessWorker(
  connection: ConnectionOptions
): Worker {
  return new Worker(
    QUEUE_NAMES.process,
    async (job) => {
      console.log(`[Process] job accepted: ${job.id}`);
      const { article, fetchJobId } = job.data as ProcessArticleJobData;

      const externalId = article.externalId;
      const title = article.title;
      const subtitle = article.summary;
      const publisherCredit = article.publisher || "출처 미상";
      const sourceUrl = article.url || null;
      const pressTime = article.pressTime ? new Date(article.pressTime) : null;
      const imageUrl = article.imageUrl;
      const keywords = article.keywords;
      const country = article.country ? article.country.substring(0, 255) : null;

      // 1. 본문 확보: 소스가 본문을 제공하면 사용, 없으면 원문 크롤, 최종 fallback은 요약.
      let body: string | null = article.body;
      if (!body && sourceUrl) {
        console.log(`[Process] Crawling original article: ${sourceUrl}`);
        const crawled = await crawlArticle(sourceUrl, {
          userAgent: article.crawlUserAgent ?? undefined
        });
        if (crawled?.content) {
          body = crawled.content;
          console.log(
            `[Process] Crawled ${crawled.length} chars from ${sourceUrl}`
          );
        } else {
          console.warn(`[Process] Crawl failed, falling back to summary`);
        }
      }
      if (!body) body = subtitle;

      // 2. Translate title only. Body translation is triggered manually from admin UI.
      console.log(`[Process] Translating title only for article ${externalId}...`);
      const translatedTitle = await translateToKorean(title, {
        fallbackToOriginal: true
      });
      const storedTitle = translatedTitle || title || "No Title";

      // 3. Upsert Article (DRAFT)
      const articleId = await articlesRepo.upsertCollectedArticle({
        source: article.source,
        externalId,
        status: ARTICLE_STATUSES.draft,
        title: storedTitle.substring(0, 500),
        subtitle: subtitle ? subtitle.substring(0, 500) : null,
        body,
        originalTitle: title ? title.substring(0, 500) : null,
        originalSubtitle: subtitle ? subtitle.substring(0, 500) : null,
        originalBody: body,
        translatedTitle: translatedTitle
          ? translatedTitle.substring(0, 500)
          : null,
        translatedSubtitle: null,
        translatedBody: null,
        titleTranslatedAt: translatedTitle ? new Date() : null,
        bodyTranslatedAt: null,
        keywords,
        publisherCredit,
        country,
        sourceUrl,
        pressTime,
        rawPayload: article.rawPayload,
        fetchJobId: fetchJobId ?? null,
        licensePolicy: article.licensePolicy,
        canonicalUrl: article.canonicalUrl
      });

      console.log(
        `[Process] Upserted article ${externalId} -> ID ${articleId}`
      );

      // 4. Download and resize image (thumbnail policy)
      if (imageUrl) {
        try {
          const imageRes = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 10000
          });
          const buffer = Buffer.from(imageRes.data, "binary");

          const resizedImage = sharp(buffer)
            .resize(800, 600, {
              fit: "inside",
              withoutEnlargement: true
            });

          const metadata = await resizedImage.metadata();
          const width = metadata.width || 800;
          const height = metadata.height || 600;

          // 이미지 높이의 8% 정도로 바 높이 설정 (최소 30px)
          const barHeight = Math.max(Math.round(height * 0.08), 30);
          const fontSize = Math.max(Math.round(barHeight * 0.5), 12);
          const watermarkText = `출처: ${publisherCredit || "NewsData.io"}`;

          // XML 이스케이프 처리
          const escapedText = watermarkText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

          const svgOverlay = `
            <svg width="${width}" height="${height}">
              <rect x="0" y="${height - barHeight}" width="${width}" height="${barHeight}" fill="rgba(0, 0, 0, 0.5)" />
              <text x="${width - 15}" y="${height - (barHeight / 2) + (fontSize / 3.5)}" 
                    font-family="Sans-Serif, Arial" 
                    font-size="${fontSize}" 
                    fill="white" 
                    text-anchor="end" 
                    font-weight="bold">${escapedText}</text>
            </svg>
          `;

          const resizedBuffer = await resizedImage
            .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
            .jpeg({ quality: 80 })
            .toBuffer();

          await mkdir(THUMBNAIL_DIR, { recursive: true });

          const filename = `${externalId}-${randomUUID()}.jpg`;
          const localPath = join(THUMBNAIL_DIR, filename);

          await writeFile(localPath, resizedBuffer);

          await assetsRepo.create({
            articleId,
            assetType: "THUMBNAIL",
            sourceUrl: imageUrl,
            localPath: filename,
            contentType: "image/jpeg",
            byteSize: resizedBuffer.length
          });

          console.log(
            `[Process] Saved thumbnail for ${externalId} -> ${localPath}`
          );
        } catch (error) {
          console.error(
            `[Process] Image failed for ${externalId}:`,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      }
    },
    { connection }
  );
}
