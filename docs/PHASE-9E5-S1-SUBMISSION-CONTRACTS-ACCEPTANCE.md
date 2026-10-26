# Phase9E-5 E5-S1 — Pure Submission Contracts Acceptance Review

2026-10-26. **USER ACCEPTED: COMPLETE — PASS WITH LIMITATIONS (81 tests PASS).**

User formally accepts S1 COMPLETE — PASS WITH LIMITATIONS and separately authorizes S2 checked filesystem/shared OS lease. Phase9E-5 IN_PROGRESS — E5-S2; S3–S6 NOT_STARTED. The original S1 execution record below is historical where superseded;81 PASS/0 FAIL/0 SKIP, scoped checks, no test failures and limitations remain unchanged and were not rerun. S1 reports pure data correctness, not implemented commit/recovery or a saved/completed exercise. S2 evidence is separate in [S2 report](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md).

## 1. Authorized scope and task-start checklist

| Item | Answer |
|---|---|
| Package | S1 immutable records, strict runtime validation, canonical encoding/checksum/storage contracts and synthetic tests only |
| Goal/exclusions | Preserve exact submitted source/identity, approved routing/bounds and safe vocabulary. No file I/O, OS lease, commit/recovery execution, admission/service/IPC/public DTO, committed reads or completion logic |
| Dependencies | E4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope); approved9E0-A1–A4/B1–B3/H1–H5 and E5-D1–D6 |
| Decision gates | E5-D1–D6 APPROVED; no normative conflict found. S1 user acceptance pending; each later step separately authorized/accepted |
| Boundaries | Main-private modules; only deterministic crypto/text helpers, no Renderer/native/Runtime/Registry imports. Records carry no operation/owner/session authority |
| Required checks | User-approved new targeted test/scoped TypeScript/imported closure/targeted ESLint/diff only, superseding general repository commands for S1 |
| Starting tree | Modified master plan and two untracked E5 design/plan files from preceding survey. Updated those authorized documents in place; no unrelated source changes or historical deletions restored |

## 2. Files actually changed

| File | Change |
|---|---|
| `src/main/services/learning/storage/submission-contracts.ts` | New readonly record/capture/document/target/status/availability/results and approved policy constants |
| `src/main/services/learning/storage/submission-validation.ts` | New strict pure validation, source hash, canonical encoding/checksum, capacity, scalar candidate routing, target digest/idempotency and lineage checks |
| `tests/main/submission-records.test.ts` | New synthetic81-test suite; no Official assets/fixtures reused or modified |
| `docs/PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md` | This evidence/limitations/stop-gate report |
| `docs/PHASE-9E5-SUBMISSION-STORAGE-DESIGN.md`, `docs/PHASE-9E5-IMPLEMENTATION-PLAN.md` | Approval/current S1 status, actual paths, scoped verification; original survey history retained where superseded |
| `docs/DECISIONS.md`, `docs/IMPLEMENTATION-PLAN.md` | Formal E5-D1–D6 approval, only S1 authorization, S6 transport allocation and current delivery status |
| `docs/CODEBASE-MAP.md`, `docs/CHANGELOG-THESIS.md` | Actual verified S1 files/results and limits |

Ignored tooling only: `out/e5-s1/tsconfig.json` extends existing node TS config, explicitly selects two modules/test and their import closure, types node, noEmit. No production/test-runner configuration edit, emitted Main/native artifact, dependency addition or user-data operation. Branch observed: `feature/phase-9a-learning-mode`. No commit/push/merge.

## 3. Approved decisions and concrete schema1

All E5-D1–D6 are user APPROVED and synchronized to DECISIONS/design/plan. D1 and the schema/encoding part of D3 are implemented here; D2/D3 transaction execution/D4/D5/D6 remain future S2–S6. No changed9E Accepted/Failed/verdict/cleanup/security policy or architecture deviation.

| Data shape | Exact allowlisted fields |
|---|---|
| Common capture | `schemaVersion`, `id`, `submissionId`, `exerciseId`, `language`, `code`, `sourceRevision`, `codeHash`, `submittedAt`, `packageVersion`, `signatureVersion`, `signatureHash`, `testSet`, `comparator` |
| Common nested fields | `testSet:{id,version,hash}`; `comparator:{id:'exact-typed',version:1}` |
| Accepted | Common fields +`result:'Accepted'`, `acceptedAt`, `cleanupProof:'VERIFIED'`; testSet adds `total,passed` with safe integer `passed=total>0` |
| Failed | Common fields +`verdict`, `gradedAt`, `recordedAt`; verdict only WrongAnswer/CompilationError/SyntaxError/RuntimeError/TimeLimitExceeded/MemoryLimitExceeded/OutputLimitExceeded. No case rows/counts/completion flags required, so trusted compile/syntax may have zero cases |
| Signed envelope | `schemaVersion:1`, `storeKind:ACCEPTED|FAILED`, `commitSequence`, `lastCommitId`, `previousCommit`, `records`, `checksum` |
| Previous reference | null for genesis; otherwise exact `commitSequence,commitId,digest` |

