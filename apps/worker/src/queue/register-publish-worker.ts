import { Worker, type ConnectionOptions } from "bullmq";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page } from "playwright";
import stealth from "puppeteer-extra-plugin-stealth";
import path from "node:path";
import fs from "node:fs/promises";
import {
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
  if (article.translated_summary) {
    return article.translated_summary;
  }
  if (article.translated_subtitle) {
    return article.translated_subtitle;
  }
  // 모든 소스가 해외 뉴스이므로 외국어 원문 부제목은 발행하지 않는다.
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
    // d-maker #subTitle은 여러 줄(- 문장1\n- 문장2\n- 문장3)을 그대로 받는다.
    await locator.fill(subtitle, { timeout: 5000 });
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

// d-maker 키워드는 jQuery Tag-it 위젯이라 보이는 입력창에 값을 넣고
// Space를 눌러 각 태그를 커밋한다(그래서 키워드에 공백이 없어야 한다).
async function fillKeywords(page: Page, keywords: string[]): Promise<void> {
  const selector =
    process.env.DMAKER_KEYWORD_SELECTOR || ".tagit-new input.ui-autocomplete-input";
  const tagInput = page.locator(selector).first();
  await tagInput.waitFor({ state: "visible", timeout: 10000 });

  for (const keyword of keywords) {
    const cleanTag = keyword.replace(/^#/, "").trim();
    if (!cleanTag) continue;
    await tagInput.fill(cleanTag);
    await tagInput.press("Space"); // Tag-it은 Space로 태그를 커밋한다.
    await page.waitForTimeout(100); // UI 반영 대기
  }
}

// 본문은 CKEditor "텍스트로 붙여넣기" 팝업으로 입력하면 줄바꿈이 보존된다.
async function fillArticleBody(page: Page, body: string): Promise<void> {
  try {
    const pasteButton = page
      .locator(".cke_button__pastetext:not(.cke_button_disabled)")
      .first();
    await pasteButton.waitFor({ state: "visible", timeout: 15000 });
    await pasteButton.click();

    await page.waitForSelector(".cke_pasteframe", { state: "visible" });
    const pasteFrame = page.frameLocator(".cke_pasteframe");
    await pasteFrame.locator("body").focus();
    await page.keyboard.insertText(body);

    try {
      await page.click(".cke_dialog_ui_button_ok");
    } catch {
      await page.locator('.cke_dialog a[title="확인"]').click();
    }

    await page.waitForSelector(".cke_pasteframe", { state: "hidden" });
    await page.waitForTimeout(500);
    return;
  } catch (error) {
    console.warn(
      "[Publish] CKEditor paste failed, falling back to editor injection",
      error
    );
  }

  // 폴백: 편집기 iframe / textarea에 직접 주입한다.
  const bodyHtml = toEditorHtml(body);
  const editorIframe = await page.$(
    'iframe.cke_wysiwyg_frame, iframe[title*="editor"], iframe[id*="editor"]'
  );
  if (editorIframe) {
    const frame = await editorIframe.contentFrame();
    if (frame) {
      await frame.evaluate((htmlContent: string) => {
        document.body.innerHTML = htmlContent;
      }, bodyHtml);
    }
  } else {
    const textarea = await page.$('textarea[name="content"], textarea#content');
    if (textarea) await textarea.fill(body);
  }
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
        // 로그인 제출 후 페이지 이동을 확실히 대기한다.
        // (networkidle는 불안정하고, 실패를 삼키면 로그인 미완료 상태로 진행되어 간헐 실패가 발생한다.)
        await Promise.all([
          page.waitForNavigation({ timeout: 30000 }),
          page.click('button[type="submit"]')
        ]);

        // 로그인 실패 시 로그인 폼(#user_id)이 그대로 남으므로 검증한다.
        if ((await page.locator("#user_id").count()) > 0) {
          throw new Error("Login failed: still on the admin login form after submit.");
        }

        // [중복 발행 방지 및 자가 치유]
        // 어드민 기사 목록 첫 페이지에서 동일한 제목이 이미 존재하는지 검증한다.
        const articleTitle = getArticleTitle(article);
        console.log(`[Publish] Checking for pre-existing article with title "${articleTitle}"...`);
        const listUrl = "https://www.d-maker.kr/news/adminArticleListForm.html";
        await page.goto(listUrl, { waitUntil: "networkidle" }).catch(() => undefined);
        const listContent = await page.content();

        if (listContent.includes(articleTitle)) {
          console.log(`[Publish] Found matching title in list page. Extracting idxno for self-healing...`);
          const escapedTitle = articleTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          // 앵커 태그 내부나 주변 쿼리에서 idxno 파싱 시도
          const patternBefore = new RegExp(`href=["'][^"']*idxno=(\\d+)[^"']*["'][^>]*>[\\s\\S]*?${escapedTitle}`, "i");
          const patternAfter = new RegExp(`${escapedTitle}[\\s\\S]*?idxno=(\\d+)`, "i");
          
          const matchIdxno = listContent.match(patternBefore)?.[1] || listContent.match(patternAfter)?.[1];
          if (matchIdxno) {
            console.log(`[Publish] Self-healing: Article already published with idxno ${matchIdxno}.`);
            const publicUrl = getPublicArticleUrl(matchIdxno);
            
            await publishLogsRepo.create({
              publishJobId,
              articleId,
              status: JOB_STATUSES.succeeded,
              idxno: matchIdxno,
              publicUrl,
              currentUrl: page.url()
            });
            await publishJobsRepo.updateStatus(publishJobId, JOB_STATUSES.succeeded);
            await articlesRepo.updatePublished(articleId, publicUrl);
            return { articleId, publishJobId, idxno: matchIdxno, publicUrl };
          }
        }

        failedStep = PUBLISH_FAILED_STEPS.openForm;
        await page.goto(getWriteUrl());
        await page.waitForLoadState("networkidle").catch(() => undefined);

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

        // 키워드는 본문(CKEditor)보다 먼저 입력한다.
        const keywords = getArticleKeywords(article);
        if (keywords.length > 0) {
          await fillKeywords(page, keywords).catch((error) => {
            console.warn("[Publish] keyword fill failed", error);
          });
        }

        // 본문은 마지막에 입력한다(CKEditor 붙여넣기 팝업 사용).
        const body = getArticleBody(article);
        if (!body) {
          throw new Error("Article body is empty.");
        }
        await fillArticleBody(page, body);

        failedStep = PUBLISH_FAILED_STEPS.submit;
        page.on("dialog", async (dialog) => {
          await dialog.accept().catch(() => undefined);
        });
        const submitSelector = await clickFirstAvailable(page, [
          process.env.DMAKER_SUBMIT_SELECTOR || "",
          'button[type="submit"].nd-pink',
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
