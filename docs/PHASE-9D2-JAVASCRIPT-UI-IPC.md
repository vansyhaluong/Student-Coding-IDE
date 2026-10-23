# Phase 9D.2 Step 5 — JavaScript UI/IPC integration

Authorized 2026-10-23. Review: **PASS WITH LIMITATIONS** within the checks below.
Step 5 is **COMPLETE — PASS WITH LIMITATIONS**, accepted by the user 2026-10-23.
Closure is documentation-only using the existing evidence; no verification was rerun.
Step 6 is NOT_STARTED. Phase 9D.2 and Common remain IN_PROGRESS.
Step 4 was accepted COMPLETE — PASS WITH LIMITATIONS by the user 2026-10-23;
closure uses its existing report/evidence, without rerunning Step 1–4 acceptance.

## Implemented flow and boundaries

The existing Run click captures the live Monaco source/revision. The existing
Exercise request crosses the same validated Preload/IPC channels, with no new
request fields, channels, commands, paths or process capabilities. Main's
production factory now selects WindowsJavascriptExecutionAdapter and
runJavascriptSamples for JavaScript. The adapter snapshots the request and Main
catalogue, resolves/probes once, checks syntax once and runs the catalogue samples
sequentially in fresh Jobs. A narrow optional progress callback publishes settled
phase/case observations; Core still owns barriers, deadlines and final cleanup.

ExerciseSnapshot has an independent optional javascript observation containing
schema/result. The csharp contract and factory branch are unchanged. The shared
validator rejects language mismatches, both fields together, foreign compile/
syntax shapes, invalid values/indices/types, extra authority and oversized full
observation envelopes. The production JavaScript adapter reserves 4096 bytes for
snapshot metadata in addition to its serialized schema/result and existing
future-failure reservation; oversized actuals become OUTPUT_LIMIT. This does not
increase or reset the raw output quota. Common snapshots without a language
observation retain their existing combined raw-stream bound; the full serialized
1 MiB envelope check applies to C#/JavaScript observations.

Main publication and Preload now also bind exercise/language/sourceRevision.
Existing session/generation/sequence ordering, current main-frame authorization,
document epochs and unload cleanup remain in use. Preload returns the latest
authorized buffered event when it beats a Run reply; an older invoke or transport
failure cannot overwrite the newer Renderer observation. Renderer retains the
captured run revision when the editable draft later changes, and retires sessions
on exercise/language changes, leaving Learning or pagehide.

Result Panel reuses the existing sample tabs and Input/Output/Expected fields,
showing actual values, the NOT_RUN suffix, safe syntax diagnostics and distinct
Syntax/Runtime/Protocol messages. No Judge/comparison/verdict or invented runtime
metrics were added. Submit remains disabled; no Stop/Cancel UI was added. No
Editor/model/autosave/Reset/Restore implementation was changed.

No dependency, ADR or architecture change was needed. Project Mode, Terminal,
native Job source, Common Runtime Core and Policy B were not changed by Step 5.
Earlier uncommitted Step 1–4 work was preserved. No commit/push/merge.

## Files added or modified by Step 5

Production:

- src/shared/contracts/exercise.ts, exercise-validation.ts
- src/main/services/learning/exercise-service.ts
- src/main/services/learning/runtime/javascript-execution-adapter.ts,
  javascript-orchestrator.ts (narrow envelope reserve / progress integration)
- src/main/ipc/exercise-ipc-service.ts
- src/preload/bridge/exercise.ts
- src/renderer/src/features/learning/practice/use-exercise-runtime.ts,
  PracticeTestPanel.tsx

Tests/evidence:

- tests/fixtures/learning/javascript-observation.ts (new)
- tests/renderer/javascript-result-panel.test.tsx (new)
- tests/contracts/exercise-validation.test.ts
- tests/main/exercise-service.test.ts, exercise-ipc.test.ts
- tests/preload/exercise-bridge.test.ts
- tests/renderer/exercise-runtime.test.tsx
- scripts/smoke-learning-javascript-ui.mjs (new, test-only)

Documentation: this report, PHASE-9D2-JAVASCRIPT-PLAN.md,
PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md, REQUIREMENT.md, ARCHITECTURE.md,
DECISIONS.md (status only; no decision reopened), CODEBASE-MAP.md,
LANGUAGE-SUPPORT.md, IMPLEMENTATION-PLAN.md and CHANGELOG-THESIS.md.

## Targeted verification

**172 distinct targeted tests PASS.** Commands:

```text
npm test -- tests/contracts/exercise-validation.test.ts tests/main/exercise-service.test.ts tests/main/exercise-ipc.test.ts tests/preload/exercise-bridge.test.ts tests/renderer/exercise-runtime.test.tsx tests/renderer/javascript-result-panel.test.tsx tests/renderer/csharp-result-panel.test.tsx tests/renderer/practice-editor-sync.test.tsx tests/renderer/practice-draft-queue.test.ts tests/renderer/practice-workspace.test.tsx
```

