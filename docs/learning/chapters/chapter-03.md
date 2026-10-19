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

## 7. Nhánh độc lập và các nhánh loại trừ nhau

Hai câu lệnh `if` độc lập có thể cùng chạy. Trong một chuỗi `if/else if/else`, chỉ một nhánh được chọn. Sự khác nhau nằm ở yêu cầu nghiệp vụ: “ghi nhận mọi điều kiện đúng” khác với “phân vào đúng một nhóm”.

```csharp
int score = 95;
int independentMatches = 0;
if (score >= 50) independentMatches++;
if (score >= 90) independentMatches++;

string category;
if (score >= 90) category = "Xuất sắc";
else if (score >= 50) category = "Đạt";
else category = "Chưa đạt";
Console.WriteLine($"{independentMatches}; {category}");
```

**Kết quả:** `2; Xuất sắc`.

Điểm 95 thỏa cả hai điều kiện đầu, nhưng chỉ nhận một phân loại ở chuỗi sau. Khi phân loại theo ngưỡng, hãy sắp xếp điều kiện để nhánh rộng không che nhánh hẹp. Nếu nhánh đầu đã là `score >= 50`, nhánh `score >= 90` phía sau sẽ không có cơ hội được chọn.

Với `if` lồng nhau, `else` gắn với `if` gần nhất chưa có `else` nếu không có ngoặc để chỉ rõ. Dùng khối `{ }` và thụt lề nhất quán giúp phân biệt “hành động sau khi kiểm tra tuổi” với “hành động sau khi kiểm tra vé”.

## 8. Ngắn mạch và kiểm tra điều kiện bảo vệ

Với `A && B`, nếu `A` sai thì `B` không được đánh giá. Với `A || B`, nếu `A` đúng thì `B` không cần đánh giá. Có thể dùng điều này để bảo vệ một thao tác chỉ hợp lệ sau khi kiểm tra dữ liệu, chẳng hạn chia khi mẫu khác 0 hoặc truy cập chuỗi khi không `null`.

```csharp
int numerator = 12;
int denominator = 0;
bool positiveRatio = denominator != 0 && numerator / denominator > 0;
string? name = null;
bool hasLongName = name != null && name.Length >= 3;
Console.WriteLine($"{positiveRatio}; {hasLongName}");
```

**Kết quả:** `False; False`.

**Phân tích:** Hai vế phải không chạy nên không chia cho 0 và không đọc `.Length` từ `null`. Đảo vị trí hai vế làm mất sự bảo vệ này. Khi dùng với `bool`, `&` và `|` vẫn đánh giá cả hai vế; không tùy ý thay chúng cho `&&` và `||`.

Tác dụng phụ trong điều kiện khiến code khó suy luận. Nếu gọi một hàm để cập nhật trạng thái ở vế phải, ngắn mạch có thể khiến lần cập nhật không xảy ra. Ưu tiên điều kiện chỉ hỏi về dữ liệu, còn thay đổi trạng thái được viết thành câu lệnh rõ ràng.

## 9. Biểu thức `switch` và pattern theo khoảng

`switch` statement chọn một khối lệnh; **switch expression** chọn một giá trị. Mỗi nhánh của biểu thức có dạng `mẫu => giá trị`; `_` là nhánh còn lại. Các nhánh được xét theo thứ tự, nên cần đặt trường hợp đặc biệt trước trường hợp rộng hơn. Dấu `;` sau toàn bộ biểu thức gán vẫn cần thiết.

```csharp
int score = 76;
string rank = score switch
{
    < 0 or > 100 => "Không hợp lệ",
    >= 90 => "Xuất sắc",
    >= 70 => "Khá",
    >= 50 => "Trung bình",
    _ => "Cần cố gắng"
};
Console.WriteLine(rank);
```

**Kết quả:** `Khá`.

`< 0 or > 100` là pattern kết hợp, không phải biểu thức logic đang so sánh một biến mới. Mọi nhánh ở đây trả `string`; trình biên dịch cần xác định được kiểu phù hợp của kết quả. Không bỏ nhánh mặc định khi miền giá trị còn trường hợp chưa được phủ. Với điều kiện có nhiều thao tác hoặc nhiều tác dụng phụ, `if`/`switch` statement thường dễ đọc hơn.

## 10. Toán tử điều kiện và điều kiện bảo vệ đầu hàm

Cú pháp `điều_kiện ? giá_trị_khi_đúng : giá_trị_khi_sai` tạo một giá trị. Chỉ biểu thức ứng với nhánh được chọn mới được đánh giá. Dùng nó cho lựa chọn ngắn; không lồng nhiều toán tử ba ngôi thay cho một bảng quyết định dài.

```csharp
Console.WriteLine(DescribeQuantity(-2));

static string DescribeQuantity(int quantity)
{
    if (quantity < 0) return "Số lượng không hợp lệ";
    return quantity == 0 ? "Hết hàng" : "Còn hàng";
}
```

