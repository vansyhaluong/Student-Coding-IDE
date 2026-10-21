# Phase 9D.1 Step 1 — C# execution contracts

User approval: 2026-10-20. Package status: `IN_PROGRESS`; only declarations,
pure validators/unit tests and documentation are implemented. No SDK discovery,
compiler/harness execution, native change, composition, IPC or UI wiring exists
in this step. Common remains `IN_PROGRESS`; Windows 10 and production adapter
end-to-end acceptance remain outstanding.

## Accepted direction and boundaries

- Main uses installed stable SDK 10.x Roslyn `csc.dll` directly. Filesystem
  discovery is independent of Project Mode. No product patch pin, SDK/runtime
  download/install, major fallback, MSBuild/NuGet restore or compiler server.
  SDK/runtime/reference-pack selection and offline closure require later evidence.
- One admitted operation owns prepare/discovery, source/config generation,
  compile and sequential sample execution. Factory configuration is synchronous
  and does no I/O/probing/process launch before admission. Prepare stays 10s;
  compile 30s/2 GiB; execute 2s including startup/512 MiB per case. All phases
  share the original monotonic 60s operation due; cleanup callers wait 12s while
  retaining pending tasks/leases/native ownership. Policy B is unchanged.
- Run uses Main catalogue samples only. Renderer still supplies exactly
  exerciseId/language/code/sourceRevision. It cannot choose SDK, argv, compiler
  options, paths, signature, case input/expected output, PIDs or handles.
  Existing run/session/snapshot/lifecycle validators and APIs are unchanged.
- Cases stop after the first execution failure; successful return is not a
  comparison verdict. Custom cases, comparison, Judge/Submit and Accepted/results
  persistence are not implemented or enabled by 9D.1.

## Protocol v1

These are declarations for a future generated harness, not an implemented C#
program. Each execute phase launches a fresh process and Job for one sample.

1. Main binds the catalogue signature and sample list at admission. Generated
   entry point is fixed by Main. Student source is a compilation unit containing
   `public class Solution`; harness constructs Solution and calls its catalogue
   method synchronously with typed arguments. Missing/wrong signature or invalid
   entry-point source produces compile diagnostics, not reflection/eval fallback.
   Method names, reflection targets or compiler instructions are not stdin data.
2. Main writes one strictly decoded UTF-8 JSON document to stdin and closes EOF:
   `{protocolVersion:1, caseIndex, args}`. This is a private Main-to-process protocol,
   not a new renderer API. Sample index/arity/types must match Main's schema.
3. Harness captures user Console.Out/Console.Error with bounded storage and writes
   exactly one JSON response on physical stdout. Returned shape:
   `{protocolVersion:1, caseIndex, outcome:"RETURNED", actual, stdout, stderr}`.
   Failed shape replaces actual with `outcome:"FAILED"` and error tag
   `USER_EXCEPTION` or `INVALID_RESULT`. No raw exception message/stack is metadata.
   Native stderr remains a separately captured stream for host/process failure.
4. Exit code is observed by Main from the OS, never accepted from harness JSON.
   RETURNED requires observed exit 0 and valid response; nonzero exit or missing/
   malformed response is not success. Windows exit codes are uint32; null in a
   failure result means no process exit was observed, not successful termination.
5. Invocation/response fields are exact. Arrays are dense; no object/null return,
   floating-point integer, int32 overflow, malformed Unicode or jagged matrix.
   Six types: int32, boolean, string, int32[], string[], rectangular int32[][].
   Empty strings/arrays and empty rectangular matrices are permitted. Strings
   round-trip as data; no trimming/normalization/comparison is performed.
6. The raw request and response JSON each have a 1 MiB UTF-8 transport ceiling,
   derived from the existing output ceiling, including JSON escaping/framing.
   Pure object validators also bound traversal depth (12) and reject sparse,
   cyclic, non-JSON or excessively large data before copying/stringifying it.
   Requests are sample data, not execution authority. Native bytes must be decoded
   strictly before the string parser; that native boundary is not implemented here.
7. Existing 1 MiB **combined raw stdout/stderr per operation** still counts
   compiler output, harness framing, serialized values, user output and host stderr
   across all phases/cases before sanitizing/parsing. No fresh budget per case or
   hidden result stream. Public aggregate C# result JSON is separately bounded by
   that same ceiling, including metadata. This representation guard does not
   increase Common quotas. Streaming capture/accounting remains later work.

User code can reopen standard streams or fabricate protocol data. Main validates
it as untrusted execution output, never as authenticity/OS cleanup/Judge proof.
Job objects are not filesystem/network sandboxing. Source/config writes use only
Main-chosen contained workspace paths; runtime I/O isolation is not claimed.

## DTOs and failure taxonomy

