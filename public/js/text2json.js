// Chuyển đoạn text sang JSON — dùng cho tab "Text → JSON".
// Hỗ trợ: JSON/JS lỏng (comment, nháy đơn, key không nháy, dấu phẩy thừa, nhiều khối có nhãn),
// key: value / key = value (thụt lề lồng nhau, dotted key), bảng Markdown / CSV / TSV,
// bảng mô tả field của API -> JSON mẫu, query string. Không phụ thuộc DOM.

export const FORMATS = {
  auto: 'Tự nhận diện',
  loose: 'JSON / JS object',
  java: 'Java toString (key=value)',
  log: 'Log (tiền tố + JSON)',
  kv: 'key: value',
  table: 'Bảng (Markdown / CSV / TSV)',
  fields: 'Bảng field → JSON mẫu',
  query: 'Query string',
  lines: 'Danh sách dòng',
};

export class ConvertError extends Error {
  constructor(message, line, col) {
    super(line ? `${message} (dòng ${line}, cột ${col})` : message);
    this.line = line;
    this.col = col;
  }
}

// ---------- Kiểu giá trị ----------
const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
/** "12" -> 12, "true" -> true, "null" -> null, "'a'" -> "a"; số có số 0 đầu / quá dài giữ là chuỗi */
export function typeValue(raw, { typed = true } = {}) {
  let s = String(raw).trim();
  if (/^(["'`])[\s\S]*\1$/.test(s) && s.length >= 2) return s.slice(1, -1);
  if (!typed) return s;
  if (s === '') return '';
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (/^(null|nil|none|undefined)$/i.test(s)) return null;
  if (NUM_RE.test(s) && s.replace(/[-.eE+]/g, '').length <= 15) return Number(s);
  if (/^[[{]/.test(s)) {
    try { return parseLoose(s).value; } catch { /* giữ chuỗi */ }
  }
  return s;
}

// ---------- JSON / JS lỏng ----------
/** Parse JSON "lỏng". Trả { value, labels } — nhiều giá trị ở cấp ngoài cùng được gom lại */
export function parseLoose(text) {
  let i = 0;
  const src = text;
  const pos = (at = i) => {
    const before = src.slice(0, at).split('\n');
    return [before.length, before[before.length - 1].length + 1];
  };
  const fail = (msg, at = i) => { throw new ConvertError(msg, ...pos(at)); };
  let lastComment = '';
  const skip = () => {
    for (;;) {
      const c = src[i];
      if (c === undefined) return;
      if (/\s|,/.test(c) && depth === 0) { i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        const end = src.indexOf('\n', i);
        lastComment = src.slice(i + 2, end < 0 ? src.length : end).trim();
        i = end < 0 ? src.length : end;
        continue;
      }
      if (c === '#' && (i === 0 || src[i - 1] === '\n' || /\s/.test(src[i - 1]))) {
        const end = src.indexOf('\n', i);
        lastComment = src.slice(i + 1, end < 0 ? src.length : end).trim();
        i = end < 0 ? src.length : end;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) fail('Comment /* chưa được đóng');
        lastComment = src.slice(i + 2, end).replace(/^\s*\*+/gm, '').trim();
        i = end + 2;
        continue;
      }
      return;
    }
  };
  let depth = 0;
  const ws = () => {
    for (;;) {
      while (/\s/.test(src[i] || '')) i++;
      if (src[i] === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
      if (src[i] === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) fail('Comment /* chưa được đóng'); i = e + 2; continue; }
      return;
    }
  };
  const str = () => {
    const q = src[i];
    const start = i++;
    let out = '';
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\n' && q !== '`') fail('Chuỗi chưa được đóng', start);
      if (src[i] === '\\') {
        const n = src[++i];
        const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/', '`': '`' };
        if (n === 'u') { out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)); i += 5; continue; }
        if (n === '\n') { i++; continue; }
        out += map[n] ?? n;
        i++;
        continue;
      }
      out += src[i++];
    }
    if (src[i] !== q) fail('Chuỗi chưa được đóng', start);
    i++;
    return out;
  };
  const IDENT = /[\p{L}\p{N}_$\-.]/u;
  const word = () => {
    const start = i;
    while (i < src.length && IDENT.test(src[i])) i++;
    return src.slice(start, i);
  };
  const value = () => {
    ws();
    const c = src[i];
    if (c === undefined) fail('Thiếu giá trị');
    if (c === '{') {
      i++;
      depth++;
      const obj = {};
      for (;;) {
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; depth--; return obj; }
        if (src[i] === undefined) fail('Thiếu dấu } đóng object');
        const kAt = i;
        const key = src[i] === '"' || src[i] === "'" || src[i] === '`' ? str() : word();
        if (!key) fail(`Ký tự không hợp lệ "${src[i]}" ở vị trí tên trường`, kAt);
        ws();
        if (src[i] !== ':' && src[i] !== '=') fail(`Thiếu dấu ":" sau "${key}"`);
        i++;
        obj[key] = value();
        ws();
        if (src[i] === ',') i++;
        else if (src[i] !== '}') fail('Thiếu dấu phẩy hoặc dấu } giữa các trường');
      }
    }
    if (c === '[') {
      i++;
      depth++;
      const arr = [];
      for (;;) {
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; depth--; return arr; }
        if (src[i] === undefined) fail('Thiếu dấu ] đóng mảng');
        arr.push(value());
        ws();
        if (src[i] === ',') i++;
        else if (src[i] !== ']') fail('Thiếu dấu phẩy hoặc dấu ] giữa các phần tử');
      }
    }
    if (c === '"' || c === "'" || c === '`') return str();
    const at = i;
    const w = word();
    if (!w) fail(`Ký tự không hợp lệ "${c}"`);
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null' || w === 'undefined') return null;
    if (/^[-+]?(\d|\.\d)/.test(w) && !Number.isNaN(Number(w))) return Number(w);
    if (/^0x[0-9a-f]+$/i.test(w)) return parseInt(w, 16);
    if (/^-?(Infinity|NaN)$/.test(w)) return null;
    // Giá trị không nháy (vd. "partner_email") -> chuỗi
    return w || fail('Giá trị không hợp lệ', at);
  };

  const values = [];
  const labels = [];
  for (;;) {
    lastComment = '';
    skip();
    if (i >= src.length) break;
    const label = lastComment;
    const c = src[i];
    if (c !== '{' && c !== '[') {
      if (values.length) fail(`Ký tự không hợp lệ "${c}" ngoài object / mảng`);
      // Một giá trị đơn (chuỗi / số)
      const v = value();
      skip();
      if (i < src.length) fail('Dữ liệu thừa sau giá trị');
      return { value: v, labels: [] };
    }
    values.push(value());
    labels.push(label.replace(/[:：]\s*$/, ''));
  }
  if (!values.length) fail('Không có dữ liệu');
  if (values.length === 1) return { value: values[0], labels };
  // Nhiều khối: có nhãn khác nhau (// Request, // Response) thì gom thành object, không thì thành mảng
  const named = labels.every((l) => l) && new Set(labels).size === labels.length;
  return { value: named ? Object.fromEntries(labels.map((l, k) => [l, values[k]])) : values, labels };
}

// ---------- key: value ----------
// Gán theo đường dẫn "a.b.c"; trả về [object chứa, key cuối] để có thể thay giá trị sau
function setPath(obj, keyPath, val) {
  const parts = keyPath.split('.').map((p) => p.trim()).filter(Boolean);
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  cur[last] = val;
  return [cur, last];
}
const isEmptyObj = (v) => v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length;

export function parseKeyValue(text, opts = {}) {
  const root = {};
  // Mỗi mức thụt lề: container đang điền + (owner, key) để đổi object rỗng thành mảng khi gặp "- "
  const stack = [{ indent: -1, container: root }];
  text.split('\n').forEach((rawLine, n) => {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || /^\s*(#|\/\/|;)/.test(line) || /^\s*---\s*$/.test(line)) return;
    const indent = line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
    const body = line.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];

    const item = body.match(/^[-*•]\s+(.*)$/);
    if (item) {
      if (!Array.isArray(top.container)) {
        if (top.owner && isEmptyObj(top.container)) top.container = top.owner[top.key] = [];
        else throw new ConvertError('Phần tử danh sách "-" không thuộc trường nào', n + 1, indent + 1);
      }
      const kvIn = item[1].match(/^([^:=\s"'[{][^:=]*?)\s*[:=]\s*(.*)$/);
      if (kvIn) {
        // "- name: A" mở một object trong mảng, các dòng thụt sâu hơn là trường tiếp theo của nó
        const obj = {};
        top.container.push(obj);
        if (kvIn[2] === '') {
          const [owner, key] = setPath(obj, kvIn[1], {});
          stack.push({ indent: indent + 1, container: owner[key], owner, key });
        } else {
          setPath(obj, kvIn[1], typeValue(kvIn[2], opts));
          stack.push({ indent: indent + 1, container: obj });
        }
      } else top.container.push(typeValue(item[1], opts));
      return;
    }

    const kv = body.match(/^(["']?)(.+?)\1\s*(?::|=)\s*(.*)$/);
    if (!kv) throw new ConvertError(`Không đọc được dòng "${body.slice(0, 40)}" — cần dạng key: value`, n + 1, indent + 1);
    if (Array.isArray(top.container)) throw new ConvertError('Trường nằm lẫn trong danh sách "-"', n + 1, indent + 1);
    const value = kv[3].replace(/\s+#.*$/, '');
    if (value === '' || value === '|' || value === '>') {
      const [owner, key] = setPath(top.container, kv[2], {});
      stack.push({ indent, container: owner[key], owner, key });
    } else setPath(top.container, kv[2], typeValue(value, opts));
  });
  // Key không có giá trị và không có con -> chuỗi rỗng
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isEmptyObj(x) ? '' : clean(x)]));
    return v;
  };
  return clean(root);
}

// ---------- Bảng ----------
function splitCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (q) {
      if (c === '"' && line[k + 1] === '"') { cur += '"'; k++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"' && cur.trim() === '') { q = true; cur = ''; } else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const stripMd = (s) => s.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/<br\s*\/?>/gi, ' ').trim();

/** Bảng -> { headers, rows: string[][] } */
export function readTable(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new ConvertError('Bảng cần ít nhất dòng tiêu đề và một dòng dữ liệu');
  let cells;
  if (lines.filter((l) => l.includes('|')).length >= 2) {
    cells = lines
      .filter((l) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l))
      .map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => stripMd(c.replace(/\\\|/g, '|'))));
  } else {
    const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
    cells = lines.map((l) => splitCsvLine(l, sep));
  }
  const [headers, ...rows] = cells;
  return { headers: headers.map((h, k) => h || `cot${k + 1}`), rows };
}
export function parseTable(text, opts = {}) {
  const { headers, rows } = readTable(text);
  return rows.map((r) => Object.fromEntries(headers.map((h, k) => [h, typeValue(r[k] ?? '', opts)])));
}

// Bảng mô tả field (Field | Type | M/O | Comments) -> JSON mẫu
const FIELD_COL = /^(field|tên trường|ten truong|trường|tham số|parameter|param|name|tên|key|thuộc tính|attribute|property)$/i;
const TYPE_COL = /^(type|kiểu|kiểu dữ liệu|data ?type|định dạng)$/i;
const EXAMPLE_COL = /^(ví dụ|vi du|example|sample|mẫu|giá trị|giá trị mẫu|value|default|mặc định)$/i;
export function looksLikeFieldTable(text) {
  try {
    const { headers } = readTable(text);
    return headers.some((h) => FIELD_COL.test(h)) && headers.some((h) => TYPE_COL.test(h));
  } catch { return false; }
}
function sampleFor(type, example) {
  if (example !== undefined && example !== '' && example !== '—' && example !== '-') return typeValue(example);
  const t = String(type || '').toLowerCase();
  if (/bool/.test(t)) return false;
  if (/int|long|number|decimal|double|float|numeric|số/.test(t)) return 0;
  if (/array|list|\[\]|mảng/.test(t)) return [];
  if (/object|map|json|dict/.test(t)) return {};
  if (/date ?time|timestamp/.test(t)) return '2026-01-01T00:00:00Z';
  if (/date|ngày/.test(t)) return '2026-01-01';
  if (/uuid/.test(t)) return '00000000-0000-0000-0000-000000000000';
  return '';
}
export function parseFieldTable(text) {
  const { headers, rows } = readTable(text);
  const fi = headers.findIndex((h) => FIELD_COL.test(h));
  const ti = headers.findIndex((h) => TYPE_COL.test(h));
  const ei = headers.findIndex((h) => EXAMPLE_COL.test(h));
  if (fi < 0) throw new ConvertError('Không tìm thấy cột tên trường (Field / Tên trường / Name…)');
  const out = {};
  for (const r of rows) {
    const name = (r[fi] || '').replace(/\s+/g, '');
    if (!name) continue;
    // "items[].id" -> mảng object; "a.b" -> object lồng
    let cur = out;
    const parts = name.split('.');
    parts.forEach((p, k) => {
      const isArr = p.endsWith('[]');
      const key = isArr ? p.slice(0, -2) : p;
      const last = k === parts.length - 1;
      if (last) {
        const v = sampleFor(r[ti], ei >= 0 ? r[ei] : undefined);
        cur[key] = isArr ? (Array.isArray(v) ? v : [v]) : v;
        return;
      }
      if (isArr) {
        if (!Array.isArray(cur[key])) cur[key] = [{}];
        if (typeof cur[key][0] !== 'object' || cur[key][0] === null) cur[key][0] = {};
        cur = cur[key][0];
      } else {
        if (typeof cur[key] !== 'object' || cur[key] === null || Array.isArray(cur[key])) cur[key] = {};
        cur = cur[key];
      }
    });
  }
  return out;
}

// ---------- Query string ----------
// a=1&b=2, key lặp -> mảng, a[]=1&a[]=2 -> mảng, a[b][c]=1 -> object lồng
export function parseQuery(text, opts = {}) {
  const out = {};
  const assign = (obj, path, val) => {
    const [head, ...rest] = path;
    if (!rest.length) {
      obj[head] = head in obj ? [].concat(obj[head], val) : val;
      return;
    }
    if (rest.length === 1 && rest[0] === '') {
      obj[head] = [].concat(obj[head] ?? [], val);
      return;
    }
    if (typeof obj[head] !== 'object' || obj[head] === null || Array.isArray(obj[head])) obj[head] = {};
    assign(obj[head], rest, val);
  };
  const q = text.trim().replace(/^[^?]*\?/, '');
  for (const part of q.split(/[&\n]/)) {
    if (!part.trim()) continue;
    const [k, ...v] = part.split('=');
    const dec = (x) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } };
    const key = dec(k.trim());
    assign(out, key.replace(/\]/g, '').split('['), typeValue(dec(v.join('=')), opts));
  }
  return out;
}

