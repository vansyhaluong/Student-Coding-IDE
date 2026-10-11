# C# Project Run — Test Case Matrix M1-01 đến M1-12

Ngày tổng hợp: 2026-10-11  
Phạm vi acceptance: Windows 11 x64, chạy Console project qua `.csproj`.

Tài liệu này tổng hợp test cases và bằng chứng trong Implementation Plan, các
M1 reports và test renderer hiện có. Đây không phải báo cáo chạy lại toàn bộ test.
`PASS` nghĩa là nguồn được dẫn đã ghi nhận bằng chứng cho case đó; `PARTIAL` nghĩa
là mới xác minh một phần hoặc ở tầng khác; `NOT VERIFIED` là chưa có bằng chứng;
`BLOCKED` là exit gate M1-12 chưa đạt. Unit/mocked test không được xem là thay thế
cho native smoke hoặc visual QA.

## Ma trận test cases

| Test ID | Milestone | Test case / thao tác | Kết quả mong đợi | Mức kiểm thử / bằng chứng hiện có | Trạng thái |
|---|---|---|---|---|---|
| TC-M1-01-01 | M1-01 | Validate semantic target/resolution/session DTO hợp lệ | Chấp nhận đúng shape và kind; giữ nguyên field/type contract | Contract tests; Plan ghi 74 contract tests và 178 focused/regression | PASS |
| TC-M1-01-02 | M1-01 | Gửi payload thiếu field, sai type, field thừa hoặc sai target kind | Từ chối payload; không cấp process/path authority | Exact validation contract tests | PASS |
| TC-M1-01-03 | M1-01 | Regression API Run JavaScript hiện có | JS request/event contract không đổi | Contract + Run regression theo Plan | PASS |
| TC-M1-02-01 | M1-02 | Đổi argv đầu vào hoặc target không khớp identity đã authorize | Identity/fingerprint không bị suy ra từ argv; từ chối mismatch | Run identity/foundation/lifecycle tests; 202 focused, full suite theo Plan | PASS |
| TC-M1-02-02 | M1-02 | Chọn strategy/runtime theo target đã xác thực | Dispatch cố định theo strategy; JS composition vẫn hoạt động | RunService tests và ba native JS smokes theo Plan | PASS |
| TC-M1-03-01 | M1-03 | Round-trip argv Windows có dấu cách, quote, backslash và chuỗi rỗng | Native process nhận đúng từng argument, không qua shell | Native smoke-run-native và Windows regression | PASS |
| TC-M1-03-02 | M1-03 | Gửi argv/output vượt giới hạn hoặc request không hợp lệ | Từ chối có giới hạn; không rò handle/process | Native bounds/reject tests, Job cleanup; Plan ghi 1195 tests | PASS |
| TC-M1-03-03 | M1-03 | Chạy với stdin đóng và kiểm tra ownership/cleanup | Stdin đóng theo contract; process tree/Job được dọn sạch | Native smoke + JS/Terminal/Git/LSP regression | PASS |
| TC-M1-04-01 | M1-04 | SDK pin và fixed build/run flags với net8.0, net10.0 | Dùng SDK/TFM dự kiến; restore/build/run theo argv cố định | Spike Windows 11 x64, SDK 8.0.410 và 10.0.112; 32/32 | PASS |
| TC-M1-04-02 | M1-04 | Build/run thật: stdout, stderr, Unicode, argv và exit khác 0 | Phân biệt stdout/stderr; giữ nguyên argv và exit code | Isolated native/.NET harness | PASS |
| TC-M1-04-03 | M1-04 | Stop khi restore/build; dọn worker/descendant; build lại sau Stop | Stop chỉ tác động Job/session sở hữu; cleanup xong mới thay thế | Isolated Windows process-tree/Job smoke | PASS |
| TC-M1-04-04 | M1-04 | Prototype EOF, nhiều dòng, dòng rỗng và blocked write | Xác minh khả năng native stdin/cleanup trong spike | Prototype cô lập; không phải Console.ReadLine production | PASS — spike only |
| TC-M1-05-01 | M1-05 | Resolve dotnet/SDK từ PATH, global.json và candidate cwd | Chọn SDK theo CLI context; xử lý pin/roll-forward/config invalid an toàn | Focused tests và production-module smoke 20/20 trên SDK 8/10 | PASS |
| TC-M1-05-02 | M1-05 | MSBuild evaluation properties/items/references | Chỉ evaluation facts; không build/restore; giữ Library/multi-target/future TFM rõ ràng | Production smoke; props/import/reference và project shape cases | PASS |
| TC-M1-05-03 | M1-05 | Timeout, cancellation, output bound, spawn/cleanup failure | Trả domain error an toàn; cleanup/retry không rò session | Unit/mocked + real cancellation/release cases; 60 focused | PASS |
| TC-M1-06-01 | M1-06 | Discovery 0, 1, nhiều project và phân loại Console eligible/ineligible | Trạng thái đúng; không tự chọn khi ambiguous | Resolver tests + real Windows smoke 14/14 | PASS |
| TC-M1-06-02 | M1-06 | Nested projects, exclusions, symlink/junction, case/Unicode và path containment | Không thoát project root; canonical dedup và sort xác định | Service/real fixture tests, bounds/reference graph cases | PASS |
| TC-M1-06-03 | M1-06 | Broken project/reference, cycle, overflow, project close/cancel | Không trả partial READY; abort và cleanup đầy đủ | Resolver + cancellation/overflow fault tests | PASS |
| TC-M1-07-01 | M1-07 | Resolve, select, clear, reopen và khôi phục selection theo project | Chỉ persist relative target semantic; lựa chọn project được cô lập | Store tests; restore/change/clear/isolation cases | PASS |
| TC-M1-07-02 | M1-07 | Target đã lưu stale, dữ liệu hỏng, atomic write failure/supersession | Revalidate; báo diagnostic/recovery; không dùng target stale | Store tests, 143 focused tests/5 files theo Plan | PASS |
| TC-M1-08-01 | M1-08 | Start trả session sớm; event/state/phase đến trước invoke response | Adopt đúng session; không reset trạng thái terminal đã đến sớm | Lifecycle tests; early STARTING/callback retirement cases | PASS |
| TC-M1-08-02 | M1-08 | Stop ở PREPARING, BUILD, EXECUTE và khoảng chuyển step | Hủy đúng session/step; không chạy bước sau khi build fail/cancel | Plan ghi 145 focused tests/7 files, gap Stop và intermediate exit | PASS — controlled lifecycle |
| TC-M1-08-03 | M1-08 | Cleanup lỗi, project switch/close/shutdown rồi thử Run mới | Giữ ownership; chặn replacement cho đến khi cleanup xong | Project/run lifecycle tests; retained-cleanup failure cases | PASS — controlled lifecycle |
| TC-M1-09a-01 | M1-09a | Dirty, conflict, source state unknown hoặc revision thay đổi | Fail closed; không tự Save; không dùng approval cũ | Source guard tests trước preparation và từng step | PASS — controlled source/editor replies |
| TC-M1-09a-02 | M1-09a | Guard timeout/cancel/unavailable/cleanup failure | Hiển thị lỗi an toàn; hủy đúng request; giữ cleanup ownership | 67 new tests và 380 focused tests theo Plan | PASS — controlled tests |
| TC-M1-09-01 | M1-09 | Chạy Console `.csproj`: build thành công rồi execute | Build cleanup/revalidation trước execute; stdout/stderr và exit được chuyển tiếp | Electron-hosted Main/native smoke; SDK 8/net8 và SDK 10/net10 | PASS — Main/native, chưa qua UI/Preload |
| TC-M1-09-02 | M1-09 | Compile/build failure | Phân loại BUILD_OR_RESTORE_FAILED; tuyệt đối không gọi execute | Strategy tests + real smoke cho cả SDK pair | PASS |
| TC-M1-09-03 | M1-09 | Runtime nonzero, spawn/observation failure và SDK/target drift | Phân biệt execution failure; không lộ native details; revalidate target/plan | 30 new/384 focused tests; real runtime exit 23 | PASS |
| TC-M1-09-04 | M1-09 | Stop trong build, execute, phase transition; dirty source | Cleanup process tree; source guard chặn trước probe/build/execute | Real Main/native smoke 14/14 và strategy tests | PASS — Main/native; guard reply có stub |
| TC-M1-10-01 | M1-10 | Validate request/response cho resolve/select/clear/cancel/start/stop | Exact DTO; kiểm tra project, sender/frame/session ownership | Contract, Main IPC, Preload tests; 63 new/443 focused | PASS — controlled API/process ports |
| TC-M1-10-02 | M1-10 | Multiple targets không explicit select; Start trực tiếp | SELECTION_REQUIRED; không build/run/auto-select | IPC/request tests và API contract tests | PASS |
| TC-M1-10-03 | M1-10 | Cancel, project transition, owner reload/destroy, cleanup retry | Không trả stale result; dispose listener/handler; giữ resource khi cleanup lỗi | IPC lifecycle/request ownership tests | PASS — controlled tests |
| TC-M1-10-04 | M1-10 | Forward phase, stdout/stderr, error/exit; giữ JS event path | C# semantic event đúng session; không đổi JS wire shape | Main IPC + Preload bridge integration tests | PASS — controlled tests |
| TC-M1-11-01 | M1-11 | Mở/đóng target Dialog; refresh, select/use, clear, cancel, empty/error | Gọi đúng public `studentIde.run` API; không auto-pick khi SELECTION_REQUIRED | Renderer C# UI tests; 38 tests trong lần chạy gần nhất | PASS — automated renderer |
| TC-M1-11-02 | M1-11 | Hiển thị STALE_TARGET/PERSISTENCE_RECOVERED; giữ target qua tab/Output | Có hướng khắc phục; target không theo file `.cs` đang active | Renderer UI/controller tests | PASS — automated renderer |
| TC-M1-11-03 | M1-11 | Register listener trước start; xử lý early/stale event, source dirty, Stop | Chỉ nhận đúng project/session; fail closed; không auto-save; Stop sớm | Renderer C# UI/controller tests | PASS — API mocked |
| TC-M1-11-04 | M1-11 | JavaScript Run/re-run/Stop/Output và C# Output | JS vẫn là current `.js`; C# dùng `.csproj`; streams/status không trộn session | Renderer integration tests; test gần nhất: 38/38 ở 2 files | PASS — automated renderer |
| TC-M1-11-05 | M1-11 | Output compact: build summary, expandable detail, diagnostics, execution streams | Build success gọn; lỗi build rõ và không hiện Execution; stdout/stderr/exit chính xác | Test mới Output Panel: build success/failure, 2.97s/metrics, disclosure, streaming, exit 13, session mới | PASS — automated renderer; visual QA chưa có |
| TC-M1-11-06 | M1-11 | Narrow window, sáng/tối, path dài, Dialog/Output trực quan | Không vỡ layout; focus/theme/scroll đúng trên Electron | M1-11 report ghi không có native app window để kiểm tra | NOT VERIFIED |
| TC-M1-12-01 | M1-12 | C# UI → public Preload API → Main → native process, Console.WriteLine | Chạy chương trình thật qua luồng tích hợp; xác nhận output/exit trong UI | Chưa chạy thành một luồng tích hợp; Main/native smoke riêng 14/14 | BLOCKED |
| TC-M1-12-02 | M1-12 | Exit 0/nonzero, stdout/stderr, build failure và no-execute | UI hiển thị đúng nội dung/exit; build fail không execute | Main/native đã xác minh một phần; UI→Preload→native chưa xác minh | PARTIAL |
| TC-M1-12-03 | M1-12 | Workspace nhiều `.csproj`, chọn đúng project khi đổi editor tab | Chạy target đã chọn, độc lập file/tab đang mở | Chưa xác minh end-to-end trong UI | NOT VERIFIED |
| TC-M1-12-04 | M1-12 | Stop khi Preparing/Building/Executing, project switch, stale event và cleanup | Dừng đúng process/session; không nhận event cũ; cleanup xong | Building/Executing/transition có Main/native smoke; Preparing/project switch chủ yếu controlled tests | PARTIAL |
| TC-M1-12-05 | M1-12 | Dirty/conflict/unknown source và stale target trong live flow | Chặn fail-closed, không auto-save; diagnostics phù hợp | Dirty guard Main/native có editor reply stub; stale diagnostics có focused tests | PARTIAL |
| TC-M1-12-06 | M1-12 | JavaScript Run/re-run/Stop/Output regression | JS production UI vẫn chạy như trước | Electron JS production-UI smoke exit 0; 8 sessions, Run/Stop/output và exit 0/7 | PASS — JS-only smoke |
| TC-M1-12-07 | M1-12 | Visual QA: target/dialog/output, narrow window, themes, long paths | Xác nhận UI thực tế và trạng thái Stop/project switch | Không có cửa sổ Electron khả dụng để inspect | NOT VERIFIED |

