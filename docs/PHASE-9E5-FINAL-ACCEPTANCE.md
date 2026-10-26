# Phase 9E-5 — S6 Safe Public Submit Transport & Final Review

2026-10-26. User formally accepts **E5-S6 and Phase 9E-5: COMPLETE — PASS WITH
LIMITATIONS**. **E5-S1–S6 COMPLETE — PASS WITH LIMITATIONS; E6/E7 NOT_STARTED.**
This final acceptance supersedes delivery-time pending statuses. Original evidence,
historical failures/corrections and limitations remain unchanged; acceptance does
not certify end-to-end production or release readiness.

## 1. Authorization, task-start review and S5 closure

User formally accepts [S5 COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md):
35 integration PASS,96 focused regression PASS/1 filtered exclusion and scoped
typecheck/lint/diff PASS. Immutable capture, commit-time guard, same-operation
hold-through-commit and shutdown/retry are accepted within their recorded scope.
Historical results/failures/limitations remain unchanged; S6 does not rerun the
full S5 campaign or unrelated earlier tests.

| Task-start item | S6 boundary |
|---|---|
| Authorized package | E5-S6 only under approved E5-D1–D6/design/plan/policies and accepted S1–S5 |
| Goal | Shared safe contracts, existing Main ExerciseIpcService routing, preload capability/order/lifetime, committed read projections and final evidence review |
| Out of scope | E6/E7, Submit/History/Restore UI, PracticeWorkspace; new lifecycle/queue/storage authority; Judge/Runtime/Core/native/Official/schema/storage policy changes |
| Decision gates | E5-D1–D6 approved; no new ADR or reopened policy; S6/whole-phase acceptance and separate E6 authorization remain required |
| Security | Current app main frame/sender, observed owner, service context stamp, exact Main-issued Submit ref and live S5 handle; narrow fixed channels only |
| Verification | New contracts/Main/preload tests, direct Run transport and focused S5 status regressions, scoped tsc/lint/diff only; synthetic temporary data and controlled adapters |
| Working tree | Existing modified/untracked S1–S5 source/docs/tests preserved; no overwrite of unrelated decisions/history, commit/push/merge, user-data read or artifact restoration |

## 2. Files and actual public transport

| File | Actual responsibility |
|---|---|
| `src/shared/contracts/submission.ts` | Pure safe Submit/ref/status/count/storage/read/context/API vocabulary, channel constants and approved transport budgets |
| `src/shared/contracts/submission-validation.ts` | Exact own-data allowlists, well-formed source, identity/enums/counters/consistency, UTF-8 encoded response/row/chunk/cursor bounds; no Main/Judge types |
| `src/shared/contracts/index.ts`, `learning.ts` | Additive public exports and `LearningApi.submission`; existing ExerciseApi remains four Run methods |
| `src/main/services/learning/submission-projection.ts` | Explicit safe status/committed-read projections; process-local authenticated encrypted source/cursor identities, private source binding verification |
| `src/main/ipc/exercise-ipc-service.ts` | Existing coordinator registers Submit/status/current/retry/history/completion/source/context handlers, exact owner/frame/epoch/ref checks, safe errors and monotonic status events |
| `src/main/services/learning/exercise-service.ts` | Read-only Main context-stamp seam and coarse final aggregate counts for transport; S5 admission/guard/transaction/cleanup semantics unchanged |
| `src/main/index.ts` | Reuse managed store getter and existing main-frame authorizer; wire fixed Submit changed event to the authorized frame |
| `src/preload/bridge/submission.ts` | Narrow semantic Submit/read/context API, local validation, safe response/error handling, bounded pre-ACK event buffer, listener/unload cleanup and no replay |
| `src/preload/bridge/learning-order.ts` | Shared Run/Submit transport generation/context floor only, no execution/admission authority |
| `src/preload/bridge/exercise.ts`, `learning.ts` | Compose separate Submit capability with shared ordering; Run's four methods/channels/payload semantics unchanged |
| `tests/contracts/submission.test.ts`, `tests/main/submission-ipc.test.ts`, `tests/preload/submission-bridge.test.ts` | New targeted contract/authorization/projection/ordering/lifetime tests, including controlled real-service-to-committed-read lost-ACK flow |
| `tests/fixtures/learning/submission-transport.ts` | Synthetic safe transport fixtures only |
| S5 packet, this packet, E5 design/plan, master plan, Codebase Map, thesis changelog | Formal S5 acceptance/current S6 review/whole-phase handoff and preserved limitations |

