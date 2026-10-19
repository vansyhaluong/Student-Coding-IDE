# Chương 5 — Kỹ thuật xử lý chuỗi

> **Mục tiêu:** Làm việc với `string`, truy cập ký tự, so sánh, tìm kiếm, cắt ghép chuỗi và xử lý các trường hợp văn bản cơ bản.

## 1. Chuỗi và ký tự trong C#

`string` lưu văn bản. Trong C#, chuỗi có tính **bất biến**: các thao tác như `Replace` hoặc `Trim` trả về chuỗi mới, không chỉnh sửa trực tiếp đối tượng chuỗi ban đầu. Thuộc tính `Length` đo số đơn vị `char` (UTF-16), nên không nhất thiết trùng số ký tự người dùng nhìn thấy với mọi Unicode.

```csharp
string message = "Hello C#";
Console.WriteLine(message.Length); // 8
Console.WriteLine(message[0]);     // H
Console.WriteLine(message[^1]);    // # (ký tự cuối)
```

Chỉ số bắt đầu từ `0` và chỉ số hợp lệ nhỏ hơn `Length`. Không truy cập `message[message.Length]` vì đó là vị trí ngoài chuỗi.

## 2. Duyệt và đếm ký tự

Có thể dùng `foreach` để duyệt từng `char`. Ví dụ sau đếm các chữ số ASCII trong một chuỗi:

```csharp
string text = "Room 204, floor 3";
int count = 0;
foreach (char c in text)
{
    if (c >= '0' && c <= '9') count++;
}
Console.WriteLine(count); // 4
```

Nếu bài toán yêu cầu xử lý đầy đủ các chữ số Unicode, phải dùng quy tắc Unicode phù hợp thay vì chỉ kiểm tra `'0'` đến `'9'`.

## 3. Các phương thức xử lý chuỗi thường dùng

| Phương thức / thuộc tính | Ý nghĩa |
|---|---|
| `Length` | Độ dài theo đơn vị `char` |
| `Contains` | Kiểm tra có chứa chuỗi con |
| `IndexOf` | Tìm vị trí xuất hiện đầu tiên |
| `Substring` | Lấy chuỗi con |
| `Replace` | Thay nội dung, trả về chuỗi mới |
| `Trim` | Loại bỏ khoảng trắng đầu/cuối |
| `Split` | Tách chuỗi theo dấu phân cách |
| `string.Join` | Ghép nhiều phần tử thành chuỗi |

```csharp
string raw = "  hoc C# co ban  ";
string clean = raw.Trim();
string changed = clean.Replace("co ban", "nang cao");
Console.WriteLine(changed); // hoc C# nang cao
Console.WriteLine(raw.Length > changed.Length); // True
```

## 4. So sánh chuỗi

Không nên tự giả định so sánh chữ hoa/chữ thường hoặc quy tắc văn hóa. C# hỗ trợ chỉ rõ chế độ so sánh bằng `StringComparison`.

```csharp
string answer = "Yes";
bool same = string.Equals(answer, "yes", StringComparison.OrdinalIgnoreCase);
Console.WriteLine(same); // True
```

Đối với mã định danh kỹ thuật, so sánh kiểu `Ordinal` hoặc `OrdinalIgnoreCase` thường rõ ràng hơn so với so sánh phụ thuộc ngôn ngữ tự nhiên.

## 5. Ví dụ — đảo ngược chuỗi ký tự ASCII

```csharp
string input = "coding";
char[] chars = input.ToCharArray();
Array.Reverse(chars);
string reversed = new string(chars);
Console.WriteLine(reversed); // gnidoc
```

Ví dụ này phù hợp với văn bản ASCII cơ bản; đảo `char` trực tiếp có thể làm sai thứ tự các tổ hợp Unicode phức tạp. Khi xử lý văn bản đa ngôn ngữ thực tế, cần lựa chọn cách duyệt phù hợp.

## 6. Ví dụ — kiểm tra chuỗi đối xứng đơn giản

```csharp
string word = "level";
bool palindrome = true;
for (int i = 0; i < word.Length / 2; i++)
{
    if (word[i] != word[word.Length - 1 - i])
    {
        palindrome = false;
        break;
    }
}
Console.WriteLine(palindrome); // True
```

