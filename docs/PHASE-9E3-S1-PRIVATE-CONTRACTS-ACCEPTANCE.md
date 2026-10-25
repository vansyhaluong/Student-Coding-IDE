# Phase 9E-3 / E3-S1 — Private Contracts Acceptance

2026-10-25. **PASS WITH LIMITATIONS — implementation delivered; awaiting user acceptance.**
Phase9E-2 **COMPLETE — PASS WITH LIMITATIONS**. Design, six-step plan and
E3-D1–D4 **APPROVED** by the user. Phase9E-3 **IN_PROGRESS — E3-S1**;
**E3-S2–S6 NOT_STARTED**. This report does not authorize the next step.

Authority: [approved design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md),
[step plan](PHASE-9E3-IMPLEMENTATION-PLAN.md), [decisions](DECISIONS.md),
[9E-2 frozen handoff](PHASE-9E2-FINAL-ACCEPTANCE.md).

## 1. Authorized scope and task-start findings

Only private contracts/lifetime seams and pure harness/JSON extraction were
authorized. The accepted9E-1 Registry/reader and9D public Runtime are reused.
E3-D1–D4 are approved architecture choices, not permission for S2–S6. No new
dependency, lifecycle, Registry/cache/ledger, native integration, service admission,
consumer hook wiring, Comparator/Judge/Verdict/Submit/storage/history was added.

The starting branch was `feature/phase-9a-learning-mode`. Its extensive existing
tracked/untracked changes (including resources, Registry foundation, service/UI
work and seven deleted9D.2 documents) were preserved. No reset, restore, commit,
push, merge, Git configuration or .gitattributes change occurred. Public Run
wrappers, IPC/DTOs, six types, deadlines, quotas, Policy B and security ownership
remain binding. No unresolved decision blocks the bounded S1 delivery.

## 2. Actual changes

| File | Actual S1 behavior |
|---|---|
| `src/main/services/learning/official-case-plan.ts` | Main-only trusted admitted-Prepare factory; existing full Registry acquisition; frozen identity binding, Judge-side borrowed case view, input-only language view, current-phase guards, accounted input representation and guarded release |
| `src/main/services/learning/runtime/execution-plan.ts` | Readonly six-type signature/input contract; independent Official1–128 count bound; indexed arity/type checks |
| `src/main/services/learning/runtime/official-execution-contracts.ts` | Private returned/harness/protocol/infrastructure/interruption observations, native facts, completion/disposition and synchronous CONTINUE/STOP consumer types only |
| `src/main/services/learning/runtime/csharp-harness.ts` | Signature-only pure generator plus existing public Exercise wrapper; generated harness body unchanged |
| `src/main/services/learning/runtime/javascript-harness.ts` | Pure signature/source JSON and input-request helpers, used by legacy wrappers; existing workspace/process behavior and child asset unchanged |
| `src/shared/contracts/execution-json.ts` | Existing strict JS JSON scanner extracted without changing bounds/semantics |
| `src/shared/contracts/javascript-execution-validation.ts` | Internal import of extracted scanner; same guards, detached data validation, v1 mapping and public error result |
| `tests/main/official-case-plan.test.ts` |17 controlled Registry/plan lifetime tests; real bounded reader with synthetic temporary datasets |
| `tests/contracts/official-execution-internal.test.ts` |10 input/signature/public compatibility/private boundary tests |
| `tests/contracts/execution-json.test.ts` |14 protocol extraction/boundary tests |

Documentation updated: this report, design/step plan, `DECISIONS.md`, overall
`IMPLEMENTATION-PLAN.md` and `CODEBASE-MAP.md`. The existing C#/JS prepared
execution contract files, adapters, compiler, orchestrators, Core, Registry,
reader, SDK/Node discovery, native Jobs, public contracts and composition were
not changed by S1. No Official execution port is claimed to exist.

## 3. Private plan, ownership and accounting

The factory takes the existing Registry, a Main-owned expected identity and a
trusted already-admitted operation context. It accepts no raw package, JSON,
filesystem path or Renderer request. It rejects non-Prepare/public capability
before calling Registry. It requires the same operation signal and current owner;
acquisition may not complete after the Core phase has advanced out of Prepare.
The production source of that trusted context is deliberately unwired until S4.

Identity binds exerciseId/packageVersion/testSetId/test-set version/signature
version+hash/Official hash/comparator identity. The one existing reader/validator
continues to own actual raw SHA checks, full schema, case IDs, signature hashes,
arity, types and public-prefix linkage. The plan does not introduce a second
integrity authority. Stale identity fields fail closed after acquiring a validated
lease, and the existing owner retains its release callback even on failed Prepare.

The language descriptor has exactly `signature`, `caseCount`, `inputAt(index)`.
Its signature has functionName/ordered parameters/returnType only. Expected,
visibility, case IDs, sample linkage, Judge metadata and package identities stay
outside that view. `caseAt(index)` is a separately guarded Main/Judge-side alias;
it is not passed to a harness. Frozen args alias the Registry tree. Borrowers
must finish use before owner release; readonly aliases are not revocable copies.

