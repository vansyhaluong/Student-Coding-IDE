# Phase 9B — Course Content & Lessons acceptance

Date: 2026-10-17. Branch: `feature/phase-9a-learning-mode`.
**TASK REVIEW: PASS. Phase 9B: COMPLETE**, under the user's explicit final
acceptance instruction and accepted offline-testing limitations below.
9A remains COMPLETE with its existing evidence limits; 9C remains NOT_STARTED.

## Scope delivered

- Exactly eight chapters for Kỹ thuật lập trình, **47 numbered content sections**
  plus eight reference sections, with **42 C# examples**. Each chapter is one
  continuous scroll page, not a sequence of separate lesson screens.
- The 9A general course introduction remains above the supplied Chapter 1
  Markdown in the same scroll page. Replaced the provisional Chapter 1 body and
  Chapter 2–8 placeholders with the supplied course material.
- Supplied `docs/learning/manifest.json` schemaVersion 1 and all eight chapter
  Markdown files remain the authored content inputs. `system-design.md` is only
  the Cursor design reference, not course content.
- Main embeds these fixed inputs as raw strings at build time; there is no
  repository filesystem lookup at runtime. The read-only `learning.getCourse()`
  bridge returns validated course/material DTOs and preserves provenance.
- Renderer uses react-markdown 10.1.0 and remark-gfm 4.0.1, approved by the user.
  HTML and remote images are disabled; reference URLs are displayed as external
  source text without adding browser navigation authority.
- C# display reuses Monaco tokenization without creating editor models or
  executing code. Adds scoped typography, tables, code blocks, Copy Code and
  expandable source/rights metadata. Exercise execution is not implemented.
- No Practice, Quiz, Judge, Run/Submit, draft persistence, CMS or multi-course
  support. No Project Run, Terminal, Project Monaco or 9A mode/AI/state logic
  changes; the Explorer test fixture only gains the required Learning mock.

## Acceptance by criterion

| # | Criterion | Result and evidence |
|---|---|---|
| 1 | Exactly eight chapters | PASS — supplied manifest, component navigation tests and built Electron DOM check across all eight |
| 2 | Real theory in each chapter | PASS — bundled text matches all eight supplied Markdown files byte-for-byte; actual chapter content rendered on Electron |
| 3 | One continuous page per chapter | PASS — code review, component tests and built Electron scrollable page check; no per-lesson screen navigation |
| 4 | General introduction plus Chapter 1 | PASS — component test verifies one scroll region; implementation retains the introduction above actual Chapter 1 content |
| 5 | Markdown, headings, tables, code blocks | PASS — component tests plus native DOM checks for all section headings, all code text and the three supplied tables; Chapter 2 screenshot visually inspected |
| 6 | C# formatting and syntax highlighting | PASS — all 42 built Electron code fences highlighted using the real tokenizer; keyword color differs from base code color, with original code text retained; sample screenshot inspected |
| 7 | Data-driven content outside JSX | PASS — Main bundles manifest/Markdown; React renders DTOs rather than hardcoding theory |
| 8 | Sources and rights metadata retained | PASS — manifest equality, per-chapter source URL tests, native metadata checks; reference flags are not redistribution grants |
| 9 | Offline reading | **Manual Offline PASS** — user confirmed reading Learning material without Internet. Exact chapters, Windows version, launch mode and full coverage were not specified; no claim of manual testing of all eight chapters |
| 10 | Project/Learning switching preserved | PASS within 9B review scope — App mode/state logic unchanged; built Electron chapter and scroll retention through mode round trip; prior 9A Manual PASS for Editor/code/Terminal remains inherited evidence, not a new full regression run |
| 11 | Scope limited to 9B | PASS — diff review confirms no 9C–9G production implementation or Project execution changes |

### Chapter coverage

| Chapter | Content sections | C# examples | Tables |
|---|---:|---:|---:|
| 1 — Giới thiệu môn Kỹ thuật lập trình | 6 | 1 | 1 |
| 2 — Kiến thức lập trình cơ bản | 5 | 6 | 1 |
| 3 — Cấu trúc rẽ nhánh | 6 | 5 | 0 |
| 4 — Cấu trúc lặp | 6 | 6 | 0 |
| 5 — Kỹ thuật xử lý chuỗi | 6 | 6 | 1 |
| 6 — Hàm | 6 | 5 | 0 |
| 7 — Kỹ thuật xử lý mảng một chiều | 6 | 7 | 0 |
| 8 — Kỹ thuật xử lý mảng hai chiều | 6 | 6 | 0 |
| Total | **47** | **42** | **3** |

## Executed verification

Previously executed on the current production implementation, not rerun during
this documentation review:

- `npm run typecheck`: PASS after the authorized Explorer fixture correction.
- Scoped ESLint for changed 9B source/tests/tooling: PASS; the three corrected
  test/tool files were linted again and passed. Not a claim of a new full-repo lint.
