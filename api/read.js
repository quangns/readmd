// Vercel Serverless Function: đọc Markdown, KHÔNG chuyển đổi.
//   POST /api/read                 body: Markdown thô (text/markdown, text/plain) hoặc JSON { "markdown": "..." }
//   POST /api/read?format=raw      trả lại nguyên văn Markdown (text/markdown; charset=utf-8)
// Mặc định trả JSON: { title, frontmatter, headings, diagrams, stats, markdown }
import { isCrossSite } from '../lib/security-headers.js';
import { marked } from 'marked';
import { outline } from '../public/js/srs-core.js';

function readMarkdown(req) {
  const b = req.body;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (b && typeof b.markdown === 'string') return b.markdown;
  return null;
}

export default function handler(req, res) {
  if (isCrossSite(req)) return res.status(403).json({ error: 'Không chấp nhận request từ website khác.' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST. Gửi Markdown trong body (text/markdown) hoặc JSON { "markdown": "..." }.' });
  }
  const markdown = readMarkdown(req);
  if (markdown == null || !markdown.trim()) {
    return res.status(400).json({ error: 'Body rỗng hoặc sai định dạng.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  if (req.query?.format === 'raw') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.status(200).send(markdown);
  }
  return res.status(200).json({ ...outline(markdown, { lexer: marked.lexer }), markdown });
}
