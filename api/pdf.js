// Vercel Serverless Function: POST /api/pdf  { html, title, options, meta } -> application/pdf
import { renderPdf, PdfInputError } from '../lib/pdf.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const pdf = await renderPdf(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    console.error('[pdf]', err);
    const status = err instanceof PdfInputError || err instanceof SyntaxError ? 400 : 500;
    // Chỉ trả dòng đầu của thông báo lỗi (lỗi launch Chromium kèm cả stderr rất dài)
    const msg = String(err.message || err).split('\n')[0].slice(0, 200);
    return res.status(status).json({ error: status === 400 ? msg : 'Không tạo được PDF: ' + msg });
  }
}
