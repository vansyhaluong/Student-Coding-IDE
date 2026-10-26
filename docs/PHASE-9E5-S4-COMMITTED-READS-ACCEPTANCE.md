# Phase 9E-5 / E5-S4 — Committed Reads & Completion Acceptance

2026-10-26. **COMPLETE — PASS WITH LIMITATIONS — USER ACCEPTED** (tracking `COMPLETE`).
User formally accepts72 S4 PASS,3 focused regression PASS and scoped typecheck/lint/
diff PASS. Committed History, partial availability, pagination, source chunks and
Accepted-derived completion are accepted; all historical evidence/corrections and
limitations below remain intact. No S4 test rerun accompanies acceptance or S5.
**S1–S4 COMPLETE — PASS WITH LIMITATIONS; Phase9E-5 IN_PROGRESS.** S5 is separately
authorized and its current delivery is recorded in the [S5 packet](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md);
S6 NOT_STARTED. Earlier pending/stop statements below are historical where
superseded by this formal acceptance.

## 1. Authorization, dependencies and preserved S3 acceptance

User formally accepts **S3 COMPLETE — PASS WITH LIMITATIONS**:40 S3 tests PASS,
28 S2 regressions PASS/1 native live SKIP, scoped typecheck/lint/diff PASS; atomic
commit/idempotency/backup/controlled recovery accepted within recorded limitations.
[S3 evidence](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md), command history and
unverified conditions are preserved. No full S3/S2/native rerun or new durability
claim is made by acceptance. Three selected façade regressions below are necessary
because S4 directly extends their dependency `learning-store.ts`.

| Task-start question | S4 answer |
|---|---|
| Authorized package | E5-S4 only: Main-private committed reads/completion; approved E5-D4 and accepted S1–S3 prerequisite |
| Goal/scope | Verified snapshot-derived summaries, availability/conflicts, bounded generation pagination, immutable UTF-8 source chunks and Accepted-only completion |
| Out of scope | S5 service ownership/shutdown integration; S6 IPC/preload; UI/History/Restore/E6/E7; persisted progress/index; policy/schema/transaction changes |
| Decision gates | E5-D1–D6/P9-STORAGE/H1–H5 approved; no new gate or changed ADR; user S4 acceptance and separate S5 authorization still required |
| Architecture/security | Main-only fixed paths/authenticated shared lease/S3 recovery; no raw document/Judge projection, external authority or renderer filesystem API |
| Required verification | Only new S4 suites, selected directly affected façade regressions, scoped tsc/targeted lint/scoped diff checks; synthetic temporary storage only |
| Initial tree | Existing modified decisions/map/master-plan/changelog and untracked S1–S3 storage/tests/design/plan/acceptance documents preserved; branch `feature/phase-9a-learning-mode`; no commit/push/merge |

## 2. Files and implemented responsibilities

| File | Actual change |
|---|---|
| `src/main/services/learning/storage/submission-read-model.ts` | New private read DTOs and validators, lease-authenticated verified snapshot loads, derived conflict/order indexes, safe summaries, generation/integrity cursors, UTF-8 source chunks, Accepted-derived completion |
| `src/main/services/learning/learning-store.ts` | Add history/source/completion reads, coalesced matching read task, exclusion with pending commits, retained read-resource settlement; existing immutable transaction path preserved |
| `tests/fixtures/learning/submission-read-fixture.ts` | Shared synthetic records/canonical snapshots, isolated checked temporary roots and simulated lease/file fault ports; no real native calls |
| `tests/main/submission-read-model.test.ts` |50 targeted tests for committed/partial/conflicting history, cursor/bounds, source/privacy and retained read ownership |
| `tests/main/submission-completion.test.ts` |22 targeted tests for Accepted-only completion, missing/unreadable/recovered states, no Failed I/O, candidate exclusion and invalid identities |
| S3 acceptance, S4 acceptance, E5 design/plan, master plan, Codebase Map, thesis changelog | User acceptance of S3, actual S4 evidence/status and stop gate; historical evidence retained |

S1 contracts/validation, S2 file/lease helpers, S3 transaction/recovery engine and
existing test sources are unchanged. No storage schema, recovery/commit policy,
budget, dependency, Judge/Runtime/Core/Official/native/public Run/source asset
change. Read DTOs remain private in the new read-model module; no public transport.

## 3. Read, completion and availability behavior

The read model has a private constructor: documents enter only through S3
`recoverSnapshot` under its authenticated shared lease. No candidate, grade
receipt, staging file or runtime checkpoint supplies rows/completion. A synthetic
unavailable view has no document evidence and cannot claim an empty complete
store. New calls reload current committed generations; no optimistic or persisted
progress/index, and no cached positive survives an unreadable current Accepted.

