# Phase9E-5 E5-S2 — Checked Filesystem & Shared OS Lease Acceptance

2026-10-26. **USER ACCEPTED: COMPLETE — PASS WITH LIMITATIONS.**

**S1/S2 COMPLETE — PASS WITH LIMITATIONS**, formally user accepted. **Phase9E-5 IN_PROGRESS; S3–S6 NOT_STARTED.** E5-D1–D6 remain APPROVED. S2 acceptance preserves29 targeted PASS/0 FAIL/0 SKIP, checked filesystem/file identity/bounded reads/safe staging, shared OS lease/retained ownership/release retry, Windows cross-process contention/reacquisition, unchanged native fingerprint and scoped typecheck/lint/diff evidence. This is not submission transaction/recovery or release certification.

This final acceptance is documentation-only: consistency review and document-scoped `git diff --check`, no tests/typecheck/lint/build/native/smoke rerun. The original execution/checklist/changed-files record below is historical; all failures, corrections, counts, hashes, receipts and limitations are retained. No production/evidence artifact changed. S3 requires separate explicit authorization.

## 1. Task-start checklist / scope

| Item | Answer |
|---|---|
| Authorized package | Two Learning-only modules `store-files.ts`, `store-lease.ts`; targeted file/lease tests and dedicated cross-process fixture; documentation |
| Goal/scope | Fixed trusted Main paths, identity/containment, bounded reads, exclusive staging/sync/close/read-back, safe byte replacement primitives and retained shared native lease |
| Out of scope | Real submission writes/commit/recovery, store façade, completion/read model/service/IPC/Preload/UI; native binary/Runtime/Core/ExerciseService/Official/public API changes |
| Dependencies/decisions | S1 accepted; existing native acquireLease/observation(close) capability; E5-D2 and six-step plan APPROVED; no changed ADR/policy or new dependency |
| Security/lifecycle | Main-only root/tokens, no generic renderer filesystem/process API, shared OS exclusion/no fallback, retain unsettled handles/stages and block release/replacement reuse |
| Required verification | New targeted filesystem/lease suites including Windows native parent/child contention/release/reacquisition in temporary roots; fingerprint before/after; scoped tsc/targeted lint/diff |
| Starting tree | Prior S1/design docs/source/tests already modified/untracked. Preserve all; only S2 source/test additions and authorized documentation updates. S1 source/test unchanged; no old documents restored |

## 2. Actual changed files

| Path | Change |
|---|---|
| `src/main/services/learning/storage/store-files.ts` | New checked fixed-root byte primitives, injected narrow fs port, identity/resource tracking and staging/replacement safety |
| `src/main/services/learning/storage/store-lease.ts` | New shared OS lease adapter over existing native subset, authenticated tokens, busy/retained release/retry and redacted typed errors |
| `tests/main/submission-store-files.test.ts` |18 new temporary-filesystem/controlled-fault tests |
| `tests/main/submission-store-lease.test.ts` |11 new controlled/native tests, including actual Windows cross-process case |
| `tests/fixtures/learning/submission-lease-peer.mjs` | Dedicated child acquire/busy/release fixture; no Job or Runtime capability used |
| `docs/PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md` | This receipt/history/limitations/stop-gate report |
| `docs/PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md` | Formal S1 acceptance; original81-test evidence/limits retained |
| `docs/PHASE-9E5-SUBMISSION-STORAGE-DESIGN.md`, `docs/PHASE-9E5-IMPLEMENTATION-PLAN.md` | S1 accepted/S2 current review; actual module status and separate S2 verification scope |
| `docs/DECISIONS.md`, `docs/IMPLEMENTATION-PLAN.md`, `docs/CODEBASE-MAP.md`, `docs/CHANGELOG-THESIS.md` | Actual S2 scope/evidence/current statuses, no changed approved storage policies |

Ignored tooling/evidence: `out/e5-s2/tsconfig.json`, `out/e5-s2/native-lease-evidence.json` (final29-test run). No production config/build/emitted Main/native modification; no real userData writes. Fixture cleanup verifies resolved temporary root containment before recursive removal and closes original file handles; it never targets app data. No commit/push/merge.

## 3. Filesystem behavior and evidence

`SubmissionStoreFiles.open` accepts a Main-supplied absolute Learning root; rejects relative/traversal/device roots, symlink/junction ancestors and canonical root changes. Only a missing selected leaf may be created; missing ancestors are not recursively created/adopted. Captured directory identity dev/ino/birthtime is rechecked with realpath/lstat around operations. Windows comparison normalizes drive/path case; identity rather than raw spelling binds ownership.

