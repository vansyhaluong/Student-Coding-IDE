# Phase 9D.2 — JavaScript Learning Run architecture and implementation plan

Design approved by the user on 2026-10-22 following the
[survey](learning/audit.md). Step 1 was separately authorized on 2026-10-22;
Step 1 is `COMPLETE` — PASS WITH LIMITATIONS by user acceptance 2026-10-22.
Phase 9D.2 is `COMPLETE — PASS WITH LIMITATIONS` by final user acceptance
2026-10-23; 9D Common remains `IN_PROGRESS`, Phase 9E `NOT_STARTED`. Step 2 was separately authorized
2026-10-22 and accepted `COMPLETE` — PASS WITH LIMITATIONS on 2026-10-22.
Step 3 was separately authorized and accepted on 2026-10-22:
`COMPLETE — PASS WITH LIMITATIONS`. Step 4 is `COMPLETE` — PASS WITH LIMITATIONS by user acceptance 2026-10-23.
Step 5 is `COMPLETE` — PASS WITH LIMITATIONS by user acceptance 2026-10-23; Step 6 is `COMPLETE` — PASS WITH LIMITATIONS (authorized 2026-10-23). Steps 1–2 remain COMPLETE — PASS WITH LIMITATIONS.
The earlier planning update ran no tests/build/
benchmark/spike; implementation evidence is separate below. Authority: Requirement Section 21,
Architecture Section 6, ADR-025 and Implementation Plan Section 13.6.

## Scope and dependencies

Use the accepted 9D Common Core, native Job/pipe/lease adapter, ExerciseService,
validated Exercise IPC/Preload and Result Panel. 9D.1 is COMPLETE — PASS WITH
LIMITATIONS for installed-runtime Windows 11; Common remains IN_PROGRESS.
Reuse the existing behavior without reopening C# acceptance. Every step depends
on the preceding step's acceptance and explicit implementation authorization.
New module/test paths below are planned, not claims that files exist.

Run executes Main-catalogue samples from an immutable code/revision snapshot and
returns actuals. Custom cases, imports/CommonJS/ESM, npm, async/Promise support,
Judge/comparison, Submit, Accepted/Wrong Answer and persistence are excluded.
No Stop/Cancel UI. No changes to C# contracts/Run, Project Mode, Terminal,
ProcessManager, Project resolver/native implementation or Policy B. Node runtime
bundling, delivery/fallback decisions and clean-machine offline distribution
acceptance belong to 9G; 9D.2 uses preinstalled Node for development/testing only.

## Approved runtime and security architecture

Each sample runs a new Node.js process in a distinct Learning Windows Job using
a fixed trusted harness and a fresh `node:vm` context. Student source is data,
never interpolated into trusted harness control flow or evaluated in Main or
Renderer. The synchronous catalogue function accepts/returns only `int32`,
`boolean`, `string`, `int32[]`, `string[]`, `int32[][]`; matrices are rectangular
and int32 bounds apply without coercion. Syntax checking compiles the source
without executing top-level student statements; use the existing compile phase
for this check, without claiming JavaScript requires a C# compiler.

The vm context does not deliberately expose Node process/require/filesystem,
raw transport or host function/object references; move data across the boundary
as JSON, with console capture implemented inside the context. Serialize student
objects inside the child under the execute deadline. A context separation bug
must not execute student objects/getters inside Electron. This reduces ordinary
interference; it is not a security boundary against malicious code.

Windows Jobs provide owned process-tree containment, quotas and cleanup evidence,
not filesystem/network restrictions or reduced account privileges. Separate
workspaces, minimal environment and `node:vm` do not form an OS security sandbox.
The child runs with the user's OS rights; protection against deliberate host
access and absolute result-channel authenticity are not guaranteed. A compromised
child can forge protocol data; a nonce in that same child cannot fix this.
No Node Permission Model or new OS isolation mechanism is selected by this plan.
Requiring adversarial isolation later needs a separate decision and authorization.

### Resolver and Prepare probe

