# Chương 7 — Kỹ thuật xử lý mảng một chiều

> **Mục tiêu:** Khai báo và duyệt mảng một chiều, tính tổng/trung bình, tìm min/max, đếm theo điều kiện và xử lý trường hợp mảng rỗng.

## 1. Mảng một chiều là gì?

Mảng lưu một số phần tử cùng kiểu. Trong C#, `int[]` biểu diễn mảng số nguyên. Độ dài được đọc qua `Length`; chỉ số bắt đầu từ `0` và chỉ số cuối là `Length - 1`.

```csharp
int[] scores = { 6, 8, 9, 7 };
Console.WriteLine(scores.Length); // 4
Console.WriteLine(scores[0]);     // 6
scores[1] = 10;
Console.WriteLine(scores[1]);     // 10
```

Mảng có độ dài cố định sau khi tạo. Nếu cần tập hợp dễ thêm/bớt phần tử, C# có các cấu trúc khác như `List<T>` nhưng không phải trọng tâm chương này.

## 2. Duyệt mảng và tính tổng

Dùng `for` khi cần vị trí phần tử, `foreach` khi chỉ cần đọc lần lượt giá trị.

```csharp
int[] numbers = { 2, 4, 6, 8 };
int total = 0;
foreach (int value in numbers)
{
    total += value;
}
Console.WriteLine(total); // 20
```

Tính trung bình đòi hỏi tránh chia cho 0 nếu mảng rỗng và tránh chia nguyên khi cần kết quả thập phân.

```csharp
int[] numbers = { 2, 3, 8 };
if (numbers.Length == 0)
{
    Console.WriteLine("Không có dữ liệu");
}
else
{
    int sum = 0;
    foreach (int n in numbers) sum += n;
    Console.WriteLine((double)sum / numbers.Length); // 4.333...
}
```

## 3. Tìm giá trị lớn nhất / nhỏ nhất

Một chiến lược cơ bản là dùng phần tử đầu tiên làm giá trị tạm, sau đó duyệt những phần tử còn lại. Phải kiểm tra mảng không rỗng trước khi truy cập `[0]`.

```csharp
int[] values = { -4, 12, 7, 12, 0 };
int max = values[0];
for (int i = 1; i < values.Length; i++)
{
    if (values[i] > max) max = values[i];
}
Console.WriteLine(max); // 12
```

## 4. Đếm và lọc theo điều kiện

Một bài toán phổ biến là đếm số phần tử chẵn, âm hoặc lớn hơn một ngưỡng. Mỗi lần gặp phần tử phù hợp, tăng biến đếm.

```csharp
int[] numbers = { -3, -2, 0, 7, 10 };
int countEven = 0;
foreach (int x in numbers)
{
    if (x % 2 == 0) countEven++;
}
Console.WriteLine(countEven); // 3: -2, 0, 10
```

## 5. Tìm kiếm tuyến tính

Nếu mảng chưa sắp xếp, có thể kiểm tra từng phần tử từ trái sang phải. Khi tìm thấy, lưu chỉ số và dừng vòng lặp.

```csharp
int[] values = { 4, 9, 2, 9 };
int target = 9;
int index = -1;
for (int i = 0; i < values.Length; i++)
{
    if (values[i] == target)
    {
        index = i;
        break;
    }
}
Console.WriteLine(index); // 1
```

## 6. Ví dụ — đảo vị trí các phần tử

```csharp
int[] data = { 1, 2, 3, 4, 5 };
for (int left = 0, right = data.Length - 1; left < right; left++, right--)
{
    (data[left], data[right]) = (data[right], data[left]);
}
Console.WriteLine(string.Join(", ", data)); // 5, 4, 3, 2, 1
```

**Lưu ý:** Tránh vượt chỉ số, kiểm tra mảng rỗng và quyết định thuật toán có được phép sửa trực tiếp dữ liệu đầu vào hay cần tạo mảng kết quả mới.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
