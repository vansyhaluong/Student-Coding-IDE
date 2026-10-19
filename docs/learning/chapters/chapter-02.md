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

## 6. Miền giá trị, biểu diễn và tràn số nguyên

Kiểu dữ liệu vừa quy định những phép toán có thể dùng, vừa giới hạn những giá trị có thể biểu diễn. `int` có miền từ -2.147.483.648 đến 2.147.483.647; `long` có miền lớn hơn nhưng vẫn hữu hạn. Phải xét cả **kết quả trung gian**: hai số đầu vào vừa `int` không bảo đảm tích của chúng cũng vừa `int`.

Muốn nhân hai số nguyên lớn bằng `long`, hãy chuyển ít nhất một toán hạng trước phép nhân, chẳng hạn `(long)a * b`. Nếu nhân bằng `int` rồi mới gán sang `long`, lỗi tràn có thể đã xảy ra. `checked` yêu cầu báo ngoại lệ khi phép toán nguyên thuộc phạm vi kiểm tra bị tràn; `unchecked` dùng hành vi không kiểm tra tràn cho các phép nguyên tương ứng. Không dùng kết quả đã cuộn vòng như thể đó là tổng toán học.

```csharp
int value = int.MaxValue;
bool overflowDetected = false;
try
{
    int next = checked(value + 1);
    Console.WriteLine(next);
}
catch (OverflowException)
{
    overflowDetected = true;
}
long safeNext = (long)value + 1;
Console.WriteLine($"{overflowDetected}; {safeNext}");
```

**Kết quả:** `True; 2147483648`.

Khối `try/catch` ở đây chỉ giúp quan sát lỗi tràn có chủ đích; các ví dụ thông thường nên chọn kiểu phù hợp ngay từ đầu. Không suy ra rằng `checked` sẽ kiểm tra mọi phép toán bên trong một hàm được gọi: ngữ cảnh kiểm tra gắn với phần code chứa phép toán.

## 7. Chia nguyên, phần dư và chuyển đổi số

Chia hai số nguyên bỏ phần lẻ theo hướng về 0. Vì vậy `-17 / 5` bằng `-3`, không phải `-4`. Phần dư thỏa quan hệ `a = (a / b) * b + a % b` khi phép chia biểu diễn được và `b` khác 0; phần dư khác 0 mang dấu của số bị chia. Đây là điểm cần chú ý khi dùng `%` để suy luận về chỉ số vòng.

```csharp
int a = -17;
int b = 5;
int quotient = a / b;
int remainder = a % b;
Console.WriteLine($"{quotient}; {remainder}; {quotient * b + remainder}");
```

**Kết quả:** `-3; -2; -17`.

Ép `(int)3.9` cho 3, không phải phép làm tròn gần nhất. Nếu muốn làm tròn, chọn rõ API và quy tắc, ví dụ `Math.Round` với chế độ xử lý trường hợp đúng nửa. Chuyển từ số thực quá lớn sang số nguyên cần kiểm tra miền; không coi ép kiểu là một cách xác thực dữ liệu.

**Lỗi thường gặp:** Dùng `n % 2 == 1` để nhận biết mọi số lẻ, trong khi số lẻ âm có thể có phần dư -1. Kiểm tra `n % 2 != 0` phù hợp cho cả hai dấu.

## 8. Gán kết hợp, tăng giảm và thứ tự đánh giá

`x += y` có ý nghĩa cập nhật `x` dựa trên tổng hiện tại; với biến số đơn giản, nó giúp diễn tả ý định tích lũy. Toán tử `++` tăng 1: tiền tố `++x` trả giá trị sau tăng, hậu tố `x++` trả giá trị trước tăng. Hai dạng cho cùng giá trị cuối của `x` nếu đứng một mình, nhưng khác nhau khi nằm trong biểu thức.

```csharp
int x = 4;
int oldValue = x++;
int newValue = ++x;
Console.WriteLine($"{oldValue}; {newValue}; {x}");
```

**Kết quả:** `4; 6; 6`.

**Phân tích:** `oldValue` nhận 4 rồi `x` thành 5; bước kế tăng `x` thành 6 rồi gán 6 cho `newValue`. Dù có thể viết nhiều tăng giảm trong một biểu thức, cách đó làm việc đọc vết khó hơn. Trong giáo trình, ưu tiên mỗi câu lệnh có một thay đổi rõ ràng.

Phân biệt độ ưu tiên với thứ tự thực hiện tác dụng phụ: ngoặc làm rõ phép tính nào nhóm với nhau, không phải lý do để viết một biểu thức có quá nhiều lần sửa cùng biến. Khi chưa chắc, tách thành các biến trung gian có tên.

## 9. Chuyển chuỗi thành số và xác thực dữ liệu

Dữ liệu nhập vào thường có dạng chuỗi. `Parse` có thể phát sinh ngoại lệ nếu nội dung không chuyển được; `TryParse` trả về `bool` cho biết thành công và đưa giá trị qua tham số `out`. Chuyển đổi thành công chỉ xác nhận **đúng định dạng và miền của kiểu**, chưa xác nhận đúng miền của bài toán.

```csharp
string raw = " -3 ";
bool parsed = int.TryParse(raw, out int quantity);
bool validQuantity = parsed && quantity >= 0;
Console.WriteLine($"Đọc được: {parsed}; số lượng hợp lệ: {validQuantity}");
```

**Kết quả:** `Đọc được: True; số lượng hợp lệ: False`.

**Phân tích:** Chuỗi có thể chuyển thành số -3 nhưng số lượng mua hàng không được âm. Các bước đọc, chuyển kiểu và kiểm tra nghiệp vụ nên được phân biệt. Không sử dụng giá trị `out` như một kết quả hợp lệ khi `TryParse` trả `false`.

