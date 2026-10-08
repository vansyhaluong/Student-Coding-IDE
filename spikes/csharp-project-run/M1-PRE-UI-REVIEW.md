# M1 Pre-UI Integration Review — M1-01 → M1-10

Date: 2026-10-08. **Review Result: READY WITH NON-BLOCKING ISSUES.**

Không phát hiện BLOCKER trong source đã review. Có hai SHOULD_FIX và một
IMPROVEMENT/test gap tại thời điểm review. **R1 đã được sửa và verified trong
follow-up bên dưới; R2 và R3 giữ nguyên.** M1-11 có thể bắt đầu khi được ủy quyền riêng; báo cáo này
không xác nhận Core Acceptance M1-12 hoặc C# Run tổng thể COMPLETE.

## Scope và provenance

- Chỉ review và tạo báo cáo này; không sửa production, contracts, tests, kiến trúc,
  dependencies hoặc trạng thái roadmap. Không commit/push/merge.
- Branch `feature/csharp-project-run`; Git status, diff và diff stat ban đầu sạch.
- Đọc AGENTS.md; REQUIREMENT phần FR-023 C# extension; Architecture §10;
  ADR-024 và Windows 11 x64 amendment; Implementation Plan §13.7;
  CODEBASE-MAP, LANGUAGE-SUPPORT và CHANGELOG-THESIS liên quan.
- Đọc các report M1-04 (`REPORT.md`), M1-05, M1-06, M1-09, M1-10.
  M1-07/M1-09a có verification trong Implementation Plan; M1-08 có task row
  trong Plan và verification entry trong Changelog, không có report riêng ở
  `spikes/csharp-project-run/`. Không coi việc thiếu report riêng là lỗi lifecycle.
- Review source thực tế: shared Run/source contracts; RunService/RunStrategy;
  CSharpRunStrategy/preparation; SDK resolver/probe/preflight; target resolver/
  store/request ownership; RunProjectLifecycle/ProcessManager; Windows adapter
  và các điểm native createRun/Job/argv/release; IPC registry/composition/Preload;
  editor aggregate revision/source guard/controller và JS Run controller.
- Những số smoke ở report trước là evidence lịch sử, không phải kết quả chạy mới
  của review này. Không chạy lại .NET/native smoke, full suite hoặc full build.

## Kết nối architecture và end-to-end

| Điểm nối | Kết luận từ source |
|---|---|
| Renderer → Preload → IPC | `run-project.ts` định nghĩa request semantic; validators exact-field ở cả bridge và Main. Không nhận executable/argv/cwd/root/glob. Preload kiểm tra project/path correspondence và dispose listener. |
| Main composition | `src/main/index.ts:148`, `:169`, `:351`, `:378`, `:386` nối source guard, production preparation, owner hooks, target request scopes và RunIpcService vào cùng RunService. Trusted frame kiểm tra tại `:529`. |
| resolveTargets | Main lấy ActiveProject authority; discovery độc lập LSP/editor, nested/bounded/deterministic, canonical Windows dedup. Mỗi candidate/reference được authorize và evaluate bằng M1-05. |
| selectTarget / clearTarget | TargetStore dùng namespace schema-1 theo canonical project ID và PersistenceService hiện có. Fresh resolver/eligibility/identity kiểm tra quanh atomic persistence; không auto-persist target duy nhất. |
| startProject | IPC gọi `startPlannedRun`, không gọi legacy JS start. Session được reserve sau cheap authorization; Start reply là session, không phải chứng nhận build thành công. |
| source guard | Main yêu cầu approval trước preparation và mỗi launch; request/project/session/owner/frame được kiểm tra. Renderer aggregate mọi retained project document, không chỉ active editor. Timeout 5s, tối đa 64 live records, không Save tự động. |
| build → execute | Strategy nhận evaluated runtime capability nội bộ, tạo immutable two-step plan. Fixed Debug flags giống M1-04; không shell/PTY. M1-08 cleanup build hoàn tất rồi mới revalidate và execute. |
| events → Stop | C# dùng project event channel riêng; JS giữ channel cũ. State/phase/streams/exit/failure gắn session. Stop dùng API chung nhưng domain kiểm tra ownership. |

Source anchors: `run-service.ts:165` (startPlannedRun), `:225` (early events),
`:280` (guard), `:292` (plan fingerprint), `:296` (reauthorize), `:309`
(cleanup trước spawn), `:317` (phase + cancellation check), `:324` (owned create),
`:348` (step cleanup), `:350` (nonzero không advance), `:359` (retire callbacks).

