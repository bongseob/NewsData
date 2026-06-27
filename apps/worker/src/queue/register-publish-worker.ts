import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import path from "node:path";
import fs from "node:fs/promises";

chromium.use(stealth());

export function registerPublishWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    QUEUE_NAMES.publish,
    async (job) => {
      console.log(`[Publish Worker] job accepted: ${job.id}`, job.data);
      const { articleId, title, subTitle, content, thumbnailPath } = job.data || {};
      
      const adminId = process.env.DMAKER_ADMIN_ID;
      const adminPw = process.env.DMAKER_ADMIN_PASSWORD;

      if (!adminId || !adminPw) {
        throw new Error("Missing admin credentials in environment variables.");
      }

      console.log(`[Publish Worker] Launching browser for article: ${articleId}`);
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // 1. Login
        console.log(`[Publish Worker] Navigating to login page...`);
        await page.goto("https://www.d-maker.kr/admin/adminLoginForm.html");
        await page.fill("#user_id", adminId);
        await page.fill("#user_pw", adminPw);
        
        // Wait for navigation after clicking login
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
          page.click('button[type="submit"], input[type="submit"], .login-btn').catch(() => page.keyboard.press('Enter'))
        ]);
        console.log(`[Publish Worker] Login attempted.`);

        // 2. Go to Write Form
        console.log(`[Publish Worker] Navigating to write form...`);
        await page.goto("https://www.d-maker.kr/news/adminArticleWriteForm.html?mode=input", { waitUntil: 'networkidle' });

        // 3. Fill Article Metadata
        console.log(`[Publish Worker] Filling article data...`);
        // 카테고리: #sectionCode ('S1N1' 선택)
        await page.selectOption("#sectionCode", "S1N1").catch(e => console.warn('sectionCode select failed', e));
        
        // 제목, 부제목
        if (title) await page.fill("#title", title).catch(e => console.warn('title fill failed', e));
        if (subTitle) await page.fill("#subTitle", subTitle).catch(e => console.warn('subTitle fill failed', e));

        // 4. Image Upload (Thumbnail)
        // 지시사항: uploads/thumbnails/ 에 저장된 이미지를 파일 업로드 기능으로 삽입
        if (thumbnailPath) {
          try {
            const absoluteThumbPath = path.resolve(process.cwd(), thumbnailPath);
            await fs.access(absoluteThumbPath);
            
            // 방어적 인풋 탐색 (대표적인 파일 첨부 input들)
            const fileInputSelector = 'input[type="file"]';
            const fileInput = await page.$(fileInputSelector);
            if (fileInput) {
               await page.setInputFiles(fileInputSelector, absoluteThumbPath);
               console.log(`[Publish Worker] Thumbnail uploaded: ${absoluteThumbPath}`);
            } else {
               console.warn(`[Publish Worker] Could not find file input for thumbnail.`);
            }
          } catch (e) {
            console.warn(`[Publish Worker] Thumbnail file not found or upload failed: ${thumbnailPath}`, e);
          }
        }

        // 5. Content Editor (방어적 에디터 내용 주입)
        if (content) {
          try {
             const editorIframe = await page.$('iframe[title*="editor"], iframe[id*="editor"]');
             if (editorIframe) {
                const frame = await editorIframe.contentFrame();
                if (frame) {
                  await frame.evaluate((htmlContent: string) => {
                    document.body.innerHTML = htmlContent;
                  }, content);
                }
             } else {
                const textarea = await page.$('textarea[name="content"], textarea#content');
                if (textarea) await textarea.fill(content);
             }
          } catch (e) {
             console.warn(`[Publish Worker] Editor content fill failed.`, e);
          }
        }

        console.log(`[Publish Worker] Article filling complete for: ${articleId}`);
        
        // 주의: 등록 버튼 클릭은 프로젝트 안전을 위해 스켈레톤 상태로 유지(주석 처리)하거나, 실제 연동 시 활성화
        // await page.click('#btnSubmit, button.submit, button:has-text("등록")');

      } catch (error) {
        console.error(`[Publish Worker] Error during publishing article ${articleId}:`, error);
        throw error;
      } finally {
        await browser.close();
        console.log(`[Publish Worker] Browser closed.`);
      }
    },
    { connection }
  );
}
