// Băm SHA (có HMAC) và mã hoá / giải mã Base64 — dùng cho tab "Mã hoá / Base64".
// Dùng WebCrypto (crypto.subtle) có sẵn trong trình duyệt / Electron / Node ≥ 20; văn bản xử lý theo UTF-8.

export const HASH_ALGOS = { 'SHA-256': 'SHA-256', 'SHA-1': 'SHA-1', 'SHA-384': 'SHA-384', 'SHA-512': 'SHA-512' };

export class CryptoToolError extends Error {}

const enc = new TextEncoder();
export const utf8Bytes = (text) => enc.encode(text);

/** Giải UTF-8; trả null nếu không phải văn bản UTF-8 hợp lệ (dữ liệu nhị phân) */
export function utf8Text(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function toHex(bytes, upper = false) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return upper ? s.toUpperCase() : s;
}

/** Hex dump kiểu "00000000  48 65 6c 6c 6f  |Hello|" cho dữ liệu nhị phân */
export function hexDump(bytes, limit = 4096) {
  const lines = [];
  const n = Math.min(bytes.length, limit);
  for (let off = 0; off < n; off += 16) {
    const row = bytes.subarray(off, Math.min(off + 16, n));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const ascii = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`);
  }
  if (bytes.length > limit) lines.push(`… còn ${bytes.length - limit} byte`);
  return lines.join('\n');
}

// ---------- Base64 ----------
export function bytesToBase64(bytes, { urlSafe = false, wrap = false } = {}) {
  let bin = '';
  const CHUNK = 0x8000; // tránh tràn stack của String.fromCharCode với dữ liệu lớn
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  let b64 = btoa(bin);
  if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (wrap) b64 = b64.replace(/(.{76})(?=.)/g, '$1\n');
  return b64;
}

/** Giải Base64: chấp nhận Base64URL (-_), thiếu dấu "=", có xuống dòng / khoảng trắng, tiền tố data:...;base64, */
export function base64ToBytes(input) {
  let s = String(input).trim().replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, '');
  if (!s) return new Uint8Array();
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bad = s.search(/[^A-Za-z0-9+/=]/);
  if (bad >= 0) throw new CryptoToolError(`Ký tự không hợp lệ trong Base64: "${s[bad]}" (vị trí ${bad + 1})`);
  if (/=[^=]/.test(s)) throw new CryptoToolError('Dấu "=" chỉ được nằm ở cuối chuỗi Base64');
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new CryptoToolError('Độ dài chuỗi Base64 không hợp lệ (thừa 1 ký tự)');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Băm ----------
/** Băm SHA (hoặc HMAC-SHA nếu có khoá); trả Uint8Array */
export async function hashBytes(algo, data, hmacKey = '') {
  if (!globalThis.crypto?.subtle) throw new CryptoToolError('Trình duyệt không hỗ trợ WebCrypto (cần HTTPS hoặc localhost).');
  if (!HASH_ALGOS[algo]) throw new CryptoToolError(`Thuật toán không hỗ trợ: ${algo}`);
  if (hmacKey !== '') {
    const key = await crypto.subtle.importKey('raw', utf8Bytes(hmacKey), { name: 'HMAC', hash: algo }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  }
  return new Uint8Array(await crypto.subtle.digest(algo, data));
}

/** Định dạng kết quả băm: hex | HEX | base64 */
export function formatDigest(bytes, format) {
  if (format === 'base64') return bytesToBase64(bytes);
  return toHex(bytes, format === 'HEX');
}
