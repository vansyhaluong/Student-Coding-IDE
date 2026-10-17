# Phase 9A — Acceptance checklist

Recorded: 2026-10-17. Phase status: `IN_PROGRESS`; user acceptance pending.
This report does not mark Phase 9A COMPLETE or authorize 9B–9G.

## Evidence and result definitions

- **Manual PASS:** the user confirmed on Electron that Editor, working code and
  Terminal survive Project Mode ↔ Learning Mode. This records observable behavior;
  it does not prove JavaScript object identity for Monaco models or terminal IDs.
- **PASS (component tests):** assertions in the named Vitest files passed. This
  is not an end-to-end Electron smoke PASS.
- **FAIL (test harness):** the full automated Electron smoke did not finish.
  The serialization issue was fixed; execution subsequently stopped at the
  terminal-input script, where a carriage return is embedded in generated JavaScript.
  The user explicitly deferred further terminal smoke-script fixes. Do not report
  Automated Smoke PASS. This failure alone does not establish a product defect.
- **NOT VERIFIED:** no complete evidence covers the particular acceptance item.
  Intermediate observations from the incomplete smoke are supporting evidence only.

## Acceptance checklist

| Item | Result | Evidence / limit |
|---|---|---|
| Editor survives Project → Learning → Project | **Manual PASS** | User confirmation on Electron |
| Working code survives switching modes | **Manual PASS** | User confirmation; no automated model-identity claim |
| Terminal survives switching modes | **Manual PASS** | User confirmation; terminal session-ID assertion was not reached |
| Exactly eight chapter names/order; selected chapter highlighted | **PASS (component tests)** | `tests/renderer/learning-workspace.test.tsx`; incomplete smoke also reached the eight-button assertion |
| Sidebar collapses/expands while preserving chapter selection | **PASS (component tests)** | Learning component test; incomplete native smoke reached the workspace-width comparison |
| Course introduction and Chapter 1 share one scrollable page | **PASS (component tests)** | Learning component test; native screenshots and preceding scroll assertions support this |
| Chapters 2–8 display shells without Run/Submit or course selector | **PASS (component tests)** | Seven parameterized chapter cases |
| Selected chapter survives Learning → Project → Learning | **NOT VERIFIED** | Final native chapter-retention assertion was not reached; component test covers collapse, not application mode switching |
| All open tabs, active tab, cursor/view state, selected Explorer/Git tab and panel dimensions are restored | **NOT VERIFIED** | User's broad Editor confirmation does not explicitly enumerate these details |
| Project controls cannot receive focus or unintended shortcuts in Learning | **NOT VERIFIED (full coverage)** | Incomplete smoke reached hidden/inert, one focus rejection and synthetic shortcut checks; real keyboard/Tab coverage still needed |
| Local AI opens/closes without exposing Project Tools and restores Learning | **NOT VERIFIED (manual acceptance)** | Incomplete smoke reached overlay/inert/close checks and Chapter 6 screenshot; existing AI component tests passed, but no completed native smoke or user confirmation for this item |
| Project styling and behavior outside the Learning entry remain unchanged | **NOT VERIFIED (full regression)** | Final native before/after style comparison was not reached; no full manual comparison recorded |
| Cursor-inspired appearance across Header, Sidebar and Workspace | **NOT VERIFIED (user approval)** | Introduction screenshot inspected; final visual approval belongs to the user |
| Same Monaco model objects and same terminal session ID after switching | **NOT VERIFIED (internal identity)** | Automated assertions were not reached; observable retention is Manual PASS above |
| Full automated Electron smoke | **FAIL (test harness), incomplete** | No `result.json` PASS report; deferred by user |

## Checks already executed

These results are from the current implementation verification, not reruns during
this documentation-only update:

