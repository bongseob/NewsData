import { Worker, type ConnectionOptions } from "bullmq";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page } from "playwright";
import stealth from "puppeteer-extra-plugin-stealth";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ARTICLE_SOURCES,
  ARTICLE_STATUSES,
  JOB_STATUSES,
  PUBLISH_FAILED_STEPS,
  QUEUE_NAMES,
  type PublishFailedStep,
  type PublishJobData
} from "@newsdata/shared";
import {
  ArticlesRepository,
  createMysqlPool,
  FailureArtifactsRepository,
  PublishJobsRepository,
  PublishLogsRepository,
  type ArticleRow,
  type MysqlPool
} from "@newsdata/db";

chromium.use(stealth());

const pool: MysqlPool = createMysqlPool({
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

function isDryRun(): boolean {
  return process.env.PUBLISH_DRY_RUN !== "0";
}

function getArticleTitle(article: ArticleRow): string {
  return article.translated_title || article.title;
}

function getArticleSubtitle(article: ArticleRow): string | null {
  if (article.translated_subtitle) {
    return article.translated_subtitle;
  }
  // 뉴스와이어(국내 보도자료)만 원본 부제목(한국어)을 폴백으로 허용한다.
  // NewsData 등 해외 소스의 외국어 원문 부제목은 발행하지 않는다.
  if (article.source === ARTICLE_SOURCES.newswire) {
    return article.subtitle;
  }
  return null;
}

function getArticleBody(article: ArticleRow): string | null {
  return article.translated_body || article.original_body || article.body;
}

function getArticleKeywords(article: ArticleRow): string[] {
  const raw = article.keywords;
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter((value) => value.length > 0);
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value).trim()).filter((value) => value.length > 0);
      }
    } catch {
      // Fall back to delimiter-based parsing.
    }
    return text
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return [];
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function looksLikeHtml(value: string): boolean {
  return /<(p|br|div|span|img|ul|ol|li|h[1-6]|table|strong|em|a)\b/i.test(value);
}

// 편집기 innerHTML에 그대로 넣으면 줄바꿈이 사라지므로 문단/개행을 HTML로 변환한다.
function toEditorHtml(text: string): string {
  if (looksLikeHtml(text)) {
    return text;
  }
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\r?\n/g, "<br />")}</p>`);
  return blocks.length > 0 ? blocks.join("\n") : `<p>${escapeHtml(text)}</p>`;
}

function getSubtitleSelectors(): string[] {
  return [
    process.env.DMAKER_SUBTITLE_SELECTOR || "",
    "#subTitle",
    "#subtitle",
    'input[name="subTitle"]',
    'input[name="subtitle"]',
    'textarea[name="subTitle"]',
    'textarea[name="subtitle"]'
  ].filter(Boolean);
}

async function fillSubtitle(page: Page, subtitle: string): Promise<void> {
  for (const selector of getSubtitleSelectors()) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    const tag = await locator
      .evaluate((el) => el.tagName.toLowerCase())
      .catch(() => "input");
    // textarea면 3줄을 유지하고, 단일 라인 input이면 줄바꿈이 제거되므로
    // 불릿("- ")을 떼고 한 줄로 합쳐 문장이 붙지 않게 한다.
    const value =
      tag === "textarea"
        ? subtitle
        : subtitle
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*-\s*/, "").trim())
            .filter((line) => line.length > 0)
            .join(" ");
    await locator.fill(value, { timeout: 5000 });
    return;
  }

  throw new Error(
    `Visible subtitle field not found. Tried selectors: ${getSubtitleSelectors().join(", ")}`
  );
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

async function clickFirstAvailable(
  page: Page,
  selectors: string[]
): Promise<string> {
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
    localPath,
    process.env.THUMBNAIL_DIR
      ? path.resolve(process.env.THUMBNAIL_DIR, filename)
      : "",
    // 이미지 워커가 저장하는 위치: apps/backend/uploads/thumbnails
    path.resolve(process.cwd(), "..", "backend", "uploads", "thumbnails", filename),
    path.resolve(process.cwd(), "uploads", "thumbnails", filename),
    path.resolve(process.cwd(), "apps", "backend", "uploads", "thumbnails", filename)
  ].filter(Boolean);

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

function getPhotoWriteUrl(idxno: string): string {
  const pattern = process.env.DMAKER_PHOTO_WRITE_URL_PATTERN;
  if (pattern?.includes("{idxno}")) {
    return pattern.replace("{idxno}", idxno);
  }

  return `https://www.d-maker.kr/news/photoWriteForm.html?mode=input&article_idxno=${idxno}`;
}

