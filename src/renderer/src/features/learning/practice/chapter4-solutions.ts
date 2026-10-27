import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { ExerciseSolution } from './solutions'

// Public-statement teaching content only. Explained tuples are single meaningful
// source lines; punctuation-only strings remain exclusively in complete source.
type SourceLine = string | readonly [code: string, explanation: string]
function source(signature: ExerciseSolution['signature'], language: ExerciseLanguage, body: SourceLine[]) {
  const parameters = signature.parameters.map(parameter => language === 'csharp' ? `int ${parameter.name}` : parameter.name).join(', ')
  const returns = signature.returnType === 'boolean' ? 'bool' : 'int'
  const header: SourceLine[] = language === 'csharp' ? [
    ['public class Solution', 'Khai báo lớp Solution công khai theo mẫu C# của IDE, không viết chương trình Main.'], '{',
    [`    public ${returns} ${signature.functionName}(${parameters})`, `Phương thức instance ${signature.functionName} nhận ${parameters} và trả ${returns}; giữ nguyên tên, thứ tự và kiểu tham số để IDE gọi đúng hàm.`], '    {',
  ] : [[`function ${signature.functionName}(${parameters}) {`, `Khai báo hàm ${signature.functionName} với tham số ${parameters}. Input là number nguyên được IDE truyền theo contract; hàm trả ${signature.returnType === 'boolean' ? 'boolean' : 'number nguyên'}, không tự đọc stdin hoặc gọi hàm.`]]
  const indent = language === 'csharp' ? '        ' : '    '
  const rows = [...header, ...body.map<SourceLine>(line => typeof line === 'string' ? indent + line : [indent + line[0], line[1]]),
    ...(language === 'csharp' ? ['    }', '}'] : ['}'])]
  return { code: rows.map(line => typeof line === 'string' ? line : line[0]).join('\n'),
    lines: rows.flatMap((line, index) => typeof line === 'string' ? [] : [{ code: line[0], explanation: line[1], lineNumber: index + 1 }]) }
}
function entry(id: string, name: string, parameters: string[], returns: 'int32' | 'boolean', analysis: string[], algorithm: string[], csharp: SourceLine[], javascript: SourceLine[], time: string, space = 'O(1) — chỉ dùng một số cố định biến cục bộ, không đệ quy hoặc cấp phát bộ nhớ tăng theo input.'): ExerciseSolution {
  const signature: ExerciseSolution['signature'] = { functionName: name, parameters: parameters.map(parameter => ({ name: parameter, type: 'int32' })), returnType: returns }
  return { exerciseId: id, signature, analysis: [...analysis, 'Input được truyền qua tham số và nằm trong giới hạn của đề. Chỉ return kết quả, không đọc/ghi Console hoặc STDIN/STDOUT.'], algorithm,
    languages: { csharp: source(signature, 'csharp', csharp), javascript: source(signature, 'javascript', javascript) }, complexity: { time, space } }
}

