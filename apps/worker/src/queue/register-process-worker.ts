import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES, ARTICLE_SOURCES, ARTICLE_STATUSES } from "@newsdata/shared";
import { createMysqlPool, ArticlesRepository, ArticleAssetsRepository } from "@newsdata/db";
import axios from "axios";
import sharp from "sharp";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function translateToKorean(text: string | null): Promise<string | null> {
  if (!text) return null;
  
  const deeplApiKey = process.env.DEEPL_API_KEY;
  if (!deeplApiKey) {
    console.warn("[Translate] DEEPL_API_KEY is not set. Skipping translation and saving original text.");
    return text;
  }

  try {
    const isPro = !deeplApiKey.endsWith(':fx');
    const apiUrl = isPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';
    
    const response = await axios.post(apiUrl, {
      text: [text],
      target_lang: 'KO'
    }, {
      headers: {
        'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.translations[0].text;
  } catch (error) {
    console.error("[Translate] Translation failed, returning original:", error instanceof Error ? error.message : "Unknown error");
    return text; // Fallback to original text if translation fails
  }
}

const pool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "root",
  database: process.env.MYSQL_DATABASE || "newsdata",
});

const articlesRepo = new ArticlesRepository(pool);
const assetsRepo = new ArticleAssetsRepository(pool);

export function registerProcessWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    QUEUE_NAMES.process,
    async (job) => {
      console.log(`process job accepted: ${job.id}`);
      const { source, articleData } = job.data;
      
      if (source !== ARTICLE_SOURCES.newsdata) {
        console.log(`Ignored source: ${source}`);
        return;
      }
      
      const externalId = articleData.article_id;
      const title = articleData.title;
      const subtitle = articleData.description || null;
      const body = articleData.content || articleData.description || null;
      const publisherCredit = articleData.source_id || "NewsData.io";
      const sourceUrl = articleData.link || null;
      const pressTime = articleData.pubDate ? new Date(articleData.pubDate) : null;
      const imageUrl = articleData.image_url;

      // 1. 번역 수행 (영문 -> 국문)
      console.log(`Translating article ${externalId}...`);
      const translatedTitle = await translateToKorean(title);
      const translatedSubtitle = await translateToKorean(subtitle);
      const translatedBody = await translateToKorean(body);

      // 2. Insert/Update Article (DRAFT)
      const articleId = await articlesRepo.upsertCollectedArticle({
        source: ARTICLE_SOURCES.newsdata,
        externalId,
        status: ARTICLE_STATUSES.draft,
        title: translatedTitle ? translatedTitle.substring(0, 500) : "No Title",
        subtitle: translatedSubtitle ? translatedSubtitle.substring(0, 500) : null,
        body: translatedBody,
        publisherCredit,
        sourceUrl,
        pressTime,
        rawPayload: JSON.stringify(articleData),
      });

      console.log(`Upserted article ${externalId} with ID ${articleId}`);

      // 3. Download and Resize Image
      if (imageUrl) {
        try {
          const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
          const buffer = Buffer.from(imageRes.data, 'binary');
          
          const resizedBuffer = await sharp(buffer)
            .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

          // Note: Save to backend's uploads folder so ServeStaticModule can serve them
          const uploadsDir = join(process.cwd(), "apps", "backend", "uploads", "thumbnails");
          await mkdir(uploadsDir, { recursive: true });
          
          const filename = `${externalId}-${randomUUID()}.jpg`;
          const localPath = join(uploadsDir, filename);
          
          await writeFile(localPath, resizedBuffer);

          await assetsRepo.create({
            articleId,
            assetType: "THUMBNAIL",
            sourceUrl: imageUrl,
            localPath: localPath,
            contentType: "image/jpeg",
            byteSize: resizedBuffer.length
          });
          console.log(`Saved thumbnail for article ${externalId} to ${localPath}`);
        } catch (error) {
          console.error(`Failed to process image for article ${externalId}:`, error instanceof Error ? error.message : "Unknown error");
        }
      }
    },
    { connection }
  );
}
