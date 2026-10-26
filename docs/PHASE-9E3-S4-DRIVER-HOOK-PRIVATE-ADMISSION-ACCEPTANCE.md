# Phase 9E-3 / E3-S4 — Driver Hook and Private Admission Acceptance

2026-10-25. **TASK REVIEW: PASS WITH LIMITATIONS.**
**E3-S4: REVIEW COMPLETED — AWAITING USER ACCEPTANCE** (tracking IN_PROGRESS).
Phase9E-3 remains IN_PROGRESS; E3-S5/S6 NOT_STARTED. Only S4 was authorized.

Authority: [approved design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md),
[step plan](PHASE-9E3-IMPLEMENTATION-PLAN.md), unchanged
[S1](PHASE-9E3-S1-PRIVATE-CONTRACTS-ACCEPTANCE.md),
[S2](PHASE-9E3-S2-CSHARP-OFFICIAL-RUNTIME-ACCEPTANCE.md) and
[S3](PHASE-9E3-S3-JAVASCRIPT-OFFICIAL-RUNTIME-ACCEPTANCE.md) acceptance evidence.
S1–S3 are user-accepted COMPLETE — PASS WITH LIMITATIONS; E3-D1–D4 APPROVED.

## 1. Task-start findings and actual scope

The starting branch was `feature/phase-9a-learning-mode`. The24 tracked/untracked
changes from S2/S3 and status closure were preserved. Only directly required
integration files and overlapping status documents were edited. Old acceptance
reports, historical failures, C#/JS compiler/harness/protocol evidence and frozen
data were not rewritten. No commit/push/merge, Git configuration, .gitattributes,
dependency installation or native rebuild occurred.

Goal: same-service Main-private admission, shared driver, synchronous post-VERIFIED
hook and private completion. Prerequisites were satisfied by accepted S1–S3 and
E3-D1–D4; no new decision gate was opened/resolved. Binding identity, Main-only
capabilities, owner/generation, current Core phase, raw budgets and Policy B were
binding constraints. Required gates were BUSY both ways, owner/deadline/hook/privacy,
retained cleanup and minimal native integration for both languages. S5/S6, Judge/
Comparator/Verdict/Submit/storage/history were out of scope and remain unimplemented.

| Actual source/test file changed | Responsibility/change |
|---|---|
| `src/main/services/learning/exercise-service.ts` | Common admission/active slot; internal RUN/OFFICIAL kind; trusted Main `runOfficial` capability; private completion, public route guards and existing managed cleanup |
| `src/main/services/learning/official-case-plan.ts` | New same-Core binding; deferred factory/acquire in Prepare; current phase/owner, captured identity, accounted lease release after cleanup |
| `src/main/services/learning/runtime/execution-driver.ts` | New shared fixed-language loop, exact Core claim, language barriers, guarded synchronous consumer and retained driver disposition |
| `src/main/services/learning/runtime/csharp-orchestrator.ts` | Existing Run wrapper delegates loop to shared driver; keeps progress/result/error behavior |
| `src/main/services/learning/runtime/javascript-orchestrator.ts` | Same for JS, retaining post-Prepare/post-syntax barriers |
| `src/main/services/learning/runtime/official-execution-contracts.ts` | Main-private adapter/evidence/factory/operation handle; `planAcquired` distinguishes failed acquisition from known exhaustion |
| `src/main/services/learning/runtime/csharp-execution-adapter.ts` | Borrowed settled private evidence for the service, including invalidated interruption/prefix; public/owner-guarded result behavior unchanged |
| `src/main/services/learning/runtime/javascript-execution-adapter.ts` | Equivalent private service evidence and cancelled-attempt accounting |
| `tests/main/official-runtime-driver.test.ts` |19 new controlled driver/hook/deadline/barrier tests |
| `tests/main/official-runtime-service.test.ts` |20 new service/Registry/IPC/owner/cleanup tests |
| `tests/main/official-runtime-service.integration.test.ts` |2 real native service integration tests, each exercising Official then public Run |
| `tests/main/csharp-execution-adapter.test.ts` | Direct cancellation evidence assertion for the new private service port |
| `tests/main/javascript-execution-adapter.test.ts` | Equivalent cancellation evidence assertion |
| `tests/contracts/official-execution-internal.test.ts` | Historical no-service-wiring assertion updated to the current no-Official-IPC boundary |