UUIDs use lowercase UUIDv4 shape; Main issuance is a later service obligation, not proven by matching a regex. Timestamp requires exact valid UTC ISO millisecond round-trip; no timestamp generated here and no monotonic chronology claim across wall-clock rollback. Revisions are nonnegative safe integers; identity versions positive safe integers. Negative zero, fractions, unsafe integers/NaN/Infinity rejected. Exercise/test-set IDs use bounded64-character existing-style semantic IDs, never paths; hashes are lowercase64hex.

`validateSubmissionCapture/Record` returns detached frozen allowlisted data, including nested test-set/comparator. Optional expected capture is itself validated, then compared across every immutable common field (including exact source, revision, timestamps and full identity), not just a hash. No trim/coercion/default migration or unknown-field stripping. Ordinary own enumerable data properties only: extra/symbol/accessor/toJSON/nonplain fields and malformed/sparse record arrays rejected. Errors return safe finite reason enums without echoing source/private payload.

## 4. Trust, identity and routing limitations

`routeSubmissionCandidate` only checks the consistency of a minimal FINAL verdict/eligibility projection, not its origin. `validateSubmissionForCandidate` also matches record route/verdict and exact expected capture. Infrastructure/protocol/cancelled/pending/untrusted category cannot become a valid Failed route. Record schema validation alone can accept a forged-but-consistent object: that intentional data-only boundary is tested. The actual service must authenticate real Judge facts and guard commit in S5; S1 creates no capability.

`compareSubmissionIdentity` distinguishes completely distinct IDs, exact matching retry and conflict if either ID overlaps with a differing immutable payload/route. Each document rejects duplicate submission IDs or record IDs. Cross-store pair conflicts are detectable through the pure comparison helper; whole committed-store conflict/read handling is S4. `bindSubmissionTarget` returns frozen target/IDs/canonical payload digest only, never write authority. No IDs/timestamps generated, file paths resolved, resources owned, stores read or operations admitted.

No Expected/hidden case IDs/indices/values/raw actual/console/diagnostics/private JudgeResult/owner-entry/session fields are accepted. Full JudgeResult is not imported or serialized. Schema success, checksum, target binding and a `VERIFIED` string do not establish authenticity, ownership, filesystem commit or completion. Saved/failed/pending/unknown/not-requested are vocabulary types only; no function returns a real storage Saved result. Completion remains S4 from verified committed Accepted only.

## 5. Source, canonical bytes, checksum and lineage

Submit-only source validator accepts exact well-formed Unicode with at most256Ki UTF-16 code units, including empty/whitespace/control strings, Vietnamese/astral text and CRLF/LF unchanged. Lone surrogates rejected before UTF-8 hashing. SHA256 uses exact source UTF-8; sourceRevision/hash is correlation/integrity, not owner authority. Public Run/draft validators were not changed.

Canonical record JSON follows common-field order above, fixed nested field order, then Accepted or Failed fields. Metadata is the same canonical object excluding only `code` (braces/delimiters included). Canonical envelope order is schemaVersion/storeKind/commitSequence/lastCommitId/previousCommit/records/checksum. Previous reference uses sequence/ID/digest order; records retain append order. Encoded snapshots end in exactly one LF. Checksum is SHA256 of canonical envelope **without checksum and without the final LF**; it never includes itself. Input object insertion order is irrelevant. Source escapes are JSON encoding only and round-trip to the identical string.

`sealSubmissionDocument` constructs/checks immutable document data/checksum from an unsigned envelope; no transaction, ID minting, append engine or durable acknowledgement. `validateSubmissionDocument` validates signed data/checksum. Hash/byte accounting processes canonical record chunks rather than allocating another complete snapshot; explicit string encoding constructs the final bounded string only when requested.

Genesis: sequence1/null predecessor/one record. Later envelopes require immediately preceding positive sequence, valid different previous commit ID and digest. `validateSubmissionLineage(next,prior)` additionally validates both supplied documents, matching store/previous commit/checksum, unchanged canonical prefix and exactly one appended record. A standalone previous digest cannot prove unseen history; that distinction is tested and remains a limitation, not inferred trust. No temp promotion/migration/reset/recovery engine.

Pure decoder accepts canonical string or strict UTF-8 byte view. Exact re-encoding rejects duplicate JSON keys, alternate ordering/whitespace/escapes, missing LF, BOM, malformed UTF-8/JSON, unsupported schema and trailing material. Ordinary object validators still accept different insertion orders. Decoding/classification is data validation, not a filesystem recovery fallback. Checksum is a corruption check, not anti-tampering/anti-rollback certification.

