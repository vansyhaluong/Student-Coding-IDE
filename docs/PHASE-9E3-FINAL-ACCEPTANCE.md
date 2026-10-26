# Phase9E-3 — Full Official Runtime Bridge Acceptance

2026-10-25. **TASK REVIEW: PASS WITH LIMITATIONS.**
**E3-S6: COMPLETE — PASS WITH LIMITATIONS; formally user accepted.**
**Phase9E-3: COMPLETE — PASS WITH LIMITATIONS. Phase9E-4: NOT_STARTED.**
Formal closure is recorded in Section11. Original execution/review evidence,
historical failures/SKIP and limitations below are preserved; this acceptance
supersedes earlier pending-review status statements, including the design record.

## 1. Authorized scope and result

S1–S5 are user accepted COMPLETE — PASS WITH LIMITATIONS. The user separately
authorizes S6 under the [approved design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md),
[plan Section8](PHASE-9E3-IMPLEMENTATION-PLAN.md) and E3-D1–D4. This delivery
implements test fixtures/evidence tooling only, with no production changes.
Existing uncommitted/untracked S2–S5 work is preserved. No new architectural
decision, policy waiver, dependency installation or runtime optimization.

**All126 exercise/language rows PASS on the current host**, each from a complete
Official set in one owned operation. No partial prefix is reported as PASS.

| Evidence origin | Operations PASS | FAIL | SKIP | UNVERIFIED | NOT MEASURED | Returned/required cases | Real Jobs |
|---|---:|---:|---:|---:|---:|---:|---:|
| S6 newly executed |110|0|0|0|0|846/846|1011|
| S5 accepted, reused without rerun |16|0|0|0|0|162/162|186|
| Combined distinct full-set matrix |126|0|0|0|0|1008/1008|1197|

Each language has63 complete operations and504 returned cases. S5 fault controls
and public Run operations are separate historical evidence, excluded from this
full-set matrix and Job total. Reused16 rows are not110 newly executed tests.
There are no unattempted cases or execution/cleanup failures in the126 full rows.
These results satisfy the current-host bridge screen, not release certification.

## 2. Actual files changed

- `tests/fixtures/learning/official-runtime/pilot-native.ts`: additive test-only
  fixed-code/evidence-directory options and string ID seam. Existing native
  forwarding, service/Core/barriers/cleanup and default pilot sources are retained.
- `tests/fixtures/learning/official-runtime/catalogue-solutions.json`:110 fixed
  sources for the55 non-pilot IDs; no runtime solution generator.
- `tests/fixtures/learning/official-runtime/catalogue-pins.json`: original
  reference/adapted source SHA-256 pairs and trusted function names.
- `tests/fixtures/learning/official-runtime/catalogue-evidence.ts`: frozen reads
  and strict full-receipt assertions, entirely test-only Main code.
- `tests/fixtures/learning/official-runtime/catalogue-report.ts`: read-only126-row
  evidence join with explicit statuses; never launches runtime work.
- `tests/fixtures/learning/official-runtime/CATALOGUE.md`: adaptation/provenance,
  invocation, isolation and evidence boundary.
- `tests/main/official-runtime-catalogue.test.ts`: five scoped contracts/audits.
- `tests/main/official-runtime-catalogue.integration.test.ts`:110 fresh full-set
  native tests, explicitly excluding the accepted pilot IDs.
- This report and status records in `PHASE-9E3-IMPLEMENTATION-PLAN.md`,
  `PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`, `IMPLEMENTATION-PLAN.md`,
  `CODEBASE-MAP.md`, `CHANGELOG-THESIS.md`, all under `docs/`.

Ignored private tooling/receipts live under `out/e3-s6/`. No production code,
Official data/Expected, manifest7, compiled anchor, public Run contract, native
module, security decision, `.gitattributes` or Git configuration was edited.
Old acceptance reports and original S5 receipts/sources/pins are unchanged.

## 3. Frozen identity, source provenance and S5 reuse

Manifest release7 SHA-256 is unchanged:
`75ddbf0447e4708882c1e8e1f96e7cbebf97bf5aa170a14713e96755a9d3e081`.
Targeted integrity assertions match all63 full-profile packages'315 declared
assets plus manifest against source/compiled bytes and exact asset sizes/hashes.
Each set/version/signature links to its frozen metadata and Official SHA.
The real Registry uses `out/main/exercise-package-resources-runtime.js` with its
compiled anchor, not a test-created trust root. The [9E-2 final packet](PHASE-9E2-FINAL-ACCEPTANCE.md)
retains the full frozen identities and historical data acceptance evidence.