Documentation changed: this report, `PHASE-9E3-IMPLEMENTATION-PLAN.md`,
`PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`, `IMPLEMENTATION-PLAN.md`, `CODEBASE-MAP.md`
and `CHANGELOG-THESIS.md` (20 files in S4 scope). No public contract, IPC/Preload/
Renderer implementation, package-run binding, Core/session/limits/recovery, native,
SDK/Node discovery, language child/harness/compiler, Registry/reader, manifest7,
compiled anchor or frozen504 cases was changed by S4.

## 2. Service admission and binding architecture

`run` and `runOfficial` call one admission routine: same observed owner entry,
accepts/destroyed checks, startup/recovery/shutdown gate, global active operation,
generation, workspace/session/checkpoint and cleanup owner. BUSY is immediate;
there is no queue or implicit replacement. A new operation invalidates old public
references through the existing generation behavior. Official cannot be chosen
through a public request flag or catalogue fallback.

`runOfficial(owner, request, trustedIdentity, consumer)` returns a frozen Main-only
handle, containing a frozen reference and a completion function closed over that
exact operation. It is a capability, not a public reference lookup or second
result cache. Another owner/reference cannot redirect it to a different operation.
Owner entry replacement, invalidation, shutdown or a later generation makes its
completion INVALIDATED, never a late success. Prior bounded facts remain available
only to the original trusted Main capability; no Renderer document receives them.

The binding itself is the exact adapter passed to Core and claimed by the shared
driver. Construction performs no I/O/probe/acquire. Only the admitted Prepare
creates the language adapter and invokes its S1 plan loader. The package owner
uses the real service owner-entry object, admitted generation and active-operation
identity. The binding updates its captured context on every Core phase; later
input serialization uses that execute context, not a saved Prepare deadline.
Registry invalidation targets the same owner/generation on context loss/shutdown.

The existing Windows factory composes both Official language adapters with the
same supplied Registry and native loader used for Run. There is no second service,
Registry, process manager, operation slot, queue, cache or execution lifecycle.
No production Submit/Renderer caller was installed.

## 3. Shared driver, consumer and completion semantics

The shared loop claims orchestration once on the exact Core binding and preserves:

- C#: Prepare → Compile → VERIFIED barrier → each Execute → VERIFIED barrier.
- JS: Prepare/probe → VERIFIED barrier → Syntax → VERIFIED barrier → each
  Execute → VERIFIED barrier.

Run wrappers retain their detached public result mappings and language-specific
progress scheduling. Official has no public progress callback. Each case continues
to use the existing fresh process/artifact/runtime validation and original budgets.

The consumer runs only after a RETURNED observation and VERIFIED case barrier.
The driver checks current owner and the same operation deadline before/after
consumer preparation/call and before another launch. It borrows the bounded
observation/actual payload, freezing its header/process facts and typed arrays
without retaining another actual clone. CONTINUE advances; STOP records
CONSUMER_STOP with the exact untouched suffix and closes the same Core normally.
Even STOP on the last case is a consumer-stop disposition, not a Judge verdict.

Throw, invalid return, thenable or Promise is infrastructure. Native Promise
rejection is drained without awaiting it or introducing an asynchronous consumer
lifecycle; arbitrary then getters are not invoked. Error messages/returns are not
published. Deadline/owner checks still run on a throwing hook so it cannot hide
an elapsed trusted deadline. No continuation hook runs for compile/runtime/
protocol/interruption failure or a failed barrier.