There is no change to Judge/reducer/comparator, Runtime/Core/Registry, Official
assets/native binary, S1–S4 storage sources/schema/policies or user data. No new
dependency, managed coordinator, operation queue or public generic IPC/fs/process API.
The separate `learning.submission` namespace preserves sample-only `learning.exercise`
while fulfilling D6 through the existing Main ExerciseIpcService and API composition.

## 3. Public contract and data flow

`learning.submission` provides:

- `submit({exerciseId, language, code, sourceRevision})`: exact four fields only,
  preserving well-formed exact source. Main/S5 still issue identity, bind current
  Official plan in owned Prepare, run Judge and own commit authority.
- `status(reference)`, `retry(reference)`, `current()`: reference is Main-issued
  sessionId/generation/submissionId. Status observes only that retained S5 handle;
  retry joins its runtime/storage settlement and never invokes a fresh Submit.
  Current discovers this owner's same-frame/context Main reference after lost ACK,
  rather than replaying admission. No current route returns null, not a revived grade.
- `history`, `completion`, `source`: use only S4 verified committed reads. Completion
  never comes from provisional Judge/Renderer state. Partial availability, null
  total, UNKNOWN and POSSIBLE_DATA_LOSS remain explicit; no repair or temp promotion.
- `context({reason: CONTEXT_CHANGED | LEARNING_LEFT})`: existing owner-only
  invalidation notification. It reaches the active Submit without giving public
  Run stop/snapshot access to Official results. There is no new Stop/Cancel UI.
- `onChanged`: validated detached coarse status events with a per-reference sequence.

Public status contains reference, exercise/language/revision, stage, verdict,
optional final **aggregate** total/attempted/passed counts (bounded by128) and storage
not-requested/pending/saved/failed/unknown. Only saved includes a committed record
key; unknown explicitly carries recoveryPending. Not-requested remains distinct
from fabricated failed saves. Storage-close retention can still show saved plus
STORAGE stage; completion must be queried from committed Accepted availability.

Submit errors are deliberately **not auto-retryable**, including lost transport
ACK, because the operation may already exist. The bridge invokes Submit once and
never resends it. Current/status/retry/history are the recovery tools; an intentional
later user Submit is a new operation/identity under S5, not an automatic retry.

The controlled end-to-end test uses actual ExerciseService/Judge/Registry/Core
coordination and S3/S4 temporary storage with an input-only fake language/process
adapter and simulated native lease. It drops Submit ACK after Main admission,
discovers the same ref with current, retries only that ref and observes exactly
one committed Accepted record plus COMPLETED, without student/native execution.

## 4. Authorization, context and privacy evidence

All new handlers use the existing IpcHandlerRegistry and current app main-frame
authorizer. Main checks observed owner identity, sender ID/frame process+token,
detached/destroyed state and a private service stamp (owner-entry alias/documentEpoch).
Every awaited reply rechecks the original stamp; navigation, same-token context
change, owner loss/replacement and direct service invalidation retire old replies.
An authorized replacement frame invalidates old operation/routing context even
when a navigation notification is missing. Stale old-owner listeners cannot delete
or invalidate a new owner entry with the same numeric ID.

Submit observation/retry additionally requires the exact current route, frame,
Main-issued three-field ref and live S5 handle status. That status rechecks the
service generation/owner/epoch, including idle receipts. Cross-owner/forged/stale
refs and Official refs on Run routes are refused. Status APIs cannot supply code,
verdict, plan, Expected, cleanup, paths or storage authority, and cannot resurrect
a historical JudgeResult. Context notification invalidates only the sender's owner.

Main builds explicit safe objects, then validates public shape/consistency/bounds.
Preload independently validates again. No Expected, hidden cases/private indices,
actual values, raw diagnostics/stdout/stderr, JudgeResult, cleanup receipt, plan
hash/identity, raw source hash, native/process handle/path, raw error or payloadDigest
is included. DomainError messages/details can contain private data, so Main and
preload both replace them with coarse errors. User source itself is returned exactly
only by the authorized committed source-read API; it is not sanitized as Judge data.

