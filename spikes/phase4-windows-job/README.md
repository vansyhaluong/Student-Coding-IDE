# Phase 4 Windows piped Node / Job feasibility spike

Isolated, user-authorized native experiment. Not production architecture or an
Electron addon. No production imports, dependency changes, or network operations.

## Reproduction

Prerequisites already installed on the evidence machine: VS 2022 Community C++
compiler/Windows SDK, Windows x64, and Node v24.16.0 from process PATH.
From the repository root in an x64 VS developer command prompt, create a
dedicated temporary build directory, then compile:

```bat
mkdir "%TEMP%\phase4-native-job-spike" 2>nul
cl.exe /nologo /std:c++17 /EHsc /W4 /WX /D_WIN32_WINNT=0x0A00 spikes\phase4-windows-job\probe.cpp /Fo"%TEMP%\phase4-native-job-spike\probe.obj" /Fe"%TEMP%\phase4-native-job-spike\probe.exe"
```

Run the resulting executable with exactly these three arguments:

```text
"<absolute-path-to-node.exe>"
"<repository-root>\spikes\phase4-windows-job\fixture.cjs"
"<repository-root>\spikes\phase4-windows-job"
```

The C++ probe uses CreateProcessW directly; its command-line serialization is
limited to these controlled quoted paths and fixed fixture modes, not a shell
or a production argument encoder. It creates unnamed Jobs with no breakaway or
kill-on-close flag, explicit inherited stdio handle lists, separate pipes, and
PROC_THREAD_ATTRIBUTE_JOB_LIST. IsProcessInJob checks the root and both fixture
descendants. All fixture code is local. Root-first uses a detached child so that
the critical case actually leaves two Node descendants alive after root exit.

## Evidence — 2026-09-05

Windows version API: Microsoft Windows NT 10.0.26200.0, x64 compiler target.
Node: v24.16.0. Compilation passed /W4 /WX. Final run exited 0:

```text
warmup PASS
basic PASS handles=63
long PASS handles=63
tree PASS handles=63
root-first PASS handles=63
repeat=30 PASS baseline=63 final=63 whole-tree-empty/process-handles-signaled/pipe-EOF PASS
```

- Basic asserts exact independent `stdout-test\n` and `stderr-test\n`, exit 0,
  and root Job membership. No shell is used.
- Long asserts the root is live before Stop, then terminates its Job.
- Tree asserts exactly two reported descendants, their Job membership, and a live
  root before Stop. Retained handles must signal after whole-Job termination.
- Root-first waits for root exit 0, proves both retained descendant handles are
  still live and Job-owned, then terminates the retained Job and waits for them.
- Repetition alternates tree/root-first 30 times. Every iteration checks whole
  Job empty, retained process handles signaled, both pipe EOFs, and the probe's
  handle count equal to its warmed baseline. No process/handle leak observed
  within these checks. There are no callbacks or persistent asynchronous tasks
  in this standalone synchronous harness.
- All waits are bounded by the original 5-second spike limits. Pipe/accounting
  polling checks actual state every 5 ms; readiness uses fixture events, not a
  fixed readiness sleep. No production timeout or test was changed.

## Investigation findings and limits

Initial sandbox execution blocked fixture child spawning with EPERM. The final
run used explicitly approved execution outside the sandbox. No network was used.

Windows automatically introduced conhost.exe in the Job. An initial assertion
that total Job members equaled Node fixture count was incorrect. Inspecting the
Job established the extra console host. Reopening this transient PID also raced
its exit. Final checks retain the exact controlled Node handles, verify their
membership/liveness, and require *all* Job members to reach zero; they do not
depend on reopening a transient auxiliary process. Root-first initially used
a non-detached child and did not produce the required surviving-child case;
the fixture was corrected and explicitly proves survival before cleanup.

Job accounting can become empty before a root process handle signals. The
adapter must separately wait for root exit and stdout/stderr EOF; it must not
equate Job-empty with output completion. The probe observed this and uses bounded
handle waits, keeping the same 5-second limits. Existing terminator code was not
modified. Emergency cleanup on failed experiments targets only the created Job.

This proves the Win32 primitive combination on this machine, not Electron addon
loading, renderer responsiveness, Windows 10 acceptance, installed packaging,
crash recovery, arbitrary user process behavior, or a security sandbox against
malicious programs. No claim of those gates passing is made.

## Integration boundary evaluated after the spike

A narrow Main-only native piped-process adapter should create the process and
Job atomically, retain opaque ownership and process/pipe handles, stream separate
stdout/stderr asynchronously, and report root exit separately from whole-tree
cleanup. Expose the existing WindowsJobController shape for accounting,
termination, and release; do not expose handles or process authority to Renderer.

ProcessManager can retain its current registry/await/retry responsibility. The
existing Job terminator can perform terminate/empty/release; the adapter/session
must additionally settle root-exit and pipe-drain ownership before final session
release. Production async/native binding and failure handling still need design
and verification. No Terminal, node-pty, shutdown, or project-service redesign is
demonstrated as necessary. No third-party dependency was needed for this spike.

Source and this evidence remain for review. Generated probe.exe/probe.obj were
placed only in the dedicated temporary build directory and removed after the run.
Production integration was subsequently approved and implemented independently
under Phase 4B–4E. The spike remains isolated evidence and is not imported by
production code. Installed-package acceptance remains Phase 7.
