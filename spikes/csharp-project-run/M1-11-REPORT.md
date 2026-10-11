# M1-11 — C# Project Run UI (2026-10-11)

TASK REVIEW: PASS. M1-11 UI and renderer integration are implemented. M1-12
Core Acceptance was not performed.

## Implementation

- Added a compact C# target selector beside the editor Run controls and a shared
  Dialog target chooser. The chooser uses Main's resolve/select/clear/cancel
  results, shows disabled ineligible candidates and safe candidate reasons, and
  explains `STALE_TARGET` and `PERSISTENCE_RECOVERED`. `SELECTION_REQUIRED`
  never preselects a target, including when one candidate is returned.
- JavaScript remains the current saved `.js` file action, including re-run and
  Stop behavior. The chooser switches explicitly between JavaScript and C#;
  without a valid active `.js` document, C# is the initial mode. This mode is
  local to the active project and is reset on project identity changes.
- C# target identity comes only from the backend resolution. Changing editor
  tabs does not change the chosen `.csproj`. The selected target remains visible
  when Output closes. A running/preparing session pins the target and Stop.
- Extended the existing RunController and Output Panel with C# project/session
  identity, early event adoption, session/project generation filtering, phase
  markers, failure/exit status, and buffered stdout/stderr. The controller
  connects `onProjectEvent` before any `startProject` call. Dirty/conflicted
  retained source is blocked without Save or Run calls; Main's source guard
  remains authoritative.
- Reused `studentIde.run` resolve/select/clear/cancel/startProject/stop/events,
  `RunController`, `useProjectRun`, existing Button/Dialog/theme tokens, and the
  Output Panel. No IPC, dependency, package, backend, process, or contract changes.

## Files changed

- `src/renderer/src/features/output/RunTargetDialog.tsx` — new target and mode
  chooser using the existing Dialog/Button components.
- `src/renderer/src/features/output/EditorRunAction.tsx` — C# selector, explicit
  mode handling, project Run/Stop and preserved JavaScript actions.
- `src/renderer/src/features/output/run-controller.ts` — target operations,
  C# event/session projection, buffering, stop retry and stale-event filtering.
- `src/renderer/src/features/output/OutputPanel.tsx` — neutral empty state,
  C# phases, output streams, failures and completion status.
- `src/renderer/src/App.tsx` — reset local Run mode on project identity change.
- `src/renderer/src/styles.css` — scoped titlebar/dialog/phase styles using
  existing theme variables.
- `tests/renderer/csharp-run-ui.test.tsx` — focused C# chooser/controller/UI tests.
- `tests/renderer/run-output.integration.test.tsx` — JS compatibility
  expectations updated for the new selector and C# listener.
- `docs/IMPLEMENTATION-PLAN.md`, `docs/CODEBASE-MAP.md`,
  `docs/CHANGELOG-THESIS.md` — verified status and actual paths.

## Verification

- `npm test -- tests/renderer/csharp-run-ui.test.tsx tests/renderer/run-output.integration.test.tsx --reporter=dot` — **32/32 PASS, 2 files**.
- `npm run typecheck` — PASS.
- `npm run build` — PASS, including the existing Windows x64 Electron native module build.
- `npm run lint` — **FAIL, 12 errors in the pre-existing**
  `spikes/csharp-project-run/mockups/render.cjs` (CommonJS globals under the
  repository lint rules). No M1-11 file is implicated.
- `npx eslint` on the changed TypeScript/TSX files — PASS, 0 errors. `styles.css`
  was ignored because no CSS lint configuration exists.
- `git diff --check` — PASS.

## Visual and scope limits

`npm run dev` built and started the Electron development process. The available
Computer Use surface returned no native app windows (`apps: []`), and its window
listing API was unavailable, so the running Electron UI could not be visually
inspected. No visual claim is made for narrow-window geometry or either theme.

M1-12 was not run: there was no public-Preload-to-real-.NET/native integration
acceptance, no C# program execution smoke, and no full test-suite acceptance.
No decision/architecture change, commit, push, merge, or milestone transition
beyond M1-11 was performed.
