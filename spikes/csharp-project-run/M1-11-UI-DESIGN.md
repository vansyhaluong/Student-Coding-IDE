# M1-11 UI Design Review — Survey & Layout Proposal

Date: 2026-10-08. **Design recommendation only; M1-11 NOT_STARTED.**

Authorized scope: source/document survey and this report only. Branch at survey:
`feature/csharp-project-run`; initial working tree clean. No application code,
styles, contracts, tests or dependencies changed. No tests, typecheck, build or
native/.NET smoke run. This is **source-based evidence, not visual verification**:
the running Electron UI and a rendered Orca checkout were not inspected.

Authority: repository `AGENTS.md`; C# extension in `docs/REQUIREMENT.md`;
Run section in `docs/ARCHITECTURE.md`; ADR-024 in `docs/DECISIONS.md`;
`docs/CODEBASE-MAP.md`, `docs/LANGUAGE-SUPPORT.md`; Implementation Plan §13.7,
M1-11; `M1-PRE-UI-REVIEW.md`, including resolved R1/R2 follow-ups. Older ADR/design
paragraphs record historical status; current plan and follow-ups establish
M1-01–M1-10 complete, including M1-09a. Milestone 1 and overall C# Run remain
IN_PROGRESS. This document does not change those statuses.

Visual reference: retain the existing workbench and the direction documented in
`docs/REFERENCE-BASELINE.md`, Orca commit
`4bb337741c335cfcc428d3b4271023566e2dadb8`. Use its documented compact shell,
hierarchy and spacing direction through the existing independently implemented
components; do not copy Orca code/assets or introduce a new visual system.

## 1. Current UI Architecture

The following are observed facts, not proposed behavior.

| Source / symbol | Current behavior and design implication |
| --- | --- |
| `src/renderer/src/App.tsx`, `chrome-center`, `useProjectRun` | Editor tabs and `EditorRunAction` share the center titlebar. Projects sidebar is left; Explorer/Git tools are right, also sharing space with Local AI. Bottom panel switches between Terminal, Problems and Output. Run controller is composed outside Output, so hiding Output need not stop Run. |
| `features/output/EditorRunAction.tsx` | Returns nothing without an active document; current action follows the active JS file. Play/Square icons, ghost small buttons, starting/stopping labels and retry Stop already exist. Current pending-start disabling must not be copied into C# preparation: C# needs Stop before build. |
| `features/output/run-controller.ts` | External-store controller owns views, selected output, pending requests, session filtering and animation-frame stream batching. Views are keyed by case-normalized file path. It subscribes to legacy JS events only; `RunView` has no project execution phase or structured C# failure. |
| `features/output/OutputPanel.tsx` | Shared bottom-panel tabs, resizer, relative-path/status strip, error alert, text stdout/stderr with stream labels, auto-follow unless user scrolls away. Empty copy is JS-only. Current state-only status cannot distinguish C# build from execution. No history picker or phase separators exist. |
| `features/output/use-project-run.ts` | Owns Run event/source-guard connections and project, filesystem availability and shutdown subscriptions. This is the natural place to connect C# events as well, independently of Output visibility. |
| `features/editor/models/editor-model-manager.ts`, `getSourceState` | Project-wide retained documents contribute revision, dirty and conflict state. Checking only the active tab or only `.cs` filenames would weaken the existing guard. |
| `features/output/run-source-guard-controller.ts` | Existing bounded request/session/project guard replies to Main, watches model changes, releases watches and sends unknown state when unavailable. No Save calls or buffer contents. Reuse unchanged where possible. |
| `features/editor/EditorTabs.tsx`, `EditorWorkbench.tsx` | Tabs show dirty dots and preserve document identity; Monaco owns editing/view state and Ctrl+S calls existing Save. Neither component should select the C# target. |
| `src/shared/contracts/run.ts`, `run-project.ts`; `src/preload/bridge/run.ts` | Additive resolve/select/clear/cancel/startProject/onProjectEvent methods plus existing stop. Validated semantic DTOs only. R2 exposes optional `selectionDiagnostic`, not previous saved path, storage error, SDK version or framework display facts. |
| `src/main/services/run/csharp-run-target-requests.ts` | One target discovery/mutation request at a time. Cancellation joins probe cleanup; replacement request must not race the old cancellation. Target-request cancellation is separate from stopping a Run session. |

