# Chương 2 — Kiến thức lập trình cơ bản

> **Mục tiêu:** Khai báo và sử dụng biến, chọn kiểu dữ liệu, áp dụng toán tử, biểu thức và hiểu kết quả của các phép tính C#.

## 1. Biến, hằng và cách đặt tên

**Biến** là một vị trí lưu dữ liệu có kiểu xác định. Giá trị của biến có thể được cập nhật trong quá trình chương trình chạy. **Hằng** được khai báo với `const` và không thể gán lại sau khi được định nghĩa.

```csharp
int age = 19;
string studentName = "An";
const int MonthsPerYear = 12;

age += 1;
Console.WriteLine($"{studentName} sẽ {age} tuổi, một năm có {MonthsPerYear} tháng.");
```

Tên biến nên cho biết mục đích, chẳng hạn `totalScore` thay vì `x`. C# phân biệt chữ hoa và chữ thường: `score` và `Score` là hai tên khác nhau. Khi khai báo biến cục bộ bằng `var`, trình biên dịch vẫn suy ra một kiểu cụ thể; `var` không có nghĩa là biến có thể tùy tiện đổi kiểu.

## 2. Các kiểu dữ liệu thường gặp

| Kiểu C# | Ý nghĩa | Ví dụ |
|---|---|---|
| `int` | Số nguyên 32-bit | `25` |
| `long` | Số nguyên có miền giá trị lớn hơn `int` | `9000000000L` |
| `double` | Số thực dấu phẩy động | `8.75` |
| `decimal` | Số thập phân, thường hữu ích cho tiền tệ | `19.99m` |
| `bool` | Giá trị logic | `true` / `false` |
| `char` | Một đơn vị ký tự UTF-16 | `'A'` |
| `string` | Chuỗi văn bản | `"Hello"` |

Phân biệt `char` sử dụng dấu nháy đơn và `string` sử dụng dấu nháy kép. C# kiểm tra kiểu khi biên dịch, giúp phát hiện nhiều phép gán không phù hợp sớm.

```csharp
int quantity = 3;
decimal price = 12500.50m;
decimal total = quantity * price;
bool isExpensive = total > 30000m;
Console.WriteLine($"Tổng: {total}; Trên 30.000? {isExpensive}");
```

## 3. Toán tử và biểu thức

Các toán tử số học gồm `+`, `-`, `*`, `/` và `%` (phần dư). Biểu thức có thể kết hợp nhiều phép toán; phép nhân/chia thường được ưu tiên trước cộng/trừ, hoặc bạn có thể dùng dấu ngoặc để làm rõ ý định.

```csharp
int a = 17;
int b = 5;
Console.WriteLine(a / b);        // 3: chia số nguyên
Console.WriteLine(a % b);        // 2: phần dư
Console.WriteLine((double)a / b); // 3.4: chia số thực
Console.WriteLine(2 + 3 * 4);    // 14
Console.WriteLine((2 + 3) * 4);  // 20
```

Toán tử so sánh: `==`, `!=`, `>`, `<`, `>=`, `<=`. Toán tử logic: `&&` (và), `||` (hoặc), `!` (phủ định). Hai toán tử `&&` và `||` dùng cơ chế đánh giá ngắn mạch.

```csharp
int score = 8;
bool attended = true;
bool qualified = score >= 5 && attended;
Console.WriteLine(qualified); // True
```

## 4. Ép kiểu và sai sót thường gặp

Phép gán từ `int` sang `double` thường là chuyển đổi ngầm định. Từ `double` về `int` có thể mất phần thập phân nên thường phải chuyển đổi tường minh. Không nên dùng ép kiểu để che giấu lỗi thiết kế.

```csharp
double temperature = 36.8;
int wholePart = (int)temperature;
Console.WriteLine(wholePart); // 36
```

Các lỗi thường gặp: nhầm `=` với `==`, dùng `/` giữa hai số nguyên khi cần số thực, quên hậu tố `m` của `decimal`, dùng biến trước khi gán giá trị hợp lệ, hoặc nhầm dấu phẩy/dấu chấm khi làm việc với định dạng số.

## 5. Ví dụ tổng hợp — tính diện tích hình tròn

```csharp
double radius = 2.5;
const double Pi = Math.PI;
double area = Pi * radius * radius;
Console.WriteLine($"Diện tích: {area:F2}");
// Diện tích: 19.63
```

**Tự suy nghĩ:** Nếu bán kính là số âm, công thức vẫn cho diện tích dương. Chương sau sẽ giúp ta thêm điều kiện để từ chối dữ liệu không hợp lệ.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/built-in-types
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/arithmetic-operators

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
