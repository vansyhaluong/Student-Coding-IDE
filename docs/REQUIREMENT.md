# REQUIREMENT.md

## 1. Tổng quan dự án

### 1.1. Tên dự án

**Student Coding IDE**
Tên tạm thời, có thể đổi sau.

### 1.2. Nền tảng phát triển và repository

Student Coding IDE là một desktop IDE được xây dựng độc lập từ đầu trong
repository riêng. Project không phải là fork trực tiếp của Orca, không clone
source Orca vào source tree để chỉnh sửa và không kế thừa Git history của Orca.

#### 1.2.1. Student Coding IDE repository

* Student Coding IDE repository: <https://github.com/vansyhaluong/Student-Coing-IDE>
* Repository model: Independent implementation.

Repository này là source repository chính thức của Student Coding IDE. Không gọi
repository này là Orca fork trong documentation hoặc Git workflow của project.

#### 1.2.2. Orca Reference Repository

* Reference repository: <https://github.com/stablyai/orca>
* Reference branch: `main`
* Reference Commit: `4bb337741c335cfcc428d3b4271023566e2dadb8`
* Reference license: MIT License.

Reference Commit phải được lưu trong `docs/REFERENCE-BASELINE.md` để quá trình
nghiên cứu có thể tái lập khi Orca tiếp tục thay đổi.

Orca chỉ được sử dụng như một **Reference Implementation** để nghiên cứu:

* Kiến trúc Electron desktop IDE và application lifecycle.
* Main process, preload, renderer và IPC.
* Monaco Editor integration.
* File system handling.
* Integrated terminal và process execution.
* Git integration.
* Workspace/project management.
* Settings và local persistence.
* UI/UX patterns.

Mô hình phát triển chính thức:

```text
Orca
  ↓
Reference / Architecture Study
  ↓
Design Decisions
  ↓
Student Coding IDE
  ↓
Independent Implementation
```

Việc tham khảo Orca không đồng nghĩa với sao chép nguyên module, nhập source tree
Orca hoặc sửa Orca thành Student Coding IDE.

### 1.3. Technology Stack

Stack đã được xác lập qua Phase 0 và các ADR được chấp nhận trong Phase 1:

| Thành phần | Công nghệ / định hướng |
| --- | --- |
| Desktop shell | Electron |
| Renderer UI | React + TypeScript |
| Build / Development | electron-vite |
| Editor | Monaco Editor |
| Terminal UI | xterm.js |
| Terminal / PTY backend | `node-pty`, subject to the Phase 2 Windows/native compatibility gate |
| Styling | Tailwind CSS |
| Local persistence | Versioned JSON dưới Electron user data, với atomic write, backup và recovery |
| Git | Local Git CLI phía sau typed GitService |
| Language Intelligence | Language Service / Language Server architecture; provider selection vẫn TBD trước Phase 3 |

Student Coding IDE là Electron desktop application, không phải Next.js web
application. Các lựa chọn còn TBD hợp lệ, bao gồm renderer shared state library,
language provider, Python/Pyright distribution và TypeScript Run strategy, phải
được ghi quyết định trong `docs/DECISIONS.md` trước khi subsystem tương ứng được
implementation.

### 1.4. Mục tiêu

Xây dựng một IDE desktop phục vụ việc:

* Viết code bằng tay.
* Quản lý project.
* Chạy chương trình.
* Xem output và lỗi.
* Làm việc với Git.
* Hỗ trợ nhiều ngôn ngữ lập trình.

Trong giai đoạn đầu, dự án **chưa triển khai hoặc tập trung vào AI Agent**.

Mục tiêu chính là xây dựng một IDE hoạt động ổn định trước, sau đó mới xem xét tích hợp AI trong các giai đoạn tiếp theo.

---

## 2. Phạm vi dự án

### 2.1. Trong phạm vi

Phiên bản đầu cần hỗ trợ:

1. Quản lý project.
2. Quản lý file và thư mục.
3. Code editor.
4. Terminal tích hợp.
5. Chạy chương trình.
6. Hiển thị output.
7. Git cơ bản.
8. Quản lý nhiều project gần đây.
9. Settings cơ bản.
10. Giao diện desktop trên Windows.
11. IntelliSense cho các ngôn ngữ ưu tiên của phiên bản đầu.
12. Diagnostics trong editor và Problems panel.

---

### 2.2. Ngoài phạm vi hiện tại

Các chức năng sau **chưa thực hiện trong giai đoạn đầu**:

* AI Agent.
* Codex integration.
* Claude Code integration.
* Gemini integration.
* Grok integration.
* AI tự động sửa source code.
* AI tự động chạy command.
* Multi-agent orchestration.
* AI worktree.
* Cloud IDE.
* Collaboration nhiều người dùng.
* Đồng bộ project lên cloud.
* Marketplace extension riêng.
* Formatter, bao gồm Format Document và Format on Save.
* Debugger, bao gồm breakpoint, stepping, variables và call stack.

Các chức năng này có thể được nghiên cứu ở phase sau.