No full package or case inventory is cloned per adapter. Fixed descriptor/identity
headers are owner bookkeeping; payload trees remain the single accounted Registry
allocation. `representInput` registers the current v1 input request through the
existing cooperative lease representation mechanism with the existing512KiB
request ceiling; parsed-byte/node deltas increase while borrowed and return to
baseline after release. Raw/transient package work and retained tasks stay in
the existing Registry accounting. There is no new budget counter or ledger.
Runtime buffers/validator clones and aggregate actual-output accounting belong
to the S2–S4 consumers and are not certified by these input-only tests.

Each read/representation checks the **current** Core phase signal/deadline;
the original Prepare deadline/check closure is not reused. No timer is created
or reset. The existing operation owner retains every Registry task, including
cancellation/late failure. Release requires existing cleanup facts with
proof=VERIFIED, cleanupComplete, processClean, no pendingIo, and the owner's
existing canRelease predicate (execution/retained uses settled). HISTORY_UNVERIFIED
does not qualify. Registry itself continues to hold pins for derived work/borrows.
Owner loss, invalidation, cancellation, shutdown, signal replacement and expired
current deadlines revoke further reads. Controlled shutdown waits for pin release
and drains the existing ledger to zero. No private observation is published.

## 4. Harness and protocol compatibility

The C# legacy wrapper retains sample-count agreement and delegates to a pure
signature/count generator. The generated harness body, entry point and wire v1
are unchanged. JS retains draft/public validation, file identity/workspace steps,
source JSON ordering and public request/error mapping. New pure seams accept
Official17/21/128 counts without constructing a fake public Exercise. Public
`isExercise` continues to accept16 samples and reject17. Six-type tests cover
scalars, strings, both vector types and matrices; wrong arity/types/indexes fail.
All63 existing public signatures/source JSON/request shapes were checked in the
pure compatibility fixture, without executing student code.

The extracted JSON scanner retains strict UTF8/BOM handling, decoded duplicate-key
rejection, one-document grammar, depth12 and1MiB wire bounds. The existing JS
data-only clone/guards remain unchanged. These protocol bounds are not replaced
with package asset node caps. C# public JSON parsing/mapping remains untouched;
private C# parsing/evidence mapping is S2. No shared barrel export or IPC/Renderer
contract was added; source boundary assertions verify that the new plan/consumer
has no production ExerciseService caller. This is scoped source/contract evidence,
not a new production bundle or installed-host privacy certification.

Private observation types preserve RETURNED, USER_EXCEPTION, INVALID_RESULT,
protocol/infrastructure failure and interruption categories plus native facts.
Completion records compile/syntax attempt, prefix/suffix, driver disposition,
existing failure/end reason and Core cleanup facts. They supply no Comparator or
Judge verdict. The synchronous consumer type documents its required post-VERIFIED
call site; neither a consumer nor that call site is implemented in S1. Actual
evidence attribution, exit-code differences and bounded observation construction
must be verified at the authorized language integration steps.

## 5. Verification actually executed

Eight files were selected explicitly, with one Vitest worker:

```text
npx vitest run --maxWorkers=1
  tests/main/official-case-plan.test.ts
  tests/contracts/official-execution-internal.test.ts
  tests/contracts/execution-json.test.ts
  tests/contracts/csharp-execution.test.ts
  tests/contracts/javascript-execution.test.ts
  tests/main/csharp-harness.test.ts
  tests/main/javascript-harness.test.ts
  tests/main/exercise-package-registry.test.ts
```

Final evidence is **333 unique tests PASS /0 SKIP across8 files**:41 new tests
in the three new files plus292 existing affected tests in five files. This is
not a full-suite total. The initial eight-file run supplied the existing292 PASS;
after fixture correction and added lifetime coverage, only the three affected
new files were rerun (final41 PASS). Passing duplicate executions are counted once.

| Gate | Result / scope |
|---|---|
| Private plan/full capability/identity and current-phase guards | PASS — controlled contexts over real Registry/reader, synthetic17/21/128-case datasets confined to Temp |
| Cancellation, owner/generation invalidation, failed Prepare release handle, retained work, cleanup and shutdown accounting | PASS — controlled tests; zero parsed bytes/nodes/raw bytes after Registry stop |
| Six types, arity, order, public16 cap and harness/request compatibility | PASS — new tests plus affected existing C#/JS contract/harness tests |
| Strict protocol extraction/parity | PASS — duplicate escaped keys, UTF8, BOM, grammar/depth/size boundaries and existing JS contract tests |
| Existing Registry regression | PASS — only its existing unit test file; no native execution |
| Scoped typecheck | PASS — `npx tsc --noEmit -p out/e3-s1/tsconfig.json`; changed modules/tests and imported dependency closure, existing raw declarations |
| Targeted lint | PASS — `npx eslint` with the ten source/test paths in Section2 only |
| Scoped whitespace/document links | PASS — scoped `git diff --check` and checks of new-file whitespace/local report links; old historical missing links excluded explicitly |
| Public IPC/DTO and private publication boundary | PASS in source/contract scope; no public export or service composition edit |
| Native execution, real service admission/cleanup integration and post-barrier hook | UNVERIFIED — not implemented or executed in S1 |
| Official60s, real per-case2s feasibility, runtime memory/output headroom | UNVERIFIED / NOT MEASURED;12 performance models remain PENDING_RUNTIME |
| Production build, full suite/lint, runtime/UI smoke, profiling | NOT RUN — no changed build/emission boundary; intentionally outside S1 verification |

