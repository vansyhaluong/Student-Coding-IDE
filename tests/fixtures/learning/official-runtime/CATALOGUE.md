# E3-S6 full catalogue screen (test only)

The existing pilot runner is reused. Its only additive seam is an explicit fixed
source and evidence directory for non-pilot IDs; default S5 selection, native
observers, phase forwarding and cleanup are unchanged. It still instantiates the
existing Windows ExerciseService and Registry for an isolated test operation,
stops the service, verifies cleanup/zero Registry ledger, then permits the next
test. There are no overlapping service operations, pooled children, batching,
alternate runtime, cache or new production lifecycle.

`catalogue-solutions.json` contains110 static sources for the55 non-pilot IDs.
`catalogue-pins.json` records SHA-256 of each source and its original developer
reference under `scripts/learning-official-tests/references/<id>/`.
All110 references and adaptations were read/reviewed before execution. One-time
authoring tooling under ignored `out/e3-s6/` stripped developer namespaces/static
public wrappers and CommonJS exports; no authoring code runs in the test runner.

C# algorithms are unchanged. System, System.Linq and System.Collections.Generic
usings explicitly replace the developer projects' implicit usings; public entry
methods are instance methods of global Solution. Private static helpers remain.
JavaScript named functions retain their bodies; exported arrow/function
expressions are called from a fixed named function using the trusted signature's
parameter order. This accommodates differing local parameter names without
rewriting algorithms. No runtime source generator, new oracle, slow fixture or
performance mutation campaign is added. Sixteen S5 sources/pins remain unchanged.

`catalogue-evidence.ts` reads frozen metadata and asserts complete native receipts.
Actual/Expected checks are Main test assertions after completion, never a
continuation hook or product Comparator. It rejects incomplete prefixes,
mismatched signatures/input order, unverified barriers/cleanup, output accounting
gaps and quota changes. `catalogue-report.ts` joins126 rows, selecting16 unchanged
S5 receipts and110 S6 receipts. Missing evidence is UNVERIFIED, failed executed
operations are FAIL, and the process exits nonzero unless all126 rows pass.
It never launches a process or promotes a partial result to PASS.

Run only `tests/main/official-runtime-catalogue.test.ts` and the native integration
with `LEARNING_OFFICIAL_CATALOGUE_LIVE=1` on the already provisioned Windows x64
host. The native suite selects only55 non-pilot IDs ×2 languages, once per pair,
with one complete set per operation. The80s test framework cap permits the
unchanged60s Core operation and12s cleanup; no runtime limit is changed. The20s
filesystem-integrity test cap applies only to read-only file comparisons.

Private receipts live in ignored `out/e3-s6/native/`; matrix.json includes source,
package/test-set/signature identities, receipt hashes, timing/output/Job metrics,
attempted prefix/suffix, failure and cleanup facts. Preserve the original ignored
S5 receipts alongside them. No fixture/evidence file is an app resource or public
API. The12 performance models stay PENDING_RUNTIME; one-host headroom is not
target-host/release certification. S6/Phase9E-3 user acceptance remains required
before any9E-4 implementation.
