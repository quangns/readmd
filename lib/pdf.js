// Tạo PDF từ HTML tài liệu đã render ở trình duyệt (sơ đồ đã là SVG inline).
// Dùng chung cho Vercel Function (api/pdf.js) và server chạy local (server.js).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { buildHtml, headerTemplate, footerTemplate, PDF_MARGIN_MM } from './pdf-html.js';

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LOCAL_CHROME_PATHS = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

let browserPromise = null;

async function launch() {
  if (IS_SERVERLESS) {
    const { default: chromium } = await import('@sparticuz/chromium');
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
  }
  const executablePath = LOCAL_CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('Không tìm thấy Chrome/Chromium. Đặt biến môi trường CHROMIUM_PATH.');
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = launch()
      .then((browser) => {
        browser.on('disconnected', () => { browserPromise = null; });
        return browser;
      })
      .catch((err) => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

export class PdfInputError extends Error {}

export async function renderPdf(body) {
  const { html, title = 'Tài liệu', options = {}, meta = {} } = body || {};
  if (typeof html !== 'string' || !html.trim()) throw new PdfInputError('Thiếu nội dung tài liệu.');
  try {
    return await printPage({ html, title, options, meta });
  } catch (err) {
    // Kết nối tới Chromium có thể đứt (cold start, trình duyệt bị kill) — khởi động lại và thử thêm một lần
    console.warn('[pdf] thử lại sau lỗi:', err.message);
    const old = browserPromise;
    browserPromise = null;
    old?.then((b) => b.close()).catch(() => {});
    return printPage({ html, title, options, meta });
  }
}

async function printPage({ html, title, options, meta }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Nội dung do người dùng cung cấp: tắt JavaScript, chặn mọi request ra ngoài (chỉ cho data: URI)
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('data:') || url === 'about:blank') r.continue();
      else r.abort();
    });

    await page.setContent(buildHtml({ title, html, options, meta }), { waitUntil: 'load', timeout: 45_000 });

    const showHeader = options.pageNumbers !== false;
    return await page.pdf({
      format: options.format === 'Letter' ? 'Letter' : 'A4',
      landscape: !!options.landscape,
      printBackground: true,
      displayHeaderFooter: showHeader,
      headerTemplate: headerTemplate(title),
      footerTemplate: footerTemplate(),
      margin: Object.fromEntries(Object.entries(PDF_MARGIN_MM).map(([k, v]) => [k, `${v}mm`])),
      outline: true,
      tagged: true,
      timeout: 50_000,
    });
  } finally {
    page.close().catch(() => {});
  }
}
