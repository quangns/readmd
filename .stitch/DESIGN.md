# Design System: convertSRS
**Skill:** stitch-design-taste (google-labs-code/stitch-skills → stitch-utilities/taste-design)

| Dial | Level | Lý do |
|------|-------|-------|
| **Creativity** | `4` | Công cụ nghiệp vụ đọc tài liệu SRS — cần tĩnh, rõ, kiểu "bàn làm việc của người viết tài liệu", không phải landing page |
| **Density** | `6` | Có sidebar điều khiển + vùng xem trước tài liệu; cân bằng, hơi dày ở sidebar |
| **Variance** | `5` | Bố cục lệch: sidebar hẹp cố định bên trái, "tờ giấy" tài liệu lớn bên phải |
| **Motion Intent** | `3` | Chỉ có chuyển động hỗ trợ: shimmer khi đang render, stagger nhẹ khi hiện mục lục, đẩy nút khi bấm |

## 1. Visual Theme & Atmosphere
Một bàn làm việc yên tĩnh, ánh sáng đều, kiểu phòng đọc bản vẽ kỹ thuật. Nền xám kẽm rất nhạt, ở giữa là một "tờ giấy" A4 màu trắng với bóng đổ khuếch tán. Mọi điểm nhấn thị giác dồn vào nội dung tài liệu, nhất là sơ đồ: mỗi sơ đồ nằm trong một khung riêng có đánh số "Hình n" và thanh công cụ nhỏ (phóng to, tải SVG, tải PNG). Giao diện không có trang trí thừa: không gradient, không emoji, không icon minh hoạ.

