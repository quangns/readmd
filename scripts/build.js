// Chuẩn bị tài nguyên tĩnh trước khi chạy/deploy:
//  - copy thư viện trình duyệt + font vào public/vendor (Vercel phục vụ public/ như site tĩnh)
//  - sinh lib/pdf-assets.generated.js (font base64 + CSS) để serverless function nhúng vào HTML in PDF
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const VENDOR = path.join(ROOT, 'public/vendor');

fs.rmSync(VENDOR, { recursive: true, force: true });
fs.mkdirSync(path.join(VENDOR, 'fonts'), { recursive: true });

const libs = {
  'marked.js': 'marked/lib/marked.umd.js',
  'purify.js': 'dompurify/dist/purify.min.js',
  'mermaid.js': 'mermaid/dist/mermaid.min.js',
  'highlight.js': '@highlightjs/cdn-assets/highlight.min.js',
  'hljs-github.css': '@highlightjs/cdn-assets/styles/github.min.css',
};
for (const [dest, src] of Object.entries(libs)) {
  fs.copyFileSync(path.join(NM, src), path.join(VENDOR, dest));
}

// Chỉ lấy các subset cần cho tiếng Việt: vietnamese, latin-ext, latin
const SUBSETS = ['vietnamese', 'latin-ext', 'latin'];
const FONTS = [
  { pkg: 'be-vietnam-pro', family: 'Be Vietnam Pro', faces: [[400, 'normal'], [400, 'italic'], [500, 'normal'], [600, 'normal'], [700, 'normal']] },
  { pkg: 'jetbrains-mono', family: 'JetBrains Mono', faces: [[400, 'normal'], [600, 'normal']] },
];

// Lấy unicode-range của từng subset từ file CSS gốc của fontsource (mỗi block có comment tên subset)
function unicodeRange(pkg, subset, weight, style) {
  const css = fs.readFileSync(path.join(NM, '@fontsource', pkg, `${weight}${style === 'italic' ? '-italic' : ''}.css`), 'utf8');
  const block = css.split('/* ').find((b) => b.startsWith(`${pkg}-${subset}-${weight}-${style} */`));
  return block.match(/unicode-range:\s*([^;]+);/)[1];
}

let webCss = '';
let pdfCss = '';
for (const { pkg, family, faces } of FONTS) {
  for (const [weight, style] of faces) {
    for (const subset of SUBSETS) {
      const file = `${pkg}-${subset}-${weight}-${style}.woff2`;
      const srcFile = path.join(NM, '@fontsource', pkg, 'files', file);
      fs.copyFileSync(srcFile, path.join(VENDOR, 'fonts', file));
      const range = unicodeRange(pkg, subset, weight, style);
      const face = (src) => `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:${src} format('woff2');unicode-range:${range};}\n`;
      webCss += face(`url(./${file})`);
      pdfCss += face(`url(data:font/woff2;base64,${fs.readFileSync(srcFile).toString('base64')})`);
    }
  }
}
fs.writeFileSync(path.join(VENDOR, 'fonts/fonts.css'), webCss);

const docCss = fs.readFileSync(path.join(ROOT, 'public/css/document.css'), 'utf8');
const hljsCss = fs.readFileSync(path.join(NM, '@highlightjs/cdn-assets/styles/github.min.css'), 'utf8');
fs.writeFileSync(
  path.join(ROOT, 'lib/pdf-assets.generated.js'),
  '// File sinh tự động bởi scripts/build.js — không sửa tay\n' +
    `export const FONT_CSS = ${JSON.stringify(pdfCss)};\n` +
    `export const DOC_CSS = ${JSON.stringify(docCss)};\n` +
    `export const HLJS_CSS = ${JSON.stringify(hljsCss)};\n`
);

console.log('build: đã chuẩn bị public/vendor và lib/pdf-assets.generated.js');
