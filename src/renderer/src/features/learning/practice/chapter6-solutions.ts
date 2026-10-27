import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { ExerciseSolution } from './solutions'

// Independently authored public-statement content. Tuple entries explain exactly
// one meaningful source line; punctuation-only rows remain exclusively in full code.
type SourceLine = string | readonly [code: string, explanation: string]
type ResultType = 'int32' | 'boolean' | 'int32[]'
const csharpTypes = { int32: 'int', boolean: 'bool', 'int32[]': 'int[]' }
function source(name: string, parameters: string[], returns: ResultType, language: ExerciseLanguage, body: SourceLine[]) {
  const declaration = parameters.map(parameter => language === 'csharp' ? `int ${parameter}` : parameter).join(', ')
  const jsReturn = returns === 'boolean' ? 'boolean' : returns === 'int32[]' ? 'mảng number nguyên' : 'number nguyên'
  const header: SourceLine[] = language === 'csharp' ? [
    ['public class Solution', 'Khai báo lớp Solution công khai theo mẫu C# của IDE; không cần viết Main hoặc chương trình Console.'], '{',
    [`    public ${csharpTypes[returns]} ${name}(${declaration})`, `Phương thức instance ${name} nhận ${declaration} và trả ${csharpTypes[returns]}; giữ đúng chữ ký để IDE gọi hàm.`], '    {',
  ] : [[`function ${name}(${declaration}) {`, `Khai báo hàm ${name} nhận các number nguyên ${parameters.join(', ')} và trả ${jsReturn}. IDE truyền tham số; không tự đọc stdin hoặc gọi hàm.`]]
  const indent = language === 'csharp' ? '        ' : '    '
  const rows = [...header, ...body.map<SourceLine>(line => typeof line === 'string' ? indent + line : [indent + line[0], line[1]]),
    ...(language === 'csharp' ? ['    }', '}'] : ['}'])]
  return { code: rows.map(line => typeof line === 'string' ? line : line[0]).join('\n'),
    lines: rows.flatMap((line, index) => typeof line === 'string' ? [] : [{ code: line[0], explanation: line[1], lineNumber: index + 1 }]) }
}
function entry(exerciseId: string, name: string, parameters: string[], returns: ResultType, analysis: string[], algorithm: string[], csharp: SourceLine[], javascript: SourceLine[], time: string, space = 'O(1) — chỉ dùng số lượng cố định biến cục bộ; không có đệ quy hoặc cấu trúc tăng theo input.'): ExerciseSolution {
  return { exerciseId, signature: { functionName: name, parameters: parameters.map(parameter => ({ name: parameter, type: 'int32' })), returnType: returns },
    analysis: [...analysis, 'Input được IDE truyền qua tham số và tuân theo miền đề bài. Chỉ return kết quả; không đọc/ghi Console hoặc STDIN/STDOUT. Hàm phụ trong source không tạo API của ứng dụng.'], algorithm,
    languages: { csharp: source(name, parameters, returns, 'csharp', csharp), javascript: source(name, parameters, returns, 'javascript', javascript) }, complexity: { time, space } }
}

