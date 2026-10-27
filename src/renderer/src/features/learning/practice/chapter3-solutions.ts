import type { ExerciseLanguage, ExerciseType } from '../../../../../shared/contracts/practice'
import type { ExerciseSolution } from './solutions'

// Authored from public statements/starters/samples only. A tuple explains exactly
// one meaningful source line; bare strings preserve structural punctuation only.
type SourceLine = string | readonly [code: string, explanation: string]
const types: Record<ExerciseType, string> = { int32: 'int', boolean: 'bool', string: 'string', 'int32[]': 'int[]', 'string[]': 'string[]', 'int32[][]': 'int[][]' }
function source(signature: ExerciseSolution['signature'], language: ExerciseLanguage, body: SourceLine[]) {
  const parameters = signature.parameters.map(parameter => language === 'csharp' ? `${types[parameter.type]} ${parameter.name}` : parameter.name).join(', ')
  const header: SourceLine[] = language === 'csharp' ? [
    ['public class Solution', 'Khai báo lớp Solution công khai theo mẫu của IDE; không cần viết Main.'],
    '{',
    [`    public ${types[signature.returnType]} ${signature.functionName}(${parameters})`, `Khai báo phương thức instance ${signature.functionName}, nhận ${parameters} và trả về ${types[signature.returnType]}. Giữ đúng tên, thứ tự và kiểu tham số của bài.`],
    '    {',
  ] : [[`function ${signature.functionName}(${parameters}) {`, `Khai báo hàm ${signature.functionName} với các tham số ${parameters} theo đúng thứ tự. IDE truyền giá trị đã định kiểu theo đề bài; không đọc stdin hoặc tự gọi hàm.`]]
  const indent = language === 'csharp' ? '        ' : '    '
  const rows = [...header, ...body.map<SourceLine>(line => typeof line === 'string' ? indent + line : [indent + line[0], line[1]]),
    ...(language === 'csharp' ? ['    }', '}'] : ['}'])]
  return {
    code: rows.map(line => typeof line === 'string' ? line : line[0]).join('\n'),
    lines: rows.flatMap((line, index) => typeof line === 'string' ? [] : [{ code: line[0], explanation: line[1], lineNumber: index + 1 }]),
  }
}
const scalarComplexity = {
  time: 'O(1) — số phép tính và điều kiện là cố định, không có vòng lặp phụ thuộc giá trị input.',
  space: 'O(1) — chỉ sử dụng một số cố định tham số/biến cục bộ, không dùng đệ quy hoặc cấu trúc tăng theo input.',
}
const note = 'Input được truyền qua tham số; chỉ return giá trị, không in Console/STDOUT. Các giới hạn và tính hợp lệ của input tuân theo đề bài.'
function entry(exerciseId: string, signature: ExerciseSolution['signature'], analysis: string[], algorithm: string[], csharp: SourceLine[], javascript: SourceLine[], complexity = scalarComplexity): ExerciseSolution {
  return { exerciseId, signature, analysis: [...analysis, note], algorithm,
    languages: { csharp: source(signature, 'csharp', csharp), javascript: source(signature, 'javascript', javascript) }, complexity }
}
const oneInt = (name: string) => [{ name, type: 'int32' as const }]
const threeInts = ['a', 'b', 'c'].map(name => ({ name, type: 'int32' as const }))