**Kết quả:** `Số lượng không hợp lệ`.

Hàm được giới thiệu để minh họa **guard clause**: xử lý trường hợp không hợp lệ rồi kết thúc sớm bằng `return`. Phần còn lại có thể dựa trên giả định `quantity >= 0`, giảm lồng nhánh. `return` kết thúc lần gọi hàm hiện tại, không chỉ thoát khỏi khối `if`; Chương 6 sẽ phân tích kỹ hơn chữ ký và giá trị trả về.

## 11. Phân loại tam giác với thứ tự kiểm tra rõ ràng

Ba cạnh dương tạo thành tam giác nếu tổng hai cạnh bất kỳ lớn hơn cạnh còn lại. Cần kiểm tra tính hợp lệ **trước** khi phân loại đều/cân/thường. Nếu chỉ thấy hai cạnh bằng nhau rồi kết luận tam giác cân, có thể nhận nhầm bộ `2, 2, 5`.

```csharp
int a = 5, b = 5, c = 8;
string kind;
if (a <= 0 || b <= 0 || c <= 0 || (long)a + b <= c || (long)a + c <= b || (long)b + c <= a)
    kind = "Không là tam giác";
else if (a == b && b == c)
    kind = "Tam giác đều";
else if (a == b || a == c || b == c)
    kind = "Tam giác cân";
else
    kind = "Tam giác thường";
Console.WriteLine(kind);
```

**Kết quả:** `Tam giác cân`.

**Phân tích:** Điều kiện không hợp lệ dùng `||` vì chỉ một lỗi cũng đủ từ chối. Điều kiện đều dùng `&&` vì cả ba cạnh phải bằng nhau. Nhánh cân đặt sau nhánh đều để mỗi bộ cạnh chỉ nhận một nhãn. Chuyển sang `long` trước khi cộng tránh tràn trong phép cộng hai `int` lớn.

**Kiểm tra biên:** Thử cạnh bằng 0, bộ có tổng hai cạnh bằng cạnh thứ ba, ba cạnh bằng nhau, hoặc hoán đổi thứ tự ba cạnh. Kết luận phải nhất quán khi đổi thứ tự nhập.

## 12. Bài toán tính giá theo từng bậc

Phân biệt **giá theo bậc lũy tiến** với “lấy đơn giá của bậc cuối nhân toàn bộ số lượng”. Giả sử 50 đơn vị đầu giá 2, 50 đơn vị tiếp theo giá 3 và phần vượt 100 giá 5. Mỗi nhánh cần cộng cả tiền của những bậc đã sử dụng hết.

```csharp
int units = 120;
int cost;
if (units <= 50)
    cost = units * 2;
else if (units <= 100)
    cost = 50 * 2 + (units - 50) * 3;
else
    cost = 50 * 2 + 50 * 3 + (units - 100) * 5;
Console.WriteLine(cost);
```

**Kết quả:** `350`.

**Phân tích:** 50 đơn vị đầu tốn 100, 50 tiếp theo tốn 150 và 20 còn lại tốn 100. Ví dụ giả định `0 <= units <= 100000`, do đó phép tính không vượt `int`; nếu đầu vào ngoài miền, phải kiểm tra trước. Nhánh `else if` đã ngầm biết `units > 50`, không cần lặp lại điều kiện đó.

## 13. Bảng quyết định, phủ nhánh và kiểm tra ngưỡng

Trước khi viết chuỗi điều kiện, lập bảng gồm miền dữ liệu và kết quả. Với quy tắc điểm từ 0 đến 10, đạt khi từ 5 trở lên, các trường hợp quan trọng là -1, 0, 4, 5, 10, 11. “Đã chạy qua mỗi nhánh” hữu ích nhưng chưa bảo đảm không sai ở đầu mút khoảng.

```csharp
int[] testScores = { -1, 0, 4, 5, 10, 11 };
string[] results = new string[testScores.Length];
for (int i = 0; i < testScores.Length; i++)
{
    int score = testScores[i];
    results[i] = score < 0 || score > 10 ? "Lỗi" : score >= 5 ? "Đạt" : "Chưa đạt";
}
Console.WriteLine(string.Join(" | ", results));
```

**Kết quả:** `Lỗi | Chưa đạt | Chưa đạt | Đạt | Đạt | Lỗi`.

Mảng và vòng lặp ở đây chỉ gom kết quả của nhiều đầu vào; các chương sau sẽ giải thích chi tiết. Khi viết chương trình thực tế, có thể tách biểu thức phân loại thành hàm để tránh toán tử ba ngôi lồng nhau. Kiểm tra đặc biệt sự khác biệt giữa `>` và `>=`, và giữa “cả hai điều kiện” với “ít nhất một điều kiện”.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/selection-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/boolean-logical-operators
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/switch-expression
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/conditional-operator
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/patterns
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/jump-statements

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
