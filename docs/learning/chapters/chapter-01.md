# Chương 1 — Giới thiệu môn Kỹ thuật lập trình

> **Mục tiêu:** Hiểu môn học hướng đến điều gì, quy trình giải quyết bài toán bằng lập trình và cách sử dụng phần Learning trong Student Coding IDE.

## 1. Kỹ thuật lập trình là gì?

Kỹ thuật lập trình không chỉ là nhớ cú pháp. Đây là quá trình **phân tích yêu cầu, lựa chọn cách biểu diễn dữ liệu, thiết kế các bước xử lý, viết chương trình và kiểm tra tính đúng đắn**. Hai chương trình cùng cho ra kết quả đúng có thể khác nhau về mức độ dễ hiểu, khả năng mở rộng và hiệu quả sử dụng tài nguyên.

Một ví dụ đơn giản: cho ba điểm số, yêu cầu tính trung bình. Trước khi viết code, ta cần làm rõ điểm có thể là số thực hay không, có bao nhiêu giá trị và kết quả cần làm tròn như thế nào. Khi yêu cầu đã rõ, công thức cơ bản là `(a + b + c) / 3`.

## 2. Quy trình giải một bài toán lập trình

1. **Đọc đề:** Xác định dữ liệu vào, kết quả ra và các ràng buộc.
2. **Lập kế hoạch:** Chia bài toán thành các bước nhỏ, thử bằng tay với vài ví dụ.
3. **Viết code:** Dùng biến, điều kiện, vòng lặp, chuỗi, hàm hoặc mảng khi phù hợp.
4. **Kiểm tra:** Thử trường hợp thông thường, trường hợp biên và dữ liệu không hợp lệ nếu đề yêu cầu.
5. **Cải thiện:** Đặt tên rõ nghĩa, loại bỏ thao tác thừa, ghi chú phần khó hiểu.

Không nên chỉ thử một ví dụ rồi kết luận chương trình đúng. Chẳng hạn, phép chia số nguyên trong C# có thể làm mất phần thập phân; đó là lỗi dễ gặp khi tính trung bình.

## 3. Ví dụ C# đầu tiên

```csharp
// Ví dụ chạy trong ứng dụng C# dùng top-level statements.
int a = 7;
int b = 8;
int c = 9;

double average = (a + b + c) / 3.0;
Console.WriteLine($"Điểm trung bình: {average:F2}");
// Kết quả: Điểm trung bình: 8.00
```

**Giải thích:** `int` lưu các điểm nguyên; `double` lưu số thực. Số `3.0` giúp phép chia trả về giá trị thực. `{average:F2}` định dạng hai chữ số sau dấu thập phân.

Nếu dùng `/ 3` với hai toán hạng nguyên, C# thực hiện phép chia nguyên trước khi gán kết quả sang `double`.

## 4. Những khái niệm sẽ gặp trong môn học

| Khái niệm | Vai trò |
|---|---|
| Biến và kiểu dữ liệu | Lưu thông tin cần xử lý |
| Điều kiện | Lựa chọn hành động theo dữ liệu |
| Vòng lặp | Lặp lại một nhóm thao tác |
| Chuỗi | Xử lý văn bản |
| Hàm | Chia nhỏ và tái sử dụng thuật toán |
| Mảng 1 chiều | Lưu danh sách các phần tử cùng kiểu |
| Mảng 2 chiều | Biểu diễn dữ liệu dạng hàng và cột |

## 5. Học bằng Student Coding IDE

Learning Mode là không gian học tập riêng. Sinh viên chọn chương ở Roadmap, đọc các mục theo thứ tự hoặc sử dụng mục lục để đến nội dung cần tìm. Sau khi nắm lý thuyết, những phase tiếp theo sẽ bổ sung luyện tập theo mẫu hàm và đánh giá kết quả; nội dung đó **không phải chức năng của trang lý thuyết 9B**.

Trong môn này, **C# được dùng làm ngôn ngữ ví dụ lý thuyết**. Ở phần luyện tập sau này, ứng dụng dự kiến hỗ trợ C# và JavaScript. Nắm khái niệm cơ bản quan trọng hơn việc thuộc riêng một cú pháp.

### Cách đọc các ví dụ code

- Đọc yêu cầu và tự đoán kết quả trước khi nhìn dòng chú thích kết quả.
- Tìm biến đầu vào, phép tính chính và kết quả cuối.
- Thử đổi một dữ liệu đầu vào để kiểm tra mức độ hiểu.

## 6. Kết quả mong đợi sau Chương 1

Sau chương này, bạn nên giải thích được một bài toán lập trình gồm đầu vào, xử lý, đầu ra; biết cách đọc ví dụ C# và hiểu lộ trình tám chương. Chương 1 mang tính giới thiệu, **không bắt buộc có bài luyện tập hay trắc nghiệm**.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/overview
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/tutorials/hello-world

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
