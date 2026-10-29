// Lõi xử lý Markdown dùng chung cho trình duyệt (app.js) và Vercel Function (api/read.js):
// nhận diện sơ đồ Mermaid, tạo slug/mục lục, chuyển Markdown sang văn bản thuần (TXT).
// Không phụ thuộc DOM; hàm lexer của marked được truyền vào từ bên ngoài.

const DIAGRAM_TYPES = {
  flowchart: 'Sơ đồ luồng', graph: 'Sơ đồ luồng',
  sequenceDiagram: 'Sơ đồ tuần tự', classDiagram: 'Sơ đồ lớp',
  erDiagram: 'Sơ đồ thực thể quan hệ', stateDiagram: 'Sơ đồ trạng thái', 'stateDiagram-v2': 'Sơ đồ trạng thái',
  gantt: 'Biểu đồ Gantt', journey: 'Hành trình người dùng', pie: 'Biểu đồ tròn',
  mindmap: 'Sơ đồ tư duy', timeline: 'Dòng thời gian', gitGraph: 'Sơ đồ Git',
  C4Context: 'Sơ đồ C4', C4Container: 'Sơ đồ C4', C4Component: 'Sơ đồ C4',
  requirementDiagram: 'Sơ đồ yêu cầu', quadrantChart: 'Biểu đồ góc phần tư',
  xychart: 'Biểu đồ XY', 'xychart-beta': 'Biểu đồ XY', sankey: 'Biểu đồ Sankey', 'sankey-beta': 'Biểu đồ Sankey',
  block: 'Sơ đồ khối', 'block-beta': 'Sơ đồ khối', architecture: 'Sơ đồ kiến trúc', 'architecture-beta': 'Sơ đồ kiến trúc',
  packet: 'Sơ đồ gói tin', 'packet-beta': 'Sơ đồ gói tin', kanban: 'Bảng Kanban',
};

/** Lấy loại sơ đồ và chú thích từ mã Mermaid.
 *  Chú thích lấy từ `%% caption: ...` hoặc `title:` trong frontmatter / dòng `title ...`. */
const CAPTION_RE = /^%%\s*(?:caption|chú thích|chu thich)\s*:\s*(.+)$/i;

export function diagramInfo(src) {
  const lines = src.split('\n');
  let caption = '';
  let type = '';
  let inFront = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === '---') { inFront = true; continue; }
    if (inFront) {
      if (line === '---') { inFront = false; continue; }
      const m = line.match(/^title:\s*(.+)$/);
      if (m && !caption) caption = m[1].replace(/^["']|["']$/g, '');
      continue;
    }
    const cap = line.match(CAPTION_RE);
    if (cap) { caption = cap[1].trim(); continue; }
    if (!line || line.startsWith('%%')) continue;
    if (!type) {
      type = line.split(/[\s{]/)[0];
      continue;
    }
    const t = line.match(/^title\s+(.+)$/);
    if (t && !caption) caption = t[1].trim();
  }
  return { type, typeLabel: DIAGRAM_TYPES[type] || 'Sơ đồ', caption };
}

// ---------- Độ rộng hiển thị (đếm theo grapheme, tiếng Việt có dấu tổ hợp) ----------
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null;
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
function graphemes(s) {
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
}
function strWidth(s) {
  let w = 0;
  for (const g of graphemes(s)) w += WIDE.test(g) ? 2 : 1;
  return w;
}
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - strWidth(s)));

/** Ngắt dòng theo từ, giữ khoảng trắng đầu dòng làm thụt lề cho các dòng tiếp theo */
function wrap(text, width, indent = '') {
  if (width <= 0) return [text];
  const out = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/);
    let line = '';
    for (const word of words) {
      if (!line) { line = word; continue; }
      if (strWidth(line) + 1 + strWidth(word) > width) {
        out.push(line);
        line = word;
      } else line += ' ' + word;
    }
    // từ quá dài (URL…) được cắt cứng
    while (strWidth(line) > width) {
      const g = graphemes(line);
      let cut = '', w = 0, i = 0;
      for (; i < g.length && w + strWidth(g[i]) <= width; i++) { cut += g[i]; w += strWidth(g[i]); }
      out.push(cut);
      line = g.slice(i).join('');
    }
    out.push(line);
  }
  return out.map((l, i) => (i === 0 ? l : indent + l));
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'" };
function decodeEntities(s) {
  if (!/&[#a-z0-9]+;/i.test(s)) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (NAMED[e.toLowerCase()]) return NAMED[e.toLowerCase()];
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}
const stripTags = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

// ---------- Inline ----------
function inline(tokens) {
  if (!tokens) return '';
  let s = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        s += t.tokens ? inline(t.tokens) : decodeEntities(t.text);
        break;
      case 'escape': s += decodeEntities(t.text); break;
      case 'strong': case 'em': case 'del':
        s += inline(t.tokens); break;
      case 'codespan': s += decodeEntities(t.text); break;
      case 'br': s += '\n'; break;
      case 'link': {
        const label = inline(t.tokens);
        s += t.href && t.href !== label && !t.href.startsWith('#') ? `${label} <${t.href}>` : label;
        break;
      }
      case 'image': s += `[Hình ảnh: ${t.text || t.href}]`; break;
      case 'html': s += decodeEntities(stripTags(t.text)); break;
      case 'checkbox': break; // đã in ở phần list item
      default: s += t.tokens ? inline(t.tokens) : decodeEntities(t.text || '');
    }
  }
  return s;
}

