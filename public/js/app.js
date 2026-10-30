// convertSRS — đọc Markdown, xem trực tiếp hoặc xuất PDF / TXT.
// Thư viện marked, DOMPurify, hljs, mermaid được nạp dạng global từ /vendor.
import { diagramInfo, toText, slugger, splitFrontmatter, flowchartToSequence, liftDiagramCaptions } from './srs-core.js';
import { FORMATS as T2J_FORMATS, convertToJson } from './text2json.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const el = {
  fileInput: $('#fileInput'), dropzone: $('#dropzone'),
  pasteBox: $('#pasteBox'),
  fileLabel: $('#fileLabel'), fileName: $('#fileName'), fileMeta: $('#fileMeta'),
  btnPdf: $('#btnPdf'), btnTxt: $('#btnTxt'), btnPrint: $('#btnPrint'), btnMd: $('#btnMd'), btnCopyRaw: $('#btnCopyRaw'),
  toc: $('#toc'), tocCount: $('#tocCount'),
  empty: $('#empty'), skeleton: $('#skeleton'), doc: $('#doc'), docBody: $('#docBody'),
  rawView: $('#rawView'), optWrap: $('#optWrap'),
  editor: $('#editor'), txtPreview: $('#txtPreview'), status: $('#status'),
  dropOverlay: $('#dropOverlay'),
  btnPrintMenu: $('#btnPrintMenu'), printMenu: $('#printMenu'), btnPdfMenu: $('#btnPdfMenu'),
  viewer: $('#viewer'), viewerStage: $('#viewerStage'), viewerTitle: $('#viewerTitle'), viewerZoom: $('#viewerZoom'),
  toast: $('#toast'),
};

const state = {
  markdown: '',
  fileName: '',
  source: '',
  title: '',
  headings: [],
  renderSeq: 0,
  diagramErrors: 0,
  diagrams: [],
};

// ---------- Theme: sáng / tối / theo hệ thống ----------
// Lựa chọn lưu trong localStorage; script nhỏ trong <head> đã đặt data-theme trước khi vẽ trang
const THEME_KEY = 'convertsrs-theme';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
let themeOverride = null; // ép tạm 'light' khi in bằng trình duyệt

function themeMode() {
  const m = localStorage.getItem(THEME_KEY);
  return m === 'light' || m === 'dark' ? m : 'system';
}
function effectiveTheme() {
  if (themeOverride) return themeOverride;
  const m = themeMode();
  return m === 'system' ? (darkQuery.matches ? 'dark' : 'light') : m;
}
function applyTheme() {
  const before = document.documentElement.dataset.theme;
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  $$('[data-theme-option]').forEach((b) => {
    const on = b.dataset.themeOption === themeMode();
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  return before !== theme ? repaintDiagrams() : Promise.resolve();
}
$$('[data-theme-option]').forEach((b) => b.addEventListener('click', () => {
  const mode = b.dataset.themeOption;
  if (mode === 'system') localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, mode);
  applyTheme();
}));
darkQuery.addEventListener('change', () => { if (themeMode() === 'system') applyTheme(); });

// Vercel giới hạn request 4.5 MB; bản desktop tạo PDF ngay trên máy nên không giới hạn
const PDF_BODY_LIMIT = window.desktop ? Infinity : 4.3 * 1024 * 1024;

// ---------- Mermaid ----------
const FONT = "'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
const MERMAID_BASE = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  fontFamily: FONT,
  htmlLabels: false, // nhãn bằng <text> thuần SVG: in PDF, xuất PNG/SVG đều chuẩn
  // Thu gọn khoảng cách để sơ đồ vừa bề rộng trang A4 (~170mm) mà chữ không bị co quá nhỏ
  flowchart: { htmlLabels: false, curve: 'basis', padding: 12, nodeSpacing: 32, rankSpacing: 40 },
  // Sequence: cột hẹp + tự xuống dòng nhãn dài để sơ đồ vừa khổ trang mà chữ vẫn ≥ 12px
  sequence: {
    useMaxWidth: true, mirrorActors: false, wrap: true, wrapPadding: 8,
    width: 118, height: 44, actorMargin: 30, boxMargin: 8, boxTextMargin: 4,
    noteMargin: 8, messageMargin: 30, diagramMarginX: 8, diagramMarginY: 8,
    actorFontSize: 13, messageFontSize: 13, noteFontSize: 12,
    messageFontFamily: FONT, actorFontFamily: FONT, noteFontFamily: FONT,
  },
  er: { useMaxWidth: true },
  gantt: { useMaxWidth: true, useWidth: 760, barHeight: 22, fontSize: 12, sectionFontSize: 12, leftPadding: 110, axisFormat: '%d/%m', todayMarker: 'off' },
};

const MERMAID_THEMES = {
  light: {
    fontFamily: FONT,
    fontSize: '14px',
    background: '#F8FAFC',
    primaryColor: '#EAF1F8',
    primaryBorderColor: '#2B6CB0',
    primaryTextColor: '#18181B',
    secondaryColor: '#F4F4F5',
    secondaryBorderColor: '#A1A1AA',
    tertiaryColor: '#FFFFFF',
    tertiaryBorderColor: '#D4D4D8',
    lineColor: '#52525B',
    textColor: '#18181B',
    noteBkgColor: '#FFF8E6',
    noteBorderColor: '#D9B65C',
    noteTextColor: '#18181B',
    actorBkg: '#EAF1F8',
    actorBorder: '#2B6CB0',
    signalColor: '#3F3F46',
    labelBoxBkgColor: '#EAF1F8',
    labelBoxBorderColor: '#2B6CB0',
    edgeLabelBackground: '#FFFFFF',
    clusterBkg: '#FFFFFF',
    clusterBorder: '#D4D4D8',
  },
  dark: {
    darkMode: true,
    fontFamily: FONT,
    fontSize: '14px',
    background: '#1F1F23',
    primaryColor: '#1B2A3A',
    primaryBorderColor: '#6AA5E0',
    primaryTextColor: '#E4E4E7',
    secondaryColor: '#27272A',
    secondaryBorderColor: '#52525B',
    tertiaryColor: '#18181B',
    tertiaryBorderColor: '#3F3F46',
    lineColor: '#A1A1AA',
    textColor: '#E4E4E7',
    mainBkg: '#1B2A3A',
    nodeBorder: '#6AA5E0',
    noteBkgColor: '#3A3420',
    noteBorderColor: '#A68A3C',
    noteTextColor: '#E4E4E7',
    actorBkg: '#1B2A3A',
    actorBorder: '#6AA5E0',
    actorTextColor: '#E4E4E7',
    actorLineColor: '#71717A',
    signalColor: '#D4D4D8',
    signalTextColor: '#E4E4E7',
    labelBoxBkgColor: '#1B2A3A',
    labelBoxBorderColor: '#6AA5E0',
    labelTextColor: '#E4E4E7',
    loopTextColor: '#E4E4E7',
    sequenceNumberColor: '#18181B',
    edgeLabelBackground: '#18181B',
    clusterBkg: '#18181B',
    clusterBorder: '#3F3F46',
    titleColor: '#E4E4E7',
    attributeBackgroundColorOdd: '#1F1F23',
    attributeBackgroundColorEven: '#18181B',
    taskBkgColor: '#1B2A3A',
    taskBorderColor: '#6AA5E0',
    taskTextColor: '#E4E4E7',
    taskTextDarkColor: '#E4E4E7',
    taskTextOutsideColor: '#E4E4E7',
    activeTaskBkgColor: '#24456B',
    activeTaskBorderColor: '#6AA5E0',
    doneTaskBkgColor: '#3F3F46',
    doneTaskBorderColor: '#71717A',
    gridColor: '#3F3F46',
    sectionBkgColor: '#1F1F23',
    altSectionBkgColor: '#18181B',
    sectionBkgColor2: '#1F1F23',
  },
};

