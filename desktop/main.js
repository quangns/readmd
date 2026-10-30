// convertSRS desktop (Electron): dùng lại giao diện web trong public/, tạo PDF bằng printToPDF
// của chính Electron (không cần server, không cần mạng). File .md mở bằng nhấp đúp / "Mở bằng".
import { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildHtml, headerTemplate, footerTemplate, PDF_MARGIN_MM } from './bundle/lib/pdf-html.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'bundle', 'public');
const ORIGIN = 'app://convertsrs';
const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;
const MAX_FILE = 20 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Một cửa sổ duy nhất: mở file thứ hai thì chuyển vào cửa sổ đang chạy (giống Word)
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let rendererReady = false;
const pendingFiles = [];

function fileFromArgv(argv) {
  return argv.slice(1).find((a) => !a.startsWith('-') && MD_EXT.test(a) && fs.existsSync(a)) || null;
}

async function openFile(filePath) {
  if (!filePath) return;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE) throw new Error('File lớn hơn 20 MB.');
    const content = await fs.promises.readFile(filePath, 'utf8');
    const payload = { name: path.basename(filePath), path: filePath, size: stat.size, content };
    if (rendererReady && win) win.webContents.send('open-file', payload);
    else pendingFiles.push(payload);
    app.addRecentDocument(filePath);
  } catch (err) {
    dialog.showErrorBox('Không mở được tài liệu', `${filePath}\n\n${err.message}`);
  }
}