// 이미지는 기사 생성 후 idxno 기준 photoWriteForm 팝업에서 업로드한다.
async function uploadArticlePhoto(
  context: BrowserContext,
  idxno: string,
  absoluteThumbPath: string
): Promise<void> {
  const photoPage = await context.newPage();
  photoPage.on("dialog", async (dialog) => {
    await dialog.accept().catch(() => undefined);
  });

  try {
    await photoPage.goto(getPhotoWriteUrl(idxno), { waitUntil: "networkidle" });

    const fileInput = photoPage.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      throw new Error("Photo upload file input not found on photoWriteForm.");
    }
    await fileInput.setInputFiles(absoluteThumbPath);

    const submitSelector = await clickFirstAvailable(photoPage, [
      process.env.DMAKER_PHOTO_SUBMIT_SELECTOR || "",
      "#btnSubmit",
      "#btn_submit",
      ".btn_submit",
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("등록")',
      'a:has-text("등록")',
      'input[value*="등록"]',
      'button:has-text("저장")',
      'input[value*="저장"]'
    ]);
    console.log(`[Publish] Photo submit clicked with selector: ${submitSelector}`);
    await photoPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  } finally {
    await photoPage.close().catch(() => undefined);
  }
}

function getKeywordSelectors(): string[] {
  return [
    process.env.DMAKER_KEYWORD_SELECTOR || "",
    // d-maker 키워드는 jQuery Tag-it 위젯이라 #keyword는 숨김 필드다.
    // 실제 입력은 태그 목록(ul.tagit)의 보이는 입력창에서 이뤄진다.
    "ul.tagit li.tagit-new input",
    "ul.tagit input.ui-autocomplete-input",
    ".tagit-new input",
    "ul.tagit input[type='text']",
    "#keyword",
    "#keywords",
    'input[name="keyword"]',
    'input[name="keywords"]',
    'textarea[name="keyword"]',
    'textarea[name="keywords"]'
  ].filter(Boolean);
}

// ", "로 구분된 키워드를 키워드 필드에 입력하되, 각 키워드마다 Enter로 구분한다.
async function fillKeywords(page: Page, keywords: string[]): Promise<void> {
  for (const selector of getKeywordSelectors()) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    // 숨김 필드(tagit-hidden-field 등)는 클릭이 불가하므로 건너뛴다.
    if (!(await locator.isVisible().catch(() => false))) continue;

    await locator.click({ timeout: 5000 });
    for (const keyword of keywords) {
      await page.keyboard.type(keyword);
      await page.keyboard.press("Enter");
    }
    return;
  }

  throw new Error(
    `Visible keyword field not found. Tried selectors: ${getKeywordSelectors().join(", ")}`
  );
}

