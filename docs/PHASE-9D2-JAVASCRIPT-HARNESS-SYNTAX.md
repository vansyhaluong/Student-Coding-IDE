# Phase 9D.2 Step 3 — JavaScript Harness & Syntax

Authorized/implemented 2026-10-22. Review: **PASS WITH LIMITATIONS** for installed
Node development/testing on the observed Windows 11 x64 host. User accepted
Step 3 `COMPLETE — PASS WITH LIMITATIONS` on 2026-10-22. Steps 1–2 remain COMPLETE — PASS WITH
LIMITATIONS; Phase 9D.2/Common remain IN_PROGRESS; Steps 4–6 remain NOT_STARTED.
Step 3 is eligible for Step 4 — JavaScript Orchestrator; stop for separate user
authorization before implementation. This closure updates documents only;
tests/build/lint/benchmark/spike were not rerun and production/tests were not edited.

## Files and authorized scope

New Main runtime files under `src/main/services/learning/runtime/`:

- `javascript-harness.ts`: fixed raw asset writer, catalogue request composition
  using Step 1 validation, retained prepared-input/file identity checks.
- `javascript-harness-child.mjs`: trusted fixed Node child program and vm bootstrap.
  Imported with existing Vite raw-asset support; never evaluated in Electron.
- `raw-harness.d.ts`: type-only declaration for the fixed raw asset import.
- `javascript-harness-workspace.ts`: exclusive directory/files, identity/hash checks.
- `javascript-syntax.ts`: parse-only check, strict private syntax-frame validation,
  Step 1 result validation and Main-only process/resource failure mapping.
- `javascript-single-sample.ts`: Main-internal prepare/compile/execute driver for
  **catalogue sample index 0 only**. No loop, second sample, service factory or
  public runtime integration. This is the Step 3 single-sample verification path,
  not the Step 4 orchestrator.

New tests under `tests/main/`: `javascript-harness.test.ts`,
`javascript-syntax.test.ts`, `javascript-single-sample.test.ts`,
`javascript-harness.integration.test.ts`. Ten new production/declaration/test files;
no existing production/test file changed for Step 3. Progress/architecture documents
were synchronized separately; earlier working-tree changes were preserved.

No shared Step 1 contracts, C# Learning code, Project/Terminal code, native source,
Service/IPC/Preload/Renderer, dependencies, quotas/deadlines or Policy B changes.
No custom-case requests, Judge/comparison/Submit, Accepted/Wrong Answer or persistence.

## Harness, syntax and protocol

Prepare uses the accepted Learning Node resolver/probe and retains its immutable
stable 24.x selection. An owned JavaScript subdirectory contains two fixed files:
`Source.json` (student source as JSON data plus Main catalogue function/schema)
and `Harness.mjs` (fixed trusted asset). No student source is interpolated into
trusted harness control flow. Writes use exclusive create, sync and retained
file/volume/birth/change/write metadata and SHA-256. Revalidation checks workspace
lease/identity, every ancestor, canonical path, no reparse/hard links, file identity
and bounded content hashes before syntax and execute launches; never adopt/rewrite
existing files. File handles close in finally and pending work remains Core-owned.

The compile phase uses a separate Node child/2 GiB Job to construct `vm.Script`
from the source **without evaluating it**. This path creates no student context,
performs no lookup/call and never runs top-level statements. Exact fixed syntax
frames plus OS exit distinguish parse success from source SyntaxError; Main maps
them to the existing JavascriptSyntaxResult. Malformed/missing/extra/UTF-8-invalid
frames or inconsistent exit/raw stderr are PROTOCOL_FAILURE, not source diagnostics.
Diagnostics contain only the accepted safe code/source and null coordinates;
no engine message, raw stack or host path crosses into the result.

Execute starts another Node child in a 512 MiB Job. It reads one bounded UTF-8 JSON
request through stdin until EOF, rejects malformed grammar, duplicate decoded keys,
extra documents/trailing data, BOM, depth/size, version/index/arity/type violations,
and then creates a fresh vm context. Source compilation/evaluation, function lookup,
invocation, console conversion and serialization all run in that owned child.
Main uses Step 1 request and response validators; the fixed child companion parser
checks the same transport/type rules and its constants are regression-tested
against Step 1. Main revalidates raw stdout bytes and observed exit (RETURNED=0,
FAILED=1), schema and expected index before accepting any actual. Unexpected raw
stderr/stdout, duplicate/trailing responses, crashes/exit contradictions or missing
responses are PROTOCOL_FAILURE. Trusted native/resource/cancellation evidence
takes precedence over interpreting child output.

Only a primitive JSON string enters the new context; it is parsed and removed
before student evaluation. Console functions, arguments and result normalization
are created inside the context; no host process/require/Buffer/filesystem/timer or
transport reference is deliberately supplied. The bridge returns a primitive JSON
string, never student objects, to the child host; Electron receives bytes only.
Student getters/objects are never invoked in Electron. Return checking rejects
undefined/nonfinite/out-of-int32 numbers, wrong types, BigInt, Promise/thenable,
sparse/cyclic/ragged arrays, accessor/custom/toJSON array properties and invalid
Unicode. Dense normalized output has null prototypes and uses captured intrinsics
so ordinary prototype/JSON mutation does not corrupt serialization.