All110 developer reference sources were read and the static adaptations reviewed
before execution. C# removes developer namespaces/static public entry wrappers
and adds explicit System/Linq/Collections usings, preserving algorithms/private
helpers. JS removes CommonJS exports and uses a named signature function around
the original function/arrow expression, preserving local argument order. Three
existing named-reference functions retain their bodies. Both reference/source
hashes are pinned; no new oracle, Expected or slow performance fixture is authored.
One-time fixture authoring is outside the test runner and shipping resources.

S5 reuse rechecks every accepted full receipt against current frozen identities,
source hashes, indexed input hashes, exact actuals, case order, phase/job counts,
quotas, barriers, private isolation, raw accounting and final cleanup/ledger.
The installed native SHA matches both generations. Production/frozen/compiled/
native/S5 evidence fingerprints remain unchanged across this task:758 scoped
files. The additive test-runner source selection does not change production
execution semantics; pilot default selection still resolves the same pinned code.
No pilot operation or prior failure/public Run campaign was rerun.

Full per-row package/test-set/signature versions and hashes, source/receipt hashes,
runtime paths, phase deadlines/durations, input/output bytes, Job observations,
attempted count/suffix, cleanup and ledger are in ignored `out/e3-s6/matrix.json`.
Its source receipts remain `out/e3-s5/native/*-full.json` or
`out/e3-s6/native/*-full.json`, selected explicitly by origin. Keep these private
artifacts with this packet; do not package them as application resources.

## 4. Execution, private isolation and ownership

Unchanged actual flow: existing ExerciseService.runOfficial → admitted Prepare →
trusted Registry/private leased plan → existing language adapter/shared driver →
Core/native Jobs → RETURNED observation → VERIFIED barrier → synchronous CONTINUE
→ final Core close/VERIFIED cleanup. One complete set per operation; no batching,
split operations, async consumer, extra slot, queue, worker, cache or lifecycle.
Tests run sequentially with one worker. Each isolated fixture instantiates the
normal existing service/Registry, then stops it and verifies zero ledger before
the next fixture; this is not a claim that one persistent service instance ran
all110 operations. There are no overlapping service operations.

Every row has exactly one Prepare and compile/syntax. C# has one Roslyn compile
Job followed by a fresh dotnet process per case. JS has the unchanged Node24
Prepare probe, parse-only syntax Job and fresh Node execute process per case.
Required barriers verify after C# compile/every returned case and JS probe/syntax/
every returned case. Case barriers are checked separately from final cleanup.
Distinct retained root PID/creation identities and independent watches, prior-Job
process/IO settlement, native quota readback and exactly one release/close are
asserted. No next launch follows an unverified prior barrier. Hooks retain the
Registry pin and service active slot; attempted public Run is rejected as BUSY.

Every child stdin contains only protocolVersion/caseIndex/args with exact indexed
argument hashes. JS Source.json has code/functionName/schema only and fixed child
source; C# harness checks exclude Expected/visibility/Official hash. Pure harness
contracts check input-only signature/count generation. Expected comparison occurs
only in Main test assertions after completion, never in the continuation hook,
adapter, driver or child. All cases retain typed actuals from the existing strict
protocol parser; no product Comparator/Wrong Answer/Accepted verdict is created.

All126 Official rows emit zero public snapshots and reject access through public
snapshot references. Broader public last-result/IPC/owner-generation/cancellation
isolation remains supported by accepted S4 evidence; native public Run parity by
the two accepted S5 ordinary Run operations. These are reused evidence, not new
S6 native public tests. Public production boundaries did not change. Targeted
source exclusion checks keep catalogue fixtures/tooling out of inspected app/build/
shared entry points. Renderer/IPC/Preload receive no new entry or private result.

All operation completions have VERIFIED/complete/processClean cleanup, no pending
IO, no retained native owner, and parsedBytes/nodes/rawBytes=0 after the existing
service/Registry shutdown order. Inputs/native resources are not released early.
The fixture retains the real owner and blocks later launches if cleanup cannot
settle; existing service recovery is its only retry. No cleanup recovery was
needed in this fresh screen.

## 5. Runtime limits, timings and payload observations

Actual host remains Windows x64, OS10.0.26200; Node24.16.0/ABI137; installed SDK
10.0.112/Roslyn. Executables are existing Program Files dotnet/node. Native SHA:
`4dff6a17526293c00e59fc4e04adc1a24b430f49a16ff236116c5c651756035d`.
No download, reinstall, ABI rebuild, SDK/Node selection or probe-policy change.