## 6. Bounds/configuration and exact-boundary evidence

- Actual record and non-code metadata canonical UTF-8 are measured against2MiB/16KiB. Document accounting includes every record comma, quoted/escaped byte, nested/outer delimiter, checksum field and LF against64MiB Accepted/32MiB Failed.
- Real canonical synthetic snapshots are tested exactly at64MiB/32MiB and one source byte over; the tests fill shared synthetic source strings using a measured small-envelope baseline, without allocating the full encoded snapshot string. Validation/hash still processes actual records, not a mocked size.
- 2MiB record/16KiB metadata exact/+1byte tests exercise the pure actual-length preflight API. Current strict fixed-length fields and256Ki source cap keep all otherwise-valid records below those limits (max escaping about1.5MiB source plus bounded metadata), so an actual valid record/metadata at the outer cap is not constructible under schema1. Maximum source/control/astral cases are encoded/round-tripped and measured below the cap. No claim that a synthetic overlong metadata field is valid.
- Approved policy constants retain Accepted warnings48/56MiB/waits15s/slow5s, Failed warnings24/28MiB/waits10s/slow3s, reserve2×candidate+16MiB, max3 transient attempts/backoffs250/1000ms, target precommit window15s/10s, bounded read settings32default/100max/row1KiB/response256KiB/cursor512bytes/source32KiB. Constants only: no disk checks, retries or timers execute.
- No version-count limit beyond byte-derived bounds, pruning/truncation or capacity increase. Oversized data is rejected by this bounded schema validator; preservation/read-only/recovery execution is deferred, never defaulted to empty.

## 7. Executed checks and results

| Command/check | Actual result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit -p out/e5-s1/tsconfig.json` | PASS; exact two new source modules/test and dependency closure, no emission |
| `node node_modules/eslint/bin/eslint.js src/main/services/learning/storage/submission-contracts.ts src/main/services/learning/storage/submission-validation.ts tests/main/submission-records.test.ts` | PASS; three files only |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/submission-records.test.ts` | **81 PASS /0 FAIL /0 SKIP**,1 file; Vitest4.1.11,5.90s total/3.68s tests. One targeted run; not a benchmark/native observation |
| Scoped tracked/new-file `git diff --check` | PASS; includes untracked source/test/docs via no-index check, no whitespace errors. Git LF→CRLF notices are not test failures |
| Source/import/working-tree scope review | Two Main-private source modules import only node crypto/text decoder plus local contracts. No forbidden subsystem changed/imported; no real data/artifact operation |

Coverage groups: Accepted/graded-failure/zero-case compiler shapes; pending/infra/cancelled/route rejection; strict fields/privacy/hooks; unsafe identities/versions/times/hashes and expected-capture mismatch; retry/conflicts; exact Unicode/source round-trip/cap; capacity; store distinction/canonical checksum; actual predecessor/append-only lineage; duplicate/sparse/corrupt/unsupported/invalid encoded input; nonmutation/frozen outputs.

**Historical failures/corrections:** no targeted test/typecheck/lint failure or skipped test occurred in S1. Initial read-only inventory looked for `vitest.config.ts` and the not-yet-created storage directory; both were absent. Installed Vitest default discovery and the existing project config were used without adding/changing production config. These read observations are not test failures. Source was prepared before the checks; no native/test-result rewrite or hidden rerun history.

## 8. Not implemented / remaining limitations / stop

No file I/O/store façade/OS lease/atomic commit/idempotent transaction/recovery execution/committed read model/completion calculation/ExerciseService integration/IPC/Preload/UI/History/Restore. No source/Official asset/Comparator/Reducer/Runtime/Core/Registry/native/public Run change. No dependency install/database/framework/new lifecycle; no user storage mutation, E4 artifact rebuild/restore or old-document restoration, no commit/push/merge.

E4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope). Current-artifact handoff NOT PASS; current native UNVERIFIED and post-run Main index not full-app verified.12 performance models PENDING_RUNTIME; general Official60s/target-host/reliability/release UNVERIFIED; loader/installed/offline/filesystem gates unchanged. Storage performance NOT MEASURED; durability/native-lease/Windows/restart acceptance UNVERIFIED. Pure tests do not promote any limitation to PASS.

**Decisions resolved:** E5-D1–D6, explicit user approval; no normative conflict found or architecture deviation. **Ready for next work package: NO automatic start** — await S1 acceptance and separate S2 authorization. No real Saved/Completed result exists from this work.

**S1 COMPLETE — PASS WITH LIMITATIONS, formally user accepted.** Separate S2 authorization does not authorize S3–S6 or E6/7. Original S1 evidence/limits remain intact; no automatic phase completion or real Saved/Completed claim.