Primary/backup paths derive only from validated ACCEPTED/FAILED and PRIMARY/BACKUP selectors: `accepted.json`, `failed-submissions.json`, their `.bak` siblings; fixed `submissions.lock` shared for both. No renderer/persisted path or arbitrary filename API. File checks reject nonregular/symbolic/reparse targets, hardlink count other than1, zero file identity and path/handle/content-stat mismatch. Missing returns explicit null on inspect or typed MISSING on read, never default data/reset.

Bounded read checks size before buffer allocation, verifies opened handle against path, handles short reads, probes one byte beyond the expected size, then verifies handle/path size/mtime/ctime/identity and roots again before return. A changed/grown/replaced file fails closed. Data bytes remain Main-only, schema validation is S1/S3 responsibility. Controlled tests verify permission/busy/I/O classification without changing actual ACLs.

Staging requires the authenticated same-files lease. Bytes are copied before yield, bounded by existing target snapshot cap, written into a UUID sibling with exclusive `wx`, handling short writes, then synced/closed and read back/hashed. Stage handles and identity are retained on failure; no automatic stale/orphan/temp promotion. Discard accepts only this instance's owned token with matching file identity and no unsafe links; it never follows a changed filename to delete a foreign file. Unresolved/unsafe staging stays retained rather than guessed safe.

Replacement is a schema-blind **fixture-tested byte primitive**, not a submission transaction: check owned READY stage/hash and expected destination identity/absence, run a synchronous caller guard, dispatch sibling rename in the same stack without await, read back/verify destination. Non-sync guards/guard failures do not rename. No unlink-primary/copy-over fallback, backup policy, commit lineage, saved acknowledgement or recovery. Dispatched failure marks REPLACEMENT_UNVERIFIED, carries `replacementDispatched:true`, retains resource/exclusion, rejects blind reuse. S3 must later design/execute managed outcome reconciliation; S2 intentionally does not resolve those states.

Failed file close retains the original handle and blocks lease use/release; explicit `retryClose` retries that handle, not the write. Native lease cannot release while original file operations/handles/owned stages remain. Tests cover pending original write, partial write/sync failure and close retry. Completed/discarded stages leave the active ownership ledger; stale tokens cannot reacquire authority.

## 4. Shared lease behavior

`SharedSubmissionStoreLease` receives only existing native capability/acquireLease/observation(close), with no Job/process APIs. Native source/binding/loader unchanged. Both targets use one fixed lock; a module-private WeakMap authenticates tokens to exact owner/files instance. Existing acquisition or concurrent write is BUSY, no operation queue. Null native acquisition is BUSY; missing/incompatible port is UNAVAILABLE, never in-memory fallback.

The strong native handle is kept until successful close. Concurrent release joins one close task; close failure preserves ownership and revokes writes/reacquisition until explicit retry. Post-acquisition validation failure also attempts safe close; failed close remains owned through owner.retryRelease even without a returned token. Released tokens are permanently revoked: their release is a no-op after a newer acquisition and cannot close its handle. Lock contents/existence/PID/age are never authority; no stale lock deletion/truncation.

Typed `StoreIOError` extends DomainError with finite MISSING/BUSY/PERMISSION/UNSAFE/IO/UNAVAILABLE/TOO_LARGE/INVALID_INPUT reasons and a dispatched flag; raw Node/native messages, stacks, paths and source are not projected or logged by the modules. Controlled fault mapping includes ENOENT/EACCES/EPERM/EBUSY/EEXIST/ELOOP/EIO and native win32 sharing/permission failures. No real ACL modification or injected native binary failure.

## 5. Actual Windows native evidence / provenance

Host observed: **win32 x64, Node v24.16.0, ABI137**. Existing binary `out/main/native/learning/learning-job.node` loads `student-ide-learning-job-v1` with required methods. Native SHA256 at initial preflight, before/after the final test run and final command check (the first run also passed its before/after equality assertion):

`97dd803603ba655ab58d1df24e5de4957ff226c8ea31e1491d58c4bcfe0cbcc3`

No binary write/rebuild/restore was performed. This fingerprint is S2 provenance, not an amendment of E4 historical hashes. Native E4/Runtime/Job behavior is not reverified by lease testing.

Final ignored [native receipt](../out/e5-s2/native-lease-evidence.json) records:

