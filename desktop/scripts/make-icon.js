// Tạo icon ứng dụng (build/icon.png 512px, build/icon.ico nhiều cỡ) từ logo SVG bằng Chromium.
// Chạy một lần khi đổi logo: npm run icon (cần Chrome/Chromium; đường dẫn qua CHROMIUM_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(DESKTOP, '..', 'package.json'));
const puppeteer = require('puppeteer-core');

// Logo convertSRS: trang tài liệu màu Ledger Blue, các dòng chữ trắng
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect x="8" y="8" width="240" height="240" rx="56" fill="#2B6CB0"/>
  <rect x="64" y="64" width="128" height="20" rx="10" fill="#fff"/>
  <rect x="64" y="108" width="128" height="20" rx="10" fill="#fff"/>
  <rect x="64" y="152" width="80" height="20" rx="10" fill="#fff"/>
  <rect x="160" y="152" width="32" height="40" rx="8" fill="#9EC5EC"/>
</svg>`;
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const render = async (size) => {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
};

fs.mkdirSync(path.join(DESKTOP, 'build'), { recursive: true });
fs.writeFileSync(path.join(DESKTOP, 'build/icon.png'), await render(512));
const pngs = [];
for (const s of SIZES) pngs.push({ size: s, data: await render(s) });
await browser.close();

// ICO chứa ảnh PNG (hỗ trợ từ Windows Vista): header 6 byte + mỗi ảnh 16 byte mục lục
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = pngs.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
fs.writeFileSync(path.join(DESKTOP, 'build/icon.ico'), Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]));
console.log('icon: build/icon.png, build/icon.ico');