---

## 3. Đối tượng sử dụng

### 3.1. Sinh viên / người học lập trình

Người dùng có thể:

* Tạo project.
* Mở project có sẵn.
* Tạo file.
* Tạo folder.
* Viết code.
* Chạy code.
* Xem kết quả.
* Xem lỗi.
* Sử dụng terminal.
* Quản lý source bằng Git.

---

## 4. Yêu cầu chức năng

### FR-001 — Mở project

Người dùng có thể mở một thư mục trên máy làm project.

#### Yêu cầu

* Cho phép chọn thư mục từ hệ thống.
* Hiển thị cấu trúc thư mục trong Explorer.
* Project được hiển thị trong workspace hiện tại.
* Có thể chuyển sang project khác.

---

### FR-002 — Tạo project mới

Người dùng có thể tạo một project mới.

#### Yêu cầu

Người dùng nhập:

* Tên project.
* Vị trí lưu project.

Hệ thống tạo thư mục project tương ứng.

Giai đoạn đầu có thể chỉ hỗ trợ tạo thư mục project trống.

Trong V1, người dùng chọn thư mục cha và nhập tên project. Hệ thống chỉ tạo một
thư mục project trống mới dưới thư mục cha đó. Nếu thư mục đích đã tồn tại, thao
tác phải thất bại an toàn; không tái sử dụng thư mục rỗng có sẵn, ghi đè, hợp
nhất nội dung hoặc tự động chọn tên khác.

---

### FR-003 — Recent Projects

Hệ thống lưu danh sách các project đã mở gần đây.

#### Yêu cầu

Hiển thị:

* Tên project.
* Đường dẫn.
* Thời gian mở gần nhất.

Người dùng có thể nhấn vào project để mở lại.

---

## 5. File Explorer

### FR-004 — Hiển thị cấu trúc project

Explorer phải hiển thị:

* Folder.
* Subfolder.
* File.

Dạng cây thư mục.

---

### FR-005 — Tạo file

Người dùng có thể:

* Chọn folder.
* Tạo file mới.
* Nhập tên file.

Ví dụ:

```text
main.js
index.html
Program.cs
main.py
```

---

### FR-006 — Tạo folder

Người dùng có thể tạo folder mới trong project.

Ví dụ:

```text
src/
components/
services/
models/
```

---

### FR-007 — Rename

Cho phép đổi tên:

* File.
* Folder.

---

### FR-008 — Delete

Cho phép xóa:

* File.
* Folder.

Phải có xác nhận trước khi xóa folder không rỗng hoặc thực hiện thao tác xóa có
nguy cơ làm mất dữ liệu.

Trong V1, mọi thao tác xóa file hoặc folder đều yêu cầu xác nhận rõ ràng trong
Renderer. Sau khi xác nhận, Main chuyển mục tiêu vào Recycle Bin bằng capability
Electron được giới hạn cho domain filesystem. Không xóa vĩnh viễn và không tự
động fallback sang xóa vĩnh viễn nếu thao tác Recycle Bin thất bại.

---

## 6. Code Editor

### FR-009 — Mở file

Khi người dùng chọn file trong Explorer:

* File được mở trong editor.
* Nội dung được hiển thị.
* File có thể chỉnh sửa.

---

### FR-010 — Multiple Tabs

Cho phép mở nhiều file cùng lúc dưới dạng tab.

Ví dụ:

```text
main.ts | app.ts | package.json
```

Người dùng có thể:

* Chuyển tab.
* Đóng tab.
* Xem trạng thái file chưa save.

---

### FR-011 — Syntax Highlighting

Editor phải hỗ trợ tô màu syntax theo ngôn ngữ.

Mức hỗ trợ ngôn ngữ của phiên bản đầu được chia thành các tier:

#### Tier 1 — Language Intelligence và Run

Các ngôn ngữ cần được ưu tiên triển khai đầy đủ:

* JavaScript.
* TypeScript.
* Python.

Acceptance criteria tối thiểu cho mỗi ngôn ngữ Tier 1:

* Syntax highlighting.
* Completion.
* Hover.
* Signature Help.
* Go to Definition.
* Diagnostics.
* Problems panel.
* Run.

#### Tier 2 — Language Intelligence

Các ngôn ngữ cần hỗ trợ:

* HTML.
* CSS.
* JSON.

Acceptance criteria tối thiểu cho mỗi ngôn ngữ Tier 2:

* Syntax highlighting.
* Completion.
* Hover nếu language service hỗ trợ.
* Diagnostics.
* Problems panel.

Tier 2 không bắt buộc hỗ trợ Run trong V1.

#### Tier 3 — Mở rộng sau khi Tier 1 và Tier 2 ổn định

Trong phiên bản đầu, các ngôn ngữ sau có thể chỉ hỗ trợ syntax highlighting:

* Java.
* C#.
* PHP.

Language Intelligence và Run cho Tier 3 không phải acceptance criteria của V1.