## 2. Color Palette & Roles
- **Canvas Zinc** (#F4F4F5) — Nền ứng dụng (vùng bàn làm việc quanh tờ giấy)
- **Paper White** (#FFFFFF) — Tờ giấy tài liệu, sidebar, hộp thoại
- **Charcoal Ink** (#18181B) — Chữ chính. Zinc-950, không bao giờ dùng đen tuyệt đối
- **Steel Secondary** (#52525B) — Chữ phụ, mô tả, metadata
- **Muted Zinc** (#A1A1AA) — Chữ cấp ba, trạng thái vô hiệu, placeholder
- **Hairline** (#E4E4E7) — Đường kẻ 1px, viền bảng, viền khung sơ đồ
- **Diagram Wash** (#F8FAFC) — Nền của khung sơ đồ, nền khối mã
- **Ledger Blue** (#2B6CB0) — Accent DUY NHẤT: nút chính, trạng thái active, focus ring, đường viền node trong sơ đồ. Saturation ~61%
- **Ledger Blue Tint** (#EAF1F8) — Nền node sơ đồ, nền mục đang chọn trong mục lục
- **Error Rose** (#BE123C) — Chỉ dùng cho thông báo lỗi cú pháp sơ đồ / lỗi xuất file

Cấm: tím/neon, gradient, #000000, accent thứ hai.

### Giao diện tối (Sáng / Tối / Hệ thống)
- **Night Canvas** (#111113) — nền bàn làm việc · **Night Paper** (#18181B) — tờ giấy, sidebar
- **Moon Ink** (#E4E4E7) — chữ chính · **Dim Steel** (#A1A1AA) — chữ phụ · **Night Hairline** (#2E2E33)
- **Night Wash** (#1F1F23) — nền khung sơ đồ, khối mã
- **Ledger Blue Light** (#6AA5E0) — accent trên nền tối (link, viền node); nút chính giữ nền #2F74BF để chữ trắng đủ tương phản
- Sơ đồ có bảng màu tối riêng; mọi file xuất ra (PDF, in, SVG/PNG) luôn dùng bảng màu sáng

## 3. Typography Rules
- **Display & Body:** `Be Vietnam Pro` — thiết kế riêng cho tiếng Việt, dấu thanh không bị va chạm. Display weight 700, tracking `-0.02em`, leading `1.15`. Body weight 400, leading `1.7`, độ rộng dòng tối đa ~72ch trong tờ giấy
- **Mono:** `JetBrains Mono` — khối mã, mã nguồn sơ đồ, tên file, kích thước file, số trang
- **Scale:** H1 tài liệu `1.875rem`, H2 `1.375rem` (có kẻ hairline phía dưới), H3 `1.125rem`, body `0.975rem`, metadata mono `0.78rem`
- **Banned:** Inter, font serif mặc định, chữ gradient

## 4. Component Stylings
* **Buttons:** Phẳng, bo `0.625rem`. Primary: nền Ledger Blue, chữ trắng. Secondary: viền Hairline, nền trắng. Active: `translateY(1px)`. Hover: đổi nền nhẹ, không glow. Cao tối thiểu 40px (44px trên mobile)
* **Dropzone:** Viền nét đứt Hairline, bo `1rem`. Khi kéo file vào: viền chuyển Ledger Blue, nền Ledger Blue Tint
* **Paper (tờ giấy):** Nền trắng, bo `0.75rem`, viền Hairline, bóng `0 24px 48px -24px rgba(24,24,27,0.18)`. Padding `3.5rem 4rem` desktop, `1.25rem` mobile
* **Diagram Frame:** Nền Diagram Wash, viền Hairline, bo `0.75rem`. Thanh công cụ nhỏ góc phải trên (hiện khi hover, luôn hiện trên mobile). Chú thích "Hình n — Tên" dưới khung, chữ Steel Secondary, nhãn "Hình n" mono
* **Tables:** Viền Hairline, header nền Diagram Wash, chữ header weight 600. Dòng chẵn không tô màu — dùng đường kẻ
* **Tabs:** Gạch chân 2px Ledger Blue cho tab đang chọn, không dùng pill
* **Loaders:** Skeleton shimmer có hình dạng giống tài liệu (một thanh tiêu đề, vài dòng chữ, một khối sơ đồ). Không spinner tròn
* **Empty State:** Bố cục 2 cột trong tờ giấy: trái là dropzone + nút "Mở tài liệu mẫu"; phải là danh sách ngắn các định dạng sơ đồ hỗ trợ viết bằng mono
* **Error State:** Inline ngay tại vị trí sơ đồ lỗi: viền trái Error Rose, thông báo lỗi + mã nguồn gốc

## 5. Layout Principles
- CSS Grid: `grid-template-columns: 320px minmax(0, 1fr)` (sidebar trái cố định, sticky)
- Thanh trên mỏng 56px: tên sản phẩm, tên file đang mở, nút tải PDF / TXT
- Vùng tài liệu: tờ giấy `max-width: 880px`, căn giữa trong cột phải
- Sidebar chia các nhóm bằng `border-top` Hairline (không dùng card lồng card): Nguồn tài liệu → Mục lục → Tuỳ chọn xuất
- `min-height: 100dvh`, không dùng `100vh`

## 6. Responsive Rules
- `< 960px`: sidebar chuyển xuống dưới thanh trên, thành khối gập/mở; tờ giấy full width
- `< 640px`: nút xuất file full width, padding tờ giấy `1.25rem`, sơ đồ cuộn ngang trong khung riêng (không bao giờ làm tràn trang)
- Touch target tối thiểu 44px

## 7. Motion & Interaction
- Chỉ animate `transform` và `opacity`
- Mục lục: stagger `calc(var(--i) * 25ms)` khi tài liệu mới được nạp
- Shimmer trên skeleton trong lúc render sơ đồ / đang tạo PDF
- Easing `cubic-bezier(0.22, 1, 0.36, 1)`, 180–240ms. Tôn trọng `prefers-reduced-motion`

## 8. Print / PDF
- Khổ A4 (tuỳ chọn Letter, dọc/ngang), lề 18mm/16mm
- Không ngắt trang trong sơ đồ, bảng ngắn, khối mã ngắn; tiêu đề không đứng một mình cuối trang
- Header: tên tài liệu; Footer: "Trang X / Y"
- Tuỳ chọn trang bìa và trang mục lục
- Sơ đồ giữ nguyên dạng vector SVG, tự co theo bề rộng trang

## 9. Anti-Patterns (Banned)
- Emoji, icon minh hoạ trang trí
- Inter, serif mặc định, #000000
- Gradient, glow, tím neon
- 3 card bằng nhau xếp ngang
- Chữ kiểu "Seamless", "Elevate", "Next-Gen"
- Số liệu bịa đặt (không hiển thị "thống kê" giả)
- Spinner tròn