// ---------- Java toString() ----------
// Map: {a=1, b={c=2}, list=[x, y]} · Lombok: Order(id=1, item=Item(x=1)) · IntelliJ: Order{name='abc', id=1}
// Giá trị không có nháy, có thể chứa khoảng trắng, dấu ":" hoặc dấu phẩy ("Fri Oct 30 09:56:10 ICT 2026"):
// chỉ tách trường tại ", " khi phía sau là "tênTrường=" — nhờ vậy giá trị nhiều chữ vẫn giữ nguyên.
const JAVA_KEY = String.raw`[\p{L}_$][\p{L}\p{N}_$.\-]*`;
// Thân object sau dấu mở: "key=" hoặc chuỗi lớp cha lồng nhau trước đó (toString gọi super.toString():
// Con{Cha{ÔngBà{a=1}, b=2}, c=3})
const JAVA_BODY = String.raw`(?:\s*${JAVA_KEY}\s*[({])*\s*${JAVA_KEY}\s*=`;
const JAVA_START_RE = new RegExp(String.raw`(?:${JAVA_KEY}\s*)?[({](?=${JAVA_BODY})`, 'u');
// Trường kế tiếp: ", key=" hoặc ", Cha{key=…}" (phần lớp cha đặt sau các trường)
const JAVA_NEXT_FIELD_RE = new RegExp(String.raw`^,\s*(?:${JAVA_KEY}\s*=|${JAVA_KEY}\s*[({](?=${JAVA_BODY}))`, 'u');