Appearance from `src/renderer/src/styles.css`: Geist UI font; 12px Output text
and Cascadia/Consolas log font; 32px editor-tab row; 14px Run icons; current Run
button width 94px. Dark neutral surfaces, muted secondary text, theme variables
for borders, warning, destructive and focus ring. Output context uses 4px/8px
padding. Dialog uses a 440px maximum width with viewport inset. Preserve theme
variables and existing light/dark behavior, rather than hardcoding colors.
Window configuration currently has `minWidth: 900`; two resizable sidebars can
still leave the center narrow. Window width alone is not enough for responsive
Run controls.

## 2. Existing Components to Reuse

| Reuse | Scope |
| --- | --- |
| `components/ui/Button.tsx` | Existing ghost/small and primary/secondary dialog actions; Lucide Play, Square and ChevronDown conventions. Accessible names remain explicit when text collapses. |
| `components/ui/Dialog.tsx` | Target chooser shell: title, description, Escape, focus trapping/restoration, actions and responsive width. Add domain-specific content; do not create a new modal framework. |
| `OutputPanel`, `PanelResizer`, bottom-panel tabs | Preserve layout, output text rendering, stream distinction, scrolling and hide behavior. Extend content rather than introducing a C# panel. |
| `RunController`, `useProjectRun` | Extend existing presentation state and connection ownership; preserve legacy JS methods and event path. No second Main lifecycle. |
| `EditorModelManager.getSourceState`, source-guard controller | Reuse all retained project source state and existing Main handshake. Existing Save remains separately user-controlled. |
| Existing theme tokens, focus styles, status/error patterns | Reuse surfaces and typography; status text accompanies color. |

There is no general-purpose workbench quick-pick in the inspected UI inventory.
`ExplorerContextMenu` is tied to filesystem entry actions and pointer positioning;
reuse its interaction conventions, not its component for Run targets. AI support
select/popover components belong to that feature, and are not established shared
Run primitives. A native radio group inside the shared Dialog is enough for the
bounded candidate list. The existing unsaved-transition dialog offers Discard;
do not reuse its Save/Discard workflow as the Run guard.

## 3. Layout Options

All three options use the same resolution, phase, failure and lifecycle behavior
specified in §7. Placement differs; none changes Main selection authority.

### A — Compact target control beside Run/Stop, dialog chooser (recommended)

```text
Editor tabs …              [C# App.csproj ▾] [▶ Run] [■ Stop]
──────────────────────────────────────────────────────────
Editor
──────────────────────────────────────────────────────────
Terminal  Problems  Output                              ×
src/App/App.csproj                              Building…
[Build / restore]
[stdout] …
```

- Keep one Run action and its Stop companion in the existing titlebar position.
  Target control opens `RunTargetDialog`; display relative path in the dialog
  and Output, short name in the titlebar with full accessible label/tooltip.
- Zero targets: `No Console target`; one READY target: its name; unresolved
  multiple or stale/recovered: `Choose target…`. The same dialog explains
  diagnostics, allows explicit selection, refresh and clear saved choice.
- Phase appears beside the path in Output; while active, action text can show
  Preparing/Building/Running, with Stop always discoverable. Errors appear in
  Output and chooser where relevant, not as a mandatory modal for each event.
- Narrow center: truncate target name, then reduce target control to `C# ▾`;
  preserve Stop and an accessible target description. Tabs keep horizontal
  scrolling. Do not fit all phase/error text into the titlebar.
- Cost: one small domain dialog and controller extension. Target remains visible
  when Output is hidden. Long paths require the chooser or Output for full context.

### B — Target control in Output context row