171/171 PASS on the ten selected files. The final Main IPC context assertions
and one additional malformed-JavaScript Preload test were then verified with:

```text
npm test -- tests/main/exercise-ipc.test.ts tests/preload/exercise-bridge.test.ts
```

24/24 PASS (one new distinct test). Final adapter production-reservation check:

```text
npm test -- tests/main/exercise-service.test.ts -t 'production JavaScript factory'
```

1 PASS, 22 name-filtered skips; no Step 1–4 suite or native matrix rerun.

Coverage: production factory/immutable source/revision/Main samples, detached JS
observations through service/IPC/Preload, actuals and NOT_RUN, syntax/runtime/
protocol presentation, malformed/mixed/foreign/oversized observations, stale
identity/context/sequence, buffered events and late invoke/errors, active context
switch/pagehide, owner/frame/document epoch and unload lifecycle. Existing C#
Result Panel, draft queue, editor replacement/Reset/Restore and workspace tests
pass in this selected scope. C# execution was not re-accepted by this test run.

Initial targeted run: 164 PASS / 2 FAIL. A blanket full-envelope check had changed
the existing Common raw-only boundary; this was corrected to preserve that
contract while enforcing the full bound on C#/JS observations. The subsequent
171-test run and final 24-test checks pass. Initial typecheck also caught the
missing orchestrator progress parameter, corrected before the passing gates.

Quality gates: npm run typecheck PASS; npm run build PASS; targeted ESLint on all
nine changed production files, seven test/fixture files and the smoke script PASS.
git diff --check and explicit new-file whitespace checks are recorded at final
review. Existing Monaco mixed static/dynamic import build warning remains.
No full suite, repository lint, benchmark or spike matrix was run.

## Controlled production Electron smoke

```text
.\node_modules\.bin\electron.cmd scripts/smoke-learning-javascript-ui.mjs
```

PASS evidence: out/learning-javascript-ui-step5-1792716585017/evidence.json,
with samples.png, syntax.png and runtime.png. Windows 11 10.0.26200 x64,
Electron 44.0.0; installed Node v24.16.0 observed on the host, not a patch pin.
The secure production window keeps sandbox/contextIsolation enabled and
nodeIntegration disabled. Browser input edits the actual Monaco model; the
fixture captures its identity/source immediately before the real Run click and
asserts exact IPC source equality. Three operations use distinct captured source
revisions (32, 47, 93):

- Sum: two Main catalogue cases, actuals [8, 0], each visible through sample tabs.
- Syntax error: no cases attempted, NOT_RUN [0, 1], safe syntax observation/UI.
- Runtime error: failed case 0, NOT_RUN [1], safe runtime observation/UI.

All final snapshots have VERIFIED proof, processClean/cleanupComplete, REMOVED
workspace and no pending I/O. Nine real Jobs have released=true and
handlesClosed=true; managed shutdown reaches will-quit. Submit remains disabled
and Result Panel has no Accepted/Wrong Answer/Passed/Failed verdict. Source,
schema, actuals, errors and screenshots are real, not replacement responses.

Initial smoke attempts failed in the test fixture: it focused a Monaco textarea
before language remount completed, then spread a native module whose methods are
not enumerable. The fixture now waits for the new editor and forwards named
native methods. These failed observations remain in their out/ directories;
only the evidence directory above is the passing run. No production debug
endpoint or replacement result was introduced.

## Limits and review

The passing smoke records Renderer console errors:
`Cannot read properties of undefined (reading 'get')`. Their origin is not yet
isolated. Actual Monaco editing/source capture, sample selection, all three Run
observations and managed shutdown passed; editor/draft unit regressions passed.
This report does not claim an error-free Monaco console or establish whether
that console error predates Step 5. Investigating broader Monaco internals is
outside this integration change and remains a named limitation.
The user accepted this unresolved issue as a Step 5 limitation on 2026-10-23.
Investigate its root cause in the next verification stage when separately
authorized; this closure neither resolves the error nor starts Step 6.

Windows 10, actual UNC, packaging/bundled Node (9G), live concurrent Project/PTY
and the full six-type/resource/lifecycle Step 6 matrix were not executed here.
Protocol presentation is covered by targeted tests, not a forged real-child
response in this smoke. Node/vm/Jobs do not add malicious-code OS isolation.

TASK REVIEW: **PASS WITH LIMITATIONS** for authorized Step 5 integration.
No architecture deviations or unresolved integration-test failures in the recorded checks.
Step 5 is COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23.
Step 6 stays NOT_STARTED and requires a separate user request; stop here.
