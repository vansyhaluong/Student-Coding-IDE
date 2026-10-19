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

## 7. Tham chiếu, sao chép và quyền sửa mảng

Gán `int[] other = data` không tạo mảng phần tử mới; hai biến tham chiếu cùng mảng. Muốn có vùng dữ liệu độc lập cho các số nguyên, có thể cấp phát mảng mới rồi `Array.Copy`. `Clone` tạo bản sao nông: với mảng chứa đối tượng hoặc mảng con, các tham chiếu phần tử vẫn có thể được dùng chung.

```csharp
int[] data = { 3, 6, 9 };
int[] alias = data;
int[] copy = new int[data.Length];
Array.Copy(data, copy, data.Length);
alias[0] = 100;
copy[1] = 200;
Console.WriteLine($"Gốc: {string.Join(", ", data)}; sao: {string.Join(", ", copy)}");
```

**Kết quả:** `Gốc: 100, 6, 9; sao: 3, 200, 9`.

**Phân tích:** `alias[0]` sửa chính phần tử đầu của `data`; sửa `copy[1]` không ảnh hưởng dữ liệu gốc. Trước khi viết hàm sắp xếp/đảo mảng, cần hỏi đề có cho phép sửa đầu vào không. Nếu phải giữ dữ liệu gốc, tạo bản sao trước và tính cả chi phí sao chép khi lựa chọn thuật toán.

Mảng có độ dài cố định; thay tham chiếu sang một mảng dài hơn không phải “kéo dài” đối tượng cũ. Với mảng các kiểu tham chiếu, giá trị mặc định ở mỗi ô có thể là `null`; cấp phát mảng không tự tạo từng đối tượng phần tử.

## 8. Sắp xếp chọn và bất biến đoạn đã xử lý

Sắp xếp tăng dần đưa các phần tử về thứ tự không giảm. Với **selection sort**, tại lượt `i`, tìm vị trí phần tử nhỏ nhất trong đoạn `i..n-1` rồi đổi với phần tử tại `i`. Trước mỗi lượt, đoạn `0..i-1` đã chứa các phần tử nhỏ nhất theo đúng thứ tự.

```csharp
int[] values = { 7, -2, 7, 1 };
for (int i = 0; i < values.Length - 1; i++)
{
    int minIndex = i;
    for (int j = i + 1; j < values.Length; j++)
        if (values[j] < values[minIndex]) minIndex = j;
    (values[i], values[minIndex]) = (values[minIndex], values[i]);
}
Console.WriteLine(string.Join(", ", values));
```

**Kết quả:** `-2, 1, 7, 7`.

Giữ **vị trí** nhỏ nhất, không chỉ giá trị, vì cần biết hai ô để đổi. Mảng rỗng hoặc một phần tử không cần đổi; phần tử trùng vẫn được giữ đủ số lần. Thuật toán này giúp hiểu vòng lặp lồng nhau nhưng số phép so sánh tăng xấp xỉ bình phương độ dài; với dữ liệu thực tế, có thể dùng `Array.Sort` thay vì tự duy trì một thuật toán sắp xếp tổng quát.

Không tự giả định việc sắp xếp sẽ giữ thứ tự tương đối của các bản ghi có khóa bằng nhau. Khi thứ tự đó có ý nghĩa, phải chọn thuật toán/API đáp ứng yêu cầu ổn định hoặc thêm khóa phân biệt phù hợp.

## 9. Tìm kiếm nhị phân và tiền điều kiện đã sắp xếp

Tìm kiếm nhị phân chỉ áp dụng khi dữ liệu đã có thứ tự tương ứng với cách so sánh. Xét phần tử giữa; nếu nhỏ hơn mục tiêu, loại nửa trái; nếu lớn hơn, loại nửa phải. Khoảng tìm kiếm thu hẹp ở mỗi lượt, thay vì kiểm tra từng ô.