export const chapter3Solutions: ExerciseSolution[] = [
  entry('ch3-01', { functionName: 'IsEven', parameters: oneInt('n'), returnType: 'boolean' }, [
    'Nhận số nguyên n với |n| ≤ 1 000 000; trả về true nếu n chẵn, false nếu n lẻ. Output là boolean, không phải chuỗi "true"/"false".',
    'Ví dụ công khai: -8 chia hết cho 2 nên trả true; 7 chia 2 dư 1 nên trả false. Số 0 cũng là số chẵn. Với số âm, dấu của số dư có thể âm nhưng kiểm tra bằng 0 vẫn đúng.',
  ], [
    'Số chẵn là số chia hết cho 2. Dùng toán tử % để lấy phần dư của phép chia n cho 2.',
    'So sánh số dư với 0 và trả thẳng kết quả boolean; không cần phân biệt riêng n âm, dương hay bằng 0.',
  ], [
    ['return n % 2 == 0;', 'Toán tử % lấy số dư khi chia n cho 2; == 0 kiểm tra chia hết. return trả kết quả bool của phép so sánh cho IDE.'],
  ], [
    ['return n % 2 === 0;', 'Lấy số dư n % 2 rồi so sánh nghiêm ngặt với 0 bằng ===. Kết quả là boolean; với -0 phép so sánh vẫn đúng, nên số âm chẵn và 0 được xử lý chính xác.'],
  ]),
  entry('ch3-02', { functionName: 'Sign', parameters: oneInt('n'), returnType: 'int32' }, [
    'Input là số nguyên n trong [-1 000 000, 1 000 000]. Trả -1 khi n âm, 0 khi n bằng 0, 1 khi n dương; không trả lại chính n.',
    'Ví dụ công khai: n = -14 cho -1; n = 0 cho 0. Ba miền âm, bằng 0 và dương không giao nhau, nên mỗi input chỉ có một kết quả.',
  ], [
    'Kiểm tra n < 0 trước; nếu đúng, trả -1 và kết thúc hàm.',
    'Nếu chưa return, kiểm tra n > 0; nếu đúng, trả 1. Khi cả hai điều kiện sai, n bắt buộc bằng 0, nên trả 0.',
  ], [
    ['if (n < 0)', 'So sánh n với 0 bằng < để nhận biết miền số âm.'], '{',
    ['    return -1;', 'Kết thúc hàm với giá trị int -1 cho mọi số âm.'], '}',
    ['if (n > 0)', 'Nhánh âm đã bị loại; > kiểm tra n có phải số dương không.'], '{',
    ['    return 1;', 'Trả int 1 cho số dương, không phụ thuộc độ lớn của n.'], '}',
    ['return 0;', 'Hai nhánh trước đều không đúng nên n bằng 0; trả đúng mã dấu 0.'],
  ], [
    ['if (n < 0) {', 'Toán tử < kiểm tra n âm; nhánh này được xét đầu tiên.'],
    ['    return -1;', 'Trả number -1 và kết thúc hàm khi input âm.'], '}',
    ['if (n > 0) {', 'Sau khi loại số âm, kiểm tra n dương bằng >.'],
    ['    return 1;', 'Trả number 1 cho mọi input dương.'], '}',
    ['return 0;', 'Nếu không âm và cũng không dương thì n bằng 0; trả number 0.'],
  ]),
  entry('ch3-03', { functionName: 'Max3', parameters: threeInts, returnType: 'int32' }, [
    'Nhận ba số nguyên a, b, c, mỗi số có trị tuyệt đối không quá 1 000 000. Dùng rẽ nhánh để trả giá trị lớn nhất; các số có thể bằng nhau hoặc đều âm.',
    'Ví dụ công khai: (9, 2, 9) cho 9 dù có hai giá trị lớn nhất bằng nhau; (-5, -2, -8) cho -2. Không khởi tạo kết quả bằng 0 vì 0 không nằm trong bộ số âm này.',
  ], [
    'Đặt largest = a để kết quả tạm thời luôn là một phần tử input.',
    'Nếu b lớn hơn largest thì cập nhật largest = b; sau bước này largest là lớn nhất của a và b.',
    'So sánh c tương tự rồi trả largest. Dùng > là đủ: nếu bằng nhau, giữ giá trị hiện tại vẫn đúng.',
  ], [
    ['int largest = a;', 'Tạo biến int largest từ a để khởi tạo đúng ngay cả khi cả ba số đều âm.'],
    ['if (b > largest)', 'Kiểm tra b có lớn hơn ứng viên hiện tại không; không cần cập nhật nếu bằng nhau.'], '{',
    ['    largest = b;', 'Gán b cho largest; đây là cập nhật giá trị, không phải so sánh bằng.'], '}',
    ['if (c > largest)', 'So sánh c với giá trị lớn nhất của hai số đã xét.'], '{',
    ['    largest = c;', 'Cập nhật largest thành c khi c thực sự lớn hơn.'], '}',
    ['return largest;', 'Trả số nguyên lớn nhất sau khi cả ba input đã được xét.'],
  ], [
    ['let largest = a;', 'Khai báo biến let có thể gán lại, ban đầu giữ number a; tránh sai với bộ số toàn âm.'],
    ['if (b > largest) {', 'Kiểm tra b lớn hơn ứng viên lớn nhất hiện tại.'],
    ['    largest = b;', 'Gán lại largest bằng b khi điều kiện đúng.'], '}',
    ['if (c > largest) {', 'So sánh c với kết quả lớn nhất của a và b.'],
    ['    largest = c;', 'Cập nhật ứng viên nếu c lớn hơn, giữ nguyên khi bằng nhau.'], '}',
    ['return largest;', 'Trả number là giá trị lớn nhất trong ba số input.'],
  ]),
  entry('ch3-04', { functionName: 'LeapYear', parameters: oneInt('year'), returnType: 'boolean' }, [
    'Nhận year trong [1, 9999], trả boolean cho biết đó có phải năm nhuận theo lịch Gregory hay không. Quy tắc là chia hết cho 400, hoặc chia hết cho 4 nhưng không chia hết cho 100.',
    'Ví dụ công khai: 2400 chia hết cho 400 nên trả true; 2100 chia hết cho 100 nhưng không chia hết cho 400 nên trả false. Chỉ kiểm tra chia hết cho 4 sẽ phân loại sai các năm thế kỷ.',
  ], [
    'Tạo mệnh đề year % 400 bằng 0 cho trường hợp thế kỷ nhuận.',
    'Dùng phép AND để yêu cầu đồng thời chia hết cho 4 và không chia hết cho 100; nối với mệnh đề đầu bằng OR. Đặt ngoặc cho nhóm điều kiện để thể hiện rõ quy tắc.',
  ], [
    ['return year % 400 == 0 || (year % 4 == 0 && year % 100 != 0);', 'Các phép % kiểm tra phần dư. || chấp nhận một trong hai nhóm; && yêu cầu cả chia hết cho 4 và không chia hết cho 100. == và != so sánh số dư; return trả bool.'],
  ], [
    ['return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);', 'Dùng ===/!== so sánh số dư với 0. || là OR, && là AND: chấp nhận chia hết cho 400 hoặc chia hết cho 4 nhưng không chia hết cho 100; trả boolean.'],
  ]),
  entry('ch3-05', { functionName: 'Triangle', parameters: threeInts, returnType: 'string' }, [
    'Nhận ba cạnh nguyên dương a, b, c trong [1, 10 000]. Trả đúng một chuỗi: "invalid", "equilateral", "isosceles" hoặc "scalene"; chữ hoa/thường phải khớp đề.',
    'Ví dụ công khai: (4, 4, 7) hợp lệ và có hai cạnh bằng nhau nên trả "isosceles"; (2, 3, 5) có 2 + 3 = 5 nên trả "invalid". Tổng hai cạnh phải lớn hơn cạnh còn lại, bằng nhau chưa đủ.',
    'Phải xét tính hợp lệ trước, rồi tam giác đều trước tam giác cân. Đề đã bảo đảm các cạnh dương; tổng hai cạnh tối đa 20 000 nên không tràn int.',
  ], [
    'Nếu bất kỳ tổng hai cạnh nào ≤ cạnh còn lại thì trả "invalid" ngay.',
    'Nếu cả ba cạnh bằng nhau, trả "equilateral". Nếu chưa đều nhưng có một cặp bằng nhau, trả "isosceles".',
    'Sau khi loại các trường hợp trên, tam giác có ba cạnh khác nhau; trả "scalene".',
  ], [
    ['if (a + b <= c || a + c <= b || b + c <= a)', 'Dùng + và <= để phát hiện vi phạm bất đẳng thức tam giác. || chỉ cần một bất đẳng thức sai; bao gồm trường hợp thẳng hàng.'], '{',
    ['    return "invalid";', 'Trả chuỗi invalid trước khi xét các cạnh bằng nhau.'], '}',
    ['if (a == b && b == c)', '&& yêu cầu đồng thời a bằng b và b bằng c, tức cả ba cạnh bằng nhau.'], '{',
    ['    return "equilateral";', 'Tam giác hợp lệ có ba cạnh bằng nhau được phân loại đều.'], '}',
    ['if (a == b || a == c || b == c)', 'Sau khi loại tam giác đều, kiểm tra có ít nhất một cặp cạnh bằng nhau bằng ||.'], '{',
    ['    return "isosceles";', 'Trả chuỗi isosceles cho tam giác cân không đều.'], '}',
    ['return "scalene";', 'Các nhánh trước không đúng: tam giác hợp lệ có ba cạnh khác nhau.'],
  ], [
    ['if (a + b <= c || a + c <= b || b + c <= a) {', 'Cộng từng cặp cạnh; <= nhận cả trường hợp tổng bằng cạnh thứ ba. Chỉ cần một mệnh đề đúng là tam giác không hợp lệ.'],
    ['    return "invalid";', 'Kết thúc hàm bằng chuỗi invalid cho ba cạnh không tạo thành tam giác.'], '}',
    ['if (a === b && b === c) {', 'So sánh số bằng ===; && kết hợp hai phép bằng để nhận biết ba cạnh bằng nhau.'],
    ['    return "equilateral";', 'Trả đúng chuỗi equilateral khi tam giác đều.'], '}',
    ['if (a === b || a === c || b === c) {', 'Dùng === với từng cặp cạnh và || để nhận ít nhất một cặp bằng nhau; nhánh đều đã return trước đó.'],
    ['    return "isosceles";', 'Trả đúng chuỗi isosceles cho tam giác cân còn lại.'], '}',
    ['return "scalene";', 'Tam giác hợp lệ còn lại có ba cạnh khác nhau; trả chuỗi scalene.'],
  ]),
  entry('ch3-06', { functionName: 'DaysInMonth', parameters: [{ name: 'month', type: 'int32' }, { name: 'year', type: 'int32' }], returnType: 'int32' }, [
    'Nhận month từ 1 đến 12 và year từ 1 đến 9999; trả số ngày của tháng theo lịch Gregory. Tháng 2 phụ thuộc năm nhuận, các tháng còn lại có 30 hoặc 31 ngày.',
    'Ví dụ công khai: (2, 2024) cho 29 vì 2024 nhuận; (4, 2025) cho 30. Tháng 2 của năm thế kỷ cần quy tắc đầy đủ, không chỉ xét chia hết cho 4.',
  ], [
    'Xét tháng 2 riêng: tính boolean năm nhuận rồi chọn 29 hoặc 28 bằng toán tử điều kiện.',
    'Nếu không phải tháng 2, kiểm tra nhóm tháng 4, 6, 9, 11 có 30 ngày. Các tháng hợp lệ còn lại có 31 ngày.',
  ], [
    ['if (month == 2)', 'Tách tháng 2 vì đây là tháng duy nhất có số ngày phụ thuộc năm nhuận.'], '{',
    ['    bool leap = year % 400 == 0 || (year % 4 == 0 && year % 100 != 0);', 'Biến bool leap lưu điều kiện năm nhuận Gregory; % lấy dư, || và && kết hợp quy tắc 400/4/100.'],
    ['    return leap ? 29 : 28;', 'Toán tử ?: chọn 29 nếu leap đúng, ngược lại 28; cả hai nhánh trả int.'], '}',
    ['if (month == 4 || month == 6 || month == 9 || month == 11)', '|| kiểm tra month thuộc một trong bốn tháng có 30 ngày.'], '{',
    ['    return 30;', 'Trả số ngày của nhóm tháng 4, 6, 9, 11.'], '}',
    ['return 31;', 'Input month hợp lệ và đã loại các nhóm khác, nên tháng còn lại có 31 ngày.'],
  ], [
    ['if (month === 2) {', 'Dùng === để xác định tháng 2 trước các nhóm còn lại.'],
    ['    const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);', 'const leap giữ boolean năm nhuận, không cần gán lại; áp dụng đúng quy tắc chia hết cho 400 hoặc cho 4 nhưng không cho 100.'],
    ['    return leap ? 29 : 28;', '?: chọn number 29 hoặc 28 theo leap rồi return; không tạo đối tượng Date hay lệ thuộc múi giờ.'], '}',
    ['if (month === 4 || month === 6 || month === 9 || month === 11) {', 'Kiểm tra nhóm bốn tháng 30 ngày bằng === và OR ||.'],
    ['    return 30;', 'Trả number 30 cho các tháng vừa khớp điều kiện.'], '}',
    ['return 31;', 'Các tháng hợp lệ chưa return đều có 31 ngày.'],
  ]),
  entry('ch3-07', { functionName: 'Ticket', parameters: [{ name: 'age', type: 'int32' }, { name: 'weekend', type: 'boolean' }], returnType: 'int32' }, [
    'Nhận age từ 0 đến 120 và weekend là boolean. Dưới 6 tuổi miễn phí; 6–17 tuổi giá 50; 18–59 giá 100; từ 60 giá 70. Cuối tuần cộng 20 chỉ với vé có trả tiền.',
    'Ví dụ công khai: (16, true) cho 50 + 20 = 70; (4, true) vẫn cho 0. Chú ý các mốc 6, 18, 60; không cộng phụ phí cho trẻ được miễn vé.',
  ], [
    'Return 0 ngay nếu age < 6 để loại vé miễn phí trước bước phụ phí.',
    'Khởi tạo giá 100; nếu age < 18 chọn 50, ngược lại nếu age ≥ 60 chọn 70. Lúc này đã biết age ≥ 6 nên các khoảng tuổi không bị chồng sai.',
    'Nếu weekend đúng thì cộng 20 vào giá đã chọn; cuối cùng return giá vé.',
  ], [
    ['if (age < 6)', 'Kiểm tra tuổi được miễn vé trước mọi phép cộng phụ phí.'], '{',
    ['    return 0;', 'Kết thúc hàm để vé miễn phí vẫn bằng 0 kể cả cuối tuần.'], '}',
    ['int price = 100;', 'Khởi tạo biến int price bằng giá của người 18–59 tuổi.'],
    ['if (age < 18)', 'Do đã loại age < 6, điều kiện này chỉ còn nhóm 6–17 tuổi.'], '{',
    ['    price = 50;', 'Gán giá vé trẻ em cho price.'], '}',
    ['else if (age >= 60)', 'Chỉ xét khi không thuộc nhóm trẻ em; >= bao gồm tuổi 60.'], '{',
    ['    price = 70;', 'Đổi sang giá ưu đãi cho người từ 60 tuổi.'], '}',
    ['if (weekend)', 'weekend đã là bool; nếu true thì áp dụng phụ phí cho vé có trả tiền.'], '{',
    ['    price += 20;', '+= cộng 20 vào giá hiện tại; không thay toàn bộ giá bằng 20.'], '}',
    ['return price;', 'Trả tổng giá sau khi chọn nhóm tuổi và xử lý cuối tuần.'],
  ], [
    ['if (age < 6) {', 'Nhận diện trẻ miễn phí trước khi tính phụ phí cuối tuần.'],
    ['    return 0;', 'Trả number 0 ngay, nên nhánh cuối tuần không thể cộng thêm tiền.'], '}',
    ['let price = 100;', 'Dùng let vì price sẽ được cập nhật; mặc định là giá nhóm 18–59.'],
    ['if (age < 18) {', 'Sau khi loại trẻ dưới 6, điều kiện này chọn tuổi 6–17.'],
    ['    price = 50;', 'Gán giá 50 cho nhóm trẻ em có trả tiền.'], '}',
    ['else if (age >= 60) {', 'Nhánh loại trừ tiếp theo chọn người từ 60 tuổi, bao gồm đúng tuổi 60.'],
    ['    price = 70;', 'Gán giá ưu đãi 70; các tuổi 18–59 giữ giá 100.'], '}',
    ['if (weekend) {', 'Kiểm tra boolean weekend trực tiếp; không so sánh với chuỗi "true".'],
    ['    price += 20;', 'Cộng 20 vào giá của vé có trả tiền sau khi đã phân nhóm tuổi.'], '}',
    ['return price;', 'Trả number là giá vé cuối cùng.'],
  ]),
  entry('ch3-08', { functionName: 'NextDate', parameters: [{ name: 'day', type: 'int32' }, { name: 'month', type: 'int32' }, { name: 'year', type: 'int32' }], returnType: 'int32[]' }, [
    'Input là ngày hợp lệ, gồm day, month, year; year trong [1, 9998]. Output là mảng ba số nguyên theo đúng thứ tự [ngày, tháng, năm] của ngày tiếp theo, không phải chuỗi ngày tháng.',
    'Ví dụ công khai: (28, 2, 2024) cho [29, 2, 2024] vì năm nhuận; (31, 12, 2025) cho [1, 1, 2026]. Cần phân biệt tăng ngày bình thường, hết tháng và hết năm.',
    'Ngày input đã hợp lệ nên không cần xây dựng thêm chính sách cho ngày không tồn tại. Năm tối đa 9998 bảo đảm ngày kế tiếp vẫn có năm không quá 9999.',
  ], [
    'Tính năm nhuận rồi xác định số ngày của tháng hiện tại: mặc định 31, tháng 2 chọn 28/29, nhóm 4/6/9/11 chọn 30.',
    'Nếu day chưa phải ngày cuối tháng, return mảng [day + 1, month, year].',
    'Nếu hết tháng nhưng chưa hết năm, return [1, month + 1, year]. Nếu đồng thời hết năm, return [1, 1, year + 1]. Mỗi nhánh return ngay để không làm thay đổi nhầm các thành phần.',
  ], [
    ['bool leap = year % 400 == 0 || (year % 4 == 0 && year % 100 != 0);', 'Tính bool leap bằng quy tắc Gregory đầy đủ để xác định độ dài tháng 2.'],
    ['int days = 31;', 'Biến int days mặc định giữ số ngày của nhóm tháng dài.'],
    ['if (month == 2)', 'Xét riêng tháng 2 vì có thể là 28 hoặc 29 ngày.'], '{',
    ['    days = leap ? 29 : 28;', 'Chọn và gán số ngày tháng 2 bằng toán tử ?: theo leap.'], '}',
    ['else if (month == 4 || month == 6 || month == 9 || month == 11)', 'Nhóm tháng 30 ngày được xét sau tháng 2; || nhận bất kỳ tháng nào trong nhóm.'], '{',
    ['    days = 30;', 'Đổi biến days sang 30 khi month thuộc nhóm này.'], '}',
    ['if (day < days)', 'So sánh day với độ dài tháng hiện tại; nếu nhỏ hơn thì chưa cần chuyển tháng.'], '{',
    ['    return new int[] { day + 1, month, year };', 'Tạo và trả mảng int[] gồm ngày tăng một, tháng và năm giữ nguyên; thứ tự phần tử phải đúng contract.'], '}',
    ['if (month < 12)', 'Đã biết đang ở cuối tháng; kiểm tra còn tháng tiếp theo trong cùng năm không.'], '{',
    ['    return new int[] { 1, month + 1, year };', 'Trả ngày 1 của tháng kế tiếp trong cùng năm.'], '}',
    ['return new int[] { 1, 1, year + 1 };', 'Trường hợp cuối cùng là 31/12; trả ngày 1/1 năm sau, với ba phần tử int theo đúng thứ tự.'],
  ], [
    ['const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);', 'Lưu boolean năm nhuận trong const leap; ===/!== kiểm tra số dư và &&/|| kết hợp quy tắc Gregory.'],
    ['let days = 31;', 'Khai báo let days có thể gán lại để lưu số ngày của tháng input.'],
    ['if (month === 2) {', 'Nhánh riêng dành cho tháng 2.'],
    ['    days = leap ? 29 : 28;', 'Gán 29 hoặc 28 theo boolean leap bằng toán tử điều kiện.'], '}',
    ['else if (month === 4 || month === 6 || month === 9 || month === 11) {', 'Nếu không phải tháng 2, kiểm tra nhóm 4, 6, 9, 11 có 30 ngày.'],
    ['    days = 30;', 'Gán độ dài tháng là 30; các tháng khác giữ 31.'], '}',
    ['if (day < days) {', 'Kiểm tra còn ngày tiếp theo trong tháng hiện tại hay không.'],
    ['    return [day + 1, month, year];', 'Trả mảng number gồm ba số nguyên; chỉ tăng ngày, không đổi tháng hoặc năm.'], '}',
    ['if (month < 12) {', 'Đang ở cuối tháng; kiểm tra đây có phải tháng trước tháng 12 không.'],
    ['    return [1, month + 1, year];', 'Tạo mảng cho ngày 1 tháng sau trong cùng năm.'], '}',
    ['return [1, 1, year + 1];', 'Nếu đã hết tháng 12, trả ngày đầu của năm sau; không dùng Date nên không có chuyển đổi múi giờ.'],
  ], {
    time: 'O(1) — chỉ xét một số cố định điều kiện và tạo mảng ba phần tử, không duyệt qua các ngày.',
    space: 'O(1) — các biến leap, days và mảng kết quả ba số đều có kích thước cố định; không dùng đệ quy.',
  }),
  entry('ch3-09', { functionName: 'Bill', parameters: oneInt('units'), returnType: 'int32' }, [
    'Nhận units trong [0, 100 000]; trả tổng tiền theo bậc: 50 đơn vị đầu giá 2, 50 đơn vị tiếp theo giá 3, phần vượt 100 giá 5. Không lấy toàn bộ units nhân với giá của bậc cuối.',
    'Ví dụ công khai: 120 đơn vị có tiền 50 × 2 + 50 × 3 + 20 × 5 = 350; 30 đơn vị trả 30 × 2 = 60. Các điểm nối 50 và 100 phải tính đúng và units = 0 trả 0.',
    'Giá lớn nhất trong miền đề bài là 250 + (100 000 - 100) × 5 = 499 750, nằm an toàn trong int C# và số nguyên number JavaScript.',
  ], [
    'Nếu units ≤ 50, toàn bộ nằm ở bậc đầu, trả units × 2.',
    'Nếu units ≤ 100, tính sẵn 100 cho 50 đơn vị đầu rồi cộng (units - 50) × 3.',
    'Nếu lớn hơn 100, hai bậc đầu có giá cố định 100 + 150 = 250; cộng phần còn lại (units - 100) × 5.',
  ], [
    ['if (units <= 50)', 'Dùng <= để bao gồm cả mốc 50 trong bậc đầu tiên.'], '{',
    ['    return units * 2;', 'Nhân units với đơn giá 2; units = 0 cũng cho kết quả đúng là 0.'], '}',
    ['if (units <= 100)', 'Do đã return khi units ≤ 50, nhánh này chỉ xử lý số lượng 51–100.'], '{',
    ['    return 100 + (units - 50) * 3;', '100 là tiền 50 đơn vị đầu; chỉ phần units - 50 còn lại được nhân 3. Ngoặc giữ đúng thứ tự phép tính.'], '}',
    ['return 250 + (units - 100) * 5;', '250 là tiền hai bậc đầu; chỉ lượng vượt 100 được tính giá 5, rồi trả tổng int.'],
  ], [
    ['if (units <= 50) {', 'Kiểm tra lượng dùng nằm trong bậc 0–50, bao gồm mốc 50.'],
    ['    return units * 2;', 'Trả number bằng lượng dùng nhân giá 2; không cần nhánh riêng cho 0.'], '}',
    ['if (units <= 100) {', 'Nhánh trước đã loại units ≤ 50; điều kiện này xác định bậc 51–100.'],
    ['    return 100 + (units - 50) * 3;', 'Cộng tiền bậc đầu với tiền phần vượt 50 theo giá 3, không nhân cả units với 3.'], '}',
    ['return 250 + (units - 100) * 5;', 'Cộng giá cố định hai bậc đầu với phần vượt 100 theo giá 5; trả một số nguyên number.'],
  ]),
]
