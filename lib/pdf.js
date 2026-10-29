// Tạo PDF từ HTML tài liệu đã render ở trình duyệt (sơ đồ đã là SVG inline).
// Dùng chung cho Vercel Function (api/pdf.js) và server chạy local (server.js).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { FONT_CSS, DOC_CSS, HLJS_CSS } from './pdf-assets.generated.js';

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

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildHtml({ title, html, options, meta }) {
  const cover = options.cover
    ? `<section class="pdf-cover">
        <div class="pdf-cover__kind">Tài liệu đặc tả yêu cầu phần mềm</div>
        <h1 class="pdf-cover__title">${escapeHtml(title)}</h1>
        <dl class="pdf-cover__meta">
          ${meta.fileName ? `<dt>Tệp nguồn</dt><dd>${escapeHtml(meta.fileName)}</dd>` : ''}
          <dt>Ngày xuất</dt><dd>${escapeHtml(meta.exportedAt)}</dd>
        </dl>
      </section>`
    : '';

  const headings = Array.isArray(meta.headings) ? meta.headings.filter((h) => h && h.depth <= 3) : [];
  const toc = options.toc && headings.length
    ? `<nav class="pdf-toc"><h2 class="pdf-toc__title">Mục lục</h2><ol>${headings
        .map((h) => `<li class="lvl-${Number(h.depth)}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`)
        .join('')}</ol></nav>`
    : '';

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${FONT_CSS}</style><style>${HLJS_CSS}</style><style>${DOC_CSS}</style></head>
<body class="pdf${options.landscape ? ' landscape' : ''}"><main class="doc">${cover}${toc}<article class="doc-body">${html}</article></main></body></html>`;
}

const hfStyle = 'font-family: Arial, sans-serif; font-size: 7.5pt; color: #71717A; width: 100%; padding: 0 16mm;';

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
      headerTemplate: `<div style='${hfStyle} text-align: right;'>${escapeHtml(title)}</div>`,
      footerTemplate: `<div style='${hfStyle} text-align: center;'>Trang <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      outline: true,
      tagged: true,
      timeout: 50_000,
    });
  } finally {
    page.close().catch(() => {});
  }
}
