# Chương 4 — Cấu trúc lặp

> **Mục tiêu:** Sử dụng `for`, `while`, `do-while` và `foreach`; biết thiết kế điều kiện dừng và xử lý các vòng lặp lồng nhau.

## 1. Khi nào cần vòng lặp?

Nếu phải thực hiện cùng một thao tác nhiều lần, việc chép lại câu lệnh khiến code dài và khó thay đổi. Vòng lặp giúp mô tả thao tác lặp một cách rõ ràng: bắt đầu ở đâu, tiếp tục khi nào và cập nhật ra sao.

## 2. Vòng lặp `for`

`for` thường phù hợp khi biết trước cách đếm số lần lặp. Cấu trúc gồm phần khởi tạo, điều kiện tiếp tục và bước cập nhật.

```csharp
int sum = 0;
for (int i = 1; i <= 5; i++)
{
    sum += i;
}
Console.WriteLine(sum); // 15
```

Dãy `i = 1, 2, 3, 4, 5` được cộng vào `sum`. Nếu muốn duyệt chỉ số của mảng độ dài `n`, thông thường dùng `i = 0; i < n; i++` để tránh vượt phạm vi.

## 3. `while` và `do-while`

`while` kiểm tra điều kiện **trước mỗi lần lặp**, nên có thể không chạy lần nào. `do-while` thực hiện thân vòng lặp **ít nhất một lần** rồi mới kiểm tra điều kiện.

```csharp
int n = 40;
int digits = 0;
while (n > 0)
{
    digits++;
    n /= 10;
}
Console.WriteLine(digits); // 2
```

```csharp
int attempt = 0;
do
{
    attempt++;
    Console.WriteLine($"Lượt {attempt}");
} while (attempt < 3);
// In Lượt 1, Lượt 2, Lượt 3
```

Với bài đếm chữ số, nếu đề cho `n = 0`, cần xét đặc biệt để kết quả là một chữ số. Đây là ví dụ điển hình về trường hợp biên.

## 4. `break`, `continue` và `foreach`

`break` thoát ngay khỏi vòng lặp hiện tại. `continue` bỏ qua phần còn lại của lần lặp đang thực hiện. `foreach` giúp đọc từng phần tử của một tập hợp mà không cần quản lý chỉ số bằng tay.

```csharp
int[] numbers = { 3, -2, 5, 0, 8 };
foreach (int value in numbers)
{
    if (value < 0) continue; // Bỏ qua số âm
    if (value == 0) break;   // Dừng khi gặp 0
    Console.WriteLine(value);
}
// In 3 và 5
```

## 5. Vòng lặp lồng nhau

Vòng lặp bên trong được thực hiện trọn vẹn theo từng lượt của vòng lặp bên ngoài. Đây là cấu trúc thường gặp khi làm việc với dữ liệu theo hàng/cột.

```csharp
for (int row = 1; row <= 3; row++)
{
    for (int col = 1; col <= row; col++)
    {
        Console.Write("* ");
    }
    Console.WriteLine();
}
// *
// * *
// * * *
```

## 6. Ví dụ tổng hợp — tìm ước của một số

```csharp
int n = 18;
for (int i = 1; i <= n; i++)
{
    if (n % i == 0)
    {
        Console.Write($"{i} ");
    }
}
// 1 2 3 6 9 18
```

**Lỗi cần tránh:** Quên cập nhật biến đếm có thể gây vòng lặp vô hạn; dùng `<= array.Length` khi truy cập mảng sẽ vượt chỉ số cuối; `break` trong vòng lặp lồng nhau chỉ thoát vòng lặp chứa nó.

## 7. Bốn thời điểm cần đọc trong một vòng `for`

Vòng `for` gồm: khởi tạo một lần; kiểm tra điều kiện; chạy thân nếu đúng; chạy cập nhật; rồi quay lại kiểm tra. Điều kiện là **điều kiện tiếp tục**, không phải điều kiện thoát. Biến được khai báo ở phần khởi tạo chỉ có phạm vi trong vòng lặp tương ứng.

```csharp
int sum = 0;
string trace = "";
for (int i = 1; i <= 3; i++)
{
    sum += i;
    trace += $"[{i}:{sum}]";
}
Console.WriteLine(trace);
```

**Kết quả:** `[1:1][2:3][3:6]`.

