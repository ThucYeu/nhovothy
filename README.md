# PRISON LIFE 3D

Game nhà tù 3D chạy trên trình duyệt, dùng Three.js để dựng cảnh và Rapier để xử lý va chạm.

## Chạy game

```bash
npm install
npm start
```

Mở `http://localhost:3000`. Lệnh `npm start` build frontend trước rồi khởi chạy Node.js backend. API dữ liệu hiện có vẫn được phục vụ tại `/api/site`.

Khi phát triển giao diện, chạy backend bằng `npm start` và chạy Vite ở terminal khác bằng `npm run dev`; Vite phục vụ tại cổng `5173` và chuyển tiếp API cùng Socket.IO đến backend cổng `3000`.

## Deploy lên Render

Đẩy project lên GitHub, sau đó trên Render chọn **New > Blueprint** và kết nối repository này. Render sẽ dùng `render.yaml` để cài dependencies, build frontend và chạy server web. Sau khi deploy hoàn tất, mở URL Render cấp để truy cập game.

Server sử dụng biến `PORT` do Render cung cấp và phục vụ frontend, API cùng Socket.IO trên một dịch vụ. `ALLOWED_ORIGINS` chỉ chứa các domain Render của game; nếu đổi tên dịch vụ, cập nhật biến này theo domain mới.

Để bật chat và lưu lịch sử bền vững, cần tạo PostgreSQL trên Render (cùng region), rồi đặt `DATABASE_URL` của database vào Environment Variables của web service. Không đưa URL này vào GitHub. Nếu chưa cấu hình database, game multiplayer vẫn chạy nhưng chat sẽ báo chưa sẵn sàng; server không giả lập lưu lịch sử bằng RAM. Database PostgreSQL bền vững có thể phát sinh phí; Blueprint hiện không tự tạo database tính phí.

Có thể đặt `CHAT_BLOCKED_WORDS` thành danh sách từ/cụm từ phân cách bằng dấu phẩy để bộ lọc thay chúng bằng `***`. Đặt `DATABASE_SSL=true` chỉ khi database yêu cầu TLS với chứng chỉ được hệ thống tin cậy.

## Điều khiển

- `W`, `A`, `S`, `D`: di chuyển
- `Shift`: chạy
- `Space`: nhảy
- `C`: cúi
- `E`: mở/đóng cửa, tương tác giường/toilet hoặc gọi thang máy; trong cabin, gọi tầng kế tiếp
- Chuột: xoay camera góc nhìn thứ ba
- Con lăn: điều chỉnh khoảng cách camera
- `Esc`: tạm dừng
- Thiết bị cảm ứng: joystick di chuyển, kéo nửa phải màn hình để xoay camera; nút chạy, nhảy, cúi, tương tác và chat.

Map hiện có chín tầng với phòng giam, hành lang, cầu thang và thang máy. Người chơi bắt đầu tại phòng 04 tầng 01; vị trí, va chạm và phân vùng multiplayer được kiểm tra theo tầng.

Game hiện dùng guest profile, chưa có tài khoản/mật khẩu. Server cấp Player ID/mã tù; khi có PostgreSQL, profile guest và hash của token phiên được lưu bền vững. Trình duyệt giữ bearer token trong `sessionStorage` để reconnect; đây không phải xác thực tài khoản và không bảo vệ danh tính khỏi người kiểm soát trình duyệt. Người chơi chưa có hệ thống đăng ký hoặc thu hồi phiên.

Socket.IO hỗ trợ tối đa 50 phiên người chơi đang hoạt động trong một tiến trình; bộ đếm trực tuyến phản ánh số socket đang kết nối, không xác minh danh tính con người. Server xác thực token phiên guest, chặn replay token đang hoạt động, giới hạn event, kiểm tra biên/tốc độ/vị trí tương tác và correction dữ liệu không hợp lệ. Vật lý va chạm vẫn chạy trên client, nên đây chưa phải mô phỏng authoritative hoàn chỉnh; không có tiền, máu, inventory hay nhiệm vụ trong game hiện tại.

Chat có kênh toàn nhà tù, gần đây 15m và riêng; history phân trang lưu trong PostgreSQL, roster online, block/report, giới hạn gửi và render text an toàn. Chat chưa thể chạy đến khi cấu hình `DATABASE_URL`. Role player/moderator/administrator có trong schema nhưng chưa có công cụ quản trị hoặc luồng cấp quyền. Multi-instance scaling, kiểm thử tải thực tế, hiệu năng trên thiết bị thật, đăng nhập tài khoản và kiểm thử lịch sử với PostgreSQL chưa được xác nhận.