export function registerPublishWorker(connection: ConnectionOptions): Worker {
  return new Worker<PublishJobData>(
    QUEUE_NAMES.publish,
    async (job) => {
      const { articleId, publishJobId } = job.data || {};
      console.log(`[Publish] Job ${job.id} started articleId=${articleId} publishJobId=${publishJobId}`);

      if (!articleId || !publishJobId) {
        throw new Error("Publish job data must include articleId and publishJobId.");
      }

      const article = await articlesRepo.findById(articleId);
      if (!article) {
        throw new Error(`Article not found: ${articleId}`);
      }

      await publishJobsRepo.updateStatus(publishJobId, JOB_STATUSES.running);

      if (isDryRun()) {
        await publishLogsRepo.create({
          publishJobId,
          articleId,
          status: "DRY_RUN_SUCCEEDED"
        });
        await publishJobsRepo.updateStatus(publishJobId, JOB_STATUSES.succeeded);
        console.log(`[Publish] Job ${job.id} dry-run done articleId=${articleId}`);
        return { articleId, publishJobId, dryRun: true };
      }

      const adminId = process.env.DMAKER_ADMIN_ID;
      const adminPw = process.env.DMAKER_ADMIN_PASSWORD;

      if (!adminId || !adminPw) {
        throw new Error("Missing admin credentials in environment variables.");
      }

      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();
      let failedStep: PublishFailedStep = PUBLISH_FAILED_STEPS.login;

      try {
        await articlesRepo.updateStatus(articleId, ARTICLE_STATUSES.publishing);

        failedStep = PUBLISH_FAILED_STEPS.login;
        await page.goto(getLoginUrl());
        await page.fill("#user_id", adminId);
        await page.fill("#user_pw", adminPw);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
          page.click('button[type="submit"], input[type="submit"], .login-btn').catch(() => page.keyboard.press("Enter"))
        ]);

        failedStep = PUBLISH_FAILED_STEPS.openForm;
        await page.goto(getWriteUrl(), {
          waitUntil: "networkidle"
        });

        failedStep = PUBLISH_FAILED_STEPS.fillForm;
        await page.selectOption("#sectionCode", "S1N1").catch((error) => {
          console.warn("[Publish] sectionCode select failed", error);
        });

        await page.fill("#title", getArticleTitle(article));
        const subtitle = getArticleSubtitle(article);
        if (subtitle) {
          await fillSubtitle(page, subtitle).catch((error) => {
            console.warn("[Publish] subTitle fill failed", error);
          });
        }

        const body = getArticleBody(article);
        if (!body) {
          throw new Error("Article body is empty.");
        }

        const bodyHtml = toEditorHtml(body);
        const editorIframe = await page.$('iframe[title*="editor"], iframe[id*="editor"]');
        if (editorIframe) {
          const frame = await editorIframe.contentFrame();
          if (frame) {
            await frame.evaluate((htmlContent: string) => {
              document.body.innerHTML = htmlContent;
            }, bodyHtml);
          }
        } else {
          // 일반 textarea 편집기는 원문(줄바꿈 포함)을 그대로 넣는다.
          const textarea = await page.$('textarea[name="content"], textarea#content');
          if (textarea) await textarea.fill(body);
        }

        const keywords = getArticleKeywords(article);
        if (keywords.length > 0) {
          await fillKeywords(page, keywords).catch((error) => {
            console.warn("[Publish] keyword fill failed", error);
          });
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
        console.log(`[Publish] Submit clicked with selector: ${submitSelector}`);
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

        failedStep = PUBLISH_FAILED_STEPS.verify;
        const content = await page.content();
        const idxno = extractIdxnoFromText(page.url()) || extractIdxnoFromText(content);
        if (!idxno) {
          throw new Error("Published article idxno could not be extracted after submit.");
        }

        if (article.thumbnail_local_path) {
          failedStep = PUBLISH_FAILED_STEPS.uploadImage;
          const absoluteThumbPath = await resolveThumbnailPath(article.thumbnail_local_path).catch(
            (error) => {
              console.warn("[Publish] thumbnail resolve failed", error);
              return null;
            }
          );
          if (absoluteThumbPath) {
            await uploadArticlePhoto(context, idxno, absoluteThumbPath).catch((error) => {
              console.warn("[Publish] photo upload failed", error);
            });
          }
        }

        failedStep = PUBLISH_FAILED_STEPS.verify;
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
        console.log(`[Publish] Job ${job.id} succeeded articleId=${articleId} publicUrl=${publicUrl}`);
        return { articleId, publishJobId, idxno, publicUrl };
      } catch (error) {
        const errorMessage = formatError(error);
        const currentUrl = page.url();
        const artifactDir = path.resolve(
          process.env.PLAYWRIGHT_ARTIFACT_DIR || "uploads/playwright-artifacts"
        );
        await fs.mkdir(artifactDir, { recursive: true });
        const baseName = `publish-${publishJobId}-${Date.now()}`;
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
        console.error(`[Publish] Job ${job.id} FAILED articleId=${articleId}: ${errorMessage}`);
        throw error;
      } finally {
        await browser.close();
      }
    },
    { connection }
  );
}