// ---------- Bảng ----------
function table(t, width) {
  const head = t.header.map((c) => inline(c.tokens).replace(/\n/g, ' '));
  const rows = t.rows.map((r) => r.map((c) => inline(c.tokens).replace(/\n/g, ' ')));
  const n = head.length;
  const natural = head.map((h, i) => Math.max(strWidth(h), ...rows.map((r) => strWidth(r[i] || '')), 3));
  const avail = width - (3 * n + 1);
  const cols = natural.slice();
  // Co các cột rộng nhất cho tới khi vừa khổ
  while (cols.reduce((a, b) => a + b, 0) > avail) {
    const max = Math.max(...cols);
    if (max <= 8) break;
    cols[cols.indexOf(max)] = max - 1;
  }
  const sep = '+' + cols.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const sepHead = '+' + cols.map((w) => '='.repeat(w + 2)).join('+') + '+';
  const renderRow = (cells) => {
    const wrapped = cols.map((w, i) => wrap(cells[i] || '', w));
    const h = Math.max(...wrapped.map((x) => x.length));
    const lines = [];
    for (let l = 0; l < h; l++) {
      lines.push('| ' + cols.map((w, i) => pad(wrapped[i][l] || '', w)).join(' | ') + ' |');
    }
    return lines;
  };
  const out = [sep, ...renderRow(head), sepHead];
  rows.forEach((r) => { out.push(...renderRow(r), sep); });
  return out.join('\n');
}

