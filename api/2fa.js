// Vercel Serverless Function: mã 2FA (TOTP) hiện tại từ secret Base32.
//   GET /api/2fa?secret=JBSWY3DPEHPK3PXP            -> { "token": "123456", "remaining": 17, ... }
//   GET /api/2fa/JBSWY3DPEHPK3PXP                   (dạng đường dẫn, giống 2fa.live/tok/<secret>)
//   Tuỳ chọn: digits=6..10 (mặc định 6), period=giây (60), algorithm=SHA1|SHA256|SHA512, format=text (chỉ trả mã)
//   secret cũng có thể là URI otpauth://totp/…?secret=… (mã hoá URL); nhiều secret ngăn bằng "|" -> mảng kết quả
// Không lưu secret; trả Cache-Control: no-store.
import { isCrossSite } from '../lib/security-headers.js';
import { totp, TotpError } from '../public/js/totp.js';

const MAX_SECRETS = 50;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (isCrossSite(req)) return res.status(403).json({ error: 'Không chấp nhận request từ website khác.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Chỉ hỗ trợ GET: /api/2fa?secret=<Base32> hoặc /api/2fa/<Base32>' });
  }
  const q = req.query || {};
  const raw = String(q.secret ?? req.params?.secret ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'Thiếu secret. Ví dụ: /api/2fa?secret=JBSWY3DPEHPK3PXP' });
  // otpauth:// có thể chứa "|" trong nhãn -> chỉ tách theo "|" khi không phải URI
  const secrets = /^otpauth:/i.test(raw) ? [raw] : raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (secrets.length > MAX_SECRETS) return res.status(400).json({ error: `Tối đa ${MAX_SECRETS} secret mỗi lần` });
  const defaults = {};
  for (const k of ['digits', 'period', 'algorithm']) if (q[k] != null && q[k] !== '') defaults[k] = q[k];

  try {
    const now = Date.now();
    const results = await Promise.all(secrets.map((s) => totp(s, { now, ...defaults })));
    if (q.format === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(results.map((r) => r.token).join('\n'));
    }
    const out = results.map(({ label, ...r }) => (label ? { label, ...r } : r));
    return res.status(200).json(out.length === 1 ? out[0] : out);
  } catch (err) {
    if (err instanceof TotpError) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Lỗi tạo mã 2FA' });
  }
}