// mermaid.initialize là cấu hình toàn cục → xếp hàng các lượt render để không lẫn theme
let mermaidQueue = Promise.resolve();
let mermaidSeq = 0;
function renderMermaid(src, theme) {
  const job = mermaidQueue.then(async () => {
    mermaid.initialize({ ...MERMAID_BASE, themeVariables: MERMAID_THEMES[theme] });
    const id = `mmd-${++mermaidSeq}`;
    try {
      return (await mermaid.render(id, src)).svg;
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById('d' + id)?.remove();
    }
  });
  mermaidQueue = job.catch(() => {});
  return job;
}

// ---------- Markdown ----------
function createRenderer(slug, headings, diagrams) {
  const renderer = new marked.Renderer();

  renderer.heading = function ({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    const text = tokens.map((t) => t.raw).join('').replace(/[*_`~]/g, '').trim() || 'muc';
    const id = slug(text);
    headings.push({ depth, text: htmlToText(html), id });
    return `<h${depth} id="${id}">${html}</h${depth}>\n`;
  };

  renderer.code = function ({ text, lang }) {
    const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
    if (language === 'mermaid') {
      const info = diagramInfo(text);
      const isFlow = info.type === 'flowchart' || info.type === 'graph';
      const seqSrc = isFlow ? flowchartToSequence(text) : null;
      const d = { src: text, seqSrc, view: seqSrc && flowToSeqEnabled() ? 'sequence' : 'original', ...info };
      const no = diagrams.push(d);
      return `<figure class="diagram" id="hinh-${no}" data-diagram="${no - 1}">
        <div class="diagram__frame"><div class="sk sk--block"></div></div>
        <figcaption>${captionHtml(no, d)}</figcaption>
      </figure>\n`;
    }
    let body;
    if (language && hljs.getLanguage(language)) body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
    else body = escapeHtml(text);
    return `<pre><code class="hljs${language ? ' language-' + escapeHtml(language) : ''}">${body}</code></pre>\n`;
  };

  const baseTable = renderer.table.bind(renderer);
  renderer.table = function (token) {
    return `<div class="table-wrap">${baseTable(token)}</div>\n`;
  };

  return renderer;
}

// ---------- Flowchart -> sequence ----------
const FLOW2SEQ_KEY = 'convertsrs-flow2seq';
function flowToSeqEnabled() {
  return localStorage.getItem(FLOW2SEQ_KEY) !== '0';
}
const diagramSrc = (d) => (d.view === 'sequence' && d.seqSrc ? d.seqSrc : d.src);
function diagramLabel(d) {
  if (d.caption) return d.caption;
  return d.view === 'sequence' && d.seqSrc ? 'Sơ đồ tuần tự' : d.typeLabel;
}
function captionHtml(no, d) {
  return `<span class="fig-no">Hình ${no}</span> — ${escapeHtml(diagramLabel(d))}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = DOMPurify.sanitize(html);
  return d.textContent.trim();
}

async function render() {
  const seq = ++state.renderSeq;
  const { body: rawBody, data } = splitFrontmatter(state.markdown.normalize('NFC'));
  const body = liftDiagramCaptions(rawBody);
  const headings = [];
  const diagrams = [];
  const html = marked.parse(body, {
    gfm: true,
    breaks: false,
    renderer: createRenderer(slugger(), headings, diagrams),
  });

  el.docBody.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['data-diagram'] });
  state.headings = headings;
  state.title = data.title || (headings.find((h) => h.depth === 1) || headings[0] || {}).text || baseName(state.fileName) || 'Tài liệu';
  document.title = `${state.title} — convertSRS`;

  showDoc();
  buildToc(headings, diagrams);
  renderRaw();
  renderTxt();
  refreshT2jSources();
  setStatus(`${headings.length} mục · ${diagrams.length} sơ đồ · đang vẽ…`);

  // Vẽ lần lượt từng sơ đồ; bỏ dở nếu đã có lượt render mới
  state.diagrams = diagrams;
  lightSvgCache.clear();
  const theme = effectiveTheme();
  let errors = 0;
  for (const fig of $$('.diagram', el.docBody)) {
    if (seq !== state.renderSeq) return;
    const index = Number(fig.dataset.diagram);
    const d = diagrams[index];
    try {
      const svg = await renderDiagramSvg(d, theme);
      if (seq !== state.renderSeq) return;
      if (theme === 'light') lightSvgCache.set(cacheKey(index), svg);
      paintDiagram(fig, d, svg);
      await fitSequenceWidth(fig, d, theme);
    } catch (err) {
      if (seq !== state.renderSeq) return;
      errors++;
      fig.classList.add('diagram--error');
      $('.diagram__frame', fig).innerHTML = `<p class="diagram__error-msg">Lỗi cú pháp sơ đồ: ${escapeHtml(cleanMermaidError(err))}</p>
        <pre class="diagram__error-src"><code>${escapeHtml(d.src)}</code></pre>`;
    }
  }
  state.diagramErrors = errors;
  lastFrameWidth = $('.diagram__frame', el.docBody)?.clientWidth || 0;
  setStatus(`${headings.length} mục · ${diagrams.length} sơ đồ${errors ? ` · ${errors} sơ đồ lỗi` : ''}`, errors > 0);
}

// Vẽ theo chế độ xem; nếu bản chuyển sang sequence lỗi thì bỏ chuyển đổi, vẽ bản gốc
async function renderDiagramSvg(d, theme) {
  try {
    return await renderMermaid(diagramSrc(d), theme);
  } catch (err) {
    if (diagramSrc(d) === d.src) throw err;
    console.warn('Không vẽ được bản sequence, dùng sơ đồ gốc:', err);
    d.seqSrc = null;
    d.view = 'original';
    return renderMermaid(d.src, theme);
  }
}

function prepareSvg(svgEl, fig, d) {
  svgEl.removeAttribute('height');
  // Không phóng to sơ đồ nhỏ quá kích thước gốc
  const vbw = svgEl.viewBox.baseVal?.width;
  if (vbw) svgEl.style.maxWidth = `${Math.ceil(vbw)}px`;
  svgEl.setAttribute('role', 'img');
  svgEl.setAttribute('aria-label', `Hình ${Number(fig.dataset.diagram) + 1}: ${diagramLabel(d)}`);
  return svgEl;
}

// ---------- Màu tác giả tự đặt trong sơ đồ khi xem ở giao diện tối ----------
// rect rgb(245,245,245) / box rgb(...) trong sequence, style/classDef fill:#fff trong flowchart
// giữ nguyên màu sáng dù theme tối -> chữ sáng trên nền sáng không đọc được.
// Chỉ đổi khi hiển thị: nền sáng -> tông tối cùng sắc độ, chữ tối -> tông sáng. PDF/ảnh giữ màu gốc.
const colorCtx = document.createElement('canvas').getContext('2d');
function parseColor(str) {
  const v = String(str || '').replace(/!important/i, '').trim();
  if (!v || v === 'none' || v === 'transparent' || v.startsWith('url(')) return null;
  colorCtx.fillStyle = '#010203';
  colorCtx.fillStyle = v;
  const out = colorCtx.fillStyle;
  if (out === '#010203' && !/^#010203$/i.test(v)) return null; // màu không hợp lệ
  let m = out.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  m = out.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const [r, g, b, a = 1] = m[1].split(',').map(Number); return { r, g, b, a }; }
  return null;
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) return [l, l, l].map((x) => Math.round(x * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
}
function darkVariant(str, kind) {
  const c = parseColor(str);
  if (!c || c.a === 0) return null;
  const [h, s, l] = rgbToHsl(c);
  let nl;
  if (kind === 'bg' && l > 0.55) nl = 0.12 + (1 - l) * 0.3; // nền sáng -> tối, giữ sắc độ
  else if (kind === 'text' && l < 0.45) nl = 0.86; // chữ tối -> sáng
  else return null;
  const [r, g, b] = hslToRgb(h, Math.min(s, kind === 'bg' ? 0.4 : 0.5), nl);
  return c.a < 1 ? `rgba(${r}, ${g}, ${b}, ${c.a})` : `rgb(${r}, ${g}, ${b})`;
}
function adaptDarkSvg(svgEl, src = '') {
  // classDef: màu nằm trong khối <style> của SVG (".ten>*{fill:…}", ".ten tspan{fill:…}").
  // Chỉ sửa luật của các class tác giả khai báo, không đụng màu theme (mũi tên, đường nối…)
  const classNames = [...src.matchAll(/^\s*classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)/gm)].flatMap((m) => m[1].split(/\s*,\s*/));
  if (classNames.length) {
    const classRe = new RegExp(`\\.(?:${classNames.map((c) => c.replace(/[-]/g, '\\$&')).join('|')})(?![\\w-])`);
    for (const st of svgEl.querySelectorAll('style')) {
      st.textContent = st.textContent.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, sel, decls) => {
        if (!classRe.test(sel)) return rule;
        const textSel = /\b(tspan|text|span|p|label)\b/.test(sel);
        const out = decls.replace(/(fill|color)\s*:\s*([^;!]+)(\s*!important)?/gi, (m, prop, val, imp = '') => {
          const kind = prop.toLowerCase() === 'color' || textSel ? 'text' : 'bg';
          const v = darkVariant(val, kind);
          return v ? `${prop}:${v}${imp}` : m;
        });
        return `${sel}{${out}}`;
      });
    }
  }
  // Khối rect / box của sequence: màu nằm ở thuộc tính fill
  for (const el of svgEl.querySelectorAll('rect.rect[fill]')) {
    const v = darkVariant(el.getAttribute('fill'), 'bg');
    if (v) el.setAttribute('fill', v);
  }
  // style / classDef / linkStyle trong flowchart: màu nằm trong style nội tuyến
  for (const el of svgEl.querySelectorAll('[style*="fill"], [style*="color"]')) {
    const isText = /^(text|tspan|span|div|p)$/i.test(el.tagName);
    for (const prop of isText ? ['fill', 'color'] : ['fill']) {
      const m = el.getAttribute('style').match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
      if (!m) continue;
      const v = darkVariant(m[1], isText ? 'text' : 'bg');
      if (v) el.style.setProperty(prop, v, 'important');
    }
  }
}

