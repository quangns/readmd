---
title: Đặc tả yêu cầu phần mềm — Hệ thống Quản lý Đơn nghỉ phép
version: 1.2
---

# Đặc tả yêu cầu phần mềm — Hệ thống Quản lý Đơn nghỉ phép

> Tài liệu mẫu dùng để minh hoạ cách convertSRS trình bày tiêu đề, bảng, danh sách, khối mã và các loại sơ đồ Mermaid. Nội dung nghiệp vụ là giả định.

## 1. Giới thiệu

### 1.1 Mục đích

Tài liệu mô tả các yêu cầu chức năng và phi chức năng của hệ thống **Quản lý Đơn nghỉ phép** (gọi tắt là *QLNP*), dùng làm cơ sở cho thiết kế, phát triển và kiểm thử.

### 1.2 Phạm vi

- Nhân viên tạo, sửa, huỷ đơn nghỉ phép.
- Quản lý trực tiếp duyệt hoặc từ chối đơn.
- Phòng Nhân sự theo dõi quỹ phép và xuất báo cáo.
- Ngoài phạm vi: tính lương, chấm công vân tay.

### 1.3 Thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|------------|
| Đơn | Yêu cầu nghỉ phép do nhân viên tạo, gồm loại phép, thời gian và lý do |
| Quỹ phép | Số ngày phép còn lại của nhân viên trong năm |
| Người duyệt | Quản lý trực tiếp được cấu hình trong sơ đồ tổ chức |

## 2. Mô tả tổng quan

### 2.1 Kiến trúc hệ thống

```mermaid
%% caption: Luồng xử lý qua các thành phần hệ thống
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant W as Web App
    participant G as API Gateway
    participant A as Đơn phép
    participant N as Thông báo
    U->>W: Thao tác
    W->>G: Gọi API (HTTPS)
    G->>A: Chuyển tiếp
    Note over A: Đọc / ghi PostgreSQL
    A-->>G: Kết quả
    G-->>W: Phản hồi
    W-->>U: Hiển thị
    A-)N: Sự kiện (queue)
    N-)U: Email / chat nội bộ
```

### 2.2 Tác nhân

| Mã | Tác nhân | Mô tả |
|----|----------|-------|
| TN-01 | Nhân viên | Tạo và theo dõi đơn của bản thân |
| TN-02 | Quản lý | Duyệt đơn của nhân viên thuộc quyền |
| TN-03 | Nhân sự | Quản trị quỹ phép, xem báo cáo toàn công ty |

## 3. Yêu cầu chức năng

### 3.1 UC-01 Tạo đơn nghỉ phép

**Tiền điều kiện:** nhân viên đã đăng nhập, còn quỹ phép.

1. Nhân viên chọn loại phép và khoảng thời gian.
2. Hệ thống kiểm tra quỹ phép và ngày trùng.
3. Nhân viên xác nhận gửi đơn.
4. Hệ thống gửi thông báo tới người duyệt.

```mermaid
%% caption: Luồng tạo và duyệt đơn
sequenceDiagram
    autonumber
    actor NV as Nhân viên
    participant W as Web App
    participant A as Đơn phép
    participant N as Thông báo
    actor QL as Quản lý
    NV->>W: Nhập thông tin đơn
    W->>A: POST /don-phep
    Note over W,A: Kiểm tra quỹ phép, ngày trùng
    alt Hợp lệ
        A-->>W: 201 Đã tạo
        A-)N: Đơn mới
        N-)QL: Có đơn cần duyệt
    else Lỗi
        A-->>W: 422 Lý do lỗi
    end
    QL->>W: Duyệt / Từ chối
    W->>A: PATCH /don-phep
    A-)N: Đơn đã xử lý
    N-)NV: Thông báo kết quả
```

### 3.2 Vòng đời đơn

```mermaid
%% caption: Trạng thái của một đơn nghỉ phép
stateDiagram-v2
    [*] --> Nhap
    Nhap --> ChoDuyet: Gửi đơn
    ChoDuyet --> DaDuyet: Quản lý duyệt
    ChoDuyet --> TuChoi: Quản lý từ chối
    ChoDuyet --> DaHuy: Nhân viên huỷ
    DaDuyet --> DaHuy: Huỷ trước ngày nghỉ
    TuChoi --> [*]
    DaHuy --> [*]
    DaDuyet --> [*]
```

### 3.3 Quy tắc nghiệp vụ

- [x] BR-01: Không cho phép tạo đơn có khoảng thời gian trùng đơn đã duyệt.
- [x] BR-02: Đơn trên 5 ngày cần thêm duyệt của Nhân sự.
- [ ] BR-03: Tự động duyệt nếu quá 3 ngày làm việc không xử lý *(đang xem xét)*.

## 4. Dữ liệu

```mermaid
%% caption: Mô hình dữ liệu
erDiagram
    NHAN_VIEN ||--o{ DON_PHEP : tao
    NHAN_VIEN ||--o{ NHAN_VIEN : quan_ly
    DON_PHEP }o--|| LOAI_PHEP : thuoc
    NHAN_VIEN ||--|{ QUY_PHEP : co
    NHAN_VIEN {
        string ma_nv PK
        string ho_ten
        string email
        string ma_quan_ly FK
    }
    DON_PHEP {
        uuid id PK
        string ma_nv FK
        date tu_ngay
        date den_ngay
        string trang_thai
    }
    QUY_PHEP {
        string ma_nv FK
        int nam
        float so_ngay_con_lai
    }
```

Ví dụ payload tạo đơn:

```json
{
  "loaiPhep": "PHEP_NAM",
  "tuNgay": "2026-11-03",
  "denNgay": "2026-11-05",
  "lyDo": "Việc gia đình"
}
```

## 5. Yêu cầu phi chức năng

| Mã | Nhóm | Yêu cầu |
|----|------|---------|
| NFR-01 | Bảo mật | Đăng nhập qua SSO nội bộ; phân quyền theo vai trò |
| NFR-02 | Khả dụng | Giao diện dùng được trên điện thoại từ 375px |
| NFR-03 | Nhật ký | Lưu vết mọi thao tác duyệt / từ chối kèm thời điểm và người thực hiện |

## 6. Kế hoạch triển khai

```mermaid
gantt
    title Kế hoạch triển khai dự kiến
    dateFormat YYYY-MM-DD
    section Phân tích
    Đặc tả yêu cầu       :done,    a1, 2026-11-02, 10d
    section Phát triển
    API Đơn phép          :active,  b1, after a1, 15d
    Giao diện web         :         b2, after a1, 20d
    section Kiểm thử
    Kiểm thử tích hợp     :         c1, after b2, 7d
```
