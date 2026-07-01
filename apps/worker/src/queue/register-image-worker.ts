import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Worker, type ConnectionOptions } from "bullmq";
import {
  IMAGE_JOB_TYPES,
  QUEUE_NAMES,
  type ImageGenerationJobData
} from "@newsdata/shared";
import {
  ArticleAssetsRepository,
  ArticlesRepository,
  createMysqlPool
} from "@newsdata/db";
import sharp from "sharp";

interface OpenAIImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
  };
}

const pool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const articlesRepo = new ArticlesRepository(pool);
const assetsRepo = new ArticleAssetsRepository(pool);

const THUMBNAIL_DIR = resolve(
  process.cwd(),
  "..",
  "backend",
  "uploads",
  "thumbnails"
);

function buildPrompt(input: {
  title: string;
  subtitle: string | null;
  body: string | null;
  country: string | null;
}): string {
  const bodyExcerpt = input.body ? input.body.slice(0, 1400) : "";

  return [
    "Create a copyright-safe editorial news thumbnail image for the article below.",
    "Do not include text, captions, logos, watermarks, brand marks, UI screenshots, or recognizable real people.",
    "Prefer compositions with no people. If people are contextually necessary, show only non-identifiable figures such as backs, silhouettes, hands, or distant crowds; do not show clear faces.",
    input.country
      ? `Use visual context appropriate to the article's publication country or region: ${input.country}. Reflect local setting cues such as architecture, streets, landscape, business environment, or public spaces when relevant, without stereotypes.`
      : "Use neutral location cues when the publication country is unavailable.",
    "Use a realistic, neutral, documentary-style composition that visually matches the article topic.",
    "The image should be suitable for a Korean news website thumbnail.",
    "",
    `Title: ${input.title}`,
    input.subtitle ? `Subtitle: ${input.subtitle}` : "",
    input.country ? `Publication country/region: ${input.country}` : "",
    bodyExcerpt ? `Article excerpt: ${bodyExcerpt}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image download failed with status ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for generated thumbnails.");
  }

  const model = process.env.IMAGE_GENERATION_MODEL || "gpt-image-1";
  const size = process.env.IMAGE_GENERATION_SIZE || "1536x1024";
  const endpoint =
    process.env.OPENAI_IMAGE_GENERATION_URL ||
    "https://api.openai.com/v1/images/generations";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      size
    })
  });

  const payload = (await res.json()) as OpenAIImageResponse;
  if (!res.ok) {
    throw new Error(
      payload.error?.message || `Image generation failed with status ${res.status}`
    );
  }

  const image = payload.data?.[0];
  if (image?.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }
  if (image?.url) {
    return downloadImage(image.url);
  }

  throw new Error("Image generation response did not contain image data.");
}

export function registerImageWorker(
  connection: ConnectionOptions
): Worker<ImageGenerationJobData> {
  return new Worker<ImageGenerationJobData>(
    QUEUE_NAMES.image,
    async (job) => {
      const { articleId, type } = job.data;
      console.log(`[Image] job accepted: ${job.id}`, job.data);

      if (type !== IMAGE_JOB_TYPES.generateThumbnail) {
        throw new Error(`Unsupported image job type: ${type}`);
      }

      const article = await articlesRepo.findById(articleId);
      if (!article) {
        throw new Error(`Article not found: ${articleId}`);
      }

      const prompt = buildPrompt({
        title: article.translated_title || article.title,
        subtitle: article.translated_subtitle || article.subtitle,
        body: article.translated_body || article.original_body || article.body,
        country: article.country
      });

      const generated = await generateImage(prompt);
      const thumbnail = await sharp(generated)
        .resize(800, 600, {
          fit: "inside",
          withoutEnlargement: true
        })
        .jpeg({ quality: 86 })
        .toBuffer();

      await mkdir(THUMBNAIL_DIR, { recursive: true });

      const filename = `${articleId}-generated-${randomUUID()}.jpg`;
      const localPath = join(THUMBNAIL_DIR, filename);
      await writeFile(localPath, thumbnail);

      await assetsRepo.create({
        articleId,
        assetType: "THUMBNAIL",
        sourceUrl: `generated:${process.env.IMAGE_GENERATION_MODEL || "gpt-image-1"}`,
        localPath: filename,
        contentType: "image/jpeg",
        byteSize: thumbnail.length
      });

      console.log(`[Image] generated thumbnail for article ${articleId}`);
      return { articleId, filename };
    },
    { connection }
  );
}