Trong chương trình tương tác, `Console.ReadLine()` có thể trả `null` khi hết đầu vào. Không giả định mọi lần đọc đều có chuỗi. Các ví dụ ở đây dùng chuỗi cố định để kết quả có thể lặp lại mà không cần người dùng nhập tay.

## 10. `null`, giá trị mặc định và trạng thái chưa có dữ liệu

`0`, chuỗi rỗng `""` và `null` là các trạng thái khác nhau. Mảng `int` mới tạo có các phần tử mặc định bằng 0; biến cục bộ phải được gán trước khi đọc. Với kiểu giá trị, thêm `?`, chẳng hạn `int?`, cho phép biểu diễn trạng thái không có giá trị. Toán tử `??` cung cấp phương án thay thế khi vế trái là `null`.

```csharp
int? absentScore = null;
int? zeroScore = 0;
int displayed = absentScore ?? -1;
Console.WriteLine($"{absentScore.HasValue}; {zeroScore.HasValue}; {displayed}");
```

**Kết quả:** `False; True; -1`.

Giá trị -1 chỉ là quy ước hiển thị của ví dụ, không được âm thầm coi là điểm thực. Với `string?`, cần kiểm tra trước khi truy cập `.Length`; toán tử `!` để bỏ cảnh báo nullable không tạo ra đối tượng và không ngăn ngoại lệ. Chọn cách biểu diễn “chưa có” trong hợp đồng dữ liệu trước khi tính toán.

## 11. Sai số số thực và lựa chọn `decimal`

`double` biểu diễn gần đúng nhiều phân số thập phân vì lưu theo hệ nhị phân. `decimal` biểu diễn được nhiều số thập phân thông dụng chính xác hơn, phù hợp với các phép tính tiền cần quy tắc thập phân. Nó vẫn có giới hạn miền, độ chính xác và vẫn cần quy tắc làm tròn khi chia.

```csharp
double binarySum = 0.1 + 0.2;
decimal decimalSum = 0.1m + 0.2m;
Console.WriteLine($"{binarySum == 0.3}; {decimalSum == 0.3m}");
```

**Kết quả:** `False; True`.

Với số đo dùng `double`, đôi khi cần so sánh sai lệch theo một ngưỡng tuyệt đối hoặc tương đối phù hợp với miền dữ liệu; không dùng một hằng “epsilon” bất kỳ cho mọi bài toán. Với chỉ số, số lượng và đếm phần tử, ưu tiên số nguyên vì bài toán vốn rời rạc.

## 12. Định dạng đầu ra và ảnh hưởng của văn hóa

Định dạng là cách biến một giá trị thành văn bản; nó không nhất thiết làm thay đổi giá trị đang lưu. `F2` yêu cầu hai chữ số sau dấu thập phân trong chuỗi kết quả. Dấu phân cách thập phân phụ thuộc `CultureInfo`; vì vậy định dạng cho người dùng địa phương và định dạng dữ liệu để kiểm chứng có thể có yêu cầu khác nhau.

```csharp
double value = 7.0 / 3;
string formatted = value.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
Console.WriteLine($"{formatted}; {value > 2.33}");
```

**Kết quả:** `2.33; True`.

Giá trị gốc vẫn lớn hơn 2,33 dù bản hiển thị chỉ có hai chữ số. Không chuyển số thành chuỗi rồi chuyển ngược liên tục chỉ để tính toán. Khi đọc số thực từ chuỗi, chọn `TryParse` cùng `NumberStyles` và văn hóa nếu định dạng đầu vào được quy định; không thay mọi dấu phẩy thành dấu chấm mà chưa hiểu dấu phân nhóm.

## 13. Bài toán tổng hợp — chia tiền và kiểm tra điều kiện tính

Xét một nhóm mua hàng với đơn giá thập phân, số lượng nguyên và chia đều cho một số người dương. Chọn `decimal` cho tổng tiền, kiểm tra số người trước phép chia và phân biệt số tiền chính xác với số tiền hiển thị đã làm tròn.

```csharp
decimal unitPrice = 12500.50m;
int quantity = 4;
int people = 3;
decimal total = unitPrice * quantity;
decimal perPerson = total / people;
Console.WriteLine($"Tổng {total.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)}; mỗi người {perPerson.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)}");
```

**Kết quả:** `Tổng 50002.00; mỗi người 16667.33`.

**Phân tích:** Bốn món có tổng 50.002. Chia ba người tạo phần lẻ; làm tròn từng khoản có thể khiến tổng các khoản hiển thị khác tổng ban đầu. Nếu cần phân bổ chính xác đến đơn vị tiền nhỏ nhất, đề phải quy định ai nhận phần dư. Không tự xem chuỗi định dạng là một thuật toán phân chia tiền.

**Tự kiểm tra:** Nếu `quantity = 0` kết quả ra sao? Nếu `people = 0`, phép tính nào không hợp lệ? Đặt phép ép kiểu ở đâu khi cần nhân hai `int` lớn? Các câu hỏi này buộc người học kết nối kiểu dữ liệu với điều kiện sử dụng, thay vì chỉ nhớ bảng kiểu.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/built-in-types
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/arithmetic-operators
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/integral-numeric-types
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/floating-point-numeric-types
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/numeric-conversions
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/checked-and-unchecked
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/standard/base-types/parsing-numeric
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-value-types
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/nullable-references
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/standard/base-types/standard-numeric-format-strings
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/declarations
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.math.round?view=net-10.0

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
