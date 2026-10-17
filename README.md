# 💬 Chat Together Web - Hệ Thống Nhắn Tin Thời Gian Thực

Một ứng dụng web nhắn tin đa nền tảng hiện đại, trực quan mang tên **Chat Together Web**.

---

## 🌟 Các Tính Năng Nổi Bật

### 1. ⚡ Nhắn Tin Thời Gian Thực (Real-time Messaging)
- **Công nghệ Socket.IO**: Tin nhắn được gửi và nhận tức thì, không cần tải lại trang.
- **Trạng thái gõ phím (Live Typing)**: Hiển thị animation "...đang soạn tin" mượt mà.
- **Đánh dấu đã xem & trạng thái tin nhắn**: Tích đôi xanh biểu thị tin nhắn đã gửi/nhận.
- **Phân tách ngày giờ**: Tự động nhóm tin nhắn theo ngày ("Hôm nay", ngày tháng năm).

### 2. 🎨 Giao Diện & Trải Nghiệm Người Dùng (UI/UX) Đỉnh Cao
- **Phong cách hiện đại**: Sidebar icon trực quan, danh sách hội thoại bo góc mềm mại, bong bóng chat gradient đẹp mắt.
- **Chế độ Sáng / Tối (Dark / Light Mode)**: Chuyển đổi mượt mà với 1 nút bấm (lưu trạng thái vào LocalStorage).
- **Âm thanh thông báo (Web Audio API)**: Tích hợp âm thanh khi gửi tin, nhận tin, đổ chuông cuộc gọi và kết thúc cuộc gọi mà không phụ thuộc file âm thanh ngoài.
- **Tìm kiếm hội thoại & bạn bè**: Lọc tin nhắn nhanh theo tên hoặc nội dung.
- **Bộ lọc thông minh**: Lọc "Tất cả", "Chưa đọc", và "Nhóm".

### 3. 💌 Tương Tác & Tính Năng Tin Nhắn Chuyên Sâu
- **Thả cảm xúc (Reactions)**: Thả tim (❤️), thích (👍), cười (😂), ngạc nhiên (😮) trực tiếp trên từng tin nhắn với số đếm badge.
- **Trả lời tin nhắn (Reply / Quote)**: Trích dẫn tin nhắn gốc và tự động cuộn đến tin được trích dẫn khi click.
- **Thu hồi tin nhắn (Recall)**: Thu hồi tin nhắn đã gửi ("Tin nhắn đã được thu hồi").
- **Ghim tin nhắn (Pin Messages)**: Ghim tin quan trọng lên đầu cuộc trò chuyện.
- **Bộ biểu cảm phong phú (Emoji Picker)**: Phân loại theo cảm xúc, cử chỉ, trái tim, biểu tượng vui vẻ.

### 4. 📁 Đính Kèm File & Media
- **Gửi hình ảnh**: Xem trước ảnh, tích hợp Lightbox phóng to và nút tải về máy.
- **Gửi tài liệu & tệp tin**: Hiển thị tên file, dung lượng và icon tệp tin rõ ràng.
- **Ghi âm giọng nói (Voice Note)**: Ghi âm trực tiếp từ microphone với thanh sóng âm trực quan.

### 5. 📞 Cuộc Gọi Thoại & Cuộc Gọi Video (Voice & Video Call Simulation)
- Màn hình cuộc gọi chân thực với avatar xoay vòm sóng âm.
- Tự động hiển thị camera người gọi (WebRTC / Camera preview).
- Bộ đếm thời gian cuộc gọi (00:00).
- Nút Bật/Tắt Micro, Bật/Tắt Camera, Kết thúc cuộc gọi.

### 6. 👥 Trò Chuyện Trực Tiếp & Trò Chuyện Nhóm
- **Chat 1-1**: Danh bạ bạn bè trực tuyến, trạng thái Online/Busy/Away.
- **Chat Nhóm (Group Chat)**: Tạo nhóm mới, chọn nhiều thành viên, xem danh sách thành viên và trưởng nhóm (Admin).
- **Chuyển đổi tài khoản Demo**: Dễ dàng đổi qua lại giữa 5 tài khoản mẫu (*Nguyễn Văn An, Lê Thị Mai, Trần Quốc Bảo, Phạm Thu Hương, Đặng Minh Trí*) để test nhắn tin đa chiều ngay trên 1 hoặc nhiều tab trình duyệt!

---

## 🛠️ Cấu Trúc Dự Án

```
d:\NHANTIN/
├── app.py                 # Máy chủ Flask, REST APIs & Flask-SocketIO realtime events
├── database.py            # Khởi tạo SQLite database, định nghĩa bảng & nạp dữ liệu mẫu
├── requirements.txt       # Danh sách thư viện Python cần thiết
├── static/
│   ├── css/
│   │   └── style.css      # Toàn bộ CSS giao diện, dark mode, animation
│   ├── js/
│   │   ├── app.js         # Quản lý giao diện, state người dùng, sự kiện DOM
│   │   ├── socket.js      # Kết nối Socket.IO thời gian thực
│   │   ├── call.js        # Điều khiển cuộc gọi thoại & video
│   │   └── sound.js       # Tổng hợp âm thanh thông báo bằng Web Audio API
│   └── uploads/           # Thư mục lưu trữ hình ảnh & tệp đính kèm người dùng gửi
└── templates/
    └── index.html         # Giao diện chính Single Page Application
```

---

## 🚀 Hướng Dẫn Chạy Hệ Thống

1. **Khởi động Server** (nếu chưa chạy):
   ```powershell
   cd d:\NHANTIN
   python app.py
   ```

2. **Truy cập ứng dụng trên trình duyệt**:
   Mở trình duyệt web (Chrome, Edge, Cốc Cốc, Firefox...) và truy cập:
   ```
   http://127.0.0.1:5000
   ```
   *(Hoặc từ điện thoại/máy khác cùng mạng LAN qua địa chỉ IP máy tính hiển thị trên terminal)*

3. **Thử nghiệm nhắn tin hai chiều**:
   - Mở 2 tab trình duyệt hoặc 1 tab thường + 1 tab ẩn danh.
   - Ở tab 1: Giữ tài khoản mặc định `Nguyễn Văn An`.
   - Ở tab 2: Nhấn vào icon đổi tài khoản ở thanh menu bên trái, chọn `Lê Thị Mai`.
   - Bắt đầu gõ phím: Bạn sẽ thấy hiệu ứng "...đang soạn tin" và tin nhắn nhảy sang tức thì giữa 2 tab!
