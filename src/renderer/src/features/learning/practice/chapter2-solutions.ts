import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { ExerciseSolution } from './solutions'

// Independently authored from public statements, signatures and samples only.
// ch2-01 remains the existing pilot in solutions.ts, unchanged.
type SourceLine = string | readonly [code: string, explanation: string]
function source(signature: ExerciseSolution['signature'], language: ExerciseLanguage, body: SourceLine[]) {
  const parameters = signature.parameters.map(p => language === 'csharp' ? `int ${p.name}` : p.name).join(', ')
  const header: SourceLine[] = language === 'csharp' ? [
    ['public class Solution', 'Khai báo lớp Solution công khai theo mẫu của IDE; không cần viết Main hay chương trình Console.'], '{',
    [`    public ${signature.returnType === 'int32[]' ? 'int[]' : 'int'} ${signature.functionName}(${parameters})`, `Giữ đúng phương thức instance public ${signature.functionName}, thứ tự tham số ${parameters} và kiểu trả về theo starter.`], '    {',
  ] : [[`function ${signature.functionName}(${parameters}) {`, `Khai báo hàm ${signature.functionName} ở cấp cao nhất với đúng thứ tự tham số ${parameters}; các giá trị số được IDE truyền vào.`]]
  const indent = language === 'csharp' ? '        ' : '    '
  const rows = [...header, ...body.map<SourceLine>(line => typeof line === 'string' ? indent + line : [indent + line[0], line[1]]),
    ...(language === 'csharp' ? ['    }', '}'] : ['}'])]
  return { code: rows.map(line => typeof line === 'string' ? line : line[0]).join('\n'),
    lines: rows.flatMap((line, index) => typeof line === 'string' ? [] : [{ code: line[0], explanation: line[1], lineNumber: index + 1 }]) }
}
function entry(exerciseId: string, signature: ExerciseSolution['signature'], analysis: string[], algorithm: string[], csharp: SourceLine[], javascript: SourceLine[]): ExerciseSolution {
  return { exerciseId, signature,
    analysis: [...analysis, 'Input được truyền qua tham số. Chỉ return kết quả; không đọc stdin, không in Console/STDOUT và không tự gọi hàm.'],
    algorithm, languages: { csharp: source(signature, 'csharp', csharp), javascript: source(signature, 'javascript', javascript) },
    complexity: { time: 'O(1) — chỉ thực hiện một số cố định phép tính số học, không có vòng lặp phụ thuộc input.',
      space: signature.returnType === 'int32[]' ? 'O(1) — chỉ dùng hai biến và một mảng kết quả luôn có đúng hai phần tử.'
        : 'O(1) — chỉ dùng các tham số và một số cố định biến cục bộ, không tạo mảng hay dùng đệ quy.' } }
}
const ints = (...names: string[]) => names.map(name => ({ name, type: 'int32' as const }))
const digitsAnalysis = 'Vì n nằm trong [100, 999], hàng trăm là phần nguyên của n / 100, hàng chục là phần nguyên của n / 10 rồi lấy dư 10, hàng đơn vị là n % 10. Không cần chuyển n thành chuỗi.'