## Trạng thái exit gate

M1-01 đến M1-11 được ghi `COMPLETE` trong Implementation Plan. M1-12 hiện
`BLOCKED`, không phải `PASS`: còn thiếu ít nhất một luồng C# tích hợp từ production
UI qua public Preload/Main đến native .NET process, xác minh workspace nhiều
project qua UI, và visual QA. Vì vậy không kết luận toàn bộ C# Project Run/M1 đã
nghiệm thu end-to-end. M1-12 chưa hoàn tất; Milestone 2/Console stdin không thuộc
phạm vi tài liệu này.

## Nguồn bằng chứng

- `docs/IMPLEMENTATION-PLAN.md`, Section 13.7: milestone status và acceptance summary.
- `spikes/csharp-project-run/REPORT.md`: M1-04 Windows 11 x64 isolated spike.
- `spikes/csharp-project-run/M1-05-REPORT.md`, `M1-06-REPORT.md`, `M1-09-REPORT.md`, `M1-10-REPORT.md`.
- `docs/IMPLEMENTATION-PLAN.md`, Section 13.7 verification notes: M1-07, M1-08, M1-09a.
- `spikes/csharp-project-run/M1-11-REPORT.md`, `M1-11-UI-DESIGN.md`.
- `spikes/csharp-project-run/M1-12-REPORT.md`: current blocked acceptance, exact tested/not-tested boundaries.
- Current focused Output regression command: `npm test -- tests/renderer/csharp-run-ui.test.tsx tests/renderer/run-output.integration.test.tsx --reporter=dot` — 2 files, 38/38 tests PASS. `npm run typecheck` and `git diff --check` also passed in the same work session. This does not unblock M1-12.