Khái niệm hỗ trợ ngôn ngữ trong phiên bản đầu không bao gồm formatter,
debugger, refactoring nâng cao, Rename Symbol toàn project, Call Hierarchy hoặc
Test Explorer.

---

### FR-012 — Auto Save / Manual Save

Người dùng có thể lưu file bằng:

```text
Ctrl + S
```

Auto Save được bật hoặc tắt trong Settings theo FR-036.

---

### FR-013 — Unsaved Changes Protection

IDE phải bảo vệ file có thay đổi chưa được lưu khi người dùng:

* Đóng tab.
* Đóng project.
* Chuyển project nếu thao tác làm mất editor state.
* Đóng application.

Nếu có unsaved changes, người dùng phải có các lựa chọn tương đương:

```text
Save
Don't Save
Cancel
```

IDE không được tự ý discard source code. Requirement này phải tuân thủ
NFR-004 — Data Safety.

---

### FR-014 — Line Number

Editor hiển thị số dòng.

---

### FR-015 — Search trong file

Cho phép tìm kiếm nội dung trong file hiện tại.

Phím tắt:

```text
Ctrl + F
```

---

### FR-016 — Search trong project

Cho phép tìm kiếm text trên toàn bộ project.

Kết quả cần hiển thị:

* File.
* Dòng.
* Nội dung match.

Search toàn project phải:

* Chạy bất đồng bộ và không block renderer.
* Không làm đóng băng UI khi project có nhiều file.
* Mặc định loại trừ hoặc có cơ chế loại trừ các thư mục không cần thiết như
  `.git/`, `node_modules/`, `dist/`, `build/` và `out/`.
* Ưu tiên hỗ trợ hủy search đang chạy; nếu chưa có trong V1, search vẫn phải
  chạy nền và UI phải tiếp tục phản hồi.

---

### FR-017 — IntelliSense

Đối với các ngôn ngữ Tier 1, IDE phải hỗ trợ:

* Code completion.
* Hover information.
* Signature Help / Parameter Information.
* Go to Definition.
* Kích hoạt suggestion tự động hoặc bằng `Ctrl + Space`.

Đối với Tier 2, Completion là bắt buộc; Hover được yêu cầu khi language service
hỗ trợ. Signature Help và Go to Definition của Tier 2 là optional enhancement,
không phải acceptance criteria của V1.

Find References là optional enhancement và không phải acceptance criteria của V1.

Kiến trúc phải ưu tiên sử dụng giao thức hoặc language service tiêu chuẩn,
không triển khai logic IntelliSense riêng cho từng ngôn ngữ bên trong editor.

Runtime và dependency detection phải dùng các trạng thái khái niệm:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Language Service Manager phải expose ít nhất các trạng thái khái niệm:

```text
NOT_CONFIGURED
MISSING
STARTING
RUNNING
STOPPED
CRASHED
INVALID_CONFIGURATION
```

Tên hiển thị thực tế có thể khác nhưng behavior phải tương đương. IDE phải hiển
thị rõ dependency bị thiếu, lỗi cấu hình hoặc crash, đồng thời cung cấp action
phù hợp như Configuration Guide, Configure Path, Restart hoặc View Logs. Không
được thất bại im lặng.

Runtime và language service là hai dependency độc lập:

```text
Runtime != Language Service
```

Ví dụ với Python, Python runtime dùng để chạy chương trình; Python language
service dùng cho IntelliSense và diagnostics. Khi runtime AVAILABLE nhưng
language service MISSING, Run vẫn phải hoạt động và IDE phải báo lý do Language
Intelligence không hoạt động. Khi runtime MISSING nhưng language service
RUNNING, Language Intelligence vẫn có thể hoạt động và Run phải báo thiếu
runtime.

---

### FR-018 — Diagnostics

Đối với các ngôn ngữ thuộc Tier 1 và Tier 2, IDE phải:

* Hiển thị lỗi và cảnh báo tại vị trí tương ứng trong editor.
* Phân biệt Error, Warning và Information.
* Tổng hợp diagnostics trong Problems panel.
* Cho phép chọn một diagnostic để chuyển đến file và dòng tương ứng.
* Cập nhật diagnostics khi nội dung file thay đổi.
* Không block editor trong khi language service đang phân tích source.

Diagnostics từ language service phải được tách khỏi stderr và exit code của
chức năng Run Code.

---

## 7. Terminal

### FR-019 — Integrated Terminal

IDE cung cấp terminal tích hợp.

Người dùng có thể chạy các command như:

```bash
node app.js
python main.py
dotnet run
npm install
npm run dev
git status
```

---

### FR-020 — Multiple Terminal

Có thể mở nhiều terminal session.

Ví dụ:

```text
Terminal 1
Terminal 2
Terminal 3
```

---

### FR-021 — Terminal Working Directory

Khi mở terminal trong project, working directory mặc định phải là thư mục project.

Ví dụ:

```text
D:\Projects\MyApp
```

---

## 8. Run Code

### FR-022 — Run Current File

Người dùng có thể chạy file hiện tại bằng nút:

```text
▶ Run
```

