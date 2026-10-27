import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import { chapter3Solutions } from './chapter3-solutions'
import { chapter4Solutions } from './chapter4-solutions'
import { chapter5Solutions } from './chapter5-solutions'
import { chapter6Solutions } from './chapter6-solutions'
import { chapter7Solutions } from './chapter7-solutions'

export interface SolutionLine { code: string; explanation: string; lineNumber?: number }
export interface ExerciseSolution {
  exerciseId: string
  signature: Pick<Exercise, 'functionName' | 'parameters' | 'returnType'>
  analysis: string[]
  algorithm: string[]
  languages: Record<ExerciseLanguage, { lines: SolutionLine[]; code?: string }>
  complexity: { time: string; space: string }
}

// Independently authored teaching content. Only public statement/signature/samples are used.
const sum: ExerciseSolution = {
  exerciseId: 'ch2-01',
  signature: { functionName: 'Sum', parameters: [{ name: 'a', type: 'int32' }, { name: 'b', type: 'int32' }], returnType: 'int32' },
  analysis: [
    'Bài toán yêu cầu trả về tổng của hai số nguyên a và b. Input là hai tham số của hàm, không phải hai dòng nhập từ bàn phím. Output là một giá trị số nguyên duy nhất.',
    'Ví dụ công khai: a = 14, b = -6 thì kết quả là 8, vì 14 + (-6) = 8. Với a = 0, b = 0, kết quả là 0. Phép cộng cũng áp dụng trực tiếp khi có số âm.',
    'Theo giới hạn |a|, |b| ≤ 1 000 000, tổng nằm trong [-2 000 000, 2 000 000], an toàn với int của C# và số nguyên biểu diễn chính xác bằng number của JavaScript. Không cần xử lý tràn số ngoài miền input đã quy định.',
    'Chỉ trả về giá trị. Không thêm Main, không đọc Console/STDIN, không in Console/STDOUT; IDE sẽ gọi hàm với từng bộ tham số.',
  ],
  algorithm: [
    'Nhận hai số a và b qua tham số. Giữ nguyên tên hàm Sum và đúng thứ tự tham số để IDE gọi được lời giải.',
    'Tính a + b bằng toán tử cộng. Hai input đều là số nguyên; không cần chuyển chuỗi thành số, dùng vòng lặp hay xây dựng mảng.',
    'Trả kết quả bằng return. Cách này thể hiện đúng phép toán của đề bài và không tạo thêm trạng thái hoặc tác dụng phụ.',
  ],
  languages: {
    csharp: { lines: [
      { code: 'public class Solution', explanation: 'Khai báo lớp public tên Solution đúng mẫu C# của IDE. Không tạo chương trình Console hay đổi tên lớp.' },
      { code: '{', explanation: 'Mở thân lớp Solution; hàm Sum được khai báo bên trong lớp này.' },
      { code: '    public int Sum(int a, int b)', explanation: 'Khai báo phương thức instance public tên Sum. Hai tham số a, b và giá trị trả về đều là int (số nguyên 32-bit). Không thêm static hoặc đổi chữ hoa/thường của tên hàm.' },
      { code: '    {', explanation: 'Mở thân phương thức Sum, nơi xử lý các giá trị input được IDE truyền vào.' },
      { code: '        return a + b;', explanation: 'Cộng hai số nguyên rồi trả ngay tổng cho nơi gọi. Dấu chấm phẩy kết thúc câu lệnh; không dùng Console.WriteLine thay cho return.' },
      { code: '    }', explanation: 'Đóng thân phương thức Sum sau khi đã xác định giá trị trả về.' },
      { code: '}', explanation: 'Đóng lớp Solution. Đây là toàn bộ source cần dùng cho bài này.' },
    ] },
    javascript: { lines: [
      { code: 'function Sum(a, b) {', explanation: 'Khai báo hàm Sum ở cấp cao nhất, đúng tên và thứ tự tham số a, b. JavaScript không ghi kiểu int trong khai báo; IDE truyền hai giá trị number là số nguyên theo contract của bài.' },
      { code: '    return a + b;', explanation: 'Toán tử + cộng hai number và return trả kết quả về nơi gọi. Input đã là số nên không cần parseInt; không dùng console.log hoặc trả chuỗi. Tổng vẫn là số nguyên biểu diễn chính xác trong miền giới hạn.' },
      { code: '}', explanation: 'Đóng thân hàm Sum. Không thêm lời gọi hàm, đọc stdin hoặc module.exports; IDE chịu trách nhiệm gọi hàm.' },
    ] },
  },
  complexity: {
    time: 'O(1) — chỉ thực hiện một phép cộng và một lần return, không phụ thuộc giá trị của a hoặc b trong miền số đã cho.',
    space: 'O(1) — chỉ dùng hai tham số và giá trị kết quả, không cấp phát mảng hay dùng đệ quy.',
  },
}

const solutions: ReadonlyMap<string, ExerciseSolution> = new Map([sum, ...chapter3Solutions, ...chapter4Solutions, ...chapter5Solutions, ...chapter6Solutions, ...chapter7Solutions].map(solution => [solution.exerciseId, solution]))
export function solutionFor(exercise: Exercise): ExerciseSolution | undefined {
  const solution = solutions.get(exercise.id)
  return solution && solution.signature.functionName === exercise.functionName
    && solution.signature.returnType === exercise.returnType
    && solution.signature.parameters.length === exercise.parameters.length
    && solution.signature.parameters.every((parameter, index) => parameter.name === exercise.parameters[index].name
      && parameter.type === exercise.parameters[index].type) ? solution : undefined
}
export const solutionCode = (solution: ExerciseSolution, language: ExerciseLanguage) => solution.languages[language].code ?? solution.languages[language].lines.map(line => line.code).join('\n')
