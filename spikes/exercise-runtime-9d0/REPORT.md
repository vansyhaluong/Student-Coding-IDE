# Prototype 9D.0 — Exercise Runtime

Ngày kiểm chứng: 2026-10-19. Branch: `feature/phase-9a-learning-mode`.
Baseline: `11c71a0f0ebd90f76606a5297c5f16ba4b5427ac`.

**TASK REVIEW: PASS cho việc đóng 9C và prototype 9D.0.**
**Production 9D, 9D.1 và 9D.2 vẫn NOT_STARTED.**

## Phạm vi và điều kiện bắt đầu

9C đã có Workspace, 63 bài tập thuộc chương 2–8, starter C#/JavaScript và Code
Draft riêng. Người dùng xác nhận Electron Manual PASS toàn bộ chức năng.
Đối chiếu exit gate và bằng chứng tại [PHASE-9C-ACCEPTANCE.md](../../docs/PHASE-9C-ACCEPTANCE.md)
cho phép đồng bộ trạng thái 9C thành COMPLETE; các giới hạn đã chấp nhận của 9A/9B
được giữ nguyên. Runtime, Run/Submit thực tế, Judge và Accepted persistence chưa
thuộc kết quả nghiệm thu 9C.

Đã đọc AGENTS.md, các phần liên quan của Requirement, Architecture, Decisions,
Codebase Map, Language Support và Implementation Plan. Trước khi làm, worktree
sạch và đúng branch; không checkout/merge. Báo cáo khảo sát 9D trước đó nằm trong
hội thoại, chưa có file riêng trong repository; các nhận định được đối chiếu lại
với source hiện tại và nhánh C#.

Authorization chỉ bao gồm spike độc lập, SDK/Node đã cài trên máy phát triển và
port chọn lọc primitive nếu không tác động chức năng hiện tại. Không chọn runtime,
harness, IPC hoặc giới hạn tài nguyên cho production. P9-RUNTIME, P9-EXECUTION,
các phần production của P9-HARNESS và P9-PACKAGE vẫn mở.

## File và thành phần tái sử dụng

| File/module | Vai trò |
|---|---|
| `runtime.ts` | Mới, chỉ trong spike: session riêng, generated C# harness/JS driver, workspace/case JSON, compile một lần, process/case, deadline/output/result bounds, Stop và cleanup |
| `verify.ts` | Kịch bản kiểm chứng và đo thời gian; gọi trực tiếp bằng Node, không qua Learning UI |
| `windows-spike-adapter.ts` | Port riêng adapter argv/Windows Job từ nhánh C#; sửa đường dẫn import; không sửa adapter production |
| `build.mjs` | Build binding riêng và bundle spike bằng toolchain/dependency đã có; không tải/cài thêm |
| `evidence/windows11-x64.json` | Snapshot đầy đủ của lượt kiểm chứng cuối, gồm PID, thời gian, kết quả và bằng chứng restore |
| `src/main/services/process/process-manager.ts` | Tái sử dụng trực tiếp, không sửa: đăng ký tài nguyên theo owner, cleanup riêng và giữ tài nguyên nếu cleanup lỗi |
| `src/main/services/process/windows-process-tree-terminator.ts` | Tái sử dụng trực tiếp qua adapter, không sửa: xác nhận Job rỗng rồi release |
| `src/main/services/run/piped-process-adapter.ts`, `run-strategy.ts` | Chỉ dùng type nội bộ PreparedRun/PipedRunProcess; không dùng RunService hoặc IPC Project Run |
| `src/shared/contracts/practice.ts`, `learning/content/exercises.ts` | Tái sử dụng contract/validator sáu kiểu và toàn bộ catalogue 9C, không sửa |
| `docs/PHASE-9C-ACCEPTANCE.md` | Mới: exit gate, nguồn bằng chứng và các hạng mục deferred |
| Plan / Decisions / Codebase Map / Changelog | Đồng bộ trạng thái và kết quả thực tế; không đóng gate production |

Primitive native lấy đúng file
`src/main/services/run/native/run-process.cpp` tại commit
`b4e23fabfa690201d179d93c1596af7849c3d5c0` của `feature/csharp-project-run`.
Khác biệt cần thiết so với baseline là entry `createRun` nhận argv có giới hạn,
quoting Windows, stdin NUL và Job ownership. File này chỉ được materialize/build
trong `out/exercise-runtime-9d0/`; artifact production
`out/main/native/run-process.node` không bị ghi đè.

Không port Project RunService, strategy C# theo project, csproj discovery, target
store, source guard, IPC, UI, Terminal hay language-service lifecycle.
Các export Git/LSP sẵn có trong binding không được prototype gọi.
Không sửa bất kỳ source `src/`, native/process shared module hoặc package config.

## Luồng thử nghiệm