S4's private source hash/revision/key binding remains in Main. Public history rows
contain opaque source references instead. Process-local AES-GCM envelopes bind
source identity or private cursor to owner/context scope and distinct purpose.
They are read identities, **not commit authority**, a persisted index or a new
operation lifecycle. Ciphertexts do not expose private hashes as base64 JSON.
Wrong owner/context/purpose/tampering fails before read dispatch; S4 revalidates
record/hash/offset and Main checks the exact returned source binding before projection.

Cursor still binds S4 filter and both store generations/checksums/availability;
the public opaque wrapper adds owner/context scope. Data/filter/availability changes
produce S4 STALE_CURSOR, not a silently continued page. Process/context changes
invalidate opaque bindings; clients obtain fresh pages/source references.

## 5. Bounds, ordering and lifetime

- Default32/max100 rows,1KiB per summary,256KiB **including AppResult envelope**,
 512byte cursors and32KiB raw UTF-8 source chunks are enforced in Main and preload.
 Public source references are also capped512bytes. Tests measure encrypted row/
 cursor sizes and worst-case32KiB NUL JSON escaping without truncation.
- Exact source offset/reference correlation, raw UTF-8 byte delta/eof/progress,
  requested limit and immutable Main binding are checked. No internal hash is
  accepted from Renderer. History replies must match requested scope/filters/page
  size and cannot claim complete selected coverage over unreadable/recovered stores.
- One global Submit route/current status and one newest pre-ACK DTO buffer are
  retained, with no event history or polling queue. Main sequences advance only
  when safe status changes; completion/current/status/retry observations publish
  only ordered changes to that exact route/frame/epoch.
- A shared preload generation/context gate prevents late Run and Submit replies/
  events from reviving the other mode's older generation. Unproven pre-ACK events
  cannot establish identity. Main-issued admission/current response must bind the
  ref first. Old sequences, foreign context and stale snapshots are rejected.
- Listener data and invoke values are detached; consumers are isolated. One IPC
  listener serves subscriptions, last unsubscribe removes it, unload removes all
  listeners/buffers and rejects late ACKs. Main stop seals routes/removes handlers/
  owner listeners; owned service/storage I/O continues under existing S5/S4 owners.

Events are observed transition notifications, not a guaranteed autonomous stream
of every I/O change. If original I/O settles after the service caller wait has
already ended, clients use status/retry polling on the same reference to observe
the later outcome. No Main timer/poller/new lifecycle or automatic Submit replay
was added to manufacture a push stream.

## 6. Executed S6 checks and direct regressions

| Check | Actual final result |
|---|---|
| `tests/contracts/submission.test.ts` | **17 PASS /0 FAIL /0 SKIP** |
| `tests/main/submission-ipc.test.ts` | **15 PASS /0 FAIL /0 SKIP** |
| `tests/preload/submission-bridge.test.ts` | **10 PASS /0 FAIL /0 SKIP** |
| New S6 total | **42 PASS /0 FAIL /0 SKIP** |
| Direct `exercise-ipc.test.ts` + `exercise-bridge.test.ts` | **24 PASS /0 FAIL /0 SKIP**; public Run compatibility/frame/cancellation/order |
| Focused S5 private status/projection compatibility | **5 PASS /0 FAIL**,30 S5 cases filtered out, not executed/native skips |
| Scoped TypeScript | PASS: `node node_modules/typescript/bin/tsc --noEmit -p out/e5-s6/tsconfig.json` |
| Targeted ESLint | PASS: only changed S6 source/seams and new test/fixture files |
| Scoped tracked/new-file `git diff --check` | PASS; explicit changed tracked paths and untracked files checked with `--no-index --check`; only Git LF→CRLF notices |

Tests use installed Vitest with `run --maxWorkers=1`:

- `tests/contracts/submission.test.ts tests/main/submission-ipc.test.ts tests/preload/submission-bridge.test.ts --reporter=default --reporter=json --outputFile=out/e5-s6/targeted-results.json`
- `tests/main/exercise-ipc.test.ts tests/preload/exercise-bridge.test.ts --reporter=default --reporter=json --outputFile=out/e5-s6/run-regressions.json`
- `tests/main/submission-service.test.ts -t 'commits eligible|keeps runJudge evidence-only|Submit refs remain|owner loss after dispatch' --reporter=default --reporter=json --outputFile=out/e5-s6/service-regressions.json`