```csharp
int[] sorted = { -3, 0, 4, 8, 12 };
int target = 8;
int left = 0, right = sorted.Length - 1;
int result = -1;
while (left <= right)
{
    int middle = left + (right - left) / 2;
    if (sorted[middle] == target) { result = middle; break; }
    if (sorted[middle] < target) left = middle + 1;
    else right = middle - 1;
}
Console.WriteLine(result);
```

**Kết quả:** `3`.

Đoạn ứng viên là khoảng đóng `[left, right]`; khi `left > right` không còn ô nào. Công thức giữa tránh cộng trực tiếp hai chỉ số lớn. Cập nhật `middle + 1` hoặc `middle - 1` loại vị trí đã xét, tránh vòng lặp không tiến triển.

Với phần tử trùng, phiên bản này trả một vị trí phù hợp, không hứa vị trí đầu tiên. Muốn lấy vị trí đầu, phải tiếp tục thu hẹp sau khi tìm thấy. `Array.BinarySearch` còn có quy tắc mã hóa chỉ số chèn khi không tìm thấy; không dùng số trả về âm như một chỉ số mảng hợp lệ.

## 10. Chèn/xóa với độ dài sử dụng riêng

Khi mô phỏng danh sách bằng mảng có sức chứa cố định, tách `capacity = data.Length` và số phần tử đang dùng `count`. Chỉ vùng `0..count-1` có ý nghĩa. Chèn ở `index` cần chỗ trống và `0 <= index <= count`; xóa cần `0 <= index < count`.

```csharp
int[] data = new int[6];
data[0] = 3; data[1] = 7; data[2] = 9;
int count = 3;
int insertIndex = 1;
for (int i = count; i > insertIndex; i--) data[i] = data[i - 1];
data[insertIndex] = 5;
count++;
string afterInsert = string.Join(", ", data[..count]);
int deleteIndex = 2;
for (int i = deleteIndex; i < count - 1; i++) data[i] = data[i + 1];
count--;
Console.WriteLine($"{afterInsert} -> {string.Join(", ", data[..count])}");
```

**Kết quả:** `3, 5, 7, 9 -> 3, 5, 9`.

Chèn phải dịch từ phải sang trái để không ghi đè giá trị chưa chuyển; xóa dịch từ trái sang phải. Số 9 còn nằm ở một ô ngoài vùng sử dụng sau khi xóa nhưng không được xem là một phần tử hợp lệ nữa. Cú pháp `[..count]` lấy đoạn từ đầu đến trước `count` và tạo mảng kết quả cho việc hiển thị; nó không thay đổi sức chứa của `data`.

Ví dụ chọn sẵn các chỉ số hợp lệ. Trong hàm tổng quát, phải kiểm tra sức chứa và cận trước khi dịch. Nếu thường xuyên thêm/xóa, `List<T>` là lựa chọn thư viện cần cân nhắc; hiểu phép dịch mảng vẫn giúp phân tích thao tác nền tảng.

## 11. Gom phần tử trùng và ý nghĩa của thứ tự

Nếu chỉ cần các giá trị khác nhau theo thứ tự tăng, có thể sao chép dữ liệu, sắp xếp, rồi giữ một giá trị ở mỗi nhóm bằng nhau. Cách này **không giữ thứ tự xuất hiện ban đầu**; nếu yêu cầu giữ thứ tự đó, phải chọn chiến lược khác.

```csharp
int[] values = { 4, 2, 4, 1, 2 };
Array.Sort(values);
int[] unique = new int[values.Length];
int count = 0;
foreach (int value in values)
{
    if (count == 0 || unique[count - 1] != value) unique[count++] = value;
}
Console.WriteLine(string.Join(", ", unique[..count]));
```

**Kết quả:** `1, 2, 4`.

Kiểm tra `count == 0` đứng trước để không truy cập chỉ số -1; ngắn mạch bảo vệ vế phải. `count` cho biết bao nhiêu ô trong `unique` có nghĩa, không phải toàn bộ `Length`. Mảng đầu vào bị sắp xếp tại chỗ; cần thêm bản sao nếu hợp đồng yêu cầu giữ nó.

## 12. Tổng tiền tố cho nhiều truy vấn đoạn