export const chapter6Solutions: ExerciseSolution[] = [
  entry('ch6-01', 'Absolute', ['n'], 'int32', [
    'Nhận số nguyên n với |n| ≤ 1 000 000; trả khoảng cách từ n đến 0 nên kết quả luôn không âm.',
    'Ví dụ công khai: -36 trả 36; 0 trả 0. Số dương giữ nguyên. Giới hạn input bảo đảm phép đổi dấu số âm không tràn int32.',
  ], [
    'Nếu n < 0 thì đổi dấu bằng toán tử một ngôi - và return ngay.',
    'Ngược lại n đã không âm, return n. Không cần biến đổi hay đọc input bên trong hàm.',
  ], [
    ['if (n < 0)', 'Kiểm tra n nằm về phía âm của trục số hay không.'], '{',
    ['    return -n;', 'Đổi dấu số âm để lấy khoảng cách dương rồi kết thúc hàm.'], '}',
    ['return n;', 'Với số dương hoặc 0, khoảng cách đến 0 chính là n.'],
  ], [
    ['if (n < 0) {', 'Phân nhánh theo dấu của number nguyên n.'],
    ['    return -n;', 'Toán tử - một ngôi trả số đối của n, tạo giá trị không âm.'], '}',
    ['return n;', 'Giữ nguyên input khi n không âm; trả number nguyên.'],
  ], 'O(1) — một phép so sánh và tối đa một lần đổi dấu.'),
  entry('ch6-02', 'Power', ['baseValue', 'exponent'], 'int32', [
    'Nhận baseValue trong [-5, 5] và exponent từ 0 đến 10; trả lũy thừa nguyên. Đề quy ước mọi số mũ 0, kể cả 0^0, đều bằng 1.',
    'Ví dụ công khai: (-3)^3 = -27; 0^0 = 1 theo quy ước. Cơ số âm cho kết quả âm khi số mũ lẻ và không âm khi số mũ chẵn. Độ lớn lớn nhất 5^10 = 9 765 625 nằm trong int32.',
  ], [
    'Khởi tạo result = 1, giá trị trung hòa của phép nhân.',
    'Lặp exponent lần, mỗi lần nhân result với baseValue. Khi exponent = 0 thì không nhân lần nào nên kết quả vẫn là 1.',
    'Return result, tránh dùng phép lũy thừa số thực rồi ép kiểu.',
  ], [
    ['int result = 1;', 'Biến result lưu tích; giá trị ban đầu 1 đồng thời xử lý số mũ 0.'],
    ['for (int step = 0; step < exponent; step++)', 'step đếm số lần nhân từ 0 đến exponent - 1, tổng cộng đúng exponent lượt.'], '{',
    ['    result *= baseValue;', 'Nhân tích hiện tại với cơ số rồi gán lại; phép nhân tự giữ đúng dấu của cơ số âm.'], '}',
    ['return result;', 'Trả int là kết quả lũy thừa trong miền không tràn số đã cho.'],
  ], [
    ['let result = 1;', 'Dùng let cho tích thay đổi qua các lượt; bắt đầu 1 để đúng cả 0^0 theo đề.'],
    ['for (let step = 0; step < exponent; step++) {', 'Duyệt đúng số lần nhân cần thực hiện; exponent = 0 bỏ qua vòng lặp.'],
    ['    result *= baseValue;', 'Cập nhật tích bằng phép nhân number; mọi giá trị trong miền đề đều là số nguyên biểu diễn chính xác.'], '}',
    ['return result;', 'Trả number nguyên sau exponent lần nhân, không trả chuỗi.'],
  ], 'O(exponent + 1) — exponent phép nhân và các bước khởi tạo/return hằng số, kể cả số mũ 0.'),
  entry('ch6-03', 'Minimum', ['a', 'b'], 'int32', [
    'Nhận hai số nguyên a, b có trị tuyệt đối không quá 1 000 000; trả giá trị nhỏ hơn. Khi hai số bằng nhau, trả giá trị chung đó.',
    'Ví dụ công khai: (-4, 7) cho -4; (5, 5) cho 5. Cần so sánh giá trị có dấu, không so sánh trị tuyệt đối.',
  ], [
    'So sánh a < b. Nếu đúng chọn a, ngược lại chọn b bằng toán tử điều kiện.',
    'Khi bằng nhau, chọn b vẫn đúng vì a và b cùng giá trị; return trực tiếp giá trị được chọn.',
  ], [
    ['return a < b ? a : b;', 'Toán tử ?: chọn a nếu điều kiện a < b đúng, nếu không chọn b; return trả int nhỏ nhất, bao gồm trường hợp bằng nhau.'],
  ], [
    ['return a < b ? a : b;', 'So sánh hai number bằng <; ?: trả a hoặc b theo điều kiện, không đổi dấu hay chuyển chuỗi.'],
  ], 'O(1) — một phép so sánh và chọn giá trị trả về.'),
  entry('ch6-04', 'Lcm', ['a', 'b'], 'int32', [
    'Nhận hai số nguyên dương a, b từ 1 đến 10 000. Tách hàm phụ tìm GCD rồi trả bội dương chung nhỏ nhất, không chỉ một bội chung bất kỳ.',
    'Ví dụ công khai: gcd(15, 20) = 5 nên lcm = (15 / 5) × 20 = 60; hai số 7 và 7 cho 7. GCD dương vì input dương, nên phép chia không có mẫu 0.',
    'Chia a cho GCD trước khi nhân b để giảm giá trị trung gian. Với miền đề, a × b ≤ 100 000 000 nên kết quả vẫn nằm trong int32.',
  ], [
    'Khai báo hàm phụ Gcd(x, y) ngay trong hàm lời giải. Dùng Euclid: thay cặp (x, y) bởi (y, x % y) cho đến khi y bằng 0.',
    'Các tham số x, y là biến cục bộ của hàm phụ nên việc cập nhật không làm mất a, b ban đầu.',
    'Gọi Gcd(a, b), sau đó return (a / gcd) * b. Công thức loại phần thừa chung nên cho bội nhỏ nhất.',
  ], [
    ['int Gcd(int x, int y)', 'Khai báo local function trả int để tái sử dụng việc tìm ước chung; x, y nhận bản sao giá trị từ a, b.'], '{',
    ['    while (y != 0)', 'Chừng nào y chưa bằng 0 thì tiếp tục Euclid; đồng thời bảo đảm phép % có mẫu khác 0.'], '    {',
    ['        int remainder = x % y;', 'Tính phần dư trước khi đổi x, y để không ghi đè mất giá trị cần dùng.'],
    ['        x = y;', 'Đưa y cũ vào vị trí thứ nhất của cặp mới.'],
    ['        y = remainder;', 'Đưa phần dư vào vị trí thứ hai, làm bài toán giảm dần.'], '    }',
    ['    return x;', 'Khi y bằng 0, x là GCD dương của hai giá trị đầu vào.'], '}',
    ['int gcd = Gcd(a, b);', 'Gọi hàm phụ với a, b gốc và lưu ước chung lớn nhất.'],
    ['return (a / gcd) * b;', 'a chia hết cho gcd nên phép chia int là chính xác; nhân với b để trả LCM.'],
  ], [
    ['function Gcd(x, y) {', 'Hàm phụ lồng trong Lcm nhận hai number nguyên; việc gán x, y không thay đổi a, b bên ngoài.'],
    ['    while (y !== 0) {', 'Kiểm tra nghiêm ngặt y khác 0 trước khi lấy số dư.'],
    ['        const remainder = x % y;', 'Lưu số dư trong const trước hai phép gán cập nhật cặp.'],
    ['        x = y;', 'Chuyển giá trị y cũ sang x để tạo cặp Euclid tiếp theo.'],
    ['        y = remainder;', 'Chuyển phần dư sang y để tiến gần điều kiện dừng.'], '    }',
    ['    return x;', 'Trả GCD khi thuật toán lặp kết thúc.'], '}',
    ['const gcd = Gcd(a, b);', 'Gọi hàm phụ để lấy thừa số chung lớn nhất, không cần triển khai lại vòng lặp ở ngoài.'],
    ['return (a / gcd) * b;', 'Phép / cho giá trị nguyên vì chia hết; nhân b trả đúng LCM dưới dạng number nguyên.'],
  ], 'O(log(min(a, b))) cho Euclid trong trường hợp xấu nhất; phép chia và nhân cuối dùng O(1).'),
  entry('ch6-05', 'PalindromeNumber', ['n'], 'boolean', [
    'Nhận số không âm n ≤ 1 000 000 000; trả true nếu các chữ số thập phân đọc xuôi và ngược giống nhau.',
    'Ví dụ công khai: 12321 cho true, 120 cho false vì số đảo là 21. Số 0 và mọi số một chữ số đều đối xứng. Cần giữ n ban đầu để so sánh sau khi tách chữ số.',
    'Trong miền đề, n nhỏ hơn 10^9 có tối đa 9 chữ số nên số đảo không quá 999 999 999; riêng 10^9 đảo thành 1. Vì thế tích lũy số đảo bằng int32 an toàn ở đây.',
  ], [
    'Lưu original = n và khởi tạo reversed = 0.',
    'Trong khi n còn dương, lấy chữ số cuối bằng % 10, nối vào reversed bằng nhân 10 rồi cộng chữ số, sau đó chia nguyên n cho 10.',
    'Return phép so sánh reversed với original. Với n = 0, vòng lặp không chạy và hai giá trị vẫn đều bằng 0.',
  ], [
    ['int original = n;', 'Giữ bản sao số ban đầu vì n sẽ được chia nhỏ dần trong vòng lặp.'],
    ['int reversed = 0;', 'Khởi tạo số đảo chưa có chữ số.'],
    ['while (n > 0)', 'Tiếp tục cho đến khi đã tách hết chữ số của n.'], '{',
    ['    int digit = n % 10;', 'Lấy chữ số cuối của số không âm, giá trị nằm trong 0–9.'],
    ['    reversed = reversed * 10 + digit;', 'Dịch số đảo sang trái một chữ số và nối digit vào cuối.'],
    ['    n /= 10;', 'Chia nguyên int cho 10 để bỏ chữ số vừa xử lý.'], '}',
    ['return reversed == original;', 'Trả bool từ phép so sánh toàn bộ số đảo với số ban đầu.'],
  ], [
    ['const original = n;', 'Lưu số gốc trong const trước khi thay đổi biến tham số n.'],
    ['let reversed = 0;', 'Số đảo sẽ được cập nhật qua mỗi chữ số nên dùng let.'],
    ['while (n > 0) {', 'Duyệt các chữ số khi phần số còn lại chưa bằng 0.'],
    ['    const digit = n % 10;', 'Lấy chữ số cuối bằng phần dư của phép chia 10.'],
    ['    reversed = reversed * 10 + digit;', 'Nối digit vào số đảo bằng phép tính số học, không tạo chuỗi.'],
    ['    n = Math.floor(n / 10);', 'JavaScript chia số thực, nên dùng Math.floor để bỏ phần thập phân của số không âm.'], '}',
    ['return reversed === original;', 'So sánh nghiêm ngặt và trả boolean cho biết số có đối xứng hay không.'],
  ], 'O(d), d là số chữ số thập phân của n — mỗi lượt xử lý một chữ số; n = 0 xử lý trong O(1).'),
  entry('ch6-06', 'Divisors', ['n'], 'int32[]', [
    'Nhận số nguyên dương n ≤ 100 000. Trả mảng tất cả ước dương theo thứ tự tăng dần, mỗi ước chỉ xuất hiện một lần.',
    'Ví dụ công khai: 12 cho [1, 2, 3, 4, 6, 12]; 1 cho [1]. Với số chính phương, cặp ước tại căn bậc hai trùng nhau nên không được thêm hai lần.',
  ], [
    'Duyệt divisor từ 1 đến căn n. Khi chia hết, thêm divisor vào danh sách small và ước ghép cặp n / divisor vào large nếu khác divisor.',
    'small tăng dần khi divisor tăng; các ước ghép cặp trong large lại giảm dần. Đảo large rồi nối sau small để có kết quả tăng dần mà không cần sắp xếp toàn bộ.',
    'Return mảng số nguyên, không in từng ước ra Console. Hai danh sách chỉ là biến cục bộ của lời giải.',
  ], [
    ['var small = new System.Collections.Generic.List<int>();', 'Tạo danh sách các ước nhỏ. var được C# suy luận là List<int>, không phải kiểu động.'],
    ['var large = new System.Collections.Generic.List<int>();', 'Danh sách thứ hai giữ ước ghép cặp lớn hơn căn n.'],
    ['for (int divisor = 1; divisor * divisor <= n; divisor++)', 'Xét ứng viên từ 1 đến căn n, gồm cả căn nếu n là số chính phương.'], '{',
    ['    if (n % divisor == 0)', 'Chỉ xử lý ứng viên thực sự chia hết n.'], '    {',
    ['        small.Add(divisor);', 'Thêm ước nhỏ vào small theo thứ tự tăng của vòng lặp.'],
    ['        int paired = n / divisor;', 'Tính ước còn lại của cặp bằng phép chia int đã biết chia hết.'],
    ['        if (paired != divisor)', 'Tránh thêm lần thứ hai cùng một ước tại căn bậc hai.'], '        {',
    ['            large.Add(paired);', 'Thêm ước lớn; khi divisor tăng, các giá trị paired giảm dần.'], '        }', '    }', '}',
    ['large.Reverse();', 'Đảo danh sách các ước lớn để nó trở thành tăng dần.'],
    ['small.AddRange(large);', 'Nối các ước lớn sau các ước nhỏ; mọi phần tử vẫn đúng thứ tự và không trùng.'],
    ['return small.ToArray();', 'Chuyển List<int> thành int[] đúng kiểu trả về mà IDE yêu cầu.'],
  ], [
    ['const small = [];', 'Tạo mảng cục bộ cho các ước nhỏ; const vẫn cho phép thêm phần tử.'],
    ['const large = [];', 'Mảng này giữ các ước ghép cặp lớn, ban đầu theo thứ tự giảm dần.'],
    ['for (let divisor = 1; divisor * divisor <= n; divisor++) {', 'Duyệt ứng viên đến căn n, không bỏ ước ở đúng căn nhờ <=.'],
    ['    if (n % divisor === 0) {', 'Kiểm tra chia hết bằng % và so sánh nghiêm ngặt với 0.'],
    ['        small.push(divisor);', 'Thêm ước nhỏ theo thứ tự tăng dần.'],
    ['        const paired = n / divisor;', 'Lấy ước ghép cặp; kết quả là số nguyên vì phép chia đã được kiểm tra chia hết.'],
    ['        if (paired !== divisor) {', 'Chỉ thêm paired nếu khác ước đã thêm, tránh trùng căn bậc hai.'],
    ['            large.push(paired);', 'Lưu ước lớn để ghép vào kết quả sau.'], '        }', '    }', '}',
    ['large.reverse();', 'Đảo tại chỗ mảng cục bộ large để các phần tử tăng dần.'],
    ['return small.concat(large);', 'concat tạo mảng mới gồm small rồi large, đúng kiểu mảng number nguyên và đúng thứ tự.'],
  ], 'O(√n + d), d là số ước — thử đến căn n, rồi đảo/nối các danh sách gồm d phần tử.', 'O(d) — hai danh sách ước và mảng kết quả tăng theo số lượng ước; không dùng đệ quy.'),
  entry('ch6-07', 'Choose', ['n', 'k'], 'int32', [
    'Nhận 0 ≤ k ≤ n ≤ 20; trả số cách chọn k vị trí từ n phần tử phân biệt, không xét thứ tự chọn. C(n,0) = C(n,n) = 1, kể cả C(0,0).',
    'Ví dụ công khai: C(8,3) = 56; C(0,0) = 1. Dùng đồng nhất thức Pascal để tránh tính giai thừa trung gian lớn, dù kết quả cuối vẫn nằm trong int32.',
  ], [
    'Trả 1 ngay cho k = 0 hoặc k = n.',
    'Dùng ways[column] lưu hệ số của hàng Pascal trước. Khởi tạo ways[0] = 1; mọi ô khác bằng 0.',
    'Với mỗi row từ 1 đến n, cập nhật column từ min(row,k) giảm xuống 1: ways[column] += ways[column-1]. Duyệt giảm để không dùng nhầm giá trị vừa cập nhật của hàng hiện tại.',
    'Sau hàng n, return ways[k]. Đây là cách tổ chức tính toán hoàn toàn trong hàm Choose, không cần đệ quy.',
  ], [
    ['if (k == 0 || k == n)', 'Nhận hai biên có đúng một cách chọn: không chọn phần tử nào hoặc chọn tất cả.'], '{',
    ['    return 1;', 'Trả hệ số tổ hợp ở biên, bao gồm trường hợp n = k = 0.'], '}',
    ['int[] ways = new int[k + 1];', 'Chỉ lưu k + 1 hệ số từ cột 0 đến k; các ô int ban đầu bằng 0.'],
    ['ways[0] = 1;', 'Cột 0 của mọi hàng Pascal luôn bằng 1.'],
    ['for (int row = 1; row <= n; row++)', 'Xây lần lượt các hàng tương ứng số phần tử từ 1 đến n.'], '{',
    ['    int last = System.Math.Min(row, k);', 'Không cần cột vượt row hoặc vượt cột k muốn lấy.'],
    ['    for (int column = last; column >= 1; column--)', 'Cập nhật từ phải sang trái để ways[column-1] vẫn thuộc hàng trước.'], '    {',
    ['        ways[column] += ways[column - 1];', 'Áp dụng C(row,column) = C(row-1,column) + C(row-1,column-1), giữ phần cũ và cộng phần chọn thêm.'], '    }', '}',
    ['return ways[k];', 'Trả hệ số cột k của hàng n dưới dạng int.'],
  ], [
    ['if (k === 0 || k === n) {', 'Kiểm tra nghiêm ngặt hai trường hợp biên có đúng một cách chọn.'],
    ['    return 1;', 'Trả number 1, kể cả khi n và k đều bằng 0.'], '}',
    ['const ways = new Array(k + 1).fill(0);', 'Khởi tạo mảng hệ số bằng 0; const giữ mảng nhưng cho phép cập nhật các phần tử.'],
    ['ways[0] = 1;', 'Đặt trạng thái chọn 0 phần tử bằng 1.'],
    ['for (let row = 1; row <= n; row++) {', 'Duyệt các hàng Pascal đến đúng hàng n.'],
    ['    const last = Math.min(row, k);', 'Giới hạn cột cần tính theo cả số phần tử hiện có và k.'],
    ['    for (let column = last; column >= 1; column--) {', 'Duyệt cột giảm để tránh cộng lại giá trị đã thay đổi trong cùng hàng.'],
    ['        ways[column] += ways[column - 1];', 'Cộng hai hệ số của hàng trước theo đồng nhất thức Pascal; miền n ≤ 20 cho kết quả nguyên chính xác.'], '    }', '}',
    ['return ways[k];', 'Trả số cách chọn k phần tử từ n phần tử.'],
  ], 'O(nk) khi 0 < k < n — xây n hàng, mỗi hàng tối đa k cột; hai trường hợp biên trả trong O(1).', 'O(k + 1) cho mảng hệ số; các trường hợp biên không cấp phát mảng và dùng O(1).'),
  entry('ch6-08', 'DigitalRoot', ['n'], 'int32', [
    'Nhận số không âm n ≤ 1 000 000 000. Viết hàm phụ cộng các chữ số, rồi áp dụng nhiều lần cho đến khi chỉ còn một chữ số; trả chữ số đó.',
    'Ví dụ công khai: 9876 → 9 + 8 + 7 + 6 = 30 → 3, nên trả 3; 0 trả 0. Các số 0–9 đã là kết quả, không cần gọi hàm phụ.',
  ], [
    'Khai báo DigitSum(value) trả tổng các chữ số bằng vòng lặp lấy % 10 và chia nguyên cho 10.',
    'Trong DigitalRoot, khi n ≥ 10 thì gán n = DigitSum(n). Không dừng ngay sau một lần cộng nếu tổng vẫn có nhiều chữ số.',
    'Return n khi còn một chữ số. Dùng hàm phụ đúng yêu cầu, không thay bằng công thức modulo 9 trong lời giải.',
  ], [
    ['int DigitSum(int value)', 'Local function nhận bản sao số cần cộng chữ số và trả int tổng; không thay đổi n của hàm ngoài trực tiếp.'], '{',
    ['    int sum = 0;', 'Khởi tạo tổng chữ số bằng 0, cũng đúng nếu value bằng 0.'],
    ['    while (value > 0)', 'Lặp khi số trong hàm phụ vẫn còn chữ số cần tách.'], '    {',
    ['        sum += value % 10;', 'Lấy chữ số cuối rồi cộng vào tổng.'],
    ['        value /= 10;', 'Chia nguyên int để loại chữ số vừa cộng.'], '    }',
    ['    return sum;', 'Trả tổng chữ số đã tính, chưa nhất thiết chỉ có một chữ số.'], '}',
    ['while (n >= 10)', 'Tiếp tục rút gọn khi n vẫn có từ hai chữ số trở lên.'], '{',
    ['    n = DigitSum(n);', 'Gọi hàm phụ và dùng tổng mới làm đầu vào lượt tiếp theo.'], '}',
    ['return n;', 'Trả chữ số cuối cùng; n = 0 ban đầu vẫn trả đúng 0.'],
  ], [
    ['function DigitSum(value) {', 'Hàm phụ nhận một number nguyên không âm để tính tổng chữ số riêng.'],
    ['    let sum = 0;', 'Biến tổng có thể tăng theo từng chữ số; value = 0 sẽ giữ sum bằng 0.'],
    ['    while (value > 0) {', 'Duyệt các chữ số của giá trị cục bộ.'],
    ['        sum += value % 10;', 'Cộng chữ số cuối vào sum bằng toán tử +=.'],
    ['        value = Math.floor(value / 10);', 'Làm tròn xuống sau chia 10 để mô phỏng chia nguyên của số không âm.'], '    }',
    ['    return sum;', 'Trả number nguyên là tổng chữ số của một lượt rút gọn.'], '}',
    ['while (n >= 10) {', 'Nếu tổng vẫn có nhiều chữ số thì cần gọi lại hàm phụ.'],
    ['    n = DigitSum(n);', 'Cập nhật n bằng kết quả mới, không chỉ tính tổng rồi bỏ qua.'], '}',
    ['return n;', 'Kết quả còn một chữ số nên trả number nguyên n.'],
  ], 'O(d) trong miền đề, d là số chữ số của n — lượt đầu tối đa 10 chữ số; sau đó giá trị không quá 81 nên các lượt còn lại rất ngắn.'),
  entry('ch6-09', 'PrimesInRange', ['left', 'right'], 'int32', [
    'Nhận 0 ≤ left ≤ right ≤ 10 000. Tách hàm kiểm tra nguyên tố rồi đếm trong đoạn đóng [left, right], bao gồm cả hai đầu nếu chúng là số nguyên tố.',
    'Ví dụ công khai: [10, 23] có 11, 13, 17, 19, 23 nên trả 5; [0, 1] trả 0. Đoạn một phần tử vẫn cần kiểm tra phần tử đó; 0 và 1 không nguyên tố.',
  ], [
    'Hàm phụ IsPrime(n) loại n < 2 rồi thử ước từ 2 đến căn n. Có ước thì false, không có thì true.',
    'Hàm chính duyệt value từ left đến right bằng điều kiện ≤. Gọi IsPrime(value) cho từng số và tăng count khi kết quả true.',
    'Return count. Hàm phụ dùng lại cho mọi phần tử, không chép lại logic thử ước vào vòng đếm.',
  ], [
    ['bool IsPrime(int n)', 'Khai báo local function trả bool để tách riêng nhiệm vụ kiểm tra một số.'], '{',
    ['    if (n < 2)', 'Theo định nghĩa, 0 và 1 không phải số nguyên tố.'], '    {',
    ['        return false;', 'Kết thúc hàm phụ sớm với false cho các số nhỏ hơn 2.'], '    }',
    ['    for (int divisor = 2; divisor * divisor <= n; divisor++)', 'Thử ước đến căn bậc hai, gồm cả căn để xử lý số chính phương.'], '    {',
    ['        if (n % divisor == 0)', 'Tìm thấy ước không tầm thường nếu phần dư bằng 0.'], '        {',
    ['            return false;', 'Có một ước là đủ chứng minh hợp số, không cần thử tiếp.'], '        }', '    }',
    ['    return true;', 'Không có ước trong miền đủ kiểm tra, nên hàm phụ kết luận nguyên tố.'], '}',
    ['int count = 0;', 'Bộ đếm nguyên tố ban đầu bằng 0.'],
    ['for (int value = left; value <= right; value++)', 'Duyệt đoạn đóng, gồm cả right nhờ <=.'], '{',
    ['    if (IsPrime(value))', 'Gọi hàm phụ cho số hiện tại thay vì lặp lại logic kiểm tra.'], '    {',
    ['        count++;', 'Cộng một khi hàm phụ trả true.'], '    }', '}',
    ['return count;', 'Trả int là số lượng nguyên tố trong đoạn, không trả danh sách.'],
  ], [
    ['function IsPrime(n) {', 'Hàm phụ lồng trong lời giải nhận một number nguyên và trả boolean.'],
    ['    if (n < 2) {', 'Loại 0 và 1 theo định nghĩa nguyên tố.'],
    ['        return false;', 'Trả false ngay cho các input nhỏ hơn 2.'], '    }',
    ['    for (let divisor = 2; divisor * divisor <= n; divisor++) {', 'Thử từng ước đến căn n; tích bình phương nằm an toàn trong miền nhỏ của bài.'],
    ['        if (n % divisor === 0) {', 'Kiểm tra chia hết bằng phần dư và so sánh nghiêm ngặt.'],
    ['            return false;', 'Kết thúc sớm khi tìm thấy ước của hợp số.'], '        }', '    }',
    ['    return true;', 'Trả true sau khi không tìm thấy ước cần loại.'], '}',
    ['let count = 0;', 'Khai báo bộ đếm có thể tăng trong vòng duyệt đoạn.'],
    ['for (let value = left; value <= right; value++) {', 'Duyệt từ left đến cả right, không bỏ sót đầu phải.'],
    ['    if (IsPrime(value)) {', 'Gọi hàm phụ và dùng trực tiếp boolean kết quả làm điều kiện.'],
    ['        count++;', 'Tăng số lượng khi value là số nguyên tố.'], '    }', '}',
    ['return count;', 'Trả number nguyên là tổng số nguyên tố trong đoạn.'],
  ], 'O(w√(right + 1)) trong trường hợp xấu nhất, w = right - left + 1 — mỗi số thử ước đến căn; n < 2 được loại trong O(1).'),
]