SDK policy được tách khỏi csharp-ls: stable effective SDK >=8, CLI selection tại
candidate cwd/global.json; classifier yêu cầu SDK-style single known TFM Console
Exe, loại Library/Web/Test/WPF/Forms/multi-target. Evaluation không bị thay bằng
XML parsing. ProjectReference được re-authorize trong root, dedup/cycle/bound
checks; không coi raw evaluated reference là authority.

## Lifecycle, security và compatibility

- Stop abort controller; check lại sau await và sau phase observer trước create.
  Project/owner generations loại pending start cũ; per-step generation loại callback
  build sau khi bước đó đã được cleanup. Re-run cùng canonical identity phải dừng
  session cũ; owner khác không được thay thế nó.
- Cleanup registration trước scope/native creation. Build nonzero không execute.
  Root exit chưa đủ để advance: adapter/RunService cần EOFs, owned tree và native
  release. Cleanup failure giữ session/resource, chặn replacement và transition;
  explicit Stop/cancel hoặc shutdown retry vẫn là đường phục hồi.
- `index.ts:358` invalidates source approval, stops owner và cancels target request
  khi navigation/destruction/render-process-gone. Async IPC reply kiểm tra lại
  frame, owner generation và captured project object; same-root reopen không làm
  reply cũ trở thành hợp lệ.
- Desktop STOPPING gọi beginShutdown trước reverse service cleanup; cửa sổ được
  giữ đến khi cleanup bắt buộc thành công. Không thấy lifecycle C# song song.
- FileSystemService realpath containment, Run canonical identity và reauthorization
  được giữ. Discovery bỏ symbolic links; references vẫn cần authorization.
  Saved-source approval/fingerprint không phải snapshot bất biến của disk/source.
- JS tiếp tục dùng JavaScriptRunStrategy/start/onEvent cũ; C# legacy-start bị từ chối.
  Không thấy đường dispatch C# qua Terminal/Git/LSP hoặc thay selection của LSP.
  Đây là kết luận inspection, không phải smoke mới cho các subsystem đó.

## Findings

### RESOLVED — R1 (original severity SHOULD_FIX): Phase metadata không được retire khi session bị mute do root unavailable

**R1 follow-up — 2026-10-08: TASK REVIEW PASS / COMPLETE.**

- Bảo toàn report untracked có sẵn; branch `feature/csharp-project-run`, không có
  thay đổi tracked ban đầu. Phạm vi chỉ R1, không triển khai R2/M1-11 hoặc sửa ADR.
- Test C# qua production IPC/Preload/lifecycle tái hiện trước fix bằng
  `npm test -- tests/main/run-project-ipc.test.ts -t "R1 retires unavailable"`:
  **1 FAIL**, expected phases 0 nhưng actual 1, trong khi session CANCELLED,
  ProcessManager 0 và public event count không đổi.
- Fix: optional Main-only `RunExecutionOptions.onFinalized` gọi từ finalize
  hiện có, sau terminal state/public event handling và độc lập mute flag.
  Main composition nối sang `RunIpcService.retireSession`; terminal state,
  session ID và owner phải khớp record. Không có channel/public API mới.
- Không clear active/failed-cleanup phase records khi invalidateOwner hoặc IPC
  stop; notification vẫn retire được sau khi IPC stopped. Public event mute,
  process ownership, cleanup/state transitions, command policy và JS flow giữ nguyên.
- 6 cases mới: unavailable/reopen ba chu kỳ không tích lũy records; unavailable
  failed cleanup rồi Stop retry; session khác active giữ record; reload/shutdown
  cleanup failure không retire sớm; close/reopen chỉ giữ session mới. Tests kiểm
  tra ProcessManager, terminal state, stale callbacks và muted event counts.
- `npm test -- tests/main/run-project-ipc.test.ts -t R1`: **6 PASS**, 23 skipped.
- Focused regression **153 PASS / 6 files**, gồm 6 cases mới:

  ```text
  npm test -- tests/main/run-project-ipc.test.ts tests/main/run-project-lifecycle.test.ts tests/main/run-plan-lifecycle.test.ts tests/main/run-lifecycle.test.ts tests/main/run-foundation.test.ts tests/preload/run-project-bridge.test.ts
  npm run typecheck
  npx --no-install eslint src/main/index.ts src/main/ipc/run-ipc-service.ts src/main/services/run/run-service.ts tests/main/run-project-ipc.test.ts
  git diff --check
  git diff --no-index --check -- /dev/null spikes/csharp-project-run/M1-PRE-UI-REVIEW.md
  ```

- Typecheck/scoped ESLint/whitespace checks PASS. Chỉ process ports giả lập;
  không có native/execution implementation thay đổi nên không chạy full suite,
  full build hoặc native smoke. R3 evidence gap vẫn còn; không claim smoke mới.
