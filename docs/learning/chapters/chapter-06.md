# Chương 6 — Hàm

> **Mục tiêu:** Tự viết và gọi hàm, phân biệt tham số với đối số, hiểu giá trị trả về, phạm vi biến và lợi ích của việc chia nhỏ thuật toán.

## 1. Vì sao dùng hàm?

Hàm (trong C# thường gọi là **method**) là một nhóm lệnh có tên, thực hiện một nhiệm vụ xác định. Tách chương trình thành nhiều hàm giúp tránh trùng code, dễ đọc và thuận tiện kiểm thử riêng từng phần.

```csharp
int result = Add(12, 8);
Console.WriteLine(result); // 20

static int Add(int a, int b)
{
    return a + b;
}
```

Đây là một **local function** dưới top-level statements. `a` và `b` là tham số; `12` và `8` là các đối số truyền vào khi gọi. Từ khóa `return` trả kết quả về vị trí gọi hàm.

## 2. Tham số và giá trị trả về

Một hàm có thể không có tham số, có một hay nhiều tham số. Kiểu trả về `void` nghĩa là không trả lại giá trị. Với hàm dùng để tính toán, nên trả về kết quả để phần gọi quyết định cách hiển thị.

```csharp
double average = Average(7, 8, 9);
Console.WriteLine($"{average:F2}"); // 8.00

static double Average(double a, double b, double c)
{
    return (a + b + c) / 3;
}
```

## 3. Phạm vi biến và tính dễ kiểm thử

Biến cục bộ chỉ tồn tại trong phạm vi cho phép. Một hàm tính toán nên tránh phụ thuộc không cần thiết vào trạng thái bên ngoài. Nhờ vậy, cùng một đầu vào sẽ dễ dàng cho cùng một đầu ra, thuận lợi cho việc kiểm tra tự động ở phần Luyện tập sau này.

```csharp
Console.WriteLine(IsEven(10)); // True
Console.WriteLine(IsEven(7));  // False

static bool IsEven(int value)
{
    return value % 2 == 0;
}
```

## 4. Chia bài toán thành nhiều hàm nhỏ

Ví dụ: nhận một điểm số và trả về nhận xét. Ta có thể tách kiểm tra dữ liệu và xác định kết quả thay vì viết mọi điều kiện trong cùng một khối lớn.

```csharp
Console.WriteLine(DescribeScore(8.5)); // Đạt
Console.WriteLine(DescribeScore(-1));  // Không hợp lệ

static string DescribeScore(double score)
{
    if (score < 0 || score > 10) return "Không hợp lệ";
    return score >= 5 ? "Đạt" : "Chưa đạt";
}
```

Trong thực tế, với bài tập phức tạp, có thể phân tách tiếp thành hàm kiểm tra điều kiện, hàm tính toán và hàm định dạng kết quả.

## 5. Tham trị và lưu ý với kiểu tham chiếu

Theo mặc định, đối số được truyền **theo giá trị**. Đối với kiểu giá trị như `int`, hàm nhận một bản sao giá trị. Đối với đối tượng như mảng, bản sao của **tham chiếu** được truyền; nếu sửa phần tử của mảng trong hàm, bên gọi có thể quan sát thấy thay đổi. Khái niệm này rất quan trọng khi giải bài tập hàm có tham số mảng.

```csharp
int number = 5;
Increase(number);
Console.WriteLine(number); // 5

static void Increase(int value)
{
    value++;
}
```

## 6. Lỗi cần tránh

- Nhầm kiểu trả về với kiểu tham số.
- Thiếu `return` trên một nhánh của hàm cần trả giá trị.
- Đặt tên hàm không diễn tả hành động (ví dụ `DoIt`).
- Dùng quá nhiều tham số không liên quan.
- Làm thay đổi dữ liệu đầu vào ngoài ý định.

**Liên hệ với luyện tập:** Mô hình giải bài kiểu LeetCode sẽ cung cấp sẵn chữ ký hàm; sinh viên chỉ cần viết phần xử lý. Chương này chuẩn bị kiến thức cho cách làm đó, chưa triển khai Judge hay Submit.

## 7. Chữ ký hàm, hợp đồng và `void`

Khi thiết kế một hàm, nêu tên, tham số/kiểu dữ liệu, kiểu trả về, tiền điều kiện và tác dụng phụ. Trong khai báo method, `public` là mức truy cập; `static` cho phép gọi qua kiểu thay vì một đối tượng. Local function trong một hàm khác có quy tắc phạm vi riêng, không gắn thêm `public` như method của lớp.

`return biểu_thức;` kết thúc lần gọi và trả giá trị phù hợp kiểu đã khai báo. Với `void`, có thể dùng `return;` để kết thúc sớm, không có giá trị trả về. Một hàm tính toán thường nên trả dữ liệu để người gọi lựa chọn cách sử dụng thay vì tự in ra.

```csharp
int doubled = DoubleValue(9);
PrintLabel("Kết quả", doubled);

static int DoubleValue(int value)
{
    return value * 2;
}

static void PrintLabel(string label, int value)
{
    Console.WriteLine($"{label}: {value}");
}
```

**Kết quả:** `Kết quả: 18`.

**Phân tích:** `DoubleValue` độc lập với Console; `PrintLabel` có tác dụng phụ hiển thị. Hàm đầu có thể kiểm tra bằng cách so sánh số trả về. Nếu một nhánh của hàm trả `int` đi tới cuối mà không `return` hoặc không kết thúc bằng cách khác hợp lệ, trình biên dịch sẽ báo lỗi.

## 8. Tham trị, `ref`, `out` và thay đổi mảng

Mặc định, hàm nhận bản sao giá trị đối số. Với `int`, sửa bản sao không sửa biến gọi; với mảng, bản sao là một tham chiếu đến cùng mảng. Thay phần tử qua tham chiếu đó được bên gọi quan sát; gán biến tham số sang một mảng mới thì không tự đổi tham chiếu đang giữ ở bên gọi.

```csharp
int[] data = { 2, 4 };
Change(data);
Console.WriteLine(string.Join(", ", data));

static void Change(int[] values)
{
    values[0] = 9;
    values = new[] { 100, 200 };
}
```

**Kết quả:** `9, 4`.

`ref` truyền tham chiếu đến biến của bên gọi; biến phải được gán trước khi truyền. `out` cũng cho hàm ghi vào biến bên gọi nhưng không yêu cầu đã có giá trị đầu vào; hàm phải gán trước khi kết thúc bình thường. Hai từ khóa cần xuất hiện ở nơi khai báo và ở lời gọi tương ứng.

```csharp
int left = 3, right = 8;
Swap(ref left, ref right);
bool divided = TryDivide(17, 0, out int quotient);
Console.WriteLine($"{left}; {right}; {divided}; {quotient}");

static void Swap(ref int a, ref int b)
{
    int temporary = a;
    a = b;
    b = temporary;
}

static bool TryDivide(int a, int b, out int result)
{
    result = 0;
    if (b == 0) return false;
    result = a / b;
    return true;
}
```

**Kết quả:** `8; 3; False; 0`.

Hợp đồng `TryDivide` trong ví dụ chỉ xét các giá trị nhỏ và từ chối mẫu 0; trong toàn miền `int` còn cần xét trường hợp thương không biểu diễn được. Khi trạng thái trả về là `false`, số 0 ở `result` chỉ là giá trị được khởi tạo, không phải một thương hợp lệ.

## 9. Đối số đặt tên, tham số tùy chọn và `params`

Đối số đặt tên làm rõ ý nghĩa ở chỗ gọi và giảm nhầm thứ tự các tham số cùng kiểu. Tham số tùy chọn có giá trị mặc định được khai báo; vẫn cần biết giá trị đó để hiểu lời gọi. `params int[]` nhận một số lượng đối số nguyên biến đổi hoặc một mảng tương ứng; trong dạng này, tham số `params` đặt cuối danh sách.

```csharp
int total = Sum(3, 5, 7);
string text = FormatScore(score: 8, prefix: "Điểm");
Console.WriteLine($"{total}; {text}");

static int Sum(params int[] values)
{
    int total = 0;
    foreach (int value in values) total += value;
    return total;
}

static string FormatScore(int score, string prefix = "Kết quả")
{
    return $"{prefix}: {score}";
}
```

**Kết quả:** `15; Điểm: 8`.

`Sum()` không có đối số tạo trường hợp dãy rỗng và trả 0 theo cách khởi tạo trên. Không dùng tham số tùy chọn để giấu quá nhiều quy tắc nghiệp vụ. Với `params`, vẫn phải quan tâm số phần tử và tổng có thể tràn, giống một hàm nhận mảng thông thường.

## 10. Nạp chồng method và phân biệt với local function

Nạp chồng cho phép nhiều method cùng tên trong một kiểu nhưng có danh sách kiểu/số lượng tham số khác nhau. Chỉ đổi kiểu trả về không đủ phân biệt hai method. Trình biên dịch lựa chọn overload dựa trên lời gọi và các chuyển đổi áp dụng được; vì thế lựa chọn kiểu đối số có thể ảnh hưởng method được gọi.

```csharp
int integerResult = Arithmetic.Square(4);
double realResult = Arithmetic.Square(2.5);
Console.WriteLine($"{integerResult}; {realResult.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)}");

static class Arithmetic
{
    public static int Square(int value) => value * value;
    public static double Square(double value) => value * value;
}
```

**Kết quả:** `16; 6.25`.

Đây là một **tệp chương trình độc lập**: top-level statements đứng trước phần khai báo lớp. Hai method thuộc `Arithmetic`, không phải hai local function cùng tên trong cùng phạm vi. Không chuyển nguyên cấu trúc nạp chồng này vào một khối local function rồi cho rằng mọi quy tắc đều giống nhau. Ký hiệu `=>` trong các method trên là thân biểu thức ngắn gọn, không làm thay đổi kiểu trả về.

## 11. Local function, biến bị bắt và `static`

Local function nằm trong phạm vi của một hàm hoặc top-level statements. Local function không `static` có thể sử dụng biến của phạm vi bao quanh; điều đó tiện nhưng tạo thêm sự phụ thuộc. Đánh dấu `static` ngăn việc bắt biến cục bộ ngoài hàm, buộc dữ liệu cần thiết được truyền vào tường minh.

```csharp
int limit = 10;
bool fromOuter = IsAboveLimit(12);
bool explicitInput = IsAbove(12, limit);
Console.WriteLine($"{fromOuter}; {explicitInput}");

bool IsAboveLimit(int value) => value > limit;
static bool IsAbove(int value, int threshold) => value > threshold;
```

**Kết quả:** `True; True`.

Nếu thay `limit` rồi gọi lại hàm bắt biến, nó quan sát giá trị hiện tại của biến đó. Với hàm cần dễ kiểm tra và tái sử dụng, đầu vào tường minh thường dễ suy luận hơn. Không đưa trạng thái toàn cục vào chỉ để tránh viết tham số.

## 12. Đệ quy: điều kiện cơ sở và bước thu nhỏ

Hàm đệ quy gọi lại chính nó để giải một bài toán nhỏ hơn. Cần điều kiện cơ sở kết thúc chuỗi gọi và một đại lượng giảm tiến về điều kiện đó. Mỗi lần gọi có bộ tham số/biến cục bộ riêng; kết quả được ghép lại khi các lời gọi trả về.

```csharp
Console.WriteLine(Factorial(5));

static int Factorial(int n)
{
    if (n < 0 || n > 12) throw new ArgumentOutOfRangeException(nameof(n));
    if (n <= 1) return 1;
    return n * Factorial(n - 1);
}
```

**Kết quả:** `120`.

**Phân tích:** Các lời gọi giảm từ 5 đến 1; khi quay về lần lượt tạo 2, 6, 24, 120. Cận 12 bảo đảm giai thừa nằm trong `int`; nó không phải cận toán học của giai thừa. Với dữ liệu sâu, số khung gọi tăng và có thể cạn ngăn xếp; một vòng lặp thường phù hợp hơn cho bài toán tuyến tính đơn giản. Không giả định runtime luôn tối ưu đệ quy đuôi.

## 13. Phân rã thuật toán và hợp đồng không sửa đầu vào

Tách hàm theo một nhiệm vụ có nghĩa, không tách mỗi dòng thành một hàm chỉ để tăng số lượng. Khi nhận mảng, ghi rõ hàm chỉ đọc, sửa tại chỗ hay tạo bản sao. Ví dụ tính tổng số chẵn nên dùng một hàm kiểm tra điều kiện và một hàm tích lũy; không cần sửa dữ liệu nguồn.

```csharp
int[] values = { 2, 5, 8, -4 };
long total = SumEven(values);
Console.WriteLine($"{total}; {string.Join(", ", values)}");

static bool IsEvenValue(int value) => value % 2 == 0;

static long SumEven(int[] values)
{
    long total = 0;
    foreach (int value in values)
        if (IsEvenValue(value)) total += value;
    return total;
}
```

**Kết quả:** `6; 2, 5, 8, -4`.

Tổng là `2 + 8 - 4 = 6`; mảng còn nguyên sau lời gọi. Dùng `long` cho bộ tích lũy không làm thay đổi kiểu phần tử. Vẫn phải quy định đầu vào có được `null` hay không: chữ ký không thay thế toàn bộ hợp đồng khi nhận dữ liệu từ một nguồn không bảo đảm.

## 14. Kiểm tra hàm theo bảng ca và quan hệ giữa đầu vào/đầu ra

Một hàm tính toán có đầu vào tường minh thuận tiện để kiểm tra nhiều ca. Hãy so sánh **giá trị trả về**, không chỉ nhìn dòng in. Ngoài kết quả cụ thể, có thể kiểm tra một tính chất như đổi thứ tự hai đối số không đổi tổng hoặc ước chung lớn nhất.

```csharp
int[] inputs = { 0, 1, 5 };
int[] expected = { 0, 1, 15 };
bool allCorrect = true;
for (int i = 0; i < inputs.Length; i++)
    allCorrect = allCorrect && SumTo(inputs[i]) == expected[i];
Console.WriteLine(allCorrect);

static int SumTo(int n)
{
    int sum = 0;
    for (int i = 1; i <= n; i++) sum += i;
    return sum;
}
```

**Kết quả:** `True`.

Hợp đồng của ví dụ là `0 <= n <= 10000`; không có nhánh xử lý số âm vì chúng nằm ngoài miền đã chọn. Ba ca kiểm tra giúp quan sát mảng rỗng về số lượt, một lượt và nhiều lượt, nhưng không phải chứng minh tổng quát. Khi hàm có tác dụng phụ, cần kiểm tra cả dữ liệu sau lời gọi; với hàm không sửa đầu vào, có thể giữ bản sao để đối chiếu.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/methods
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/methods
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/method-parameters
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/local-functions
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/named-and-optional-arguments
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/program-structure/top-level-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/jump-statements

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
