// Server chạy local (không dùng trên Vercel): phục vụ public/ và API giống hệt api/*.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pdfHandler from './api/pdf.js';
import readHandler from './api/read.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3080;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
// Vercel giới hạn request body 4.5 MB — local giữ cùng giới hạn để hành vi giống nhau
app.use(express.json({ limit: '4.5mb' }));
app.use(express.text({ type: ['text/*'], limit: '4.5mb' }));
app.all('/api/pdf', pdfHandler);
app.all('/api/read', readHandler);
app.use(express.static(path.join(ROOT, 'public')));

app.listen(PORT, HOST, () => console.log(`convertSRS: http://${HOST}:${PORT}`));