Phiên bản này so sánh đúng các ký tự như được nhập; chưa bỏ khoảng trắng, dấu câu hoặc chuẩn hóa chữ hoa/chữ thường. Bài toán cần nêu rõ quy tắc trước khi viết lời giải.

## 7. Chuỗi rỗng, `null`, khoảng trắng và tính bất biến

Chuỗi rỗng có độ dài 0 nhưng vẫn là một chuỗi; `null` biểu thị không có đối tượng chuỗi để truy cập. Một chuỗi chỉ chứa dấu cách không rỗng về độ dài nhưng có thể không có nội dung hữu ích theo yêu cầu nhập liệu. `string.IsNullOrWhiteSpace` kiểm tra chung các trường hợp `null`, rỗng và toàn ký tự khoảng trắng.

```csharp
string? missing = null;
string blank = "   ";
string original = "  C#  ";
string trimmed = original.Trim();
Console.WriteLine($"{string.IsNullOrWhiteSpace(missing)}; {string.IsNullOrWhiteSpace(blank)}; {original.Length}; {trimmed.Length}");
```

**Kết quả:** `True; True; 6; 2`.

`Trim` không sửa `original`; nó trả về kết quả cần giữ lại nếu muốn sử dụng. Viết `original.Trim();` rồi tiếp tục dùng `original` không làm mất khoảng trắng. Trước khi chuẩn hóa văn bản, xác định khoảng trắng có ý nghĩa hay không: mật khẩu, mã định danh và đoạn văn có thể cần những chính sách khác nhau.

**Lỗi thường gặp:** Gọi `.Trim()` trên biến `null`; coi `"0"` như số 0 mà chưa chuyển kiểu; hoặc cho rằng kiểm tra không rỗng đã đủ xác nhận tên người dùng hợp lệ.

## 8. Tìm kiếm và lấy chuỗi con với cận an toàn

`IndexOf` trả chỉ số hoặc -1 nếu không tìm thấy. `Substring(start, length)` nhận **vị trí bắt đầu và số đơn vị `char`**, không phải hai vị trí đầu/cuối. Muốn lấy khoảng từ `start` đến trước `end`, độ dài là `end - start`. Phải kiểm tra cận trước khi cắt.

```csharp
string entry = "room=204";
int separator = entry.IndexOf('=');
string key = "";
string value = "";
if (separator >= 0)
{
    key = entry.Substring(0, separator);
    value = entry.Substring(separator + 1);
}
Console.WriteLine($"{key}; {value}");
```

**Kết quả:** `room; 204`.

Vị trí dấu `=` là 4; khóa dài 4 ký tự; giá trị bắt đầu ở 5. Nếu không tìm được dấu phân cách, ví dụ giữ hai kết quả rỗng; một ứng dụng thực tế nên trả trạng thái lỗi rõ ràng thay vì giả định đã phân tích thành công. Nếu chuỗi có nhiều dấu `=`, quy tắc ví dụ là tách tại dấu đầu tiên.

Với tìm kiếm chuỗi con dùng cho mã kỹ thuật, có thể chỉ định `StringComparison.Ordinal`. Tránh thay tất cả chuỗi về chữ thường chỉ để tìm kiếm, vì tạo thêm dữ liệu và có thể đưa quy tắc văn hóa không mong muốn vào so sánh.

## 9. Tách từ, loại trường rỗng và ghép lại

`Split` tạo mảng các phần dựa trên dấu phân cách; các dấu liên tiếp có thể tạo phần rỗng. `RemoveEmptyEntries` loại phần rỗng; `TrimEntries` loại khoảng trắng ở đầu/cuối từng phần. Đó là hai bước khác nhau. `string.Join` ghép phần tử bằng dấu phân cách mới mà không phải tự xử lý dấu ở cuối.

```csharp
string raw = "  An ; ; Binh;Chi  ";
string[] names = raw.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
Console.WriteLine($"{names.Length}; {string.Join(" / ", names)}");
```

**Kết quả:** `3; An / Binh / Chi`.

