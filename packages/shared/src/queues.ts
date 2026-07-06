export const QUEUE_NAMES = {
  fetch: "fetch",
  process: "process",
  translate: "translate",
  image: "image",
  content: "content",
  publish: "publish",
  callback: "callback"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const TRANSLATION_TARGETS = {
  body: "BODY",
  // 번역 본문을 근거로 자체 문장의 새 기사로 재작성(LICENSED 발행용).
  rewrite: "REWRITE"
} as const;

export type TranslationTarget =
  (typeof TRANSLATION_TARGETS)[keyof typeof TRANSLATION_TARGETS];

export interface TranslateJobData {
  articleId: number;
  target: TranslationTarget;
}

export const IMAGE_JOB_TYPES = {
  generateThumbnail: "GENERATE_THUMBNAIL"
} as const;

export type ImageJobType = (typeof IMAGE_JOB_TYPES)[keyof typeof IMAGE_JOB_TYPES];

export interface ImageGenerationJobData {
  articleId: number;
  type: ImageJobType;
}

export const CONTENT_GENERATION_TARGETS = {
  subtitle: "SUBTITLE",
  keywords: "KEYWORDS"
} as const;

export type ContentGenerationTarget =
  (typeof CONTENT_GENERATION_TARGETS)[keyof typeof CONTENT_GENERATION_TARGETS];

export interface ContentGenerationJobData {
  articleId: number;
  target: ContentGenerationTarget;
}

export interface ContentGenerationJobResult {
  articleId: number;
  target: ContentGenerationTarget;
  suggestions: string[];
}

export interface PublishJobData {
  articleId: number;
  publishJobId: number;
}