Ignored `out/e5-s6/` holds scoped config/JSON receipts, not production artifacts.
The scoped config selects changed entry modules/tests and existing raw/virtual
declarations plus imported Main/preload closure. No broad project check/build,
native Judge/Runtime/lease/Job, UI smoke, benchmark or unrelated phase tests.
Temporary storage and synthetic source are used; one controlled Registry fixture
reads existing checked-in anchored package data without modifying/reaccepting assets.

Initial S6 run38 PASS and direct Run24 PASS; initial lint had2 unused fixture
parameters, corrected by a typed zero-parameter mock implementation. Typecheck
passed. Review strengthened stale owner-listener identity checks, late-null-current
handling, private source-return correlation, requested history coverage/filter/
limit checks, listener isolation, Submit non-auto-retryability and consistent
current/status/retry publication. Expanded runs41 PASS; final review adds the
managed-store initialization failure case, reusing S4's unavailable view for UNKNOWN
completion/partial history/unavailable source rather than a false empty store.
Final42 PASS; final scoped checks
ran after source changes. No S6 functional test failure was hidden. Repeated38/41
and24 results are not additive; S5's five cases are focused regressions, not new S6
tests or a rerun of its35-case campaign. Historical earlier failures remain below
and in the linked step packets.

## 7. S1–S6 consolidated acceptance trace

| Step | User / tracking status | Evidence retained at its original scope |
|---|---|---|
| [S1 records/contracts](PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md) | COMPLETE — PASS WITH LIMITATIONS, accepted |81 synthetic PASS/scoped checks; pure schema/source/hash/encoding/lineage/budgets, no authority/durability |
| [S2 checked files/lease](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md) | COMPLETE — PASS WITH LIMITATIONS, accepted |29 targeted PASS/0 FAIL/0 SKIP at S2, real Windows cross-process native lease subset/fingerprint and scoped checks; not general native certification |
| [S3 transaction/recovery](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md) | COMPLETE — PASS WITH LIMITATIONS, accepted |40 new PASS +28 S2 regression PASS/1 native live SKIP/scoped checks; controlled one-target commit/idempotency/unknown/backup/recovery, not power-loss proof |
| [S4 committed reads](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md) | COMPLETE — PASS WITH LIMITATIONS, accepted |72 new PASS +3 focused regression PASS/scoped checks; partial history, bounded cursors/source and Accepted-derived completion |
| [S5 same-operation integration](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md) | COMPLETE — PASS WITH LIMITATIONS, accepted |35 new PASS +96 direct regression PASS/1 filtered/scoped checks; immutable current-plan capture/live guard/retention/shutdown, controlled adapters only |
| S6 transport / this packet | COMPLETE — PASS WITH LIMITATIONS, formally user accepted |42 new PASS +29 direct regression PASS/30 filtered/scoped checks; safe public API and controlled full data flow |

These are step-local/overlapping results across evolving source and scoped hosts,
not one combined current-artifact run. Do not inflate totals by summing repeated
regressions or turn the historical S2 binary fingerprint into S6 provenance.

Approved trace: D1→immutable validated records; D2→checked fixed-root files/shared
lease; D3→one-target retained transaction/recovery; D4→committed reads/completion;
D5→same-operation live guard/cleanup; D6→safe transport/final packet. No accepted
ADR/policy was reopened or silently changed. No independent completion/index,
grade-from-temp/checkpoint, second operation queue or raw Official public result.

Historical corrections remain authoritative: S2's initial lint/stale-token fix;
S3's scoped wait typing/recovery/resource review; S4's narrowing/import and read
ownership/Failed-I/O separation; S5's initial fixture assertions and five real
introduced cancellation/coalesced-close regressions corrected in ExerciseService,
with Runtime/existing tests unchanged. Their original FAIL/SKIP/exclusion/evidence
records are preserved, not replaced with this final PASS summary.

## 8. Limitations / UNVERIFIED

- This is source and controlled-test acceptance evidence. Actual Electron app/
  current preload bundle/frame destruction timings, installed/offline/packaging,
  target Windows10/11/UNC/AV/ACL/reliability/release campaigns remain UNVERIFIED.
  No source build/native/current-artifact certification or updated native fingerprint.
- Native/Job/Runtime behavior is inherited only at its recorded scope. E4 remains
  COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope), current-artifact handoff
  NOT PASS and general current native/artifact/Official60s/release UNVERIFIED.
  Deferred loader B1a/B1b and earlier platform/installed gates remain unchanged.
