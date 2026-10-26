# E3-S5 test-only pilot assets

`pilot-solutions.ts` contains sixteen fixed sources for exactly the eight IDs in
Phase9E-3 plan Section7. `pilot-pins.json` pins SHA-256 of the UTF-8 source strings
passed to the service (JavaScript template-literal line endings are LF).
The contract test checks every pin. Native receipts record the same hashes.

Sources were reviewed against the frozen developer references under
`scripts/learning-official-tests/references/<id>/{Solution.cs,solution.js}`.
Adaptations are limited to the actual runtime entry contract: global public
instance C# `Solution` methods, explicit BCL names, named JavaScript declarations
without CommonJS exports. C# Reshape replaces LINQ cloning with an explicit row
clone loop; MinWindow uses `TryGetValue` instead of an extension requiring implicit
project usings. The algorithms and approved domains are retained. No generator,
new oracle, modified Expected, performance-model implementation or production
solution catalogue is added.

`pilot-native.ts` invokes the existing Windows service, Core, compiled-root
Registry and native module. Test observers forward real deadlines, barriers,
Jobs, output and cleanup unchanged. The native-location spy selects the existing
built `.node` file for source Vitest; it does not substitute native results.
Independent process watches and quota readbacks are real native observations.
On unresolved cleanup, the helper retains the real owner and refuses later
operations; the existing service recovery is the only cleanup retry.

Fault programs cover STOP, hook exception, compile/syntax, user exception, invalid
result, malformed transport, execute timeout, owner invalidation and aggregate
output exhaustion on Divide. JavaScript malformed transport deliberately replaces
only the test launch arguments with a fixed real Node `--eval` program under the
same native Job. This tests host/driver protocol propagation; it is not evidence
that the fixed production JavaScript child itself emits malformed JSON.
C# writes malformed physical stdout from its controlled student source.

Run only the named contract test and the integration test with
`LEARNING_OFFICIAL_PILOT_LIVE=1` on a supported, already provisioned Windows x64
host. The integration suite executes each full pilot pair once, plus bounded
controls and public Run regressions. Its 80-second test framework timeout permits
the unchanged Core60s operation and12s caller cleanup; it changes no runtime
deadline. All Expected comparisons remain test-only Main assertions, outside the
continuation hook. The hook never computes a verdict.

Private receipts are ignored files under `out/e3-s5/native/`, not app resources.
Retain them with `out/e3-s5/summary.json` for acceptance evidence. Never import
these fixtures into production source, resource emission, IPC or Renderer.
