# Phase 9D.2 Step 2 — Node.js Resolver & Prepare Probe

Authorized/implemented and accepted by the user 2026-10-22:
**Step 2 COMPLETE — PASS WITH LIMITATIONS** for installed Node development/testing
on the observed Windows 11 x64 host. Phase 9D.2/Common remain `IN_PROGRESS`.
Step 1 remains COMPLETE — PASS WITH LIMITATIONS; Steps 3–6 remain NOT_STARTED.
Step 2 satisfies the prerequisite for Step 3 — JavaScript Harness & Syntax.
Stop for explicit user authorization before implementing Step 3.

## Implementation and boundaries

- `LearningNodeResolver` snapshots absolute Main PATH entries in priority order
  using only the existing pure PATH parser. It never calls the Project resolver,
  a shell/npm/.cmd or CWD lookup. First verified compatible stable 24.x wins; no
  patch lock, major fallback, download or installation. One resolver instance per
  operation admits one discovery attempt; a frozen selection is retained by
  identity and revalidated without rediscovery/upgrade.
- `javascript-node-files.ts` verifies alias and canonical ancestry, junction target
  strings/canonical paths, file/volume IDs, birth/change/write metadata, file size
  and PE x64 header. It checks the open executable and both path chains again
  around reads. Broken/cyclic/changing junctions, replaced/edited executables,
  malformed headers, architecture mismatch, unsafe namespaces/ADS and stale or
  foreign selections fail safely. Verified nvm-style directory junctions work.
  File handles close in finally; pending filesystem work stays under the admitted
  Core task and checks cancellation/due before continuing.
- `WindowsLearningNodeProbe` runs one fixed trusted `--eval` expression that
  reports version, platform/architecture, actual executable path and required
  vm/UTF-8 capabilities. No student source, imports/npm workflow or harness
  execution is implemented. Only SystemRoot/WINDIR and workspace TEMP/TMP are
  inherited; Node options/path/coverage/config hooks are absent. The fixed report
  has exact bounded grammar, fatal UTF-8 decoding and duplicate/trailing/BOM/shape/
  version/capability/path checks. It is private Main data, not a new public DTO.
- Core supplies the existing 512 MiB quota only to JavaScript Prepare; C# Prepare
  still receives null. The Learning adapter maps Prepare processes to that quota,
  retains suspended ownership, checks quota/member/root identity before resume,
  and checks cancellation immediately before launch. Native code is unchanged.
- All candidate inspection/probes inherit the same Prepare signal/due (10 s,
  clamped to the original 60 s operation due). The probe rejects a changed due or
  signal between candidates. It never relabels Prepare as execute. Raw stdout/
  stderr bytes go to Core's cumulative 1 MiB counter before decoding; probe data
  and paths are not published in snapshots. Cleanup drains without rebuffering or
  publishing cancelled data. Before another probe, aggregate termination evidence
  must be VERIFIED; all Jobs/handles remain retained until normal final cleanup.
- Probe lifecycle methods delegate to the existing Windows adapter. The admitted
  test-only Prepare driver exercises resolver/probe under ExerciseSession;
  no production JavaScript Run factory, orchestrator, Service/IPC/Renderer,
  syntax checker or student harness is wired. Step 1 contracts, C# code/contracts,
  Project/Terminal implementations, native code, quotas/deadlines and Policy B
  are unchanged. The only shared Learning production edits are the Core/adapter
  Prepare quota mapping and immediate pre-launch cancellation check.

Version self-report/PE/identity checks are compatibility and stability evidence,
not Authenticode attestation, a guarantee against a hostile concurrent filesystem
actor, or a malicious-code sandbox. Windows Jobs do not restrict file/network
access or account rights. The existing launch-by-path primitive is reused; no new
native handle-based executable launch or OS security boundary is claimed.

## Targeted tests and quality gates

Final unit/regression command:

```text
npm test -- tests/main/javascript-node-resolver.test.ts tests/main/javascript-node-probe.test.ts tests/main/exercise-session.test.ts tests/main/windows-exercise-adapter.test.ts tests/main/csharp-execution-adapter.test.ts tests/main/csharp-compiler.test.ts
```

**159/159 PASS across 6 files.** Covers stable/preview/wrong major, x86/ARM64 PE,
missing/malformed candidates, PATH ordering/no CWD/cmd, Unicode/spaces, safe nvm
junction/broken/cyclic/changed targets, executable replacement/edit, foreign
selection, fixed deadline across candidates, cancellation during filesystem work,
quota read-back drift, no late resume after startup cancellation/deadline, strict
probe output/capabilities, native/observer/stdin faults, output/Job event evidence,
retained cleanup/retry and unchanged Core/C# behavior.