Private completion records trusted bound identity, whether a plan/count was
acquired, compile/syntax evidence, attempted cases, exact suffix, typed failure,
driver disposition, actual Core end reason and cleanup snapshot. Hook failure
preserves the successful RETURNED row and remaining suffix, reports infrastructure
at cleanup, and never fabricates a FAILED case, Wrong Answer or Runtime Error.
Before acquisition succeeds, `planAcquired=false` and an empty unknown-count
prefix/suffix do not claim exhaustion.

A new borrowed language evidence port is necessary because the old result getters
correctly reject invalidated owners. It supplies the owning Main operation with
settled failure/interruption facts without relaxing those getters, publishing
private data or cloning the entire prefix per hook. Cancellation during a real
execute attempt is recorded privately as INTERRUPTED/CANCELLED with its process
facts and untouched suffix. Pending language work rejects evidence access rather
than inventing settlement. Completed language delegates/plans are dropped after
content release; captured bounded output facts remain with the Main handle.

## 4. Public Run compatibility and privacy isolation

Isolation is enforced before public observation/validation/publication:

- Official `observation` rejects; `publish` returns before any snapshot callback.
- Public `snapshot`, `completion` and `stopSession` reject Official references,
  including same-owner, other-owner and mismatched-generation references.
- Official does not populate public `last`; its admission clears stale last data.
- Public Run request shape/sample cap/error unions remain unchanged and reject
  an `official` flag. Existing IPC channels and Preload/Renderer APIs are unchanged.
- The language loader receives only signature/count/indexed args plus the accounted
  input capability. Expected/visibility/hidden IDs/Judge view remain in Main.

Controlled sentinel actual/console/diagnostic/code/identity tests cover service
poll/reply/event/error paths and actual existing IPC handlers. No private data
appears in onSnapshot, public last, IPC replies/events or safe errors. Existing
IPC/Preload regression tests pass. Native tests prove no public event during
Official and that subsequent public C#/JS Run still produces its normal snapshots
and two-sample actuals through the existing public Registry binding.

## 5. Ownership, budgets, retained cleanup and recovery

Core/native policies are unchanged: Prepare10s (JS probe512MiB), compile/syntax30s
/2GiB, execute2s/case/512MiB, operation60s, caller cleanup wait12s, aggregate raw
stdout+stderr1MiB and existing bounded result/failure reserves. The shared loop
adds operation checks, not clocks or phase budgets. Raw byte accounting, request
serialization and native quota attribution remain in the existing Runtime.

Every Registry task is attached to this operation's retained task set. Full
content release requires execution done, no Core resources, no retained tasks and
VERIFIED/complete cleanup. The existing registered current-input borrow is retained
through the case barrier or Core release; an unverified barrier cannot advance or
release the full lease. Case barriers are not final cleanup or a new allowance.

After a driver's close fails or its caller12s wait expires, Official service does
not immediately start a second12s wait. It retains the same Core task/active slot/
lease and reports truthful cleanup state for managed retry. No cases or hooks are
re-entered on retry. Checkpoint-pending completion has failure/pendingIo facts;
after successful retry, the original STOP can complete with VERIFIED cleanup.
Pending language work cannot be mistaken for a final attempted prefix.

Controlled delayed Registry handoff proves that owner invalidation cannot lose
the acquired pin or its eventual release callback. Query/barrier failure retains
the same input/full lease and active slot; restoring evidence permits normal retry.
HISTORY_UNVERIFIED remains quarantined/incomplete and admission remains closed;
it is never force-upgraded to VERIFIED. That sticky-history control uses a mocked
lease/zero-native adapter over an accounted test-data copy: it asserts no release
and no zero-ledger claim for the intentionally held mock operation. The separate
real test-data reservation is disposed only by the test fixture. Recoverable
controls and native runs stop the real Registry with zero parsed bytes/nodes/raw.

Startup recovery/admission, owner navigation/process loss/destruction, reused
numeric owner IDs, context invalidation, shutdown and managed retry continue on
the same service/Core paths. No new cleanup or recovery mechanism was introduced.

## 6. Verification actually executed