```text
Editor tabs …                                  [▶ Run] [■ Stop]
…
Terminal  Problems  Output                                    ×
[C# src/App/App.csproj ▾]                          Preparing…
```

- Run/Stop remain in the titlebar; choosing/changing target opens Output, whose
  context strip hosts the chooser trigger and phase. Reuse the same Dialog.
- Zero/one/multiple resolution and diagnostics live in Output's empty/context
  area. Run with unresolved selection opens Output and chooser, without starting.
- Errors, build failure, stdout/stderr and exit code are naturally co-located.
  Current JS file mode shares this strip; hide/show Output still does not stop Run.
- Narrow center: wrap context into two rows; toolbar stays small. Target is hidden
  when Output closes, so titlebar must retain at least an explicit `Run C#` versus
  `Run JS` name/tooltip. More clicks and weaker pre-launch visibility than A.

### C — Compact Run section in the right project-tools sidebar

```text
Editor tabs …                  [▶ Run] [■ Stop] | Explorer / Git
Editor                                         | Run target
                                               | [App.csproj ▾]
                                               | Ready
Output: path / phase / stdout / stderr / exit   | Change target…
```

- Keep execution controls in the titlebar; add a compact selection/status section
  to project tools, using the same chooser. Show zero/one/multiple and diagnostic
  text there, and mirror actionable errors in Output.
- More space for paths and recovery explanation; JS mode remains current-file.
  Selection disabled during an active C# session; phase and pinned Stop remain
  visible even if the tools view changes.
- Narrow sidebar truncates labels and opens Dialog for details. Explorer/Git/AI
  visibility makes this less discoverable; requires extra composition rules and
  duplicates context already in Output. Disproportionate for minimal M1-11.

## 4. Comparison

Qualitative design assessment, not usability-test results.

| Criterion | A: titlebar + dialog | B: Output context | C: sidebar section |
| --- | --- | --- | --- |
| Existing UI consistency | High: extends existing action group | High: existing panel | Medium: new sidebar responsibility |
| Target clarity before Run | High, even with Output hidden | Medium, requires Output/context hint | Medium, depends on visible tools |
| Narrow-center behavior | Good with bounded/truncated trigger | Best titlebar economy | Good titlebar, crowded sidebar |
| Implementation complexity | Low–medium | Low–medium; panel-opening coordination | Medium–high |
| Component reuse | High | High | Moderate–high |
| Future language targets | Explicit kind + path scales well | Scales, but remains panel-dependent | More room, more navigation complexity |

## 5. Recommended Layout

**Choose A.** It places target identity next to the action it controls, retains
the existing Output surface, and can be implemented with one domain dialog rather
than a dropdown/quick-pick framework or sidebar redesign.

Proposed interaction policy (a recommendation, not current implementation):

- The chooser exposes `Current file (JavaScript)` and `C# Console project` modes.
  JS continues to use the active saved `.js` file and existing validation.
  C# uses only Main's READY target, including when no editor tab is open.
- Before an explicit mode choice, preserve current JS behavior when a `.js` file
  is active; otherwise show the C# project entry. This changes presentation mode,
  never Console target identity. An explicit mode choice stays local to this
  project activation until changed; it is not a new persisted preference.
- In C# mode, opening another `.cs`, `.js`, library file or no file does not change
  the selected `.csproj`. The visible kind/target label makes this explicit.
  Returning to `Current file (JavaScript)` restores normal active-file behavior.
- Target dialog shows display name plus project-relative path, with eligible
  candidates as radios. Do not preselect a candidate for SELECTION_REQUIRED.
  Ineligible/unassessable entries are disabled with semantic reasons. Keep Main's
  deterministic order. Use a bounded scroll area for up to 64 candidates; a new
  searchable command palette is unnecessary.
- `Use target` calls selectTarget and consumes the returned resolution. It does
  not start Run. `Clear saved choice` calls clearTarget; a returned READY with one
  target is valid and must not be presented as failure to clear. Clearing is not
  “disable Run.” Canceling the dialog does not alter saved selection.
