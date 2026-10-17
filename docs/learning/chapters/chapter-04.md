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

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
