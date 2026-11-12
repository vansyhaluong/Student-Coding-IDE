import type { Exercise } from '../../../src/shared/contracts/practice'

export const descriptionExercise: Exercise = {
  id: 'typography', chapter: 2, title: 'Tổng các phần tử — Đọc hiểu dữ liệu tiếng Việt', difficulty: 'Easy',
  description: [
    'Cho **mảng số nguyên** `nums`, hãy trả về tổng các phần tử. Tiếng Việt: ă â đ ê ô ơ ư Á Ề Ỹ.',
    'Đoạn thứ hai giữ nguyên nội dung khi thay đổi kích thước.',
    '## Cách đọc đề\n\n- Đọc đầu vào.\n- Tính tổng.\n\n1. Duyệt mảng.\n2. Trả kết quả.',
    '```javascript\nconst tổng = nums.reduce((a, b) => a + b, 0);\n' + 'x'.repeat(180) + '\n```',
    '| Giá trị | Ý nghĩa |\n| --- | --- |\n| `nums` | Mảng đầu vào |',
    '[Tham khảo](https://example.invalid/reference) ![Minh họa tiếng Việt](https://example.invalid/image.png)',
    '<script>window.unexpected = true</script>',
  ].join('\n\n'),
  constraints: ['`1 <= nums.length <= 100000`', '**Giới hạn:** số nguyên có dấu.', 'Tên_dài_' + 'dữ_liệu_'.repeat(40)],
  functionName: 'Sum', parameters: [{ name: 'nums', type: 'int32[]' }], returnType: 'int32',
  languages: { csharp: { monacoId: 'csharp', starter: '' }, javascript: { monacoId: 'javascript', starter: '' } },
  samples: [{ args: [[1, 2, 3]], expected: 6 }, { args: [Array.from({ length: 90 }, (_, i) => i)], expected: 4005 }],
  source: { publisher: 'Nguồn học tập', url: 'https://example.invalid/' + 'reference'.repeat(30), usage: 'Nội dung nguồn được giữ nguyên.' },
}