Prepare10s; compile/syntax30s/2GiB; execute2s/512MiB including startup, serialization
and validation; operation60s; caller cleanup12s; aggregate raw stdout/stderr1MiB;
existing bounded prefixes/suffixes,128KiB private-envelope headroom and Policy B
all remain unchanged. True current phase/operation deadlines are recorded and
checked. No stale Prepare deadline is used during Execute.

Observed extrema below join distinct S5/S6 full rows. Admission-to-first-Core-close
time and phase work durations include runtime startup/validation; rounded values
are observations, not benchmark percentiles or a portable headroom guarantee.

| Observation | C# | JavaScript |
|---|---:|---:|
| Maximum operation-to-close ms |7868 (ch2-01)|2476 (ch4-03, S5)|
| Maximum Prepare work ms |3950|356|
| Maximum compile/syntax work ms |4567|141|
| Maximum execute phase work ms |392|187|
| Maximum aggregate raw bytes |14353|14564|
| Maximum serialized private completion bytes |16432|16464|
| Maximum serialized indexed request bytes |60043|60043|
| Maximum sampled native Job commit bytes |52998144|27324416|

Largest raw/completion payload is ch8-05; largest indexed request is ch7-04.
Every recorded full completion plus128KiB fits1MiB. Raw counts reconcile exactly
with per-Job stdout/stderr before bytes return to Runtime; no quota refund due to
parsing/redaction. Peak native Job observations are not host RSS, a memory leak
certificate or forced memory-limit tests. No broad memory/profiling campaign ran.

High-count observations: NextDate17 cases finishes6778ms C#/2183ms JS; reused
DigitCount21 finishes7513/2476ms; reused Reshape13 finishes6401/1741ms. All are
whole operations, original case order, complete suffix exhaustion. Matrix/array
payloads include Transpose (max request11430 bytes), Rotate11430, LongestPath11536,
MinimumHealth12646 and MaxSubarray60043. No frozen input or case count was reduced.

Current-host **63×2 correct-source single-operation screen is PASS**. General
Official Runtime60s, target-host/release/repeated-run reliability remain
**UNVERIFIED**. One pinned correct source per language and set does not establish
all student algorithm performance, all allowed input headroom or9E-7 acceptance.

## 6. Complete63×2 matrix

S5 denotes reused accepted native execution; S6 denotes newly executed operations.
Cases are attempted/required. Every PASS row also has all attempted cases RETURNED,
correct actuals, empty suffix, barriers VERIFIED and Registry ledger zero. Time ms
is rounded admission-to-Core-close; full phase/byte/Job facts are in matrix.json.

