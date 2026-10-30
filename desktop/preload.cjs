// Cầu nối an toàn giữa giao diện (app.js) và tiến trình chính Electron
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  // Tệp được mở từ menu, nhấp đúp file .md, hoặc "Mở bằng"
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, file) => cb(file)),
  // Lệnh từ menu: pdf, txt, print, print-options, sample, tab:…
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  ready: () => ipcRenderer.send('renderer-ready'),
});
