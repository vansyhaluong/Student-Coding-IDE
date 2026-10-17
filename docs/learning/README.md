# Nội dung lý thuyết Phase 9B — Student Coding IDE

**Gói dữ liệu biên soạn**, chưa tích hợp vào source code tại máy của người dùng.

- 8 tệp Markdown, mỗi chương là một **trang cuộn liên tục**, được chia thành các `##` mục; **không có điều hướng bài học tách trang**.
- Mỗi chương có giới thiệu, nội dung lý thuyết, các ví dụ tự soạn bằng C# và URL tham khảo Microsoft Learn.
- `manifest.json` ghi đúng 8 chương, thứ tự, đường dẫn nội dung và metadata nguồn.
- Chương 1 có thể hiển thị tiếp nối trang giới thiệu chung đã xây ở 9A; không tạo 2 trang giới thiệu trùng nhau.
- Không chứa scraping, hình ảnh, bản sao tài liệu Microsoft hoặc code ví dụ từ Microsoft. Những liên kết chỉ dùng làm nguồn tham khảo kiến thức; **không được hiểu là giấy phép sao chép nguyên văn**.

## Gợi ý tích hợp vào repository

1. Kiểm tra kiến trúc hiện hành của `features/learning/` ở nhánh 9A.
2. Đặt `manifest.json` và các file `chapters/` vào thư mục nội dung cục bộ riêng, tránh hardcode trong JSX.
3. Tạo adapter chỉ đọc để lấy danh sách chương và nội dung Markdown theo `chapterId`, giữ nguyên state/sidebar chuyển mode của 9A.
4. Dùng Markdown renderer đã có hoặc renderer an toàn đã được phê duyệt. Chống render HTML không tin cậy và chặn URL ngoài không phù hợp; **không tự thêm dependency**.
5. Hiển thị các mục `##` trong mục lục nội trang hoặc anchor links, giúp cuộn tới mục; sidebar 8 chương vẫn độc lập.
6. Bảo đảm nội dung đọc được khi máy offline và khi đóng gói Electron.
7. Rà soát việc dựng code fence C#, khả năng cuộn, điều hướng và quyền sử dụng nguồn; thực hiện test phù hợp trước khi nghiệm thu 9B.

## Kiểm tra cần làm trước khi phát hành

- Biên dịch/chạy các code sample độc lập trong môi trường C# mục tiêu (máy tạo gói hiện không có .NET SDK).
- Review ngôn ngữ, lỗi chính tả, ví dụ và tính sư phạm với giáo trình trường nếu có.
- Rà soát bản quyền nếu sau này nhập nội dung nguyên văn từ bên thứ ba.