Sau ba lượt, bước cập nhật làm `i` thành 4; điều kiện sai nên không có lượt thứ tư. Nếu ngay từ đầu điều kiện sai, thân không chạy. Với dãy chỉ số từ 0 đến `n - 1`, cận `< n` thường rõ ràng hơn `<= n - 1`, nhất là khi cần xét `n = 0`.

**Lỗi thường gặp:** Dấu `;` ngay sau `for (...)` tạo thân rỗng; một khối phía sau có thể không còn thuộc vòng lặp. Ngoặc nhọn không chỉ để trang trí mà thể hiện nhóm lệnh cần lặp.

## 8. Mẫu đếm, tích lũy và theo dõi trạng thái

Biến đếm tăng theo **số lần** xảy ra một sự kiện; biến tổng tích lũy **giá trị**. Chọn giá trị khởi tạo theo phép toán: tổng thường bắt đầu bằng 0, tích bắt đầu bằng 1. Với giá trị lớn nhất/nhỏ nhất, không khởi tạo tùy ý bằng 0 nếu dữ liệu có thể toàn âm hoặc toàn dương.

```csharp
int[] values = { -3, 8, 0, 6, -1 };
int positiveCount = 0;
int positiveSum = 0;
foreach (int value in values)
{
    if (value > 0)
    {
        positiveCount++;
        positiveSum += value;
    }
}
Console.WriteLine($"{positiveCount}; {positiveSum}");
```

**Kết quả:** `2; 14`.

Chỉ 8 và 6 làm thay đổi hai biến; số 0 không là số dương. Đặt biến tổng bên trong thân sẽ khởi tạo lại ở mỗi lượt và làm mất kết quả cũ. Nếu tổng có thể lớn hơn miền `int`, chọn `long` cho biến tích lũy ngay từ đầu.

## 9. Xử lý chữ số với `do-while`

Lấy chữ số cuối bằng `% 10`, bỏ chữ số cuối bằng `/ 10`. Với số 0, biểu diễn vẫn có một chữ số nên `do-while` giúp thân chạy ít nhất một lần. Khi cần giữ đầu vào gốc, dùng một biến làm việc thay vì chia trực tiếp biến còn phải dùng sau đó.

```csharp
int original = 0;
int remaining = original;
int digitCount = 0;
int digitSum = 0;
do
{
    digitSum += remaining % 10;
    digitCount++;
    remaining /= 10;
} while (remaining > 0);
Console.WriteLine($"{original}; {digitCount}; {digitSum}");
```

**Kết quả:** `0; 1; 0`.

Ví dụ giả định đầu vào không âm. Nếu muốn hỗ trợ toàn miền `int`, cần chú ý `Math.Abs(int.MinValue)` không biểu diễn được bằng `int`; có thể chuyển sang `long` trước khi lấy trị tuyệt đối. Không thêm xử lý dấu bằng cách thử tùy tiện nếu hợp đồng chưa nêu rõ số âm có được chấp nhận hay không.

## 10. Thuật toán Euclid và đại lượng giảm để chứng minh dừng

Với hai số nguyên dương `a`, `b`, thay cặp `(a, b)` bằng `(b, a % b)` không đổi ước chung lớn nhất. Phần dư mới không âm và nhỏ hơn `b`, nên dãy giá trị `b` giảm cho đến 0. Đây là ví dụ của **đại lượng giảm**, giúp giải thích vòng lặp sẽ kết thúc.

```csharp
int a = 84;
int b = 30;
while (b != 0)
{
    int remainder = a % b;
    a = b;
    b = remainder;
}
Console.WriteLine(a);
```

**Kết quả:** `6`.

Bảng vết các cặp lần lượt là `(84,30)`, `(30,24)`, `(24,6)`, `(6,0)`. Cần lưu phần dư trước khi gán lại `a`; nếu cập nhật sai thứ tự, phép tính có thể dùng một giá trị đã thay đổi. Thuật toán này tự xây dựng từ phép chia nguyên, không phải một cú pháp đặc biệt của C#.

## 11. Kiểm tra nguyên tố và cận vòng lặp an toàn

Số nguyên tố lớn hơn 1 và không có ước dương nào ngoài 1 và chính nó. Nếu `n` hợp số, trong một cặp ước luôn có ít nhất một ước không vượt căn bậc hai của `n`. Vì thế không cần thử mọi số đến `n - 1`.

```csharp
int n = 97;
bool prime = n >= 2;
for (int divisor = 2; prime && divisor <= n / divisor; divisor++)
{
    if (n % divisor == 0) prime = false;
}
Console.WriteLine(prime);
```

