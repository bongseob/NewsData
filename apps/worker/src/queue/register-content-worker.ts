import { Worker, type ConnectionOptions } from "bullmq";
import {
  CONTENT_GENERATION_TARGETS,
  QUEUE_NAMES,
  type ContentGenerationJobData,
  type ContentGenerationJobResult
} from "@newsdata/shared";
import { ArticlesRepository, createMysqlPool } from "@newsdata/db";

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
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

function parseSuggestions(content: string, expected: number): string[] {
  try {
    const parsed = JSON.parse(content) as { suggestions?: unknown };
    if (Array.isArray(parsed.suggestions)) {
      return parsed.suggestions
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, expected);
    }
  } catch {
    // Fall through to line-based parsing.
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, expected);
}

function buildPrompt(input: {
  target: ContentGenerationJobData["target"];
  title: string;
  subtitle: string | null;
  body: string | null;
}): string {
  const bodyExcerpt = input.body ? input.body.slice(0, 1800) : "";
  const common = [
    "Return JSON only in this shape: {\"suggestions\":[\"...\"]}.",
    "Do not include markdown or explanations.",
    "",
    `Title: ${input.title}`,
    input.subtitle ? `Current subtitle: ${input.subtitle}` : "",
    bodyExcerpt ? `Article excerpt: ${bodyExcerpt}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  if (input.target === CONTENT_GENERATION_TARGETS.subtitle) {
    return [
      "Generate exactly 3 concise Korean subtitle candidates for this news article.",
      "Each candidate must be natural for a Korean news admin editor and under 90 Korean characters.",
      common
    ].join("\n");
  }

  return [
    "Generate exactly 3 Korean news keywords for this article.",
    "Each keyword must be a short noun phrase, not a sentence.",
    common
  ].join("\n");
}

async function generateSuggestions(prompt: string, expected: number): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for content generation.");
  }

  const model = process.env.TEXT_GENERATION_MODEL || "gpt-4o-mini";
  const endpoint =
    process.env.OPENAI_CHAT_COMPLETIONS_URL ||
    "https://api.openai.com/v1/chat/completions";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an editor for a Korean news curation workflow. Produce concise, factual Korean editorial metadata."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const payload = (await res.json()) as OpenAIChatResponse;
  if (!res.ok) {
    throw new Error(
      payload.error?.message || `Content generation failed with status ${res.status}`
    );
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Content generation response did not include text.");
  }

  const suggestions = parseSuggestions(content, expected);
  if (suggestions.length !== expected) {
    throw new Error(`Expected ${expected} suggestions, got ${suggestions.length}.`);
  }

  return suggestions;
}

export function registerContentWorker(
  connection: ConnectionOptions
): Worker<ContentGenerationJobData, ContentGenerationJobResult> {
  return new Worker<ContentGenerationJobData, ContentGenerationJobResult>(
    QUEUE_NAMES.content,
    async (job) => {
      const { articleId, target } = job.data;
      console.log(`[Content] job accepted: ${job.id}`, job.data);

      if (
        target !== CONTENT_GENERATION_TARGETS.subtitle &&
        target !== CONTENT_GENERATION_TARGETS.keywords
      ) {
        throw new Error(`Unsupported content generation target: ${target}`);
      }

      const article = await articlesRepo.findById(articleId);
      if (!article) {
        throw new Error(`Article not found: ${articleId}`);
      }

      const prompt = buildPrompt({
        target,
        title: article.translated_title || article.title,
        subtitle: article.translated_subtitle || article.subtitle,
        body: article.translated_body || article.original_body || article.body
      });
      const suggestions = await generateSuggestions(prompt, 3);

      console.log(`[Content] generated ${target} suggestions for article ${articleId}`);
      return { articleId, target, suggestions };
    },
    { connection }
  );
}
