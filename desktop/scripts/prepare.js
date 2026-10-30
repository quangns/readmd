// Chuẩn bị thư mục desktop/bundle trước khi chạy / đóng gói Electron:
//  - build tài nguyên web ở thư mục gốc (thư viện, font, CSS nhúng cho PDF)
//  - copy giao diện public/ và module dựng HTML PDF (lib/pdf-html.js) vào desktop/bundle
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'bundle');

execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.js')], { stdio: 'inherit' });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'lib'), { recursive: true });
fs.cpSync(path.join(ROOT, 'public'), path.join(OUT, 'public'), { recursive: true });
for (const f of ['pdf-html.js', 'pdf-assets.generated.js']) {
  fs.copyFileSync(path.join(ROOT, 'lib', f), path.join(OUT, 'lib', f));
}
// Module ES trong bundle/ (import/export)
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
fs.copyFileSync(path.join(DESKTOP, 'build/icon.png'), path.join(OUT, 'icon.png'));

console.log('desktop: đã chuẩn bị desktop/bundle');