Hệ thống xác định loại file và chạy command tương ứng.

Ví dụ:

```text
.js  → node file.js
.ts  → TypeScript runtime strategy
.py  → python file.py
```

TypeScript run strategy phải được quyết định trước Phase 4. Các candidate có thể
gồm `tsx`, `ts-node` hoặc compile rồi chạy bằng Node.js; quyết định cuối cùng phải
được ghi trong `docs/DECISIONS.md`.

Run phải kiểm tra runtime tương ứng độc lập với language service. Nếu runtime bị
thiếu hoặc cấu hình không hợp lệ, IDE phải báo lỗi rõ ràng thay vì fail silent.

Các ngôn ngữ khác có thể được mở rộng sau. Run cho Tier 3 không phải acceptance
criteria của V1.

---

### FR-023 — Run Project

Trong V1, built-in Run Project ưu tiên:

* Node.js project.
* Python project nếu có entry point hoặc run configuration phù hợp.

Ví dụ:

#### Node.js

```bash
npm run dev
```

Các lệnh như `dotnet run`, `php artisan serve` và lệnh Java vẫn có thể chạy thủ
công trong Integrated Terminal. Built-in Run Project cho .NET, Laravel, Java và
các framework Tier 3 là future enhancement, trừ khi requirement được thay đổi
sau này. Framework auto-detection cũng không thuộc V1.

---

## 9. Output Panel

### FR-024 — Hiển thị Output

Khi chạy chương trình, output được hiển thị trong một panel riêng.

Ví dụ:

```text
Hello World
Process exited with code 0
```

---

### FR-025 — Hiển thị Error

Nếu chương trình lỗi, hệ thống hiển thị:

* stderr.
* Exit code.
* Nội dung lỗi.

Ví dụ:

```text
ReferenceError: user is not defined
Process exited with code 1
```

---

### FR-026 — Stop Process

Nếu chương trình đang chạy, người dùng có thể nhấn:

```text
■ Stop
```

để kết thúc run session.

Trên Windows 10/11, Stop Process phải:

* Dừng process chính của run session.
* Cố gắng terminate các child process thuộc session.
* Tránh để orphan process tiếp tục chạy khi có thể.
* Cleanup các process do IDE tạo khi đóng application.

Không được terminate process không thuộc run session của IDE.

---

## 10. Git

### FR-027 — Git Repository Detection

IDE tự kiểm tra project có Git hay không.

Nếu có `.git`, hiển thị thông tin Git.

Git là external dependency. IDE phải xác định tối thiểu các trạng thái:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Nếu Git không được tìm thấy hoặc cấu hình không hợp lệ:

* Core editor vẫn phải hoạt động.
* Source Control UI phải báo Git unavailable và không fail silent.
* IDE phải cung cấp hướng dẫn cấu hình hoặc Git path nếu cần.

---

### FR-028 — Git Status

Hiển thị file:

* Modified.
* Added.
* Deleted.
* Untracked.

---

### FR-029 — Git Stage / Unstage

Cho phép stage file.

Tương đương:

```bash
git add
```

Cho phép unstage file nếu Git abstraction được chọn hỗ trợ an toàn trong V1.

---

### FR-030 — Git Commit

Cho phép nhập commit message và commit.

Ví dụ:

```text
feat: add student management
```

---

### FR-031 — Git Branch

Cho phép:

* Xem branch hiện tại.
* Xem danh sách branch.
* Checkout hoặc switch branch.

Tạo branch mới có thể được hỗ trợ trong V1 nếu Git abstraction đã chọn đáp ứng
an toàn; đây không phải acceptance criteria bắt buộc.

---

### FR-032 — Git History

Cho phép xem lịch sử commit cơ bản.

Hiển thị:

* Commit hash.
* Message.
* Author.
* Date.

---

## 11. Settings

### FR-033 — Theme

Cho phép lựa chọn:

* Light.
* Dark.
* System.

---

### FR-034 — Editor Font Size

Cho phép thay đổi kích thước font editor.

---

### FR-035 — Tab Size

Cho phép cấu hình:

```text
2 spaces
4 spaces
```

---

### FR-036 — Auto Save

Cho phép bật hoặc tắt Auto Save.

---

## 12. Keyboard Shortcuts

Các shortcut cơ bản:

