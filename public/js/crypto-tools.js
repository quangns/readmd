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

// ---------- Sinh cặp khoá / khoá bí mật ----------
// Danh mục phương thức: độ dài / đường cong và mục đích (ảnh hưởng thuật toán WebCrypto và "alg" trong JWK)
export const KEY_ALGOS = {
  RSA: {
    label: 'RSA', kind: 'pair',
    sizes: [['2048', '2048 bit'], ['3072', '3072 bit'], ['4096', '4096 bit']], defaultSize: '2048',
    purposes: [['oaep', 'Mã hoá (RSA-OAEP, SHA-256)'], ['rs256', 'Ký số RS256 (PKCS#1 v1.5)'], ['ps256', 'Ký số PS256 (RSA-PSS)']],
  },
  ECDSA: { label: 'ECDSA (ký số)', kind: 'pair', sizes: [['P-256', 'P-256 (ES256)'], ['P-384', 'P-384 (ES384)'], ['P-521', 'P-521 (ES512)']], defaultSize: 'P-256' },
  ECDH: { label: 'ECDH (trao đổi khoá)', kind: 'pair', sizes: [['P-256', 'P-256'], ['P-384', 'P-384'], ['P-521', 'P-521']], defaultSize: 'P-256' },
  Ed25519: { label: 'Ed25519 (ký số)', kind: 'pair', sizes: [['256', '256 bit (cố định)']], defaultSize: '256' },
  X25519: { label: 'X25519 (trao đổi khoá)', kind: 'pair', sizes: [['256', '256 bit (cố định)']], defaultSize: '256' },
  AES: { label: 'AES-GCM (khoá đối xứng)', kind: 'secret', sizes: [['128', '128 bit'], ['192', '192 bit'], ['256', '256 bit']], defaultSize: '256' },
  HMAC: { label: 'HMAC (khoá bí mật)', kind: 'secret', sizes: [['256', '256 bit (HS256)'], ['384', '384 bit (HS384)'], ['512', '512 bit (HS512)']], defaultSize: '256' },
};
const EC_HASH = { 'P-256': 'SHA-256', 'P-384': 'SHA-384', 'P-521': 'SHA-512' };
const EC_ALG = { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' };

/** Ed25519 / X25519 có trong trình duyệt mới (Chrome 113+, Firefox 129+, Safari 17+) — kiểm tra trước khi hiện */
export async function keyAlgoSupported(algo) {
  if (algo !== 'Ed25519' && algo !== 'X25519') return true;
  try {
    await crypto.subtle.generateKey({ name: algo }, false, algo === 'Ed25519' ? ['sign'] : ['deriveBits']);
    return true;
  } catch {
    return false;
  }
}

function webCryptoParams(algo, size, purpose) {
  switch (algo) {
    case 'RSA': {
      const name = purpose === 'oaep' ? 'RSA-OAEP' : purpose === 'ps256' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5';
      return {
        params: { name, modulusLength: Number(size), publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        usages: name === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify'],
        jwkAlg: { oaep: 'RSA-OAEP-256', rs256: 'RS256', ps256: 'PS256' }[purpose],
      };
    }
    case 'ECDSA': return { params: { name: 'ECDSA', namedCurve: size }, usages: ['sign', 'verify'], jwkAlg: EC_ALG[size] };
    case 'ECDH': return { params: { name: 'ECDH', namedCurve: size }, usages: ['deriveBits'], jwkAlg: 'ECDH-ES' };
    case 'Ed25519': return { params: { name: 'Ed25519' }, usages: ['sign', 'verify'], jwkAlg: 'EdDSA' };
    case 'X25519': return { params: { name: 'X25519' }, usages: ['deriveBits'], jwkAlg: 'ECDH-ES' };
    case 'AES': return { params: { name: 'AES-GCM', length: Number(size) }, usages: ['encrypt', 'decrypt'], jwkAlg: `A${size}GCM` };
    case 'HMAC': return { params: { name: 'HMAC', hash: `SHA-${size}`, length: Number(size) }, usages: ['sign', 'verify'], jwkAlg: `HS${size}` };
    default: throw new CryptoToolError(`Phương thức không hỗ trợ: ${algo}`);
  }
}

/** Sinh khoá: trả { algo, size, purpose, kind, params, jwkAlg, publicKey?, privateKey?, secretKey? } */
export async function generateKeys(algo, size, purpose) {
  if (!globalThis.crypto?.subtle) throw new CryptoToolError('Trình duyệt không hỗ trợ WebCrypto (cần HTTPS hoặc localhost).');
  const def = KEY_ALGOS[algo];
  if (!def) throw new CryptoToolError(`Phương thức không hỗ trợ: ${algo}`);
  const { params, usages, jwkAlg } = webCryptoParams(algo, size, purpose);
  const out = { algo, size, purpose, kind: def.kind, params, jwkAlg };
  try {
    const k = await crypto.subtle.generateKey(params, true, usages);
    if (def.kind === 'secret') out.secretKey = k;
    else Object.assign(out, { publicKey: k.publicKey, privateKey: k.privateKey });
  } catch (e) {
    throw new CryptoToolError(`Không sinh được khoá ${def.label}: ${e.message}`);
  }
  return out;
}

// ---- DER / PEM ----
function readTlv(der, off) {
  const tag = der[off];
  let len = der[off + 1];
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | der[start + i];
    start += n;
  }
  return { tag, start, end: start + len };
}
/** PKCS#8 PrivateKeyInfo -> RSAPrivateKey (PKCS#1) */
function pkcs8ToPkcs1(der) {
  const seq = readTlv(der, 0);
  const version = readTlv(der, seq.start);
  const algId = readTlv(der, version.end);
  const octet = readTlv(der, algId.end);
  if (octet.tag !== 0x04) throw new CryptoToolError('Cấu trúc PKCS#8 không như mong đợi');
  return der.subarray(octet.start, octet.end);
}
/** SubjectPublicKeyInfo -> RSAPublicKey (PKCS#1) */
function spkiToPkcs1(der) {
  const seq = readTlv(der, 0);
  const algId = readTlv(der, seq.start);
  const bits = readTlv(der, algId.end);
  if (bits.tag !== 0x03) throw new CryptoToolError('Cấu trúc SPKI không như mong đợi');
  return der.subarray(bits.start + 1, bits.end); // bỏ byte "số bit thừa"
}
export function toPem(der, label) {
  return `-----BEGIN ${label}-----\n${bytesToBase64(der).replace(/(.{64})(?=.)/g, '$1\n')}\n-----END ${label}-----\n`;
}

/** Dấu vân tay SHA-256 của khoá công khai (SPKI) hoặc khoá bí mật đối xứng */
export async function keyFingerprint(keys) {
  const der = keys.kind === 'secret'
    ? new Uint8Array(await crypto.subtle.exportKey('raw', keys.secretKey))
    : new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
  return { base64: 'SHA256:' + bytesToBase64(d).replace(/=+$/, ''), hex: toHex(d).match(/../g).join(':') };
}

/** Định dạng xuất khả dụng cho từng phương thức */
export function keyFormats(algo) {
  if (KEY_ALGOS[algo]?.kind === 'secret') return [['base64', 'Base64'], ['hex', 'Hex'], ['jwk', 'JWK']];
  const f = [['pem', 'PEM (PKCS#8 / SPKI)']];
  if (algo === 'RSA') f.push(['pkcs1', 'PEM PKCS#1 (RSA)']);
  f.push(['jwk', 'JWK'], ['der64', 'Base64 DER (1 dòng)']);
  return f;
}

/** Xuất khoá theo định dạng: { publicText, privateText, publicName, privateName } (khoá đối xứng chỉ có privateText) */
export async function exportKeys(keys, format) {
  const jwkExtra = async (jwk) => {
    const fp = await keyFingerprint(keys);
    return { kid: fp.base64.slice(7, 27), alg: keys.jwkAlg, ...jwk };
  };
  if (keys.kind === 'secret') {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.secretKey));
    if (format === 'hex') return { privateText: toHex(raw), privateName: 'secret.key.txt' };
    if (format === 'jwk') {
      const jwk = await crypto.subtle.exportKey('jwk', keys.secretKey);
      return { privateText: JSON.stringify(await jwkExtra(jwk), null, 2), privateName: 'secret.jwk.json' };
    }
    return { privateText: bytesToBase64(raw), privateName: 'secret.key.txt' };
  }
  if (format === 'jwk') {
    const [pub, priv] = await Promise.all([crypto.subtle.exportKey('jwk', keys.publicKey), crypto.subtle.exportKey('jwk', keys.privateKey)]);
    const use = keys.params.name === 'RSA-OAEP' ? 'enc' : /ECDH|X25519/.test(keys.params.name) ? 'enc' : 'sig';
    // JWK công khai: bỏ key_ops / ext để dùng được trong JWKS
    const clean = ({ key_ops: _o, ext: _e, ...rest }) => rest;
    return {
      publicText: JSON.stringify({ ...(await jwkExtra(clean(pub))), use }, null, 2),
      privateText: JSON.stringify({ ...(await jwkExtra(clean(priv))), use }, null, 2),
      publicName: 'public.jwk.json', privateName: 'private.jwk.json',
    };
  }
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  if (format === 'der64') return { publicText: bytesToBase64(spki), privateText: bytesToBase64(pkcs8), publicName: 'public.der.b64.txt', privateName: 'private.der.b64.txt' };
  if (format === 'pkcs1') {
    if (keys.algo !== 'RSA') throw new CryptoToolError('PKCS#1 chỉ áp dụng cho khoá RSA');
    return {
      publicText: toPem(spkiToPkcs1(spki), 'RSA PUBLIC KEY'), privateText: toPem(pkcs8ToPkcs1(pkcs8), 'RSA PRIVATE KEY'),
      publicName: 'public.pkcs1.pem', privateName: 'private.pkcs1.pem',
    };
  }
  return { publicText: toPem(spki, 'PUBLIC KEY'), privateText: toPem(pkcs8, 'PRIVATE KEY'), publicName: 'public.pem', privateName: 'private.pem' };
}