- Files changed: `src/main/services/run/run-service.ts`,
  `src/main/ipc/run-ipc-service.ts`, `src/main/index.ts`,
  `tests/main/run-project-ipc.test.ts`, Architecture, Implementation Plan,
  Changelog và report này. Không sửa RunProjectLifecycle hoặc contracts.
- Remaining R1 blockers: NONE. R2 chưa sửa; M1-11 vẫn NOT_STARTED.

Original review evidence dưới đây được giữ như lịch sử trước fix:

**Loại:** confirmed issue từ code; chưa có automated reproduction tích hợp C# IPC
cho chính map retention. Đây là bookkeeping leak, không phải orphan process đã
được quan sát.

**Vị trí:** `src/main/ipc/run-ipc-service.ts:30`, `:104`, `:113`, `:120`;
`src/main/services/run/run-project-lifecycle.ts:49`;
`src/main/services/run/run-service.ts:393`, `:606`, `:629`.

**Nguyên nhân / tái hiện:** start C# để IPC tạo record trong `phases`; root chuyển
UNAVAILABLE. RunProjectLifecycle mute project events trước stopProject. RunService
vẫn cleanup/finalize session nhưng emit bỏ cả terminal state/exit vì muted.
RunIpcService chỉ xóa record theo exit, invalidateOwner hoặc stop; không có hook
retire theo project/session đã finalize. Reopen trong cùng WebContents không gọi
invalidateOwner, nên record cũ tồn tại đến owner invalidation/shutdown. Lặp lại
chu kỳ đó tích lũy metadata không có bound riêng.

**Evidence:** test `tests/main/run-project-lifecycle.test.ts:193` xác nhận event
count không tăng trong unavailable cleanup, ProcessManager về 0 và reopen dùng
session mới. Test này PASS trong review nhưng dùng JS lifecycle và không kiểm tra
RunIpcService.phases. Kết luận retention dựa trên các write/delete sites ở source.

**Ảnh hưởng:** metadata Main giữ session ID/owner/phase đã kết thúc; không giữ native
handle/output và không cho launch sai target. Không chặn M1-11, nhưng nên sửa để
lifecycle bookkeeping có tuổi thọ đúng.

**Đề xuất:** task nhỏ riêng retire IPC metadata bằng Main-only terminal lifecycle
notification kể cả khi public event bị mute, hoặc project invalidation hook có
ownership phù hợp. Giữ chính sách mute output. Thêm test C# + IPC: unavailable →
cleanup → reopen nhiều lần, assert metadata và resources đều retire.

### SHOULD_FIX — R2: Public resolution bỏ mất stale/recovered selection context

**Loại:** confirmed diagnostic limitation; không phải selection bypass. Projection
hiện tại tuân thủ DTO resolution tối giản M1-01, nhưng làm giảm thông tin cho UI.

**Vị trí:** `src/main/services/run/csharp-run-target-store.ts:173`, `:180`;
`src/main/services/run/csharp-run-target-requests.ts:90`;
`src/shared/contracts/run.ts:187` (resolution validator).

**Tình huống:** lưu A, xóa/đổi loại A và chỉ còn B eligible; hoặc corrupt primary
có backup hợp lệ. Store trả `selection: STALE/RECOVERED`, issue `STALE_TARGET`/
`PERSISTENCE_RECOVERED`, resolution SELECTION_REQUIRED. TargetRequests chỉ validate
và trả `result.resolution`; Preload không nhận issue/selection. Renderer không thể
phân biệt lựa chọn stale, recovery và ambiguity thường từ resolution này.

**Evidence:** `tests/main/csharp-run-target-store.test.ts:128` (deleted/renamed/
library), `:201` (corrupt + backup) kiểm tra issue và đều PASS trong review.
Public IPC tests kiểm tra selection/clear/reopen nhưng không assert truyền context
stale/recovered. Inspection xác nhận context bị bỏ ở projection, không chỉ thiếu test.

**Ảnh hưởng:** UI vẫn có thể yêu cầu chọn đúng và security vẫn fail closed; tuy nhiên
khó giải thích tại sao chỉ có một candidate mà vẫn phải chọn lại. Các reason này
có thể xuất hiện ở preparation error, nhưng resolveTargets không truyền chúng.

**Đề xuất:** task nhỏ riêng xác định public safe issue metadata/mapping và focused
IPC/Preload tests trước khi UI cần thông báo cụ thể. Chỉ truyền semantic allowlist,
không expose Main assessments/canonical paths. Nếu giữ contract hiện tại, M1-11
dùng thông báo chọn lại trung tính và tuyệt đối không suy luận số candidate=1
đồng nghĩa có quyền auto-select khi state là SELECTION_REQUIRED.

### IMPROVEMENT — R3: Chưa có evidence public IPC/Preload → real .NET/native trong cùng run