- Parent holds real native shared lease → dedicated child receives BUSY.
- Child holds that same lock → parent wrapper rejects BUSY.
- Child explicitly closes → parent reacquires/releases successfully.
- Parent stages/discards fixture-only bytes under real lease;0 retained file handles/resources after settlement.
- Original lock bytes preserved; existing file not deleted/truncated.
- Fingerprint before=after; **0 Jobs,0 Runtime operations,0 Judge operations**.

Each targeted run enables the live case explicitly with `LEARNING_SUBMISSION_STORE_LIVE=1`; no native test was skipped in executed runs. The child invokes only acquireLease/close. A separate preliminary temporary-root metadata probe confirmed lstat/realpath are available while the lock is held; its raw string path comparison was false on Windows, so production checks use normalized case plus identity. No native capability failure or out-of-scope remedy was found. The preliminary probe and two targeted live runs are reported openly; they are not additional Judge acceptance or release trials.

## 6. Executed checks / historical corrections

| Command/check | Actual result |
|---|---|
| Initial native fingerprint/load/subset capability | PASS; existing binary unchanged, no Job |
| `node node_modules/typescript/bin/tsc --noEmit -p out/e5-s2/tsconfig.json` | PASS initially and after lifecycle change; two new modules/tests plus imported closure only, no emission |
| Targeted eslint on store-files/store-lease, two tests and peer fixture | Initial1 FAIL: no-this-alias in token state closure. Corrected locally to lexical closures; final PASS |
| `LEARNING_SUBMISSION_STORE_LIVE=1 node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/submission-store-files.test.ts tests/main/submission-store-lease.test.ts` | First27 PASS/0 FAIL/0 SKIP; after reviewed stale-token correction and two new regressions, **final29 PASS/0 FAIL/0 SKIP**,2 files,2.39s total/1.52s tests |
| Native SHA256 before/after + final independent read | PASS, unchanged hash above; lease-method scope only |
| Scoped tracked/new-file `git diff --check` | PASS, no whitespace errors; Git LF→CRLF notices are not failures |
| Source/import/working-tree boundary review | Only new S2 modules/tests/peer plus authorized docs; no native/Runtime/ExerciseService/Official/public API/S1 code modification |

Initial tests did not cover stale-token release after reacquisition. Review identified that new wrapper defect before delivery; old-token state/release was tied permanently to its minted token, with a focused regression. A second added regression verifies explicit backup replacement and async-guard refusal. No original test failure, skipped case or native failure was hidden.27+29 is repeated coverage, **29 unique final tests**, not56. The final receipt describes the final live run; earlier run counts/tool results are retained here. No S1/E4/completed-phase tests were run.

## 7. Limitations / remaining work / stop

- File tests use real temporary Windows directories with controlled fault injection for permission/locked rename/sync/close failures; native normal contention/release is real. Close-failure behavior is injected, not a claim that a native fault was induced. No broad ACL/antivirus/UNC/installed/target-host matrix, crash/power-cut or reliability campaign.
- Root/file checks reduce Node TOCTOU races but do not create handle-relative filesystem authority or a malicious-local-user sandbox. Cooperative OS lease exclusion does not prevent noncooperative local mutation. Unsupported/mismatched identities fail closed, not reset.
- Staging/replacement bytes have no submission semantics. Unverified replacement/unsafe staging deliberately retains authority pending later managed reconciliation; no S3 engine/API resolution is implemented. Fixture-only tests may clean preserved evidence inside their verified temporary root after closing handles; production primitives never perform broad recursive cleanup.
- No guaranteed directory-sync/power-loss durability or storage performance evidence. Storage performance **NOT MEASURED**, durability/restart **UNVERIFIED**; sync/read-back primitives alone are not a committed/saved certificate.
- E4 remains COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope); current-artifact handoff **NOT PASS**. Current native is verified only for this new S2 lease subset/hash; general native/Runtime/current-artifact certification remains **UNVERIFIED**.12 models PENDING_RUNTIME; general Official60s/target-host/reliability/release UNVERIFIED and deferred loader/installed/offline/filesystem gates unchanged.
- No new normative conflict, dependency or architecture deviation; no submission commit/recovery/completion, service/IPC/UI/History/Restore, S3–S6/E6/E7, real user storage, history restoration or Git publication.

**S1/S2 COMPLETE — PASS WITH LIMITATIONS. Phase9E-5 IN_PROGRESS; S3–S6 NOT_STARTED. STOP after recording acceptance; await separate user authorization for S3 — Atomic Commit & Recovery.** No automatic next-step start, transaction/recovery PASS, real Saved/Completed or release certification.