- While a C# session is active, pin its target and Stop in the action group;
  disable mode/target mutation and duplicate C# start until termination. This is
  a minimal UI interaction policy, not a change to Main's allowed concurrency
  across different targets. Preserve existing JS re-run behavior.
- After completion, Run starts a new session. Cleanup failure retains the active
  session and a Retry Stop action; it must not re-enable replacement Run.

Use the existing English UI copy. Suggested sizes are constraints, not verified
pixels: retain the 32px row, existing button/icon sizes and spacing; cap the
target label's share of center width and truncate before tabs/Stop disappear.
Use available center width, not just window breakpoints. Verify this visually
during authorized implementation at minimum window width with resized sidebars,
both themes, long Unicode paths and keyboard focus.

## 6. Component / Controller Mapping

All entries below are proposed future changes; none are implemented by this task.

| Module | Proposed M1-11 responsibility |
| --- | --- |
| `features/output/EditorRunAction.tsx` | Unified mode/target trigger, C# availability independent of active document, phase-aware actions and session-pinned Stop. Preserve JS path. |
| New `features/output/RunTargetDialog.tsx` | Shared Dialog with mode choice, candidate list, semantic diagnostics, explicit Use target, Refresh, Clear saved choice and Cancel. No persistence or IPC authority inside presentation. |
| `features/output/run-controller.ts` | Extend view identity with kind, project and path; C# phase/failure/session state, selection-resolution state, target-request serialization and generation filtering. Keep output selection separate from saved Run-target selection. Reuse stream batching. |
| `features/output/use-project-run.ts` | Connect JS and C# events before any start; preserve source guard; invalidate on project/availability transitions; dispose connections and queued work. |
| `features/output/OutputPanel.tsx` | Neutral empty copy, C# path/phase/failure formatting and explicit Build/Execution separators; preserve stream labels, follow behavior and JS exit display. |
| `App.tsx` | Minimal chooser/composition wiring and show Output callback. Do not tie controller lifetime to visible panel or editor tabs. |
| `styles.css` | Scoped target/list/phase styles based on current tokens, narrow-center rules and focus states. No global layout restyle. |

No required changes identified to Main, shared contracts, Preload, Monaco Save,
EditorTabs, Terminal, Git or Language Service. A pure presentation helper for
phase/failure text is optional if it avoids duplication between toolbar and Output.

| Existing API | Consumer behavior |
| --- | --- |
| `run.resolveTargets({projectId})` | Discover on entering C# mode/chooser and explicit refresh, not every render or keystroke. Cache only presentation state within the current generation. |
| `run.selectTarget({kind:'csharp-project',projectId,relativePath})` | Submit an explicit eligible candidate; replace resolution with Main's response. No optimistic READY or local persistence. |
| `run.clearTarget({projectId})` | Clear through Main; interpret returned state, not old candidate count. |
| `run.cancelResolution({projectId})` | Cancel owned discovery/mutation when appropriate; await cleanup before replacement request. Do not use as session Stop. |
| `run.startProject({...readyTarget,dirty})` | Use exact Main target and project-wide dirty hint. Main's live saved-source checks remain mandatory. |
| `run.onProjectEvent(listener)` | Subscribe before startProject; consume state, phase, stdout, stderr, error and exit. |
| `run.stop(sessionId)` | Stop the pinned owned session, including PREPARING and BUILD_RESTORE. |
| `run.start`, `run.onEvent`; `runSourceGuard` | Keep JS API/event path and existing guard subscriptions; no generic executor or new public API. |

## 7. UI State & Interaction Flow

### Resolution and diagnostics (common to all options)

