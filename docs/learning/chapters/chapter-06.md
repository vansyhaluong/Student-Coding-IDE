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

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/methods
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/methods

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
