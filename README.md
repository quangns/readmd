# convertSRS

Trang web đọc tài liệu SRS viết bằng Markdown, cho phép **đọc trực tiếp không chuyển đổi**, hoặc **tải xuống PDF / TXT** khi cần. Sơ đồ Mermaid được vẽ dạng vector, đánh số "Hình n", có chú thích, giữ nguyên độ nét khi in.

Giao diện thiết kế theo skill `taste-design` của [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) — xem [`.stitch/DESIGN.md`](.stitch/DESIGN.md).

## Tính năng

| Nhóm | Chi tiết |
|------|----------|
| Nhập tài liệu | Import file `.md` (chọn file / kéo thả), dán văn bản vào ô dán, nút "Lấy từ clipboard", hoặc Ctrl+V ở bất kỳ đâu trên trang |
| Đọc không chuyển đổi | Tab **Đọc** (Markdown đã định dạng), tab **Markdown gốc** (nguyên văn, có số dòng, sao chép, tải `.md`), tab **Soạn / Dán** (sửa trực tiếp, xem trước cập nhật ngay) |
| Sơ đồ | Mermaid: flowchart, sequence, class, ER, state, gantt, journey, pie, mindmap, timeline… Mỗi sơ đồ có: phóng to (zoom / kéo), tải SVG, tải PNG. Sơ đồ sai cú pháp báo lỗi ngay tại chỗ |
| PDF | Render bằng Chromium phía server → chữ chọn được, sơ đồ vector. Tuỳ chọn A4/Letter, dọc/ngang, trang bìa, trang mục lục, đầu trang + "Trang X / Y", bookmark PDF |
| TXT | UTF-8 có BOM, xuống dòng CRLF (mở tốt trên Notepad). Bảng kẻ khung ASCII, sơ đồ ghi "[Hình n: loại — chú thích]" kèm mã nguồn |
| Mục lục | Tự sinh từ tiêu đề + danh mục hình, đánh dấu mục đang đọc |

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