| State | Presentation / allowed action |
| --- | --- |
| No project / unavailable / switching | Disabled Run and chooser, explicit unavailable context; invalidate local asynchronous results. Main owns cleanup. |
| Discovering | `Finding Console projects…`, chooser Cancel; prevent concurrent resolve/select/clear. This is not PREPARING and has no Run session yet. |
| READY | Display Main's target; Run allowed subject to source/transition state. One eligible candidate commonly yields READY, but count is never authority. |
| SELECTION_REQUIRED | `Choose a Console project`; explicit selection required even if only one candidate remains. No automatic radio selection or start. |
| NO_RUNNABLE_PROJECT | `No runnable Console project found`; explain candidate rejection reasons, allow Refresh or JS mode. Do not imply every `.csproj` is supported. |
| DEPENDENCY_FAILED | Distinguish missing dotnet host/SDK from SDK selection/probe failure; offer Retry/Refresh after user fixes environment. Do not use Node.js or csharp-ls status/copy. No auto-install. |
| FAILED / failed AppResult | Show semantic discovery/persistence/preflight message; do not retain old READY authority as a fallback. |
| STALE_TARGET diagnostic | `The previous target is no longer available or eligible. Choose a target again.` No invented old path or assertion that deletion was the exact cause. |
| PERSISTENCE_RECOVERED diagnostic | `Saved target selection was recovered. Confirm a target before running.` Do not claim corruption as the exact cause or expose storage details. |

Diagnostics supplement state and may accompany failure/no-target results as well
as SELECTION_REQUIRED. Explain recovery even when no candidate can currently be
chosen. Only Main's subsequent READY response clears the selection barrier.

### Run phases, output and failures

1. Ensure subscriptions and source guard are connected; consume current target
   resolution. Show Output when Run is requested. Do not run discovery mutations
   concurrently with selection/start sequencing.
2. Check all retained project editor source state for a helpful immediate warning.
   `Save changed files before running` does not offer Discard or auto-save. Existing
   independent AutoSave settings are not changed. A clean hint does not replace
   Main's bounded handshake and later revalidation.
3. Register the local start attempt before invoking startProject. Adopt the early
   matching STARTING session event. Invoke success means a session was accepted,
   not that SDK resolution, build or execution succeeded.
4. Display precedence: STOPPING → `Stopping…`; terminal state → terminal result;
   otherwise PREPARING → `Preparing…`, BUILD_RESTORE → `Building…`, EXECUTING →
   `Running`. RUNNING lifecycle state alone must not label a build as Running.
5. Stop becomes available as soon as the early session identity is known, even
   while the start promise is pending. If clicked before identity arrives, retain
   cancellation intent for this attempt and issue stop immediately upon its
   matching event/response. Never let this intent stop a later session.
6. Append one presentation separator at each phase boundary, outside raw program
   text semantics. Preserve ordered stdout/stderr and flush buffered text before
   phase/error/exit boundaries. Never parse localized dotnet text to infer phase.
7. Build error: `Build or restore failed (exit N)` with captured output; do not
   imply execution began. Execution failure/non-zero: `Execution failed (exit N)`
   or safe failure text if null. EXITED/0: `Completed (exit 0)`; CANCELLED: `Stopped`.
   Stream color is not a success/failure detector. Preserve semantic failure when
   a later exit event arrives; never overwrite it with generic “Exited.”
8. Source conflict/unknown/change/timeout/unavailable: explain the specific safe
   reason and require a fresh user Run after recovery. No retry loop, auto-save
   or reuse of old approval. SDK/preflight/spawn/observation/cleanup failures have
   distinct safe messages; do not print raw storage/native errors or commands.

### Races, project lifecycle and cleanup

- Track project activation generation, request attempt, target kind/path and
  session ID. Project IDs alone cannot protect a close/reopen of the same project.
  Ignore old invoke responses and callbacks. Do not attach a late unknown session
  merely because its path matches the latest target.
- Handle events arriving before the start response, terminal events before the
  response, repeated events, pending Stop and old-session output after re-run.
  Start response must not reset an already terminal view to STARTING.
- Pin C# Stop independently of active editor and Output visibility. Switching tabs
  or hiding Output neither stops Run nor loses its identity. On project switch,
  close or UNAVAILABLE, invalidate local views/dialogs immediately; do not wait
  for terminal public events, which Main can intentionally mute (R1).