| ID | Language | Origin | Status | Cases | Time ms | Raw bytes | Cleanup |
|---|---|---|---|---:|---:|---:|---|
| ch2-01 | C# | S6 | PASS | 5/5 | 7868 | 474 | VERIFIED |
| ch2-01 | JavaScript | S6 | PASS | 5/5 | 955 | 685 | VERIFIED |
| ch2-02 | C# | S6 | PASS | 3/3 | 4624 | 278 | VERIFIED |
| ch2-02 | JavaScript | S6 | PASS | 3/3 | 640 | 489 | VERIFIED |
| ch2-03 | C# | S6 | PASS | 4/4 | 4673 | 372 | VERIFIED |
| ch2-03 | JavaScript | S6 | PASS | 4/4 | 743 | 583 | VERIFIED |
| ch2-04 | C# | S5 | PASS | 7/7 | 7239 | 674 | VERIFIED |
| ch2-04 | JavaScript | S5 | PASS | 7/7 | 1076 | 885 | VERIFIED |
| ch2-05 | C# | S6 | PASS | 3/3 | 4566 | 275 | VERIFIED |
| ch2-05 | JavaScript | S6 | PASS | 3/3 | 637 | 486 | VERIFIED |
| ch2-06 | C# | S6 | PASS | 4/4 | 7404 | 369 | VERIFIED |
| ch2-06 | JavaScript | S6 | PASS | 4/4 | 956 | 580 | VERIFIED |
| ch2-07 | C# | S6 | PASS | 4/4 | 5646 | 371 | VERIFIED |
| ch2-07 | JavaScript | S6 | PASS | 4/4 | 773 | 582 | VERIFIED |
| ch2-08 | C# | S6 | PASS | 4/4 | 4686 | 370 | VERIFIED |
| ch2-08 | JavaScript | S6 | PASS | 4/4 | 791 | 581 | VERIFIED |
| ch2-09 | C# | S6 | PASS | 4/4 | 4842 | 375 | VERIFIED |
| ch2-09 | JavaScript | S6 | PASS | 4/4 | 733 | 586 | VERIFIED |
| ch3-01 | C# | S6 | PASS | 7/7 | 5218 | 660 | VERIFIED |
| ch3-01 | JavaScript | S6 | PASS | 7/7 | 1162 | 871 | VERIFIED |
| ch3-02 | C# | S6 | PASS | 4/4 | 4693 | 366 | VERIFIED |
| ch3-02 | JavaScript | S6 | PASS | 4/4 | 776 | 577 | VERIFIED |
| ch3-03 | C# | S6 | PASS | 8/8 | 5490 | 754 | VERIFIED |
| ch3-03 | JavaScript | S6 | PASS | 8/8 | 1211 | 965 | VERIFIED |
| ch3-04 | C# | S5 | PASS | 8/8 | 5445 | 758 | VERIFIED |
| ch3-04 | JavaScript | S5 | PASS | 8/8 | 1170 | 969 | VERIFIED |
| ch3-05 | C# | S6 | PASS | 11/11 | 5720 | 1100 | VERIFIED |
| ch3-05 | JavaScript | S6 | PASS | 11/11 | 1498 | 1311 | VERIFIED |
| ch3-06 | C# | S6 | PASS | 14/14 | 6119 | 1292 | VERIFIED |
| ch3-06 | JavaScript | S6 | PASS | 14/14 | 1748 | 1503 | VERIFIED |
| ch3-07 | C# | S5 | PASS | 10/10 | 5266 | 919 | VERIFIED |
| ch3-07 | JavaScript | S5 | PASS | 10/10 | 1343 | 1130 | VERIFIED |
| ch3-08 | C# | S6 | PASS | 17/17 | 6778 | 1709 | VERIFIED |
| ch3-08 | JavaScript | S6 | PASS | 17/17 | 2183 | 1920 | VERIFIED |
| ch3-09 | C# | S6 | PASS | 10/10 | 5519 | 929 | VERIFIED |
| ch3-09 | JavaScript | S6 | PASS | 10/10 | 1338 | 1140 | VERIFIED |
| ch4-01 | C# | S6 | PASS | 4/4 | 4372 | 372 | VERIFIED |
| ch4-01 | JavaScript | S6 | PASS | 4/4 | 702 | 583 | VERIFIED |
| ch4-02 | C# | S6 | PASS | 13/13 | 5685 | 1224 | VERIFIED |
| ch4-02 | JavaScript | S6 | PASS | 13/13 | 1603 | 1435 | VERIFIED |
| ch4-03 | C# | S5 | PASS | 21/21 | 7513 | 1923 | VERIFIED |
| ch4-03 | JavaScript | S5 | PASS | 21/21 | 2476 | 2134 | VERIFIED |
| ch4-04 | C# | S6 | PASS | 4/4 | 4267 | 373 | VERIFIED |
| ch4-04 | JavaScript | S6 | PASS | 4/4 | 752 | 584 | VERIFIED |
| ch4-05 | C# | S6 | PASS | 7/7 | 6541 | 637 | VERIFIED |
| ch4-05 | JavaScript | S6 | PASS | 7/7 | 1013 | 848 | VERIFIED |
| ch4-06 | C# | S6 | PASS | 8/8 | 5086 | 756 | VERIFIED |
| ch4-06 | JavaScript | S6 | PASS | 8/8 | 1120 | 967 | VERIFIED |
| ch4-07 | C# | S6 | PASS | 7/7 | 4820 | 640 | VERIFIED |
| ch4-07 | JavaScript | S6 | PASS | 7/7 | 1052 | 851 | VERIFIED |
| ch4-08 | C# | S6 | PASS | 9/9 | 5129 | 851 | VERIFIED |
| ch4-08 | JavaScript | S6 | PASS | 9/9 | 1383 | 1062 | VERIFIED |
| ch4-09 | C# | S6 | PASS | 6/6 | 4584 | 556 | VERIFIED |
| ch4-09 | JavaScript | S6 | PASS | 6/6 | 940 | 767 | VERIFIED |
| ch5-01 | C# | S6 | PASS | 5/5 | 4441 | 455 | VERIFIED |
| ch5-01 | JavaScript | S6 | PASS | 5/5 | 845 | 666 | VERIFIED |
| ch5-02 | C# | S6 | PASS | 9/9 | 5141 | 822 | VERIFIED |
| ch5-02 | JavaScript | S6 | PASS | 9/9 | 1223 | 1033 | VERIFIED |
| ch5-03 | C# | S5 | PASS | 9/9 | 5178 | 937 | VERIFIED |
| ch5-03 | JavaScript | S5 | PASS | 9/9 | 1207 | 1148 | VERIFIED |
| ch5-04 | C# | S6 | PASS | 6/6 | 4537 | 1582 | VERIFIED |
| ch5-04 | JavaScript | S6 | PASS | 6/6 | 870 | 1793 | VERIFIED |
| ch5-05 | C# | S6 | PASS | 8/8 | 5019 | 729 | VERIFIED |
| ch5-05 | JavaScript | S6 | PASS | 8/8 | 1121 | 940 | VERIFIED |
| ch5-06 | C# | S6 | PASS | 7/7 | 4784 | 662 | VERIFIED |
| ch5-06 | JavaScript | S6 | PASS | 7/7 | 1063 | 873 | VERIFIED |
| ch5-07 | C# | S5 | PASS | 8/8 | 5091 | 1745 | VERIFIED |
| ch5-07 | JavaScript | S5 | PASS | 8/8 | 1119 | 1956 | VERIFIED |
| ch5-08 | C# | S6 | PASS | 11/11 | 5457 | 1004 | VERIFIED |
| ch5-08 | JavaScript | S6 | PASS | 11/11 | 1486 | 1215 | VERIFIED |
| ch5-09 | C# | S6 | PASS | 9/9 | 5716 | 824 | VERIFIED |
| ch5-09 | JavaScript | S6 | PASS | 9/9 | 1289 | 1035 | VERIFIED |
| ch6-01 | C# | S6 | PASS | 4/4 | 4590 | 377 | VERIFIED |
| ch6-01 | JavaScript | S6 | PASS | 4/4 | 759 | 588 | VERIFIED |
| ch6-02 | C# | S6 | PASS | 7/7 | 4883 | 651 | VERIFIED |
| ch6-02 | JavaScript | S6 | PASS | 7/7 | 1081 | 862 | VERIFIED |
| ch6-03 | C# | S6 | PASS | 6/6 | 4857 | 562 | VERIFIED |
| ch6-03 | JavaScript | S6 | PASS | 6/6 | 1028 | 773 | VERIFIED |
| ch6-04 | C# | S6 | PASS | 8/8 | 5115 | 743 | VERIFIED |
| ch6-04 | JavaScript | S6 | PASS | 8/8 | 1123 | 954 | VERIFIED |
| ch6-05 | C# | S6 | PASS | 9/9 | 5448 | 850 | VERIFIED |
| ch6-05 | JavaScript | S6 | PASS | 9/9 | 1262 | 1061 | VERIFIED |
| ch6-06 | C# | S6 | PASS | 7/7 | 5799 | 1342 | VERIFIED |
| ch6-06 | JavaScript | S6 | PASS | 7/7 | 1048 | 1553 | VERIFIED |
| ch6-07 | C# | S6 | PASS | 8/8 | 5158 | 739 | VERIFIED |
| ch6-07 | JavaScript | S6 | PASS | 8/8 | 1090 | 950 | VERIFIED |
| ch6-08 | C# | S6 | PASS | 7/7 | 5099 | 637 | VERIFIED |
| ch6-08 | JavaScript | S6 | PASS | 7/7 | 1044 | 848 | VERIFIED |
| ch6-09 | C# | S6 | PASS | 10/10 | 5575 | 910 | VERIFIED |
| ch6-09 | JavaScript | S6 | PASS | 10/10 | 1456 | 1121 | VERIFIED |
| ch7-01 | C# | S5 | PASS | 5/5 | 4674 | 479 | VERIFIED |
| ch7-01 | JavaScript | S5 | PASS | 5/5 | 933 | 690 | VERIFIED |
| ch7-02 | C# | S6 | PASS | 8/8 | 5583 | 731 | VERIFIED |
| ch7-02 | JavaScript | S6 | PASS | 8/8 | 1259 | 942 | VERIFIED |
| ch7-03 | C# | S6 | PASS | 7/7 | 4966 | 871 | VERIFIED |
| ch7-03 | JavaScript | S6 | PASS | 7/7 | 1021 | 1082 | VERIFIED |
| ch7-04 | C# | S6 | PASS | 8/8 | 5440 | 737 | VERIFIED |
| ch7-04 | JavaScript | S6 | PASS | 8/8 | 1329 | 948 | VERIFIED |
| ch7-05 | C# | S6 | PASS | 8/8 | 4821 | 927 | VERIFIED |
| ch7-05 | JavaScript | S6 | PASS | 8/8 | 1122 | 1138 | VERIFIED |
| ch7-06 | C# | S6 | PASS | 12/12 | 5706 | 1100 | VERIFIED |
| ch7-06 | JavaScript | S6 | PASS | 12/12 | 1660 | 1311 | VERIFIED |
| ch7-07 | C# | S6 | PASS | 9/9 | 5225 | 823 | VERIFIED |
| ch7-07 | JavaScript | S6 | PASS | 9/9 | 1428 | 1034 | VERIFIED |
| ch7-08 | C# | S6 | PASS | 12/12 | 5500 | 1101 | VERIFIED |
| ch7-08 | JavaScript | S6 | PASS | 12/12 | 1675 | 1312 | VERIFIED |
| ch7-09 | C# | S6 | PASS | 12/12 | 5495 | 1104 | VERIFIED |
| ch7-09 | JavaScript | S6 | PASS | 12/12 | 1620 | 1315 | VERIFIED |
| ch8-01 | C# | S5 | PASS | 13/13 | 6401 | 4389 | VERIFIED |
| ch8-01 | JavaScript | S5 | PASS | 13/13 | 1741 | 4600 | VERIFIED |
| ch8-02 | C# | S6 | PASS | 8/8 | 4848 | 12334 | VERIFIED |
| ch8-02 | JavaScript | S6 | PASS | 8/8 | 1259 | 12545 | VERIFIED |
| ch8-03 | C# | S6 | PASS | 5/5 | 4463 | 465 | VERIFIED |
| ch8-03 | JavaScript | S6 | PASS | 5/5 | 885 | 676 | VERIFIED |
| ch8-04 | C# | S6 | PASS | 9/9 | 5266 | 12351 | VERIFIED |
| ch8-04 | JavaScript | S6 | PASS | 9/9 | 1301 | 12562 | VERIFIED |
| ch8-05 | C# | S6 | PASS | 8/8 | 4876 | 14353 | VERIFIED |
| ch8-05 | JavaScript | S6 | PASS | 8/8 | 1180 | 14564 | VERIFIED |
| ch8-06 | C# | S6 | PASS | 6/6 | 4576 | 12072 | VERIFIED |
| ch8-06 | JavaScript | S6 | PASS | 6/6 | 990 | 12283 | VERIFIED |
| ch8-07 | C# | S6 | PASS | 11/11 | 5572 | 1005 | VERIFIED |
| ch8-07 | JavaScript | S6 | PASS | 11/11 | 1455 | 1216 | VERIFIED |
| ch8-08 | C# | S6 | PASS | 9/9 | 5108 | 822 | VERIFIED |
| ch8-08 | JavaScript | S6 | PASS | 9/9 | 1254 | 1033 | VERIFIED |
| ch8-09 | C# | S6 | PASS | 10/10 | 5211 | 913 | VERIFIED |
| ch8-09 | JavaScript | S6 | PASS | 10/10 | 1372 | 1124 | VERIFIED |