History loads both stores within one lease, detects record-ID/submission-ID
collisions before filters and refuses conflicting rows rather than merging them.
Duplicate records within a document remain corrupt under existing S1/S3 validation.
Order is descending canonical submittedAt, then submissionId, then typed record
key, with ordinal comparison independent of locale/file insertion order. Clock
rollback does not imply a monotonic physical chronology. All/Accepted/Failed,
exercise/language/packageVersion filters are implemented for history only.

Availability preserves missing, unavailable, corrupt, unsupported schema,
read-only, conflict, recovery-pending and recovered distinctions. Missing means
confirmed missing snapshots without contradictory staging evidence. Partial
history reports `coverage: PARTIAL`, `countScope: READABLE_ONLY`, `knownCount`
for filtered readable evidence and `total: null`; unreadable stores are never
counted as empty. Single-store history can be complete while the other is unreadable.
A valid primary with a bad backup remains readable in S3 READ_ONLY mode with
explicit `backupState`; its verified records are not discarded.

Completion reads **Accepted only**, with zero Failed filesystem probes in the
focused test. A matching verified Accepted means COMPLETED independent of language,
package history filters, Failed data/failure or current Official assets. Verified
complete Accepted evidence without a match means NOT_COMPLETED. Unreadable Accepted
means UNKNOWN. Recovered backup supports COMPLETED only for records it actually
contains; an absent match is UNKNOWN with POSSIBLE_DATA_LOSS, not a negative.
Cross-store conflicts are reported by History/source; they do not let Failed
erase independently verified Accepted completion.

Backup recovery preserves S3 `POSSIBLE_DATA_LOSS`, reads only the older validated
records and does not repair corrupt/missing primary or overwrite backup. Test
assertions preserve the original corrupt bytes and verified backup. Orphan staging
alone stays RECOVERY_PENDING; no new grade or completion is reconstructed.

## 4. Pagination, source bounds and privacy evidence

- History defaults to32, accepts1–100 records and rejects invalid/excessive limits.
  A137-record synthetic committed fixture paginates deterministically without
  missing/duplicate rows, including32 and100 row pages. Every projected row is
  checked against1KiB, and the whole encoded response against256KiB.
- Cursor is canonical versioned base64url plus process-local HMAC integrity,
  bounded to512bytes. It binds normalized filter/page size and a digest of **both**
  store generations/checksums/availability/warnings/backup state. New commit,
  changed opposite store, availability/backup transition, filter or page-size
  changes return STALE_CURSOR. Malformed, oversized or offset-tampered tokens
  return INVALID_REQUEST; no persisted cursor/index or commit authority exists.
- Typed source key is `(storeKind, recordId)`, never a path. Request must also bind
  submissionId, exact source hash and revision. Decoder validation plus source
  hash recheck reject stale/replaced identities. Unrelated append preserves the
  original record's source binding. Recovered missing records are unavailable,
  rather than definitively not-found in potentially lost history.
- Source returns at most32KiB raw UTF-8 and checks256KiB encoded response size.
  Offsets inside continuation bytes/outside source and limits unable to fit one
  code point fail explicitly. Chunks stop before a split code point and expose
  nextOffset/eof. Accepted and Failed tests reassemble exact CRLF/astral/CJK/quote/
  backslash/NUL source; EOF is an empty final chunk. Worst-case32KiB NUL escaping
  exceeds190,000 JSON bytes but remains below256KiB without truncation/corruption.
- Summary/source/error metadata use explicit allowlists. Summaries contain no
  full code. No Expected/hidden test IDs/test-set or signature hashes/comparator/
  cleanup proof/private diagnostics/raw logs enter responses. Injected hidden
  persisted fields make the document corrupt rather than being echoed. User source
  itself is returned exactly and is not scanned/redacted as private Judge data.

## 5. Read task and resource ownership

Matching concurrent reads join one retained load. Different requested load scopes
report RECOVERY_PENDING instead of queuing a new operation behind unresolved I/O.
Pending/unknown/unsettled commit excludes new reads, yielding UNKNOWN completion
and explicit pending availability; no candidate-derived view is published. New
commits are BUSY during original read I/O or retained read cleanup. A refused
acquisition does not release another borrower's native token/handles.

Read handles and shared lease are closed only after original I/O settlement.
Close failure preserves ownership and blocks reuse; `settleReads()` joins the
original task and retries resource closure only. Already verified read evidence
can be returned with `hasRetainedReads=true`; later calls cannot reuse a stale
view while cleanup remains retained. Simulated delayed reads/native-close faults
verify task joining, release count and exclusion. S5 still owns actual service
slot/shutdown integration; no independent operation manager/queue is introduced.

## 6. Executed checks, failures and corrections

