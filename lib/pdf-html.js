// Dựng HTML và mẫu đầu/chân trang cho PDF — dùng chung cho bản web (lib/pdf.js, Puppeteer)
// và bản desktop (desktop/main.js, Electron printToPDF) để hai bản cho ra PDF giống nhau.
import { FONT_CSS, DOC_CSS, HLJS_CSS } from './pdf-assets.generated.js';

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildHtml({ title, html, options, meta }) {
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

export const PDF_MARGIN_MM = { top: 18, bottom: 18, left: 16, right: 16 };
export const headerTemplate = (title) => `<div style='${hfStyle} text-align: right;'>${escapeHtml(title)}</div>`;
export const footerTemplate = () =>
  `<div style='${hfStyle} text-align: center;'>Trang <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