## 7. Executed tests and quality gates

| Command / scope | Actual evidence |
|---|---|
| `npx vitest run --maxWorkers=1 tests/main/official-runtime-catalogue.test.ts` |Initial4 PASS/1 FAIL: filesystem integrity exceeded default5s test cap|
| Same file, `-t "matches every manifest7\|refuses partial execution"` |2 PASS/3 name-filtered SKIP;6.76s test work,8.32s total; skipped checks already PASS initially|
| `LEARNING_OFFICIAL_CATALOGUE_LIVE=1 npx vitest run --maxWorkers=1 tests/main/official-runtime-catalogue.integration.test.ts` |110 PASS/0 FAIL/0 SKIP;362.46s total,360.81s tests; exactly one operation per new pair|
| `npx tsc --noEmit -p out/e3-s6/tsconfig.json` |Final PASS, new tests/fixtures and transitive types|
| Targeted ESLint: pilot-native.ts, catalogue-evidence.ts, catalogue-report.ts, both new test files |Final PASS; only corrected files rechecked after changes|
| esbuild catalogue-report.ts → ignored catalogue-report.mjs |PASS,13.8KiB; fixture/tool emission only|
| `node out/e3-s6/catalogue-report.mjs` |PASS:126 rows,1008 cases; explicit110 new/16 reused provenance|
| `node out/e3-s6/boundary.cjs` |PASS:758 scoped fingerprints unchanged|
| Document/matrix consistency, new-file whitespace and `git diff --check` |PASS|