`shared/contracts/csharp-execution.ts` adds standalone result/protocol types;
`csharp-execution-validation.ts` validates them. The existing ExerciseSnapshot and
ExerciseApi are deliberately unchanged. Future wiring must attach detached result
data to the authorized Main-issued session/generation/sequence and captured
revision before routing it. No new unbound public event or result channel is added.

- Compiler diagnostics expose CS code, severity and source alias
  solution/harness/compiler. Source positions are positive, one-based; compiler-
  global positions are null. Raw message, paths, argv, stack and native codes are
  absent. Safe localized explanation/formatting is future work; compile stdout/
  stderr must be normalized before presentation, not forwarded as raw host logs.
- Compile result has status, observed exit code, diagnostics, bounded presentation
  streams and failure. Successful compile requires exit 0 and no error diagnostic;
  COMPILE_ERROR requires a nonzero exit and error diagnostic. Compiler launch,
  observation/transport/configuration failures are infrastructure failures.
- Case result has Main sample index, RETURNED/FAILED, actual value or null,
  captured streams, observed exit and failure. Actual false/zero/empty values
  are successful data, distinct from failure. No expected/passed/verdict/Accepted.
- Aggregate result carries compile plus a contiguous prefix of samples. Cases
  require successful compile, cannot skip/duplicate indices, and stop at failure.
  Partial observations are allowed; this DTO never claims service finalization,
  processClean, cleanupComplete or workspace deletion.

| Kind | Phase/index | Mapping to existing Common reason (future adapter) |
|---|---|---|
| SDK_MISSING | prepare/null | DEPENDENCY_MISSING |
| SDK_INCOMPATIBLE | prepare/null | INVALID_RUNTIME |
| COMPILE_ERROR | compile/null | COMPILATION_FAILED |
| RUNTIME_ERROR | execute/sample index | RUNTIME_FAILED |
| TIMEOUT | prepare, compile, execute or operation | Corresponding *_TIMEOUT; operation timeout may interrupt compile/case |
| JOB_MEMORY_LIMIT | compile/null or execute/index | JOB_MEMORY_LIMIT, only with native Job-limit evidence |
| OUTPUT_LIMIT | producing phase; index only for execute | OUTPUT_LIMIT |
| INFRASTRUCTURE_FAILURE | prepare/compile/execute/cleanup | INTERNAL_ERROR; no user-fault or clean claim |

Runtime OOM text/exception alone is RUNTIME_ERROR, not Job-memory evidence. A 12s
cleanup caller failure is infrastructure/pending cleanup, not execution timeout;
existing Common cleanup proof/state retains authority. Lifecycle cancellation
continues using existing Common reasons, not fabricated C# failure categories.
Mapping tables do not yet change Core's error handling.

## Main-only ports

`runtime/csharp-execution-contracts.ts` declares:

- CsharpSdkResolver.resolve(signal/deadline): AVAILABLE selection, MISSING, or
  INVALID_CONFIGURATION with fixed reasons. Selection includes Main-only host,
  SDK/compiler/reference/runtime paths and versions, target framework net10.0.
- CsharpCompiler.compile(prepared execution, phase context): compile result and
  scoped artifact on success; no artifact on failure. Context is Core-owned.
- CsharpExecutionAdapter extends the existing cleanup/ownership port, with a
  detached result observation; synchronous factory configures it without I/O.
- CsharpProcessResult records OS exit/stdout/stderr after observers settle; it is
  not itself tree-cleanup proof. Stdin delivery/process implementation is deferred.

## Verification and next boundary

Focused C#/Common contract suites: 141/141 PASS across three files. Typecheck,
targeted lint, production/native build and tracked/new-file whitespace checks PASS.
Full repository lint is not rerun in this bounded step. These are schema/type checks, not SDK,
compiler, native stdin or language execution evidence.

Step 2 was separately authorized and implemented for filesystem resolver/static
closure only; see [resolver evidence](PHASE-9D1-SDK-RESOLVER.md). This Step 1
document does not claim actual offline compilation/binding. The later compiler, native stdin/process
result, adapter, lifecycle and production wiring steps remain unimplemented.
Do not mark 9D.1 or Common COMPLETE or infer production Run support from Step 1.

Subsequent compiler-unblock authorization adds the Main-only
`LearningProcessResultPort` in the Common runtime declarations and Windows
implementation; see [process-result report](PHASE-9D1-PROCESS-RESULT-PORT.md).
It carries OS exit/settlement/failure metadata, while stdout/stderr stay on the
existing streaming callback. It does not implement the C# compiler, native stdin
or the future C# result DTO composition and does not change public contracts.

Subsequent Step 3 implements generation and direct Roslyn compile only:
[compiler evidence](PHASE-9D1-CSHARP-COMPILER.md). Core's Main-only output callback
can account raw bytes separately from safe presentation; public DTO/API shapes
remain unchanged. Native stdin, harness invocation and production result wiring
are still pending. This does not change the Step 1 verification scope above.
