# Chương 8 — Kỹ thuật xử lý mảng hai chiều

> **Mục tiêu:** Hiểu dữ liệu dạng bảng, duyệt theo hàng/cột, tính tổng, xử lý đường chéo và phân biệt mảng chữ nhật với mảng răng cưa.

## 1. Mảng hai chiều trong C#

Mảng chữ nhật hai chiều khai báo bằng `[,]`. Mỗi phần tử được xác định bởi cặp chỉ số `[hàng, cột]`. Các hàng của mảng chữ nhật có cùng số cột.

```csharp
int[,] matrix =
{
    { 1, 2, 3 },
    { 4, 5, 6 }
};

Console.WriteLine(matrix[0, 1]); // 2
Console.WriteLine(matrix.GetLength(0)); // 2 hàng
Console.WriteLine(matrix.GetLength(1)); // 3 cột
```

`GetLength(0)` cho số hàng, `GetLength(1)` cho số cột. Khác với mảng 1 chiều, `matrix.Length` là **tổng số phần tử ở tất cả chiều**, không phải số hàng.

## 2. Duyệt mảng theo hàng và cột

Hai vòng lặp lồng nhau là cách trực quan để đi qua từng ô của ma trận. Vòng ngoài chọn hàng, vòng trong chọn cột.

```csharp
int[,] matrix = { { 1, 2, 3 }, { 4, 5, 6 } };
for (int row = 0; row < matrix.GetLength(0); row++)
{
    for (int col = 0; col < matrix.GetLength(1); col++)
    {
        Console.Write($"{matrix[row, col]} ");
    }
    Console.WriteLine();
}
// 1 2 3
// 4 5 6
```

## 3. Tính tổng theo hàng và theo cột

Muốn tính tổng hàng thứ `r`, giữ `r` cố định và duyệt `col`. Muốn tính tổng cột `c`, giữ `c` cố định và duyệt `row`.

```csharp
int[,] matrix = { { 1, 2, 3 }, { 4, 5, 6 } };
int rowIndex = 1;
int rowSum = 0;
for (int col = 0; col < matrix.GetLength(1); col++)
{
    rowSum += matrix[rowIndex, col];
}
Console.WriteLine(rowSum); // 15
```

## 4. Đường chéo của ma trận vuông

Với ma trận `n × n`, phần tử đường chéo chính có chỉ số `[i, i]`; đường chéo phụ có chỉ số `[i, n - 1 - i]`. Công thức này chỉ áp dụng trực tiếp cho ma trận vuông.

```csharp
int[,] matrix =
{
    { 1, 2, 3 },
    { 4, 5, 6 },
    { 7, 8, 9 }
};
int n = matrix.GetLength(0);
int mainDiagonal = 0;
int secondaryDiagonal = 0;
for (int i = 0; i < n; i++)
{
    mainDiagonal += matrix[i, i];
    secondaryDiagonal += matrix[i, n - 1 - i];
}
Console.WriteLine(mainDiagonal);      // 15
Console.WriteLine(secondaryDiagonal); // 15
```

Nếu cần tổng của cả hai đường chéo **không đếm trùng ô giữa**, hãy trừ phần tử trung tâm một lần đối với ma trận vuông có bậc lẻ.

## 5. Tìm phần tử lớn nhất trong bảng

```csharp
int[,] values = { { -2, 8 }, { 3, 5 }, { 10, -1 } };
int max = values[0, 0];
for (int row = 0; row < values.GetLength(0); row++)
{
    for (int col = 0; col < values.GetLength(1); col++)
    {
        if (values[row, col] > max) max = values[row, col];
    }
}
Console.WriteLine(max); // 10
```

Trước khi dùng `[0,0]`, cần chắc chắn bảng có ít nhất một hàng và một cột.

## 6. Mảng chữ nhật và mảng răng cưa

C# còn có mảng răng cưa `int[][]`: thực chất là mảng chứa các mảng khác, vì vậy các hàng có thể có độ dài khác nhau. Dùng `int[,]` khi dữ liệu có cấu trúc bảng chữ nhật; dùng `int[][]` khi số phần tử mỗi hàng khác nhau.

```csharp
int[][] uneven =
{
    new[] { 1, 2 },
    new[] { 3, 4, 5 }
};
Console.WriteLine(uneven[1].Length); // 3
```

**Lỗi thường gặp:** Nhầm thứ tự chỉ số hàng/cột, dùng số hàng làm giới hạn vòng cột, và áp dụng công thức đường chéo cho ma trận không vuông.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