Mục chỉ chứa khoảng trắng trở thành rỗng sau bước trim rồi bị loại. Đây là phân tách đơn giản bằng dấu `;`, không phải bộ đọc CSV hoàn chỉnh: một trường có dấu phân cách nằm trong dấu nháy cần quy tắc phân tích khác. Không áp dụng `Split` một cách máy móc cho mọi định dạng có dấu phẩy.

## 10. Tạo văn bản bằng `StringBuilder`

Do `string` bất biến, ghép nối lặp lại có thể tạo nhiều kết quả trung gian. `System.Text.StringBuilder` giữ một bộ đệm có thể thay đổi và cung cấp `Append`, `AppendLine`, `Insert`, `Remove`. Cuối cùng gọi `ToString()` để lấy chuỗi kết quả. Với một biểu thức ngắn, nội suy chuỗi thường dễ đọc hơn; không cần dùng `StringBuilder` cho mọi phép nối.

```csharp
var builder = new System.Text.StringBuilder();
for (int i = 1; i <= 4; i++)
{
    if (i > 1) builder.Append(" -> ");
    builder.Append(i * i);
}
Console.WriteLine(builder.ToString());
```

**Kết quả:** `1 -> 4 -> 9 -> 16`.

Điều kiện `i > 1` đưa dấu phân cách vào giữa các phần, không thêm ở hai đầu. `builder` là đối tượng có trạng thái: dùng lại mà không xóa sẽ nối tiếp dữ liệu cũ. Nếu chỉ có sẵn một dãy cần nối, `string.Join` diễn tả đúng mục đích hơn việc tự viết vòng lặp.

## 11. Unicode: `char`, mã Unicode và ký tự nhìn thấy

`char` là một đơn vị UTF-16; một mã Unicode có thể cần hai đơn vị đó. Một ký tự người đọc nhìn thấy còn có thể gồm nhiều mã Unicode, như chữ cái kết hợp dấu. Vì vậy, `Length`, số mã Unicode và số phần tử văn bản là ba phép đếm có thể khác nhau.

```csharp
string text = "A\U0001F600";
int runeCount = 0;
foreach (var rune in text.EnumerateRunes()) runeCount++;
int textElements = new System.Globalization.StringInfo(text).LengthInTextElements;
Console.WriteLine($"{text.Length}; {runeCount}; {textElements}");
```

**Kết quả:** `3; 2; 2`.

Ký hiệu mặt cười ở ví dụ cần hai `char`, nên cả chuỗi dài 3 theo UTF-16. `EnumerateRunes` duyệt giá trị Unicode vô hướng; `StringInfo` hỗ trợ xử lý phần tử văn bản. Đảo từng `char` không an toàn cho chuỗi này vì có thể làm vỡ cặp surrogate.

Hai chuỗi hiển thị giống nhau cũng có thể được mã hóa khác nhau. Chuẩn hóa Unicode tạo dạng biểu diễn thống nhất theo quy tắc đã chọn; nó không đồng nghĩa bỏ dấu tiếng Việt hoặc chuyển chữ hoa thành chữ thường.

```csharp
string composed = "\u00E9";
string decomposed = "e\u0301";
bool before = string.Equals(composed, decomposed, StringComparison.Ordinal);
bool after = string.Equals(composed.Normalize(), decomposed.Normalize(), StringComparison.Ordinal);
Console.WriteLine($"{before}; {after}");
```

**Kết quả:** `False; True`.

**Giới hạn:** Các thuật toán đếm tần suất theo bảng 26 chữ và ví dụ đảo ASCII trong chương giả định bảng chữ đã nêu, không tự mở rộng thành xử lý mọi văn bản Unicode.

## 12. Bảng tần suất cho chữ cái tiếng Anh thường

Khi miền ký tự là `'a'` đến `'z'`, dùng mảng 26 phần tử; ký tự `c` ánh xạ đến chỉ số `c - 'a'`. Bảng này ghi số lần xuất hiện và giúp kiểm tra hoán vị hoặc tìm ký tự lặp mà không phải quét cả chuỗi cho từng chữ.

```csharp
string word = "banana";
int[] frequency = new int[26];
foreach (char c in word)
{
    if (c >= 'a' && c <= 'z') frequency[c - 'a']++;
}
Console.WriteLine($"a:{frequency['a' - 'a']}; b:{frequency['b' - 'a']}; n:{frequency['n' - 'a']}");
```