// ---------- Tô màu khung alt / opt / loop / par lồng nhau theo tầng ----------
// Mỗi khung là một <g> chứa viền (.loopLine), nhãn góc (.labelBox/.labelText) và tiêu đề
// điều kiện (.loopText/.sectionTitle). Độ lồng = số khung khác bao quanh nó.
const FRAME_COLORS = {
  light: ['#2B6CB0', '#B7791F', '#0F766E', '#B83280'],
  dark: ['#6AA5E0', '#E3B341', '#4FC3B5', '#E58BB0'],
};
function colorizeFrames(svgEl, theme) {
  if (svgEl.getAttribute('aria-roledescription') !== 'sequence') return;
  const groups = [...new Set([...svgEl.querySelectorAll('.loopLine')].map((l) => l.parentElement))];
  const boxes = groups.map((g) => {
    const xs = [];
    const ys = [];
    for (const l of g.querySelectorAll('.loopLine')) {
      xs.push(+l.getAttribute('x1'), +l.getAttribute('x2'));
      ys.push(+l.getAttribute('y1'), +l.getAttribute('y2'));
    }
    return { g, x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
  });
  const palette = FRAME_COLORS[theme] || FRAME_COLORS.light;
  const set = (el, prop, val) => el.style.setProperty(prop, val, 'important');
  for (const b of boxes) {
    const depth = boxes.filter((o) => o !== b && o.x1 <= b.x1 + 0.5 && o.x2 >= b.x2 - 0.5 && o.y1 <= b.y1 + 0.5 && o.y2 >= b.y2 - 0.5).length;
    const color = palette[depth % palette.length];
    for (const l of b.g.querySelectorAll('.loopLine')) {
      // Viền ngoài đậm, đường phân cách else mảnh hơn
      const edge = [b.y1, b.y2].includes(+l.getAttribute('y1')) && l.getAttribute('y1') === l.getAttribute('y2')
        || [b.x1, b.x2].includes(+l.getAttribute('x1')) && l.getAttribute('x1') === l.getAttribute('x2');
      set(l, 'stroke', color);
      set(l, 'stroke-width', edge ? '1.6px' : '1px');
      set(l, 'stroke-dasharray', edge ? '5 3' : '2 3');
    }
    for (const box of b.g.querySelectorAll('.labelBox')) {
      set(box, 'stroke', color);
      set(box, 'fill', color);
      set(box, 'fill-opacity', theme === 'dark' ? '0.28' : '0.14');
    }
    for (const t of b.g.querySelectorAll('.labelText, .labelText tspan, .loopText, .loopText tspan, .sectionTitle, .sectionTitle tspan')) {
      set(t, 'fill', color);
      set(t, 'font-weight', '600');
    }
  }
}

function paintDiagram(fig, d, svg) {
  const frame = $('.diagram__frame', fig);
  $('figcaption', fig).innerHTML = captionHtml(Number(fig.dataset.diagram) + 1, d);
  frame.innerHTML = svg;
  prepareSvg($('svg', frame), fig, d);
  if (effectiveTheme() === 'dark') adaptDarkSvg($('svg', frame), diagramSrc(d));
  colorizeFrames($('svg', frame), effectiveTheme());
  frame.append(diagramTools(fig, d));
}

// ---------- Giãn sequence diagram cho vừa khung ----------
// Sequence hẹp hơn khung thì vẽ lại với khoảng cách cột lớn hơn để trải hết bề ngang, cỡ chữ giữ nguyên.
// Chỉ áp dụng cho bản xem trên web; PDF / ảnh dùng bản gốc (vừa khổ A4).
const SEQ_DEFAULT_MARGIN = MERMAID_BASE.sequence.actorMargin;
const INIT_RE = /%%\{\s*init\s*:\s*(\{.*\})\s*\}%%/;
function widenSequenceSrc(src, extra) {
  const m = src.match(INIT_RE);
  if (m) {
    let cfg;
    try { cfg = JSON.parse(m[1]); } catch { return null; } // directive viết tay không phải JSON chuẩn: bỏ qua
    cfg.sequence = { ...cfg.sequence };
    cfg.sequence.actorMargin = Math.round((cfg.sequence.actorMargin ?? SEQ_DEFAULT_MARGIN) + extra);
    return src.replace(INIT_RE, `%%{init: ${JSON.stringify(cfg)}}%%`);
  }
  if (src.includes('%%{')) return null;
  const init = JSON.stringify({ sequence: { actorMargin: Math.round(SEQ_DEFAULT_MARGIN + extra) } });
  return src.replace(/^(\s*sequenceDiagram)/m, `%%{init: ${init}}%%\n$1`);
}

// Vẽ lại sequence với khoảng cách cột lớn hơn để bề rộng gốc đạt `target` (px); null nếu không giãn được
async function widenedSequenceSvg(d, theme, natural, target, actors) {
  if (!natural || actors < 2 || natural >= target * 0.92) return null;
  let extra = (target - natural) / (actors - 1);
  let wide = null;
  // Nhãn dài có thể làm một số khoảng cột tự nới thêm -> thử lại 1 lần nếu vượt khung
  for (let attempt = 0; attempt < 2; attempt++) {
    const src = widenSequenceSrc(diagramSrc(d), extra);
    if (!src) return null;
    const svgText = await renderMermaid(src, theme);
    const w = Number(svgText.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+)/)?.[1]);
    wide = svgText;
    if (!w || w <= target * 1.02) break;
    extra = Math.max(0, extra - (w - target) / (actors - 1));
  }
  return wide;
}

async function fitSequenceWidth(fig, d, theme) {
  const frame = $('.diagram__frame', fig);
  const svg = $('svg', frame);
  if (!svg || svg.getAttribute('aria-roledescription') !== 'sequence') return;
  const cs = getComputedStyle(frame);
  const avail = frame.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
  try {
    const wide = await widenedSequenceSvg(d, theme, svg.viewBox.baseVal?.width, avail, svg.querySelectorAll('.actor-top').length);
    if (!wide || !fig.isConnected || $('svg', frame) !== svg) return; // đã được vẽ lại trong lúc chờ
    paintDiagram(fig, d, wide);
  } catch { /* giữ bản gốc */ }
}