Learning owns resolution; never call the Project Mode resolver. Inspect absolute
Main PATH directories in order; choose the first candidate verified compatible
stable Node.js 24.x, with no patch lock, preview, other-major fallback, download
or installation. Never search CWD or execute a shell, `.cmd`, npm or renderer path.
Verify canonical executable identity, supported architecture and fixed probe
version/capabilities; a self-reported version alone is not executable trust proof.
Hold the verified selection for the operation and revalidate before launches;
do not silently rediscover or upgrade between cases.

Junction/nvm installations are eligible only if the canonical target, chain and
executable identity can be verified safely. Reject broken, cyclic, unsupported
or changed links/targets with a safe dependency/configuration failure. A target
switch during an operation must not silently select the new executable.

The probe runs only after Learning admission, in an owned Learning Job in Prepare,
with 512 MiB aggregate committed-memory quota set/read back before resume. All
candidate inspection/probes/workspace setup share the original 10 s Prepare due,
clamped to the original 60 s operation due. Candidate retries do not reset either.
Probe output is strictly validated and counts toward the existing output quota.
Every launched probe Job/I/O/identity is retained through normal Policy B cleanup;
verification before subsequent process launch includes probe settlement.

**Prepare mapping implemented in Step 2 (2026-10-22):** the Learning adapter now
accepts Prepare with 512 MiB and Core supplies it only for JavaScript Prepare;
C# retains null/non-process preparation. The fixed Main-only probe reuses native
launch and retained lifecycle primitives; no native redesign. Do not launch
outside the Job, disguise the probe as execute, reset Prepare, or change C#'s
non-process preparation behavior. No native redesign or Policy B change is
authorized; if existing primitives prove insufficient, stop affected work and
record the evidence before requesting a design amendment.

### Protocol, failures and results

Use one versioned JSON request on stdin followed by EOF and exactly one response
document on stdout. Main supplies caseIndex, argument values and catalogue schema;
the child cannot choose cases, expected output or schema. Validate strict UTF-8,
version, exact keys, duplicate keys/documents, case identity, shape/type, size and
depth bounds before accepting a result. Reject trailing non-whitespace, truncated
or malformed output. Captured console logs live in bounded response fields;
unframed stdout invalidates the protocol. Raw stdout/stderr bytes count before
decoding/redaction, across probe, syntax check and every case.

Step 1 must specify exact bounded JSON schemas, limits within the Common caps,
and outcome/exit consistency. Reject undefined, Promise/thenable, BigInt,
NaN/Infinity, cycles, sparse/invalid arrays, out-of-range integers, ragged matrices
and wrong return types without coercion or silent JSON loss. Distinguish:

- Syntax failure: source fails parse-only checking; no sample executes.
- Runtime failure: invocation throws or returns an unsupported/invalid value;
  emit a bounded semantic error, never a raw host stack/path.
- Protocol failure: malformed/missing/extra output, wrong version/index/schema or
  inconsistent process exit/response; never turn it into a successful actual.
- Missing/invalid Node, native/observer failures, timeout, output limit and proven
  Job memory-limit events remain distinct. V8 OOM alone is not Job quota proof.

Add independent JavaScript DTOs/validators and optional `javascript` observation
to existing Exercise snapshots/response composition. Preserve `csharp` and its
contract exactly. Reject mismatched language, simultaneous C#/JavaScript payloads,
foreign schema and stale session/generation/sequence/revision. Reuse existing
requests/channels and sender/frame/document-epoch ownership; grant no new command,
path or process authority. Validate full serialized snapshot size within current
transport bounds, including schema/diagnostic overhead; do not increase raw quotas.

### Orchestration and unchanged lifecycle

Prepare/probe → syntax check → sequential Main-catalogue samples → final cleanup.
Before another process/case begins, preserve the Core-owned VERIFIED execution
barrier for prior Jobs, observers and pending I/O. Fail fast with the attempted
prefix and exact ordered `notRunCaseIndices` suffix; syntax/Prepare failures leave
all samples unattempted. Fresh processes prevent ordinary cross-case global state.
Results are observations, never cleanup proof or Judge verdicts.