**115 unique tests PASS after corrections:5 contract/audit checks +110 new native
tests.** Preserve the initial1 historical unit FAIL and3 final name-filtered
SKIPs; these are not native skips or missing matrix rows. Do not add the16 reused
operations or prior S1–S5 test counts to115. No native operation was rerun.
S5 still has its original40 PASS,16 full pairs/162 cases/238 Jobs including its
fault/public controls, unchanged in its report.

No production emission/composition changed: no app/native rebuild was needed.
No full suite/repository-wide lint, S1–S5 test rerun, UI/Project/PTY/Monaco/draft/
Electron smoke, broad profiling, Judge/Submit/Storage test, target-host certificate
or20-warm+5-fresh release matrix was run. The80s integration test cap permits the
unchanged Core60s and12s caller cleanup; it is not a runtime deadline increase.

Private ignored evidence:110 new receipts, native-run.log, matrix.json/matrix.md,
758-file boundary-before.json, scoped tsconfig, static-fixture authoring script,
compiled report tool and report/document audit scripts under `out/e3-s6/`.
Retain original S5 ignored receipts with this packet. Report tooling classifies
missing evidence UNVERIFIED and executed failed receipts FAIL, exiting nonzero
unless all126 rows pass; it never fabricates case success.

## 8. Failure classifications and historical corrections