1. Nhận snapshot code, Exercise metadata và danh sách args trực tiếp từ verifier.
   Đây là test API nội bộ, chưa nhận dữ liệu từ Exercise Editor/IPC.
2. Main-side spike tạo session UUID và thư mục riêng. JSON args được kiểm tra bằng
   validator 9C; không sử dụng project root, project files hay Code Draft store.
3. C#: tạo Solution.cs + Driver.cs + csproj cố định, pin developer SDK qua
   global.json; build Release một lần, không compiler/build server. Mỗi case chạy
   một `dotnet Exercise.dll` riêng và tạo một Solution instance mới.
4. JavaScript: solution.cjs và driver riêng; mỗi case chạy một Node process mới.
   Promise/async không được chấp nhận.
5. Input/result dùng file JSON trong workspace của case. stdout/stderr là log
   riêng, không được dùng làm giá trị trả về. Result được kiểm tra kiểu/kích thước.
   Compile stdout/stderr được giữ trong CommandResult của session; exception
   trong lời giải được trả thành tên lỗi, không phải verdict Judge.
6. Đăng ký resource trước spawn; Stop dùng AbortSignal + cleanupOwner của chính
   exercise. Khi process cha kết thúc hoặc có lỗi, adapter dừng Job, chờ exit/EOF,
   xác nhận Job rỗng và release. Chỉ sau cleanup thành công mới xóa workspace.

Các giới hạn **chỉ dành cho thí nghiệm**: 1.5 giây execute/process, 30 giây compile,
10 giây probe; stdout+stderr cộng lại tối đa 64 KiB/command, input 64 KiB/lượt,
result 64 KiB/case. Thử compile deadline bằng fault injection 10 ms.
Cleanup có thời gian chờ riêng của primitive hiện tại; deadline không phải một
giới hạn tổng tuyệt đối bao gồm cả cleanup. Chưa có quota toàn session.

## Môi trường và offline

- Windows 11 Home Single Language x64, version 10.0.26200, build 26200 (CIM).
  Chưa có lượt nghiệm thu Windows 10.
- Host và runtime JavaScript: Node **v24.16.0**,
  `C:\Program Files\nodejs\node.exe`.
- C#: developer SDK **10.0.112**, target net10.0; máy có Microsoft.NETCore.App
  **10.0.12**. SDK inventory còn có 8.0.410 và 9.0.314; không thử chúng ở spike này.
- Native Node-API 8 build thành công bằng MSVC và Electron headers/import library
  đã có. Verifier chạy trên **Node CLI**, không phải Electron-hosted end-to-end.
- Không cài dependency, fetch Git, tải SDK, runtime hoặc package.
  Mỗi workspace dùng NUGET_PACKAGES và DOTNET_CLI_HOME riêng; csproj không có
  PackageReference, feeds được clear, NuGet audit/telemetry/workload update bị tắt.
- project.assets.json của mọi build thành công xác nhận **0 package libraries**.
  SDK tự thêm nguồn cục bộ `C:\Program Files\dotnet\library-packs`.
  Verifier chỉ chấp nhận đúng nguồn SDK cục bộ này, không nguồn HTTP/UNC khác.
- Kết quả chứng minh không cần Internet/package download cho các project thử
  với reference packs đã cài. **Không có thử nghiệm ngắt mạng ở cấp OS**, máy sạch,
  installer hoặc runtime bundled. Không suy ra .NET/Node đã được đóng gói.

Một lượt chẩn đoán giữa quá trình phát triển báo FAIL vì assertion ban đầu yêu
cầu 0 restore sources, không tính nguồn library-packs do SDK tự thêm. Đã kiểm tra
assets, sửa assertion thành “chỉ nguồn SDK cục bộ, 0 package libraries” và chạy
lại toàn bộ. Đây là sửa verifier của spike, không phải sửa SDK/production hay
chấp nhận dependency tải qua mạng. Snapshot đính kèm là lượt cuối PASS.

## Kết quả và thời gian

**44/44 kịch bản PASS**, thêm **2/2 runtime inventory checks PASS**.
Snapshot: [windows11-x64.json](evidence/windows11-x64.json).
Bản raw tại máy phát triển: `out/exercise-runtime-9d0/results.json`.

| Phép đo thành công | Chuẩn bị | Compile | Execute/case |
|---|---:|---:|---:|
| C# Sum, 2 case | 197 ms | 4459 ms, 1 lần | 132 / 130 ms |
| C# round trip sáu kiểu | 172–207 ms | 4039–4617 ms, 1 lần/lượt | 118–211 ms |
| C# toàn bộ starter | 414 ms | 5529 ms, 1 lần | 377 ms cho 126 lời gọi |
| JavaScript Sum, 2 case | 60 ms | Không cần | 117 / 100 ms |
| JavaScript round trip sáu kiểu | 54–108 ms | Không cần | 81–132 ms |
| JavaScript toàn bộ starter | 61 ms | Không cần | 122 ms cho 126 lời gọi |