// ---------- Sơ đồ trong PDF ----------
// Vùng in (px, 96dpi) cho khung sơ đồ theo khổ giấy / hướng; khớp lề và CSS in trong lib/pdf.js, document.css
const PAGE_MM = { A4: [210, 297], Letter: [215.9, 279.4] };
function pdfDiagramBox(options) {
  let [w, h] = PAGE_MM[options.format] || PAGE_MM.A4;
  if (options.landscape) [w, h] = [h, w];
  const px = (mm) => (mm * 96) / 25.4;
  return {
    width: Math.floor(px(w - 32) - 28), // lề trái/phải 16mm, đệm + viền khung sơ đồ
    height: Math.floor(px(h - 36 - 40)), // lề trên/dưới 18mm, chừa chỗ chú thích + khoảng cách
  };
}
async function pdfSvgElement(fig, box) {
  const index = Number(fig.dataset.diagram);
  const d = state.diagrams[index];
  const parse = (text) => { const div = document.createElement('div'); div.innerHTML = text; return $('svg', div); };
  let el = parse(await lightSvg(index));
  // Sequence: giãn cột như trên web. Hình cao sẽ bị thu theo chiều cao trang, nên giãn rộng hơn
  // tương ứng để sau khi thu vẫn trải kín bề ngang (không còn dải trống hai bên)
  if (el.getAttribute('aria-roledescription') === 'sequence') {
    const vb = el.viewBox.baseVal;
    const shrink = Math.min(1, box.height / vb.height);
    try {
      const wide = await widenedSequenceSvg(d, 'light', vb.width, box.width / shrink, el.querySelectorAll('.actor-top').length);
      if (wide) el = parse(wide);
    } catch { /* giữ bản gốc */ }
  }
  prepareSvg(el, fig, d);
  colorizeFrames(el, 'light');
  // Kích thước đúng bằng phần hình: vừa vùng in, không phóng to quá kích thước gốc (giống trên web)
  const vb = el.viewBox.baseVal;
  const scale = Math.min(1, box.width / vb.width, box.height / vb.height);
  el.setAttribute('width', Math.round(vb.width * scale));
  el.setAttribute('height', Math.round(vb.height * scale));
  el.style.maxWidth = 'none';
  return el;
}

// Đổi kích thước cửa sổ: tính lại độ giãn của sơ đồ
let resizeTimer;
let lastFrameWidth = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const frame = $('.diagram__frame', el.docBody);
    if (!frame || el.doc.hidden) return;
    if (Math.abs(frame.clientWidth - lastFrameWidth) < 40) return;
    lastFrameWidth = frame.clientWidth;
    repaintDiagrams();
  }, 300);
});

// Bản sáng của sơ đồ dùng cho PDF / in / tải SVG, PNG — tài liệu xuất ra luôn nền sáng
const lightSvgCache = new Map();
const cacheKey = (index) => `${index}:${state.diagrams[index].view}`;
async function lightSvg(index) {
  const d = state.diagrams[index];
  if (!lightSvgCache.has(cacheKey(index))) {
    const svg = await renderDiagramSvg(d, 'light');
    lightSvgCache.set(cacheKey(index), svg);
  }
  return lightSvgCache.get(cacheKey(index));
}
async function lightSvgElement(fig) {
  const index = Number(fig.dataset.diagram);
  const box = document.createElement('div');
  box.innerHTML = await lightSvg(index);
  const svgEl = prepareSvg($('svg', box), fig, state.diagrams[index]);
  colorizeFrames(svgEl, 'light'); // PDF / ảnh: dùng bảng màu sáng
  return svgEl;
}

// Đổi theme: vẽ lại sơ đồ tại chỗ (không dựng lại cả tài liệu để giữ vị trí cuộn)
async function repaintDiagrams(figs = $$('.diagram:not(.diagram--error)', el.docBody)) {
  if (!state.diagrams?.length) return;
  const seq = state.renderSeq;
  const theme = effectiveTheme();
  for (const fig of figs) {
    if (seq !== state.renderSeq) return;
    const index = Number(fig.dataset.diagram);
    try {
      const svg = theme === 'light' ? await lightSvg(index) : await renderDiagramSvg(state.diagrams[index], theme);
      if (seq !== state.renderSeq) return;
      paintDiagram(fig, state.diagrams[index], svg);
      await fitSequenceWidth(fig, state.diagrams[index], theme);
    } catch { /* sơ đồ đã vẽ được ở lượt đầu, bỏ qua */ }
  }
}

// Đổi giữa dạng sequence và dạng gốc (một hình hoặc toàn bộ)
async function setDiagramView(figs, view) {
  for (const fig of figs) {
    const d = state.diagrams[Number(fig.dataset.diagram)];
    if (d?.seqSrc) d.view = view;
  }
  buildToc(state.headings, state.diagrams);
  await repaintDiagrams(figs);
}

function cleanMermaidError(err) {
  return String(err?.message || err).split('\n').slice(0, 4).join('\n');
}

function diagramTools(fig, d) {
  const box = document.createElement('div');
  box.className = 'diagram__tools';
  const no = Number(fig.dataset.diagram) + 1;
  const name = `${baseName(state.fileName) || 'so-do'}-hinh-${no}`;
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--ghost';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  };
  if (d.seqSrc) {
    const toSeq = d.view !== 'sequence';
    const b = mk(toSeq ? 'Dạng sequence' : 'Dạng gốc', () => setDiagramView([fig], toSeq ? 'sequence' : 'original'));
    b.title = toSeq ? 'Hiển thị flowchart này dưới dạng sequence diagram' : 'Xem lại flowchart gốc';
    box.append(b);
  }
  box.append(
    mk('Phóng to', () => openViewer(fig, `Hình ${no} — ${diagramLabel(d)}`)),
    mk('SVG', async () => downloadBlob(new Blob([await svgString(fig)], { type: 'image/svg+xml' }), `${name}.svg`)),
    mk('PNG', () => exportPng(fig, `${name}.png`)),
  );
  return box;
}

async function svgString(fig) {
  const svg = await lightSvgElement(fig);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svg.viewBox.baseVal;
  if (vb && vb.width) {
    svg.setAttribute('width', vb.width);
    svg.setAttribute('height', vb.height);
  }
  svg.style.removeProperty('max-width');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
}

async function exportPng(fig, name) {
  const src = await svgString(fig);
  const vb = $('.diagram__frame svg', fig).viewBox.baseVal;
  const scale = 2.5;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  try {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vb.width * scale);
    canvas.height = Math.ceil(vb.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => (blob ? downloadBlob(blob, name) : toast('Trình duyệt không cho xuất PNG, hãy dùng SVG.', true)), 'image/png');
  } catch {
    toast('Không xuất được PNG, hãy dùng SVG.', true);
  }
}

// ---------- Mục lục ----------
let tocObserver = null;
function buildToc(headings, diagrams) {
  const shown = headings.filter((h) => h.depth <= 3);
  el.tocCount.textContent = shown.length ? String(shown.length) : '';
  if (!shown.length && !diagrams.length) {
    el.toc.innerHTML = '<p class="muted">Tài liệu không có tiêu đề.</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  let i = 0;
  const link = (href, text, cls) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.title = text;
    a.className = cls;
    a.style.setProperty('--i', Math.min(i++, 30));
    frag.append(a);
  };
  shown.forEach((h) => link(`#${h.id}`, h.text, `lvl-${h.depth}`));
  if (diagrams.length) {
    const t = document.createElement('p');
    t.className = 'panel__title toc__sub';
    t.textContent = 'Danh mục hình';
    frag.append(t);
    diagrams.forEach((d, n) => link(`#hinh-${n + 1}`, `Hình ${n + 1} · ${diagramLabel(d)}`, 'is-fig'));
  }
  el.toc.replaceChildren(frag);

  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      $$('a.is-current', el.toc).forEach((a) => a.classList.remove('is-current'));
      const a = el.toc.querySelector(`a[href="#${CSS.escape(e.target.id)}"]`);
      if (!a) continue;
      a.classList.add('is-current');
      keepTocItemVisible(a);
    }
  }, { rootMargin: '-80px 0px -70% 0px' });
  $$('h1[id], h2[id], h3[id]', el.docBody).forEach((h) => tocObserver.observe(h));
}

