# Phase 9D.2 — JavaScript Learning Run final review

Date: 2026-10-23. Final user acceptance: **Step 6 and Phase 9D.2 — COMPLETE —
PASS WITH LIMITATIONS**. The user explicitly accepted this conclusion and all
named limitations; official documentation closure is now applied using existing
accepted evidence only.

Actual status: Steps 1–6 and Phase 9D.2 **COMPLETE — PASS WITH LIMITATIONS**.
Phase 9D.1 retains **COMPLETE — PASS WITH LIMITATIONS**; 9D Common remains
**IN_PROGRESS**; Phase 9E remains **NOT_STARTED**. No subsequent package is started
or authorized by this report. Unverified scenarios remain UNVERIFIED and full
repository lint remains FAIL; acceptance does not convert those gates to PASS.

## 1. A02 closure and review method

The user accepted **A02: FIXED — PASS** on 2026-10-23. A01 is also accepted
**FIXED — PASS**. Neither remains an unfixed production acceptance blocker.
Original failures, investigation variants and failed fixture attempts remain
unchanged in the [acceptance report](PHASE-9D2-JAVASCRIPT-ACCEPTANCE.md#12-defect-a02--step-5-renderer-console-investigation)
and original evidence directories.

A02 evidence: 23 targeted tests PASS; actual Electron JS/TS syntax and semantic
diagnostics, invalid-to-valid marker updates and other worker checks PASS with
zero captured worker exceptions. Two UI JavaScript Runs return [8,0], cleanup
VERIFIED. Typecheck, build, targeted lint and diff checks PASS. Binder is present
in both production TypeScript workers. Each grows 117,898 bytes, approximately
115.1 KiB / 0.894%; other worker hashes/sizes are unchanged. No reliable cold-start
delta is claimed. Full details remain in acceptance Section 15.

This final review reads source, accepted step reports, JSON/log evidence and
hash manifests. It runs no tests, build, lint, benchmarks or acceptance matrix.
No important missing evidence attributable to the narrow A01/A02 changes was
found that requires additional tests. The gaps below are retained explicitly.

Authority: Requirement Section 21, Architecture's approved 9D.2 design, ADR-025,
Language Support, Codebase Map, Implementation Plan Section 13.6 and the
[six-step plan](PHASE-9D2-JAVASCRIPT-PLAN.md). The plan's Step 6 closure rule
requires the evidence **or explicit user acceptance of named limitations**;
the user's final acceptance closes 9D.2 by that route, without closing Windows
10/Common/9G.

## 2. Steps 1–6 traceability

| Step | Implementation / acceptance review | Existing evidence; not newly executed |
|---|---|---|
| 1 Contracts | Accepted COMPLETE — PASS WITH LIMITATIONS. Independent bounded JavaScript DTOs, strict UTF-8/JSON/schema/type/exit validation; no comparison verdict | Plan records 308 targeted PASS (172 JavaScript, 136 Common/C#); Step 6 merged JSON independently contains 172 passing JavaScript contract assertions |
| 2 Resolver/Probe | Accepted COMPLETE — PASS WITH LIMITATIONS. Learning-only stable Node 24.x selection, identity/revalidation, owned Prepare probe and original budget | [Resolver report](PHASE-9D2-NODE-RESOLVER-PROBE.md): 169 PASS, including 9 real probe tests / 10 Jobs and one C# live regression |
| 3 Harness/Syntax | Accepted COMPLETE — PASS WITH LIMITATIONS. Fixed child, parse-only syntax, six synchronous types, strict protocol and bounded safe errors | [Harness report](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md): 259 PASS including 60 real native cases; 172 Jobs VERIFIED/closed |
| 4 Orchestrator | Accepted COMPLETE — PASS WITH LIMITATIONS. Prepare/syntax once, fresh sequential case Jobs, fail-fast suffix and VERIFIED barriers | [Orchestrator report](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md): 160 targeted PASS, 16 real JS cases / 57 JS Jobs and real C# multi-case regression |
| 5 UI/IPC | Accepted COMPLETE — PASS WITH LIMITATIONS. Production factory, existing IPC/preload, immutable source/revision and independent result observation; tabbed Result Panel | [UI/IPC report](PHASE-9D2-JAVASCRIPT-UI-IPC.md): 172 distinct targeted PASS and real Windows 11 Electron smoke |
| 6 Acceptance | User accepted COMPLETE — PASS WITH LIMITATIONS after accepted A01/A02 fixes | Acceptance matrices, R/F/W evidence below; original failures retained, unverified scenarios not promoted to PASS |

Counts overlap across packages and reruns; they are not summed. Historical reports
retain their original later-step statuses as history; current status is above.
The original link to PHASE-9D2-JAVASCRIPT-CONTRACTS.md has no file in this checkout;
neither do PHASE-9D-COMMON-STEP7-ACCEPTANCE.md and PHASE-9D1-FINAL-REVIEW.md.
Their contents are not inferred. Step 1 acceptance is recorded in the actual
approved plan; implementation/tests and Step 6 JSON are available. Common/C#
evidence is also available in the actual Implementation Plan and executed
artifacts. These missing report references are documentation traceability limits,
not evidence of an unexecuted test having passed.

## 3. Final Step 6 matrix

PASS means the stated scope was verified, not universal compatibility.

| Acceptance area | Result | Evidence / precise boundary |
|---|---|---|
| Renderer → existing IPC/Preload → Main → Node → Result Panel | PASS | Production factory captures source/revision and Main catalogue samples; live Monaco source equals IPC request at real Run click; actuals shown in tabs. R functional/stale, Step 5, W production-run |
| Six data types, boundaries, empty arrays, Unicode, rectangular matrices | PASS at contract + real Node/native harness level | All six input/return types exercised; production catalogue UI covers all six as parameters, five as returns. Production UI string[] return remains separately UNVERIFIED |
| Production UI string[] return | UNVERIFIED | Catalogue has no such return exercise; no custom case/content was added to manufacture coverage |
| Sequential samples, actuals, fail-fast and NOT_RUN | PASS | Fresh process/Job per sample, syntax/Prepare failures launch none; exact attempted prefix/unattempted suffix. R functional/errors, real multi-case, F timeout |
| Syntax/runtime/protocol/dependency errors | PASS in tested scope | Real malformed source/returns, unsupported imports/npm/async/Promise/thenable, contamination and missing/invalid PE candidate; no protocol-to-actual conversion or host stack. Actual second installed incompatible Node major is UNVERIFIED |
| Prepare timeout A01 | PASS — FIXED | Core PREPARE_TIMEOUT and JavaScript TIMEOUT/prepare agree; all samples NOT_RUN, lifecycle invalidations suppress stale publication; F real reproduction + 32 targeted tests |
| Deadlines | PASS with composition scope | Prepare 10s, syntax 30s, execute 2s; shared 60s operation due and 12s cleanup wait retained. Production Prepare/syntax/execute evidence plus Common real-clock 60s/12s and JS shared-due tests; not a full 60s production JS catalogue run |
| Memory/output limits | PASS | Production 512 MiB quota read-back and actual owning Job event 10, not V8 OOM inference; syntax 2 GiB; combined raw stdout/stderr 1 MiB across phases/cases. Native allocator mechanism separately tested at 64 MiB |
| Cancellation, stale results and ownership | PASS in exercised paths | Prepare/syntax/execute cancellation, exercise/language/leave/pagehide/unload/shutdown; session/generation/sequence/revision/context/frame/document epoch validation, late event/invoke handling. R lifecycle/stale, F owner tests |
| Policy B / VERIFIED barrier / cleanup | PASS in exercised paths | Retained Jobs, descendants/identities, EOF/streams, leases, checkpoints, workspace removal and final managed shutdown; unresolved process blocks admission/quit, retry retains tasks; history gap quarantined rather than fabricated VERIFIED. R retained/history/shutdown, Common and native suites |
| Recovery | PASS mechanisms; full production crash/restart UNVERIFIED | Actual native owner-exit tree cleanup/lease release and seeded Common checkpoint recovery are separate evidence, not one production JS crash-and-restart scenario |
| Monaco diagnostics A02 | PASS — FIXED | Real JS/TS worker calls and automatic error markers clear after correction; CSS/HTML/JSON worker services and six worker labels tested; binder retained. W diagnostics-v3 |
| Editor typing/cursor/selection/autosave/Reset/draft restore | PASS in recorded methods | Real Unicode typing, cursor, selection command, persisted draft, Reset cancel/confirm/undo and language-switch draft restore; original editor reload regression also PASS. Native Shift+Arrow selection is UNVERIFIED |
| Production Accepted Solution Restore | UNVERIFIED / Phase 9E | No production Accepted records supplied. Component confirmation/replacement tests PASS separately; no Judge or saved Accepted data fabricated |
| C# Learning Run, Project Run and Terminal isolation | PASS in tested scope | R production-isolation-v2: live Project heartbeat/PTY before/during/after Learning plus real C# [8,0]; selected C#/Project/Terminal regressions and Common checks. No changed domain source from A01/A02 |
| No Judge/Submit/custom cases/Stop UI | PASS | Runtime emits observations, UI shows actual/expected/NOT_RUN, no Accepted/Wrong Answer/Passed/Failed execution verdict; Submit disabled. Existing empty My Solutions presentation is not Judge support |
| Offline installed-runtime operation | PASS, per-application | Installed Node v24.16.0 x64, local assets, renderer offline/blocked remote requests, no download/npm install/fallback. Not whole-machine disconnected or clean-machine distribution acceptance |
| Windows 11 ABI/path/junction scope | PASS in stated scenarios | Electron 44.0.0 / native x64, case/drive/spaces/Unicode and verified temporary junction; controlled target-switch/replacement rejection. Actual installed-version switching/locked executable/AV delays remain UNVERIFIED |
| Windows 10 / actual UNC / packaged or bundled Node | UNVERIFIED | No Windows 10 host/share; delivery/runtime bundling belongs to 9G; no inferred OS PASS |
| Typecheck/build/targeted lint/diff checks | PASS from relevant recorded runs | Step 6 and both fixes; final review repeats document diff/whitespace only |
| Full repository lint | FAIL — historical limit | 1,106 recorded errors in existing spike/evidence files; targeted lint passes, full gate is not relabelled PASS or rerun |

## 4. Evidence and test accounting

Separate evidence roots, each retaining its original snapshots/results:

- `R = out/learning-javascript-acceptance-step6-1792717832533/`:
  commands.json, summary.json and merged-regression.json. **907 PASS / 11 SKIP**
  is the latest-per-assertion result compiled from targeted runs, not one suite.
  Initial 903 PASS / 1 FAIL / 1 SKIP (missing native allocator helper), native
  rerun 6 PASS and live C# 3 PASS / 10 filtered skips remain separate original logs.
- `F = out/learning-javascript-a01-fix-1792721044399/`:
  **32 targeted PASS**, 26 name-filtered skips; deterministic pre-fix FAIL retained.
  Real prepare-timeout-repro PASS, 11,116.9805 ms, one Job/two signaled identities,
  VERIFIED cleanup, lease/handles closed, workspace removed and managed shutdown.
- `W = out/learning-javascript-a02-fix-1792722222643/`:
  **23 targeted PASS**, no skips; diagnostics-v3, production-run, worker comparison
  and final review manifests. Two real UI Runs, eight actual Jobs, [8,0], VERIFIED
  cleanup, no worker exceptions. Initial fixture/lint failures remain separate.
- Common: `out/learning-common-step7-1792718768796/evidence.json`, 14 scoped checks;
  editor: `out/learning-editor-sync-1792719139580/evidence.json`;
  fresh real six-type harness: `out/learning-javascript-harness-step3/2026-10-23T01-16-48-772Z/`.

Final review reopened the actual R group artifacts for functional/errors/faults/
lifecycle/isolation/stale/history/retained/shutdown/paths/syntax-timeout: all
referenced passing groups record PASS and managedShutdown=true. The resource
group contains an actual Job memory-limit event 10. Original R timeout FAILs and
A02 default-build FAIL remain historical failures, superseded only in their
specific corrected scenarios by F/W; they are not edited into PASS.

Hash review confirms A01 adapter/tests/reproduction and A02 config/fixture still
match their post-fix manifests. All protected src/package/lock files match W's
baseline; the approved worker config is the sole baseline config change. No
production/test/script edit occurs in this final review. 907, 32 and 23 are three
separate result sets and must not be added into a new suite count.

## 5. Remaining findings and accepted limitations

No known unfixed production blocker remains in the demonstrated installed-Node,
Windows 11 Learning Run scope. This is not a claim that all production code,
Windows platforms or launch environments are defect-free.

The user explicitly accepted the following limitations for 9D.2 closure; their
recorded FAIL/UNVERIFIED/unresolved states remain unchanged:

1. Windows 10 and actual UNC are UNVERIFIED; no Windows 10 or Common gate closes.
2. Packaging/bundled Node, clean-machine offline delivery and fallback policy
   remain Phase 9G; current evidence uses preinstalled Node only.
3. Production Accepted Solution Restore remains Phase 9E; production UI
   string[] return coverage is absent despite real native return-type evidence.
4. Full production JS crash/restart, actual multi-installed-major selection,
   live nvm/installed-target switching, locked installed executable and AV launch
   delay remain UNVERIFIED. Controlled mechanisms do not imply those scenarios.
5. Worker cold-start delta and native-key selection remain UNVERIFIED. Monaco
   command selection and observed worker requests are narrower passing evidence.
6. Two pre-existing sandbox startup console messages (sandboxed_renderer.bundle.js
   and null binding.startupData) remain unresolved observations. Inspector
   attachment causality is unestablished; no associated functional/security
   regression was demonstrated in the checked secure preload/editor/Run flows.
   A02 worker exceptions are resolved; error-free startup is not claimed.
7. Full lint retains its real FAIL (1,106 historical errors); targeted touched-file
   lint passes. Missing historical report references are retained traceability
   limitations, not invented supporting contents.

These are bounded coverage/deferred-package/tooling/observational limitations,
not reopened A01/A02 failures or permission to weaken quotas/ownership/security.
The approved architecture still states node:vm/Jobs are not a malicious-code OS
sandbox and do not guarantee filesystem/network isolation or absolute child
result authenticity. That boundary is unchanged and is not a new security claim.

## 6. Official closure and stopping point

The user accepted **Step 6 and Phase 9D.2: COMPLETE — PASS WITH LIMITATIONS** on
2026-10-23. Steps 1–5 retain their accepted COMPLETE — PASS WITH LIMITATIONS.
A01/A02 remain FIXED — PASS. Closure relies solely on the existing accepted
evidence and named limitations above, with no new execution or inflated counts.

Official 9D.2 closure is applied. Phase 9D.1 remains COMPLETE — PASS WITH
LIMITATIONS; 9D Common remains IN_PROGRESS; 9E remains NOT_STARTED. The next
package requires the user's separate decision, prerequisites and authorization.
No Common/Windows 10/9G gate is closed and no security/runtime scope is expanded.

Only documentation is updated: this report, acceptance report, JavaScript plan,
Implementation Plan and thesis changelog. Document diff/whitespace checks PASS;
no tests/build/lint rerun, no code/tests/scripts change, no commit/push/merge.
Stop after this documentation closure for the user's next decision.
