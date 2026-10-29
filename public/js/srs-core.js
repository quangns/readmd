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