Native command: `npm test -- tests/main/javascript-node-probe.integration.test.ts`:
**9/9 PASS, 10 real Learning Jobs**. Environment: Windows `10.0.26200` (Windows 11),
x64, installed Node **v24.16.0** (observation, not a pin). Each start records real
quota 536870912, member/root identity before resume, independent retained root
observation, final Job/handle state and cleanup proof. Cases:

| Case | Jobs / resumes | Outcome / cleanup |
|---|---|---|
| Installed Node | 1 / 1 | Stable 24.x AVAILABLE; VERIFIED / cleanupComplete |
| Unicode/space nvm-style junction | 1 / 1 | Canonical installed Node selected; VERIFIED / cleanupComplete |
| First-major report fault, next real candidate | 2 / 2 | Same Prepare due, first rejected, real 24.x selected; VERIFIED / cleanupComplete |
| Cancellation during native start | 1 / 0 | OWNER_LOST, no resume; VERIFIED / cleanupComplete |
| Quota read-back fault | 1 / 0 | Refused before resume; VERIFIED / cleanupComplete |
| Observer fault | 1 / 1 | Failure retained, pipes/identity settle; VERIFIED / cleanupComplete |
| Cleanup query failure/retry | 1 / 1 | Ownership/handles retained before retry; no respawn; VERIFIED / cleanupComplete |
| Oversized output fixture | 1 / 1 | OUTPUT_LIMIT across raw bytes; VERIFIED / cleanupComplete |
| Busy-loop probe fixture | 1 / 1 | Real 10 s PREPARE_TIMEOUT; VERIFIED / cleanupComplete |

Fault cases explicitly inject altered test-only native-boundary arguments or
observations; they are not product probe behavior or student harness tests.
All ten independent root observations are signaled, every owned Job released and
handles closed, all leases released and verified session workspaces deleted. No
watchdog kill or substituted cleanup proof. This verifies these owned resources,
not an unlimited stress/leak survey of the whole application.

Real C# compatibility: with `LEARNING_CSHARP_EXECUTE_LIVE=1`, run only
`tests/main/csharp-execution.integration.test.ts -t "compiles and invokes the real catalogue Sum sample"`:
**1 PASS, 21 name-filtered SKIP**, two real compiler/execute Jobs. C# Prepare/Run
and actual Sum result remain valid through unchanged C# production code.

Total distinct executed tests: **169 PASS across 8 files**; 21 other C# cases
were filtered out. `npm run typecheck`, `npm run build` and targeted ESLint on
the ten Step 2 production/test files PASS. Build includes existing native hooks;
the existing Monaco mixed-import warning remains. `git diff --check` and explicit
new-file whitespace checks PASS; protected-domain/Step 1 contract diff is empty.
Full suite, full repository lint, benchmark,
spike matrix and historical lint fixes were not run/performed.

## Evidence and limitations

- Native evidence: `out/learning-javascript-node-step2/2026-10-22T07-26-41-029Z/`
  (`environment.json`, `observations.json`, source/native hashes at test time).
- C# evidence: `out/learning-csharp-execute/2026-10-22T07-30-31-175Z/`.
- Initial native fixture failure preserved at
  `out/learning-javascript-node-step2/2026-10-22T07-24-43-169Z/`: all nine cases
  failed before any launch because spreading a Node-API binding omitted its
  non-enumerable lease/observation functions. The test wrapper now forwards every
  unchanged port explicitly. Four initial targeted lint errors were corrected
  in new code/tests; final targeted lint PASS. No native/Policy B redesign.
- Windows 10, actual UNC installations/remote file identity behavior, ARM64 support,
  full nvm manager lifecycle, antivirus/file-lock permutations, packaged delivery,
  live production UI and concurrent Project Run/PTY smoke were not exercised.
  Project/Terminal source was untouched; no new production integration reaches
  those domains. Installed Node/probe evidence is not JavaScript sample execution
  acceptance; Steps 3+ remain due. Bundling/clean-machine distribution remains 9G.
- No blocking defect remains in the executed Step 2 checks. Review is PASS WITH
  LIMITATIONS, accepted by the user 2026-10-22: **Step 2 COMPLETE — PASS WITH
  LIMITATIONS**. The user accepts the unverified limits above to proceed to
  Step 3; none is promoted to PASS. Packaging/bundled Node remains Phase 9G;
  concurrent Project Run/PTY smoke and JavaScript sample execution remain due.
  C# Prepare/Run and Policy B are unaffected within the verified scope. Step 3
  is eligible but NOT_STARTED, awaiting separate implementation authorization.
  This closure updates documentation only and reuses the recorded evidence;
  no tests, build, lint, benchmark or spike were rerun. No production/test or
  historical lint changes, architecture decision/contract change, commit, push
  or merge was made.