- Storage power-loss/directory-sync/crash/AV durability and actual-host filesystem
  guarantees remain UNVERIFIED. S3 read-back/backup protocol is not universal
  power-loss proof. Node TOCTOU/cooperative lease/local-edit/anti-rollback limits
  remain; no repair/migration/prune or new persistence policy is introduced.
- Storage/Main responsiveness/long-session memory/API latency/p95/performance are
  NOT MEASURED. **12 performance models remain PENDING_RUNTIME.** Test durations
  are not benchmarks or real-host deadline/reliability evidence.
- Opaque read identities/cursors are process/context-scoped and must not be
  persisted as long-lived permissions. They expire on restart/context change;
  reload committed pages. Status refs never recreate a lost operation after restart.
- Late unresolved I/O requires same-ref status/retry observation; events do not
  replace polling or prove failure on timeout. Existing retained I/O/lease/slot
  may block reuse/shutdown until safe settlement; no forced release is added.
- Root public capability is implemented, but Submit/History/source/Restore UI and
  PracticeWorkspace integration are absent. No renderer-only completion, new UI
  workflow, native integration smoke or E6/E7 implementation was performed.

## 9. Dependencies handed to E6 — no authorization to start

1. S6 **and Phase9E-5** acceptance is received within the recorded limitations.
   Separate explicit E6 authorization is still required before implementation.
2. Consume `learning.submission` semantic API; preserve four-field Submit capture,
   Main ref ordering and the distinct verdict/storage/committed-completion states.
3. Never automatically replay Submit after missing ACK/error. Use current to learn
   a Main-issued ref, status/retry to join it, and committed history/completion to
   discover saved records after lost owner/restart. A deliberate later Submit is new.
4. Notify context/leave through the semantic context method; do not use public Run
   snapshot/stop to access Official Submit. Respect stale generation/context errors.
5. Render partial/UNKNOWN/POSSIBLE_DATA_LOSS/null totals explicitly. Refresh first
   page on STALE_CURSOR, preserve filters, and reload opaque refs on context/restart.
6. Read source by opaque ref/UTF-8 byte offsets/chunk bounds. E6 owns confirmed
   Restore through existing unsaved/draft replacement; S6 supplies read-only source.
7. E7 remains responsible for separately authorized finalized-artifact/native/
   target-host/reliability/release/performance verification and deferred gates.

## 10. Historical S6 delivery review and STOP

**TASK REVIEW: PASS within controlled S6 scope, with limitations; user acceptance
pending.** Decisions resolved/architecture deviations: NONE. No remaining blocker
for the tested transport; unexecuted native/host/release/durability/performance
conditions are UNVERIFIED, not silently passed.

**S1–S5 COMPLETE — PASS WITH LIMITATIONS. S6 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE. Phase9E-5 IN_PROGRESS — AWAITING FINAL ACCEPTANCE. E6/E7 NOT_STARTED.**
Ready to begin E6: **NO — await user phase acceptance and separate authorization**.
STOP. No automatic E6/E7 or commit/push/merge.

## 11. Official final acceptance — 2026-10-26

User formally accepts **Phase 9E-5 and E5-S1–S6: COMPLETE — PASS WITH LIMITATIONS**.
S6 evidence is retained at its original scope: **42 targeted tests PASS; 29 focused
regressions PASS; 30 S5 tests filtered, not counted as PASS**. Scoped typecheck,
lint and diff checks previously PASS. Safe Submit/Status/History/Completion/Source
transport is accepted; public Run is unchanged. No counts are aggregated across
steps or repeated campaigns.

This closure is documentation-only: consistency and document-scoped
`git diff --check` only; no tests, typecheck, lint, build, native, benchmark or smoke
rerun, production/test changes or user-data access. Earlier delivery statuses are
historical; all evidence and corrections remain intact.

E4 current-artifact handoff remains **NOT PASS**. Native/target-host/release
certification and storage durability remain **UNVERIFIED**; storage performance
remains uncertified/NOT MEASURED. **12 performance models remain PENDING_RUNTIME**.
Deferred loader B1a/B1b and all other recorded deferred verification gates remain
unchanged. This is not end-to-end production/release certification.

**E6/E7 NOT_STARTED.** E6's E5 acceptance dependency is satisfied within these
limitations; separate explicit user authorization is required to begin E6.
**STOP after Phase 9E-5 acceptance.** No automatic E6/E7 or commit/push/merge.
