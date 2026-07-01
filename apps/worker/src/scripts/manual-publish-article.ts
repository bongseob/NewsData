import "../config/load-env.js";
import { chromium } from "playwright-extra";
import type { Page } from "playwright";
import stealth from "puppeteer-extra-plugin-stealth";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ARTICLE_STATUSES,
  JOB_STATUSES,
  PUBLISH_FAILED_STEPS,
  type PublishFailedStep
} from "@newsdata/shared";
import {
  ArticlesRepository,
  createMysqlPool,
  FailureArtifactsRepository,
  PublishJobsRepository,
  PublishLogsRepository,
  type ArticleRow
} from "@newsdata/db";

chromium.use(stealth());

const pool = createMysqlPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "news",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "newsdata"
});

const articlesRepo = new ArticlesRepository(pool);
const publishJobsRepo = new PublishJobsRepository(pool);
const publishLogsRepo = new PublishLogsRepository(pool);
const failureArtifactsRepo = new FailureArtifactsRepository(pool);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function getLoginUrl(): string {
  return process.env.DMAKER_LOGIN_URL || "https://www.d-maker.kr/admin/adminLoginForm.html";
}

function getWriteUrl(): string {
  return process.env.DMAKER_ARTICLE_WRITE_URL || "https://www.d-maker.kr/news/adminArticleWriteForm.html?mode=input";
}

function getPublicArticleUrl(idxno: string): string {
  const pattern = process.env.DMAKER_PUBLIC_ARTICLE_URL_PATTERN;
  if (pattern?.includes("{idxno}")) {
    return pattern.replace("{idxno}", idxno);
  }

  return `https://www.d-maker.kr/news/articleView.html?idxno=${idxno}`;
}

function getArticleTitle(article: ArticleRow): string {
  return article.translated_title || article.title;
}

function getArticleSubtitle(article: ArticleRow): string | null {
  return article.translated_subtitle || article.subtitle;
}

function getArticleBody(article: ArticleRow): string | null {
  return article.translated_body || article.original_body || article.body;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function clickFirstAvailable(page: Page, selectors: string[]): Promise<string> {
  for (const selector of selectors.filter(Boolean)) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) === 0) continue;
      await locator.click({ timeout: 3000 });
      return selector;
    } catch {
      continue;
    }
  }

  throw new Error(`Submit control not found. Tried selectors: ${selectors.join(", ")}`);
}

function extractIdxnoFromText(value: string): string | null {
  const urlMatch = value.match(/[?&]idxno=(\d+)/i);
  if (urlMatch?.[1]) return urlMatch[1];

  const textMatch = value.match(/idxno[^0-9]{0,10}(\d+)/i);
  return textMatch?.[1] ?? null;
}

function titleMatches(pageText: string, title: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizedText = normalize(pageText);
  const normalizedTitle = normalize(title);
  if (normalizedText.includes(normalizedTitle)) return true;

  return normalizedTitle.length > 20
    ? normalizedText.includes(normalizedTitle.slice(0, 20))
    : false;
}

async function resolveThumbnailPath(localPath: string): Promise<string> {
  const filename = path.basename(localPath);
  const candidates = [
    path.resolve(process.cwd(), "uploads", "thumbnails", filename),
    path.resolve(process.cwd(), "apps", "backend", "uploads", "thumbnails", filename)
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`Thumbnail file not found: ${filename}`);
}