// Cuộn tới cuối trang: tiêu đề cuối không lên được đỉnh màn hình -> đánh dấu mục cuối
window.addEventListener('scroll', () => {
  if (el.doc.hidden || innerHeight + scrollY < document.documentElement.scrollHeight - 4) return;
  const links = $$('a[href^="#"]:not(.is-fig)', el.toc);
  const last = links[links.length - 1];
  if (!last || last.classList.contains('is-current')) return;
  $$('a.is-current', el.toc).forEach((a) => a.classList.remove('is-current'));
  last.classList.add('is-current');
  keepTocItemVisible(last);
}, { passive: true });

// Giữ mục đang đọc trong vùng nhìn thấy của mục lục (chỉ cuộn khung mục lục, không cuộn trang);
// tạm dừng khi người dùng đang rê chuột / cuộn trong mục lục để không giật
let tocHover = false;
el.toc.addEventListener('pointerenter', () => { tocHover = true; });
el.toc.addEventListener('pointerleave', () => { tocHover = false; });
function keepTocItemVisible(a) {
  if (tocHover) return;
  const box = el.toc.getBoundingClientRect();
  const r = a.getBoundingClientRect();
  const margin = box.height * 0.25;
  if (r.top < box.top + margin || r.bottom > box.bottom - margin) {
    el.toc.scrollTo({ top: el.toc.scrollTop + (r.top - box.top) - box.height / 3, behavior: 'smooth' });
  }
}