**221 unique tests PASS /0 final FAIL /0 SKIP across9 files:**
**219 controlled unit/contract +2 real native integration tests.** Counts are
unique within S4 and are not added to accepted S1/S2/S3 totals.

| Selection | Final unique PASS |
|---|---:|
| New `official-runtime-driver.test.ts` |19 |
| New `official-runtime-service.test.ts` |20 |
| Existing affected service/session/C#/JS adapter/IPC/private-contract files (six files) |180 |
| New `official-runtime-service.integration.test.ts` |2 |

Initial explicit command, one worker:

```text
npx vitest run --maxWorkers=1
  tests/main/official-runtime-driver.test.ts
  tests/main/official-runtime-service.test.ts
  tests/main/exercise-service.test.ts
  tests/main/exercise-session.test.ts
  tests/main/csharp-execution-adapter.test.ts
  tests/main/javascript-execution-adapter.test.ts
  tests/main/exercise-ipc.test.ts
  tests/contracts/official-execution-internal.test.ts
```

Initial212 PASS/2 FAIL; after fixture correction/new regressions only the two new
files reran37 PASS. After the actual Official12s/hook guard/cancellation change,
the five directly affected driver/service/existing-service/C#/JS adapter files
reran149 PASS. Adding the final Promise-hook completion assertion reran only
`official-runtime-service.test.ts`:20 PASS. The other files' previous PASS were
retained. These overlapping executions are not summed.

Native command:

```powershell
$env:LEARNING_OFFICIAL_SERVICE_LIVE='1'
npx vitest run --maxWorkers=1 tests/main/official-runtime-service.integration.test.ts
```

Initial2/2 PASS,14.21s; rerun after the service cleanup/hook guard change also
2/2 PASS,25.03s (22.61s test work). This suite runs four operations, not a single
25s operation or a pilot. No native/host-disabled SKIP occurred on this host.

| Quality gate | Actual result |
|---|---|
| Scoped TypeScript | PASS — `npx tsc --noEmit -p out/e3-s4/tsconfig.json`, changed modules/tests/imported closure/raw declarations |
| Targeted ESLint | PASS — fourteen changed source/test files; subsequently edited service test relinted alone |
| Scoped emission build | PASS — installed esbuild, service/driver/language composition with `.mjs=text` fixed-child loader to ignored `out/e3-s4/exercise-service.cjs` (239.9KiB); no native hooks |
| Whitespace/document QA | PASS — `git diff --check` plus explicit new-file/local report link/status/receipt checks |
| Public Run regression | PASS — affected existing suites and real C#/JS public service operations |
| Shared driver/private admission/privacy/cleanup | PASS in controlled and current-host native scopes stated above |

No full suite/repository lint, UI/Project/PTY/Monaco/drafts/Electron smoke, broad
benchmark/profile, old unrelated phase campaign, S5 pilot, full63×2 screen,
dependency install/upgrade, SDK concurrency prototype, native ABI rebuild or
repository production build was run. The private-contract source assertion needed
updating because no-service-wiring was true in S1 but S4 now supplies it; the
actual boundary remains no public export/Official IPC. Unrelated S1 plan/kernel/
Registry and S2/S3 protocol/harness/compiler suites were not rerun.

## 7. Native service evidence

Windows x64 `10.0.26200`, Node `v24.16.0`/ABI137; actual installed SDK10/Roslyn
and PATH-first Node24 selection through unchanged resolvers. The existing native
module loaded without rebuild. Tests redirect its module location for the source
test host only and forward real native methods; processes are not mocked.
The real Windows service factory, not a direct adapter driver, performs admission,
compiled-anchor Registry acquisition, shared orchestration/hook and cleanup.

Both tests use frozen Divide (`ch2-04`,7 Official cases), with deliberate STOP;
there is no fake public Exercise or generated/frozen-set modification. Expected
comparisons occur only in test-side Main assertions.

