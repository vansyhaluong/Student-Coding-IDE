import { isExercise, type Exercise, type ExerciseType, type ExerciseTest } from '../../../../shared/contracts/practice'

// Independently authored Vietnamese statements/examples. References identify concepts,
// not imported text/code. Difficulty is relative to this course, not source rankings.
type Row = [title: string, name: string, params: string, result: ExerciseType, description: string, constraints: string, tests: ExerciseTest[], source?: string]
const t = (args: ExerciseTest['args'], expected: ExerciseTest['expected']): ExerciseTest => ({ args, expected })
const chapters: Record<number, Row[]> = {
  2: [
    ['Tổng hai số', 'Sum', 'a:int32,b:int32', 'int32', 'Tính tổng hai số nguyên a và b.', '|a|, |b| ≤ 1000000.', [t([14, -6], 8), t([0, 0], 0)]],
    ['Chu vi hình chữ nhật', 'Perimeter', 'width:int32,height:int32', 'int32', 'Một khung ảnh có chiều rộng width và chiều cao height. Trả về chu vi khung.', '1 ≤ width, height ≤ 10000.', [t([7, 4], 22), t([1, 1], 4)]],
    ['Đổi phút thành giây', 'Seconds', 'minutes:int32', 'int32', 'Trả về số giây tương ứng với minutes phút.', '0 ≤ minutes ≤ 10000.', [t([9], 540), t([0], 0)]],
    ['Thương và số dư', 'Divide', 'a:int32,b:int32', 'int32[]', 'Chia a cho b. Trả về [thương nguyên, số dư] theo đúng thứ tự này.', '0 ≤ a ≤ 1000000; 1 ≤ b ≤ 1000.', [t([29, 6], [4, 5]), t([3, 8], [0, 3])]],
    ['Tổng ba chữ số', 'DigitSum3', 'n:int32', 'int32', 'Tách hàng trăm, chục, đơn vị của n và trả về tổng ba chữ số.', '100 ≤ n ≤ 999.', [t([581], 14), t([100], 1)]],
    ['Đảo số ba chữ số', 'Reverse3', 'n:int32', 'int32', 'Đảo thứ tự ba chữ số của n rồi trả về giá trị nguyên; các số 0 ở đầu kết quả không được giữ lại.', '100 ≤ n ≤ 999.', [t([260], 62), t([731], 137)]],
    ['Đồng hồ sau một khoảng thời gian', 'Clock', 'seconds:int32,elapsed:int32', 'int32', 'seconds là số giây tính từ đầu ngày. Sau elapsed giây, trả về số giây tính từ đầu ngày mới, quay vòng mỗi 86400 giây.', '0 ≤ seconds < 86400; 0 ≤ elapsed ≤ 1000000.', [t([86380, 50], 30), t([100, 0], 100)]],
    ['Đóng thùng', 'Boxes', 'items:int32,capacity:int32', 'int32', 'Có items vật giống nhau, mỗi thùng chứa tối đa capacity vật. Tính số thùng ít nhất cần dùng, kể cả thùng cuối chưa đầy.', '0 ≤ items ≤ 1000000; 1 ≤ capacity ≤ 1000.', [t([23, 5], 5), t([0, 3], 0)]],
    ['Tổng cấp số cộng', 'ProgressionSum', 'first:int32,step:int32,count:int32', 'int32', 'Dãy bắt đầu bằng first; mỗi số sau tăng thêm step. Trả về tổng count số đầu tiên bằng biểu thức số học.', '0 ≤ first, step ≤ 100; 1 ≤ count ≤ 1000; kết quả nằm trong int32.', [t([3, 4, 5], 55), t([7, 0, 3], 21)]],
  ],
  3: [
    ['Kiểm tra chẵn', 'IsEven', 'n:int32', 'boolean', 'Trả về true nếu n chia hết cho 2, ngược lại false.', '|n| ≤ 1000000.', [t([-8], true), t([7], false)]],
    ['Dấu của một số', 'Sign', 'n:int32', 'int32', 'Trả về -1 khi n âm, 0 khi n bằng 0 và 1 khi n dương.', '|n| ≤ 1000000.', [t([-14], -1), t([0], 0)]],
    ['Số lớn nhất trong ba số', 'Max3', 'a:int32,b:int32,c:int32', 'int32', 'Dùng rẽ nhánh tìm giá trị lớn nhất trong a, b và c; cho phép các số bằng nhau.', '|a|, |b|, |c| ≤ 1000000.', [t([9, 2, 9], 9), t([-5, -2, -8], -2)]],
    ['Năm nhuận', 'LeapYear', 'year:int32', 'boolean', 'Theo lịch Gregory, năm chia hết cho 400 hoặc chia hết cho 4 nhưng không chia hết cho 100 là năm nhuận. Trả về kết quả kiểm tra.', '1 ≤ year ≤ 9999.', [t([2400], true), t([2100], false)]],
    ['Phân loại tam giác', 'Triangle', 'a:int32,b:int32,c:int32', 'string', 'Trả về "invalid" nếu ba cạnh không tạo thành tam giác; nếu hợp lệ trả về "equilateral" (đều), "isosceles" (cân) hoặc "scalene" (thường).', '1 ≤ a, b, c ≤ 10000.', [t([4, 4, 7], 'isosceles'), t([2, 3, 5], 'invalid')]],
    ['Số ngày trong tháng', 'DaysInMonth', 'month:int32,year:int32', 'int32', 'Trả về số ngày của month trong year theo lịch Gregory. Áp dụng quy tắc năm nhuận cho tháng 2.', '1 ≤ month ≤ 12; 1 ≤ year ≤ 9999.', [t([2, 2024], 29), t([4, 2025], 30)]],
    ['Giá vé theo tuổi và ngày', 'Ticket', 'age:int32,weekend:boolean', 'int32', 'Vé cơ bản là 100. Trẻ dưới 6 tuổi miễn phí; tuổi 6–17 trả 50; tuổi 18–59 trả 100; từ 60 trả 70. Cuối tuần cộng 20 cho vé có trả tiền, vé miễn phí vẫn bằng 0.', '0 ≤ age ≤ 120.', [t([16, true], 70), t([4, true], 0)]],
    ['Ngày kế tiếp', 'NextDate', 'day:int32,month:int32,year:int32', 'int32[]', 'Cho một ngày hợp lệ trong lịch Gregory. Trả về [ngày, tháng, năm] của ngày tiếp theo; xử lý đổi tháng, năm và năm nhuận.', 'Ngày đầu vào hợp lệ; 1 ≤ year ≤ 9998.', [t([28, 2, 2024], [29, 2, 2024]), t([31, 12, 2025], [1, 1, 2026])]],
    ['Cước sử dụng theo bậc', 'Bill', 'units:int32', 'int32', '50 đơn vị đầu có giá 2 mỗi đơn vị; 50 đơn vị tiếp theo giá 3; phần vượt 100 giá 5. Trả về tổng tiền theo từng bậc, không tính toàn bộ theo bậc cuối.', '0 ≤ units ≤ 100000.', [t([120], 350), t([30], 60)]],
  ],
  4: [
    ['Cộng từ một đến n', 'SumToN', 'n:int32', 'int32', 'Dùng vòng lặp cộng các số nguyên từ 1 đến n. Khi n bằng 0, tổng bằng 0.', '0 ≤ n ≤ 10000.', [t([6], 21), t([0], 0)]],
    ['Giai thừa', 'Factorial', 'n:int32', 'int32', 'Tính tích 1 × 2 × … × n bằng vòng lặp. Quy ước 0! = 1.', '0 ≤ n ≤ 12.', [t([6], 720), t([0], 1)]],
    ['Đếm chữ số', 'DigitCount', 'n:int32', 'int32', 'Trả về số chữ số thập phân của số nguyên không âm n. Số 0 có một chữ số.', '0 ≤ n ≤ 1000000000.', [t([4008], 4), t([0], 1)]],
    ['Đảo số không âm', 'ReverseNumber', 'n:int32', 'int32', 'Dùng vòng lặp đảo thứ tự chữ số thập phân của n. Bỏ các số 0 ở đầu kết quả.', '0 ≤ n ≤ 100000000; kết quả nằm trong int32.', [t([4020], 204), t([0], 0)]],
    ['Ước chung lớn nhất', 'Gcd', 'a:int32,b:int32', 'int32', 'Tìm số nguyên dương lớn nhất chia hết cả a và b bằng thuật toán lặp.', '1 ≤ a, b ≤ 1000000.', [t([42, 30], 6), t([17, 5], 1)]],
    ['Kiểm tra số nguyên tố', 'IsPrime', 'n:int32', 'boolean', 'Một số nguyên tố lớn hơn 1 và chỉ có hai ước dương. Trả về true khi n là số nguyên tố.', '0 ≤ n ≤ 1000000.', [t([29], true), t([1], false)]],
    ['Đếm số nguyên tố đến n', 'PrimeCount', 'n:int32', 'int32', 'Đếm các số nguyên tố trong đoạn đóng từ 2 đến n; có thể dùng kiểm tra ước hoặc sàng.', '0 ≤ n ≤ 100000.', [t([20], 8), t([1], 0)]],
    ['Số hoàn hảo', 'IsPerfect', 'n:int32', 'boolean', 'Trả về true nếu tổng các ước dương nhỏ hơn n bằng chính n. Số 1 không là số hoàn hảo.', '1 ≤ n ≤ 1000000.', [t([28], true), t([12], false)]],
    ['Fibonacci bằng vòng lặp', 'Fibonacci', 'n:int32', 'int32', 'Với F(0)=0, F(1)=1 và F(n)=F(n-1)+F(n-2), trả về F(n). Duyệt lặp thay vì xây cây đệ quy.', '0 ≤ n ≤ 45.', [t([9], 34), t([0], 0)]],
  ],
  5: [
    ['Độ dài từ cuối', 'LastWordLength', 's:string', 'int32', 'Một dòng gồm các từ chữ thường ngăn bởi dấu cách. Trả về độ dài từ cuối cùng, bỏ qua dấu cách cuối dòng.', '1 ≤ s.length ≤ 1000; chỉ a–z và dấu cách; có ít nhất một từ.', [t(['hoc code  '], 4), t(['a'], 1)], 'length-of-last-word'],
    ['Vị trí chuỗi con đầu tiên', 'FindFirst', 'text:string,pattern:string', 'int32', 'Trả về chỉ số bắt đầu nhỏ nhất của pattern trong text, tính từ 0. Nếu không xuất hiện, trả về -1.', '0 ≤ text.length ≤ 1000; 1 ≤ pattern.length ≤ 100; chỉ a–z.', [t(['bananaba', 'ana'], 1), t(['abc', 'dd'], -1)], 'find-the-index-of-the-first-occurrence-in-a-string'],
    ['Tiền tố chung', 'CommonPrefix', 'words:string[]', 'string', 'Trả về chuỗi dài nhất nằm ở đầu mọi từ trong words. Không có tiền tố chung thì trả về chuỗi rỗng.', '1 ≤ words.length ≤ 100; mỗi từ dài 0–100, chỉ a–z.', [t([['coding', 'code', 'cobalt']], 'co'), t([['a', 'b']], '')], 'longest-common-prefix'],
    ['Đảo thứ tự các từ', 'ReverseWords', 's:string', 'string', 'Đảo thứ tự các từ trong s; các từ ở kết quả ngăn bởi đúng một dấu cách và không có dấu cách ở hai đầu.', '1 ≤ s.length ≤ 1000; chỉ a–z và dấu cách; có ít nhất một từ.', [t(['  em hoc   code '], 'code hoc em'), t(['mot'], 'mot')], 'reverse-words-in-a-string'],
    ['Đoạn không lặp ký tự', 'LongestUnique', 's:string', 'int32', 'Tìm độ dài lớn nhất của một đoạn liên tiếp trong s mà không có ký tự xuất hiện hai lần.', '0 ≤ s.length ≤ 10000; chỉ a–z.', [t(['abccade'], 4), t([''], 0)], 'longest-substring-without-repeating-characters'],
    ['Hai từ hoán vị', 'Anagram', 's:string,t:string', 'boolean', 'Kiểm tra hai chuỗi có cùng số lần xuất hiện của từng chữ cái hay không; thứ tự chữ cái có thể khác.', '0 ≤ s.length, t.length ≤ 10000; chỉ a–z.', [t(['aab', 'aba'], true), t(['ab', 'aa'], false)], 'valid-anagram'],
    ['Cửa sổ phủ ký tự', 'MinWindow', 's:string,t:string', 'string', 'Tìm đoạn liên tiếp ngắn nhất của s chứa đủ số lần xuất hiện của mỗi ký tự trong t. Không có đoạn phù hợp thì trả về chuỗi rỗng.', '1 ≤ s.length, t.length ≤ 1000; chỉ a–z; nếu có đáp án thì đáp án ngắn nhất là duy nhất.', [t(['cabdab', 'bd'], 'bd'), t(['a', 'aa'], '')], 'minimum-window-substring'],
    ['Khoảng cách chỉnh sửa', 'EditDistance', 'a:string,b:string', 'int32', 'Mỗi thao tác thêm, xóa hoặc thay một ký tự có giá 1. Trả về số thao tác ít nhất để biến a thành b.', '0 ≤ a.length, b.length ≤ 100; chỉ a–z.', [t(['meo', 'heo'], 1), t(['', 'abc'], 3)], 'edit-distance'],
    ['Đếm cách giữ lại dãy con', 'SubsequenceCount', 's:string,t:string', 'int32', 'Chọn một số vị trí trong s theo thứ tự tăng dần sao cho các ký tự được chọn ghép thành t. Đếm số cách chọn vị trí. Chuỗi t rỗng có đúng một cách.', '0 ≤ s.length ≤ 20; 0 ≤ t.length ≤ 20; chỉ a–z; số cách không vượt 2^20.', [t(['aaaa', 'aa'], 6), t(['abc', ''], 1)], 'distinct-subsequences'],
  ],
  6: [
    ['Hàm giá trị tuyệt đối', 'Absolute', 'n:int32', 'int32', 'Viết hàm trả về khoảng cách từ n đến 0 trên trục số.', '|n| ≤ 1000000.', [t([-36], 36), t([0], 0)]],
    ['Hàm lũy thừa nguyên', 'Power', 'baseValue:int32,exponent:int32', 'int32', 'Viết hàm tính baseValue mũ exponent; quy ước mọi số mũ 0, kể cả 0^0, bằng 1.', '-5 ≤ baseValue ≤ 5; 0 ≤ exponent ≤ 10.', [t([-3, 3], -27), t([0, 0], 1)]],
    ['Hàm nhỏ nhất', 'Minimum', 'a:int32,b:int32', 'int32', 'Viết hàm nhận hai số nguyên và trả về giá trị nhỏ hơn; hai số bằng nhau thì trả về giá trị đó.', '|a|, |b| ≤ 1000000.', [t([-4, 7], -4), t([5, 5], 5)]],
    ['Bội chung nhỏ nhất', 'Lcm', 'a:int32,b:int32', 'int32', 'Tách hàm phụ tìm ước chung lớn nhất, rồi dùng nó để trả về bội dương nhỏ nhất chung của a và b.', '1 ≤ a, b ≤ 10000.', [t([15, 20], 60), t([7, 7], 7)]],
    ['Số đối xứng', 'PalindromeNumber', 'n:int32', 'boolean', 'Viết hàm kiểm tra biểu diễn thập phân của số không âm n có đọc giống nhau từ hai phía hay không.', '0 ≤ n ≤ 1000000000.', [t([12321], true), t([120], false)]],
    ['Danh sách ước số', 'Divisors', 'n:int32', 'int32[]', 'Viết hàm trả về tất cả ước dương của n theo thứ tự tăng dần, mỗi ước xuất hiện một lần.', '1 ≤ n ≤ 100000.', [t([12], [1, 2, 3, 4, 6, 12]), t([1], [1])]],
    ['Hệ số tổ hợp', 'Choose', 'n:int32,k:int32', 'int32', 'Trả về số cách chọn k phần tử từ n phần tử phân biệt. Tổ chức tính toán thành hàm; C(n,0)=C(n,n)=1.', '0 ≤ k ≤ n ≤ 20; mọi kết quả đều nằm trong int32.', [t([8, 3], 56), t([0, 0], 1)]],
    ['Tổng chữ số lặp', 'DigitalRoot', 'n:int32', 'int32', 'Viết hàm phụ tính tổng chữ số. Áp dụng nhiều lần cho n cho đến khi còn một chữ số, rồi trả về chữ số đó.', '0 ≤ n ≤ 1000000000.', [t([9876], 3), t([0], 0)]],
    ['Đếm nguyên tố trong đoạn', 'PrimesInRange', 'left:int32,right:int32', 'int32', 'Tách hàm kiểm tra nguyên tố để đếm các số nguyên tố trong đoạn đóng [left, right].', '0 ≤ left ≤ right ≤ 10000.', [t([10, 23], 5), t([0, 1], 0)]],
  ],
  7: [
    ['Hai phần tử đủ tổng', 'TwoSum', 'nums:int32[],target:int32', 'int32[]', 'Tìm hai vị trí khác nhau có tổng giá trị bằng target. Trả về hai chỉ số từ 0 theo thứ tự tăng dần; dữ liệu đảm bảo đúng một cặp.', '2 ≤ nums.length ≤ 1000; |nums[i]|, |target| ≤ 10000; đúng một cặp hợp lệ.', [t([[4, 1, 8, 3], 11], [2, 3]), t([[5, 5], 10], [0, 1])], 'two-sum'],
    ['Lợi nhuận một lần mua bán', 'MaxProfit', 'prices:int32[]', 'int32', 'Mỗi phần tử là giá một ngày. Được mua một lần rồi bán vào một ngày sau đó. Trả về lợi nhuận lớn nhất; không giao dịch thì lợi nhuận bằng 0.', '1 ≤ prices.length ≤ 10000; 0 ≤ prices[i] ≤ 10000.', [t([[9, 4, 7, 2, 8]], 6), t([[5, 3, 1]], 0)], 'best-time-to-buy-and-sell-stock'],
    ['Cộng một vào dãy chữ số', 'PlusOne', 'digits:int32[]', 'int32[]', 'Mảng digits ghi một số thập phân từ hàng cao xuống thấp. Trả về mảng chữ số của số đó cộng 1.', '1 ≤ digits.length ≤ 100; 0 ≤ digits[i] ≤ 9; không có số 0 đầu trừ số 0.', [t([[2, 9, 9]], [3, 0, 0]), t([[9]], [1, 0])], 'plus-one'],
    ['Tổng đoạn lớn nhất', 'MaxSubarray', 'nums:int32[]', 'int32', 'Chọn một đoạn liên tiếp không rỗng có tổng lớn nhất và trả về tổng của nó.', '1 ≤ nums.length ≤ 10000; |nums[i]| ≤ 1000.', [t([[-3, 5, -1, 4, -8]], 8), t([[-5, -2]], -2)], 'maximum-subarray'],
    ['Tích ngoài vị trí', 'ProductExceptSelf', 'nums:int32[]', 'int32[]', 'Kết quả tại i bằng tích mọi phần tử trừ nums[i]. Không dùng phép chia; xử lý cả phần tử 0.', '2 ≤ nums.length ≤ 20; -2 ≤ nums[i] ≤ 2; mọi tích nằm trong int32.', [t([[2, 0, 4]], [0, 8, 0]), t([[2, 3, 4]], [12, 8, 6])], 'product-of-array-except-self'],
    ['Tìm trong mảng xoay', 'SearchRotated', 'nums:int32[],target:int32', 'int32', 'Mảng tăng nghiêm ngặt đã được xoay vòng tại một vị trí bất kỳ. Trả về chỉ số của target hoặc -1 nếu không có.', '0 ≤ nums.length ≤ 10000; phần tử phân biệt; |nums[i]|, |target| ≤ 1000000.', [t([[6, 9, 1, 3, 4], 3], 3), t([[], 8], -1)], 'search-in-rotated-sorted-array'],
    ['Số dương đầu tiên còn thiếu', 'FirstMissingPositive', 'nums:int32[]', 'int32', 'Trả về số nguyên dương nhỏ nhất không có trong nums. Hướng đến việc sử dụng chính mảng để đánh dấu.', '0 ≤ nums.length ≤ 10000; |nums[i]| ≤ 1000000.', [t([[2, 3, -1, 1]], 4), t([[]], 1)], 'first-missing-positive'],
    ['Nước giữa các cột', 'TrappedWater', 'heights:int32[]', 'int32', 'Các cột có bề rộng 1 và chiều cao cho trong heights. Sau mưa, tính tổng đơn vị nước giữ lại giữa các cột.', '0 ≤ heights.length ≤ 10000; 0 ≤ heights[i] ≤ 10000.', [t([[3, 0, 2, 0, 3]], 7), t([[1, 2, 3]], 0)], 'trapping-rain-water'],
    ['Chia kẹo theo điểm', 'Candy', 'ratings:int32[]', 'int32', 'Học sinh đứng thành hàng, mỗi người nhận ít nhất một viên. Ai có điểm cao hơn hàng xóm liền kề phải nhận nhiều kẹo hơn người đó. Trả về tổng kẹo tối thiểu.', '1 ≤ ratings.length ≤ 10000; 0 ≤ ratings[i] ≤ 10000.', [t([[2, 1, 3]], 5), t([[1, 2, 2]], 4)], 'candy'],
  ],
  8: [
    ['Đổi hình dạng ma trận', 'Reshape', 'matrix:int32[][],rows:int32,cols:int32', 'int32[][]', 'Đọc phần tử theo hàng rồi xếp lại thành rows hàng và cols cột. Nếu số ô không bằng ma trận gốc, trả về ma trận gốc.', 'Ma trận chữ nhật 1–20 hàng/cột; 1 ≤ rows, cols ≤ 400; |matrix[i][j]| ≤ 1000.', [t([[[2, 4], [6, 8]], 1, 4], [[2, 4, 6, 8]]), t([[[1, 2]], 2, 2], [[1, 2]])], 'reshape-the-matrix'],
    ['Chuyển vị', 'Transpose', 'matrix:int32[][]', 'int32[][]', 'Trả về ma trận có hàng và cột đổi vai trò: phần tử hàng i cột j của đầu vào nằm ở hàng j cột i của đầu ra.', 'Ma trận chữ nhật 1–50 hàng/cột; |matrix[i][j]| ≤ 1000.', [t([[[1, 3, 5], [2, 4, 6]]], [[1, 2], [3, 4], [5, 6]]), t([[[7]]], [[7]])], 'transpose-matrix'],
    ['Tổng hai đường chéo', 'DiagonalSum', 'matrix:int32[][]', 'int32', 'Với ma trận vuông, cộng các phần tử trên đường chéo chính và phụ. Ô thuộc cả hai đường chỉ tính một lần.', 'Ma trận vuông cạnh 1–50; |matrix[i][j]| ≤ 1000.', [t([[[1, 2], [3, 4]]], 10), t([[[8]]], 8)], 'matrix-diagonal-sum'],
    ['Duyệt xoắn ốc', 'Spiral', 'matrix:int32[][]', 'int32[]', 'Trả về các phần tử theo đường xoắn ốc: bắt đầu ở góc trên trái, đi sang phải rồi xuống, sang trái, lên; thu hẹp vào trong cho đến hết ô.', 'Ma trận chữ nhật 1–50 hàng/cột; |matrix[i][j]| ≤ 1000.', [t([[[1, 2, 3], [4, 5, 6]]], [1, 2, 3, 6, 5, 4]), t([[[9], [8]]], [9, 8])], 'spiral-matrix'],
    ['Xóa hàng cột có số không', 'ZeroRowsCols', 'matrix:int32[][]', 'int32[][]', 'Nếu một ô ban đầu bằng 0, mọi ô cùng hàng hoặc cột của nó trong kết quả phải bằng 0. Các ô khác giữ giá trị cũ. Trả về ma trận kết quả.', 'Ma trận chữ nhật 1–50 hàng/cột; |matrix[i][j]| ≤ 1000.', [t([[[1, 0], [3, 4]]], [[0, 0], [3, 0]]), t([[[2]]], [[2]])], 'set-matrix-zeroes'],
    ['Xoay ma trận vuông', 'Rotate', 'matrix:int32[][]', 'int32[][]', 'Trả về ma trận vuông sau khi xoay 90 độ theo chiều kim đồng hồ. Hãy xác định ánh xạ từ vị trí cũ sang vị trí mới.', 'Ma trận vuông cạnh 1–50; |matrix[i][j]| ≤ 1000.', [t([[[1, 2], [3, 4]]], [[3, 1], [4, 2]]), t([[[6]]], [[6]])], 'rotate-image'],
    ['Hình chữ nhật toàn số một', 'MaxRectangle', 'matrix:int32[][]', 'int32', 'Chọn một hình chữ nhật gồm các ô liên tiếp theo hàng và cột, chỉ chứa số 1. Trả về diện tích lớn nhất, hoặc 0 nếu không có ô 1.', 'Ma trận chữ nhật 1–50 hàng/cột; mỗi ô là số nguyên 0 hoặc 1.', [t([[[1, 1, 0], [1, 1, 1]]], 4), t([[[0]]], 0)], 'maximal-rectangle'],
    ['Đường tăng dài nhất', 'LongestPath', 'matrix:int32[][]', 'int32', 'Bắt đầu ở ô bất kỳ, mỗi bước sang một ô kề trên, dưới, trái hoặc phải có giá trị lớn hơn nghiêm ngặt. Trả về số ô nhiều nhất trên một đường đi.', 'Ma trận chữ nhật 1–50 hàng/cột; |matrix[i][j]| ≤ 10000.', [t([[[1, 2], [4, 3]]], 4), t([[[5, 5]]], 1)], 'longest-increasing-path-in-a-matrix'],
    ['Năng lượng đi qua mê cung', 'MinimumHealth', 'grid:int32[][]', 'int32', 'Đi từ góc trên trái đến góc dưới phải, chỉ được sang phải hoặc xuống. Giá trị mỗi ô được cộng vào năng lượng ngay khi bước vào, kể cả ô đầu. Năng lượng luôn phải ít nhất 1. Trả về năng lượng ban đầu nhỏ nhất có thể.', 'Ma trận chữ nhật 1–50 hàng/cột; -100 ≤ grid[i][j] ≤ 100.', [t([[[-2, -3], [1, -5]]], 7), t([[[3]]], 1)], 'dungeon-game'],
  ],
}
const csTypes: Record<ExerciseType, string> = { int32: 'int', boolean: 'bool', string: 'string', 'int32[]': 'int[]', 'string[]': 'string[]', 'int32[][]': 'int[][]' }
const jsTypes: Record<ExerciseType, string> = { int32: 'number', boolean: 'boolean', string: 'string', 'int32[]': 'number[]', 'string[]': 'string[]', 'int32[][]': 'number[][]' }
export const exercises: Exercise[] = Object.entries(chapters).flatMap(([chapter, rows]) => rows.map((row, i): Exercise => {
  const [title, functionName, params, returnType, description, constraint, samples, slug] = row
  const parameters = params.split(',').map(p => { const [name, type] = p.split(':'); return { name, type: type as ExerciseType } })
  const section = ({ 2: 'basic', 3: 'conditional-statement', 4: 'for-loop', 6: 'function' } as Record<number, string>)[Number(chapter)]
  return {
    id: `ch${chapter}-0${i + 1}`, chapter: Number(chapter), title,
    difficulty: i < 3 ? 'Easy' : i < 6 ? 'Medium' : 'Hard', description,
    constraints: [constraint, 'Chỉ trả về kết quả; không đọc/ghi Console hoặc STDIN/STDOUT. Chỉ số mảng/chuỗi tính từ 0.'],
    functionName, parameters, returnType, samples,
    languages: {
      csharp: { monacoId: 'csharp', starter: `public class Solution\n{\n    public ${csTypes[returnType]} ${functionName}(${parameters.map(p => `${csTypes[p.type]} ${p.name}`).join(', ')})\n    {\n        // Viết lời giải của bạn tại đây.\n        throw new System.NotImplementedException();\n    }\n}\n` },
      javascript: { monacoId: 'javascript', starter: `/**\n${parameters.map(p => ` * @param {${jsTypes[p.type]}} ${p.name}`).join('\n')}\n * @returns {${jsTypes[returnType]}}\n */\nfunction ${functionName}(${parameters.map(p => p.name).join(', ')}) {\n    // Viết lời giải của bạn tại đây.\n    throw new Error("Chưa triển khai");\n}\n` },
    },
    source: {
      url: slug ? `https://leetcode.com/problems/${slug}/` : `https://www.w3resource.com/csharp-exercises/${section}/index.php`,
      publisher: slug ? 'LeetCode' : 'w3resource',
      usage: 'Tham khảo ý tưởng thuật toán; mô tả tiếng Việt, ví dụ, giới hạn và hàm mẫu được biên soạn độc lập. Không sao chép đề hoặc lời giải nguồn. Độ khó theo chương của khóa học; không phải xếp hạng nguồn. Bài trả về ma trận dùng mảng số nguyên chữ nhật và trả về giá trị, không chấm thay đổi tại chỗ.',
    },
  }
}))
if (exercises.length !== 63 || exercises.some(e => !isExercise(e))) throw new Error('Invalid authored exercise catalogue')
