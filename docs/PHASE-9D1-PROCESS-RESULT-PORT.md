# Phase 9D.1 — Learning Process Result Port

2026-10-20: explicitly authorized to unblock the compiler. This package adds only
Main-internal Learning runtime observation and focused tests. 9D.1 and Common
remain `IN_PROGRESS`. Roslyn/compiler/harness implementation still awaits approval.

## Contract and behavior

`LearningProcessResultPort` extends the existing runtime interface without changing
`ExerciseRuntimeAdapter.runPhase(): Promise<void>` or public Exercise DTOs/APIs.
`WindowsExerciseRuntimeAdapter.runProcessPhase()` returns a frozen detached result
for a settled process, including a nonzero OS exit as `NONZERO_EXIT`. A null result
means the Main plan intentionally selected no process. The port cannot determine
whether nonzero exit means a C# syntax/signature diagnostic or compiler crash:
that distinction requires the future compiler's bounded diagnostic parser.

`processResult()` observes the latest admitted attempt without native queries or
actions. It exposes root process signaled status, OS exit code (null before root
exit), conservative stdout/stderr settlement, observer settlement, failure category
and `jobMemoryLimitObserved`. Exit 259 is valid after root signaled; it is not used
as the liveness test. Both stream flags remain false until the existing native
combined observer confirms both pipe EOFs and root signal, and UTF-8 decoders flush.
No new native bridge or C++ change is needed.

Native/transport/ownership/configuration failures, deadline expiration, cancellation
and Job-limit observations still reject. A snapshot remains available for partial
observation and later cleanup draining; its failure category survives that drain.
Only fixed failure categories enter this observation, without paths, messages,
stacks, PIDs or handles. Core's cancellation reason remains authoritative; no new
public error mapping is introduced. Job limit is evidenced by native event 10;
OOM text and nonzero exit alone are not that evidence. Retained event samples are
capped at 64 per Job, without clearing the fact that a limit event was observed.

Existing `runPhase()` delegates to this port and preserves the Common nonzero-exit
rejection (`RUNTIME_FAILED`). Output continues through the same callback and Core
combined 1 MiB/operation limiter, without a new accumulated stdout/stderr buffer.
Core owns timers and cancellation/cleanup. Monotonic checks before launch, during
monitoring and at completion prevent a late result from becoming success. This
port does not terminate/release on its own failure or replace pending phase tasks.

Process/pipe completion is not tree-history or cleanup proof. Existing termination,
retained handles, quota read-back, proof/checkpoint stages, Policy B retry/quarantine/
recovery, release reconciliation and 60s/30s/12s budgets remain unchanged. Reads
after release use cached observations; successful release/close actions are not
repeated. A rejected concurrent admission cannot overwrite the active observation.

## Verification scope

Focused adapter/Core/service/workspace/C# and Common contract regressions cover
nonzero compiler-like fixture output, legacy behavior, partial pipe settlement,
split UTF-8, output limit, phase/operation timeout, cancellation/races, native spawn/
poll errors, Job-event evidence, bounded event retention and cleanup/release retry.
Fixtures do not compile C# or prove Roslyn diagnostics handling.

One targeted real-Windows test launches three real Node processes under the
production Learning Job adapter at the compile quota (2 GiB), observing exit codes
0, 1 and 259 and separate stdout/stderr. It checks that completion leaves the Job
unreleased, then performs normal cleanup and repeat-safe result reads. No watchdog
creates PASS evidence. The five older integration cases are filtered out; neither
shutdown/resource spike matrix is rerun. This is Windows/native process evidence,
not Roslyn or Renderer/Electron end-to-end acceptance. Windows 10 remains due.

An initial fixture test failed because its mock incorrectly changed an already
exited process's code to zero during termination. The fixture now preserves it,
matching OS behavior; no assertion or production error handling was relaxed.

Final checks: **230/230** focused/regression tests across six files PASS, plus
**1/1** targeted real-Windows integration test (three OS exit observations; five
older cases filtered out) PASS. Typecheck, targeted lint on all four code/test
files, production build with both existing native hooks, and tracked/new-file
whitespace/diff checks PASS. Existing Vite mixed static/dynamic Monaco import
warning remains; it is unrelated to this port. Full repository lint/historical
spike errors are outside this targeted package. Final source/native hashes and
observations are preserved under
`out/learning-native-step3/2026-10-20T16-28-04-579Z/` (environment.json and
observations.json). The earlier successful artifact precedes the added completion
cancellation check; it is not used as the final source evidence.

No dependency, native stdin, compiler, harness, C# driver,
IPC/Renderer, Project/Terminal/protected service, or runtime policy change is added.

## Next boundary

The missing process-result port is supplied. No known process-result blocker
remains before resuming Roslyn compiler/harness work under a new user approval.
That work must parse diagnostics to distinguish source errors from compiler
failure, revalidate workspace/dependencies, and prove real offline compilation.
Native stdin remains a later execute dependency, not a compile prerequisite.
Do not infer C# Run support or mark 9D.1/Common COMPLETE from this package.