export const chapter4Solutions: ExerciseSolution[] = [
  entry('ch4-01', 'SumToN', ['n'], 'int32', [
    'Nhận số nguyên n trong [0, 10 000]; dùng vòng lặp cộng từ 1 đến n, bao gồm n. Output là tổng nguyên, không phải danh sách các số.',
    'Ví dụ công khai: n = 6 cho 1 + 2 + 3 + 4 + 5 + 6 = 21; n = 0 cho 0 vì không có số nào cần cộng. Tổng lớn nhất là 50 005 000, nằm trong int32.',
  ], [
    'Khởi tạo sum = 0, giá trị trung hòa của phép cộng.',
    'Cho i đi từ 1 đến n bằng vòng for; mỗi lượt cộng i vào sum. Dùng i ≤ n để không bỏ số cuối. Khi n = 0, vòng lặp không chạy.',
    'Trả sum sau vòng lặp. Không dùng công thức thay thế vì đề yêu cầu thực hành vòng lặp.',
  ], [
    ['int sum = 0;', 'Biến int sum lưu tổng các số đã xét; bắt đầu bằng 0 để cả trường hợp n = 0 đều đúng.'],
    ['for (int i = 1; i <= n; i++)', 'Khởi tạo biến đếm i = 1; kiểm tra i <= n trước mỗi lượt; i++ tăng i một đơn vị sau lượt lặp.'], '{',
    ['    sum += i;', 'Cộng giá trị i hiện tại vào sum bằng +=; sau lượt này sum chứa tổng từ 1 đến i.'], '}',
    ['return sum;', 'Trả tổng int đã tích lũy sau khi xét đủ các số đến n.'],
  ], [
    ['let sum = 0;', 'Khai báo let sum vì tổng sẽ thay đổi; giá trị ban đầu 0 cũng là đáp án khi n = 0.'],
    ['for (let i = 1; i <= n; i++) {', 'let i là biến đếm; vòng for xét các giá trị từ 1 đến n, gồm cả n nhờ <=. i++ tăng một sau mỗi lượt.'],
    ['    sum += i;', 'Cộng number i vào sum; trong miền input, mọi tổng trung gian đều là số nguyên biểu diễn chính xác.'], '}',
    ['return sum;', 'Trả number nguyên là tổng, không dùng console.log thay cho return.'],
  ], 'O(n) — có n lượt cộng khi n > 0; với n = 0 chỉ khởi tạo và trả kết quả.'),
  entry('ch4-02', 'Factorial', ['n'], 'int32', [
    'Nhận n từ 0 đến 12; tính tích 1 × 2 × … × n bằng vòng lặp và trả số nguyên. Quy ước 0! = 1.',
    'Ví dụ công khai: 6! = 720; 0! = 1. Không khởi tạo tích bằng 0 vì mọi phép nhân sau đó đều sẽ cho 0. Giá trị 12! = 479 001 600 vẫn nằm trong int32.',
  ], [
    'Đặt product = 1, giá trị trung hòa của phép nhân.',
    'Nhân lần lượt các số từ 2 đến n vào product. Không cần nhân 1; khi n bằng 0 hoặc 1, vòng lặp không chạy và product vẫn đúng là 1.',
    'Return product sau vòng lặp; không dùng đệ quy.',
  ], [
    ['int product = 1;', 'Biến int product lưu tích, bắt đầu bằng 1 để xử lý đúng cả 0! và 1!.'],
    ['for (int i = 2; i <= n; i++)', 'Biến i duyệt các thừa số từ 2 đến n; <= bao gồm n, i++ chuyển sang thừa số tiếp theo.'], '{',
    ['    product *= i;', '*= nhân tích hiện tại với i rồi gán lại; sau lượt i, product bằng i!.'], '}',
    ['return product;', 'Trả giai thừa dưới dạng int; giới hạn n ≤ 12 bảo đảm không tràn số.'],
  ], [
    ['let product = 1;', 'Dùng let cho tích có thể gán lại; bắt đầu 1 để không làm mất kết quả của phép nhân.'],
    ['for (let i = 2; i <= n; i++) {', 'Duyệt các thừa số từ 2 đến n. Với n = 0 hoặc 1, điều kiện sai ngay nên giữ product = 1.'],
    ['    product *= i;', 'Nhân product với i rồi lưu lại; các giá trị đến 12! là số nguyên number chính xác.'], '}',
    ['return product;', 'Trả number nguyên là giai thừa đã tính bằng vòng lặp.'],
  ], 'O(n) — tối đa n - 1 lượt nhân; n bằng 0 hoặc 1 là trường hợp hằng số.'),
  entry('ch4-03', 'DigitCount', ['n'], 'int32', [
    'Input là n không âm, tối đa 1 000 000 000. Trả số chữ số trong biểu diễn thập phân; chữ số 0 ở giữa vẫn phải được đếm.',
    'Ví dụ công khai: 4008 có 4 chữ số; số 0 có 1 chữ số. Khi bỏ dần chữ số cuối, phải dùng phép chia nguyên, không giữ phần thập phân.',
  ], [
    'Khởi tạo count = 0. Dùng do…while để xử lý ít nhất một chữ số, kể cả khi n = 0.',
    'Mỗi lượt tăng count rồi bỏ chữ số cuối bằng chia nguyên cho 10. Tiếp tục khi phần số còn lại lớn hơn 0.',
    'Return count. Việc thay đổi tham số cục bộ n không sửa draft hay dữ liệu lưu của Editor.',
  ], [
    ['int count = 0;', 'Biến int count đếm số chữ số đã xử lý, ban đầu chưa có chữ số nào.'],
    ['do', 'do thực hiện thân vòng lặp trước lần kiểm tra đầu tiên, nên số 0 cũng được đếm một lần.'], '{',
    ['    count++;', 'Tăng bộ đếm thêm 1 cho chữ số cuối của n hiện tại.'],
    ['    n /= 10;', 'Vì n là int không âm, /= 10 chia nguyên và bỏ phần dư, tương đương xóa chữ số cuối.'], '}',
    ['while (n > 0);', 'Nếu còn chữ số thì lặp tiếp; dấu chấm phẩy kết thúc cấu trúc do…while của C#.'],
    ['return count;', 'Trả số lượng chữ số đã đếm, bao gồm đúng một chữ số cho n ban đầu bằng 0.'],
  ], [
    ['let count = 0;', 'Khai báo bộ đếm count có thể tăng sau mỗi chữ số.'],
    ['do {', 'Thực hiện thân do ít nhất một lượt; đây là cách xử lý trường hợp n = 0 mà không cần nhánh riêng.'],
    ['    count++;', 'Cộng một vào số chữ số đã xử lý.'],
    ['    n = Math.floor(n / 10);', 'Phép / của JavaScript trả number thập phân; Math.floor làm tròn xuống vì n không âm, tạo phép chia nguyên để bỏ chữ số cuối.'], '}',
    ['while (n > 0);', 'Kiểm tra phần số còn lại; chỉ tiếp tục khi n vẫn dương.'],
    ['return count;', 'Trả number nguyên là số chữ số của input ban đầu.'],
  ], 'O(d), với d là số chữ số thập phân của n — mỗi lượt loại một chữ số; n = 0 có d = 1.'),
  entry('ch4-04', 'ReverseNumber', ['n'], 'int32', [
    'Nhận số nguyên không âm n ≤ 100 000 000; dùng vòng lặp đảo các chữ số và trả số nguyên. Các số 0 đứng đầu kết quả đảo sẽ tự biến mất trong biểu diễn số.',
    'Ví dụ công khai: 4020 đảo thành chuỗi chữ số 0204 nhưng kết quả số nguyên là 204; 0 trả 0. Đề bảo đảm kết quả nằm trong int32.',
  ], [
    'Khởi tạo reversed = 0. Khi n còn dương, lấy digit = n % 10 là chữ số cuối.',
    'Dịch kết quả đang xây sang trái một chữ số bằng reversed * 10, rồi cộng digit. Bỏ chữ số cuối của n bằng phép chia nguyên cho 10.',
    'Return reversed. Nếu n ban đầu bằng 0, không có lượt lặp và kết quả vẫn là 0.',
  ], [
    ['int reversed = 0;', 'Biến int reversed chứa phần số đã đảo; bắt đầu bằng 0 để không giữ số 0 thừa ở đầu.'],
    ['while (n > 0)', 'Lặp khi còn chữ số của n cần đưa vào kết quả.'], '{',
    ['    int digit = n % 10;', '% 10 lấy chữ số cuối, có giá trị từ 0 đến 9 vì input không âm.'],
    ['    reversed = reversed * 10 + digit;', 'Nhân 10 để tạo một vị trí mới bên phải kết quả, rồi đặt digit vào vị trí đó.'],
    ['    n /= 10;', 'Chia nguyên n cho 10 để bỏ chữ số vừa xử lý.'], '}',
    ['return reversed;', 'Trả số nguyên đảo hoàn chỉnh; n = 0 từ đầu sẽ trả 0.'],
  ], [
    ['let reversed = 0;', 'Khai báo let reversed để xây dần số đảo và gán lại qua các lượt lặp.'],
    ['while (n > 0) {', 'Tiếp tục khi phần số chưa xử lý vẫn còn chữ số.'],
    ['    const digit = n % 10;', 'const digit giữ chữ số cuối của n trong lượt hiện tại; không cần gán lại biến này.'],
    ['    reversed = reversed * 10 + digit;', 'Thêm chữ số digit vào cuối kết quả số học; số 0 ở đầu kết quả không tạo thêm giá trị.'],
    ['    n = Math.floor(n / 10);', 'Math.floor bỏ phần thập phân sau phép chia 10, đúng với chia nguyên trên input không âm.'], '}',
    ['return reversed;', 'Trả number nguyên đúng kiểu bài yêu cầu, không trả chuỗi đã đảo.'],
  ], 'O(d), với d là số chữ số của n — mỗi lượt lấy và loại một chữ số; n = 0 xử lý trong thời gian hằng số.'),
  entry('ch4-05', 'Gcd', ['a', 'b'], 'int32', [
    'Nhận hai số nguyên dương a, b không quá 1 000 000; trả ước chung lớn nhất bằng thuật toán lặp. Không yêu cầu a ≥ b.',
    'Ví dụ công khai: gcd(42, 30) = 6; gcd(17, 5) = 1. Khi hai số bằng nhau, kết quả là chính số đó; khi một số là 1, kết quả là 1.',
  ], [
    'Dùng thuật toán Euclid: gcd(a, b) = gcd(b, a % b). Ước chung của a và b cũng chia hết phần dư, và ngược lại.',
    'Trong khi b khác 0, lưu remainder trước, rồi chuyển a = b và b = remainder. Không gán lại a trước khi tính phần dư.',
    'Phần dư luôn nhỏ hơn b nên thuật toán kết thúc; khi b bằng 0, a là ước chung lớn nhất cần trả.',
  ], [
    ['while (b != 0)', 'Tiếp tục khi b chưa bằng 0; điều kiện này cũng bảo đảm phép % trong thân không chia cho 0.'], '{',
    ['    int remainder = a % b;', 'Lưu phần dư của a chia b trước khi thay đổi hai biến.'],
    ['    a = b;', 'Đưa giá trị b cũ sang vị trí số thứ nhất của cặp Euclid mới.'],
    ['    b = remainder;', 'Đưa phần dư sang số thứ hai; phần dư giảm kích thước bài toán.'], '}',
    ['return a;', 'Khi b = 0, số a còn lại chính là ước chung lớn nhất, luôn dương với input hợp lệ.'],
  ], [
    ['while (b !== 0) {', 'So sánh nghiêm ngặt để kiểm tra b chưa bằng 0, tránh phép chia dư với mẫu 0.'],
    ['    const remainder = a % b;', 'Tính và lưu phần dư trong const trước khi gán lại a, b. Các input nguyên dương nên phần dư không âm.'],
    ['    a = b;', 'Chuyển b cũ sang a cho cặp tiếp theo.'],
    ['    b = remainder;', 'Chuyển phần dư sang b; việc gán hai bước dùng biến tạm để không mất giá trị.'], '}',
    ['return a;', 'Trả number nguyên dương còn lại khi Euclid kết thúc.'],
  ], 'O(log(min(a, b))) — số lượt Euclid tăng theo logarit của số nhỏ hơn; sau bước đổi thứ tự ban đầu, các phần dư giảm nhanh.'),
  entry('ch4-06', 'IsPrime', ['n'], 'boolean', [
    'Nhận n từ 0 đến 1 000 000 và trả boolean. Số nguyên tố phải lớn hơn 1 và chỉ có hai ước dương là 1 với chính nó; 0 và 1 không nguyên tố.',
    'Ví dụ công khai: 29 trả true, 1 trả false. Với số chính phương như 49, cần kiểm tra cả ước đúng bằng căn bậc hai.',
  ], [
    'Return false ngay khi n < 2.',
    'Thử các divisor từ 2 khi divisor * divisor ≤ n. Nếu n hợp số, trong một cặp ước luôn có ít nhất một ước không quá căn bậc hai của n.',
    'Nếu chia hết cho divisor nào thì return false. Nếu duyệt hết mà không tìm thấy ước thì return true.',
  ], [
    ['if (n < 2)', 'Loại 0 và 1 vì chúng không thỏa định nghĩa số nguyên tố.'], '{',
    ['    return false;', 'Trả bool false ngay cho input nhỏ hơn 2.'], '}',
    ['for (int divisor = 2; divisor * divisor <= n; divisor++)', 'Thử từng ước từ 2 đến căn bậc hai, gồm cả điểm bằng nhờ <=. Với n ≤ 1 000 000, tích divisor * divisor nằm an toàn trong int.'], '{',
    ['    if (n % divisor == 0)', 'Nếu phần dư bằng 0, đã tìm được ước khác 1 và n.'], '    {',
    ['        return false;', 'Kết thúc sớm khi chứng minh n là hợp số.'], '    }', '}',
    ['return true;', 'Không tìm thấy ước trong miền đủ kiểm tra nên n là số nguyên tố.'],
  ], [
    ['if (n < 2) {', 'Loại hai giá trị 0 và 1 trước khi thử ước.'],
    ['    return false;', 'Trả boolean false cho các input không thể nguyên tố.'], '}',
    ['for (let divisor = 2; divisor * divisor <= n; divisor++) {', 'Duyệt ước từ 2 đến căn bậc hai; dùng tích bình phương để tránh làm tròn căn. divisor++ tăng một sau mỗi lượt.'],
    ['    if (n % divisor === 0) {', '% lấy dư; === 0 phát hiện chia hết, bao gồm ước ở đúng căn của số chính phương.'],
    ['        return false;', 'Trả false ngay khi tìm thấy ước, không cần xét các ước còn lại.'], '    }', '}',
    ['return true;', 'Nếu không có ước nào trong miền đã xét, trả boolean true.'],
  ], 'O(√n) trong trường hợp xấu nhất — thử tối đa các số từ 2 đến căn bậc hai của n; có thể dừng sớm nếu tìm được ước.'),
  entry('ch4-07', 'PrimeCount', ['n'], 'int32', [
    'Nhận n trong [0, 100 000]; đếm các số nguyên tố trong đoạn đóng [2, n] và trả số lượng. Nếu n < 2 thì không có số nguyên tố nào.',
    'Ví dụ công khai: đến 20 có 8 số nguyên tố là 2, 3, 5, 7, 11, 13, 17, 19; đến 1 có 0. Khi n tự là số nguyên tố, phải tính cả n.',
  ], [
    'Dùng sàng Eratosthenes: composite[x] đánh dấu x đã được xác định là hợp số. Mảng có n + 1 ô để chỉ số n hợp lệ.',
    'Duyệt prime từ 2 đến căn n. Nếu prime chưa bị đánh dấu thì đánh dấu các bội của nó bắt đầu từ prime * prime: các bội nhỏ hơn đã có ước nguyên tố nhỏ hơn xử lý trước.',
    'Sau khi sàng, duyệt từ 2 đến n và đếm các ô chưa đánh dấu. Không đếm chỉ số 0 hoặc 1 dù giá trị đánh dấu ban đầu của chúng cũng false.',
  ], [
    ['if (n < 2)', 'Không có số nguyên tố trong đoạn cần đếm khi n bằng 0 hoặc 1.'], '{',
    ['    return 0;', 'Trả số lượng bằng 0 trước khi cấp phát mảng sàng.'], '}',
    ['bool[] composite = new bool[n + 1];', 'Tạo mảng bool có chỉ số 0 đến n; C# khởi tạo mọi ô bằng false, nghĩa là chưa đánh dấu hợp số.'],
    ['for (int prime = 2; prime * prime <= n; prime++)', 'Xét các ứng viên ước nguyên tố đến căn n; mọi hợp số ≤ n có một ước nguyên tố trong miền này.'], '{',
    ['    if (!composite[prime])', '! phủ định dấu hợp số; prime chưa bị đánh dấu là số nguyên tố dùng để sàng.'], '    {',
    ['        for (int multiple = prime * prime; multiple <= n; multiple += prime)', 'Bắt đầu từ bình phương prime; mỗi lượt tăng thêm prime để đi qua các bội, gồm cả n nếu chia hết.'], '        {',
    ['            composite[multiple] = true;', 'Đánh dấu multiple là hợp số vì có ước prime khác 1 và chính nó.'], '        }', '    }', '}',
    ['int count = 0;', 'Khởi tạo biến đếm số nguyên tố sau khi đã đánh dấu xong hợp số.'],
    ['for (int value = 2; value <= n; value++)', 'Duyệt miền [2, n], không tính 0, 1 và không bỏ sót n.'], '{',
    ['    if (!composite[value])', 'Ô chưa đánh dấu trong miền này tương ứng với một số nguyên tố.'], '    {',
    ['        count++;', 'Tăng số lượng thêm một cho số nguyên tố vừa tìm thấy.'], '    }', '}',
    ['return count;', 'Trả số lượng int, không trả mảng đánh dấu hoặc danh sách các số.'],
  ], [
    ['if (n < 2) {', 'Xét riêng n bằng 0 hoặc 1 để đoạn cần đếm không chứa số nguyên tố.'],
    ['    return 0;', 'Trả number 0 cho miền không có số nguyên tố.'], '}',
    ['const composite = new Array(n + 1).fill(false);', 'Tạo mảng n + 1 ô rồi fill(false) để mọi vị trí đều có boolean. const giữ tham chiếu mảng, vẫn cho phép đổi từng phần tử.'],
    ['for (let prime = 2; prime * prime <= n; prime++) {', 'Duyệt ứng viên từ 2 đến căn n; tăng prime sau mỗi lượt.'],
    ['    if (!composite[prime]) {', 'Chỉ sàng với ứng viên chưa bị đánh dấu, tức prime là số nguyên tố.'],
    ['        for (let multiple = prime * prime; multiple <= n; multiple += prime) {', 'Duyệt bội từ prime bình phương, tăng theo bước prime; các bội nhỏ hơn đã được sàng trước.'],
    ['            composite[multiple] = true;', 'Gán true cho ô của hợp số vừa gặp.'], '        }', '    }', '}',
    ['let count = 0;', 'Khai báo bộ đếm có thể tăng trong vòng duyệt kết quả.'],
    ['for (let value = 2; value <= n; value++) {', 'Đếm trong đoạn đóng [2, n], tránh tính 0 hoặc 1.'],
    ['    if (!composite[value]) {', 'Phủ định dấu hợp số để nhận số nguyên tố còn lại sau sàng.'],
    ['        count++;', 'Tăng bộ đếm thêm một cho vị trí nguyên tố.'], '    }', '}',
    ['return count;', 'Trả number nguyên là số lượng số nguyên tố đến n.'],
  ], 'O(n log log n) — sàng đánh dấu các bội theo các số nguyên tố; hai lượt khởi tạo/đếm O(n) không làm tăng bậc này.', 'O(n) — mảng composite có n + 1 phần tử; các biến đếm chỉ dùng O(1) bộ nhớ bổ sung.'),
  entry('ch4-08', 'IsPerfect', ['n'], 'boolean', [
    'Nhận n từ 1 đến 1 000 000; trả true nếu tổng các ước dương nhỏ hơn n bằng n. Không cộng chính n vào tổng. Số 1 không phải số hoàn hảo.',
    'Ví dụ công khai: 28 có các ước nhỏ hơn nó là 1, 2, 4, 7, 14, tổng bằng 28 nên trả true; 12 có tổng 1 + 2 + 3 + 4 + 6 = 16 nên trả false.',
    'Các ước đi theo cặp divisor và n / divisor. Nếu n là số chính phương, cặp ở căn bậc hai trùng nhau nên chỉ được cộng một lần.',
  ], [
    'Return false cho n = 1; với n > 1, bắt đầu sum = 1 vì 1 luôn là ước dương nhỏ hơn n.',
    'Duyệt divisor từ 2 đến căn n. Khi chia hết, cộng divisor và ước ghép cặp paired = n / divisor; chỉ cộng paired nếu nó khác divisor.',
    'So sánh sum với n rồi return boolean. Vì divisor ≥ 2, paired luôn nhỏ hơn n nên không cộng nhầm chính n.',
  ], [
    ['if (n <= 1)', 'Loại số 1, không có ước dương nào nhỏ hơn nó để tạo tổng bằng 1.'], '{',
    ['    return false;', 'Trả bool false trước khi khởi tạo tổng ước.'], '}',
    ['int sum = 1;', 'Đã biết n > 1, nên thêm sẵn ước 1 vào tổng.'],
    ['for (int divisor = 2; divisor * divisor <= n; divisor++)', 'Duyệt đến căn n để tìm các cặp ước; <= bao gồm cặp trùng ở số chính phương.'], '{',
    ['    if (n % divisor == 0)', 'Chỉ cộng khi divisor thực sự chia hết n.'], '    {',
    ['        sum += divisor;', 'Cộng ước nhỏ của cặp vào tổng.'],
    ['        int paired = n / divisor;', 'Vì đã chia hết, phép chia int này cho đúng ước ghép cặp, không mất phần thập phân.'],
    ['        if (paired != divisor)', 'Kiểm tra hai ước có khác nhau không để tránh cộng căn bậc hai hai lần.'], '        {',
    ['            sum += paired;', 'Cộng thêm ước lớn nếu nó khác ước đã cộng.'], '        }', '    }', '}',
    ['return sum == n;', 'So sánh tổng các ước dương nhỏ hơn n với chính n rồi trả bool.'],
  ], [
    ['if (n <= 1) {', 'Loại số 1 theo đúng định nghĩa trong đề bài.'],
    ['    return false;', 'Trả boolean false trước các bước cộng ước.'], '}',
    ['let sum = 1;', 'Khởi tạo tổng ước với 1 vì input còn lại đều lớn hơn 1.'],
    ['for (let divisor = 2; divisor * divisor <= n; divisor++) {', 'Xét các ước nhỏ đến căn n, bao gồm căn nếu n là số chính phương.'],
    ['    if (n % divisor === 0) {', 'Phép % và === kiểm tra chia hết trước khi lấy ước ghép cặp.'],
    ['        sum += divisor;', 'Cộng ước divisor vào sum; biến sum dùng let vì cần cập nhật.'],
    ['        const paired = n / divisor;', 'Phép chia cho kết quả nguyên vì nhánh hiện tại đã xác nhận chia hết; không cần Math.floor tại đây.'],
    ['        if (paired !== divisor) {', 'So sánh nghiêm ngặt để loại lần cộng lặp của cùng một ước ở căn bậc hai.'],
    ['            sum += paired;', 'Cộng ước ghép cặp còn lại; nó nhỏ hơn n vì divisor ít nhất bằng 2.'], '        }', '    }', '}',
    ['return sum === n;', 'Trả boolean bằng cách so sánh nghiêm ngặt tổng ước với n.'],
  ], 'O(√n) — mỗi lượt xét một ứng viên ước đến căn bậc hai; tìm được cả hai ước trong mỗi cặp.'),
  entry('ch4-09', 'Fibonacci', ['n'], 'int32', [
    'Nhận n từ 0 đến 45; trả F(n) theo F(0) = 0, F(1) = 1, F(n) = F(n - 1) + F(n - 2). Dùng vòng lặp thay vì cây đệ quy.',
    'Ví dụ công khai: F(9) = 34; F(0) = 0. F(1) = 1 cần được giữ đúng, không lệch chỉ số. F(45) = 1 134 903 170 nằm trong int32.',
  ], [
    'Nếu n < 2, return n để xử lý hai giá trị gốc.',
    'Khởi tạo previous = F(0), current = F(1). Duyệt i từ 2 đến n; tính next trước khi cập nhật hai biến để không ghi đè mất số cũ.',
    'Sau mỗi lượt, previous giữ F(i - 1), current giữ F(i). Khi kết thúc, return current mà không cần lưu cả dãy.',
  ], [
    ['if (n < 2)', 'Tách hai giá trị gốc 0 và 1 trước vòng lặp.'], '{',
    ['    return n;', 'Với n = 0 hoặc 1, F(n) bằng chính n.'], '}',
    ['int previous = 0;', 'previous ban đầu lưu F(0), số đứng trước current.'],
    ['int current = 1;', 'current ban đầu lưu F(1), làm cơ sở để tính F(2).'],
    ['for (int i = 2; i <= n; i++)', 'Duyệt chỉ số Fibonacci từ 2 đến n; <= bảo đảm tính đúng F(n), không dừng ở F(n - 1).'], '{',
    ['    int next = previous + current;', 'Tính F(i) từ hai số trước đó và lưu trong next trước khi thay đổi previous/current.'],
    ['    previous = current;', 'Dịch F(i - 1) cũ sang previous để chuẩn bị cho lượt kế tiếp.'],
    ['    current = next;', 'Lưu F(i) vào current; hai biến lại đại diện cho hai số Fibonacci liên tiếp.'], '}',
    ['return current;', 'Trả F(n) dưới dạng int sau lượt i = n.'],
  ], [
    ['if (n < 2) {', 'Nhận hai chỉ số gốc n = 0 và n = 1.'],
    ['    return n;', 'Trả trực tiếp giá trị cơ sở, tránh lệch vị trí trong dãy.'], '}',
    ['let previous = 0;', 'Khai báo biến có thể gán lại để giữ F(0) ban đầu.'],
    ['let current = 1;', 'Giữ F(1) ban đầu trong current.'],
    ['for (let i = 2; i <= n; i++) {', 'Tính lần lượt các vị trí từ 2 đến n bằng vòng for.'],
    ['    const next = previous + current;', 'const next giữ tổng hai số cũ trong lượt này; không cập nhật current trước khi tính tổng.'],
    ['    previous = current;', 'Chuyển current cũ thành số trước của lượt tiếp theo.'],
    ['    current = next;', 'Đặt current bằng số mới; trong giới hạn n ≤ 45, các giá trị number đều là số nguyên chính xác.'], '}',
    ['return current;', 'Trả number nguyên là F(n), không trả cả mảng dãy số.'],
  ], 'O(n) — với n ≥ 2 có n - 1 lượt, mỗi lượt một phép cộng và hai phép gán; hai trường hợp gốc là O(1).'),
]