| Chức năng      | Shortcut         |
| -------------- | ---------------- |
| Save           | Ctrl + S         |
| Find           | Ctrl + F         |
| New File       | Ctrl + N         |
| Open Project   | Ctrl + O         |
| Terminal       | Ctrl + `         |
| Search Project | Ctrl + Shift + F |

Shortcut có thể thay đổi sau.

---

## 13. Dữ liệu cục bộ

### FR-037 — Local Application State

IDE có thể lưu cục bộ các thông tin:

* Recent projects.
* Settings.
* Theme.
* Editor preferences.
* Workspace state.

Dữ liệu phải được lưu trên máy người dùng.

Không yêu cầu database server riêng.

---

## 14. Database của project người dùng

IDE không yêu cầu project phải sử dụng database cụ thể.

Người dùng có thể tự phát triển project sử dụng:

* MySQL.
* PostgreSQL.
* SQLite.
* SQL Server.
* MongoDB.
* Database khác.

IDE chỉ đóng vai trò môi trường phát triển.

---

## 15. Yêu cầu phi chức năng

### NFR-001 — Desktop Application

Ứng dụng phải chạy được trên Windows.

Mục tiêu ban đầu:

```text
Windows 10
Windows 11
```

---

### NFR-002 — Local First

Các thao tác chính phải hoạt động trên máy người dùng:

* Editor.
* Files.
* Terminal.
* Git.
* Run code.
* Language Intelligence.
* Settings và project state.

Không phụ thuộc cloud để thực hiện các chức năng cơ bản.

---

### NFR-003 — Performance

IDE cần:

* Mở file nhanh.
* Không block UI khi chạy terminal.
* Không đóng băng editor khi process đang chạy.
* Search project và language analysis không block renderer.
* Có khả năng xử lý project có nhiều file.

---

### NFR-004 — Data Safety

Không được tự động:

* Xóa source.
* Ghi đè file mà không cần thiết.
* Reset Git repository.
* Xóa commit.

Các thao tác nguy hiểm cần có xác nhận.

---

### NFR-005 — Maintainability

Source code Student Coding IDE phải:

* Tách module rõ ràng.
* Có ranh giới rõ giữa renderer, preload và main process.
* Có documentation.
* Có naming convention nhất quán.
* Không phụ thuộc vào source tree hoặc internal module của Orca.

---

### NFR-006 — Language Service Reliability

Language service phải chạy tách biệt với luồng giao diện chính.

Khi language service khởi động chậm, bị lỗi hoặc bị dừng:

* Editor vẫn phải cho phép xem, sửa và lưu file.
* IDE phải hiển thị trạng thái của language service.
* Người dùng có thể thử khởi động lại language service.
* Lỗi của một ngôn ngữ không được làm hỏng language service của ngôn ngữ khác.

---

### NFR-007 — Desktop Security Boundary

Renderer không được truy cập filesystem, process, shell hoặc Node.js API một
cách tùy tiện. Kiến trúc phải ưu tiên boundary:

```text
Renderer
   ↓
Preload API
   ↓
IPC
   ↓
Main Process
   ↓
