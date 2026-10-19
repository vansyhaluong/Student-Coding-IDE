# Chương 1 — Giới thiệu môn Kỹ thuật lập trình

> **Mục tiêu:** Hiểu môn học hướng đến điều gì, quy trình giải quyết bài toán bằng lập trình và cách sử dụng phần Learning trong Student Coding IDE.

## 1. Kỹ thuật lập trình là gì?

Kỹ thuật lập trình không chỉ là nhớ cú pháp. Đây là quá trình **phân tích yêu cầu, lựa chọn cách biểu diễn dữ liệu, thiết kế các bước xử lý, viết chương trình và kiểm tra tính đúng đắn**. Hai chương trình cùng cho ra kết quả đúng có thể khác nhau về mức độ dễ hiểu, khả năng mở rộng và hiệu quả sử dụng tài nguyên.

Một ví dụ đơn giản: cho ba điểm số, yêu cầu tính trung bình. Trước khi viết code, ta cần làm rõ điểm có thể là số thực hay không, có bao nhiêu giá trị và kết quả cần làm tròn như thế nào. Khi yêu cầu đã rõ, công thức cơ bản là `(a + b + c) / 3`.

## 2. Quy trình giải một bài toán lập trình

1. **Đọc đề:** Xác định dữ liệu vào, kết quả ra và các ràng buộc.
2. **Lập kế hoạch:** Chia bài toán thành các bước nhỏ, thử bằng tay với vài ví dụ.
3. **Viết code:** Dùng biến, điều kiện, vòng lặp, chuỗi, hàm hoặc mảng khi phù hợp.
4. **Kiểm tra:** Thử trường hợp thông thường, trường hợp biên và dữ liệu không hợp lệ nếu đề yêu cầu.
5. **Cải thiện:** Đặt tên rõ nghĩa, loại bỏ thao tác thừa, ghi chú phần khó hiểu.

Không nên chỉ thử một ví dụ rồi kết luận chương trình đúng. Chẳng hạn, phép chia số nguyên trong C# có thể làm mất phần thập phân; đó là lỗi dễ gặp khi tính trung bình.

## 3. Ví dụ C# đầu tiên

```csharp
// Ví dụ chạy trong ứng dụng C# dùng top-level statements.
int a = 7;
int b = 8;
int c = 9;

double average = (a + b + c) / 3.0;
Console.WriteLine($"Điểm trung bình: {average:F2}");
// Kết quả: Điểm trung bình: 8.00
```

**Giải thích:** `int` lưu các điểm nguyên; `double` lưu số thực. Số `3.0` giúp phép chia trả về giá trị thực. `{average:F2}` định dạng hai chữ số sau dấu thập phân.

Nếu dùng `/ 3` với hai toán hạng nguyên, C# thực hiện phép chia nguyên trước khi gán kết quả sang `double`.

## 4. Những khái niệm sẽ gặp trong môn học

| Khái niệm | Vai trò |
|---|---|
| Biến và kiểu dữ liệu | Lưu thông tin cần xử lý |
| Điều kiện | Lựa chọn hành động theo dữ liệu |
| Vòng lặp | Lặp lại một nhóm thao tác |
| Chuỗi | Xử lý văn bản |
| Hàm | Chia nhỏ và tái sử dụng thuật toán |
| Mảng 1 chiều | Lưu danh sách các phần tử cùng kiểu |
| Mảng 2 chiều | Biểu diễn dữ liệu dạng hàng và cột |

## 5. Học bằng Student Coding IDE

Learning Mode là không gian học tập riêng. Sinh viên chọn chương ở Roadmap, đọc các mục theo thứ tự hoặc sử dụng mục lục để đến nội dung cần tìm. Sau khi nắm lý thuyết, những phase tiếp theo sẽ bổ sung luyện tập theo mẫu hàm và đánh giá kết quả; nội dung đó **không phải chức năng của trang lý thuyết 9B**.

Trong môn này, **C# được dùng làm ngôn ngữ ví dụ lý thuyết**. Ở phần luyện tập sau này, ứng dụng dự kiến hỗ trợ C# và JavaScript. Nắm khái niệm cơ bản quan trọng hơn việc thuộc riêng một cú pháp.

### Cách đọc các ví dụ code

- Đọc yêu cầu và tự đoán kết quả trước khi nhìn dòng chú thích kết quả.
- Tìm biến đầu vào, phép tính chính và kết quả cuối.
- Thử đổi một dữ liệu đầu vào để kiểm tra mức độ hiểu.

## 6. Kết quả mong đợi sau Chương 1

Sau chương này, bạn nên giải thích được một bài toán lập trình gồm đầu vào, xử lý, đầu ra; biết cách đọc ví dụ C# và hiểu lộ trình tám chương. Chương 1 mang tính giới thiệu, **không bắt buộc có bài luyện tập hay trắc nghiệm**.

