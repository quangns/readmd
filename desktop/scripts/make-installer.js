// Biên dịch bộ cài Windows từ dist/win-unpacked bằng NSIS (installer/convertsrs.nsi).
// Dùng makensis trong gói NSIS mà electron-builder đã tải (có bản Linux / macOS / Windows),
// nên build được trên Linux mà không cần Wine. Có thể chỉ định MAKENSIS / NSISDIR qua biến môi trường.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const APPDIR = path.join(DESKTOP, 'dist', 'win-unpacked');
if (!fs.existsSync(path.join(APPDIR, 'convertSRS.exe'))) {
  console.error('Chưa có dist/win-unpacked/convertSRS.exe — chạy electron-builder --win dir trước.');
  process.exit(1);
}

function findNsis() {
  if (process.env.MAKENSIS) return { bin: process.env.MAKENSIS, dir: process.env.NSISDIR };
  const cacheRoot = process.env.ELECTRON_BUILDER_CACHE
    || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache')
      : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches/electron-builder')
        : path.join(os.homedir(), '.cache/electron-builder'));
  const nsisRoot = path.join(cacheRoot, 'nsis');
  const dirs = fs.existsSync(nsisRoot) ? fs.readdirSync(nsisRoot).filter((d) => /^nsis-\d/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const dir = path.join(nsisRoot, d);
    const bin = process.platform === 'win32' ? path.join(dir, 'Bin', 'makensis.exe')
      : path.join(dir, process.platform === 'darwin' ? 'mac' : 'linux', 'makensis');
    if (fs.existsSync(bin)) return { bin, dir };
  }
  return { bin: 'makensis', dir: process.env.NSISDIR };
}

const { bin, dir } = findNsis();
const outFile = path.join(DESKTOP, 'dist', `convertSRS-Setup-${pkg.version}.exe`);
fs.rmSync(outFile, { force: true });
console.log(`  • makensis: ${bin}`);
execFileSync(bin, [
  '-V2',
  `-DVERSION=${pkg.version}`,
  `-DAPPDIR=${APPDIR}`,
  `-DOUTFILE=${outFile}`,
  `-DICON=${path.join(DESKTOP, 'build', 'icon.ico')}`,
  path.join(DESKTOP, 'installer', 'convertsrs.nsi'),
], { stdio: 'inherit', env: { ...process.env, ...(dir ? { NSISDIR: dir } : {}) } });
const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
console.log(`  • bộ cài: ${path.relative(DESKTOP, outFile)} (${mb} MB)`);