Execute bao gồm khởi tạo process, I/O, kết thúc và cleanup process, không chỉ thời
gian chạy thuật toán. Prepare có runtime preflight và tạo file; compile gồm
restore local và build. Đây là đo trên một máy/lượt cuối, không phải benchmark
hoặc cam kết hiệu năng production.

Sáu round trip kiểm tra cả đối số và kiểu trả về: int32 min/max, boolean false/true,
chuỗi rỗng/Unicode/emoji/quote/backslash/newline, int32[], string[], int32[][] và
mảng rỗng. Mỗi lượt nhiều case assert compileCount C# = 1 và PID case khác nhau.

Toàn bộ 63 starter thật của mỗi ngôn ngữ được đưa vào chương trình thử và gọi với
126 mẫu để xác nhận signature/serialization/call compatibility. Starter ném lỗi
chưa triển khai như thiết kế; **không phải 63 thuật toán đã được giải/chấm đúng**.
Lời giải Sum và các hàm round trip mới kiểm tra kết quả đúng thực sự.

Lỗi C#: compile được nhận diện qua exit code + log; runtime
InvalidOperationException được thu vào result. JavaScript: SyntaxError và Error.
Vòng lặp vô hạn được timeout; stdout/stderr flood, sai kiểu trả về, Promise và
result quá lớn đều bị chặn/nhận diện theo kịch bản.

Stop kiểm tra trước prepare và khi process prepare/compile/execute đã được tạo;
compile Stop là hủy build host trong pha compile, không chứng minh một phiên
csc độc lập đã chạy tới một mốc cụ thể. Timeout compile được kiểm tra bằng deadline
ngắn, không cố tình tạo một project MSBuild độc hại.

Cả hai adapter có bài thử sinh một Node descendant rồi lặp vô hạn. Sau timeout,
PID descendant không còn tồn tại, Job/resource được release và workspace bị xóa.
Owner isolation kiểm tra cùng ProcessManager với một process sentinel thuộc
owner khác: Stop exercise giữ sentinel sống; sau đó verifier tự cleanup sentinel.
Không gọi/chạm phiên Project Run hoặc Terminal thật đang mở và không thay Code
Draft. Đây là bằng chứng primitive ownership, không phải full Project UI regression.

Các kịch bản runtime có assert resource cleanup và workspace absent khi đã tạo
workspace. Artifact build/evidence và fixture verifier trong out/ được giữ có chủ
đích; không còn thư mục session-* sau khi lượt cuối hoàn tất.

| Kịch bản | Kết quả | Tổng ms |
|---|---|---:|
| catalogue: all 63 exercises compatible with six synchronous JSON types | PASS | 2 |
| csharp: all 63 actual starters/signatures, 126 sample calls | PASS | 6348 |
| csharp: real Sum, two cases, separate processes | PASS | 4936 |
| csharp: JSON int32 argument and return | PASS | 4705 |
| csharp: JSON boolean argument and return | PASS | 5035 |
| csharp: JSON string argument and return | PASS | 5182 |
| csharp: JSON int32[] argument and return | PASS | 5091 |
| csharp: JSON string[] argument and return | PASS | 4984 |
| csharp: JSON int32[][] argument and return | PASS | 4474 |
| csharp: compile error | PASS | 2457 |
| csharp: runtime error | PASS | 4725 |
| csharp: infinite loop times out | PASS | 6187 |
| csharp: compile deadline, no execution after timeout | PASS | 199 |
| csharp: aggregate stdout/stderr exceeds 64 KiB | PASS | 4813 |
| csharp: Stop while prepare process owned | PASS | 19 |
| csharp: Stop while compile process owned | PASS | 265 |
| csharp: Stop while execute process owned | PASS | 6324 |
| csharp: Stop before preparation | PASS | 2 |
| csharp: missing runtime | PASS | 3 |
| csharp: invalid executable image | PASS | 24 |
| csharp: descendant terminated after timeout | PASS | 7530 |
| javascript: all 63 actual starters/signatures, 126 sample calls | PASS | 192 |
| javascript: real Sum, two cases, separate processes | PASS | 289 |
| javascript: JSON int32 argument and return | PASS | 235 |
| javascript: JSON boolean argument and return | PASS | 234 |
| javascript: JSON string argument and return | PASS | 324 |
| javascript: JSON int32[] argument and return | PASS | 323 |
| javascript: JSON string[] argument and return | PASS | 254 |
| javascript: JSON int32[][] argument and return | PASS | 296 |
| javascript: syntax error | PASS | 280 |
| javascript: runtime error | PASS | 413 |
| javascript: infinite loop times out | PASS | 1610 |
| javascript: aggregate stdout/stderr exceeds 64 KiB | PASS | 147 |
| javascript: Stop while prepare process owned | PASS | 20 |
| javascript: Stop while execute process owned | PASS | 156 |
| javascript: Stop before preparation | PASS | 1 |
| javascript: missing runtime | PASS | 4 |
| javascript: invalid executable image | PASS | 25 |
| javascript: descendant terminated after timeout | PASS | 1598 |
| owner isolation: exercise Stop preserves another owned process/resource | PASS | 94 |
| JavaScript: invalid return type rejected | PASS | 142 |
| JavaScript: async function rejected | PASS | 264 |
| JavaScript: bounded result file | PASS | 202 |
| input contract: overflow and wrong argument type rejected before spawn | PASS | 3 |