## 7. Bài toán, thuật toán và chương trình

**Bài toán** nêu điều cần tìm; **thuật toán** mô tả một quy trình hữu hạn để tìm kết quả; **chương trình** diễn đạt quy trình đó bằng một ngôn ngữ máy có thể thực thi. Cùng một thuật toán có thể được viết bằng C# hoặc ngôn ngữ khác. Vì vậy, nên trình bày các bước bằng lời trước khi chọn cú pháp.

Ví dụ cửa hàng đóng vở thành các gói bằng nhau: đầu vào là số gói và số quyển mỗi gói; đầu ra là tổng số quyển. Tiền điều kiện là hai số không âm; công thức là phép nhân. Với bài toán này, không cần vòng lặp để cộng từng gói.

```csharp
int packages = 4;
int notebooksPerPackage = 6;
int totalNotebooks = packages * notebooksPerPackage;
Console.WriteLine(totalNotebooks);
```

**Kết quả:** `24`.

**Phân tích:** Hai câu lệnh đầu thiết lập dữ liệu, câu thứ ba tính kết quả và câu cuối hiển thị. Thay số gói bằng 0 cho tổng bằng 0; đây là trường hợp biên hợp lệ. Nếu đề cho phép số gói rất lớn, cần xét miền giá trị của kiểu số thay vì chỉ kiểm tra công thức.

Một thuật toán cần có đầu vào/đầu ra rõ ràng, mỗi bước thực hiện được và có điểm kết thúc. Mô tả “thử đến khi tìm được” còn thiếu điều kiện dừng nếu có khả năng không tồn tại đáp án.

## 8. Đọc chương trình bằng bảng vết

Chương trình tuần tự thực hiện câu lệnh theo thứ tự. Dấu `=` là **gán**: tính biểu thức bên phải rồi thay giá trị đang lưu ở bên trái. Nó không phải dấu bằng trong một phương trình toán học.

```csharp
int stock = 20;
int sold = 7;
stock = stock - sold;
sold = 2;
Console.WriteLine($"Kho: {stock}; bán lần sau: {sold}");
```

**Kết quả:** `Kho: 13; bán lần sau: 2`.

| Sau câu lệnh | `stock` | `sold` | Điều cần nhận ra |
|---|---:|---:|---|
| Khai báo hai biến | 20 | 7 | Mỗi biến lưu một giá trị riêng |
| `stock = stock - sold` | 13 | 7 | Giá trị cũ của `stock` tham gia phép tính |
| `sold = 2` | 13 | 2 | Không tính lại `stock` một cách tự động |

**Lỗi thường gặp:** Cho rằng thay `sold` sẽ tự cập nhật mọi biểu thức đã dùng nó. Trong chương trình trên, quan hệ `stock - sold` không được lưu như một công thức động. Lập bảng vết giúp tìm đúng câu lệnh tạo ra giá trị sai, thay vì sửa ngẫu nhiên nhiều chỗ.

## 9. C# chạy như thế nào và cách đọc một tệp ví dụ

Mã nguồn C# được trình biên dịch kiểm tra và chuyển thành chương trình cho nền tảng .NET. SDK cung cấp công cụ phát triển; runtime thực thi chương trình đã chuẩn bị. **Có runtime không đồng nghĩa có đầy đủ công cụ biên dịch.** Thư viện .NET cung cấp sẵn các kiểu như `Console`, `Math`, `Array`; người học không phải tự viết mọi thao tác từ đầu.

Các ví dụ ngắn trong giáo trình dùng **top-level statements**: các lệnh nằm trực tiếp trong tệp, trình biên dịch tạo điểm vào thích hợp. Trong một project chỉ có một tệp chứa top-level statements. Một cách viết khác là đặt các lệnh trong phương thức `static void Main()` của một lớp. Hai cách trình bày này không phải hai thuật toán khác nhau.

Quy ước đọc: `;` kết thúc một câu lệnh; `{ }` tạo khối; `//` mở chú thích đến hết dòng. Chú thích giải thích ý định hoặc giả định, không tham gia tính toán. Các tên có chữ hoa/chữ thường khác nhau được xem là tên khác nhau.

```csharp
int first = 11;
int second = 4;
int difference = first - second; // Khoảng chênh lệch có dấu.
System.Console.WriteLine(difference);
```

**Kết quả:** `7`.

`System.Console` là tên đầy đủ của kiểu. Trong project bật implicit usings, có thể viết ngắn thành `Console`. Khi sao chép một ví dụ, hãy dùng một chương trình riêng; không ghép nhiều ví dụ có các biến cùng tên vào một phạm vi rồi cho rằng lỗi trùng tên là lỗi của thuật toán.

