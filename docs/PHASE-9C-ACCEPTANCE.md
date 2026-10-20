# Phase 9C — Practice & Exercise Workspace acceptance

Date: 2026-10-19. Branch: `feature/phase-9a-learning-mode`.
Implementation reviewed: `11c71a0f0ebd90f76606a5297c5f16ba4b5427ac`.
**TASK REVIEW: PASS. Phase 9C: COMPLETE.**

The user explicitly confirmed all 9C functions PASS in manual Electron testing.
This closes 9C only; it does not grant runtime, Judge or packaged acceptance.
9B is COMPLETE with its previously recorded acceptance limitations retained.

## Exit gate review

| Criterion | Evidence / result |
|---|---|
| Chapter-based exercises, Easy/Medium/Hard | PASS: 63 independently authored exercises, nine per chapter 2–8, three per difficulty; Chapter 1 has no mandatory exercise |
| Function signatures, parameters, return types and starters | PASS: both C#/JavaScript starters, typed JSON samples and provenance; no student Main/Console program required |
| Exercise List, problem, editor and session | PASS: PracticeWorkspace, PracticeEditor and sample/result dock; user-confirmed Electron acceptance |
| Independent document/model ownership | PASS: practice:/// exercise/language Monaco URIs, disposed practice models, no Project document/file API in the exercise editor |
| Language/mode round trips | PASS: independent C#/JavaScript drafts including empty code, guarded navigation/reset/close, automated component and persistence coverage plus manual acceptance |
| No automatic Project/Explorer mutation | PASS: Main writes only separate userData/learning/drafts.json; narrow Practice bridge has no project file or execution capability |
| Sources/usage records | PASS: per-exercise references with independently authored usage metadata, validated catalogue tests |
| Honest runtime and solutions shells | PASS: disabled Run/Submit, no execution result or persisted Accepted claim; My Solutions receives no production saved records |

Six existing types: int32, boolean, string, int32[], string[], int32[][].
The last type is a JSON rectangular array represented as C# int[][], not int[,].

## Verification and provenance

User-supplied prior verification: **87/87 related tests PASS**, typecheck PASS,
Main/Preload/Renderer and native Windows build PASS, git diff --check PASS.
These compilation/build results were not rerun during this closure review.
Manual Electron functional PASS is the user's evidence, not a new automated smoke.
The retained implementation's earlier lint PASS is recorded in the committed
CHANGELOG-THESIS.md Academic Chapter 1 follow-up; this is prior evidence, not a
new full-repository lint run. No production source changed during this review.

Rechecked in this task:

- `npm test -- tests/main/practice-content.test.ts tests/main/practice-ipc.test.ts tests/main/practice-persistence.test.ts tests/renderer/practice-draft-queue.test.ts tests/renderer/practice-workspace.test.tsx --testTimeout=20000`: **82/82 PASS**, five files.
- Initial sandbox attempt could not spawn Vitest workers (EPERM), executed no
  tests, and is not a test PASS. The authorized rerun outside the sandbox passed.
- `npm test -- tests/preload/domain-bridges.test.ts`: **4/4 PASS**. This task's
  selected rerun totals **86/86**; the user's prior 87/87 is recorded separately,
  since its exact invocation was not supplied. No additional test is inferred.
- Code/exit-gate review as above. No 9C source, tests or configuration changed.
- Final documentation git diff --check and new-file whitespace checks: PASS.

## Deferred work

Exercise Runtime and Stop belong to 9D; Run/Submit integration and Judge belong
to the subsequent authorized runtime/Judge packages, with official comparison
and verdicts in 9E. Accepted snapshots, saved solutions and completion commit
belong to 9E, extended progress/quiz/persistence acceptance to 9F. Durable Code
Draft persistence already exists in 9C; it is not Accepted persistence and does
not close 9F. Runtime packaging and clean-machine offline acceptance remain open.

The stale NOT_STARTED tracking is reconciled through IN_PROGRESS (implemented
authorized scope) to COMPLETE after this review and explicit manual acceptance.
No production runtime decision or later phase is completed by this closure.
