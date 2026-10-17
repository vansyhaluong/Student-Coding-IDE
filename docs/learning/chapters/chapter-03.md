# Chương 3 — Cấu trúc rẽ nhánh

> **Mục tiêu:** Dùng điều kiện để chọn nhánh xử lý, kết hợp điều kiện logic và chọn cấu trúc `if` hoặc `switch` phù hợp.

## 1. Điều kiện và kiểu `bool`

Một chương trình không phải lúc nào cũng thực hiện cùng một trình tự lệnh. Cấu trúc rẽ nhánh giúp quyết định việc gì được thực hiện dựa trên biểu thức có kết quả `true` hoặc `false`.

```csharp
int score = 7;
if (score >= 5)
{
    Console.WriteLine("Đạt");
}
// Kết quả: Đạt
```

Chỉ khi điều kiện đúng, khối lệnh bên trong `if` mới được chạy. Nên sử dụng `{ }` ngay cả khi nhánh chỉ có một câu lệnh, giúp code dễ đọc và tránh lỗi khi bổ sung xử lý.

## 2. `if`, `else if` và `else`

Khi bài toán có từ hai khả năng trở lên, sử dụng `else` hoặc chuỗi `else if`. Các điều kiện được xét theo thứ tự; khi một nhánh đã thỏa mãn, những nhánh còn lại bị bỏ qua.

```csharp
int score = 82;
string rank;

if (score >= 90)
{
    rank = "Xuất sắc";
}
else if (score >= 70)
{
    rank = "Khá";
}
else if (score >= 50)
{
    rank = "Trung bình";
}
else
{
    rank = "Cần cố gắng";
}

Console.WriteLine(rank); // Khá
```

Chú ý thứ tự. Nếu kiểm tra `score >= 50` trước `score >= 90`, nhiều trường hợp đáng lẽ đạt mức cao sẽ bị xếp vào nhánh thấp hơn.

## 3. Kết hợp điều kiện

Dùng `&&` nếu **tất cả** điều kiện phải đúng và `||` nếu **ít nhất một** điều kiện cần đúng. Khi viết biểu thức phức tạp, hãy thêm ngoặc để người đọc hiểu rõ thứ tự kiểm tra.

```csharp
int age = 20;
bool hasTicket = true;

if (age >= 18 && hasTicket)
{
    Console.WriteLine("Được vào sự kiện");
}
else
{
    Console.WriteLine("Không đủ điều kiện");
}
```

Nếu biến điều kiện vốn đã là `bool`, có thể viết `if (hasTicket)` thay vì `if (hasTicket == true)`.

## 4. `switch` cho các lựa chọn rời rạc

`switch` phù hợp khi cần xử lý một giá trị theo các trường hợp rõ ràng. Mỗi `case` có thể có logic riêng; `default` xử lý trường hợp không khớp.

```csharp
int day = 6;
string kind;

switch (day)
{
    case 6:
    case 7:
        kind = "Cuối tuần";
        break;
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
        kind = "Ngày trong tuần";
        break;
    default:
        kind = "Ngày không hợp lệ";
        break;
}

Console.WriteLine(kind); // Cuối tuần
```

C# còn có `switch expression`, nhưng phiên bản `switch` statement ở trên giúp người mới làm quen dễ theo dõi luồng điều khiển.

## 5. Ví dụ tổng hợp — kiểm tra năm nhuận

Một năm nhuận nếu chia hết cho 400, hoặc chia hết cho 4 nhưng không chia hết cho 100.

```csharp
int year = 2024;
bool isLeapYear = year % 400 == 0 || (year % 4 == 0 && year % 100 != 0);
Console.WriteLine(isLeapYear ? "Năm nhuận" : "Không nhuận");
// Năm nhuận
```

Hãy thử thay `year` bằng `1900` và `2000` để thấy vì sao kiểm tra chia hết cho 4 đơn thuần là chưa đủ.

## 6. Lỗi thường gặp

- Quên ngoặc trong tổ hợp `&&` và `||` làm điều kiện khác với ý định.
- Xếp các ngưỡng điểm theo thứ tự không phù hợp.
- Không xử lý dữ liệu nằm ngoài miền hợp lệ.
- Dùng nhiều `if` độc lập khi thực tế chỉ muốn chọn đúng một nhánh.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/selection-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