**Loại:** test gap và potential composition risk chưa được xác nhận thành lỗi.

**Vị trí:** `scripts/smoke-csharp-run-strategy.mjs:82`;
`tests/main/run-project-ipc.test.ts:62`, `:71`, `:85`, `:104`;
`src/main/index.ts:351`, `:386`, `:529`;
`spikes/csharp-project-run/M1-09-REPORT.md`, `M1-10-REPORT.md`.

**Evidence:** M1-09 real SDK 8/10 smoke gọi trực tiếp RunService.startPlannedRun,
với real native adapter nhưng simulated editor replies. M1-10 test nối production
domain/registry/Preload nhưng SDK facts, execution adapter, Electron frame/owner
transport và source replies được controlled/simulated. Reload test gọi cleanup
methods trực tiếp; không kích hoạt actual Electron navigation/crash hooks.

Hai lớp evidence bổ sung nhau và source composition phù hợp; chúng không chứng
minh một real Electron public API call xuyên suốt từ picker selection đến native
execution/Stop. Không có bằng chứng API đó đang hỏng; không coi gap này là blocker.

**Đề xuất:** ở M1-12 Core Acceptance, thêm focused Electron integration qua public
bridge: resolve/select/restore → startProject → real editor guard → SDK8/10
build/run → project events → Stop/cleanup; thêm reload hoặc project close. Dùng
process baseline/Job release/ProcessManager records và listener disposal để chứng
minh cleanup. Không cần lặp toàn bộ spike matrix hoặc cài SDK/workload.

## Tests Executed trong review

Chỉ chạy một lần command sau để xác minh unavailable mute/cleanup, stale/recovery
policy và early-session/phase/JS forwarding:

```text
npm test -- tests/main/run-project-lifecycle.test.ts tests/main/run-project-ipc.test.ts tests/main/csharp-run-target-store.test.ts -t "mutes stale output|requires fresh selection for|corrupt primary and valid backup|starts early, streams|keeps JavaScript start/stop"
```

**PASS: 7 tests, 3 files; 72 skipped do name filter.** Không sửa tests.
Không chạy typecheck vì không phát hiện nghi vấn type/contracts cần xác minh bằng
compiler. Không full npm test/build, native/.NET smoke hoặc Terminal/Git/LSP tests.
Không claim hai findings đã được test end-to-end trực tiếp hoặc đã được sửa.

## M1-11 readiness và lưu ý cho consumer

API đủ cho minimal target picker, Run/Stop và Output phases/failures. Chưa có
blocker bắt buộc sửa trước UI. R1 đã verified; R2 là task nhỏ độc lập nên được lên lịch;
R2 có thể dùng generic selection message trong khi contract vẫn giữ nguyên.

- Subscribe project events trước start; correlate project/session và UI generation.
  STARTING/phase/error có thể đến trước invoke reply; Start success không đồng
  nghĩa preparation/build success. Không overwrite terminal view bằng reply cũ.
- Dùng resolution.state làm authority. SELECTION_REQUIRED có thể có một eligible
  hoặc eligible + unassessable; chỉ chọn eligible qua selectTarget, không đoán.
- Một outstanding target request: serialize/debounce resolve/select/clear; chờ
  cancelResolution cleanup trước request mới. Cancel nhắm operation hiện tại của
  owner/project, không phải một request ID tùy ý.
- Giữ Stop khả dụng từ early session trong PREPARING/BUILD_RESTORE/EXECUTING;
  STOPPING/CLEANUP_FAILED cần retry và không được tự mở replacement session.
- Tách phase khỏi state; error event và invoke AppResult failure là hai đường
  thông báo. Render allowlisted reasons, không parse localized stdout/stderr.
- Project unavailable/reload/switch cần retire UI views, outstanding requests và
  listeners; không đợi terminal event từ session đã bị Main mute.
- C# target độc lập active `.cs` và LSP target. JS current-file flow giữ nguyên.
  Backend cho phép concurrency giữa canonical targets khác nhau; UI phải quyết
  định rõ session hiển thị/Stop khi người dùng đổi target, không tưởng đổi picker
  tự dừng target cũ. Không auto-save hoặc bật stdin trong M1.

**Status giữ nguyên:** M1-01 → M1-10 (gồm M1-09a) COMPLETE;
M1-11 NOT_STARTED; Milestone 1 và overall C# Run IN_PROGRESS.

**Recommended next actions:** có thể ủy quyền M1-11; R1 bookkeeping cleanup đã
hoàn thành, thống nhất R2 messaging/semantic context khi cần, và đưa R3 vào M1-12.
Không có task sửa BLOCKER hoặc quyết định ADR mới được yêu cầu bởi review này.
