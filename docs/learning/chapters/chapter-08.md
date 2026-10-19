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

## 7. Số chiều, số ô và mảng có chiều bằng không

`Rank` là số chiều; `GetLength(d)` là độ dài của chiều `d`; `Length` là tổng số ô. Với `int[rows, cols]` do ta tạo, chỉ số hàng/cột bắt đầu từ 0. Số chiều của `int[][]` bên ngoài vẫn là 1: từng phần tử là một mảng khác, không phải một mảng chữ nhật có `Rank = 2`.

```csharp
int[,] empty = new int[0, 3];
int[,] table = new int[2, 3];
Console.WriteLine($"{empty.GetLength(0)}; {empty.GetLength(1)}; {empty.Length}; {table.Rank}; {table.Length}");
```

**Kết quả:** `0; 3; 0; 2; 6`.

Mảng không có hàng vẫn có thể ghi nhận độ dài chiều cột bằng 3 nhưng không có ô nào để truy cập. Vì vậy kiểm tra hai độ dài là cần thiết trước khi dùng `[0,0]`. Cấp phát mảng số nguyên làm các ô có giá trị mặc định 0; nó không có nghĩa 0 là một quan sát thực tế đã nhập.

**Lỗi thường gặp:** Dùng `matrix.Length` làm giới hạn hàng; dùng `GetLength(2)` cho mảng hạng 2; hoặc dùng `matrix[row][col]` với kiểu `int[,]`. Cú pháp truy cập phải khớp cách biểu diễn dữ liệu.

## 8. Tổng mọi hàng, tổng mọi cột và bảng kiểm tra

Một lượt duyệt theo hàng có thể đồng thời cộng vào tổng hàng hiện tại và tổng cột tương ứng. Mỗi ô đóng góp đúng một lần cho mỗi nhóm. Tổng của mọi tổng hàng phải bằng tổng của mọi tổng cột; đây là một quan hệ kiểm tra hữu ích.

```csharp
int[,] matrix = { { 2, 4, 1 }, { 3, -1, 5 } };
long[] rowSums = new long[matrix.GetLength(0)];
long[] columnSums = new long[matrix.GetLength(1)];
for (int row = 0; row < matrix.GetLength(0); row++)
    for (int col = 0; col < matrix.GetLength(1); col++)
    {
        rowSums[row] += matrix[row, col];
        columnSums[col] += matrix[row, col];
    }
Console.WriteLine($"Hàng: {string.Join(", ", rowSums)}; cột: {string.Join(", ", columnSums)}");
```

**Kết quả:** `Hàng: 7, 7; cột: 5, 3, 6`.

Hai nhóm đều có tổng 14. Nếu tính trung bình theo hàng, mẫu số là số cột; theo cột, mẫu số là số hàng. Phải xử lý chiều bằng không trước phép chia. Khi tìm hàng có tổng lớn nhất, khởi tạo từ tổng một hàng tồn tại, không mặc định 0 nếu dữ liệu có thể toàn âm.

## 9. Chuyển vị và ánh xạ tọa độ

Chuyển vị biến ma trận `r × c` thành `c × r` theo quy tắc `result[col, row] = source[row, col]`. Đó là đổi vai trò hai tọa độ, không phải đảo thứ tự các hàng. Với ma trận không vuông, kích thước thay đổi nên cần một mảng kết quả phù hợp.

```csharp
int[,] source = { { 1, 2, 3 }, { 4, 5, 6 } };
int[,] transposed = new int[source.GetLength(1), source.GetLength(0)];
for (int row = 0; row < source.GetLength(0); row++)
    for (int col = 0; col < source.GetLength(1); col++)
        transposed[col, row] = source[row, col];
Console.WriteLine($"{transposed.GetLength(0)}x{transposed.GetLength(1)}; {transposed[2, 0]}; {transposed[2, 1]}");
```

**Kết quả:** `3x2; 3; 6`.

Ô `[0,2]` chứa 3 được đưa sang `[2,0]`; ô `[1,2]` chứa 6 sang `[2,1]`. Một phép kiểm tra tốt là chuyển vị hai lần phải trả lại cùng kích thước và giá trị ban đầu. Với ma trận vuông có thể đổi từng cặp đối xứng qua đường chéo chính, nhưng phải tránh đổi mỗi cặp hai lần.

## 10. Cộng và nhân ma trận là hai phép toán khác nhau

Cộng hai ma trận đòi hỏi cùng số hàng và số cột; mỗi ô kết quả là tổng hai ô cùng vị trí. Nhân ma trận `A` kích thước `r × k` với `B` kích thước `k × c` cho `C` kích thước `r × c`, trong đó `C[i,j]` là tổng các tích `A[i,t] * B[t,j]`. Số cột của A phải bằng số hàng của B.