export function looksLikeJavaToString(text) {
  const t = text.trim();
  // Có "key=" sau dấu mở và không phải JSON: "key": (nếu có) chỉ được nằm bên trong, sau chỗ bắt đầu object Java
  // (vd. appInfo={"versionApp":"5"} là giá trị JSON lồng trong toString)
  const m = JAVA_START_RE.exec(t);
  if (!m) return false;
  const json = /"[^"\n]*"\s*:/.exec(t);
  return !json || json.index > m.index;
}

export function parseJavaToString(text, opts = {}) {
  const src = text;
  // Bỏ phần chữ log đứng trước ("INFO ... response={...}"): bắt đầu từ object đầu tiên
  const m = src.match(new RegExp(String.raw`(?:${JAVA_KEY}\s*)?[({](?=${JAVA_BODY})|[({]\s*[)}]`, 'u'));
  let i = m ? m.index : src.search(/[[{(]/);
  if (i < 0) throw new ConvertError('Không tìm thấy dấu mở { ( [ của đối tượng Java');
  const pos = (at = i) => {
    const before = src.slice(0, at).split('\n');
    return [before.length, before[before.length - 1].length + 1];
  };
  const fail = (msg, at = i) => { throw new ConvertError(msg, ...pos(at)); };
  const CLOSE = { '{': '}', '(': ')', '[': ']' };
  const ws = () => { while (/\s/.test(src[i] || '')) i++; };
  const scalar = (raw) => {
    const v = raw.trim();
    if (/^(["'])[\s\S]*\1$/.test(v) && v.length >= 2) return v.slice(1, -1);
    if (v === 'null') return null;
    return typeValue(v, opts);
  };

  // Đọc giá trị không nháy cho tới dấu kết thúc ở đúng cấp lồng
  function readRaw(closer, inObject) {
    const start = i;
    if (src[i] === "'" || src[i] === '"') {
      // Chuỗi có nháy (IntelliJ toString): đóng nháy là nháy theo sau bởi "," hoặc dấu đóng
      const q = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === q) {
          let k = j + 1;
          while (/\s/.test(src[k] || '')) k++;
          if (src[k] === ',' || src[k] === closer || k >= src.length) break;
        }
        j++;
      }
      if (j >= src.length) fail('Chuỗi chưa được đóng nháy', start);
      i = j + 1;
      return src.slice(start, i);
    }
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (depth === 0) {
        if (c === closer) break;
        if (c === ',') {
          if (!inObject) break; // trong danh sách: mỗi phần tử cách nhau bởi ", "
          if (JAVA_NEXT_FIELD_RE.test(src.slice(i, i + 200))) break;
        }
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if ((c === ')' || c === ']' || c === '}') && depth > 0) depth--;
    }
    if (i >= src.length) fail(`Thiếu dấu đóng "${closer}"`, start);
    return src.slice(start, i);
  }

  function value(closer, inObject) {
    ws();
    const c = src[i];
    if (c === '[') return list();
    if (c === '{' || c === '(') {
      const rest = src.slice(i + 1);
      if (new RegExp(String.raw`^${JAVA_BODY}`, 'u').test(rest) || /^\s*[)}]/.test(rest)) return object();
    }
    // Tên lớp ngay trước dấu mở: Item(x=1) / Item{x=1}
    const cls = src.slice(i).match(new RegExp(String.raw`^${JAVA_KEY}\s*(?=[({](?:${JAVA_BODY}|\s*[)}]))`, 'u'));
    if (cls) { i += cls[0].length; return object(); }
    return scalar(readRaw(closer, inObject));
  }

  function object() {
    const open = src[i];
    const closer = CLOSE[open];
    i++;
    const obj = {};
    for (;;) {
      ws();
      if (src[i] === closer) { i++; return obj; }
      if (i >= src.length) fail(`Thiếu dấu đóng "${closer}"`);
      const km = src.slice(i).match(new RegExp(String.raw`^(${JAVA_KEY})\s*=`, 'u'));
      if (!km && new RegExp(String.raw`^(?:${JAVA_KEY}\s*)?[({](?:${JAVA_BODY}|\s*[)}])`, 'u').test(src.slice(i))) {
        // Phần toString của lớp cha không có tên trường (Con{Cha{a=1}, b=2}): gộp các trường vào object hiện tại,
        // vì đó là trường kế thừa của chính object này
        const at = i;
        const inherited = value(closer, true);
        if (!inherited || typeof inherited !== 'object' || Array.isArray(inherited)) fail('Phần lớp cha không phải object', at);
        for (const [k, v] of Object.entries(inherited)) if (!(k in obj)) obj[k] = v;
        ws();
        if (src[i] === ',') i++;
        else if (src[i] !== closer) fail(`Thiếu dấu phẩy hoặc "${closer}" sau phần lớp cha`);
        continue;
      }
      if (!km) fail(`Cần "tênTrường=" nhưng gặp "${src.slice(i, i + 15)}"`);
      i += km[0].length;
      // Giá trị rỗng: "key=," hoặc "key=}"
      const after = src.slice(i).match(/^[ \t]*/)[0].length;
      if (src[i + after] === ',' || src[i + after] === closer) { obj[km[1]] = ''; i += after; }
      else {
        const v = value(closer, true);
        // Lombok @ToString(callSuper = true): Con(super=Cha(a=1), b=2) -> gộp trường lớp cha như trên
        if (km[1] === 'super' && v && typeof v === 'object' && !Array.isArray(v)) {
          for (const [k, x] of Object.entries(v)) if (!(k in obj)) obj[k] = x;
        } else obj[km[1]] = v;
      }
      ws();
      if (src[i] === ',') i++;
      else if (src[i] !== closer) fail(`Thiếu dấu phẩy hoặc "${closer}" sau trường "${km[1]}"`);
    }
  }

  function list() {
    i++;
    const arr = [];
    for (;;) {
      ws();
      if (src[i] === ']') { i++; return arr; }
      if (i >= src.length) fail('Thiếu dấu đóng "]"');
      arr.push(value(']', false));
      ws();
      if (src[i] === ',') i++;
      else if (src[i] !== ']') fail('Thiếu dấu phẩy hoặc "]" trong danh sách');
    }
  }

  const result = value(undefined, false);
  return result;
}

// ---------- Log: tiền tố + JSON / Java toString ----------
// "2026-09-30 23:53:00 [pool-1] INFO ... Response MobileAds: {"error_code":"123"}"
// -> { "2026-09-30 23:53:00 [pool-1] INFO ... Response MobileAds": { "error_code": "123" } }
// Ranh giới JSON xác định bằng cặp ngoặc (bỏ qua ngoặc trong chuỗi) nên JSON in nhiều dòng vẫn đọc được;
// nhiều dòng log -> mỗi đoạn một key, key trùng đánh số (2), (3)…

/** Vị trí sau dấu đóng khớp với dấu mở tại `start` (bỏ qua ngoặc nằm trong chuỗi "…"); -1 nếu không khớp */
function matchBracket(src, start) {
  const pairs = { '{': '}', '[': ']', '(': ')' };
  const stack = [];
  let inStr = false;
  for (let k = start; k < src.length; k++) {
    const c = src[k];
    if (inStr) {
      if (c === '\\') k++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (pairs[c]) stack.push(pairs[c]);
    else if (c === '}' || c === ']' || c === ')') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return k + 1;
    }
  }
  return -1;
}

/** Payload hợp lệ trong log; undefined nếu chỉ là nhãn log như [pool-1], [INFO], [123] */
function logPayload(raw, opts) {
  if (raw[0] === '[') {
    // Mảng: chỉ nhận JSON chuẩn có nội dung thật (>= 2 phần tử hoặc chứa object / mảng)
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) && (v.length >= 2 || v.some((x) => x && typeof x === 'object')) ? v : undefined;
    } catch { return undefined; }
  }
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
  try { const v = JSON.parse(raw); if (isObj(v)) return v; } catch { /* thử dạng lỏng */ }
  try { const v = parseLoose(raw).value; if (isObj(v)) return v; } catch { /* thử Java */ }
  try { const v = parseJavaToString(raw, opts); if (isObj(v)) return v; } catch { /* không phải payload */ }
  return undefined;
}