export const chapter2Solutions: ExerciseSolution[] = [
  entry('ch2-02', { functionName: 'Perimeter', parameters: ints('width', 'height'), returnType: 'int32' }, [
    'Khung hình chữ nhật có hai cạnh dài width và hai cạnh dài height. Output là chu vi, không phải diện tích width × height.',
    'Ví dụ công khai width = 7, height = 4 cho 2 × (7 + 4) = 22. Với hai cạnh cùng bằng 1, chu vi bằng 4.',
    'Hai cạnh trong [1, 10 000], nên chu vi tối đa 40 000, an toàn với int của C# và number của JavaScript.',
  ], [
    'Cộng width và height để được nửa chu vi.',
    'Nhân tổng đó với 2 rồi return. Đặt ngoặc để phép cộng được thực hiện trước phép nhân.',
  ], [
    ['return 2 * (width + height);', 'Dấu ngoặc nhóm tổng hai cạnh kề; * 2 tính đủ bốn cạnh. return trả int là chu vi, không in kết quả ra màn hình.'],
  ], [
    ['return 2 * (width + height);', 'Cộng hai number trước nhờ dấu ngoặc rồi nhân 2; kết quả nguyên nằm trong miền biểu diễn chính xác của number.'],
  ]),
  entry('ch2-03', { functionName: 'Seconds', parameters: ints('minutes'), returnType: 'int32' }, [
    'Một phút có 60 giây. Bài yêu cầu đổi số phút thành tổng số giây, không phải tách thành giờ/phút/giây.',
    'Ví dụ công khai: 9 phút tương ứng 540 giây; 0 phút tương ứng 0 giây.',
    'minutes nằm trong [0, 10 000], nên kết quả lớn nhất là 600 000. Phép nhân không tràn int và vẫn chính xác bằng number.',
  ], [
    'Dùng hệ số đổi đơn vị 60 giây/phút.',
    'Tính minutes × 60 và return trực tiếp; không chia cho 60 vì đó là phép đổi ngược từ giây sang phút.',
  ], [
    ['return minutes * 60;', 'Nhân số phút nguyên với 60 để đổi sang giây; return trả int, bao gồm kết quả 0 khi minutes bằng 0.'],
  ], [
    ['return minutes * 60;', 'Dùng phép nhân * trên number, trả tổng số giây nguyên; không cần parseInt vì input đã là số.'],
  ]),
  entry('ch2-04', { functionName: 'Divide', parameters: ints('a', 'b'), returnType: 'int32[]' }, [
    'Nhận 0 ≤ a ≤ 1 000 000 và 1 ≤ b ≤ 1 000; phải trả một mảng [thương nguyên, số dư] đúng thứ tự, không trả riêng thương hoặc chuỗi mô tả.',
    'Ví dụ công khai: 29 = 4 × 6 + 5 nên (29, 6) cho [4, 5]. Khi a nhỏ hơn b, như (3, 8), thương là 0 và số dư là 3.',
    'b luôn dương nên không cần nhánh chia cho 0. a không âm nên phép chia nguyên C# và Math.floor(a / b) của JavaScript cho cùng thương; không áp dụng kết luận này một cách máy móc cho input âm ngoài đề.',
  ], [
    'Tính quotient là phần nguyên của a / b. Trong C#, hai toán hạng int cho thương nguyên; JavaScript phải dùng Math.floor để bỏ phần thập phân.',
    'Tính remainder = a % b. Khi chia hết, số dư bằng 0; khi a bằng 0, cả hai kết quả đều bằng 0.',
    'Tạo mảng hai số [quotient, remainder] rồi return. Kiểm tra đẳng thức a = quotient × b + remainder và 0 ≤ remainder < b.',
  ], [
    ['int quotient = a / b;', 'Phép / giữa hai int trong C# lấy thương nguyên; với a không âm và b dương, đây là phần nguyên dưới của a / b.'],
    ['int remainder = a % b;', 'Toán tử % lấy số dư; trong miền input đã cho, remainder luôn từ 0 đến b - 1.'],
    ['return new int[] { quotient, remainder };', 'Cấp phát mảng int[] đúng hai phần tử, đặt thương trước số dư rồi return; không đảo thứ tự hoặc trả chuỗi.'],
  ], [
    ['const quotient = Math.floor(a / b);', 'Phép / của JavaScript có thể trả số thập phân. Math.floor làm tròn xuống thành thương nguyên; điều này đúng cho miền a ≥ 0, b > 0 của bài.'],
    ['const remainder = a % b;', 'Toán tử % tính số dư của phép chia; const giữ giá trị không cần gán lại.'],
    ['return [quotient, remainder];', 'Trả mảng number[] gồm thương rồi số dư. Các phần tử là số nguyên, không phải chuỗi hay một số thập phân.'],
  ]),
  entry('ch2-05', { functionName: 'DigitSum3', parameters: ints('n'), returnType: 'int32' }, [
    'Trả về tổng ba chữ số của số nguyên dương có đúng ba chữ số. Ví dụ công khai 581 cho 5 + 8 + 1 = 14; 100 cho 1.',
    digitsAnalysis,
    'Các chữ số có thể bằng 0 hoặc lặp nhau; tổng nằm trong [1, 27]. JavaScript cần Math.floor vì phép / không tự lấy thương nguyên.',
  ], [
    'Lấy hàng trăm bằng chia nguyên cho 100.',
    'Bỏ hàng đơn vị bằng chia nguyên cho 10, rồi % 10 để chỉ giữ hàng chục. Lấy hàng đơn vị bằng n % 10.',
    'Cộng ba chữ số và return một số nguyên; không ghép chúng lại thành chuỗi.',
  ], [
    ['int hundreds = n / 100;', 'Chia int cho 100 loại hai chữ số cuối; hundreds là chữ số hàng trăm từ 1 đến 9.'],
    ['int tens = (n / 10) % 10;', 'n / 10 bỏ hàng đơn vị; lấy dư 10 tiếp tục loại hàng trăm và giữ chữ số hàng chục.'],
    ['int units = n % 10;', 'Lấy dư khi chia 10 để lấy chữ số hàng đơn vị, kể cả khi chữ số này bằng 0.'],
    ['return hundreds + tens + units;', 'Cộng ba biến int và trả tổng; đây là phép cộng giá trị chữ số, không phải nối chuỗi.'],
  ], [
    ['const hundreds = Math.floor(n / 100);', 'Lấy phần nguyên của n / 100 bằng Math.floor để có đúng chữ số hàng trăm, không giữ phần thập phân.'],
    ['const tens = Math.floor(n / 10) % 10;', 'Làm tròn xuống n / 10 để bỏ hàng đơn vị, sau đó % 10 giữ lại hàng chục.'],
    ['const units = n % 10;', 'Lấy chữ số cuối qua phần dư khi chia cho 10; không cần chuyển kiểu từ string.'],
    ['return hundreds + tens + units;', 'Trả number là tổng ba chữ số nguyên đã tách; thứ tự phép cộng không ảnh hưởng kết quả.'],
  ]),
  entry('ch2-06', { functionName: 'Reverse3', parameters: ints('n'), returnType: 'int32' }, [
    'Đảo thứ tự ba chữ số rồi trả giá trị nguyên. Ví dụ công khai 731 thành 137; 260 thành 62, không phải chuỗi "062".',
    digitsAnalysis,
    'Sau khi đảo, hàng đơn vị cũ có trọng số 100, hàng chục giữ trọng số 10, hàng trăm cũ có trọng số 1. Số 0 ở đầu tự biến mất vì kết quả là số nguyên; kết quả tối đa 999.',
  ], [
    'Tách hàng trăm, hàng chục và hàng đơn vị bằng phép chia nguyên và lấy dư.',
    'Ghép theo thứ tự ngược bằng units × 100 + tens × 10 + hundreds. Không dùng định dạng chuỗi giữ đủ ba ký tự.',
    'Return giá trị số. Chẳng hạn n = 100 cho 0 × 100 + 0 × 10 + 1 = 1.',
  ], [
    ['int hundreds = n / 100;', 'Chia nguyên cho 100 để lấy chữ số đầu; chữ số này sẽ trở thành hàng đơn vị trong kết quả.'],
    ['int tens = (n / 10) % 10;', 'Bỏ chữ số cuối rồi lấy dư 10 để giữ hàng chục; vị trí này không đổi sau phép đảo.'],
    ['int units = n % 10;', 'Lấy chữ số cuối để đưa sang hàng trăm của số đảo.'],
    ['return units * 100 + tens * 10 + hundreds;', 'Nhân với các trọng số mới rồi cộng để ghép số đảo. Kết quả int không lưu các số 0 ở đầu như một chuỗi.'],
  ], [
    ['const hundreds = Math.floor(n / 100);', 'Làm tròn xuống phép chia cho 100 để lấy chữ số hàng trăm chính xác trong miền n dương.'],
    ['const tens = Math.floor(n / 10) % 10;', 'Bỏ hàng đơn vị bằng Math.floor(n / 10), rồi lấy dư 10 để lấy hàng chục.'],
    ['const units = n % 10;', 'Lấy hàng đơn vị bằng phần dư của phép chia cho 10.'],
    ['return units * 100 + tens * 10 + hundreds;', 'Ghép các chữ số bằng số học và trả number; ví dụ 260 trở thành 62 vì number không giữ tiền tố 0.'],
  ]),
  entry('ch2-07', { functionName: 'Clock', parameters: ints('seconds', 'elapsed'), returnType: 'int32' }, [
    'seconds là thời điểm tính bằng số giây từ đầu ngày, không phải giờ dạng chuỗi. Cộng thêm elapsed giây rồi trả vị trí trong một ngày có 86 400 giây.',
    'Ví dụ công khai: 86 380 + 50 = 86 430, qua nửa đêm 30 giây nên trả 30. Nếu elapsed = 0, thời điểm giữ nguyên.',
    'elapsed có thể vượt nhiều ngày, nên chỉ trừ 86 400 một lần là chưa đủ. Tổng tối đa 1 086 399, an toàn với int và number; các input đều không âm.',
  ], [
    'Cộng seconds + elapsed để tính thời điểm trước khi quay vòng.',
    'Lấy phần dư của tổng khi chia cho 86 400 để bỏ mọi ngày trọn vẹn. Kết quả luôn trong [0, 86 399], kể cả khi tổng đúng bằng một số ngày.',
  ], [
    ['return (seconds + elapsed) % 86400;', 'Dấu ngoặc tính tổng trước. % 86400 bỏ các ngày trọn vẹn; với input không âm, phần dư là số giây từ đầu ngày mới.'],
  ], [
    ['return (seconds + elapsed) % 86400;', 'Cộng hai number rồi lấy dư 86400. Tổng là số nguyên không âm và nhỏ nên chính xác; không cần Date, múi giờ hoặc vòng lặp.'],
  ]),
  entry('ch2-08', { functionName: 'Boxes', parameters: ints('items', 'capacity'), returnType: 'int32' }, [
    'Tìm số thùng ít nhất, tính cả thùng cuối chưa đầy. Ví dụ công khai 23 vật và capacity = 5 cần 5 thùng; 0 vật cần 0 thùng.',
    'Thương nguyên items / capacity chỉ đếm các thùng đầy. Nếu còn dư phải thêm một thùng, nhưng không được thêm khi chia hết.',
    'Với items ≥ 0 và capacity ≥ 1, có thể làm tròn lên bằng chia nguyên (items + capacity - 1) / capacity. Tử số tối đa 1 000 999 nên không tràn int.',
  ], [
    'Cộng capacity - 1 vào items trước khi chia nguyên để gộp xử lý trường hợp có thùng cuối chưa đầy.',
    'Chia nguyên cho capacity: C# dùng / trên int; JavaScript dùng Math.floor. Công thức vẫn cho 0 khi items = 0 và không thêm thùng thừa khi chia hết.',
  ], [
    ['return (items + capacity - 1) / capacity;', 'Với các input không âm và capacity dương, phép chia int sau khi cộng capacity - 1 tương đương làm tròn lên items / capacity. Trả số thùng nguyên.'],
  ], [
    ['return Math.floor((items + capacity - 1) / capacity);', 'Phép / của JavaScript không tự lấy thương nguyên, nên dùng Math.floor sau phép bù capacity - 1; không return số thập phân hoặc luôn cộng thêm 1.'],
  ]),
  entry('ch2-09', { functionName: 'ProgressionSum', parameters: ints('first', 'step', 'count'), returnType: 'int32' }, [
    'Dãy có count số, bắt đầu bằng first và tăng step mỗi lần. Số cuối là first + (count - 1) × step vì số đầu chưa cần tăng lần nào.',
    'Ví dụ công khai first = 3, step = 4, count = 5 tạo 3, 7, 11, 15, 19, tổng 55. Nếu step = 0, mọi số đều bằng first; (7, 0, 3) cho 21.',
    'Ghép số đầu với số cuối cho cùng tổng, suy ra S = count × (first + last) / 2. count ≥ 1 nên không cần nhánh dãy rỗng.',
    'Theo giới hạn first, step ≤ 100 và count ≤ 1 000, last ≤ 100 000; tích trước khi chia 2 tối đa 100 100 000, vẫn an toàn với int32 và number. Phải nhân trước rồi mới chia để không làm mất phần lẻ do chia nguyên quá sớm.',
  ], [
    'Tính last = first + (count - 1) × step, chú ý count - 1 thay vì count.',
    'Tính count × (first + last) rồi chia 2. Tích luôn chẵn: count chẵn thì rõ ràng; count lẻ thì count - 1 chẵn nên first + last cũng chẵn.',
    'Return tổng bằng biểu thức số học, không tạo mảng hoặc cộng bằng vòng lặp; count = 1 tự trả first.',
  ], [
    ['int last = first + (count - 1) * step;', 'Từ phần tử đầu, thực hiện count - 1 bước tăng để có phần tử cuối. Ngoặc giữ đúng số bước trước khi nhân step.'],
    ['return count * (first + last) / 2;', 'Nhân số phần tử với tổng đầu-cuối trước khi chia 2. Tích chẵn và không tràn trong giới hạn đề nên phép chia int trả đúng tổng.'],
  ], [
    ['const last = first + (count - 1) * step;', 'const last lưu phần tử cuối; dùng count - 1 để tránh lệch thêm một bước so với dãy có count phần tử.'],
    ['return count * (first + last) / 2;', 'Áp dụng công thức tổng cấp số cộng. Tích là số chẵn nằm trong miền number chính xác, nên / 2 trả số nguyên mà không cần Math.floor.'],
  ]),
]
