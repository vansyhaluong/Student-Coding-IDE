// Fixed roadmap from Requirement Section 21. Full lesson content belongs to 9B.
export const learningChapters = [
  { id: 1, title: 'Giới thiệu môn Kỹ thuật lập trình', summary: 'Làm quen với môn học, mục tiêu và cách sử dụng không gian học tập.' },
  { id: 2, title: 'Kiến thức lập trình cơ bản', summary: 'Nền tảng để diễn đạt bài toán bằng ngôn ngữ lập trình.' },
  { id: 3, title: 'Cấu trúc rẽ nhánh', summary: 'Tổ chức các hướng xử lý theo điều kiện của bài toán.' },
  { id: 4, title: 'Cấu trúc lặp', summary: 'Mô tả và kiểm soát những thao tác cần thực hiện nhiều lần.' },
  { id: 5, title: 'Kỹ thuật xử lý chuỗi', summary: 'Làm việc với văn bản và các thao tác trên chuỗi ký tự.' },
  { id: 6, title: 'Hàm', summary: 'Chia bài toán thành các phần có trách nhiệm rõ ràng.' },
  { id: 7, title: 'Kỹ thuật xử lý mảng một chiều', summary: 'Tổ chức và xử lý một dãy dữ liệu.' },
  { id: 8, title: 'Kỹ thuật xử lý mảng hai chiều', summary: 'Mở rộng cách tổ chức dữ liệu theo hàng và cột.' },
] as const

export type ChapterId = typeof learningChapters[number]['id']