- `npm run typecheck`: PASS after TS2882 was fixed.
- `npm run build`: PASS, including Main, Preload and Renderer.
- Scoped ESLint for `App.tsx`, Learning TypeScript and its test: PASS.
- ESLint for `scripts/smoke-learning-mode.mjs`: PASS after the serialization fix.
- Vitest: **25 tests passed across 3 files**: `learning-workspace.test.tsx`,
  `ai-chat-panel.test.tsx`, `editor-workbench.test.tsx`.
- `git diff --check`: PASS at the last implementation check.
- `npx electron scripts/smoke-learning-mode.mjs`: FAIL/incomplete as described above.

Native screenshots from the incomplete run are in
`out/phase9a-smoke-oEOS0C/`: `project-before.png`, `learning-introduction.png`,
`learning-chapter-one.png`, `learning-local-ai.png`, `learning-chapter-six.png`.
Screenshots demonstrate captured UI states, not completion of the smoke suite.

## Remaining manual checks

### Header/sidebar alignment correction — 2026-10-17

User-reported misalignment was caused by independent widths: Header 280px,
Learning sidebar 260px/220px and collapsed sidebar 64px. Learning-only CSS now
shares `--learning-sidebar-width` between Header and sidebar, including the
responsive and collapsed states. The compact Header shows the app mark so the
identity text does not overflow its 64px column. No Project selectors were restyled.

**PASS (focused native alignment check):** production Electron renderer at viewport
widths 1280px and 960px, expanded → collapsed → expanded. Measured Header/sidebar
right edges were respectively 260/260, 64/64, 260/260 and 220/220, 64/64, 220/220
CSS pixels. Project Header grid columns matched their pre-switch values. Expanded
and collapsed screenshots were visually inspected.

Evidence: `out/learning-alignment-BI0bZX/result.json` and screenshots in that folder;
temporary check: `out/learning-alignment-check.cjs`. Typecheck, build, all 9 Learning
component tests and `git diff --check` passed again. This CSS-only correction does
not change the full automated smoke status: its Terminal-script failure remains
deferred, and Phase 9A is not COMPLETE.

### User checks still pending

1. Select Chapter 6 (or another chapter 2–8), collapse the sidebar, switch to
   Project and return. Confirm the chapter and collapsed state are retained.
2. Open several files, select a non-first tab and set an editor scroll/cursor
   position. Select Explorer or Git and adjust panel sizes. Switch modes and
   confirm tabs, active tab, view position, sidebar selection and sizes return.
3. In Learning, use Tab/Shift+Tab and the Project shortcuts (open/new/search/
   terminal). Confirm focus never enters hidden Project controls and no Project
   action runs. Confirm normal Learning navigation and AI typing still work.
4. Open Local AI from a chosen chapter, close it using its close button and the
   Header toggle, and confirm the same chapter/scroll position returns with no
   Explorer/Search/Git or Project bottom panels exposed.
5. Confirm only the right content scrolls when reading the introduction through
   Chapter 1; the sidebar remains independent and usable when collapsed.
6. Compare Project appearance and its usual controls before/after switching, in
   the theme/window size you normally use. Approve the Learning Header, Sidebar
   and Workspace styling separately.

Internal object identity cannot be established by visual inspection alone; its
automated verification remains explicitly deferred. Do not ask the user to
repeat the already confirmed general Editor/code/Terminal preservation check.

## Scope and design sources

Primary: `docs/learning/system-design.md` (Cursor). Inspo MCP references retrieved:
Cursor (`https://cursor.com`, `cursor-com`) and Apple Developer
(`https://developer.apple.com`, `developer-apple-com`). Learning uses cream canvas,
restrained typography and hairline separators; Project styling is intended to
remain unchanged. No dependency, global TypeScript configuration, Main/Preload
authority, C# Project Run or 9B–9G functionality was added for this package.

Overall review: **NOT PASS / pending acceptance**. Manual retention evidence is
accepted; remaining checks and the incomplete automated smoke are not concealed.
No commit, push, merge or COMPLETE transition is authorized.