## 10. Phân biệt lỗi cú pháp, lỗi khi chạy và lỗi logic

| Nhóm lỗi | Biểu hiện | Cách tiếp cận |
|---|---|---|
| Biên dịch | Sai tên biến, thiếu dấu câu, gán sai kiểu | Đọc thông báo đầu tiên và vị trí được chỉ ra |
| Khi chạy | Chia số nguyên cho 0, truy cập vượt chỉ số | Xác định dữ liệu và câu lệnh gây ngoại lệ |
| Logic | Chạy xong nhưng kết quả không đúng yêu cầu | Đối chiếu công thức, bảng vết và trường hợp biên |

Lỗi logic thường khó phát hiện hơn vì chương trình có thể không báo lỗi. Chẳng hạn, gán thương nguyên sang `double` không phục hồi phần lẻ đã mất:

```csharp
int total = 17;
int count = 4;
double truncated = total / count;
double average = (double)total / count;
Console.WriteLine($"{truncated}; {average.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)}");
```

**Kết quả:** `4; 4.25`.

**Phân tích:** Phép chia được quyết định bởi kiểu toán hạng tại thời điểm tính. Ép một toán hạng sang `double` trước phép chia làm thay đổi cách tính; chỉ đổi kiểu của biến nhận kết quả thì không. Khi sửa lỗi, chỉ thay một nguyên nhân đã xác định rồi kiểm tra lại, tránh làm mất dấu lỗi gốc.

## 11. Thiết kế dữ liệu kiểm tra trước khi viết lời giải

Một bộ kiểm tra tốt có nhiều nhóm: thông thường, nhỏ nhất/lớn nhất, bằng ngưỡng, hai phía của ngưỡng và dữ liệu không hợp lệ khi hợp đồng cho phép. Kết quả mong đợi phải được tính độc lập, không lấy từ chính chương trình đang kiểm tra.

Với công thức `remaining = initial - used`, chọn `used = 0`, `used = initial` và giá trị ở giữa. Trường hợp `used > initial` cần một quyết định từ đề: cho phép số âm hay từ chối dữ liệu? Không tự bổ sung quy tắc mà đề không nêu.

```csharp
int initial = 12;
bool testEmptyUse = initial - 0 == 12;
bool testUseAll = initial - 12 == 0;
bool testTypical = initial - 5 == 7;
Console.WriteLine(testEmptyUse && testUseAll && testTypical);
```

**Kết quả:** `True`.

Đây là minh họa kiểm tra bằng biểu thức logic, chưa phải một framework kiểm thử. Ba phép kiểm tra có thể giúp phát hiện một số sai sót nhưng không chứng minh chương trình đúng với mọi đầu vào. Để có lập luận đầy đủ hơn, cần kết hợp giả định đầu vào với việc giải thích vì sao từng bước giữ đúng ý nghĩa của dữ liệu.

## 12. Phương pháp tự học và chuẩn trình bày lời giải

Với mỗi ví dụ, thực hiện chu trình **dự đoán → chạy → đối chiếu → giải thích → thay đổi dữ liệu**. Nếu kết quả khác dự đoán, viết lại bảng vết trước khi tìm lời giải trên Internet. Đọc tài liệu Microsoft để kiểm tra ý nghĩa của cú pháp hoặc API; dùng ví dụ tự tạo để kiểm tra mình hiểu đến đâu.

Một lời giải nên có: mô tả đầu vào/đầu ra; giả định dữ liệu; ý tưởng; các bước xử lý; code có tên rõ nghĩa; ví dụ có kết quả; nhận xét trường hợp biên. Không cần bình luận từng phép gán hiển nhiên; nên giải thích vì sao chọn công thức, điều kiện hoặc giá trị khởi tạo.

Các đoạn code lý thuyết là những chương trình minh họa độc lập, không phải mã của Exercise Runtime. Kết quả số thực được ghi theo dấu chấm thập phân; phần kiểm chứng dùng văn hóa bất biến để tránh khác biệt thiết lập vùng. Đây là quy ước của ví dụ, không phải quy tắc định dạng chung cho mọi ứng dụng tiếng Việt.

**Tự kiểm tra:** Giải thích khác nhau giữa `=` và `==`; vì sao `/ 4` khác `/ 4.0`; vì sao một kết quả chạy đúng chưa đủ; và tại sao cần biết miền giá trị đầu vào trước khi chọn kiểu dữ liệu. Các chương sau sẽ mở rộng từng câu hỏi này bằng cấu trúc ngôn ngữ cụ thể.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/overview
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/tutorials/hello-world
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/program-structure/top-level-statements
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/core/sdk
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/arithmetic-operators
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/exception-handling

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