// ---------- PDF ----------
const PDF_PARTITION = 'convertsrs-pdf';
async function renderPdf(body) {
  const { html, title = 'Tài liệu', options = {}, meta = {} } = body || {};
  if (typeof html !== 'string' || !html.trim()) throw new Error('Thiếu nội dung tài liệu.');
  const tmp = path.join(os.tmpdir(), `convertsrs-${process.pid}-${Date.now()}.html`);
  await fs.promises.writeFile(tmp, buildHtml({ title, html, options, meta }), 'utf8');
  // Cửa sổ ẩn, tắt JavaScript: nội dung tài liệu do người dùng cung cấp
  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, partition: PDF_PARTITION },
  });
  try {
    await pdfWin.loadFile(tmp);
    const inch = (mm) => mm / 25.4;
    return await pdfWin.webContents.printToPDF({
      pageSize: options.format === 'Letter' ? 'Letter' : 'A4',
      landscape: !!options.landscape,
      printBackground: true,
      displayHeaderFooter: options.pageNumbers !== false,
      headerTemplate: headerTemplate(title),
      footerTemplate: footerTemplate(),
      margins: {
        top: inch(PDF_MARGIN_MM.top), bottom: inch(PDF_MARGIN_MM.bottom),
        left: inch(PDF_MARGIN_MM.left), right: inch(PDF_MARGIN_MM.right),
      },
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
  } finally {
    pdfWin.destroy();
    fs.promises.unlink(tmp).catch(() => {});
  }
}

// ---------- Giao thức app:// phục vụ giao diện + API giống bản web ----------
async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/pdf') {
    if (request.method !== 'POST') return new Response('Chỉ hỗ trợ POST.', { status: 405 });
    try {
      const pdf = await renderPdf(await request.json());
      return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } });
    } catch (err) {
      const msg = String(err.message || err).split('\n')[0].slice(0, 200);
      return new Response(JSON.stringify({ error: 'Không tạo được PDF: ' + msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return new Response('Không có quyền truy cập.', { status: 403 });
  if (!fs.existsSync(file)) return new Response('Không tìm thấy.', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

// ---------- Menu ----------
function sendMenu(action) {
  if (win) win.webContents.send('menu', action);
}
async function showOpenDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Mở tài liệu Markdown',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'Văn bản', extensions: ['txt'] },
      { name: 'Tất cả', extensions: ['*'] },
    ],
  });
  if (!canceled && filePaths[0]) openFile(filePaths[0]);
}
function buildMenu() {
  const template = [
    {
      label: 'Tệp',
      submenu: [
        { label: 'Mở…', accelerator: 'CmdOrCtrl+O', click: showOpenDialog },
        { label: 'Mở gần đây', role: 'recentDocuments', submenu: [{ label: 'Xoá danh sách', role: 'clearRecentDocuments' }] },
        { label: 'Mở tài liệu SRS mẫu', click: () => sendMenu('sample') },
        { type: 'separator' },
        { label: 'Xuất PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenu('pdf') },
        { label: 'Xuất TXT…', accelerator: 'CmdOrCtrl+Shift+T', click: () => sendMenu('txt') },
        { label: 'Tuỳ chọn in / PDF', click: () => sendMenu('print-options') },
        { label: 'In…', accelerator: 'CmdOrCtrl+P', click: () => sendMenu('print') },
        { type: 'separator' },
        { label: 'Thoát', role: 'quit' },
      ],
    },
    {
      label: 'Chỉnh sửa',
      submenu: [
        { label: 'Hoàn tác', role: 'undo' },
        { label: 'Làm lại', role: 'redo' },
        { type: 'separator' },
        { label: 'Cắt', role: 'cut' },
        { label: 'Sao chép', role: 'copy' },
        { label: 'Dán', role: 'paste' },
        { label: 'Chọn tất cả', role: 'selectAll' },
      ],
    },
    {
      label: 'Xem',
      submenu: [
        { label: 'Đọc', accelerator: 'CmdOrCtrl+1', click: () => sendMenu('tab:preview') },
        { label: 'Markdown gốc', accelerator: 'CmdOrCtrl+2', click: () => sendMenu('tab:raw') },
        { label: 'Soạn / Dán', accelerator: 'CmdOrCtrl+3', click: () => sendMenu('tab:source') },
        { label: 'Bản TXT', accelerator: 'CmdOrCtrl+4', click: () => sendMenu('tab:text') },
        { type: 'separator' },
        { label: 'Phóng to', role: 'zoomIn' },
        { label: 'Thu nhỏ', role: 'zoomOut' },
        { label: 'Cỡ chữ mặc định', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Toàn màn hình', role: 'togglefullscreen' },
        { label: 'Công cụ phát triển', role: 'toggleDevTools', visible: !app.isPackaged },
      ],
    },
    {
      label: 'Trợ giúp',
      submenu: [
        {
          label: 'Giới thiệu convertSRS',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Giới thiệu',
              message: `convertSRS ${app.getVersion()}`,
              detail:
                'Đọc tài liệu SRS viết bằng Markdown, hiển thị sơ đồ Mermaid và xuất PDF / TXT.\n\n' +
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}\n© 2026 Nguyễn Sỹ Quang`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Cửa sổ ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'convertSRS',
    backgroundColor: '#F4F4F5',
    icon: path.join(ROOT, 'bundle', 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${ORIGIN}/index.html`);

  // Liên kết ra ngoài trong tài liệu: mở bằng trình duyệt, không điều hướng cửa sổ ứng dụng
  const external = (url) => /^(https?|mailto):/i.test(url);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (external(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN)) return;
    e.preventDefault();
    if (external(url)) shell.openExternal(url);
  });
  win.on('closed', () => { win = null; rendererReady = false; });
}

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  while (pendingFiles.length) win?.webContents.send('open-file', pendingFiles.shift());
});
ipcMain.handle('open-dialog', () => showOpenDialog());

app.on('second-instance', (_e, argv) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  openFile(fileFromArgv(argv));
});
// macOS: mở file bằng Finder
app.on('open-file', (e, filePath) => {
  e.preventDefault();
  openFile(filePath);
});

app.whenReady().then(() => {
  // Cửa sổ tạo PDF chỉ được đọc file tạm và data: URI, chặn mọi request ra mạng
  session.fromPartition(PDF_PARTITION).webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !/^(file|data|devtools):/i.test(details.url) });
  });
  protocol.handle('app', handleRequest);
  buildMenu();
  createWindow();
  openFile(fileFromArgv(process.argv));
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