The fresh full-set screen has **no runtime/compile/syntax/protocol/infrastructure,
timeout, cancellation, quota, partial-set or cleanup failure**. Hence it does not
newly demonstrate failure paths. Accepted S5 real-native fault evidence is reused:
STOP, hook exception, compile/syntax, USER_EXCEPTION, INVALID_RESULT, malformed
protocol, infinite-loop TIMEOUT, owner invalidation/CANCELLED and aggregate output
exhaustion, both languages;18 native controls. Public Run adds two historical
native regressions. C# valid FAILED exit0 and JS valid FAILED exit1 remain distinct.
Malformed/host output is not inferred to be a student exception. The JS malformed
transport control is test-only Node --eval under a real Job, as the S5 report says.
No controlled/mock process evidence is substituted for these native observations.

S4 retains controlled owner/generation, hook invalid/Promise/throw, deadline,
retained cleanup/recovery, shutdown and no-late-publication evidence. No S6 change
to those production boundaries warrants rerunning that whole matrix. Forced native
memory exhaustion remains NOT MEASURED; native quota readback alone is not that test.

New tooling history, preserved rather than hidden:

- Initial scoped typecheck rejected three attempted mutations of readonly receipt
  fields in a negative audit test. Corrected by constructing replacement copies;
  affected test/typecheck pass. No production type was loosened.
- Initial read-only315-asset integrity test exceeded Vitest's default5s cap. File
  reads are now independent Promise.all reads with a20s filesystem-test cap.
  The corrected test passes; no Runtime deadline, asset or coverage was changed.
- New report tooling initially had an unused status assignment and implicit any[]
  inference. Explicit assignment on both branches and inferred Promise.all result
  fix lint/typecheck. Rebuilt/rechecked only this affected tooling; native data was
  neither rerun nor modified.
- Windows restricted-token command execution limitations require approved scoped
  shell execution, as in earlier reports. No app security policy was bypassed.
- Historical S1–S5 FAIL/SKIP, source/line-ending, native coverage,9E1-AC1/S5-AC1,
  loader/installed/host/reliability limitations remain in their unchanged reports.
  Current LF-to-CRLF Git notices do not change `.gitattributes` or historical bytes.

## 9. Pending performance models and release limits

All12 models remain **PENDING_RUNTIME**, with their accepted static witness
lineage in the [9E-2 performance register](PHASE-9E2-FINAL-ACCEPTANCE.md).

| Exercise | Exact pending model | S6 classification |
|---|---|---|
| ch4-09 | uncached-recursion |PENDING_RUNTIME|
| ch8-08 | uncached-dfs |PENDING_RUNTIME|
| ch4-07 | trial-all-lower-divisors |PENDING_RUNTIME|
| ch5-08 | ch5-08:uncached-recursion |PENDING_RUNTIME|
| ch5-09 | ch5-09:uncached-recursion |PENDING_RUNTIME|
| ch7-02 | quadratic-ch7-02 |PENDING_RUNTIME|
| ch7-04 | quadratic-ch7-04 |PENDING_RUNTIME|
| ch7-07 | quadratic-ch7-07 |PENDING_RUNTIME|
| ch7-08 | quadratic-ch7-08 |PENDING_RUNTIME|
| ch7-09 | quadratic-ch7-09 |PENDING_RUNTIME|
| ch8-07 | enumerate-scan-all-rectangles |PENDING_RUNTIME|
| ch8-09 | uncached-path-enumeration |PENDING_RUNTIME|

Uncached recursion/path enumeration, quadratic array alternatives, primality
trial-all and rectangle enumeration remain algorithmic risks. Executing the
correct pinned references is not execution of those slow models and proves no
performance mutation kill. No slow fixture/campaign was created or run. Counts
17/21, payload growth, SDK cold discovery/AV, serialization/output accumulation,
startup and retained prefixes remain target-host headroom risks despite this
successful screen. Official general60s/release certification and other target
hosts remain UNVERIFIED; repeat/fresh-app/offline/loader/RSS certification and
the full9E-7 release matrix are outside this task.