**Kết quả:** `a:3; b:1; n:2`.

`frequency` bắt đầu toàn 0. Mỗi ký tự hợp lệ tăng đúng một ô, nên tổng các ô bằng số chữ thường đã xử lý. Ví dụ bỏ qua ký tự ngoài miền; nếu đề yêu cầu từ chối ký tự lạ, phải thay quy tắc đó một cách tường minh. Chuyển chữ có dấu sang chỉ số bảng 26 phần tử sẽ vượt cận hoặc đếm sai.

## 13. Bài toán tìm từ dài nhất và quy tắc khi hòa

Một yêu cầu đầy đủ cần nói rõ “từ” là gì và xử lý hai từ dài bằng nhau thế nào. Trong ví dụ này, từ là chuỗi con được phân cách bởi dấu cách ASCII; lấy từ xuất hiện đầu tiên trong các từ dài nhất. Dấu câu nếu có được tính là một phần của từ.

```csharp
string sentence = "  hoc lap trinh moi ngay  ";
string[] words = sentence.Split(' ', StringSplitOptions.RemoveEmptyEntries);
string longest = "";
foreach (string word in words)
{
    if (word.Length > longest.Length) longest = word;
}
Console.WriteLine(longest);
```

**Kết quả:** `trinh`.

Điều kiện `>` giữ lại từ trước nếu hai độ dài bằng nhau; đổi thành `>=` sẽ chọn từ cuối trong nhóm hòa. Khi không có từ, kết quả rỗng là quy ước của ví dụ. Nếu cần phát hiện khoảng trắng Unicode nói chung hoặc tách dấu câu, phải thiết kế tiêu chí từ khác; không coi `Split(' ')` là phân tích ngôn ngữ tự nhiên.

## 14. Tiền tố chung và kiểm tra giới hạn chỉ số

Để tìm phần đầu chung của nhiều chuỗi, lấy độ dài chuỗi đầu làm giới hạn ban đầu. Với mỗi chuỗi tiếp theo, so sánh từ vị trí 0 đến khi khác ký tự hoặc chạm một trong hai cận; cập nhật độ dài tiền tố. Phải kiểm tra cận **trước** khi đọc ký tự.

```csharp
string[] words = { "coding", "code", "cobalt" };
int prefixLength = words[0].Length;
for (int i = 1; i < words.Length; i++)
{
    int j = 0;
    while (j < prefixLength && j < words[i].Length && words[0][j] == words[i][j]) j++;
    prefixLength = j;
}
Console.WriteLine(words[0].Substring(0, prefixLength));
```

**Kết quả:** `co`.

Ví dụ giả định mảng có ít nhất một chuỗi, không có phần tử `null` và chỉ xử lý chữ ASCII. Chuỗi rỗng làm tiền tố chung rỗng; một chuỗi duy nhất là tiền tố chung của chính nó. Không hoán đổi điều kiện đọc `words[i][j]` lên trước các kiểm tra cận trong `while`.

**Ôn tập lỗi:** Quên nhận kết quả từ hàm trả chuỗi mới; nhầm vị trí với độ dài trong `Substring`; dùng chỉ số -1 từ `IndexOf`; bỏ qua văn hóa so sánh; xem mọi `char` là một ký tự hiển thị. Mỗi lỗi gắn với một giả định cụ thể cần nêu trong lời giải.

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/strings
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/tutorials/hello-world
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.string.isnullorwhitespace
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.string.substring?view=net-10.0
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.string.indexof
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.string.split
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/standard/base-types/stringbuilder
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/standard/base-types/best-practices-strings
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/standard/base-types/character-encoding-introduction
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.globalization.stringinfo
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.string.normalize
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/api/system.string.enumeraterunes?view=net-10.0

> Phạm vi tham khảo: đối chiếu quy tắc C#/.NET và API. Lập luận thuật toán, dữ liệu minh họa và phân tích kết quả được biên soạn riêng cho giáo trình; không nhập nguyên văn bài viết, mã mẫu hoặc hình ảnh Microsoft. Metadata là ghi nhận phạm vi sử dụng nguồn, không cấp quyền tái phân phối nội dung nguồn.

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