Ignored scaffolding: `out/e3-s1/tsconfig.json` and the one-off documentation writer.
No authoring/reference/generator data or test fixture was added to production
resources. No additional old-wave correctness campaign or package regeneration
was performed. Existing anchors and public/Official resources were not written.

## 6. Historical failures, limitations and missing-document audit

Preserved failures in this task:

- First sandbox attempt could not spawn any of the eight Vitest workers (EPERM),
  executed no tests and later timed out worker termination. The same scoped
  command was rerun outside the sandbox; this is not application Runtime evidence.
- First executable run:326 PASS/6 FAIL. All six failures were a new competing-owner
  fixture whose check deliberately threw before BUSY admission. Corrected the
  test fixture's competing check; production Registry semantics were unchanged.
  Later new-file runs40 PASS and final41 PASS are retained as separate runs.
- Targeted lint initially found one no-useless-escape in a new JSON test, corrected
  before the final targeted lint PASS. Scoped typecheck passed.
- A one-off documentation-writer invocation had a JavaScript quoting syntax
  error before execution; no documents were written by that failed invocation.
  Corrected writer then updated only the scoped documents. Some read-only probes
  for nonexistent helper/config filenames returned file-not-found; subsequent
  tracing used actual source paths. These are not hidden successful checks.
- An initial documentation QA header assertion was corrupted by PowerShell's
  stdin encoding of a Unicode dash. The file's UTF8 header was correct; the
  corrected escaped-Unicode assertion and final documentation checks passed.

Read-only historical-document classification, performed without restoration:

| Finding | Classification / impact |
|---|---|
| Seven `docs/PHASE-9D2-*.md` paths listed D at task start | Tracked files deleted in the working tree. Git history confirms the old9D.2 plan was added in6fa7130; no replacement path was found in the scoped docs inventory. Deletion intent/archives remain unknown. |
| Missing9E-2 authoring design and Pilot/Wave acceptance paths referenced by final handoff | Absent from current docs/index; the queried authoring-design/Wave-D paths have no entry in reachable local Git history. These are unavailable historical/untracked artifacts, not verified renames or recoverable tracked deletions. |
| Existing9E-1/9E-2 final acceptance,9E-2 plan and9E-3 design/plan | Present but untracked in the starting worktree; preserved and used as evidence, not newly recreated history. |
| Moved/renamed replacement or legacy path redirect | None identified in the scoped docs/name/history searches. This does not prove that an external archive does not exist. |

Existing requirements, architecture, decisions, language contract, approved9E-3
design/plan, final handoffs and actual source provide the mandatory S1 contract
basis. The missing history therefore does not block S1. No deleted historical
report was restored, recreated, overwritten or removed. Previously recorded
missing-link limitations remain; historical link availability is not PASS.

Retain the9E-2 accepted63 full/0 public-only,504 cases(126 public/378 hidden),
789/789 obligations,206/206 critical correctness and126/126 broader models,
manifest7/matching compiled anchor. No new data/runtime certification is inferred.
All12 performance models, Official60s UNVERIFIED, historical FAILs/SKIP (including
the inherited file-symlink limitation), LF/CRLF source-lineage risks and deferred
9E1-AC1/S5-AC1 platform/loader/reliability/installed gates remain unchanged.
Ordinary Git LF→CRLF notices remain; no resource normalization was performed.

## 7. Acceptance stop gate

**No new architecture deviation or decision required.** E3-S1 is delivered
**PASS WITH LIMITATIONS**, pending user acceptance. Public Run contracts remain
unchanged; controlled private ownership/lifetime contracts pass. Phase9E-3 remains
IN_PROGRESS; **E3-S2–S6 NOT_STARTED**.

Before S2: user accepts S1 and explicitly authorizes its scope. S2/S3 must still
prove actual input-source integration, C#/JS private protocol/evidence attribution,
native phase signals/deadlines, raw/aggregate output and derived-buffer accounting,
barriers and VERIFIED cleanup with real runtimes. S4 must prove the same service's
single operation slot, private admission/publication segregation and synchronous
post-VERIFIED hook. Performance gates/pilot/full63 review remain later gated work.
No Official execution, consumer/service wiring or later-step implementation was
started. **STOP and await user acceptance; no automatic E3-S2.**