```csharp
int[,] a = { { 1, 2 }, { 3, 4 } };
int[,] b = { { 5, 6 }, { 7, 8 } };
int[,] sum = new int[2, 2];
for (int row = 0; row < 2; row++)
    for (int col = 0; col < 2; col++)
        sum[row, col] = a[row, col] + b[row, col];
Console.WriteLine($"{sum[0, 0]}, {sum[0, 1]}; {sum[1, 0]}, {sum[1, 1]}");
```

**Kết quả:** `6, 8; 10, 12`.

Ví dụ sau có ba vòng lặp vì mỗi ô đầu ra cần một tổng theo chiều chung; nó không phải phép nhân từng cặp ô cùng tọa độ.

```csharp
int[,] a = { { 1, 2, 3 }, { 4, 5, 6 } };
int[,] b = { { 1, 2 }, { 0, 1 }, { 2, 0 } };
long[,] product = new long[a.GetLength(0), b.GetLength(1)];
for (int row = 0; row < a.GetLength(0); row++)
    for (int col = 0; col < b.GetLength(1); col++)
        for (int inner = 0; inner < a.GetLength(1); inner++)
            product[row, col] += (long)a[row, inner] * b[inner, col];
Console.WriteLine($"{product[0, 0]}, {product[0, 1]}; {product[1, 0]}, {product[1, 1]}");
```

**Kết quả:** `7, 4; 16, 13`.

Ô đầu là `1*1 + 2*0 + 3*2 = 7`. Chuyển sang `long` trước phép nhân giúp tích không bị tính bằng `int` trước khi cộng. Hàm tổng quát phải kiểm tra kích thước tương thích và khả năng tràn tổng; hai ví dụ chọn sẵn dữ liệu nhỏ hợp lệ.

## 11. Duyệt ô lân cận và kiểm tra biên

Trong dữ liệu dạng lưới, một ô thường có tối đa bốn hàng xóm theo cạnh. Có thể lưu độ lệch hàng/cột thành các mảng nhỏ và thử từng hướng. Tọa độ mới chỉ được truy cập khi nằm trong cả hai khoảng hợp lệ; kiểm tra hàng đúng chưa đủ để bảo vệ cột.

```csharp
int[,] grid = { { 1, 2, 3 }, { 4, 5, 6 } };
int row = 0, col = 1;
int[] deltaRow = { -1, 1, 0, 0 };
int[] deltaCol = { 0, 0, -1, 1 };
int sum = 0;
for (int direction = 0; direction < 4; direction++)
{
    int nextRow = row + deltaRow[direction];
    int nextCol = col + deltaCol[direction];
    if (nextRow >= 0 && nextRow < grid.GetLength(0) && nextCol >= 0 && nextCol < grid.GetLength(1))
        sum += grid[nextRow, nextCol];
}
Console.WriteLine(sum);
```

**Kết quả:** `9`.

Ô ở `[0,1]` có hàng xóm 5, 1, 3; phía trên ra ngoài bảng. Không cộng chính ô trung tâm. Nếu đề tính cả đường chéo, cần tám hướng; nếu lưới có quy tắc quay vòng, tọa độ ngoài biên có ý nghĩa khác. Không tự áp dụng quy tắc đó khi đề chỉ mô tả bảng hữu hạn.

## 12. Xoay ma trận vuông và tính đúng của ánh xạ

Xoay 90 độ theo chiều kim đồng hồ với ma trận vuông cạnh `n` dùng ánh xạ `(row, col) -> (col, n - 1 - row)`. Dễ kiểm tra bằng bốn góc trước khi áp dụng cho mọi ô. Ví dụ tạo mảng mới để không ghi đè ô nguồn chưa đọc.

```csharp
int[,] source = { { 1, 2 }, { 3, 4 } };
int n = source.GetLength(0);
int[,] rotated = new int[n, n];
for (int row = 0; row < n; row++)
    for (int col = 0; col < n; col++)
        rotated[col, n - 1 - row] = source[row, col];
Console.WriteLine($"{rotated[0, 0]}, {rotated[0, 1]}; {rotated[1, 0]}, {rotated[1, 1]}");
```

**Kết quả:** `3, 1; 4, 2`.

Không dùng trực tiếp kích thước `n × n` cho một ma trận chữ nhật chưa được kiểm tra vuông. Thuật toán xoay tại chỗ cần cách hoán đổi khác, chẳng hạn chuyển vị rồi đảo từng hàng; gán trực tiếp như ví dụ nhưng dùng chung một mảng sẽ phá dữ liệu.

## 13. Duyệt xoắn ốc với bốn đường biên

Giữ `top`, `bottom`, `left`, `right` cho hình chữ nhật chưa đọc. Lần lượt duyệt hàng trên, cột phải, hàng dưới, cột trái rồi thu hẹp. Sau mỗi bước, chiều còn lại có thể đã hết; các kiểm tra bổ sung ngăn đọc lặp khi chỉ còn một hàng hoặc một cột.

