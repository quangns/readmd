// Mã 2FA (TOTP — RFC 6238, như Google Authenticator / Authy / 2fa.live).
// Dùng WebCrypto (globalThis.crypto.subtle) nên chạy được cả trên trình duyệt lẫn API Node (api/2fa.js).

export class TotpError extends Error {}

export const TOTP_ALGOS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

/** Giải Base32 (RFC 4648): bỏ khoảng trắng / gạch ngang, không phân biệt hoa thường, "=" ở cuối tuỳ ý */
export function base32Decode(input) {
  const s = String(input).toUpperCase().replace(/[\s-]+/g, '').replace(/=+$/, '');
  if (!s) throw new TotpError('Secret rỗng');
  const bad = s.search(/[^A-Z2-7]/);
  if (bad >= 0) throw new TotpError(`Secret không phải Base32: ký tự "${s[bad]}" (chỉ gồm A–Z và 2–7)`);
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let bits = 0, value = 0, j = 0;
  for (const c of s) {
    value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out[j++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return out;
}

/**
 * Đọc một dòng nhập: secret Base32 ("JBSW Y3DP …") hoặc URI otpauth://totp/Nhãn?secret=…&digits=…&period=…&algorithm=…
 * Tham số trong URI được ưu tiên hơn `defaults`.
 */
export function parseOtpInput(line, defaults = {}) {
  let s = String(line).trim().replace(/^(['"`])(.*)\1$/s, '$2').trim();
  // Chu kỳ mặc định 60 giây (theo hệ thống đang dùng); chuẩn Google Authenticator là 30 — chọn lại qua tuỳ chọn / period=30
  const opts = { digits: 6, period: 60, algorithm: 'SHA1', label: '', ...defaults };
  if (/^otpauth:\/\//i.test(s)) {
    let url;
    try { url = new URL(s); } catch { throw new TotpError('URI otpauth:// không hợp lệ'); }
    if (url.hostname.toLowerCase() !== 'totp') throw new TotpError(`Chỉ hỗ trợ otpauth://totp (đang là "${url.hostname}")`);
    const q = url.searchParams;
    s = q.get('secret') || '';
    opts.label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (q.get('digits')) opts.digits = Number(q.get('digits'));
    if (q.get('period')) opts.period = Number(q.get('period'));
    if (q.get('algorithm')) opts.algorithm = q.get('algorithm');
  }
  opts.algorithm = String(opts.algorithm).toUpperCase().replace(/-/g, '');
  if (!TOTP_ALGOS[opts.algorithm]) throw new TotpError(`Thuật toán không hỗ trợ: ${opts.algorithm} (SHA1, SHA256, SHA512)`);
  opts.digits = Number(opts.digits);
  opts.period = Number(opts.period);
  if (!Number.isInteger(opts.digits) || opts.digits < 6 || opts.digits > 10) throw new TotpError('Số chữ số phải từ 6 đến 10');
  if (!Number.isInteger(opts.period) || opts.period < 1 || opts.period > 3600) throw new TotpError('Chu kỳ phải từ 1 đến 3600 giây');
  return { secret: s, key: base32Decode(s), ...opts };
}

/** Mã HOTP cho bộ đếm `counter` (RFC 4226) */
export async function hotp(key, counter, { digits = 6, algorithm = 'SHA1' } = {}) {
  if (!globalThis.crypto?.subtle) throw new TotpError('Môi trường không hỗ trợ WebCrypto (cần HTTPS hoặc localhost).');
  const msg = new Uint8Array(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) { msg[i] = Number(c & 0xffn); c >>= 8n; }
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: TOTP_ALGOS[algorithm] }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Mã TOTP tại thời điểm `now` (ms); kèm số giây còn lại và mã của chu kỳ kế tiếp */
export async function totp(input, { now = Date.now(), ...defaults } = {}) {
  const o = typeof input === 'string' ? parseOtpInput(input, defaults) : input;
  const sec = Math.floor(now / 1000);
  const counter = Math.floor(sec / o.period);
  const [token, next] = await Promise.all([hotp(o.key, counter, o), hotp(o.key, counter + 1, o)]);
  return {
    token, next, remaining: o.period - (sec % o.period),
    period: o.period, digits: o.digits, algorithm: o.algorithm, label: o.label,
  };
}