Console log/info/debug and warn/error are captured as bounded response fields.
A 4 KiB representation reserve bounds capture; overflow remains a failed
INVALID_RESULT/runtime observation even if student code catches the exception.
This is not proof that the raw pipe quota was exceeded. Core independently counts
all physical stdout/stderr across probe + syntax + execute before decoding, within
the unchanged 1 MiB operation quota. Oversized raw output produces OUTPUT_LIMIT;
no truncation can turn an invalid/overflowed value into successful actual data.

Only synchronous supplied functions are supported. Static ESM imports fail
script syntax checking; require/npm and async/Promise returns are unsupported.
Function/serialization exceptions produce bounded semantic failure tags. Missing
functions and runtime errors stay distinct from syntax/protocol failures.

The single-sample driver requires Core-owned VERIFIED barriers before compile and
execute, never releases between phases, rejects pending/invalidated observations
and refuses a second execute. Original 10 s Prepare / 30 s compile / 2 s execute
including startup/serialization/I/O / 60 s operation and 12 s cleanup caller waits
remain. Cancellation retains I/O/handles/tasks; aggregate cleanup delegates to the
existing probe/Windows adapter and unchanged checkpoint/lease/recovery policy.

`node:vm`, workspaces and Windows Jobs are **not malicious-code security sandboxes**,
do not restrict account filesystem/network rights or guarantee child-result
authenticity. No stronger OS isolation or native redesign is claimed.

## Verification

Final targeted command:

```text
npm test -- tests/main/javascript-harness.test.ts tests/main/javascript-syntax.test.ts tests/main/javascript-single-sample.test.ts tests/main/javascript-harness.integration.test.ts tests/contracts/javascript-execution.test.ts
```

**259/259 PASS across five files:** 27 unit/workspace/lifecycle tests,
172 JavaScript contract regressions and **60 real native harness cases**.
Native environment: Windows `10.0.26200` (Windows 11), Node **v24.16.0 x64**;
this is observed test tooling, not a patch pin. Evidence:
`out/learning-javascript-harness-step3/2026-10-22T08-38-42-586Z/`
(`environment.json`, `observations.json`, source/native hashes at test time).

The 60 real operations created **172 Learning Jobs** (probe/syntax/execute as
appropriate). All 60 operations ended with VERIFIED / processClean /
cleanupComplete; all 172 Jobs released/handles closed, independent root identity
observations signaled, leases released and verified session workspaces deleted.
No watchdog kill substitutes for cleanup proof. Cases include:

- Actual catalogue Sum result 8; six types, int32 endpoints/zero, true/false,
  empty/Unicode strings, empty arrays/rows and rectangular matrices.
- Parse-only side-effect sentinel plus infinite top-level loop: compile succeeds,
  no marker file and no execute Job. Real syntax error/static import stops before
  sample execution.
- Missing function, top-level/invocation exceptions, invalid return/serialization
  values, console capture, intrinsic/prototype mutation and absent Node globals.
- Real stdin/EOF; malformed JSON/UTF-8, duplicate/deep/trailing/wrong-index input,
  malformed/duplicate/trailing/contaminated output and inconsistent exit.
- Source/harness tampering refuses launch; pending/barrier publication rejection,
  asynchronous preflight cancellation, stdin/start cancellation and cleanup retry.
- Actual cumulative raw OUTPUT_LIMIT; 2 s execution/console-conversion loops;
  physical quota read-back 512 MiB probe/execute and 2 GiB syntax before resume.

Transport fault tests deliberately inject arguments/bytes only in test-boundary
native wrappers; they add no production debug capability. Test-only catalogue
type fixtures remain Main-owned, not custom cases accepted from a renderer.

`npm run typecheck`, `npm run build` and targeted ESLint on all ten new files PASS.
Build includes existing native hooks; the existing Monaco mixed-import warning
remains. `git diff --check` and explicit new-file whitespace checks PASS.
Accepted Step 2 source hashes (Core, adapter, resolver/probe/files and native)
are unchanged; protected C#/Project/Terminal/native diff is empty.
No full suite, full repository lint, benchmark or spike matrix.
No historical lint fixes, dependency changes, commit/push/merge.

Initial corrections: one unit fixture could not create a Windows file symlink
(EPERM); it now verifies reparse rejection with a junction without requiring new
privileges. A child-asset lint error was fixed by declaring the existing Node URL
global. Earlier 56-case native evidence was retained separately; the final run
above supersedes its smaller case set. No contract/architecture amendment needed.

## Remaining limits and readiness

No blocking defect remains in the executed Step 3 checks. Windows 10, actual UNC,
packaged/bundled runtime and concurrent Project Run/PTY smoke remain unverified.
Production Electron UI/IPC wiring, multi-case sequencing/fail-fast and end-to-end
ownership/stale-result acceptance remain Steps 4–6; bundling/distribution remains
9G. Existing C# evidence is preserved; no new C# or Project/Terminal live acceptance
is claimed by this step. The default production Learning Run factory is unchanged.

User acceptance closes Step 3 **COMPLETE — PASS WITH LIMITATIONS** on 2026-10-22.
The unverified scopes above are accepted limitations, not PASS claims. Steps 4–6
remain NOT_STARTED; Phase 9D.2 and 9D Common remain IN_PROGRESS. Ready for Step 4
— JavaScript Orchestrator, awaiting explicit implementation authorization.