Filesystem / Terminal / Git / Process
```

Yêu cầu:

* Bật `contextIsolation`.
* Tắt `nodeIntegration` trong renderer, trừ khi có quyết định đặc biệt được ghi
  rõ trong `docs/DECISIONS.md`.
* Chỉ expose API cần thiết qua preload.
* Validate input tại IPC boundary phù hợp.
* Không expose generic unrestricted shell execution API trực tiếp cho renderer.
* Các quyền filesystem, terminal, Git và process phải được giới hạn theo use case
  của IDE.

---

## 16. Kiến trúc dự kiến

Student Coding IDE có kiến trúc và source implementation độc lập. Orca chỉ là
nguồn tham khảo để hỗ trợ phân tích và design decisions.

Cấu trúc khái niệm:

```text
Desktop Application
│
├── Application Shell
│
├── Project Manager
│
├── File Explorer
│
├── Code Editor
│
├── Language Service Manager
│
├── Problems Panel
│
├── Terminal
│
├── Run Service
│
├── Output Panel
│
├── Git Service
│
├── Settings
│
└── Local Persistence
```

---

## 17. Phần tham khảo từ Orca

Các khu vực có thể nghiên cứu từ Orca:

* Desktop application architecture.
* Electron lifecycle.
* Main, preload và renderer separation.
* IPC architecture và security boundary.
* Monaco Editor integration.
* File Explorer architecture.
* Integrated Terminal architecture.
* Process execution và lifecycle.
* Git architecture.
* Workspace/project handling.
* Settings infrastructure.
* Local state.
* UI/UX patterns.

Việc tham khảo không đồng nghĩa với sao chép nguyên module hoặc kế thừa source
tree Orca. Student Coding IDE phải có implementation riêng phù hợp requirement và
design decisions của project.

---

## 18. Phần cần nghiên cứu trước khi implementation

Trước khi implementation subsystem tương ứng phải xác định:

1. Entry point của desktop application.
2. Main process.
3. Renderer process.
4. IPC architecture.
5. File system handling.
6. Monaco Editor integration.
7. Language service protocol và lifecycle.
8. Cách phát hiện runtime và language service trên Windows.
9. Diagnostics và Problems panel.
10. Terminal implementation.
11. Process execution.
12. Git implementation.
13. Local persistence.
14. Settings.
15. Project/workspace state.
16. AI architecture của Orca chỉ để xác định những concept không cần trong V1.
17. Electron security boundary của Student Coding IDE.
18. TypeScript run strategy.

---

## 19. Nguyên tắc phân loại khi nghiên cứu Orca

Phase 1 phải phân loại từng subsystem hoặc capability được khảo sát theo một
trong các nhóm:

```text
REFERENCE
REIMPLEMENT
ADAPT
ADD
OMIT
```

### REFERENCE

Nghiên cứu cách Orca giải quyết một vấn đề. Không mặc định sao chép
implementation.

### REIMPLEMENT

Xây dựng lại functionality tương đương bằng kiến trúc và source code của Student
Coding IDE.

### ADAPT

Giữ concept hoặc behavior hữu ích của Orca nhưng thiết kế implementation khác
cho phù hợp requirement.

### ADD

Feature Student Coding IDE cần nhưng Orca không có hoặc không đáp ứng requirement.

### OMIT

Feature Orca có nhưng Student Coding IDE V1 không cần triển khai.

---

## 20. AI Agent

### V1

AI Agent không thuộc scope V1. Student Coding IDE V1 không implement:

* AI Agent.
* Codex, Claude Code, Gemini hoặc Grok integration.
* AI authentication.
* AI process.
* AI navigation hoặc AI commands.
* AI worktree hoặc multi-agent orchestration.
* AI auto-edit.
* AI auto-run.

Core IDE phải hoạt động độc lập hoàn toàn với AI. Kiến trúc chỉ cần giữ ranh giới
module hợp lý để tương lai có thể bổ sung AI integration; không cần overengineer
extension point cho AI trong V1.

Source Orca không được import vào project, vì vậy V1 không có requirement xóa,
giữ hoặc disable source AI của Orca.

---

## 21. Phase phát triển

### Phase 0 — Project Initialization & Reference Baseline

Mục tiêu:

1. Tạo Student Coding IDE repository độc lập.
2. Không fork Orca làm source project.
3. Không clone source Orca vào Student Coding IDE.
4. Chốt stack ban đầu:
   * Electron.
   * React.
   * TypeScript.
   * `electron-vite`, đã được chọn và verify trong Phase 0.
   * Monaco Editor.
   * Tailwind CSS.
5. Khởi tạo desktop application foundation.
6. Application shell build thành công.
7. Application shell chạy được trên Windows.
8. Không implement feature IDE lớn trong phase này.
9. Ghi Orca reference repository.
10. Ghi Orca reference branch.
11. Ghi Orca Reference Commit SHA.
12. Tạo `docs/REFERENCE-BASELINE.md`.
13. Thiết lập lint, typecheck và build cơ bản.
14. Thiết lập project structure đủ để bước sang architecture design.

Kết quả:

```text
Student Coding IDE clean foundation runs successfully.
```

---

### Phase 1 — Orca Analysis & Architecture Design

Nghiên cứu Orca ở mức Reference Implementation:

* Desktop lifecycle.
* Main process.
* Preload.
* Renderer.
* IPC.
* Monaco integration.
* File system.
* Terminal.
* Process execution.
* Git.
* Workspace/project.
* Persistence.
* Settings.
* UI patterns.
* AI architecture chỉ để xác định phần không cần cho V1.

Mỗi subsystem phải được phân loại theo `REFERENCE`, `REIMPLEMENT`, `ADAPT`,
`ADD` hoặc `OMIT`.

Sau Phase 1 phải tạo hoặc cập nhật:

```text
docs/ARCHITECTURE.md
docs/ORCA-ANALYSIS.md
docs/CODEBASE-MAP.md
docs/DECISIONS.md
docs/LANGUAGE-SUPPORT.md
```

`ORCA-ANALYSIS.md` ghi lại phân tích source tham khảo Orca, evidence,
classification, risk và implication cho Student Coding IDE.

Phase 1 đã chọn xterm.js + `node-pty` với Phase 2 Windows/native compatibility
gate, chấp nhận local Git CLI phía sau typed GitService và chấp nhận versioned
JSON persistence. Các lựa chọn provider và TypeScript Run vẫn giữ decision gate
của phase tương ứng.

`CODEBASE-MAP.md` phải map source của Student Coding IDE, không sao chép codebase
map của Orca. Có thể có phần riêng ghi reference mapping của Orca nếu hữu ích.

---

### Phase 2 — Core IDE

Đảm bảo các chức năng:

* Project.
* Explorer.
* Editor.
* Tabs.
* Dirty state.
* Save.
* Unsaved changes protection.
* Search.
* Terminal.
* ProjectService có thể persist recent-project metadata tối thiểu cần cho project
  lifecycle; Phase 2 không triển khai đầy đủ Recent Projects UX hoặc management.

hoạt động ổn định.

---

### Phase 3 — Language Intelligence

Triển khai hoặc chỉnh sửa:

* Syntax highlighting.
* Language detection.
* Language Service Manager.
* Completion, Hover, Signature Help và Go to Definition cho Tier 1.
* Completion và Hover theo capability đã cam kết cho Tier 2.
* Diagnostics trong editor.
* Problems panel.
* Runtime detection độc lập với language service detection.
* Language service lifecycle: start, stop và restart.
* Crash handling.
* Missing dependency và invalid configuration status.

Formatter và debugger không thuộc phase này.

---

### Phase 4 — Run & Output

Triển khai hoặc chỉnh sửa:

* Run file.
* Run project trong phạm vi V1.
* stdout và stderr.
* Exit code.
* Output panel và error output.
* Stop process và process tree cleanup.
* Runtime detection và missing runtime error.

---

### Phase 5 — Git

Hoàn thiện:

* Git dependency detection.
* Status.
* Stage.
* Unstage nếu phù hợp.
* Commit.
* Branch.
* Checkout/switch branch.
* History.

---

### Phase 6 — Settings & UX

Hoàn thiện:

* Theme.
* Editor settings.
* Auto Save.
* User-facing Recent Projects UX và management, dựa trên metadata foundation của
  ProjectService.
* Keyboard shortcuts.
* Runtime và language-service path configuration nếu cần.
* Git path nếu cần.
* UX states cho missing dependency và invalid configuration.

---

### Phase 7 — Testing & Stabilization

Quality gate bắt buộc:

```text
Build PASS
Typecheck PASS
Lint PASS
Critical unit tests PASS
Integration tests PASS
Windows packaging PASS
Installer smoke test PASS
```

Không yêu cầu coverage percentage cao trong V1. Test phải ưu tiên:

* File operations.
* Project state và unsaved changes protection.
* Terminal.
* Run process lifecycle và Stop Process.
* Process tree cleanup khi Stop hoặc đóng application.
* Git abstraction và Git dependency detection.
* Language service lifecycle.
* Missing và crashed language service.
* Missing runtime.
* Settings persistence.
* Problems navigation.
* Project lớn và UI responsiveness.
* Windows packaging và installer smoke test.

---

## 22. Các phase tương lai

Các chức năng có thể xem xét sau khi core IDE hoàn thành:

### Phase Future — Formatter

Có thể bổ sung:

* Format Document.
* Format Selection.
* Format on Save.
* Chọn formatter mặc định theo ngôn ngữ.

### Phase Future — Debugger

Có thể bổ sung dựa trên Debug Adapter Protocol hoặc cơ chế tương đương:

* Debug configuration theo project.
* Breakpoint.
* Continue, Pause và Restart.
* Step Over, Step Into và Step Out.
* Variables.
* Call Stack.
* Debug Console.

### Phase Future — AI Tutor

AI chỉ:

* Giải thích code.
* Giải thích lỗi.
* Gợi ý hướng xử lý.

Không tự sửa nếu chưa được phép.

### Phase Future — Coding Agent

Có thể tích hợp:

* Codex.
* Claude Code.
* Gemini.
* Grok.
* OpenCode.

### Phase Future — Learning Features

Có thể bổ sung:

* Exercises.
* Test cases.
* Learning progress.
* Project templates.
* Course workspace.

Các chức năng trên chưa phải requirement bắt buộc của phiên bản đầu.

---

## 23. Git Workflow

Sử dụng:

```text
main
 ↑