- Main handles renderer reload/destroy and shutdown cleanup; UI has no session
  replay/reattachment API. Reconnect listeners and resolve fresh state after reload;
  do not restore a fabricated Running session from browser storage.
- Dispose JS/C# event handlers, source-guard watchers, model/project/status
  subscriptions, animation frames and presentation buffers. StrictMode remounts
  must not duplicate listeners. Coordinate target-request cancellation so an old
  project-level cancel cannot abort a replacement request for the same project.
- Target request cleanup failure: surface Retry cancellation, retain blocked
  request state and do not submit replacement discovery. Session cleanup failure:
  retain session/Stop retry and block replacement Run until Main reports cleanup.

### UI tests to author during M1-11 (not executed for this review)

- JS unchanged: saved current file, dirty/conflict rejection, re-run, stdout/stderr,
  exit and Stop; explicit mode labels in a mixed JS/C# project.
- Zero/READY/multiple and stale/recovered with one candidate; no implicit radio
  choice, selection, save or start; select/clear failure and cancellation.
- C# Run with no active tab or an unrelated active file; pinned target/Stop across
  tab changes and hidden Output; clear returning READY handled correctly.
- Early STARTING/phase events before response, terminal-before-response, queued
  Stop before identity, Stop while preparing/building/running and step transition.
- Build failure versus execution failure, exit 0/non-zero/null, ordered streams
  and phase markers, no duplicate event output, user-scroll preservation.
- Dirty/conflicted inactive document, source changes during preparation/build,
  guard timeout/unavailable and no automatic Save/retry.
- Project switch/close/UNAVAILABLE/reopen same ID, renderer/controller remount,
  stale resolution/events, rejected cleanup and retry without losing ownership.
- Dialog keyboard/radio navigation, Escape/focus return, accessible disabled
  reasons and status announcements; both themes, narrow center and Unicode/long
  duplicate display names. Do not make the entire high-volume log aria-live.

## 8. Risks & Open Questions

- **Confirmed implementation gap for M1-11:** current controller/actions are
  JS/current-file oriented and lack C# phase handling. The task must adapt them;
  merely wiring startProject into the current click handler is insufficient.
- **Existing non-blocking evidence gap R3:** public IPC/Preload through real
  .NET/native execution has not been evidenced in one combined run. Prior M1-09
  smoke and M1-10 controlled tests are separate. Keep combined acceptance in
  M1-12; this design review adds no execution evidence.
- **Visual verification gap:** proposed truncation, dialog sizing, contrast and
  simultaneous sidebar/tab widths need actual Electron inspection during M1-11.
  Source inspection establishes available primitives, not pixel correctness.
- **Design choice to confirm in implementation planning:** adopt A's explicit
  local mode choice and active-C# target lock. They avoid surprising target changes
  without new persistence or changing Main concurrency. A full concurrent-session
  switcher/history UI is not proposed for minimal M1-11.
- **Contract limits:** no SDK version/TFM badge, raw classification details,
  persisted previous path or replay history is available. Do not manufacture
  these labels or expand IPC to support decorative context.
- **Potential risk, not a confirmed defect:** target-request cancellation is scoped
  to project/owner rather than a public operation ID. Controller serialization and
  generation tests are essential, especially close/reopen and dialog remount.
- No new architecture decision, dependency, stdin/input surface, launch settings,
  target persistence mechanism or generic process capability is required.

## 9. M1-11 Implementation Readiness

**READY FOR M1-11 design-to-implementation planning, subject to separate user
authorization.** Recommend layout A and the behavioral rules above. R1/R2 are
resolved according to their source-backed follow-ups; R3 remains non-blocking.
Existing contracts supply target resolution, selection diagnostics, early session,
phases, failures, output and Stop needed for this minimal UI.

Next activity: **plan the authorized M1-11 implementation around A**, including
controller race tests and actual visual checks before acceptance. This report is
not implementation or acceptance evidence. M1-11 stays NOT_STARTED; no next task
is started automatically. Only this report was created; no commit/push/merge.