async function publish(articleId: number): Promise<void> {
  const article = await articlesRepo.findById(articleId);
  if (!article) throw new Error(`Article not found: ${articleId}`);

  const publishJobId = await publishJobsRepo.create({
    articleId,
    status: JOB_STATUSES.running,
    requestedBy: "manual-script"
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let failedStep: PublishFailedStep = PUBLISH_FAILED_STEPS.login;

  try {
    await articlesRepo.updateStatus(articleId, ARTICLE_STATUSES.publishing);

    const adminId = requireEnv("DMAKER_ADMIN_ID");
    const adminPw = requireEnv("DMAKER_ADMIN_PASSWORD");

    failedStep = PUBLISH_FAILED_STEPS.login;
    await page.goto(getLoginUrl(), { waitUntil: "networkidle" });
    await page.fill("#user_id", adminId);
    await page.fill("#user_pw", adminPw);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => undefined),
      page.click('button[type="submit"], input[type="submit"], .login-btn').catch(() => page.keyboard.press("Enter"))
    ]);

    failedStep = PUBLISH_FAILED_STEPS.openForm;
    await page.goto(getWriteUrl(), { waitUntil: "networkidle" });

    failedStep = PUBLISH_FAILED_STEPS.fillForm;
    await page.selectOption("#sectionCode", "S1N1").catch(() => undefined);
    await page.fill("#title", getArticleTitle(article));

    const subtitle = getArticleSubtitle(article);
    if (subtitle) {
      await page.fill("#subTitle", subtitle).catch(() => undefined);
    }

    const body = getArticleBody(article);
    if (!body) throw new Error("Article body is empty.");

    const editorIframe = await page.$('iframe[title*="editor"], iframe[id*="editor"]');
    if (editorIframe) {
      const frame = await editorIframe.contentFrame();
      if (frame) {
        await frame.evaluate((htmlContent: string) => {
          document.body.innerHTML = htmlContent;
        }, body);
      }
    } else {
      const textarea = await page.$('textarea[name="content"], textarea#content');
      if (textarea) await textarea.fill(body);
    }

    if (article.thumbnail_local_path) {
      failedStep = PUBLISH_FAILED_STEPS.uploadImage;
      const absoluteThumbPath = await resolveThumbnailPath(article.thumbnail_local_path);
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await page.setInputFiles('input[type="file"]', absoluteThumbPath);
      }
    }

    failedStep = PUBLISH_FAILED_STEPS.submit;
    page.on("dialog", async (dialog) => {
      await dialog.accept().catch(() => undefined);
    });
    const submitSelector = await clickFirstAvailable(page, [
      process.env.DMAKER_SUBMIT_SELECTOR || "",
      "#btnSubmit",
      "#btn_submit",
      ".btn_submit",
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("등록")',
      'a:has-text("등록")',
      'input[value*="등록"]',
      'button:has-text("저장")',
      'a:has-text("저장")',
      'input[value*="저장"]'
    ]);
    console.log(`[ManualPublish] Submit clicked with selector: ${submitSelector}`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

    failedStep = PUBLISH_FAILED_STEPS.verify;
    const content = await page.content();
    const idxno = extractIdxnoFromText(page.url()) || extractIdxnoFromText(content);
    if (!idxno) throw new Error("Published article idxno could not be extracted after submit.");

    const publicUrl = getPublicArticleUrl(idxno);
    await page.goto(publicUrl, { waitUntil: "networkidle" });
    const publicText = await page.locator("body").innerText({ timeout: 10000 });
    const title = getArticleTitle(article);
    if (!titleMatches(publicText, title)) {
      throw new Error("Public article page did not include the submitted title.");
    }

    await publishLogsRepo.create({
      publishJobId,
      articleId,
      status: JOB_STATUSES.succeeded,
      idxno,
      publicUrl,
      currentUrl: page.url()
    });
    await publishJobsRepo.updateStatus(publishJobId, JOB_STATUSES.succeeded);
    await articlesRepo.updatePublished(articleId, publicUrl);
    console.log(`[ManualPublish] Published articleId=${articleId} publicUrl=${publicUrl}`);
  } catch (error) {
    const errorMessage = formatError(error);
    const currentUrl = page.url();
    const artifactDir = path.resolve(
      process.env.PLAYWRIGHT_ARTIFACT_DIR || "uploads/playwright-artifacts"
    );
    await fs.mkdir(artifactDir, { recursive: true });
    const baseName = `manual-publish-${publishJobId}-${Date.now()}`;
    const screenshotPath = path.join(artifactDir, `${baseName}.png`);
    const htmlSnapshotPath = path.join(artifactDir, `${baseName}.html`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    await fs.writeFile(htmlSnapshotPath, await page.content(), "utf8").catch(() => undefined);

    await publishLogsRepo.create({
      publishJobId,
      articleId,
      status: JOB_STATUSES.failed,
      failedStep,
      currentUrl,
      errorMessage
    });
    await failureArtifactsRepo.create({
      articleId,
      publishJobId,
      failedStep,
      screenshotPath,
      htmlSnapshotPath,
      currentUrl,
      errorMessage
    });
    await publishJobsRepo.updateStatus(publishJobId, JOB_STATUSES.failed, errorMessage);
    await articlesRepo.updateStatus(articleId, ARTICLE_STATUSES.failed);
    throw error;
  } finally {
    await browser.close();
    await pool.end();
  }
}

const articleId = Number(process.argv[2]);
if (!Number.isInteger(articleId) || articleId <= 0) {
  throw new Error("Usage: tsx apps/worker/src/scripts/manual-publish-article.ts <articleId>");
}

await publish(articleId);