| Language | Official service operation | Subsequent public service Run |
|---|---|---|
| C# | One Prepare/compile;1 compile +1 execute Job; STOP after case0; exact6-case suffix; hook after compile/case VERIFIED barriers |1 compile +2 execute Jobs; normal public two-sample actuals and snapshots |
| JavaScript | One Prepare/probe +1 syntax +2 execute Jobs; CONTINUE then STOP at case1; exact5-case suffix; required probe/syntax/case barriers |1 probe +1 syntax +2 execute Jobs; normal public actuals/snapshots |

Thirteen actual Jobs across four operations have quota readback, unique roots,
settled prior-job/IO checks, retained ownership during hooks, exactly one release/
close per Job and signaled independently watched root identities. Busy Run and
second Official admission are checked inside the live hooks. Official refs cannot
query/stop through public service APIs. No snapshot event occurs during Official;
later public snapshots belong only to the new public operation.

Both Official and public final cleanups are VERIFIED/complete. The service stops
before the Registry, whose real shutdown ledger is zero. Private receipts are
under ignored `out/e3-s4/native/{csharp,javascript}.json`; they contain private
execution/cleanup facts, public parity, launches/quotas and ledger, not app resources
or Renderer data. This is native execution with controlled Main owner/consumer,
not an Electron/UI smoke or installed-app certification.

## 8. Historical failures, limitations and unverified work

- First shell launch was refused by the Windows restricted-token sandbox because
  it could not enforce split writable roots. Necessary scoped commands used
  explicit execution approval; no application policy changed.
- First executable unit selection:212 PASS/2 FAIL. Two new fixture calls passed a
  whole snapshot to the exact reference validator, instead of selecting
  `{sessionId,generation}`. Fixing those fixture references changed no production
  validation. Later targeted runs passed as recorded.
- First targeted lint found prefer-const for the operation captured by deferred
  binding closures. It was corrected; final typecheck/lint passed.
- Review found that rejoining close immediately after the Official driver's
  failed12s wait could give that caller a second wait. Official now retains the
  existing task for managed retry; the regression expires one12s wait and proves
  slot/pin retention and successful same-operation recovery. Public Core policy
  and legacy Run behavior were not changed.
- Native runs never failed or skipped. Repeated PASS is counted once. Existing
  LF-to-CRLF notices and historical S1–S3 failures/filtered SKIPs remain unchanged.
  No old acceptance report, missing historical document or resource was repaired.

Current-host S4 core gates pass. Native service proof is deliberately small and
STOP-based; full frozen-set exhaustion, eight-ID pilot and full63×2 are not S4
evidence. Hook-fault/owner-loss/12s/delayed-package/history/native-query scenarios
have controlled S4 coverage; this task did not run a full native failure matrix
for them. Native memory exhaustion, all six native types, counts above16 and
installed/offline/other Windows target/reliability coverage remain unverified
where inherited. No broad timing/memory/output headroom measurement was made.

All12 performance models remain PENDING_RUNTIME. General Official Runtime60s,
all63 runtime feasibility and release certification remain UNVERIFIED. No pending
model was reclassified from the small native bridge. Existing9E1-AC1/S5-AC1 and
broader host/loader/release limitations remain. Runtime9D's accepted process
boundary/authenticity limitations are unchanged; no new sandbox claim is made.

## 9. Decisions and acceptance stop gate

New decisions resolved: **NONE**. Architecture deviations: **NONE**.
Remaining current-host S4 implementation blockers: **NONE**. Private completion
and post-barrier synchronous consumer are execution plumbing, not a Comparator,
student verdict or storage eligibility decision. Future Judge/Expected joining
and all Submit/persistence/history functionality remain outside this delivery.

**E3-S4 REVIEW COMPLETED — AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS.
Public Run contracts/behavior and frozen data are preserved; Expected/Judge view
does not enter the language input/child, and Official actual/console/diagnostics
does not enter public snapshots, last result, IPC, Preload or Renderer.
**Ready to start S5: NO — user acceptance and explicit authorization required.
STOP. E3-S5/S6 remain NOT_STARTED; no next implementation was begun.**
