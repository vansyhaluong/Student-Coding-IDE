# M1-10 — C# Run IPC and Preload integration

TASK REVIEW: PASS. Verified 2026-10-08. Authorized scope: M1-10 only.
Branch: `feature/csharp-project-run`; initial working tree and diff were clean.
M1-01 through M1-09/M1-09a prerequisites were complete; no new decision gate or ADR.

## Files changed

- Main: `src/main/index.ts`, `src/main/ipc/run-ipc-service.ts`,
  `src/main/services/run/csharp-run-target-requests.ts`.
- Contracts/Preload: `src/shared/contracts/run-project.ts`, `run.ts`, `index.ts`,
  `src/preload/bridge/run.ts`.
- New tests: `tests/contracts/run-project-validation.test.ts`,
  `tests/main/run-project-ipc.test.ts`, `tests/main/csharp-run-target-requests.test.ts`,
  `tests/preload/run-project-bridge.test.ts`.
- Existing fixtures/assertions: `tests/main/run-foundation.test.ts`,
  `tests/renderer/run-output.integration.test.tsx`,
  `tests/renderer/project-explorer.integration.test.ts` (typed API stub only).
- Documentation: Implementation Plan, Architecture, Codebase Map, Language Support,
  Requirement status, Thesis Changelog and this report.

## API and flow

All methods remain under `studentIde.run`; there is no new global execution API.

| Method | Semantic request | Result |
|---|---|---|
| `resolveTargets` | `{projectId}` | Existing `CSharpRunTargetResolution` |
| `selectTarget` | `{kind:'csharp-project',projectId,relativePath}` | Fresh validated resolution after persistence |
| `clearTarget` | `{projectId}` | Fresh resolution after clearing persistence |
| `cancelResolution` | `{projectId}` | `null` after current owner/project request cleanup |
| `startProject` | `{kind:'csharp-project',projectId,relativePath,dirty}` | Early `CSharpRunSession` |
| `stop` | `sessionId` | Existing owned Stop, `null` after successful cleanup |
| `onProjectEvent` | listener | Subscription disposer |

Request methods return `AppResult<T>`. Existing JS `start`, `stop` and `onEvent`
retain their wire shapes/channels. C# events use `run:project-event`; they are not
also sent to the JS listener. Event types are state, phase, stdout, stderr, exit
and error. Every event carries the semantic C# session with project, relative path,
session ID, lifecycle state and phase. Error events carry an allowlisted failure
union, not raw AppError/native details. Output streams retain user program text.

Example for the later M1-11 consumer (no UI implemented here):

```ts
const resolution = await studentIde.run.resolveTargets({ projectId })
if (resolution.ok && resolution.value.state === 'READY') {
  const started = await studentIde.run.startProject({
    ...resolution.value.target,
    dirty: false, // Main still requires the independent saved-source handshake.
  })
  // Retain started.value.sessionId for Stop and event correlation when started.ok.
}
```

Multiple candidates yield SELECTION_REQUIRED until explicit selection. Callers
must use `selectTarget` to persist a choice; merely sending a different path to
Start cannot select it. `startProject` returns STARTING after cheap authorization,
before SDK probes/build. M1-09 then re-reads Main selection, resolves/evaluates and
checks M1-09a source approval. Direct Start with unselected multiple candidates
therefore produces a failed session with SELECTION_REQUIRED, without build/run.
The early response keeps Stop available during the handshake/preparation.

The current implementation permits one outstanding target resolve/select/clear
operation in the single active workspace. A concurrent request returns
REQUEST_IN_PROGRESS; cancel and await cleanup before retrying. This bounds finite
probe resources and serializes persistence mutations without another storage system.
The cancellation method targets the current operation for that owner/project;
it is not a Run-session Stop command.

## Security and lifecycle

- Both Main and Preload use exact validators; request DTOs reject roots, globs,
  executable, argv, cwd, environment, owner IDs and other authority fields.
- Main checks a live trusted main frame, window owner, active authorized project
  and filesystem availability. Async replies recheck frame, owner generation and
  original project object; Preload checks response shape and project/path identity.
- Resolver/store remain Main authority for canonical containment and Console
  eligibility. Responses contain only the semantic resolution, never assessments,
  canonical roots, SDK command details or ProjectReference internals.