el.toc.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  activateTab('preview');
  document.getElementById(decodeURIComponent(a.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- Markdown gốc & TXT ----------
function renderRaw() {
  const lines = state.markdown.split(/\r?\n/);
  let inFence = false;
  const out = [];
  lines.forEach((line, n) => {
    const fence = /^\s*(```|~~~)/.test(line);
    let cls = '';
    if (fence || inFence) cls = ' is-fence';
    else if (/^#{1,6}\s/.test(line)) cls = ' hljs-section';
    if (fence) inFence = !inFence;
    out.push(`<span class="ln">${n + 1}</span><span class="lc${cls}">${escapeHtml(line) || ' '}</span>`);
  });
  el.rawView.innerHTML = `<div class="raw-lines">${out.join('')}</div>`;
}

function renderTxt() {
  el.txtPreview.textContent = toText(state.markdown, { lexer: marked.lexer });
}

el.optWrap.addEventListener('change', () => el.rawView.classList.toggle('is-wrap', el.optWrap.checked));
el.btnCopyRaw.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.markdown);
    toast('Đã sao chép nội dung Markdown.');
  } catch {
    toast('Trình duyệt không cho phép sao chép.', true);
  }
});
el.btnMd.addEventListener('click', () => {
  downloadBlob(new Blob([state.markdown], { type: 'text/markdown;charset=utf-8' }), `${baseName(state.fileName) || slugFile(state.title)}.md`);
});

// ---------- Nạp tài liệu ----------
function loadMarkdown(text, { name = '', source = 'file', size } = {}) {
  state.markdown = text.replace(/\r\n?/g, '\n');
  state.fileName = name;
  state.source = source;
  el.editor.value = state.markdown;

  el.fileLabel.hidden = false;
  el.fileName.textContent = name || (source === 'paste' ? 'Nội dung dán' : 'Tài liệu');
  const bytes = size ?? new Blob([state.markdown]).size;
  el.fileMeta.textContent = `${formatBytes(bytes)} · ${state.markdown.split('\n').length} dòng`;
  for (const b of [el.btnPdf, el.btnTxt, el.btnPrint, el.btnPdfMenu, el.btnMd, el.btnCopyRaw]) b.disabled = false;
  setSourceExpanded(false);

  return render();
}

async function readFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return toast('File lớn hơn 10 MB.', true);
  if (!/\.(md|markdown|mdown|mkd|txt)$/i.test(file.name) && file.type && !file.type.startsWith('text/')) {
    return toast('Chỉ hỗ trợ file Markdown (.md) hoặc văn bản.', true);
  }
  showSkeleton();
  const text = await file.text();
  await loadMarkdown(text, { name: file.name, size: file.size, source: 'file' });
  activateTab('preview');
}

el.fileInput.addEventListener('change', () => {
  readFile(el.fileInput.files[0]);
  el.fileInput.value = '';
});

// Kéo thả file vào bất kỳ vị trí nào trên trang: lớp phủ toàn trang báo vùng thả,
// bắt sự kiện ở pha capture để ô soạn thảo / ô dán không chèn đường dẫn file vào nội dung
const MD_FILE_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
let dragDepth = 0;
function setDropActive(on) {
  el.dropOverlay.hidden = !on;
  el.dropzone.classList.toggle('is-over', on);
  document.body.classList.toggle('is-dragging', on);
}
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (++dragDepth === 1) setDropActive(true);
}, true);
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) { dragDepth = 0; setDropActive(false); }
}, true);
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return; // kéo chữ trong ô nhập: để trình duyệt xử lý bình thường
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}, true);
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) {
    // Kéo chữ từ nơi khác vào vùng tài liệu (không phải ô nhập) -> mở như nội dung dán
    if (e.target.closest?.('textarea, input, [contenteditable]')) return;
    const text = e.dataTransfer?.getData('text/plain');
    if (text?.trim()) { e.preventDefault(); loadPasted(text); }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  dragDepth = 0;
  setDropActive(false);
  const files = Array.from(e.dataTransfer.files);
  const file = files.find((f) => MD_FILE_RE.test(f.name)) || files[0];
  if (!file) return;
  if (el.viewer.open) el.viewer.close();
  if (files.length > 1) toast(`Đã thả ${files.length} file — mở ${file.name}.`);
  readFile(file);
}, true);
// Kéo ra khỏi cửa sổ trình duyệt mà không thả
window.addEventListener('dragend', () => { dragDepth = 0; setDropActive(false); });

function loadPasted(text) {
  if (!text.trim()) return toast('Nội dung trống.', true);
  loadMarkdown(text, { source: 'paste' }).then(() => activateTab('preview'));
}

// Khối "Nguồn tài liệu": đầy đủ khi chưa có tài liệu, thu gọn còn hàng nút nhanh khi đã mở
// để nhường chiều cao cho mục lục
const sourceEls = { body: $('#sourceBody'), quick: $('#sourceQuick'), toggle: $('#btnSourceToggle') };
function setSourceExpanded(expanded) {
  const hasDoc = !!state.markdown;
  sourceEls.body.hidden = hasDoc && !expanded;
  sourceEls.quick.hidden = !hasDoc || expanded;
  sourceEls.toggle.hidden = !hasDoc;
  sourceEls.toggle.textContent = expanded ? 'Thu gọn' : 'Mở rộng';
  sourceEls.toggle.setAttribute('aria-expanded', String(expanded));
}
sourceEls.toggle.addEventListener('click', () => setSourceExpanded(sourceEls.body.hidden));
$('#btnQuickOpen').addEventListener('click', () => el.fileInput.click());
$('#btnQuickPaste').addEventListener('click', () => { setSourceExpanded(true); setSource('paste'); });

// Dán văn bản
function setSource(kind) {
  $$('.segmented__item[data-source]').forEach((b) => {
    const on = b.dataset.source === kind;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  $$('[data-source-pane]').forEach((p) => { p.hidden = p.dataset.sourcePane !== kind; });
  if (kind === 'paste') el.pasteBox.focus();
}
$$('.segmented__item[data-source]').forEach((b) => b.addEventListener('click', () => setSource(b.dataset.source)));
$('#btnPasteOpen').addEventListener('click', () => loadPasted(el.pasteBox.value));
$('#btnClipboard').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    el.pasteBox.value = text;
    loadPasted(text);
  } catch {
    toast('Trình duyệt chặn đọc clipboard — hãy dán (Ctrl+V) vào ô bên trên.', true);
  }
});

// Ctrl+V ở bất kỳ đâu ngoài ô nhập liệu
document.addEventListener('paste', (e) => {
  if (e.target.closest('textarea, input, [contenteditable]')) return;
  const text = e.clipboardData?.getData('text/plain');
  if (text && text.trim()) {
    e.preventDefault();
    el.pasteBox.value = text;
    loadPasted(text);
  }
});

$('#btnEmptyOpen').addEventListener('click', () => el.fileInput.click());
$('#btnEmptyPaste').addEventListener('click', () => setSource('paste'));
for (const id of ['#btnSample', '#btnEmptySample']) {
  $(id).addEventListener('click', async () => {
    showSkeleton();
    const res = await fetch('/samples/srs-mau.md');
    await loadMarkdown(await res.text(), { name: 'srs-mau.md', source: 'sample' });
    activateTab('preview');
  });
}

// Soạn trực tiếp
let editTimer;
el.editor.addEventListener('input', () => {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    if (!el.editor.value.trim()) return;
    if (!state.markdown) {
      loadMarkdown(el.editor.value, { source: 'paste' });
      return;
    }
    state.markdown = el.editor.value;
    el.fileMeta.textContent = `${formatBytes(new Blob([state.markdown]).size)} · ${state.markdown.split('\n').length} dòng · đã sửa`;
    render();
  }, 450);
});

// ---------- Xuất file ----------
el.btnTxt.addEventListener('click', () => {
  const txt = toText(state.markdown, { lexer: marked.lexer }).replace(/\n/g, '\r\n');
  // BOM giúp Notepad cũ trên Windows nhận đúng UTF-8 tiếng Việt
  downloadBlob(new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' }), `${baseName(state.fileName) || slugFile(state.title)}.txt`);
});

el.btnPdf.addEventListener('click', async () => {
  if (el.docBody.querySelector('.diagram .sk')) {
    return toast('Sơ đồ đang được vẽ, thử lại sau giây lát.');
  }
  const clone = el.docBody.cloneNode(true);
  $$('.diagram__tools', clone).forEach((n) => n.remove());
  // PDF luôn nền sáng; sơ đồ được vẽ lại vừa đúng vùng in của khổ giấy đã chọn
  const pdfOptions = { format: $('#optFormat').value, landscape: $('#optOrient').value === 'landscape' };
  const box = pdfDiagramBox(pdfOptions);
  for (const fig of $$('.diagram:not(.diagram--error)', clone)) {
    const frame = $('.diagram__frame', fig);
    frame.replaceChildren(await pdfSvgElement(fig, box));
  }

  const payload = JSON.stringify({
    html: clone.innerHTML,
    title: state.title,
    options: {
      format: $('#optFormat').value,
      landscape: $('#optOrient').value === 'landscape',
      cover: $('#optCover').checked,
      toc: $('#optToc').checked,
      pageNumbers: $('#optPageNo').checked,
    },
    meta: {
      fileName: state.fileName,
      exportedAt: new Date().toLocaleString('vi-VN', { dateStyle: 'long', timeStyle: 'short' }),
      headings: state.headings.filter((h) => h.depth <= 3),
    },
  });

  if (new Blob([payload]).size > PDF_BODY_LIMIT) {
    toast('Tài liệu quá lớn để tạo PDF trên máy chủ — chuyển sang in bằng trình duyệt (chọn "Lưu dưới dạng PDF").');
    return printFallback();
  }

  el.btnPdf.classList.add('is-busy');
  try {
    const res = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    downloadBlob(await res.blob(), `${baseName(state.fileName) || slugFile(state.title)}.pdf`);
    toast('Đã tạo PDF.');
  } catch (err) {
    console.error(err);
    toast(`Máy chủ không tạo được PDF (${err.message}). Chuyển sang in bằng trình duyệt.`, true);
    printFallback();
  } finally {
    el.btnPdf.classList.remove('is-busy');
  }
});

el.btnPrint.addEventListener('click', () => { closePrintMenu(); printFallback(); });
el.btnPdfMenu.addEventListener('click', () => { closePrintMenu(); el.btnPdf.click(); });

// ---------- Menu tuỳ chọn in (nút máy in) ----------
const PDF_OPTS_KEY = 'convertsrs-pdf-options';
const PDF_OPT_FIELDS = { optFormat: 'value', optOrient: 'value', optCover: 'checked', optToc: 'checked', optPageNo: 'checked' };
try {
  const saved = JSON.parse(localStorage.getItem(PDF_OPTS_KEY) || '{}');
  for (const [id, prop] of Object.entries(PDF_OPT_FIELDS)) if (id in saved) $('#' + id)[prop] = saved[id];
} catch { /* bỏ qua dữ liệu hỏng */ }
el.printMenu.addEventListener('change', () => {
  const data = {};
  for (const [id, prop] of Object.entries(PDF_OPT_FIELDS)) data[id] = $('#' + id)[prop];
  localStorage.setItem(PDF_OPTS_KEY, JSON.stringify(data));
});

function openPrintMenu() {
  el.printMenu.hidden = false;
  el.btnPrintMenu.setAttribute('aria-expanded', 'true');
  el.btnPrintMenu.classList.add('is-active');
  $('#optFormat').focus();
}
function closePrintMenu() {
  if (el.printMenu.hidden) return;
  el.printMenu.hidden = true;
  el.btnPrintMenu.setAttribute('aria-expanded', 'false');
  el.btnPrintMenu.classList.remove('is-active');
}
el.btnPrintMenu.addEventListener('click', () => (el.printMenu.hidden ? openPrintMenu() : closePrintMenu()));
document.addEventListener('pointerdown', (e) => {
  if (!el.printMenu.hidden && !e.target.closest('.print-wrap')) closePrintMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.printMenu.hidden) { closePrintMenu(); el.btnPrintMenu.focus(); }
});

const optFlowSeq = $('#optFlowSeq');
optFlowSeq.checked = flowToSeqEnabled();
optFlowSeq.addEventListener('change', () => {
  localStorage.setItem(FLOW2SEQ_KEY, optFlowSeq.checked ? '1' : '0');
  setDiagramView($$('.diagram:not(.diagram--error)', el.docBody), optFlowSeq.checked ? 'sequence' : 'original');
});
async function printFallback() {
  activateTab('preview');
  // Bản in luôn nền sáng: ép tạm theme sáng, in xong trả lại theme đang dùng
  if (effectiveTheme() === 'dark') {
    themeOverride = 'light';
    await applyTheme();
    window.addEventListener('afterprint', () => { themeOverride = null; applyTheme(); }, { once: true });
  }
  setTimeout(() => window.print(), 150);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Hộp xem sơ đồ ----------
const viewer = { scale: 1, svg: null, w: 0, h: 0 };
function openViewer(fig, title) {
  const svg = $('.diagram__frame svg', fig).cloneNode(true);
  const vb = svg.viewBox.baseVal;
  viewer.w = vb.width || svg.getBoundingClientRect().width;
  viewer.h = vb.height || svg.getBoundingClientRect().height;
  svg.style.maxWidth = 'none';
  viewer.svg = svg;
  el.viewerStage.replaceChildren(svg);
  el.viewerTitle.textContent = title;
  el.viewer.showModal();
  fitViewer();
}
function setZoom(s) {
  viewer.scale = Math.min(6, Math.max(0.2, s));
  viewer.svg.setAttribute('width', viewer.w * viewer.scale);
  viewer.svg.setAttribute('height', viewer.h * viewer.scale);
  el.viewerZoom.textContent = Math.round(viewer.scale * 100) + '%';
}
function fitViewer() {
  const r = el.viewerStage.getBoundingClientRect();
  setZoom(Math.min((r.width - 64) / viewer.w, (r.height - 64) / viewer.h, 3));
}
$$('[data-zoom]', el.viewer).forEach((b) => b.addEventListener('click', () => {
  const z = Number(b.dataset.zoom);
  if (z === 0) fitViewer();
  else setZoom(viewer.scale * (z > 0 ? 1.25 : 0.8));
}));
$('#viewerClose').addEventListener('click', () => el.viewer.close());
el.viewer.addEventListener('click', (e) => { if (e.target === el.viewer) el.viewer.close(); });
el.viewerStage.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(viewer.scale * (e.deltaY < 0 ? 1.1 : 0.9));
}, { passive: false });
// Kéo để di chuyển
let pan = null;
el.viewerStage.addEventListener('pointerdown', (e) => {
  pan = { x: e.clientX, y: e.clientY, l: el.viewerStage.scrollLeft, t: el.viewerStage.scrollTop };
  el.viewerStage.classList.add('is-panning');
  el.viewerStage.setPointerCapture(e.pointerId);
});
el.viewerStage.addEventListener('pointermove', (e) => {
  if (!pan) return;
  el.viewerStage.scrollLeft = pan.l - (e.clientX - pan.x);
  el.viewerStage.scrollTop = pan.t - (e.clientY - pan.y);
});
el.viewerStage.addEventListener('pointerup', () => { pan = null; el.viewerStage.classList.remove('is-panning'); });

// ---------- Tabs & trạng thái ----------
function activateTab(name) {
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $$('.pane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
}
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  activateTab(t.dataset.tab);
  if (t.dataset.tab === 'source') el.editor.focus();
}));

function showSkeleton() {
  el.empty.hidden = true;
  el.doc.hidden = true;
  el.skeleton.hidden = false;
}
function showDoc() {
  el.empty.hidden = true;
  el.skeleton.hidden = true;
  el.doc.hidden = false;
}
function setStatus(text, isError = false) {
  el.status.textContent = text;
  el.status.classList.toggle('is-error', isError);
}

let toastTimer;
function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.classList.toggle('is-error', isError);
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 6000 : 3200);
}

function baseName(name) {
  return (name || '').replace(/\.[^.]+$/, '');
}
function slugFile(text) {
  return (text || 'tai-lieu').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'tai-lieu';
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

applyTheme();

// ---------- Tab Text -> JSON ----------
const t2j = {
  input: $('#t2jInput'), output: $('#t2jOutput'), status: $('#t2jStatus'),
  format: $('#t2jFormat'), indent: $('#t2jIndent'), typed: $('#t2jTyped'), fromDoc: $('#t2jFromDoc'),
  copy: $('#t2jCopy'), download: $('#t2jDownload'), json: '',
};
for (const [value, label] of Object.entries(T2J_FORMATS)) t2j.format.add(new Option(label, value));
const T2J_SAMPLE = `// Request
{ "email": "partner_email", "password": 'partner_password', clientId: "your_client_id",
  "expAccess": 3600, "expRefresh": 84600, }
// Response
{ "accessToken": "eyJhbGciOiJIUzI1NiIs...", "refreshToken": "refresh_token_string", "userId": "user_id_string" }`;

function runT2j() {
  const text = t2j.input.value;
  t2j.json = '';
  t2j.output.classList.remove('is-error');
  t2j.status.classList.remove('is-error');
  $('#jtBar').hidden = true;
  if (!text.trim()) {
    t2j.output.innerHTML = '<span class="muted">Kết quả hiện ở đây.</span>';
    t2j.status.textContent = '';
  } else {
    try {
      const { value, format } = convertToJson(text, { format: t2j.format.value, typed: t2j.typed.checked });
      const ind = t2j.indent.value === 'tab' ? '\t' : Number(t2j.indent.value);
      t2j.json = JSON.stringify(value, null, ind);
      t2j.value = value;
      if (ind === 0 || !value || typeof value !== 'object') {
        // Thu gọn 1 dòng / giá trị đơn: hiện dạng văn bản
        t2j.output.innerHTML = hljs.highlight(t2j.json, { language: 'json' }).value;
        $('#jtBar').hidden = true;
      } else {
        renderJsonTree(value, ind === '\t' ? 4 : ind);
      }
      const count = Array.isArray(value) ? `${value.length} phần tử` : value && typeof value === 'object' ? `${Object.keys(value).length} trường` : '';
      t2j.status.textContent = `${t2j.format.value === 'auto' ? 'nhận diện: ' : ''}${T2J_FORMATS[format]}${count ? ' · ' + count : ''}`;
    } catch (err) {
      t2j.output.classList.add('is-error');
      t2j.output.textContent = err.message;
      t2j.status.textContent = 'lỗi';
      t2j.status.classList.add('is-error');
    }
  }
  t2j.copy.disabled = t2j.download.disabled = !t2j.json;
}
// ---------- Cây JSON thu gọn được ----------
// Mỗi object / mảng là một .jt-node: dòng mở (nút ▾, key, dấu mở, tóm tắt khi thu gọn), các con, dòng đóng.
// Dựng bằng DOM (textContent), không chèn chuỗi người dùng dạng HTML.
const JT_MAX_NODES = 20000;
function renderJsonTree(value, indent) {
  let count = 0;
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const scalar = (v) => {
    if (v === null) return h('span', 'hljs-literal', 'null');
    if (typeof v === 'boolean') return h('span', 'hljs-literal', String(v));
    if (typeof v === 'number') return h('span', 'hljs-number', String(v));
    return h('span', 'hljs-string', JSON.stringify(v));
  };
  const pathText = (path) => '$' + path.map((p) => (typeof p === 'number' ? `[${p}]` : /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`)).join('');
  const build = (v, key, path, depth, last) => {
    if (++count > JT_MAX_NODES) throw new Error('too-big');
    const pad = `${depth * indent}ch`;
    const comma = last ? '' : ',';
    const keyEls = () => (key === undefined ? [] : [h('span', 'hljs-attr', typeof key === 'number' ? '' : JSON.stringify(key)), h('span', null, typeof key === 'number' ? '' : ': ')]);
    if (!v || typeof v !== 'object') {
      const line = h('div', 'jt-line');
      line.style.paddingLeft = pad;
      line.append(...keyEls(), scalar(v), document.createTextNode(comma));
      return line;
    }
    const isArr = Array.isArray(v);
    const entries = isArr ? v.map((x, k) => [k, x]) : Object.entries(v);
    const node = h('div', 'jt-node');
    node.dataset.depth = depth;
    node._path = path;
    node._value = v;
    const line = h('div', 'jt-line');
    line.style.paddingLeft = pad;
    const tog = h('button', 'jt-tog', '▾');
    tog.type = 'button';
    tog.title = 'Thu gọn / mở rộng';
    tog.setAttribute('aria-label', 'Thu gọn / mở rộng');
    const open = h('span', 'jt-brace', isArr ? '[' : '{');
    const summary = h('span', 'jt-summary', ` … ${isArr ? ']' : '}'}`);
    const openComma = h('span', 'jt-open-comma', comma);
    const countEl = h('span', 'jt-count', isArr ? `${entries.length} phần tử` : `${entries.length} trường`);
    const actions = h('span', 'jt-actions');
    const focusBtn = h('button', null, 'Tập trung');
    focusBtn.type = 'button';
    focusBtn.dataset.act = 'focus';
    const copyBtn = h('button', null, 'Sao chép');
    copyBtn.type = 'button';
    copyBtn.dataset.act = 'copy';
    actions.append(focusBtn, copyBtn);
    line.append(tog, ...keyEls(), open, summary, openComma, countEl, actions);
    const children = h('div', 'jt-children');
    entries.forEach(([k, x], idx) => children.append(build(x, isArr ? idx : k, [...path, k], depth + 1, idx === entries.length - 1)));
    const close = h('div', 'jt-line jt-close', `${isArr ? ']' : '}'}${comma}`);
    close.style.paddingLeft = pad;
    if (!entries.length) {
      // Object / mảng rỗng: một dòng, không cần thu gọn
      tog.style.visibility = 'hidden';
      summary.remove();
      openComma.remove();
      countEl.remove();
      open.textContent = isArr ? `[]${comma}` : `{}${comma}`;
      node.append(line);
      return node;
    }
    node.append(line, children, close);
    return node;
  };
  let tree;
  try {
    tree = h('div', 'jt');
    tree.style.paddingLeft = '1.3em';
    tree.append(build(value, undefined, [], 0, true));
  } catch {
    // JSON quá lớn: hiện dạng văn bản để không làm chậm trình duyệt
    t2j.output.innerHTML = hljs.highlight(t2j.json, { language: 'json' }).value;
    $('#jtBar').hidden = true;
    return;
  }
  tree._pathText = pathText;
  t2j.output.replaceChildren(tree);
  $('#jtBar').hidden = false;
  $('#jtLevel').value = '';
  setFocus(null);
}
const jtNodes = () => $$('.jt-node', t2j.output);
function setCollapsed(node, collapsed) {
  node.classList.toggle('is-collapsed', collapsed);
}
function setFocus(node) {
  $$('.jt-node.is-focus', t2j.output).forEach((n) => n.classList.remove('is-focus'));
  $('#jtFocus').hidden = !node;
  if (!node) return;
  // Thu gọn tất cả, chỉ mở đường dẫn tới phần tử và chính phần tử đó (các con trực tiếp hiện ra)
  for (const n of jtNodes()) setCollapsed(n, true);
  for (let p = node; p && p.classList?.contains('jt-node'); p = p.parentElement.closest('.jt-node')) setCollapsed(p, false);
  node.classList.add('is-focus');
  const tree = $('.jt', t2j.output);
  const path = node._path;
  $('#jtFocusPath').textContent = path.length ? tree._pathText(path).replace(/^\$\.?/, '$ › ').replace(/\.|(?=\[)/g, ' › ') : '$ (gốc)';
  node.scrollIntoView({ block: 'nearest' });
}
t2j.output.addEventListener('click', async (e) => {
  const node = e.target.closest('.jt-node');
  if (!node) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'focus') return setFocus(node);
  if (act === 'copy') {
    const ind = t2j.indent.value === 'tab' ? '\t' : Number(t2j.indent.value);
    try {
      await navigator.clipboard.writeText(JSON.stringify(node._value, null, ind));
      toast('Đã sao chép phần tử.');
    } catch {
      toast('Trình duyệt không cho phép sao chép.', true);
    }
    return;
  }
  if (e.target.closest('.jt-tog, .jt-summary, .jt-brace, .jt-count')) {
    setCollapsed(node, !node.classList.contains('is-collapsed'));
  }
});
$('#jtExpand').addEventListener('click', () => { jtNodes().forEach((n) => setCollapsed(n, false)); setFocus(null); $('#jtLevel').value = ''; });
$('#jtCollapse').addEventListener('click', () => {
  // Giữ gốc mở để còn thấy các phần tử cấp 1
  jtNodes().forEach((n) => setCollapsed(n, Number(n.dataset.depth) > 0));
  setFocus(null);
  $('#jtLevel').value = '';
});
$('#jtLevel').addEventListener('change', () => {
  const level = Number($('#jtLevel').value);
  if (!level) return;
  jtNodes().forEach((n) => setCollapsed(n, Number(n.dataset.depth) >= level));
  setFocus(null);
});
$('#jtUnfocus').addEventListener('click', () => { jtNodes().forEach((n) => setCollapsed(n, false)); setFocus(null); });

let t2jTimer;
t2j.input.addEventListener('input', () => { clearTimeout(t2jTimer); t2jTimer = setTimeout(runT2j, 250); });
for (const c of [t2j.format, t2j.indent, t2j.typed]) c.addEventListener('change', runT2j);
// Tab trong ô nhập: chèn tab thay vì chuyển focus (dán dữ liệu TSV / thụt lề)
t2j.input.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.shiftKey) return;
  e.preventDefault();
  t2j.input.setRangeText('  ', t2j.input.selectionStart, t2j.input.selectionEnd, 'end');
  t2j.input.dispatchEvent(new Event('input'));
});
$('#t2jSample').addEventListener('click', () => { t2j.input.value = T2J_SAMPLE; runT2j(); });
$('#t2jClear').addEventListener('click', () => { t2j.input.value = ''; runT2j(); t2j.input.focus(); });
$('#t2jPaste').addEventListener('click', async () => {
  try {
    t2j.input.value = await navigator.clipboard.readText();
    runT2j();
  } catch {
    toast('Trình duyệt chặn đọc clipboard — hãy dán (Ctrl+V) vào ô bên trái.', true);
    t2j.input.focus();
  }
});
t2j.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(t2j.json);
    toast('Đã sao chép JSON.');
  } catch {
    toast('Trình duyệt không cho phép sao chép.', true);
  }
});
t2j.download.addEventListener('click', () => {
  const name = `${baseName(state.fileName) || 'du-lieu'}.json`;
  downloadBlob(new Blob([t2j.json + '\n'], { type: 'application/json;charset=utf-8' }), name);
});