## Quality gates và phạm vi nghiệm thu

- 9C: **82/82** direct tests ở năm file + **4/4** Preload bridge tests chạy lại
  PASS; tổng mới **86/86**. Người dùng cung cấp bằng chứng **87/87** trước đó,
  typecheck, production/native Windows build và diff-check PASS; không tự gán
  87 test cho lệnh rerun khác. Manual Electron PASS là xác nhận của người dùng.
- Typecheck strict cho ba file TypeScript của spike và dependency imports: PASS.
- ESLint riêng bốn source/tool file của spike: PASS.
- Build native riêng + bundle spike: PASS.
- git diff --check và kiểm tra whitespace các file mới: PASS. Không chạy lại
  full build/typecheck/lint hoặc các suite không liên quan.
- Sandbox ban đầu chặn spawn worker/subprocess bằng EPERM. Các lệnh cần spawn đã
  chạy lại có approval ngoài sandbox; lần EPERM không được tính là test PASS.
- Architecture deviations: NONE trong production. Decisions resolved: NONE cho
  production runtime. Không commit, push, merge hoặc đổi branch.

Working-tree note: có diff chỉ thêm newline cuối file ở .gitignore xuất hiện
trong lúc làm việc, ngoài các thay đổi chủ đích ở trên; giữ nguyên, không hoàn
nguyên một thay đổi chưa xác định nguồn. Không có diff ở src/, scripts/ hoặc
package.json của ứng dụng.

## Giới hạn và việc cần duyệt trước production

Prototype chỉ chứng minh luồng thực thi và ownership trên máy phát triển.
Temporary workspace **không phải OS sandbox**. Code có quyền của tài khoản hiện
tại; chưa chặn filesystem/network/process ngoài mô hình bài tập. Chưa có giới hạn
RAM, CPU time cứng, số process, dung lượng đĩa, tổng output/session hoặc concurrency.
Không thay shared native module để thêm các giới hạn này.

Chưa nghiệm thu crash cứng của host, startup cleanup orphan, máy thiếu reference
pack, file locks/antivirus kéo dài, tất cả dạng spawn/cleanup failure, production
shutdown/owner loss/stale IPC, Electron-hosted runtime hay Windows 10 sạch.
Không suy ra từ Job ownership rằng mọi tình huống hard crash đều an toàn.
Nếu cần sửa native/process shared module hoặc đổi chính sách, phải dừng phần
production phụ thuộc và trình phương án cho người dùng trước.

| Gói tiếp theo | Phần cần phát triển chính thức khi được duyệt |
|---|---|
| Common 9D | Contract semantic Main/Preload/IPC, Exercise session/code snapshot/ownership và stale-result rejection, lifecycle/Stop/shutdown, temp recovery, resource/size/concurrency limits, error mapping và functional/security acceptance |
| 9D.1 C# | Production harness/serialization và validation cho sáu kiểu; SDK/compiler resolver riêng không kế thừa policy csharp-ls; compile-once/case-process; safe fixed build/environment, compile diagnostics, thiếu/invalid SDK/reference-pack handling; Windows/offline/distribution evidence |
| 9D.2 JavaScript | Production driver và result validation, synchronous/type policy, trusted standalone Node resolver/version, giới hạn/Stop/cleanup, runtime failures và Windows/offline/distribution evidence |
| 9E/9F/9G | Run/Submit/Judge/comparison và official tests/Accepted commit; progress/quiz mở rộng; packaged clean-machine acceptance — không có trong spike |

Cần người dùng chốt ở gói production: có port argv primitive vào shared native
hay giữ binding Exercise riêng; runtime versions/distribution và fallback;
resource/containment limits; production harness/result/error protocol và common
service/IPC design. Spike không tự chọn những phương án đó.

Không có blocker còn lại cho **prototype 9D.0**. Chưa sẵn sàng tự bắt đầu production
9D.1/9D.2 khi các gate và authorization tương ứng chưa được xác nhận.