| Check | Final result |
|---|---|
| New `submission-read-model.test.ts` | **50 PASS /0 FAIL /0 SKIP** |
| New `submission-completion.test.ts` | **22 PASS /0 FAIL /0 SKIP** |
| New S4 total | **72 PASS /0 FAIL /0 SKIP**,2 files;7.01s reported runner duration, not a benchmark |
| Selected directly affected S3 façade regressions | **3 PASS /0 FAIL**;37 tests excluded by name filter, not executed/native skips |
| Scoped TypeScript/imported closure | PASS: `node node_modules/typescript/bin/tsc --noEmit -p out/e5-s4/tsconfig.json` |
| Targeted ESLint | PASS: new read model, changed façade, shared fixture and two new suites only |
| Scoped tracked/new-file `git diff --check` | PASS; explicit changed paths and untracked files checked using `--no-index --check`; only Git LF→CRLF notices |

S4 command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/submission-read-model.test.ts tests/main/submission-completion.test.ts --reporter=default --reporter=json --outputFile=out/e5-s4/targeted-results.json`.

Regression command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/submission-store.test.ts -t 'joins one frozen continuation|retains unresolved rename/task/lease|settles failed native close' --reporter=default --reporter=json --outputFile=out/e5-s4/facade-regressions.json`.
These three checks cover original immutable join/conflict, pending I/O exclusion/
lease retention and failed close settlement after direct façade extension. The
remaining37 S3 cases and all S2/native lease suites were not run. Historical S3
40 PASS and S2 28 regressions PASS/1 native live SKIP remain the accepted evidence.

Initial scoped tsc reported one lost narrowing of `request.key` inside a callback;
capturing its validated recordId fixed it. Initial targeted lint reported one
unused type import; removed. First S4 run69 PASS/0 FAIL, expanded70 PASS/0 FAIL,
final72 PASS/0 FAIL. The three façade checks ran twice after relevant changes;
counts are repeated coverage, never summed. No test failures were hidden.

Review corrected a new read-acquisition ownership bug before final delivery:
cleanup must never close a lease held by another borrower. A regression verifies
the original token remains HELD. Review also separated Accepted-only completion
from Failed I/O and made incompatible pending read scopes explicit rather than
queuing completion behind a delayed Failed read. Final tests/scoped checks ran
after these source changes. Ignored `out/e5-s4/` contains configs and JSON receipts;
no production artifact/config/native binary was emitted or fingerprinted.

## 7. Limitations and UNVERIFIED conditions

- S4 uses real temporary Windows filesystem reads and synthetic canonical
  snapshots with injected faults/simulated native handle behavior. No real student
  data, actual native lease test, Judge/Runtime, service/IPC/UI or release trial.
- No change to inherited S3 backup fallback/repair policy. Corrupt evidence stays
  in place, recovery can lose newest records, unsupported/oversized snapshots stay
  unavailable/read-only and are not migrated/reset/pruned.
- Process restart invalidates HMAC cursor integrity; clients request a fresh first
  page. Cursors are private S4 DTOs, not final S6 transport. No persisted cursor or
  anti-rollback/authentication protection against local filesystem editing is claimed.
- An unavailable/busy lease cannot support fresh committed reads: response remains
  explicit UNKNOWN/partial. There is no cached completion substitute. Long-running
  read I/O retains exclusion; caller deadlines/publication/shutdown wiring are S5/S6
  work, not implemented here. Read cleanup may require explicit settlement retry.
- Bounded S1 snapshot validation/encoding and S4 indexing/sorting are synchronous.
  Storage performance, Main responsiveness, long-session memory, large-store latency
  and real host response targets are NOT MEASURED. Test timings are not benchmarks.
- Valid projected fields keep rows/responses below bounds; tests measure actual
  encodings and reject oversized limits/cursors, rather than inventing invalid
  schemas to produce an exact1KiB row or256KiB response. No policy limits changed.
- Full suite, repository-wide typecheck/lint/build, native lease/Judge/Runtime,
  benchmarks, UI smoke and unrelated historical tests were not run as instructed.
- Existing Node TOCTOU/cooperative lease, Windows10/11/UNC/AV/ACL/installed/offline,
  crash/power-loss/directory-sync durability, current-artifact/reliability/release
  limitations remain unchanged. E4 recorded-hash acceptance does not certify current
  artifacts/native generally;12 performance models remain PENDING_RUNTIME.
- No real service owner/admission/commit authority or production Submit completion
  publication has been certified. The read model uses verified stored evidence;
  S5 must supply actual operation integration, S6 safe public transport.

## 8. Task review and STOP — historical delivery-time status

**TASK REVIEW: PASS within controlled S4 scope; user acceptance pending.**
Decisions resolved: NONE. Architecture deviations: NONE. No blocker observed for
the tested read/completion behavior; all limitations above remain explicit.

**S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS. S4 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS). S5/S6 NOT_STARTED. Phase9E-5 IN_PROGRESS.**
Ready to begin S5: **NO — await user acceptance and separate authorization**.
STOP after S4. No automatic S5/S6/E6/E7 or Git commit/push/merge.