develop
 ↑
feature/*
```

Ví dụ:

```text
feature/project-manager
feature/run-code
feature/output-panel
feature/git-history
feature/settings
```

Không development trực tiếp trên `main`.

Git workflow của Student Coding IDE không có upstream Orca vì Orca chỉ là
Reference Implementation. Nếu cập nhật Orca Reference Commit sau này, đó là một
research activity riêng và không được merge source Orca vào Student Coding IDE.

---

## 24. Commit Convention

Sử dụng Conventional Commits.

Ví dụ:

```text
feat: add run code action
fix: stop running process correctly
refactor: extract project service
docs: document terminal architecture
test: add project manager tests
```

---

## 25. Documentation

Dự án cần duy trì:

```text
docs/
├── REQUIREMENT.md
├── REFERENCE-BASELINE.md
├── ORCA-ANALYSIS.md
├── ARCHITECTURE.md
├── CODEBASE-MAP.md
├── IMPLEMENTATION-PLAN.md
├── LANGUAGE-SUPPORT.md
├── DECISIONS.md
└── CHANGELOG-THESIS.md
```

Convention ngôn ngữ: `REQUIREMENT.md` được duy trì chủ yếu bằng tiếng Việt; các
tài liệu technical architecture và reference được duy trì bằng tiếng Anh.

### REFERENCE-BASELINE.md

Ghi lại:

* Orca reference repository.
* Reference branch.
* Reference Commit SHA.
* Các feature Orca đã khảo sát.
* Những architectural patterns được tham khảo.
* Những phần không sử dụng.

File này không mô tả Orca như source baseline trực tiếp của Student Coding IDE.

### ORCA-ANALYSIS.md

Ghi lại source analysis, evidence, classification, risk và implication từ Orca
Reference cho Student Coding IDE. Evidence trong file phản ánh analysis đã được
verify ở Phase 1; các consistency update sau đó không mặc định re-verify Orca.

### ARCHITECTURE.md

Mô tả kiến trúc Student Coding IDE và các security/module boundary.

### CODEBASE-MAP.md

Mapping:

```text
Feature
→ Student Coding IDE module
→ Directory
→ Important files
```

Map này phải phản ánh independent source implementation của Student Coding IDE.
Reference mapping của Orca, nếu cần, phải nằm trong phần riêng và không được trộn
với codebase map của project.

### IMPLEMENTATION-PLAN.md

Execution roadmap gồm work-package dependencies, decision gates, test strategy
và phase exit criteria. File này không thay thế requirement hoặc architecture và
không tự cho phép bắt đầu implementation.

### LANGUAGE-SUPPORT.md

Ghi capability matrix ít nhất gồm:

```text
Language
Editor support
Language service
Runtime
Run support
Diagnostics
Completion
Status
```

Matrix phải bao phủ JavaScript, TypeScript, Python, HTML, CSS và JSON. Mọi `TBD`
liên quan Phase 3 phải được chốt sau Phase 1 và trước khi implement Language
Intelligence.

Matrix khởi tạo có thể dùng cấu trúc:

| Language | Editor | Language service | Runtime | Run | Diagnostics | Completion | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| JavaScript | Monaco | TBD | Node.js | V1 | V1 | V1 | TBD |
| TypeScript | Monaco | TBD | Strategy TBD | V1 | V1 | V1 | TBD |
| Python | Monaco | TBD | Python | V1 | V1 | V1 | TBD |
| HTML | Monaco | TBD | N/A | No | V1 | V1 | TBD |
| CSS | Monaco | TBD | N/A | No | V1 | V1 | TBD |
| JSON | Monaco | TBD | N/A | No | V1 | V1 | TBD |

### DECISIONS.md

Ghi decision log hoặc ADR-style record cho các quyết định quan trọng, bao gồm:

* electron-vite build and development tool.
* IPC architecture.
* Terminal implementation.
* Language servers.
* TypeScript run strategy.
* Git implementation.
* Local persistence.
* Process management.

### CHANGELOG-THESIS.md

Chỉ ghi những feature và thay đổi quan trọng do independent implementation của
Student Coding IDE tạo ra.

---

## 26. Definition of Done

Một feature được xem là hoàn thành khi:

1. Đáp ứng requirement.
2. Không phá chức năng hiện có.
3. Build thành công.
4. Typecheck và lint thành công.
5. Không có lỗi runtime nghiêm trọng.
6. Critical unit test và integration test liên quan đều pass.
7. Đã commit vào feature branch.
8. Documentation được cập nhật nếu cần.

Đối với language intelligence, feature chỉ được xem là hoàn thành khi:

1. Language service start đúng.
2. Language service stop đúng.
3. Có thể restart language service.
4. Completion hoạt động.
5. Hover hoạt động cho Tier 1 và hoạt động cho Tier 2 nếu language service hỗ trợ.
6. Signature Help hoạt động cho Tier 1.
7. Go to Definition hoạt động cho Tier 1.
8. Diagnostics hoạt động.
9. Problems panel hiển thị đúng.
10. Chọn một Problem chuyển đúng đến file và dòng tương ứng.
11. Editor vẫn edit và save được khi language service ở trạng thái `MISSING`,
    `STARTING`, `CRASHED` hoặc `STOPPED`.
12. Language service không block UI.
13. Lỗi language service của một ngôn ngữ không làm hỏng ngôn ngữ khác.
14. Missing dependency hoặc invalid configuration không fail silent.

---

## 27. Mục tiêu phiên bản đầu tiên

Phiên bản đầu được xem là đạt yêu cầu khi người dùng có thể thực hiện workflow:

```text
Mở IDE
   ↓
Mở/Tạo project
   ↓
Tạo file
   ↓
Viết code
   ↓
Nhận IntelliSense
   ↓
Xem Diagnostics/Problems
   ↓
Save
   ↓
Run
   ↓
Xem Output/Error
   ↓
Sửa code
   ↓
Commit Git
```

Toàn bộ workflow trên phải hoạt động **không cần AI Agent**.

Nếu runtime, language service hoặc Git bị thiếu hay cấu hình không hợp lệ, IDE
phải báo rõ trạng thái và action phù hợp thay vì để workflow âm thầm hỏng.

---

## 28. Nguyên tắc quan trọng của đồ án

Orca là open-source Reference Implementation được sử dụng để nghiên cứu kiến
trúc, behavior, UX và cách giải quyết technical problem. Student Coding IDE là
independent Electron + React + TypeScript implementation trong repository riêng.

Đồ án phải phân biệt rõ:

```text
Orca Reference
vs
Student Coding IDE Implementation
```

Project không claim toàn bộ concept IDE là tự phát minh. Những ý tưởng hoặc
architectural pattern tham khảo từ Orca phải được document rõ khi cần. Source
Orca không được coi là phần tự phát triển, và Student Coding IDE không được mô tả
như một bản skin hoặc rename của Orca.

Phần đóng góp của đồ án phải được ghi nhận rõ thông qua:

* Requirements.
* Architecture.
* Design decisions.
* Independent source implementation.
* Git history và feature branches.
* Tests.
* Documentation và change log.
* Feature behavior.
* UX adaptations.