function cleanLogKey(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:=>\-–—|,]+$/, '')
    .trim();
}

/** Tách các đoạn "tiền tố + payload" trong text; trả [] nếu không có payload nào parse được */
function extractLogEntries(text, opts) {
  let src = text.trim();
  // Cả chuỗi được bọc trong nháy: '…{…}…' hoặc "…{…}…"
  if (/^(['"`]).*\1$/s.test(src) && /[{[]/.test(src.slice(1, -1))) src = src.slice(1, -1);
  const entries = [];
  let cursor = 0;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c !== '{' && c !== '[') continue;
    const end = matchBracket(src, k);
    if (end < 0) continue;
    const raw = src.slice(k, end);
    const value = logPayload(raw, opts);
    if (value === undefined) continue;
    // "Tiền tố" = phần chữ từ sau payload trước tới đầu payload này
    entries.push({ prefix: src.slice(cursor, k), value, start: k, end });
    cursor = end;
    k = end - 1;
  }
  if (entries.length) entries.trailing = src.slice(cursor);
  entries.src = src;
  return entries;
}

/** Gom các payload của một bản ghi log thành { tiền tố: payload } */
function logRecordObject(src, entries, from, to) {
  const out = {};
  let cursor = from;
  entries.forEach((e, idx) => {
    let key = cleanLogKey(src.slice(cursor, e.start));
    cursor = e.end;
    // Phần chữ sau payload cuối cùng (vd. "took 23ms") ghép vào key để không mất thông tin
    const tail = idx === entries.length - 1 ? cleanLogKey(src.slice(e.end, to)) : '';
    if (tail) key = key ? `${key} … ${tail}` : tail;
    if (!key) key = `_${idx + 1}`;
    let k = key;
    for (let n = 2; Object.prototype.hasOwnProperty.call(out, k); n++) k = `${key} (${n})`;
    out[k] = e.value;
  });
  return out;
}

export function looksLikeLog(text, opts = {}) {
  const entries = extractLogEntries(text, opts);
  if (!entries.length) return false;
  // Cần ít nhất một tiền tố có nội dung. Tên lớp dính liền dấu mở (Order{…}, Order[…]) là Java toString,
  // không phải log; còn "Tags: […]", "data = {…}" có dấu ngăn cách thì vẫn là log
  const className = new RegExp(`^\\s*${JAVA_KEY}$`, 'u');
  return entries.some((e) => /[\p{L}\p{N}]/u.test(e.prefix) && !className.test(e.prefix));
}

export function parseLog(text, opts = {}) {
  const records = parseLogRecords(text, opts);
  return records.length === 1 ? records[0] : records;
}

/** Các bản ghi log theo thứ tự: chuỗi (dòng không có JSON, giữ nguyên) hoặc { tiền tố: payload } */
export function parseLogRecords(text, opts = {}) {
  const entries = extractLogEntries(text, opts);
  if (!entries.length) throw new ConvertError('Không tìm thấy JSON / object trong dòng log');
  const { src } = entries;
  // Tách bản ghi theo dòng; dấu xuống dòng nằm trong payload (JSON nhiều dòng) không tính
  const records = [];
  let from = 0;
  for (let k = 0; k <= src.length; k++) {
    if (k < src.length && src[k] !== '\n') continue;
    if (k < src.length && entries.some((e) => k > e.start && k < e.end)) continue;
    const own = entries.filter((e) => e.start >= from && e.end <= k);
    const line = src.slice(from, k).trim();
    if (line) records.push(own.length ? logRecordObject(src, own, from, k) : line);
    from = k + 1;
  }
  return records;
}

// ---------- Nhận diện + chuyển ----------
export function detectFormat(text) {
  const t = text.trim();
  if (!t) return 'auto';
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const code = lines.filter((l) => !/^(\/\/|#|\/\*|\*)/.test(l));
  const startsBracket = code.length && /^[{[]/.test(code[0]);
  if (startsBracket) {
    // Bắt đầu bằng { [: JSON / Java toString nếu parse được cả đoạn; không thì có thể là log "[main] INFO … {…}"
    let okLoose = false;
    try { parseLoose(t); okLoose = true; } catch { /* thử tiếp */ }
    if (looksLikeJavaToString(t) && !okLoose) {
      try { parseJavaToString(t); return 'java'; } catch { /* thử log */ }
    }
    if (okLoose) return 'loose';
    if (looksLikeLog(t)) return 'log';
    return looksLikeJavaToString(t) ? 'java' : 'loose'; // để hiện lỗi cú pháp đúng loại
  }
  // Dòng log: chữ đứng trước rồi mới tới JSON / object -> tiền tố làm key
  if (looksLikeLog(t)) return 'log';
  // Java toString có tên lớp đứng trước (Order(id=1), Order{…})
  if (looksLikeJavaToString(t)) return 'java';
  if (lines.filter((l) => l.includes('|')).length >= 2 && lines.some((l) => /^\|?\s*:?-{2,}/.test(l))) {
    return looksLikeFieldTable(t) ? 'fields' : 'table';
  }
  if (lines.length >= 2 && lines.every((l) => l.includes('\t'))) return looksLikeFieldTable(t) ? 'fields' : 'table';
  if (lines.length === 1 && /^[^\s=&]+=[^&]*(&[^\s=&]+=[^&]*)*$/.test(lines[0].replace(/^[^?]*\?/, ''))) return 'query';
  const kvLines = lines.filter((l) => /^([-*•]\s+)?["']?[^:=\s][^:=]*["']?\s*[:=]/.test(l) || /^[-*•]\s+/.test(l) || /^(#|\/\/)/.test(l));
  if (kvLines.length >= Math.max(1, lines.length * 0.8)) return 'kv';
  if (lines.length >= 2) {
    const commas = lines.map((l) => splitCsvLine(l, ',').length);
    if (commas[0] > 1 && commas.every((c) => c === commas[0])) return 'table';
  }
  return 'lines';
}

export function convertToJson(text, { format = 'auto', typed = true } = {}) {
  const fmt = format === 'auto' ? detectFormat(text) : format;
  if (!text.trim()) return { value: null, format: fmt };
  const opts = { typed };
  let value;
  switch (fmt) {
    case 'loose': value = parseLoose(text).value; break;
    case 'java': value = parseJavaToString(text, opts); break;
    case 'log': {
      // Nhiều dòng log: trả thêm records để hiển thị theo từng dòng như log gốc
      const records = parseLogRecords(text, opts);
      if (records.length > 1) return { value: records, format: fmt, records };
      value = records[0];
      break;
    }
    case 'kv': value = parseKeyValue(text, opts); break;
    case 'table': value = parseTable(text, opts); break;
    case 'fields': value = parseFieldTable(text); break;
    case 'query': value = parseQuery(text, opts); break;
    case 'lines':
    default:
      value = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => typeValue(l, opts));
  }
  return { value, format: fmt };
}