// ---------- Block ----------
export function toText(markdown, { lexer, width = 100 } = {}) {
  const tokens = lexer(splitFrontmatter(markdown.normalize('NFC')).body);
  let figNo = 0;

  function blocks(list, indent, sep = '\n\n') {
    const parts = [];
    for (const t of list) {
      const s = block(t, indent);
      if (s != null && s !== '') parts.push(s);
    }
    return parts.join(sep);
  }

  function block(t, indent) {
    const w = width - indent.length;
    const ind = (text) => text.split('\n').map((l) => (l ? indent + l : l)).join('\n');
    switch (t.type) {
      case 'space': return null;
      case 'heading': {
        const text = inline(t.tokens).replace(/\n/g, ' ');
        if (t.depth === 1) return ind(text.toUpperCase() + '\n' + '='.repeat(Math.min(w, strWidth(text))));
        if (t.depth === 2) return ind(text + '\n' + '-'.repeat(Math.min(w, strWidth(text))));
        if (t.depth === 3) return ind(text + '\n' + '~'.repeat(Math.min(w, strWidth(text))));
        return ind(text);
      }
      case 'paragraph': return ind(wrap(inline(t.tokens), w).join('\n'));
      case 'text': return ind(wrap(t.tokens ? inline(t.tokens) : decodeEntities(t.text), w).join('\n'));
      case 'blockquote':
        return blocks(t.tokens, '').split('\n').map((l) => indent + '> ' + l).join('\n').replace(/ +$/gm, '');
      case 'hr': return indent + '-'.repeat(Math.min(w, 60));
      case 'code': {
        const lang = (t.lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (lang === 'mermaid') {
          figNo++;
          const info = diagramInfo(t.text);
          const title = `[Hình ${figNo}: ${info.typeLabel}${info.caption ? ' — ' + info.caption : ''}]`;
          const body = t.text.split('\n').filter((l) => !CAPTION_RE.test(l.trim())).map((l) => '    | ' + l).join('\n');
          return ind(`${title}\n    (Mã Mermaid của sơ đồ — xem bản PDF để có hình vẽ)\n${body}`);
        }
        const label = lang ? `    [${lang}]\n` : '';
        return ind(label + t.text.split('\n').map((l) => '    ' + l).join('\n'));
      }
      case 'list': {
        let n = typeof t.start === 'number' ? t.start : 1;
        return t.items.map((item) => {
          const bullet = t.ordered ? `${n++}. ` : '- ';
          const box = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
          const sub = indent + ' '.repeat(bullet.length);
          const inner = blocks(item.tokens.filter((x) => x.type !== 'checkbox'), sub, t.loose ? '\n\n' : '\n');
          return indent + bullet + box + inner.replace(/^\s+/, '');
        }).join(t.loose ? '\n\n' : '\n');
      }
      case 'table': return ind(table(t, w));
      case 'html': {
        const s = decodeEntities(stripTags(t.text)).trim();
        return s ? ind(s) : null;
      }
      case 'def': return null;
      default: return t.tokens ? blocks(t.tokens, indent) : (t.text ? ind(t.text) : null);
    }
  }

  return blocks(tokens, '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Slug cho tiêu đề tiếng Việt: bỏ dấu, đ -> d */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'muc';
}

/** Tạo bộ sinh id không trùng cho một lượt render */
export function slugger() {
  const seen = new Map();
  return (text) => {
    const base = slugify(text);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

/** Tách YAML frontmatter ở đầu file (nếu có) */
export function splitFrontmatter(markdown) {
  const m = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: markdown.replace(/^\uFEFF/, ''), data: {} };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { body: markdown.slice(m[0].length), data };
}

/** Thông tin cấu trúc tài liệu, không chuyển đổi nội dung */
export function outline(markdown, { lexer }) {
  const { body, data } = splitFrontmatter(markdown.normalize('NFC'));
  const slug = slugger();
  const headings = [];
  const diagrams = [];
  let tables = 0;
  const walk = (tokens) => {
    for (const t of tokens) {
      if (t.type === 'heading') {
        const text = inline(t.tokens).replace(/\n/g, ' ').trim();
        headings.push({ depth: t.depth, text, id: slug(text) });
      } else if (t.type === 'code' && /^mermaid\b/i.test((t.lang || '').trim())) {
        diagrams.push({ no: diagrams.length + 1, ...diagramInfo(t.text) });
      } else if (t.type === 'table') tables++;
      if (t.type === 'list') t.items.forEach((i) => walk(i.tokens));
      else if (t.type === 'blockquote') walk(t.tokens);
    }
  };
  walk(lexer(body));
  const title = data.title || (headings.find((h) => h.depth === 1) || headings[0] || {}).text || '';
  return {
    title,
    frontmatter: data,
    headings,
    diagrams,
    stats: {
      characters: body.length,
      words: (body.match(/[\p{L}\p{N}]+/gu) || []).length,
      lines: body.split('\n').length,
      tables,
    },
  };
}

// ---------- Chuyển flowchart / graph sang sequenceDiagram ----------
// Hai kiểu flowchart, hai cách chuyển:
//  - Luồng nghiệp vụ (node là bước xử lý, có điều kiện / Bắt đầu-Kết thúc / nhãn dạng câu):
//    cột = người/bộ phận thực hiện (subgraph, hoặc chủ ngữ đầu nhãn, mặc định "Hệ thống"),
//    bước = message đánh số theo thứ tự luồng, nhánh ngoại lệ -> opt, nhánh tách-gộp -> alt/else,
//    vòng lặp -> ghi chú "Quay lại bước n".
//  - Sơ đồ kiến trúc (node là thành phần): node -> participant, cạnh -> message, subgraph -> box.
// Trả về null nếu không chuyển được để nơi gọi giữ nguyên sơ đồ gốc.
// Thêm dòng `%% giữ nguyên` (hoặc `%% keep`) vào sơ đồ để không chuyển.

const KEEP_RE = /^\s*%%\s*(?:giữ nguyên|giu nguyen|keep|no-sequence)\s*$/im;
const SKIP_STMT_RE = /^(?:classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/;
// Không dùng \b: JS coi chữ có dấu (ý, ạ…) không phải ký tự từ nên \b sai với tiếng Việt
const ACTOR_RE = /(?<!\p{L})(?:người dùng|nguoi dung|nhân viên|khách hàng|khach hang|quản lý|quản trị|admin|user|customer|actor|client|end user)(?!\p{L})/iu;
const SHAPES = [
  ['(((', ')))'], ['((', '))'], ['([', '])'], ['[[', ']]'], ['[(', ')]'], ['{{', '}}'],
  ['[/', ['/]', '\\]']], ['[\\', ['\\]', '/]']], ['>', ']'], ['[', ']'], ['(', ')'], ['{', '}'],
];
const ID_RE = /^[A-Za-z0-9_À-ɏḀ-ỿ]+(?:[.\-][A-Za-z0-9_À-ɏḀ-ỿ]+)*/;
const OP_RE = /^(<)?(-{2,}>|-{3,}|-\.+->|-\.+-|={2,}>|={3,}|-{2,}[ox](?![\w])|={2,}[ox](?![\w])|-\.+-[ox](?![\w])|~{3,})/;
const TEXT_OP_RE = /^(<)?(--|-\.|==)\s+(.+?)\s+(-{2,}>|-{3,}|\.-+>|\.-+|={2,}>|={3,}|-{2,}[ox](?![\w]))/;

function cleanLabel(s) {
  return s
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/^`([\s\S]*)`$/, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
// Ký tự đặc biệt trong nhãn sequence: ; # bị Mermaid hiểu sai -> dùng entity code
const seqText = (s) => s.replace(/[#;]/g, (c) => (c === '#' ? '#35;' : '#59;'));

function splitStatements(line) {
  const out = [];
  let cur = '';
  let quote = false;
  let depth = 0;
  for (const ch of line) {
    if (ch === '"') quote = !quote;
    else if (!quote && '([{'.includes(ch)) depth++;
    else if (!quote && ')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ';' && !quote && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// Chủ ngữ thường gặp ở đầu nhãn bước trong SRS -> tên cột (làn) thực hiện bước đó
const SUBJECTS = [
  'người dùng', 'khách hàng', 'nhân viên', 'quản lý', 'quản trị viên', 'admin', 'hệ thống', 'máy chủ',
  'server', 'backend', 'frontend', 'ứng dụng di động', 'ứng dụng', 'app', 'website', 'cơ sở dữ liệu', 'csdl',
  'database', 'ngân hàng', 'cổng thanh toán', 'đối tác', 'bên thứ ba', 'phòng nhân sự', 'nhân sự', 'kế toán',
  'giám đốc', 'trưởng phòng', 'lãnh đạo', 'văn thư', 'kho', 'thủ kho', 'đơn vị vận chuyển', 'shipper',
  'chăm sóc khách hàng', 'cskh', 'kỹ thuật', 'user', 'system', 'client', 'customer', 'api',
].sort((a, b) => b.length - a.length);
const DEFAULT_LANE = 'Hệ thống';
const TERMINAL_RE = /^(?:bắt đầu|kết thúc|start|end|begin|stop|hoàn thành|hoàn tất|finish|done)$/i;
const YES_RE = /^(?:có|yes|y|đúng|true|ok|hợp lệ|thành công|success|pass|đạt|đồng ý|duyệt)$/i;
const NO_RE = /^(?:không|no|n|sai|false|thất bại|fail|failed|từ chối|lỗi|error|không hợp lệ|invalid)$/i;
// Câu hỏi mang nghĩa lỗi / vượt ngưỡng ("Sai quá 3 lần?", "Có lỗi?"): nhánh Không mới là luồng bình thường
const NEGATIVE_Q_RE = /(lỗi|sai|thất bại|hết hạn|quá|vượt|khoá|khóa|bị |trùng|error|fail|invalid|expired|exceed|timeout|locked)/i;
const DECISION_SHAPES = new Set(['{', 'diamond', 'decision', 'diam', 'rhombus', 'question']);
const capFirst = (t) => (t ? t[0].toLocaleUpperCase('vi') + t.slice(1) : t);

function matchSubject(label) {
  const lower = label.toLocaleLowerCase('vi');
  for (const sub of SUBJECTS) {
    if (lower.startsWith(sub) && (lower.length === sub.length || /[\s:,]/.test(lower[sub.length]))) {
      return { name: capFirst(label.slice(0, sub.length)), rest: label.slice(sub.length).replace(/^[\s:,]+/, '') };
    }
  }
  return null;
}

// Luồng nghiệp vụ nếu có node điều kiện, node Bắt đầu/Kết thúc, hoặc đa số nhãn là câu (>= 3 từ)
function isProcessFlow(nodes) {
  const list = [...nodes.values()];
  if (list.some((n) => DECISION_SHAPES.has(n.shape) || TERMINAL_RE.test(n.label.trim()))) return true;
  const sentences = list.filter((n) => n.label.trim().split(/\s+/).length >= 3).length;
  return sentences * 2 >= list.length;
}

function processSequence({ nodes, edges, boxes, front }) {
  const body = [];
  const lanes = new Map(); // key -> { name, order }
  const laneKey = (name) => name.toLocaleLowerCase('vi');
  const useLane = (name) => {
    const key = laneKey(name);
    if (!lanes.has(key)) lanes.set(key, { name, order: lanes.size });
    return key;
  };
  const isDecision = (n) => DECISION_SHAPES.has(n.shape);
  const isTerminal = (n) => TERMINAL_RE.test(n.label.trim());
  const live = edges.filter((e) => e.from !== e.to);
  const outs = (id) => live.filter((e) => e.from === id);

  // Cột thực hiện và nội dung bước của một node.
  // Bỏ số thứ tự viết tay ở đầu nhãn ("1. Lấy token") vì sơ đồ đã tự đánh số bước
  const info = (n) => {
    const label = n.label.replace(/^\s*(?:bước\s*)?\d+(?:\.\d+)*[.):]\s+/i, '') || n.label;
    const sub = matchSubject(label);
    let lane;
    let action = label;
    if (n.box >= 0 && boxes[n.box]) {
      lane = boxes[n.box].title;
      if (sub && laneKey(sub.name) === laneKey(lane)) action = sub.rest;
    } else if (sub) {
      lane = sub.name;
      action = sub.rest;
    } else lane = DEFAULT_LANE;
    return { lane, action: capFirst(action || label) };
  };

  const visited = new Set();
  const stepOf = new Map();
  let step = 0;
  const pid = (key) => 'L' + lanes.get(key).order;

  function emitStep(n, fromKey, indent, edgeLabel) {
    const { lane, action: act } = info(n);
    const action = isDecision(n) && !/^kiểm tra/i.test(act) ? `Kiểm tra: ${act}` : act;
    const to = useLane(lane);
    const from = fromKey || to;
    const text = action + (edgeLabel ? ` (${edgeLabel})` : '');
    body.push({ indent, from, to, text });
    stepOf.set(n.id, ++step);
    return to;
  }
  function note(laneKeyOrNull, indent, text) {
    const key = laneKeyOrNull || useLane(DEFAULT_LANE);
    body.push({ indent, note: key, text });
  }
  function backRef(id, laneK, indent) {
    const n = nodes.get(id);
    let text;
    if (isTerminal(n)) return; // nhiều nhánh cùng về "Kết thúc": không cần ghi chú
    if (stepOf.has(id)) text = `Quay lại bước ${stepOf.get(id)} — ${info(n).action}`;
    else if (isDecision(n)) text = `Quay lại kiểm tra: ${n.label}`;
    else text = `Quay lại: ${n.label}`;
    note(laneK, indent, text);
  }

  // Các node đi tới được từ start (không đi qua node đã duyệt và điểm dừng), theo thứ tự BFS
  function reach(start, stop) {
    const seen = [];
    const set = new Set();
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      if (set.has(id) || id === stop || visited.has(id)) continue;
      set.add(id);
      seen.push(id);
      for (const e of outs(id)) queue.push(e.to);
    }
    return seen;
  }
  function findJoin(targets, stop) {
    const lists = targets.map((t) => reach(t, stop));
    const sets = lists.map((l) => new Set(l));
    return lists[0].find((id) => sets.every((st) => st.has(id))) || null;
  }

  let reachedEnd = false; // nhánh vừa duyệt có đi tới node Kết thúc không
  function walk(start, fromKey, indent, stopAt, edgeLabel = '') {
    let cur = start;
    let lane = fromKey;
    let label = edgeLabel;
    while (cur && cur !== stopAt) {
      const n = nodes.get(cur);
      if (visited.has(cur)) {
        if (isTerminal(n)) reachedEnd = true;
        backRef(cur, lane, indent);
        return lane;
      }
      visited.add(cur);
      const o = outs(cur);

      if (o.length > 1) {
        const dec = isDecision(n);
        if (!dec && !isTerminal(n)) lane = emitStep(n, lane, indent, label);
        // Hình thoi luôn là một bước "Kiểm tra: …" có đánh số, ở làn thực hiện việc kiểm tra
        // (subgraph / chủ ngữ, mặc định Hệ thống); các nhánh xuất phát từ làn này
        if (dec) lane = emitStep(n, lane, indent, label);
        let join = findJoin(o.map((e) => e.to), stopAt);
        // Gộp nhau ở "Kết thúc" không phải gộp thật: nhánh tới thẳng kết thúc là nhánh dừng riêng
        if (join && isTerminal(nodes.get(join))) join = null;

        if (dec) {
          // Hình thoi: luồng chính đi tiếp ở ngoài, các nhánh còn lại vẽ thành đường riêng (opt/alt)
          let main = null;
          let side;
          if (join) {
            side = o.filter((e) => e.to !== join); // nhánh đi thẳng tới điểm gộp không có bước nào
          } else {
            // Luồng chính theo nghĩa câu hỏi: câu khẳng định ("Hợp lệ?") -> nhánh Có/Yes đi tiếp,
            // câu mang nghĩa lỗi ("Sai quá 3 lần?") -> nhánh Không/No đi tiếp.
            // Nhãn nhánh không phải Có/Không thì lấy nhánh đi xa nhất.
            const wantRe = NEGATIVE_Q_RE.test(n.label) ? NO_RE : YES_RE;
            let k = o.findIndex((e) => wantRe.test(e.label.trim()));
            if (k < 0) {
              const sizes = o.map((e) => reach(e.to, stopAt).length);
              k = 0;
              for (let j = 1; j < o.length; j++) if (sizes[j] > sizes[k]) k = j;
            }
            main = o[k];
            side = o.filter((_, j) => j !== k);
          }
          if (!side.length) side = o;
          const cond = n.label;
          side.forEach((e, k) => {
            // Câu hỏi đã nằm ở bước "Kiểm tra: …" ngay trên khối -> tiêu đề khối chỉ cần nhãn nhánh
            const head = e.label || (k === 0 ? cond : '');
            body.push({ indent, raw: `${k === 0 ? (side.length === 1 ? 'opt' : 'alt') : 'else'} ${head}`.trimEnd() });
            const before = body.length;
            reachedEnd = false;
            const endLane = walk(e.to, lane, indent + '    ', join || stopAt);
            if (reachedEnd) note(endLane || lane, indent + '    ', 'Kết thúc luồng');
            else if (body.length === before) note(lane, indent + '    ', 'Bỏ qua');
          });
          body.push({ indent, raw: 'end' });
          reachedEnd = false; // chỉ tính phần đi tiếp sau khối, không tính nhánh con bên trong
          cur = main ? main.to : join;
          label = '';
          continue;
        }

        // Rẽ nhánh song song (không phải điều kiện): mọi nhánh trong khối par
        o.forEach((e, k) => {
          body.push({ indent, raw: `${k === 0 ? 'par' : 'and'} ${e.label || 'Song song'}` });
          const before = body.length;
          walk(e.to, lane, indent + '    ', join || stopAt);
          if (body.length === before) note(lane, indent + '    ', isTerminal(nodes.get(e.to)) ? 'Kết thúc luồng' : 'Bỏ qua');
        });
        body.push({ indent, raw: 'end' });
        reachedEnd = false;
        cur = join;
        label = '';
        continue;
      }

      if (!isTerminal(n)) lane = emitStep(n, lane, indent, label);
      if (!o.length) { if (isTerminal(n)) reachedEnd = true; return lane; }
      label = o[0].label;
      cur = o[0].to;
    }
    return lane;
  }

  const indeg = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const e of live) indeg.set(e.to, indeg.get(e.to) + 1);
  const starts = [...nodes.keys()].filter((id) => indeg.get(id) === 0);
  for (const id of starts.length ? starts : [nodes.keys().next().value]) if (!visited.has(id)) walk(id, null, '    ', null);
  for (const id of nodes.keys()) if (!visited.has(id)) walk(id, null, '    ', null);
  if (!step) return null;

  // Cột: người dùng / actor lên trước, còn lại theo thứ tự xuất hiện
  const laneList = [...lanes.entries()].sort(([, a], [, b]) => (ACTOR_RE.test(b.name) - ACTOR_RE.test(a.name)) || a.order - b.order);
  laneList.forEach(([, l], k) => { l.order = k; });
  const count = laneList.length;
  // Ít cột: nới rộng để nhãn bước dài không bị ngắt vụn; nhiều cột: thu hẹp
  const init = count <= 2 ? { width: 150, actorMargin: 170 } : count === 3 ? { width: 140, actorMargin: 110 }
    : count === 4 ? { width: 130, actorMargin: 70 } : count > 9 ? { width: 100, actorMargin: 6 } : count > 6 ? { width: 108, actorMargin: 10 } : null;
  const out = [front + (init ? `%%{init: ${JSON.stringify({ sequence: init })}}%%\n` : '') + 'sequenceDiagram', '    autonumber'];
  for (const [key, l] of laneList) out.push(`    ${ACTOR_RE.test(l.name) ? 'actor' : 'participant'} ${pid(key)} as ${seqText(l.name)}`);
  for (const b of body) {
    if (b.raw) out.push(b.indent + seqText(b.raw));
    else if (b.note) out.push(`${b.indent}Note over ${pid(b.note)}: ${seqText(b.text)}`);
    // Bước tự thực hiện (mũi tên vòng) với nhãn ngắn: không ngắt dòng để khỏi bị vụn
    else out.push(`${b.indent}${pid(b.from)}->>${pid(b.to)}: ${b.from === b.to && b.text.length <= 42 ? 'nowrap:' : ''}${seqText(b.text)}`);
  }
  return out.join('\n');
}

export function flowchartToSequence(src) {
  if (KEEP_RE.test(src)) return null;
  const lines = src.split('\n');
  let i = 0;
  let front = '';
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
    if (end > 0) { front = lines.slice(0, end + 1).join('\n') + '\n'; i = end + 1; }
  }
  // Dòng khai báo loại sơ đồ
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith('%%')) continue;
    if (!/^(?:flowchart|graph)\b/.test(l)) return null;
    i++;
    break;
  }

  const nodes = new Map(); // id -> { label, shape, box, order }
  const edges = []; // { from, to, label, kind }
  const boxes = []; // { title }
  const boxStack = [];
  const subgraphIds = new Map(); // id subgraph -> title

  const touch = (id, label, shape) => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: subgraphIds.get(id) || id, shape: '', box: boxStack.length ? boxStack[boxStack.length - 1] : -1, order: nodes.size };
      nodes.set(id, n);
    }
    if (label != null && label !== '') { n.label = label; n.shape = shape; }
    return n;
  };

  function parseNode(s, pos) {
    const rest = s.slice(pos);
    const m = rest.match(ID_RE);
    if (!m) return null;
    const id = m[0];
    let p = pos + id.length;
    let label = null;
    let shape = '';
    if (s.startsWith('@{', p)) {
      const close = s.indexOf('}', p);
      if (close < 0) return null;
      const body = s.slice(p + 2, close);
      const lm = body.match(/label:\s*"([^"]*)"/) || body.match(/label:\s*([^,}]+)/);
      if (lm) label = cleanLabel(lm[1]);
      const sm = body.match(/shape:\s*([\w-]+)/);
      shape = sm ? sm[1] : '';
      p = close + 1;
    } else {
      for (const [open, closeDef] of SHAPES) {
        if (!s.startsWith(open, p)) continue;
        const closes = Array.isArray(closeDef) ? closeDef : [closeDef];
        let q = p + open.length;
        while (s[q] === ' ') q++;
        let textEnd;
        if (s[q] === '"') {
          const endQuote = s.indexOf('"', q + 1);
          if (endQuote < 0) return null;
          textEnd = endQuote + 1;
        } else textEnd = q;
        let found = -1;
        let closeLen = 0;
        for (const c of closes) {
          const k = s.indexOf(c, textEnd);
          if (k >= 0 && (found < 0 || k < found)) { found = k; closeLen = c.length; }
        }
        if (found < 0) return null;
        label = cleanLabel(s.slice(p + open.length, found));
        shape = open;
        p = found + closeLen;
        break;
      }
    }
    const cls = s.slice(p).match(/^:::[\w-]+/);
    if (cls) p += cls[0].length;
    return { id, label, shape, end: p };
  }

  function parseGroup(s, pos) {
    const ids = [];
    let p = pos;
    for (;;) {
      while (s[p] === ' ') p++;
      const n = parseNode(s, p);
      if (!n) return null;
      touch(n.id, n.label, n.shape);
      ids.push(n.id);
      p = n.end;
      const amp = s.slice(p).match(/^\s*&\s*/);
      if (!amp) break;
      p += amp[0].length;
    }
    return { ids, end: p };
  }

  function parseEdge(s, pos) {
    const ws = s.slice(pos).match(/^\s*/)[0].length;
    const rest = s.slice(pos + ws);
    let m = rest.match(OP_RE);
    let label = '';
    let op;
    let len;
    if (m) {
      op = (m[1] || '') + m[2];
      len = m[0].length;
      const pipe = rest.slice(len).match(/^\s*\|([^|]*)\|/);
      if (pipe) { label = cleanLabel(pipe[1]); len += pipe[0].length; }
    } else if ((m = rest.match(TEXT_OP_RE))) {
      op = (m[1] || '') + m[2] + m[4];
      label = cleanLabel(m[3]);
      len = m[0].length;
    } else return null;
    let kind = 'solid';
    if (op.includes('~')) kind = 'hidden';
    else if (op.startsWith('<') && op.endsWith('>')) kind = 'both';
    else if (op.includes('.')) kind = 'dotted';
    else if (/x$/.test(op)) kind = 'cross';
    else if (/o$/.test(op)) kind = 'open';
    else if (!op.endsWith('>')) kind = 'line';
    return { label, kind, end: pos + ws + len };
  }

  for (; i < lines.length; i++) {
    const raw = lines[i].replace(/%%.*$/, '').trim();
    if (!raw) continue;
    for (const stmt of splitStatements(raw)) {
      if (SKIP_STMT_RE.test(stmt)) continue;
      const sg = stmt.match(/^subgraph\s+(.+)$/);
      if (sg) {
        let id = sg[1].trim();
        let title = id;
        const t = id.match(/^([^\s[]+)\s*\[(.*)\]$/);
        if (t) { id = t[1]; title = cleanLabel(t[2]); } else title = cleanLabel(id);
        subgraphIds.set(id, title);
        boxes.push({ title });
        boxStack.push(boxes.length - 1);
        continue;
      }
      if (stmt === 'end') { boxStack.pop(); continue; }

      const first = parseGroup(stmt, 0);
      if (!first) return null;
      let prev = first;
      let p = first.end;
      while (p < stmt.length) {
        const e = parseEdge(stmt, p);
        if (!e) return null;
        const next = parseGroup(stmt, e.end);
        if (!next) return null;
        if (e.kind !== 'hidden') {
          for (const a of prev.ids) for (const b of next.ids) edges.push({ from: a, to: b, label: e.label, kind: e.kind });
        }
        prev = next;
        p = next.end;
        if (stmt.slice(p).trim() === '') break;
      }
    }
  }
  if (!edges.length) return null;

  // Node subgraph dùng làm điểm đầu/cuối cạnh: không xếp vào box của chính nó
  for (const [id, title] of subgraphIds) {
    const n = nodes.get(id);
    if (n) { n.label = n.label === id ? title : n.label; n.box = -1; }
  }

  if (isProcessFlow(nodes)) {
    const seq = processSequence({ nodes, edges: edges.filter((e) => e.kind !== 'hidden'), boxes, front });
    if (seq) return seq;
  }

  // Node điều kiện {…}: có đúng nguồn vào và các nhánh ra đều là node thường -> alt/else
  const isDecision = (id) => {
    const n = nodes.get(id);
    return n && (n.shape === '{' || n.shape === 'diamond' || n.shape === 'decision' || n.shape === 'diam');
  };
  const decisions = new Map(); // id -> { source, inLabel, branches: [{to,label,kind}] }
  for (const n of nodes.values()) {
    if (!isDecision(n.id)) continue;
    const ins = edges.filter((e) => e.to === n.id && e.from !== n.id);
    const outs = edges.filter((e) => e.from === n.id && e.to !== n.id);
    if (!ins.length || !outs.length) continue;
    if (ins.some((e) => isDecision(e.from)) || outs.some((e) => isDecision(e.to))) continue;
    decisions.set(n.id, { source: ins[0].from, inLabel: ins[0].label, branches: outs });
  }

  const pid = (id) => 'n' + [...nodes.keys()].indexOf(id);
  const used = new Set();
  for (const e of edges) {
    if (decisions.has(e.to) || decisions.has(e.from)) continue;
    used.add(e.from); used.add(e.to);
  }
  for (const [, d] of decisions) { used.add(d.source); d.branches.forEach((b) => used.add(b.to)); }

  // Nhiều cột: thu hẹp cột và khoảng cách riêng cho sơ đồ này để vừa khổ trang mà chữ không co quá nhỏ
  const count = [...nodes.values()].filter((n) => used.has(n.id) && !decisions.has(n.id)).length;
  const init = count > 9 ? { width: 100, actorMargin: 6 } : count > 6 ? { width: 108, actorMargin: 10 } : null;
  const out = [front + (init ? `%%{init: ${JSON.stringify({ sequence: init })}}%%\n` : '') + 'sequenceDiagram', '    autonumber'];
  const declare = (n, indent) => {
    const kw = ACTOR_RE.test(n.label) ? 'actor' : 'participant';
    out.push(`${indent}${kw} ${pid(n.id)} as ${seqText(n.label)}`);
  };
  const ordered = [...nodes.values()].filter((n) => used.has(n.id) && !decisions.has(n.id)).sort((a, b) => a.order - b.order);
  const emittedBox = new Set();
  for (const n of ordered) {
    if (n.box < 0) { declare(n, '    '); continue; }
    if (emittedBox.has(n.box)) continue;
    emittedBox.add(n.box);
    out.push(`    box rgba(43,108,176,0.07) ${seqText(boxes[n.box].title)}`);
    ordered.filter((x) => x.box === n.box).forEach((x) => declare(x, '        '));
    out.push('    end');
  }

  const ARROW = { solid: '->>', dotted: '-->>', both: '<<->>', cross: '-x', open: '-)', line: '->' };
  // Cạnh không có nhãn: dùng tên node đích làm nhãn để các bước giãn đều, dễ đọc
  const msg = (from, to, label, kind, indent) =>
    out.push(`${indent}${pid(from)}${ARROW[kind] || '->>'}${pid(to)}: ${seqText(label || nodes.get(to).label)}`);

  const doneDecision = new Set();
  for (const e of edges) {
    if (decisions.has(e.to)) continue; // cạnh vào node điều kiện: gộp vào khối alt
    if (decisions.has(e.from)) {
      if (doneDecision.has(e.from)) continue;
      doneDecision.add(e.from);
      const d = decisions.get(e.from);
      const cond = seqText(nodes.get(e.from).label);
      d.branches.forEach((b, k) => {
        const head = b.label ? `${cond} — ${seqText(b.label)}` : cond;
        out.push(k === 0 ? `    alt ${head}` : `    else ${b.label ? seqText(b.label) : ''}`.trimEnd());
        msg(d.source, b.to, d.inLabel, b.kind, '        ');
      });
      out.push('    end');
      continue;
    }
    msg(e.from, e.to, e.label, e.kind, '    ');
  }
  return out.join('\n');
}