```csharp
int[,] grid = { { 1, 2, 3 }, { 4, 5, 6 } };
int top = 0, bottom = grid.GetLength(0) - 1;
int left = 0, right = grid.GetLength(1) - 1;
var order = new System.Collections.Generic.List<int>();
while (top <= bottom && left <= right)
{
    for (int col = left; col <= right; col++) order.Add(grid[top, col]);
    top++;
    for (int row = top; row <= bottom; row++) order.Add(grid[row, right]);
    right--;
    if (top <= bottom)
    {
        for (int col = right; col >= left; col--) order.Add(grid[bottom, col]);
        bottom--;
    }
    if (left <= right)
    {
        for (int row = bottom; row >= top; row--) order.Add(grid[row, left]);
        left++;
    }
}
Console.WriteLine(string.Join(", ", order));
```

**Kết quả:** `1, 2, 3, 6, 5, 4`.

`List<int>` chỉ làm bộ chứa kết quả để không phải đếm trước từng lần thêm; quy tắc duyệt vẫn do bốn biên quyết định. Mỗi ô phải xuất hiện đúng một lần và tổng số phần tử kết quả bằng `grid.Length`. Ngoài ma trận nhiều hàng/cột, cần thử `1 × n`, `m × 1`, `1 × 1` và chiều bằng 0.

## 14. Chuyển đổi mảng răng cưa và tránh dùng chung hàng

`int[][]` có thể biểu diễn một bảng chữ nhật, nhưng bản thân kiểu không bảo đảm mọi hàng dài bằng nhau hay khác `null`. Muốn chuyển sang `int[,]`, cần xác định số cột và kiểm tra từng hàng trước khi sao chép. Khi sao chép một bảng răng cưa, sao chép mảng ngoài chưa đủ để độc lập các hàng.

```csharp
int[][] source = { new[] { 1, 2 }, new[] { 3, 4 } };
int rows = source.Length;
int cols = source[0].Length;
int[,] rectangular = new int[rows, cols];
for (int row = 0; row < rows; row++)
{
    if (source[row] == null || source[row].Length != cols)
        throw new ArgumentException("Các hàng phải cùng độ dài");
    for (int col = 0; col < cols; col++) rectangular[row, col] = source[row][col];
}
source[0][0] = 99;
Console.WriteLine($"{rectangular[0, 0]}; {source[0][0]}");
```

**Kết quả:** `1; 99`.

Ví dụ đã giả định mảng ngoài không rỗng và hàng đầu tồn tại để xác định `cols`; hàm tổng quát phải xử lý các trường hợp đó trước hai dòng lấy kích thước. Giá trị số nguyên đã được sao chép từng ô, nên sửa `source` không sửa `rectangular`.

**Lỗi thường gặp:** Gán cùng một mảng hàng vào nhiều ô của mảng ngoài rồi cho rằng đó là những hàng độc lập. Khi cần độc lập, tạo từng hàng riêng. Với phần tử là đối tượng, sao chép ô lại chỉ sao chép tham chiếu; cần xác định mức độ sao chép dựa trên hợp đồng.

## 15. Bài toán nâng cao — số đường đi trên bảng

Chỉ được đi sang phải hoặc xuống, số cách đến ô `[row,col]` bằng số cách đến ô trên cộng số cách đến ô trái. Hàng đầu và cột đầu đều có một cách đến nếu bảng không có chướng ngại. Lưu kết quả từng ô giúp tái sử dụng các bài toán con thay vì liệt kê mọi đường.

```csharp
int rows = 3, cols = 4;
long[,] ways = new long[rows, cols];
for (int row = 0; row < rows; row++)
    for (int col = 0; col < cols; col++)
    {
        if (row == 0 || col == 0) ways[row, col] = 1;
        else ways[row, col] = ways[row - 1, col] + ways[row, col - 1];
    }
Console.WriteLine(ways[rows - 1, cols - 1]);
```

**Kết quả:** `10`.

**Phân tích:** Hàng cuối có các giá trị `1, 3, 6, 10`. Duyệt từ trên xuống, trái sang phải bảo đảm hai ô phụ thuộc đã có kết quả trước khi tính ô hiện tại. Ví dụ giả định `1 <= rows, cols <= 20`; số cách của bảng lớn hơn có thể vượt cả `long`, không chỉ `int`.

Đây là bước làm quen với quy hoạch động trên bảng, không phải một quy tắc tự động của mảng. Muốn bổ sung ô cấm, cần định nghĩa lại trạng thái và điều kiện cơ sở. Trước khi viết công thức, hãy nêu ý nghĩa mỗi ô, thứ tự duyệt và trường hợp biên; ba điểm này quyết định tính đúng của lời giải.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.getlength
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.length
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.rank?view=net-10.0
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.copy
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.clone
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/integral-numeric-types

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
