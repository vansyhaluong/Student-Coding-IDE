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

## Tài liệu tham khảo chính thống

- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/strings
- Microsoft Learn: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/tutorials/hello-world

> Nội dung tiếng Việt và ví dụ code trong bài được biên soạn độc lập; các liên kết trên dùng để đối chiếu kiến thức. Chưa có giấy phép tái phân phối nguyên văn nội dung Microsoft Learn.