- Source guard, canonical identity, fingerprints, re-run serialization, owner
  mismatch rejection and launch checks remain in the existing RunService pipeline.
- CsharpRunTargetRequests registers its scope before creating probes. A distinct
  probe owner avoids recursive cleanup. Explicit cancellation is tracked separately
  from normal disposal and checked after cleanup, so a cancelled query cannot
  return a stale successful response.
- Cleanup failure retains the scope and ProcessManager registration and blocks
  replacement. Cancellation, project transition or shutdown can retry cleanup.
- Project transition guards cancel pending target work; project-changed releases
  the successful transition lease, while transition-settled handles failure.
  Root unavailability, owner navigation/reload/crash/destroy and shutdown invalidate
  pending work. Existing RunProjectLifecycle handles active Run sessions.
- Handlers/subscriptions/phase records are disposed. JS and C# event delivery is
  separated, with stale process events suppressed by RunService's existing generations.

## Verification

**443 tests in 17 files PASS**, including **63 new tests in four files**:

```text
npm test -- tests/contracts/run-project-validation.test.ts tests/main/run-project-ipc.test.ts tests/main/csharp-run-target-requests.test.ts tests/preload/run-project-bridge.test.ts tests/contracts/run-validation.test.ts tests/main/run-foundation.test.ts tests/preload/domain-bridges.test.ts tests/main/csharp-run-targets.test.ts tests/main/csharp-run-target-store.test.ts tests/main/run-source-guard.test.ts tests/main/run-source-guard-lifecycle.test.ts tests/preload/run-source-guard-bridge.test.ts tests/main/run-plan-lifecycle.test.ts tests/main/run-lifecycle.test.ts tests/main/run-project-lifecycle.test.ts tests/main/csharp-run-strategy.test.ts tests/renderer/run-output.integration.test.tsx
```

New test counts: contracts 22, IPC integration 23, request ownership 6, Preload 12.
Coverage includes one/multiple targets; persisted select/change/clear/reopen and
project isolation; invalid DTOs; wrong sender/frame/project/session/owner; early
Start/Stop; phase/output/nonzero failure forwarding; dirty source; deleted target;
selection bypass attempts; re-run/stale callbacks; cancellation during discovery
and final cleanup; switch/close/reload/shutdown; retained cleanup; disposal and JS.

Integration uses production ProjectService/FileSystemService, evaluator/resolver,
atomic persistence/store, CSharpRunPreparation/Strategy, RunService, source guard,
project lifecycle, IPC registry and Preload bridge. SDK process results and execution
processes are controlled ports. Successful cleanup has zero ProcessManager resources;
failed cleanup remains registered until retry succeeds. No new OS/native claim.

Quality gates PASS:

```text
npm run typecheck
npx eslint src/main/index.ts src/main/ipc/run-ipc-service.ts src/main/services/run/csharp-run-target-requests.ts src/shared/contracts/run.ts src/shared/contracts/run-project.ts src/shared/contracts/index.ts src/preload/bridge/run.ts tests/contracts/run-project-validation.test.ts tests/main/run-project-ipc.test.ts tests/main/csharp-run-target-requests.test.ts tests/main/run-foundation.test.ts tests/preload/run-project-bridge.test.ts tests/renderer/project-explorer.integration.test.ts tests/renderer/run-output.integration.test.tsx
git diff --check
```

Each new file also passes `git diff --no-index --check -- /dev/null <file>`.
Initial API-shape assertions expected only the three JS methods; they were updated
for the authorized additive capability. Tests caught a successful project-switch
lease that needed the project-changed signal, and review added the post-cleanup
cancellation regression. Both are fixed. No flaky test or unrelated production fix.

No full test suite, full build or native smoke was run, as requested: RunService,
CSharpRunStrategy, command policy and native/process adapters were not changed.
The earlier M1-09 real Windows execution evidence remains separate.

## Completion and remaining scope

M1-10 COMPLETE. M1-11 NOT_STARTED; ready only for separate authorization.
Milestone 1 and overall C# Run remain IN_PROGRESS. No new C# UI/Output changes,
stdin, Console input, unsupported project types, new dependency or ADR change.
The source handshake remains an approval/revision protocol, not a disk snapshot.
End-user UI, Core Acceptance and packaging still require their later gates.
No commit, push or merge.
