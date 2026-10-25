# Phase 9E-1 — Exercise Package Foundation: Final Acceptance Review

Ngày2026-10-24. **Phase 9E-1: COMPLETE — PASS WITH LIMITATIONS**, người dùng chính
thức nghiệm thu theo báo cáo này, S5-AC1 và acceptance record9E1-AC1 trong
[DECISIONS](DECISIONS.md#phase9e-1--official-acceptance-complete-2026-10-24).
**9E-2 vẫn NOT_STARTED, chờ phê duyệt riêng.** Xem Section9 cho closure hiện hành.

Original review result **READY FOR ACCEPTANCE** được giữ làm lịch sử trước user
approval. Việc đóng phase là quyết định explicit của người dùng, không phải tự
chuyển trạng thái; không full reference-host PASS, Official Tests hoặc release
certification. Evidence và deferred gates không đổi.

## 1. Phạm vi, authority và kết luận

Đã đối chiếu [Requirements](REQUIREMENT.md), [Architecture](ARCHITECTURE.md),
[ADR-025 và các amendments](DECISIONS.md), [Implementation Plan Section13.6](IMPLEMENTATION-PLAN.md),
[L1–L12](PHASE-9E1-PACKAGE-ASSET-PARSER-LIMITS-REVIEW.md), báo cáo Step1–5,
S5-F1/O1/P2/R1 và prototype. User approval ghi trong các documents và S5-AC1 là
cơ sở của trạng thái nghiệm thu, không suy từ việc code đã tồn tại.

**Không còn blocker chưa xử lý thuộc phạm vi9E-1 đã duyệt sau S5-AC1.** Steps1–4
đã COMPLETE — PASS WITH LIMITATIONS. Step5 đã COMPLETE — PASS WITH LIMITATIONS
(Current Host Only); hai loader reference-host blockers đã được chuyển thành
mandatory9E-7/release gates, vẫn UNVERIFIED. Không hạ tiêu chí hay tự waiver mới.

Nền tảng đủ làm tiền đề kỹ thuật cho9E-2: versioned package/profile contracts,
shared bounded validators, trusted reader/build assets, Registry/budgets/lifecycle,
public63 migration và Run compatibility đã có evidence trong phạm vi nghiệm thu.
**Quyền bắt đầu9E-2 chưa được cấp:** prerequisite nghiệm thu Phase9E-1 nay đã
hoàn tất, nhưng vẫn cần phê duyệt gói9E-2 riêng. Không coi authoring/Official
Tests/Judge/Submit đã hoàn thành.

Task scope: review/audit và tạo report này; không sửa production/Runtime/contracts/
security, không tests/build/profiling mới, dependency, commit/push/merge. Nhánh
`feature/phase-9a-learning-mode`; working tree đã có thay đổi/untracked của các
bước trước và7 deleted9D.2 evidence documents. Không revert/overwrite hoặc khôi
phục giả các evidence đó. Ở lượt review ban đầu chỉ tạo report này; lượt closure
subsequent chỉ đồng bộ documentation, không production/test changes.

## 2. Bảng nghiệm thu Step 1–5

Counts dưới đây là evidence của từng scope/run, **không cộng thành full-suite
total** vì các targeted batches có overlap. Không phải tests vừa chạy lại.

| Step | Trạng thái được người dùng nghiệm thu | Evidence chính /phạm vi | Kết quả review |
|---|---|---|---|
|1 — Contracts/policy/validators|**COMPLETE — PASS WITH LIMITATIONS**|[Step1 report](PHASE-9E1-STEP1-CONTRACTS-VALIDATION.md):6 files/438 PASS; typecheck/targeted lint PASS; build NOT RUN vì pure contracts/validators. Strict JSON/Unicode/duplicate keys/numeric/schema/six types/envelopes; Main-only private types|Không còn design gate của Step1; structural validity không phải trusted hash, math correctness hay runtime feasibility|
|2 — Resources/integrity/build|**COMPLETE — PASS WITH LIMITATIONS**|[Step2 report](PHASE-9E1-STEP2-RESOURCE-INTEGRITY-ASSETS.md):7 files/468 PASS/1 file-symlink SKIP; typecheck/targeted lint/build/compiled anchor PASS. Bounded actual reads, raw hash/length/signature, root/identity/link checks, generic emission|S2-R1–R4 APPROVED; dev/build và directory fixture evidence, không installer/clean-machine certification|
|3 — Registry/readiness/budgets|**COMPLETE — PASS WITH LIMITATIONS**|[Step3 report](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md):9 files/500 PASS/1 SKIP; typecheck/targeted lint/build PASS. Pre-allocation ledger, aliases/copies/raw overlap, one flight/leases/BUSY, faults/startup/shutdown|S3-D1–D4 APPROVED; resource evidence khác operational/release readiness; logical ledger không chứng minh physical heap bound|
|4 — Migration63/bounded IPC/Run|**COMPLETE — PASS WITH LIMITATIONS**|[Step4 report](PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md):703 consolidated targeted PASS/1 SKIP, gồm693/1 SKIP và10 theory tests chạy riêng; không gọi failed concurrent batch là PASS. Quality/build và C#/JS/Monaco/drafts/Project/PTY evidence; final StrictMode/Vite regressions được giữ riêng|S4-D1/D2 APPROVED;63 public packages/252 assets, stable IDs/chapter mapping/samples/starters, approved ProductExceptSelf fix, synthetic64/65; không fake Judge data|
|5 — Foundation acceptance/correction|**COMPLETE — PASS WITH LIMITATIONS (Current Host Only)** theo **S5-AC1**|[Step5 Section15](PHASE-9E1-STEP5-FOUNDATION-ACCEPTANCE.md#15-approved-step5-closure--current-host-only):accepted S5-F1/O1; final package244 PASS/1 SKIP, separate regression444 PASS; typecheck/targeted lint/build, fixed4-scenario measurements và named production smokes. Historical FAILs giữ nguyên|Scope/timing amendment được duyệt; current-host PASS không phải target-matrix PASS. Không còn Step5 blocker trong scope mới; B1a/B1b bắt buộc trước9E-7/release|

S5-F1 correction giữ PASS WITH LIMITATIONS trên host đã đo; S5-O1 giữ COMPLETE —
PASS WITH LIMITATIONS. S5-R1 giữ COMPLETE — DIAGNOSTICS ONLY. Prototype bounded
concurrency **NOT PASS for production promotion**, không được dùng như fix hoặc
evidence performance của production resolver.

## 3. Approved contracts và consistency audit

Static source review tập trung `exercise-package-policy.ts`, shared public limits,
profile contracts, work control và owned Prepare binding; kết hợp evidence
enforcement trong Step reports, không tự tạo validator mới hoặc sửa contract.

| Contract /decision | Consistency được xác nhận | Evidence /giới hạn |
|---|---|---|
| L1–L3 | Manifest4MiB/4096 packages; fixed asset caps metadata256KiB/samples512KiB/Judge4MiB/starters64KiB; package6MiB/registry256MiB logical; stable IDs và no truncation | Policy/constants và targeted boundary tests. Independent maxima không được hứa cùng fit. Full profile5 assets, explicit S4 public profile4 assets là approved amendment, không conflict/downgrade |
| L4–L6 | Bounded reads/decode/pre-scan trước native parse; strict Unicode/grammar/decoded duplicates/prototype keys; original structural/field/six-type/canonical-value limits | Vetted policy/source và Step1/F1/O1 parity/boundary tests; O1 dùng cùng kernel, không validator có semantics khác |
| L7–L8 | Technical16 samples/128 official cases, exact public linkage/signature/type/version/comparator allowlist; envelopes512KiB, summaries32/100,page256KiB,detail1MiB final encoded | Synthetic complete-package validation và bounded public/IPC tests;128 không default, không proof coverage/60s feasibility; public DTO không hidden official data |
| L9–L10 /S2-R1–R4 | Exact raw bytes/hash +compiled anchor, canonical signature; trusted fixed dev/packaged mode, no fallback, stable root/handle/parent checks, no arbitrary asset code/download | Reader/build tests và audit current emitted data. Bootstrap historical, current63 public migration không tạo official readiness. Node namespace limitations explicit, installed separate |
| L11 /S3-D1–D2 |16MiB canonical parsed proxy/1m resident nodes/8MiB raw; reserve trước allocation; count retained/copy/pinned/raw overlap; one slot/flight, owner joins/BUSY và unpinned eviction | Registry/budget/cooperative failure/lease tests. Không đổi sang LRU/queue/global cache. Ledger0 không phải GC/physical-memory certificate |
| L12 /S3-D3–D4 | Global/local faults phân biệt, retain drafts/records; STARTING/readiness riêng capability; nonblocking tracked startup, owned Prepare due và retained shutdown | Registry/Main/IPC/lifecycle tests. No public verification→Judge/Submit READY; pending work không bị abandon |
| S4-D1/D2 | Explicit schema/policy2 public-only4-asset/official:null cùng full5-asset semantics; capability-specific public ownership trong cùng Registry/reader/ledger | Shared/public DTO schema1 không mâu thuẫn với manifest/public metadata profile2: đây là các versioned envelopes khác nhau. Current public Run vào owned Prepare, không pre-read official để né due |
| S5-P2 A | Soft5ms,8192 chars/512 nodes/2048 steps/32 manifest entries; cadence256 chars/64 steps; hash64KiB, setImmediate/cross-stage budget/mandatory barriers | Work-control static review và deterministic O1 guard/yield/batching parity. Không coalesce barriers/increase cadence để đạt latency |
| S5-P2 B2 | Private cooperative copy/representation/packet, one derived job/owner, BUSY overlap; ownership/reservations/leases/pending retention vẫn giữ | Cooperative tests; unchanged public IPC/Runtime contracts; source/build hashes match reviewed evidence |
| S5-P2 C /O1 | Native JSON.parse/structuredClone giữ atomic, đo riêng; fail observed acceptance thì stop/review. Bounded batching giảm handoffs, không giảm logical charges | Accepted F1/O1 measurement/semantics evidence; không Worker/alternate parser hay atomic-time guarantee trên mọi host |
| S5-AC1 | Step5 Current Host Only acceptance; B1a/B1b vẫn UNVERIFIED, mandatory before9E-7 acceptance/release certification | [Approved decision](DECISIONS.md#phase9e-1-step5--current-host-acceptance-scope-amendment-approved-2026-10-24); requirement/architecture/plan/current Step5 Section15 thống nhất. Không đổi numeric targets/security/deadlines |

Runtime9D/Core/native, Policy B, existing operation60s/Prepare10s/compile30s/
case2s, quotas, output and VERIFIED cleanup boundaries không bị thay bằng policy
của loader hoặc prototype. Experimental SDK4-task/64MiB parameters không phải
production policy và không thay loader8MiB raw ceiling.

## 4. Evidence performance và compatibility được chấp nhận

Existing O1 plain evidence: `out/step5-loader-diagnostics-1792811602860/plain/`.
Cùng4 historical fixtures/workload và registered clone; không regenerate/reduce.

| Scenario | O1 latency ms /statistic | Stall p95/max ms | Isolated RSS delta MiB |
|---|---:|---:|---:|
| Production63 public |103.016 /public acquisition p95|10.645/15.055|22.78|
| Large-string complete synthetic package |315.705 /official fixture p95=max|10.765/15.046|81.36|
| Dense nodes complete synthetic package |698.480 /official fixture p95=max|10.727/42.572|25.26|
| Maximum registry |582.845 /manifest p95=max|10.666/14.598|56.45|

Current host Windows11 Home26200/Ryzen5 6600H/8GiB/NVMe, không phải hai target
specifications. Four loader stalls đạt p95≤50ms/max≤100ms, không RSS128MiB review
trigger trong isolated runs; approved ceilings không đổi. Latency/GC có observations
nhưng không có unapproved absolute loader-latency/GC ceiling để tự áp.

Logical parsed/node/raw peaks trong accepted measurements:
41,587/1,482/54,138 (production),8,379,860/1,682/4,189,572 (string),
804,466/393,842/401,878 (dense),2,575,386/86,107/2,445,375 (registry); stopped0.
Atomic stage max JSON.parse8.802ms/dense clone30.401ms là sampled instrumented
observations, không timing bound cho mọi valid graph/machine. Stage CPU probes,
plain timer lag và wall operation time không bị cộng/đánh đồng.

Compatibility evidence được giữ đúng scope: production C#/JavaScript samples,
compile/syntax/runtime errors, timeout/NOT_RUN, cleanup/managed shutdown;
Monaco six worker labels, Unicode editor/caret/undo, context drafts/reset/reload,
StrictMode/Vite opening; Project heartbeat/real PTY before/after Learning và timeout.
Đây không phải all63×both-language×machine execution certification. Minimal worker
harness thiếu unrelated IPC handlers và existing Monaco build warning vẫn được
ghi nhận; không làm giả installed/service-startup coverage.

## 5. Limitations, deferred gates và giai đoạn chịu trách nhiệm

| Item | Trạng thái giữ nguyên | Giai đoạn/gate chịu trách nhiệm; điều kiện |
|---|---|---|
| **B1a Windows10 x64/2 physical cores/8GiB RAM/SSD** | **UNVERIFIED** | **Mandatory9E-7/release certification** theo S5-AC1; phải hoàn thành trước nghiệm thu9E-7/release, same4 loader scenarios/fixtures/workload/clone, p95≤50/max≤100ms, latency/RSS/GC/budgets/cleanup |
| **B1b Windows11 x64/≥4 physical cores/16GiB RAM/SSD** | **UNVERIFIED** | Cùng mandatory9E-7/release gate; không dùng host8GiB hiện tại hoặc averages thay thế |
| Historical C# PREPARE_TIMEOUT | Observed FAIL giữ nguyên; cause **UNVERIFIED**, reliability chưa certified | Runtime reliability verification trong9E-7/full execution release matrix, với unchanged9D ownership/deadlines. SDK diagnostics dominance trong successful Prepare không chứng minh historical cause; không cần SDK optimization để nghiệm thu foundation |
| Full-app stall/RSS | Attribution incomplete; leak status **UNVERIFIED** | Application/integration/release review9E-7/9G theo domain liên quan; lag216–726ms và deltas>128MiB giữ nguyên. L11 isolated-loader thresholds không được áp trực tiếp cho full-app subtraction; không S5-A1 mới trong lượt này |
| File-symlink EPERM | Package test1 SKIP, case thực chưa kiểm chứng | Windows resource/security verification trước platform/release sign-off; không gọi junction/mock là actual file-symlink PASS |
| Supported UNC /opaque reparse /namespace races | Coverage còn **UNVERIFIED**; observed path/junction/hardlink checks và S2-R2 Node limitation giữ nguyên | Windows filesystem/security9E-7/9G gates khi áp dụng; không suy atomic all-tag/swap-and-restore guarantee, không tự mở scope native-hardening |
| Installed/ASAR-root/clean-machine/offline resources+runtimes | **UNVERIFIED**; directory fixture/dev emission không đủ | Installed distribution/9G và corresponding release prerequisites; dùng another Windows machine không dev tooling, complete assets/provisioned offline runtimes. Không coi9E-1 acceptance là installer PASS |
| Physical memory/GC/atomics trên host khác | Chỉ measured scope; true cold/cache/load và universal bounds không certified | Deferred target measurements và broader runtime/release matrix; logical ledger≠RSS, fresh process≠cold disk, no forced-GC cleanup waiver |
| R1 bounded-concurrency prototype | **NOT PASS** temporal freshness; test asserts defect là PASS assertion, không conformance PASS | **Exclusion condition xuyên suốt**, tuyệt đối không vào production. Any replacement needs separate approved scope; không phải việc còn phải implement để đóng9E-1 |
| Production Official Test Sets/independent references | **NOT IMPLEMENTED /NOT MEASURED**, không phải completed work |9E-2 chỉ sau phase acceptance và explicit authorization; coverage-first,128 chỉ technical ceiling, no dummy data/sample fallback |
| Private runtime bridge /Judge/Submit/comparator/verdict | **NOT IMPLEMENTED** trong9E-1; schemas/fixtures không chứng nhận runtime capability |9E-3/4 và approved dependencies; no code execution/comparator/Judge semantics inferred from validators |
| Graded storage/history/full63×language release | **NOT IMPLEMENTED /UNVERIFIED** theo scope tương ứng |9E-5/6/7 và9G; current draft preservation không phải completed Accepted/Failed storage/history |

These are retained obligations, không tự chuyển UNVERIFIED thành PASS. Missing/
failing B1 measurements phải chặn9E-7/release sign-off; S5-AC1 chỉ đổi scope/timing
nghiệm thu Step5. Không hoãn thêm gate mới bằng report này.

## 6. Điểm chưa nhất quán và cách diễn giải

| Finding | Evidence /resolution | Có chặn nghiệm thu9E-1 trong scope đã duyệt? |
|---|---|---|
| Header/stop text của early Step reports nói các bước sau NOT_STARTED/pending | Review phát hiện status-pointer drift; user-approved closure đã đồng bộ current headers/pointers và label phần lịch sử, giữ chronology/test outcomes | Resolved về current status; historical snapshots không bị rewrite thành PASS |
| Requirements blanket performance NOT MEASURED; Architecture modules outside Steps1–3 PROPOSED | User-approved documentation closure sửa wording: current foundation modules/measurements đã có scoped evidence, missing target/installed/later implementation vẫn chưa certified | Resolved editorial inconsistency; không đổi contracts/thresholds hoặc mở rộng PASS |
| ADR L2/L10 full5 assets vs current4 public assets | S4-D1 explicitly approves versioned public-only4-asset/official:null, full5 giữ fail-closed; S4-D2 authorizes public acquisition ownership. L1–L12 numeric ceilings giữ nguyên | Không conflict. Không coi public staging hoặc historical empty bootstrap là full official package |
| Step5 Section14 BLOCKED vs Section15 COMPLETE | S5-AC1 explicit scope amendment supersedes the earlier blocking assessment; original FAIL/UNVERIFIED evidence không bị rewrite | Không conflict hiện hành; B1 gates chuyển mandatory9E-7/release, không bị bỏ |
| All Steps complete nhưng phase từng IN_PROGRESS | Trước approval cần separate overall acceptance; nay người dùng đã nghiệm thu explicit theo9E1-AC1 | Resolved: Phase9E-1 COMPLETE — PASS WITH LIMITATIONS;9E-2 vẫn NOT_STARTED |
| Missing older9D.2 report files/broken legacy links |7 preexisting deletions còn trong working tree, được Steps1–5 ghi nhận. Không phục dựng evidence hoặc claim đã audit mọi historical Runtime test từ chúng;9E-1 uses its own available accepted test/smoke artifacts and inherited9D limits | Traceability limitation được ghi rõ; không bằng chứng về foundation defect. Không biến nó thành full9D/release recertification |

Không tìm thấy unresolved **normative** conflict giữa L1–L12/S2/S3/S4/S5-P2 và
S5-AC1 hoặc confirmed production-foundation blocker từ evidence được review.
Editorial drift ở trên được báo cáo, không âm thầm chỉnh authority. Nếu người
dùng muốn phạm vi full-matrix/release PASS thay scope S5-AC1, evidence hiện tại
không đủ; kết luận READY của report này không áp dụng cho yêu cầu rộng hơn đó.

## 7. Audit thực hiện trong lượt này

Tái dùng helper read-only `node out/step5-final-acceptance-audit.cjs` để audit
file/hash/artifact; đây **không** chạy application, tests, build hoặc profiling.
Result: `out/step5-final-acceptance-audit.json`, zero audit errors.

- 7 recorded O1 source/build hash comparisons và6 recorded Runtime/limits/Main
  build comparisons đều khớp current files; hash sets có scope cụ thể, không phải
  all-file hash audit của dirty tree hay mọi renderer/platform input.
- Current emitted manifest khớp compiled anchor;252 public asset lengths/SHA-256
  khớp,63 packages/253 files/199,357 bytes và production fingerprint
  `d10031a590c3e32b1b89437dab882a4e23b44296c06505ff43c573641129c0be`
  khớp accepted O1 evidence. Đây là byte-integrity corroboration, không thay
  structural validator hoặc independently prove sample Expected mathematics.
- 4 plain loader artifacts, cited C#/JS/editor/R1 smoke evidence, full-app indexes
  và prototype summary còn hiện hữu. Current sources/build/data không tạo lý do
  rerun profiling hoặc targeted tests vừa được nghiệm thu. Earlier Step test
  counts được trích từ reports, không claim đã tìm raw logs cho mọi run.
- Không prototype activation/import references trong production `src/main`,
  `src/preload`, `src/shared`, `out/main`; protected Runtime/native Git diff empty.
  Không dùng candidate results để thay sequential production SDK evidence.

**Tests/smokes/typecheck/lint/build/profiling: NOT RUN trong lượt này.** Quality
evidence của Steps1–5 giữ nguyên scope/historical failures/skips; không có full
suite/full lint claim. Document/diff checks **PASS**: không trailing whitespace,
có final newline, fences balanced và11 relative link targets tồn tại.
`git diff --check` PASS (existing LF/CRLF notices only); report mới được kiểm tra
riêng vì untracked files không nằm trong diff. Không sửa missing legacy evidence.

## 8. Historical final acceptance recommendation — trước user approval

**READY FOR ACCEPTANCE — Exercise Package Foundation, với inherited limitations
và Step5 Current Host Only theo S5-AC1.**

Không còn blocker thuộc scope9E-1 sau approved decisions/accepted Steps1–5.
Foundation sẵn sàng làm tiền đề cho9E-2 **sau** người dùng nghiệm thu tổng thể và
cấp authorization mới. Không có new technical decision cần waive để chấp nhận
foundation hiện tại; đề nghị acceptance không thay đổi các deferred gates.

Ở lượt review ban đầu, Phase9E-1 được giữ IN_PROGRESS chờ người dùng. Đó là
historical boundary, được supersede bởi formal approval trong Section9; không
production/Runtime/contracts/security changes hoặc tự author Official Tests.

## 9. Official Phase9E-1 closure

**Phase 9E-1: COMPLETE — PASS WITH LIMITATIONS**, user accepted2026-10-24.
Acceptance record **9E1-AC1**, dựa trên report này và approved S5-AC1.
Steps1–4 COMPLETE — PASS WITH LIMITATIONS; Step5 COMPLETE — PASS WITH LIMITATIONS
(Current Host Only). Các foundation gates/evidence đã review được nghiệm thu
trong đúng scope;438/468/500/703 và244+444 counts giữ nguyên từng run/overlap,
không cộng thành full-suite result. Historical FAILs và measurements không đổi.

**Release obligations giữ nguyên Section5:** hai reference hosts B1a/B1b vẫn
UNVERIFIED, bắt buộc nghiệm thu trước9E-7/release certification, same4 loader
fixtures/workload/registered clone và thresholds/budgets/cleanup không đổi.
PREPARE_TIMEOUT cause/reliability, full-app attribution và filesystem/installed/
offline limitations tiếp tục thuộc Runtime/platform/integration/9G gates.
Không đổi UNVERIFIED thành PASS. SDK concurrency prototype **NOT PASS — excluded
from production**, tuyệt đối không đưa vào production.

**Điều kiện đầu vào9E-2:** foundation technical contracts, resource/build pipeline,
Registry/budgets/ownership, public migration/Run compatibility và overall9E-1
acceptance đã đáp ứng trong scope đã duyệt. L1–L12/S2/S3/S4/S5-P2 A/B2/C và
approved authoring/coverage policies là constraints tiếp tục áp dụng; không fake
official data, không source-level per-exercise Judge branches. Official Test Sets,
independent expected verification và data reproducibility là công việc9E-2 chưa
triển khai; runtime bridge/Judge/Submit thuộc các gói tiếp theo, không phải đã xong.
**Điều kiện còn thiếu để bắt đầu9E-2 là explicit user authorization.**

Closure này chỉ documentation/consistency/diff, không production, contracts,
security policies, deadlines/quotas/ceilings, Runtime/Policy B hoặc scheduling
changes. Không tests/build/profiling rerun, không commit/push/merge.
Closure document checks **PASS**:22 synchronized documents have no trailing
whitespace, final newlines and balanced fences;12 relative link targets in this
report exist, closure anchor headings and Plan COMPLETE/NOT_STARTED rows checked.
`git diff --check` PASS (existing LF/CRLF notices only). No fresh runtime evidence
or reference-host certification is inferred from these document checks.
**Phase9E lớn vẫn IN_PROGRESS;9E-2 NOT_STARTED. STOP chờ người dùng phê duyệt9E-2.**
