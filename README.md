# convertSRS

Trang web đọc tài liệu SRS viết bằng Markdown, cho phép **đọc trực tiếp không chuyển đổi**, hoặc **tải xuống PDF / TXT** khi cần. Sơ đồ Mermaid được vẽ dạng vector, đánh số "Hình n", có chú thích, giữ nguyên độ nét khi in.

Giao diện thiết kế theo skill `taste-design` của [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) — xem [`.stitch/DESIGN.md`](.stitch/DESIGN.md).

## Tính năng

Thanh menu trên cùng có 3 ứng dụng: **convertSRS** (mặc định — đọc tài liệu, sidebar mục lục, các tab Đọc / Markdown gốc / Soạn / Bản TXT), **Text → JSON** và **Mã hoá / Base64** (toàn màn hình). Mở thẳng bằng đường dẫn `#json`, `#crypto`.

| Nhóm | Chi tiết |
|------|----------|
| Nhập tài liệu | Import file `.md` (chọn file, hoặc kéo thả vào **bất kỳ đâu trên trang**), dán văn bản vào ô dán, nút "Lấy từ clipboard", hoặc Ctrl+V ở bất kỳ đâu trên trang |
| Đọc không chuyển đổi | Tab **Đọc** (Markdown đã định dạng), tab **Markdown gốc** (nguyên văn, có số dòng, sao chép, tải `.md`), tab **Soạn / Dán** (sửa trực tiếp, xem trước cập nhật ngay) |
| Sơ đồ | Mermaid: flowchart, sequence, class, ER, state, gantt, journey, pie, mindmap, timeline… Mỗi sơ đồ có: phóng to (zoom / kéo), tải SVG, tải PNG. Sơ đồ sai cú pháp báo lỗi ngay tại chỗ |
| PDF | Render bằng Chromium phía server → chữ chọn được, sơ đồ vector. Tuỳ chọn A4/Letter, dọc/ngang, trang bìa, trang mục lục, đầu trang + "Trang X / Y", bookmark PDF |
| TXT | UTF-8 có BOM, xuống dòng CRLF (mở tốt trên Notepad). Bảng kẻ khung ASCII, sơ đồ ghi "[Hình n: loại — chú thích]" kèm mã nguồn |
| Mục lục | Tự sinh từ tiêu đề + danh mục hình, đánh dấu mục đang đọc |
| Flowchart → sequence | Sơ đồ `flowchart` / `graph` trong file tự hiển thị dạng **sequence diagram**. Nếu tác giả đã đánh số bước ("1.", "3a.", "10b."), sơ đồ đi **đúng theo thứ tự số** và giữ nguyên số đó; cột xếp theo thứ tự xuất hiện trong luồng; mỗi bước là mũi tên từ bên thực hiện tới bên nhận bước kế tiếp, bước "Trả… / Phản hồi… / Từ chối…" là mũi tên nét đứt quay về bên đã gọi; dòng in nghiêng ngay dưới sơ đồ ("*Sơ đồ 1 — …*") được dùng làm chú thích hình. Luồng nghiệp vụ: cột = người/bộ phận thực hiện (lấy từ `subgraph` hoặc chủ ngữ đầu nhãn như "Người dùng…", "Hệ thống…"; bước không có chủ ngữ thuộc "Hệ thống"), mỗi bước là một mũi tên đánh số theo thứ tự luồng, hình thoi thành bước "Kiểm tra: …" có đánh số; nhánh đi tiếp (Có/Yes với câu khẳng định như "Hợp lệ?", Không/No với câu mang nghĩa lỗi như "Sai quá 3 lần?") nằm ở luồng chính, nhánh còn lại vẽ thành đường riêng trong khối `opt` (kết thúc bằng "Kết thúc luồng" nếu dừng ở đó); nhánh No nhảy thẳng tới một bước phía sau thành khối nhỏ `opt [No]` "Chuyển tới: …"; một bước dẫn tới nhiều việc (không phải hình thoi) được viết lần lượt ở luồng chính, không dựng khung lồng; vòng lặp ghi "Quay lại bước n". Sơ đồ kiến trúc (node là thành phần): mỗi node một cột, `subgraph` thành nhóm. Bật/tắt chung ở sidebar ("Hiển thị sơ đồ"), hoặc từng hình bằng nút **Dạng gốc / Dạng sequence**. Thêm dòng `%% giữ nguyên` vào sơ đồ để luôn giữ flowchart. Áp dụng cho cả PDF và ảnh SVG/PNG; bản TXT vẫn giữ mã nguồn gốc |
| Text → JSON | Tab chuyển đoạn text sang JSON chuẩn, tự nhận diện: JSON/JS "lỏng" (comment, nháy đơn, key không nháy, dấu phẩy thừa; nhiều khối `// Request` / `// Response` gom thành object), `key: value` / `key = value` (thụt lề lồng nhau, `a.b.c`), bảng Markdown / CSV / TSV (dán từ Excel) → mảng object, **bảng mô tả field** (`Field \| Type \| M/O`) → JSON mẫu theo kiểu, query string. Lấy nhanh khối mã / bảng trong tài liệu đang mở; thụt lề 2/4/tab/thu gọn; báo lỗi kèm dòng/cột; sao chép, tải `.json`. Kết quả hiển thị dạng **cây thu gọn được**: nút ▾/▸ trên từng object/mảng, "Tập trung" vào một phần tử (thu gọn phần còn lại, hiện đường dẫn `$ › …`), sao chép riêng từng phần tử, Mở hết / Thu gọn hết / Mở tới cấp n |
| Mã hoá / Base64 | Tab băm **SHA-256** (và SHA-1/384/512), tuỳ chọn khoá **HMAC**, kết quả hex / HEX / Base64 — băm một chiều, không giải mã ngược; **mã hoá Base64** (UTF-8, tuỳ chọn Base64URL, ngắt dòng 76) và **giải mã Base64** (tự nhận Base64URL, thiếu `=`, xuống dòng, tiền tố `data:…;base64,`; dữ liệu nhị phân hiện hex và tải về được). Xử lý cả file (chọn hoặc thả file vào tab); "Dùng làm đầu vào" để xử lý nối tiếp. **Sinh cặp khoá**: RSA 2048/3072/4096 (mã hoá RSA-OAEP, ký RS256/PS256), ECDSA và ECDH P-256/384/521, Ed25519, X25519, khoá đối xứng AES-GCM 128/192/256 và HMAC 256/384/512; xuất PEM (PKCS#8 / SPKI), PEM PKCS#1 (RSA), JWK, Base64 DER, Base64/Hex cho khoá đối xứng; kèm vân tay SHA-256 và tự kiểm tra cặp khoá (mã hoá–giải mã / ký–xác minh / trao đổi khoá). Dùng WebCrypto của trình duyệt, dữ liệu không rời khỏi máy |
| Khung lồng nhau | Khung `alt` / `opt` / `loop` / `par` trong sequence diagram được tô màu theo tầng lồng (xanh dương → hổ phách → xanh ngọc → hồng): viền, nhãn góc và tiêu đề điều kiện (kể cả `else`) cùng màu với khung của nó; áp dụng cả PDF và ảnh |
| Giao diện | Chọn **Sáng / Tối / Hệ thống** trên thanh trên cùng (ghi nhớ trong trình duyệt, chế độ Hệ thống tự đổi theo OS). Sơ đồ được vẽ lại theo theme; file xuất (PDF, in, SVG/PNG) luôn dùng bản nền sáng |

Đặt chú thích cho sơ đồ bằng dòng `%% caption: Tên hình` trong khối ` ```mermaid `, hoặc `title:` của Mermaid.

## Công nghệ

Chọn **JavaScript / Node.js** vì phù hợp nhất với Vercel:

- **Frontend tĩnh** (`public/`): HTML + CSS + JS thuần, không framework. Dùng `marked`, `DOMPurify`, `mermaid`, `highlight.js`. Đọc, render và xuất TXT đều chạy trên trình duyệt.
- **Vercel Serverless Functions** (`api/`, Node.js):
  - `POST /api/pdf` — `puppeteer-core` + `@sparticuz/chromium` in HTML đã render ra PDF.
  - `POST /api/read` — đọc Markdown, **không chuyển đổi**, trả về nguyên văn + cấu trúc.
- Font **Be Vietnam Pro** (thiết kế cho tiếng Việt) và **JetBrains Mono**, đóng gói sẵn, không phụ thuộc CDN.

```
api/pdf.js            Vercel Function tạo PDF
api/read.js           Vercel Function đọc Markdown
lib/pdf.js            Logic in PDF dùng chung (Vercel + local)
public/               Site tĩnh (index.html, css/, js/, samples/)
public/js/srs-core.js Lõi xử lý dùng chung trình duyệt + API (sơ đồ, mục lục, TXT)
scripts/build.js      Copy thư viện/font vào public/vendor, sinh lib/pdf-assets.generated.js
server.js             Server Express chỉ dùng khi chạy local
vercel.json           Cấu hình build + function (bộ nhớ, thời gian, file Chromium)
```

## Chạy local

Yêu cầu Node.js ≥ 20 và Chrome/Chromium trên máy (để tạo PDF).

```bash
npm install
npm run dev          # build + chạy http://localhost:3080
```

Nếu Chrome không nằm ở đường dẫn mặc định: `CHROMIUM_PATH=/duong/dan/chrome npm run dev`.

## Deploy lên Vercel

1. Push repo lên GitHub, import vào Vercel (Framework Preset: **Other**). Vercel tự đọc `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `public`
   - Function `api/pdf.js`: 1769 MB RAM, tối đa 60 giây, kèm file nhị phân Chromium.
2. Hoặc dùng CLI: `npx vercel` (preview) / `npx vercel --prod`.

Phiên bản `puppeteer-core@25.11.0` và `@sparticuz/chromium@153.0.0` được ghim cố định vì cả hai cùng dùng Chrome 153. Khi nâng cấp, cần nâng cả hai cùng lúc theo cặp tương ứng.

### Giới hạn trên Vercel

- Request/response của function tối đa **4.5 MB**. Tài liệu rất lớn (nhiều ảnh nhúng base64) sẽ tự chuyển sang **In bằng trình duyệt** → chọn "Lưu dưới dạng PDF". Bản này vẫn là vector nhưng không có trang bìa, mục lục, số trang tuỳ chỉnh.
- Lần gọi PDF đầu tiên sau một thời gian không dùng sẽ chậm hơn vài giây (cold start Chromium).
- Gói Hobby giới hạn thời gian chạy function. Nếu tài liệu rất dài, cân nhắc gói Pro hoặc giảm `maxDuration`.

## API

### `POST /api/read` — đọc Markdown, không chuyển đổi

Body là Markdown thô (`Content-Type: text/markdown` hoặc `text/plain`) hoặc JSON `{ "markdown": "..." }`.

```bash
curl -X POST https://<domain>/api/read -H 'Content-Type: text/markdown' --data-binary @srs.md
```

```json
{
  "title": "Đặc tả yêu cầu phần mềm — ...",
  "frontmatter": { "title": "...", "version": "1.2" },
  "headings": [{ "depth": 2, "text": "1. Giới thiệu", "id": "1-gioi-thieu" }],
  "diagrams": [{ "no": 1, "type": "flowchart", "typeLabel": "Sơ đồ luồng", "caption": "Kiến trúc tổng quan" }],
  "stats": { "characters": 5321, "words": 812, "lines": 176, "tables": 4 },
  "markdown": "...nguyên văn..."
}
```

Thêm `?format=raw` để nhận lại nguyên văn Markdown (`text/markdown; charset=utf-8`).

### `POST /api/pdf`

Body JSON: `{ html, title, options: { format, landscape, cover, toc, pageNumbers }, meta: { fileName, exportedAt, headings } }`. `html` là phần thân tài liệu đã render (sơ đồ đã là SVG), trang web tự gửi khi bấm **Tải PDF**. Khi in, Chromium tắt JavaScript và chặn mọi request mạng ra ngoài.

## Bảo mật

- Phụ thuộc: `npm audit` ở thư mục gốc và `desktop/` đều 0 lỗ hổng (kiểm tra lại định kỳ). `chromium-bidi` được ép lên bản kèm `zod` đã vá (GHSA-mrhx-c7xc-m3w5) qua `overrides`; dự án dùng giao thức CDP nên gói này không chạy.
- Nội dung tài liệu: Markdown được lọc bằng DOMPurify, Mermaid chạy `securityLevel: 'strict'`; Content-Security-Policy chặn script lạ (`script-src 'self'`, không có script inline), cùng `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (cấu hình ở `vercel.json` và `lib/security-headers.js`).
- Tạo PDF: Chromium tắt JavaScript, chặn mọi request mạng; API `/api/pdf`, `/api/read` từ chối request từ website khác. API công khai không giới hạn tần suất — nên bật rate limit trong Vercel Firewall nếu cần.
- Bản desktop: `contextIsolation`, `sandbox`, không `nodeIntegration`; liên kết ngoài mở bằng trình duyệt; cửa sổ tạo PDF chỉ đọc đúng file tạm; tắt quyền trình duyệt không cần; Electron fuses: tắt RunAsNode, NODE_OPTIONS, `--inspect`, chỉ nạp mã từ asar.
- Mã hoá: dùng WebCrypto của trình duyệt, khoá sinh và xử lý trên máy, không gửi đi đâu.
- Server local (`npm run dev`) mặc định chỉ nghe `127.0.0.1`.

## Ứng dụng Windows (desktop)

Thư mục `desktop/` đóng gói giao diện này thành ứng dụng Windows bằng **Electron**: tạo PDF ngay trên máy bằng `printToPDF` (không cần server, không cần mạng, không giới hạn 4.5 MB như bản Vercel).

**Cài đặt:** tải `convertSRS-Setup-<phiên bản>.exe` ở mục [Releases](https://github.com/quangns/readmd/releases) rồi chạy.

- Cài cho người dùng hiện tại (`%LOCALAPPDATA%\Programs\convertSRS`), không cần quyền Admin; được chọn thư mục cài.
- Tạo shortcut Desktop và Start Menu; gỡ trong *Settings → Apps* như ứng dụng thường.
- Gắn với file `.md` / `.markdown`: có trong "Mở bằng"; nếu máy chưa có ứng dụng mặc định cho `.md` thì nhấp đúp sẽ mở bằng convertSRS. Muốn đặt làm mặc định: chuột phải file `.md` → *Open with → Choose another app → convertSRS → Always*.
- Mở file thứ hai khi ứng dụng đang chạy: hiển thị trong cửa sổ đang mở.
- Menu: **Tệp** (Mở… `Ctrl+O`, Mở gần đây, Xuất PDF `Ctrl+Shift+E`, Xuất TXT `Ctrl+Shift+T`, In `Ctrl+P`), **Xem** (`Ctrl+1…4` chuyển tab, phóng to/thu nhỏ).
- Bộ cài chưa ký số (code signing): lần đầu chạy Windows SmartScreen có thể cảnh báo → *More info → Run anyway*.

**Build bộ cài** (chạy được trên Linux/macOS/Windows, không cần Wine):

```bash
cd desktop
npm install
npm run dist:win     # -> desktop/dist/convertSRS-Setup-<version>.exe
npm start            # chạy thử ứng dụng desktop
```

`dist:win` = chuẩn bị tài nguyên (`scripts/prepare.js`) → `electron-builder --win dir` (gắn icon + thông tin phiên bản bằng `resedit` trong `scripts/after-pack.cjs`) → biên dịch bộ cài NSIS `installer/convertsrs.nsi` (`scripts/make-installer.js`). Đổi logo: sửa SVG trong `scripts/make-icon.js` rồi `npm run icon`. Tăng phiên bản: sửa `version` trong `desktop/package.json`.