/** Kiểm tra cặp khoá hoạt động: mã hoá–giải mã / ký–xác minh / trao đổi khoá. Trả mô tả phép thử đã đạt */
export async function selfTestKeys(keys) {
  const msg = utf8Bytes('convertSRS — kiểm tra cặp khoá');
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const n = keys.params.name;
  if (n === 'RSA-OAEP') {
    const c = await crypto.subtle.encrypt({ name: n }, keys.publicKey, msg);
    if (!same(new Uint8Array(await crypto.subtle.decrypt({ name: n }, keys.privateKey, c)), msg)) throw new CryptoToolError('Giải mã không khớp');
    return 'mã hoá bằng khoá công khai → giải mã bằng khoá bí mật';
  }
  if (n === 'AES-GCM') {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const c = await crypto.subtle.encrypt({ name: n, iv }, keys.secretKey, msg);
    if (!same(new Uint8Array(await crypto.subtle.decrypt({ name: n, iv }, keys.secretKey, c)), msg)) throw new CryptoToolError('Giải mã không khớp');
    return 'mã hoá → giải mã AES-GCM';
  }
  if (n === 'HMAC') {
    const sig = await crypto.subtle.sign(n, keys.secretKey, msg);
    if (!(await crypto.subtle.verify(n, keys.secretKey, sig, msg))) throw new CryptoToolError('Xác minh HMAC thất bại');
    return 'ký → xác minh HMAC';
  }
  if (n === 'ECDH' || n === 'X25519') {
    // Trao đổi với một cặp khoá tạm: hai phía phải ra cùng một khoá chung
    const other = await crypto.subtle.generateKey(keys.params, false, ['deriveBits']);
    const bits = n === 'X25519' ? 256 : { 'P-256': 256, 'P-384': 384, 'P-521': 528 }[keys.params.namedCurve];
    const a = new Uint8Array(await crypto.subtle.deriveBits({ name: n, public: other.publicKey }, keys.privateKey, bits));
    const b = new Uint8Array(await crypto.subtle.deriveBits({ name: n, public: keys.publicKey }, other.privateKey, bits));
    if (!same(a, b)) throw new CryptoToolError('Khoá chung hai phía không khớp');
    return 'trao đổi khoá với cặp khoá tạm → khoá chung trùng khớp';
  }
  const algo = n === 'ECDSA' ? { name: n, hash: EC_HASH[keys.params.namedCurve] } : n === 'RSA-PSS' ? { name: n, saltLength: 32 } : { name: n };
  const sig = await crypto.subtle.sign(algo, keys.privateKey, msg);
  if (!(await crypto.subtle.verify(algo, keys.publicKey, sig, msg))) throw new CryptoToolError('Xác minh chữ ký thất bại');
  return 'ký bằng khoá bí mật → xác minh bằng khoá công khai';
}