- `npm run build`: PASS for Main, Preload, Renderer and the Windows native artifact.
  Vite reported mixed dynamic/static Monaco imports (no separate chunk); build
  exited successfully. No unrelated bundling refactor was performed.
- `npm test -- tests/main/learning-content.test.ts tests/renderer/learning-workspace.test.tsx tests/renderer/learning-material.test.tsx tests/renderer/ai-chat-panel.test.tsx tests/preload/domain-bridges.test.ts`:
  **32/32 tests PASS in five files**. No full-suite claim. The modified Explorer
  integration fixture was typechecked; its entire test suite was not rerun.
- `node scripts/verify-learning-csharp.mjs`: **42/42 examples compile, run and
  match expected UTF-8 output** under net10.0 with invariant culture. Source
  snippets were not rewritten. Output comparison normalizes line endings and
  trailing line whitespace. Artifact: `out/learning-csharp-DqzpFW/result.json`.

Additional check needed to close the real-highlighting evidence gap:

- `npx electron out/verify-9b-render.cjs`: **PASS**, built Electron rendering only.
  All eight pages, 47 content headings, 42 highlighted code blocks with unchanged
  text, source metadata, tables, and chapter/scroll retention were checked.
  Report: `out/9b-render-Stnwfp/result.json`; screenshot:
  `out/9b-render-Stnwfp/chapter-two.png`. The temporary verifier lives under
  ignored `out/`; it is not production code or the deferred offline harness.
- Final review uses Git diff and `git diff --check`; no implementation changes
  require repeating the previously passed compilation/tests.

## Accepted limitations and NOT VERIFIED items

1. **Automated Electron offline test: FAIL/incomplete (harness), not PASS.**
   `out/check-learning-content.cjs` stopped at its `navigator.onLine` assertion
   after requesting CDP offline, before the content checks. This is not proof of
   an offline content defect. The user explicitly accepts Manual Offline PASS
   instead for 9B closure and defers harness repair. It was not rerun or modified
   to remove the failure during final acceptance.
2. Manual offline evidence covers only the user's actual, unspecified reading
   environment and material inspected. **All-eight-chapter manual offline
   coverage is NOT VERIFIED.** The all-eight-chapter built rendering check above
   is separate evidence and is not an automated offline PASS.
3. Development-server Electron reading is **NOT VERIFIED**. Installed/portable
   Windows 10/11 clean-machine offline reading is **NOT VERIFIED** and must be
   checked at the applicable Phase 7/9G packaging gate, including bundled content,
   tokenizer/fonts, all eight chapters, references and fresh application restart.
4. Optional Copy Code clipboard behavior was not separately exercised on native
   Electron. It is **NOT VERIFIED** and does not expand the lesson-reading gate.
5. No comprehensive Project behavior regression or new internal Monaco/Terminal
   identity check was performed. Preserve all evidence limits in
   `PHASE-9A-ACCEPTANCE.md`; this review does not change its results.

These limits are explicit. They are not converted to PASS to close the phase.
No critical product defect or unmet unaccepted 9B exit gate was identified in the
reviewed scope. User acceptance of the offline harness limitation closes 9B's
offline reading gate; it does not close packaged Windows acceptance.

## Next package: 9C preparation only

9A and 9B are COMPLETE; **9C is NOT_STARTED** and requires separate implementation
authorization. Its scope is chapter-based exercises, Easy/Medium/Hard, Exercise
List/Session/Workspace, independent Monaco documents and C#/JavaScript drafts,
with Test/Result and My Solutions shells. It must not simulate real Judge results.

Before dependent 9C implementation, agree and record:

- P9-HARNESS: exercise function signatures, supported parameter/return types,
  serialization, starter-code structure and compatible test data. Comparison and
  custom expected-output semantics must be defined before dependent contracts;
  actual runtime/Judge verification belongs to 9D/9E.
- P9-CONTENT extension: approved authored exercise set, difficulty/chapter mapping,
  description/examples and source/usage-right records. The 9B lesson schema does
  not resolve an exercise schema.
- Applicable ADR-011 state choice for Exercise Session, document/model ownership,
  per-language draft retention, mode transitions and cleanup. P9-STATE only
  resolved 9A App-local mode/navigation state.
- Clear shell behavior for unavailable Run/Submit/Test/Result/My Solutions;
  retain drafts in memory across language/mode switches without claiming 9F
  durable auto-save or saved Accepted solutions.

P9-RUNTIME/P9-EXECUTION (9D), P9-STORAGE (9E), P9-PROGRESS (9F) and P9-PACKAGE
(9G) remain open for their respective packages; do not implement them in 9C.

No commit, push, merge or 9C implementation was performed for this acceptance task.
