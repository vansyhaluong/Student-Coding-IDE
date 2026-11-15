# M1-06 — C# Run target discovery/classification

Date: 2026-10-08. **TASK REVIEW: PASS / COMPLETE**.
Acceptance platform: Windows 11 x64. M1-07 is READY / NOT_STARTED; M1 and overall
C# Run remain IN_PROGRESS. No commit, push or merge.

## Scope and starting authority

Explicitly authorized M1-06 only, after COMPLETE M1-01–M1-05. The branch was
`feature/csharp-project-run`; `git status` and `git diff` were clean at this task's
start. Read AGENTS, FR-023, Architecture section 10, ADR-024, Plan section 13.7,
module/capability maps, M1-01 contracts, M1-05 code/report, project identity and
lifecycle, FileSystemService and existing CsharpWorkspace/search discovery policy.
No new decision gate, architecture deviation or dependency was required.

## Files changed

- Added `src/main/services/run/csharp-run-target-resolver.ts`.
- Added `tests/main/csharp-run-targets.test.ts` and
  `scripts/smoke-csharp-run-targets.mjs`.
- Added this report and [captured evidence](evidence/m1-06-targets.json).
- Added a Main verification export to `src/main/services/run/run-runtime.ts`.
- Updated IMPLEMENTATION-PLAN, ARCHITECTURE, CODEBASE-MAP, LANGUAGE-SUPPORT,
  CHANGELOG-THESIS and the FR-023 current-status line in REQUIREMENT.
- No M1-05 implementation, native/process, shared contract, CsharpWorkspace,
  app composition, preload, renderer, selection store or execution code changed.
  DECISIONS and historical M1-04/M1-05 evidence were preserved.

## Discovery and containment

`CsharpRunTargetResolver.resolve(projectId, signal)` gets the active Main authority
from ProjectService and uses FileSystemService listing/canonical authorization.
The caller supplies no root, glob, traversal options, commands or execution data.
Discovery uses the already documented `.git`, `node_modules`, `bin`, `obj`,
`dist`, `build`, `out` exclusions, skips symbolic links/junctions and traverses
nested directories. `.sln`/`.slnx` do not narrow membership or select a target.

Architecture bounds are named constants: 100,000 visited entries, 64 unique
projects including references, and the existing M1-01 4096-character relative
path limit. Canonical Windows identities are deduplicated. Sorting uses normalized
Windows identity followed by a code-unit spelling tie-break, independent of
filesystem enumeration. Overflow never yields a partial READY result.

M1-05 reauthorizes each candidate for evaluation. The resolver compares canonical
identity with discovery and reauthorizes the complete graph before cardinality.
Project changes abort evaluation; cancellation propagates through M1-05's owned
probe cleanup. All temporary project/abort subscriptions are removed in finally.

## Classification and references

All facts come from production M1-05 evaluation. No project XML is parsed here.
Eligibility requires explicit evaluated SDK=true, OutputType=Exe, and no Web,
test, WPF or Forms flag. Empty required facts/invalid boolean values are
UNASSESSABLE. Library/WinExe/non-SDK and excluded project types are INELIGIBLE.

Recognized modern single TFMs are net5.0 through net10.0, plain or Windows-qualified,
not newer than the effective SDK. Unknown/future/other-platform/.NET Framework
shapes are rejected. This conservative recognized-TFM check does not claim runtime
or targeting-pack installation. Any nonempty TargetFrameworks, even a singleton,
is rejected; the resolver never chooses one of multiple frameworks. Nonempty
computed framework identifier/version must agree with .NETCoreApp/the TFM;
empty computed values require an unambiguous recognized TFM and explicit SDK flag.

References remain untrusted until normalized against the referring canonical
directory and authorized inside the active root. Absolute in-root references are
reauthorized; drive-relative/device/escaping/missing references are rejected.
Explicit in-root references in excluded discovery directories are still evaluated,
but are not promoted into discovered candidates. Canonical nodes are evaluated
once; duplicate edges collapse. Cycles and transitive reference failures make
dependent candidates UNASSESSABLE/INVALID_PROJECT_REFERENCE. The 64-node graph
bound also limits depth, and M1-05 bounds each node to 64 reference facts.

## Structured results and cardinality

The existing M1-01 `CSharpRunTargetResolution` DTO remains unchanged:

| Assessed state | Resolution |
|---|---|
| No projects, or all ineligible | NO_RUNNABLE_PROJECT |
| Exactly one eligible, no unassessable | READY with semantic relative target |
| Multiple eligible | SELECTION_REQUIRED, no target |
| Eligible plus any unassessable | SELECTION_REQUIRED, no target |
| No eligible, remaining assessment failures all SDK-related | DEPENDENCY_FAILED |
| Other assessment/discovery failure | FAILED/PREFLIGHT_FAILED |
| Entry/project bound overflow | FAILED/DISCOVERY_LIMIT_EXCEEDED |