**Kết quả:** `True`.

Điều kiện `divisor <= n / divisor` tương đương cận căn bậc hai với `n` dương và `divisor` dương, nhưng tránh tính `divisor * divisor` có thể tràn `int`. Khi tìm thấy một ước, biến `prime` thành `false`, điều kiện vòng lặp chặn lượt tiếp theo. Các ca cần thử: 0, 1, 2, một số chính phương như 49 và một số nguyên tố.

## 12. Vòng lặp lồng nhau và phạm vi của `break`

`break` chỉ thoát vòng lặp hoặc `switch` gần nhất bao quanh nó. Muốn dừng cả hai vòng sau khi tìm thấy một ô, có thể dùng cờ ở điều kiện vòng ngoài. Cách khác là tách tìm kiếm thành hàm rồi `return` ngay khi tìm thấy; không dùng `break` như thể nó thoát toàn bộ chương trình.

```csharp
int[,] grid = { { 4, 8, 6 }, { 2, 5, 8 } };
bool found = false;
int foundRow = -1, foundCol = -1;
for (int row = 0; row < grid.GetLength(0) && !found; row++)
{
    for (int col = 0; col < grid.GetLength(1); col++)
    {
        if (grid[row, col] != 8) continue;
        foundRow = row;
        foundCol = col;
        found = true;
        break;
    }
}
Console.WriteLine($"{foundRow}; {foundCol}");
```

**Kết quả:** `0; 1`.

Chương trình lấy vị trí đầu tiên theo thứ tự hàng, không lấy ô có tọa độ lớn nhất hay mọi ô chứa 8. Điều kiện `!found` ở vòng ngoài mới ngăn duyệt hàng sau. Khi dùng `continue` trong `while`, cần chắc chắn bước cập nhật cần thiết không bị bỏ qua, nếu không có thể tạo vòng lặp vô hạn.

## 13. Bất biến vòng lặp và số thao tác

**Bất biến** là một mệnh đề đúng trước lượt đầu và được duy trì qua mỗi lượt. Với tính tổng từ 1 đến `n`, trước lượt có chỉ số `i`, `sum` phải bằng tổng từ 1 đến `i - 1`. Thân cộng `i` khiến mệnh đề đúng cho lượt tiếp theo; khi `i = n + 1`, suy ra đã cộng đủ đến `n`.

```csharp
int n = 5;
int sum = 0;
bool invariantHolds = true;
for (int i = 1; i <= n; i++)
{
    invariantHolds = invariantHolds && sum == (i - 1) * i / 2;
    sum += i;
}
Console.WriteLine($"{sum}; {invariantHolds}");
```

**Kết quả:** `15; True`.

Biểu thức kiểm tra dùng các số nhỏ để không tràn; trong lập luận tổng quát, cần xét kiểu số. Đếm thao tác giúp so sánh thuật toán: một lượt qua `n` phần tử tăng theo `n`; hai vòng độc lập có tổng số lượt; hai vòng lồng đủ `n` lần thường có khoảng `n²` lượt. Không phải cứ có hai vòng trong một hàm là có số lượt `n²`; phải xét cách chúng kết hợp và cận thực tế.

## 14. Xây dựng kết quả theo từng lượt và bộ ca biên

Một ứng dụng khác của tích lũy là dựng bảng nhân. Với dãy có độ dài đã biết, tách việc **tạo dữ liệu kết quả** khỏi việc in từng phần giúp dễ kiểm tra toàn bộ dãy. Chương 7 sẽ giải thích chi tiết cách lưu dãy trong mảng.

```csharp
int factor = 7;
int[] products = new int[5];
for (int i = 0; i < products.Length; i++)
{
    products[i] = factor * (i + 1);
}
Console.WriteLine(string.Join(", ", products));
```

**Kết quả:** `7, 14, 21, 28, 35`.

Chỉ số `i` chạy từ 0, nhưng thừa số cần từ 1 nên dùng `i + 1`. Không thay cận thành `<= products.Length`: lượt cuối đó sẽ truy cập ngoài mảng. Với mọi bài lặp, hãy thử trường hợp 0 lượt, 1 lượt, nhiều lượt và trường hợp dừng sớm. Sau mỗi phép sửa cận, kiểm tra lại cả phần tử đầu lẫn phần tử cuối.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/jump-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/arithmetic-operators
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/declarations
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