Tạo mảng `prefix` dài `n + 1`, trong đó `prefix[0] = 0` và `prefix[i + 1] = prefix[i] + data[i]`. Khi đó tổng đoạn đóng `[left, right]` là `prefix[right + 1] - prefix[left]`. Ô 0 phụ làm công thức dùng được cả khi `left = 0`.

```csharp
int[] data = { 4, -1, 6, 2 };
long[] prefix = new long[data.Length + 1];
for (int i = 0; i < data.Length; i++) prefix[i + 1] = prefix[i] + data[i];
int left = 1, right = 3;
long rangeSum = prefix[right + 1] - prefix[left];
Console.WriteLine(rangeSum);
```

**Kết quả:** `7`.

`prefix` lần lượt là `0, 4, 3, 9, 11`; hiệu `11 - 4` chính là `-1 + 6 + 2`. Cần `0 <= left <= right < n`. Dùng `long` cho tổng để tránh tràn ở nhiều trường hợp dù phần tử là `int`; với miền rất lớn vẫn phải kiểm tra khả năng biểu diễn của `long`.

Đổi lại cho truy vấn nhanh là một lượt tạo mảng phụ. Khi sửa dữ liệu gốc, các tổng tiền tố phía sau không tự cập nhật; chiến lược này phù hợp khi dữ liệu giữ nguyên trong một loạt truy vấn.

## 13. Cửa sổ trượt có kích thước cố định

Tìm tổng lớn nhất của `k` phần tử liên tiếp có thể tái sử dụng tổng trước: bỏ phần tử rời cửa sổ, thêm phần tử mới. Không cần cộng lại cả `k` ô cho mỗi vị trí. Hợp đồng cần có `1 <= k <= n`.

```csharp
int[] data = { 2, -1, 4, 3, -2 };
int k = 3;
long window = 0;
for (int i = 0; i < k; i++) window += data[i];
long best = window;
for (int right = k; right < data.Length; right++)
{
    window = window - data[right - k] + data[right];
    if (window > best) best = window;
}
Console.WriteLine(best);
```

**Kết quả:** `6`.

Ba cửa sổ có tổng 5, 6, 5. Khởi tạo `best` từ cửa sổ đầu, không từ 0: nếu tất cả các tổng âm, giá trị lớn nhất vẫn âm. Quy tắc cập nhật này dùng được khi có số âm vì kích thước cố định; những thuật toán tự co/giãn cửa sổ theo một ngưỡng tổng có thể cần giả định khác.

## 14. Hai con trỏ trên mảng có thứ tự

Với mảng tăng dần, để tìm hai phần tử khác vị trí có tổng bằng mục tiêu, đặt một con trỏ ở mỗi đầu. Tổng quá nhỏ thì tăng con trỏ trái; tổng quá lớn thì giảm con trỏ phải. Thứ tự mảng cho phép loại các cặp không thể cải thiện theo hướng ngược lại.

```csharp
int[] data = { 1, 3, 5, 8, 11 };
int target = 13;
int left = 0, right = data.Length - 1;
int first = -1, second = -1;
while (left < right)
{
    long sum = (long)data[left] + data[right];
    if (sum == target) { first = left; second = right; break; }
    if (sum < target) left++;
    else right--;
}
Console.WriteLine($"{first}; {second}");
```

**Kết quả:** `2; 3`.

Hai giá trị 5 và 8 tạo tổng 13. Điều kiện `left < right` ngăn dùng cùng ô hai lần. Ví dụ lấy một cặp tìm được; nếu đề cần mọi cặp hoặc quy tắc riêng khi có phần tử trùng, phải thiết kế thêm.

**Checklist mảng:** Rỗng hay không? Đã sắp xếp chưa? Có cho phép sửa đầu vào? Trả giá trị hay vị trí? Khi có nhiều đáp án, chọn đáp án nào? Tổng/tích có vượt miền kiểu? Nêu rõ những câu trả lời này trước khi chọn kỹ thuật.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.copy
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.clone
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.sort
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.array.binarysearch
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/default-values

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