Main-only assessments retain candidate classification details, TFM and safe
dependency reasons, including when the wire FAILED DTO omits its candidate list.
They contain no executable, argv, cwd, raw stderr, canonical roots or native
handles. Cancellation/project change/timeout/evaluation/path/reference/cleanup
failures remain distinguishable in bounded Main diagnostics. No renderer API
was exposed. Results are not persisted or treated as future launch authority.

## Automated verification

- **62 M1-06 tests** passed in the final full suite. Tests use real project/filesystem
  services and production M1-05 evaluator with mocked process results, plus
  controlled fault injection. Coverage includes bounds at/over thresholds,
  paths/spaces/Unicode, deterministic case dedup, nested discovery/exclusions,
  junctions and swaps, cancellation/project close, disappearance/identity changes,
  complete-graph reauthorization, predicates, SDK failures, cardinality, explicit
  reference containment/dedup/cycles/transitive failures and graph overflow.
- Intermediate focused M1-06/M1-05/workspace/Run lifecycle run: **248/248** in
  7 files. Three additional regression cases were subsequently added and passed
  in the final full suite below.
- Final `npm test`: **1317/1317**, **87 files PASS**. This includes M1-05's 60
  tests, C# workspace/preflight/semantic/LSP, project, JS Run identity/runtime/
  lifecycle, Terminal and Git regressions.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`: PASS.
- A type-name typo and unused test import were found and corrected before the
  final gates. No flaky test occurred; no unrelated module or timeout was changed.
  Existing non-failing jsdom canvas diagnostic remains.

## Real .NET evidence

Production resolver + production M1-05 evaluator + existing production native
Run adapter, Electron 44, Windows 11 x64: **14/14 PASS**, run ID
`2026-10-08T01-22-07.568Z`.

SDK inventory: 8.0.410, 9.0.314, 10.0.112. Matrix evaluation pinned SDK **8.0.410**
and **10.0.112**, with net8.0/net10.0 and Windows-qualified variants. SDK 9 was
inventoried, not a separate real acceptance target.

- Two real fixture matrices: nested Unicode/spaced Console, Library, Web SDK,
  test-flagged Exe, WPF, WinForms, Windows Console, multi-target and future TFM.
  Solution files do not select/narrow targets; generated-directory fixtures are
  excluded. Both fixture trees were byte-for-byte unchanged after evaluation.
- Test fixtures set evaluated `IsTestProject=true` without external test packages;
  no test framework was restored or run. WPF/Forms/Web use their real SDK
  properties and evaluate successfully without build. **No SKIP/BLOCKED case**,
  SDK download or workload installation.
- Additional cases: one/zero/no-project, malformed-plus-valid ambiguity, missing
  pinned SDK, recursive cycle, outside reference, outside/cyclic junctions,
  cancellation after native creation and eight repeated resolutions.
- Only fixed `--list-sdks`, `--version` and evaluation-only `msbuild` requests;
  no build/restore/run requested. Build/Restore error targets guard matrix fixtures.
- **116 native sessions released**, final ProcessManager **0**, new surviving
  .NET processes **0**; all eight measured handle counts **687**.
- The existing isolated probe is used only for read-only process/handle inspection.
  Native/process and M1-05 sources are unchanged. Separate JS/Git/Terminal/LSP
  native smokes were not rerun and are not claimed as new M1-06 evidence.

Reproduce with the existing installed SDKs/toolchain:

```powershell
npm run build
node spikes/csharp-project-run/build-native.mjs
node_modules/.bin/electron.cmd scripts/smoke-csharp-run-targets.mjs
```

Fixtures use a unique Windows Temp directory outside the open IDE workspace.
Raw run output is saved under ignored `out/m1-06-smoke/<run-id>/results.json`;
the captured file above includes source hashes and exact command evidence.

## Completion and limits

M1-06 acceptance passes; no remaining M1-06 blocker. M1-07 prerequisites are
satisfied, but M1-07 remains NOT_STARTED and requires separate authorization.
No selection persistence, active-editor/LSP heuristic, picker, Run button/Output
change, CSharpRunStrategy, build/run/restore pipeline, stdin or M1-07 code.

Evaluation is trusted project execution, not an OS sandbox. Discovery facts are
not a snapshot against future external edits and do not certify build/runtime/
targeting-pack availability. M1-09 must revalidate launch authority. This package
does not claim full C# Run, manual UI, packaged acceptance or Windows 10 support.