## 10. Handoff obligations and stop gate

S6 implementation blockers in the approved current-host bridge screen: **NONE**.
Architecture deviations/new decisions: **NONE**. Production corrections: **NONE**.
S6/Phase9E-3 user acceptance is now recorded. Explicit authorization of9E-4 is
still required before any survey, design or implementation of that phase.

The later Generic Judge must consume only Main-private observations/current
owned plan, preserving single-slot admission, owner/generation guards and leased
work through VERIFIED final cleanup. Expected/visibility/Judge view stay on Main;
language inputs remain trusted signature/count/indexed args. A typed returned
actual with wrong problem value/length remains RETURNED for later comparison.
Private USER_EXCEPTION/INVALID_RESULT/protocol/infrastructure/trusted interruption
must not be collapsed into guessed student blame. Do not publish late success or
turn unsafe cleanup into an Accepted/Failed eligibility claim.

The synchronous CONTINUE/STOP hook remains after RETURNED and VERIFIED case
barrier, with before/after owner/cancel/deadline checks. No Promise/async Judge
lifecycle can be inserted silently. Existing failure evidence includes real
attempted prefix/suffix and cleanup facts; STOP must preserve the exact suffix
without fabricating a runtime error. Public Run requests/results/IPC remain
samples-only and cannot select Official plans. A future comparator/verdict,
hidden-safe projection, Submit or persistence requires its own authorized design
and tests; none is delivered here.

No commit/push/merge. **E3-S6 COMPLETE — PASS WITH LIMITATIONS; user accepted.**
**Phase9E-3 COMPLETE — PASS WITH LIMITATIONS;9E-4 NOT_STARTED. STOP.**

## 11. Formal user acceptance, closure and handoff checklist — 2026-10-25

The user formally approves E3-S6 and Phase9E-3 **COMPLETE — PASS WITH LIMITATIONS**.
This is documentation-only closure based on existing evidence, without new runtime
execution or verification claims. Accepted:126/126 pairs PASS,1008/1008 cases,
110 new operations plus16 reused pilot operations,1197 native Jobs and115 unique
tests PASS after correction. Preserve the historical1 unit FAIL and3 filtered
SKIPs. Native barriers/final cleanup VERIFIED, Registry ledger zero, scoped
public Run compatibility/Main-private isolation and unchanged production/frozen
sets remain the accepted facts, not newly rerun checks.

| Work package | Official status |
|---|---|
| E3-S1 |COMPLETE — PASS WITH LIMITATIONS|
| E3-S2 |COMPLETE — PASS WITH LIMITATIONS|
| E3-S3 |COMPLETE — PASS WITH LIMITATIONS|
| E3-S4 |COMPLETE — PASS WITH LIMITATIONS|
| E3-S5 |COMPLETE — PASS WITH LIMITATIONS|
| E3-S6 |COMPLETE — PASS WITH LIMITATIONS|
| Phase9E-3 |COMPLETE — PASS WITH LIMITATIONS|
| Phase9E-4 |NOT_STARTED — separate authorization required|

Ready to hand off as implemented, within the accepted limitations:

- [x] Main-private Official Case Plan and frozen63-exercise/504-case sets.
- [x] Existing C#/JavaScript Official Runtime, same-service admission and shared
  execution driver.
- [x] Synchronous post-VERIFIED CONTINUE/STOP hook.
- [x] Private actual/error observations, owner-bound completion and real cleanup
  evidence.

Remaining responsibilities of9E-4; checklist only, no new Judge design or code:

- [ ] Generic Comparator.
- [ ] Case Verdict and overall Verdict.
- [ ] Judge reduction, fail-fast and failure classification.
- [ ] Accepted conclusion conditions based on trusted execution, current ownership
  and cleanup evidence, retaining the existing private/public boundaries.

All historical failures/SKIP/limitations and deferred9E-1/9E-2 gates remain.
All12 performance models stay **PENDING_RUNTIME**. General Official Runtime60s,
target-host, reliability and release certification stay **UNVERIFIED**. Current-
host126-operation PASS does not constitute release certification. Prior acceptance
reports, production code, tests/fixtures, Runtime and Official resources were not
edited for closure. No tests/native integration/build/lint/smoke/benchmarks rerun;
only documentation consistency and diff checks. No commit/push/merge.
**STOP. Phase9E-4 remains NOT_STARTED; no survey/design/implementation authorized.**