Keep Prepare 10 s; syntax/compile 30 s / 2 GiB; execute 2 s per case including
startup, invocation, serialization and I/O / 512 MiB; operation 60 s monotonic;
cleanup caller wait 12 s per attempt; combined stdout/stderr 1 MiB per operation;
one Learning operation globally, no queue. The approved probe mapping adds no
time or quota increase. Cancellation, owner invalidation, retained pending work,
barrier, cleanup/retry, checkpoint/lease recovery and quarantine use Policy B
unchanged. Unresolved ownership blocks replacement admission and final quit.

## Six implementation steps

### Step 1 — Contracts — `COMPLETE` — PASS WITH LIMITATIONS

Authorized/implemented and accepted by the user 2026-10-22. Standalone DTOs,
bounded strict JSON/Unicode/UTF-8 validators, failure mappings and type-only Main
ports are implemented without runtime/IPC integration. Targeted contracts:
308/308 PASS (172 JavaScript, 136 Common/C#); typecheck/build/targeted ESLint and
diff checks PASS. Full repository lint FAIL (1,106 existing spike/evidence errors),
accepted by the user as an out-of-scope Step 1 limitation; the lint gate itself
remains failed. Step 1 closure: COMPLETE — PASS WITH LIMITATIONS. No Node runtime
or actual JavaScript execution acceptance was claimed at Step 1 closure. Step 1
made Step 2 eligible, subject to explicit confirmation; Step 2 was subsequently
authorized and its current evidence/status follows below.
Full specification and
limitations: [Step 1 contracts](PHASE-9D2-JAVASCRIPT-CONTRACTS.md). Step 1 itself
performed no Step 2 work.

Scope: JavaScript result/schema/diagnostic/failure DTOs, strict harness request/
response schemas, validators and Main-only resolver/probe/harness/adapter ports.
Record exact failure-to-Common mappings, bounds, exit consistency and field
availability. No resolver, process, service composition, IPC or UI implementation.

Acceptance: declarations remain side-effect free; syntax/runtime/protocol failures
are distinct; all six types and exact attempted/not-run semantics are expressible;
no C# contract changes, expected/comparison verdict or privileged details.

Targeted tests (planned): `tests/contracts/javascript-execution.test.ts` for valid
types, int32 limits, malformed/duplicate/trailing/oversized/deep JSON, wrong index,
invalid returns and impossible outcomes. Reuse existing
`tests/contracts/exercise-validation.test.ts` and `csharp-execution.test.ts` for
Common/C# compatibility. Snapshot transport integration is deferred to Step 5.

### Step 2 — Resolver/Probe — `COMPLETE` — PASS WITH LIMITATIONS

Authorized/implemented and accepted by the user 2026-10-22 as COMPLETE — PASS WITH
LIMITATIONS. 169 tests PASS: 159 targeted unit/regression, 9 real Windows probe tests (10
Jobs) and one real C# Sum regression PASS; 21 other C# cases name-filtered.
Typecheck/build/targeted ESLint/diff checks PASS. All ten Learning Jobs cleanup
VERIFIED, handles closed and leases released; C# Prepare/Run and Policy B unchanged
within the verified scope. Installed Node v24.16.0 on Windows 11 x64 is test
evidence, not a patch pin. Windows 10/actual UNC, concurrent Project Run/PTY smoke
and student execution remain unverified; packaging/bundled Node belongs to 9G.
The user accepts these limits for moving to Step 3; they are not PASS claims. Full evidence,
initial fixture failure and boundaries: [Step 2 report](PHASE-9D2-NODE-RESOLVER-PROBE.md).
At Step 2 closure no Step 3 implementation was authorized; current Step 3 evidence
follows below. At that Step 2 closure, package/Common remained IN_PROGRESS;
the current 9D.2 final closure is recorded at the top and under Step 6.

Scope: Learning-only Node discovery, canonical file/target identity verification,
fixed capability probe and the narrow Prepare Job/quota mapping described above.
No student harness execution or production Run factory wiring.

Acceptance: first verified stable 24.x PATH selection, immutable per operation;
safe verified junction/nvm support; explicit missing/invalid results; every probe
owned, quota-read-back verified, cancelled/settled/cleaned within existing policy;
all resolution/probes share 10 s Prepare. Existing C# Prepare remains unchanged.

Targeted tests (planned): `tests/main/javascript-node-resolver.test.ts` and
`javascript-node-probe.integration.test.ts`; cover PATH order, missing/preview/
wrong major/architecture/capability, spaces/Unicode, broken/changing junctions,
executable replacement, quota/start/observer errors, delayed suspended launch,
cancellation, shared deadline, raw-output overflow and retained cleanup retry.
Select regressions in `exercise-session.test.ts`,
`windows-exercise-adapter.test.ts`, `windows-exercise-native.integration.test.ts`
and C# resolver/execution tests appropriate to the touched Learning mapping.

### Step 3 — Harness/Syntax — `COMPLETE` — PASS WITH LIMITATIONS

Separately authorized/implemented and accepted 2026-10-22: COMPLETE — PASS WITH
LIMITATIONS. Fixed raw child asset, exclusive identity/hash-verified source/
harness workspace, parse-only syntax checker and Main-internal sample-0 driver;
no multi-case or factory/IPC/UI wiring. 259/259 targeted tests PASS (27 unit/
lifecycle, 172 contract, 60 real native cases), 172 Jobs all VERIFIED/closed and
leases released on Windows 11 / Node v24.16.0 x64. Typecheck/build/targeted lint
and diff/new-file whitespace checks PASS; accepted Step 2 source hashes unchanged.
[Step 3 report](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md) records protocol,
console representation bounds, evidence and unverified Windows/packaging scope.
At Step 3 closure, Step 4 required separate authorization; its current evidence follows below.

Scope: contained exclusive workspace files, fixed trusted harness, vm context,
parse-only checker in the compile phase, strict JSON stdin/EOF and response parser.
No multi-case production driver or public wiring.

Acceptance: syntax check cannot execute top-level code; synchronous supplied
functions work for six types; no imports/npm/async API; context data and captured
logs stay bounded; invalid results/protocol never become actuals; source/harness
identity tampering is detected before launch. Student evaluation/serialization
stays in the owned child and within original deadlines.

Targeted tests (planned): `tests/main/javascript-harness.test.ts`,
`javascript-syntax.test.ts`, `javascript-harness.integration.test.ts`; cover each
type/empty array/rectangular matrix, Unicode, boundary int32, logs, source quoting,
top-level side-effect sentinel in syntax check, thrown errors, Promise/thenable,
invalid return values, serialization getters/cycles, missing function, malformed
UTF-8/JSON/exit, stdout contamination, quota overflow and tampered files.
Reuse native stdin/EOF and raw-byte accounting regressions where affected.

### Step 4 — Orchestrator — `COMPLETE` — PASS WITH LIMITATIONS

Separately authorized/implemented 2026-10-22; accepted COMPLETE — PASS WITH LIMITATIONS by the user on 2026-10-23. Main-internal adapter/driver reuse Steps 1–3 and unchanged Core:
Prepare/Syntax once, fresh sequential Node Jobs, VERIFIED barriers, exact fail-fast
prefix/suffix and retained final cleanup. 160 targeted tests PASS (18 new unit,
16 real JavaScript native, 125 Common/C# unit regressions, one real C# multi-case).
JavaScript: 57 Jobs all VERIFIED/closed, leases released on Windows 11 / installed
Node v24.16.0 x64. Typecheck/build/targeted ESLint/diff/whitespace PASS.
[Step 4 report](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md) records commands, evidence,
fault injection and remaining Windows/packaging/UI limits. Step 5 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 6 COMPLETE — PASS WITH LIMITATIONS.
The Step 4 evidence itself contains no production factory/IPC/UI wiring.

Scope: Main-internal JavaScript execution adapter and sample orchestrator over
one admitted ExerciseSession; prepare once, syntax once, fresh process/Job per
sample, VERIFIED barriers, fail-fast and final Policy B cleanup. No UI/IPC wiring.

Acceptance: attempted prefix/not-run suffix are exact; no globals leak across
cases; probe/syntax/case Jobs all contribute evidence; original operation deadline
and byte counter never reset. Pending barrier/I/O/cleanup retains ownership;
retry joins existing work without respawn. No C# orchestrator refactor required.

Targeted tests (implemented): `tests/main/javascript-execution-adapter.test.ts`,
`javascript-multicase.integration.test.ts`; cover successful cases, first/middle
failure, startup cost, loops, memory/output limits, cancellation at each phase/
barrier, descendant observation, EOF/pending writes, HISTORY_UNVERIFIED quarantine,
PROCESS_UNRESOLVED, cleanup timeout/retry, recovery and blocked re-admission.
Select existing Core/workspace/adapter and C# multi-case isolation regressions.

### Step 5 — UI/IPC — `COMPLETE` — PASS WITH LIMITATIONS

Authorized/implemented 2026-10-23; accepted COMPLETE — PASS WITH LIMITATIONS
by the user 2026-10-23 using the existing evidence without verification reruns. 172 distinct targeted tests PASS; typecheck/build/targeted ESLint PASS.
Controlled production Electron smoke on Windows 11 / installed Node v24.16.0:
three operations (samples, syntax, runtime), nine Jobs released/closed and VERIFIED
final cleanup; Result Panel tabs show real observations. Renderer console `get`
errors remain unisolated despite successful source/Run/UI checks. Full evidence,
file list, failed fixture attempts and limits:
[Step 5 report](PHASE-9D2-JAVASCRIPT-UI-IPC.md). Step 5 is COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23;
Step 6 is COMPLETE — PASS WITH LIMITATIONS by final user acceptance 2026-10-23.

Scope: additive JavaScript factory branch and independent optional snapshot
observation through existing Exercise IPC/Preload to the existing Result Panel.
Reuse established presentation; no redesign or new request/channel authority.

Acceptance: Input/Actual/Expected, NOT_RUN and safe syntax/runtime/protocol errors
are correctly bound to displayed exercise/language/revision; no Passed/Failed
comparison, Accepted/Wrong Answer, persistence or Stop/Cancel controls. Submit
stays disabled. C# contract/rendering and Project/Terminal behavior stay intact.
Main, IPC, Preload and Renderer reject invalid or stale observations and preserve
newer events over older invokes/transport errors. Full envelope remains bounded.

Targeted tests (planned): JavaScript branches in `exercise-service.test.ts`,
`exercise-ipc.test.ts`, `tests/preload/exercise-bridge.test.ts`,
`tests/renderer/exercise-runtime.test.tsx` and planned
`tests/renderer/javascript-result-panel.test.tsx`; cover language/schema mismatch,
both observation fields, source revision, event/invoke races, ownership/frame/epoch,
unload cleanup, oversized envelope and safe diagnostics. Run selected existing
`csharp-result-panel.test.tsx` and Practice editor/draft regressions.

### Step 6 — Acceptance — `COMPLETE` — PASS WITH LIMITATIONS

Authorized and finally accepted by the user 2026-10-23: Step 6 and Phase 9D.2
**COMPLETE — PASS WITH LIMITATIONS**. Steps 1–5 retain that accepted status;
9D.1 remains COMPLETE — PASS WITH LIMITATIONS, Common IN_PROGRESS, 9E NOT_STARTED.
A01 is **FIXED — PASS**, accepted by the user on 2026-10-23: 32 targeted tests
PASS and real Windows 11 / Node 24.16.0 Electron reproduction PASS. Prepare timeout
now records TIMEOUT/prepare with NOT_RUN samples and VERIFIED cleanup; lifecycle
invalidation suppresses stale results. Typecheck, build, targeted ESLint and diff
checks PASS. Original FAIL evidence is retained. **A02 — Monaco Diagnostics:
FIXED — PASS**, accepted by the user on 2026-10-23: 23 targeted tests PASS,
real production JS/TS diagnostics without worker exceptions and UI JavaScript
Run [8,0]/VERIFIED cleanup PASS. Typecheck/build/targeted lint/diff checks PASS;
worker binder retained, each TypeScript worker grows about 115.1 KiB / 0.894%.
A01/A02 are no longer unfixed production blockers. Selected
regressions pass after a missing test-helper prerequisite was corrected, but
full lint remains FAIL (1,106 pre-existing errors). Windows 10/UNC/9G and other
named gaps remain UNVERIFIED. Matrices, all attempts, exact commands, root causes
and proposed changes: [Step 6 acceptance](PHASE-9D2-JAVASCRIPT-ACCEPTANCE.md).
Phase 9D.2 and Step 6 are COMPLETE — PASS WITH LIMITATIONS; Common remains IN_PROGRESS.
This A02 closure/final review updates documents only, without verification reruns.
[Final review matrix and user-accepted limitations](PHASE-9D2-JAVASCRIPT-FINAL-REVIEW.md).
All named limits retain FAIL/UNVERIFIED/unresolved status despite acceptance.
Stop for the user's next decision; Common, Windows 10 and 9G gates remain open.

Scope: real installed Node 24.x and production Electron Run through Main/IPC/
Preload/Result Panel on Windows 10 and 11; focused regression and quality gates.
No benchmark, spike rerun or bundled runtime work unless separately authorized.

Acceptance: demonstrate six types, syntax/runtime/protocol/dependency failures,
quotas/deadlines, lifecycle cancellation, stale rejection, Job/descendant/I/O
barriers, retained cleanup/recovery and Project Run/PTY isolation. Record actual
runtime patch/architecture as evidence, not a version pin. Offline testing must
use preinstalled Node with no download/npm/import requirement. Record each OS and
scenario independently; an untested OS is unverified, never inferred PASS.
Package closure requires this evidence or explicit user acceptance of named
limitations; it cannot silently close Common, Windows 10 or 9G gates.

Targeted tests: the six-step JavaScript suites plus selected Common, C#, IPC,
Preload, renderer and native regressions; real Electron lifecycle/isolation cases
under a separate test-only acceptance fixture, never a production debug endpoint.
On future implementation, run documented `npm test -- <selected files>`,
`npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check`.
Passing compilation alone does not satisfy acceptance. Report exact commands,
evidence, skips/failures and remaining limitations; no test result is claimed here.

## Windows verification and remaining issues

Pending evidence on **both Windows 10 and Windows 11**: native Electron ABI/Job
availability; PATH order/case/drive handling, spaces/Unicode and supported UNC
behavior; compatible architecture; verified nvm/junction chains and switching;
replacement races/locked files/antivirus launch delays; quota read-back and actual
Job event vs V8 OOM; descendant handles, pipe/EOF/cancellation settlement;
barrier, cleanup retry, quarantine, crash recovery and shutdown; live Project
Run/PTY isolation. Unsupported runtime/path configurations must fail safely.

The survey's architecture choices are resolved by user approval. Step 1 records
exact bounded JS protocol/taxonomy declarations and targeted validation evidence.
Step 1 was accepted COMPLETE — PASS WITH LIMITATIONS on 2026-10-22.
Step 2 implements the Prepare probe quota/context port with observed Windows 11
evidence, accepted COMPLETE — PASS WITH LIMITATIONS on 2026-10-22.
Step 3 now verifies Main-internal single-sample harness/syntax execution on Windows
11, accepted COMPLETE — PASS WITH LIMITATIONS on 2026-10-22. Step 4 verifies
Main-internal multi-case execution on Windows 11, accepted COMPLETE — PASS WITH LIMITATIONS 2026-10-23.
Historical remaining work was response-envelope validation (Step 5) and supported-
Windows verification (Step 6). Both steps are now accepted COMPLETE — PASS WITH
LIMITATIONS; actual Windows 10/UNC and other named gaps remain UNVERIFIED.
No technical contradiction
is resolved by relaxing Policy B, budgets or C# contracts. If verification requires
such a change, stop affected implementation for recorded change control.