// "Lấy từ tài liệu": khối mã và bảng trong tài liệu đang mở
let t2jBlocks = [];
function refreshT2jSources() {
  t2jBlocks = [];
  if (state.markdown) {
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.type === 'code' && !/^mermaid/i.test(t.lang || '')) t2jBlocks.push({ kind: 'code', lang: (t.lang || '').trim(), text: t.text });
        else if (t.type === 'table') t2jBlocks.push({ kind: 'table', text: t.raw, head: t.header.map((h) => h.text).join(' | ') });
        if (t.tokens && t.type !== 'table') walk(t.tokens);
        if (t.items) t.items.forEach((it) => walk(it.tokens || []));
      }
    };
    walk(marked.lexer(splitFrontmatter(state.markdown).body));
  }
  t2j.fromDoc.replaceChildren(new Option(t2jBlocks.length ? '— Chọn khối mã / bảng —' : '— Tài liệu chưa có khối mã / bảng —', ''));
  let nc = 0;
  let nt = 0;
  t2jBlocks.forEach((b, k) => {
    // Dòng đầu tiên có chữ (bỏ qua dòng chỉ có dấu ngoặc / comment) để nhận ra khối mã
    const first = b.kind === 'code'
      ? (b.text.split('\n').find((l) => /[\p{L}\p{N}]/u.test(l) && !/^\s*\/\//.test(l)) || b.text.split('\n')[0]).trim()
      : b.head;
    const label = b.kind === 'code' ? `Khối mã ${++nc}${b.lang ? ` (${b.lang})` : ''} — ${first.trim()}` : `Bảng ${++nt} — ${first}`;
    t2j.fromDoc.add(new Option(label.length > 80 ? label.slice(0, 79) + '…' : label, String(k)));
  });
}
t2j.fromDoc.addEventListener('change', () => {
  const b = t2jBlocks[Number(t2j.fromDoc.value)];
  if (!b) return;
  t2j.input.value = b.text;
  t2j.format.value = 'auto';
  runT2j();
  t2j.fromDoc.value = '';
});

// ---------- Bản desktop (Electron) ----------
// Mở file từ hệ điều hành (nhấp đúp .md, "Mở bằng", menu Tệp > Mở) và các lệnh từ menu ứng dụng
if (window.desktop) {
  document.documentElement.classList.add('is-desktop');
  window.desktop.onOpenFile(async ({ name, size, content }) => {
    showSkeleton();
    await loadMarkdown(content, { name, size, source: 'file' });
    activateTab('preview');
  });
  window.desktop.onMenu((action) => {
    if (action.startsWith('tab:')) return activateTab(action.slice(4));
    if (action === 'sample') return $('#btnSample').click();
    if (action === 'print-options') return openPrintMenu();
    if (!state.markdown) return toast('Hãy mở một tài liệu trước.');
    if (action === 'pdf') el.btnPdf.click();
    else if (action === 'txt') el.btnTxt.click();
    else if (action === 'print') printFallback();
  });
  // Nút "Chọn file" dùng hộp thoại của hệ điều hành để nhớ được đường dẫn file
  for (const b of [$('#btnEmptyOpen'), $('#btnQuickOpen')]) {
    b.addEventListener('click', (e) => { e.stopImmediatePropagation(); window.desktop.openDialog(); }, true);
  }
  window.desktop.ready();
}
