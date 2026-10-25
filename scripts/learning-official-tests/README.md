# Developer-only Official Test authoring support — E2-S2

Only the nine IDs in `model.ts` are supported. These programs are independently
authored from the accepted S1 worksheets; publisher solution code was not used.
They are **not** a production Judge/Comparator, sandbox for student programs,
frozen Official Set, Runtime benchmark or promotion mechanism.

Run from the repository root with installed Node24 / .NET SDK10 and installed
dependencies; no downloads or NuGet feeds:

```powershell
node --max-old-space-size=256 scripts/learning-official-tests/run.mjs --seed=20261024
```

The fixed CLI bundles its trusted TS driver in memory using installed Vite.
Only a developer summary with source/input/Expected fingerprints, obligation
mapping and mutant outcomes is saved under ignored `out/official-tests/e2-s2-*`.
Input/Expected corpora are ephemeral. There is no release writer/manifest editing,
set freeze, compactor or path option. E2-S3 and promotion remain unauthorized.

`author.ts`: curated witnesses plus `xorshift32-v1`, unsigned 32-bit seed/ID-mixed
streams, stable insertion order and ordinal obligation sorting. Equal completed
seed/version/baseline runs replay; time/resource failure quarantines the run.
Default eight exploratory random rows per ID is a developer smoke workload,
**not** a proposed Official Case count. At most 24 requested random rows,
256 generation attempts and 64 total rows per ID. Distinct public sample IDs
are always retained even when args coincide. Curated/seeded duplicate inputs
merge obligation tags into the first matching row without rewriting public data.

`domains.ts`: exact nine domains from S1. M1=A accepts duplicate minimum positions
when text is unique; TwoSum counts index pairs, Product bounds imply safe products,
Reshape mismatch remains legal. Every campaign row is admitted before references
or oracle compute Expected. `oracles.ts` shares no solution helpers with either
language; `verify.ts` requires all three typed results to agree, no majority vote.
Claims of Expected may be supplied to the developer verification API and must agree.

Quarantine means reject the campaign, never return a valid partial set. CLI errors
print only a generic quarantine notice. No failed payloads/solutions are emitted to
Renderer, public IPC or logs. Unit fault ports exercise generator, reference,
oracle, Expected, type/overflow/count and serialization failures.

Bounds are **developer parameters**, not amended Runtime/package policy:

| Resource | Bound / behavior |
|---|---|
| Campaign | 120s monotonic deadline; no retained partial success |
| Generation | 5s checked between bounded recipes/attempts, with `setImmediate` cancellation points |
| Child | <=30s per reference; <=60s restore/build, additionally clipped to campaign deadline |
| Input/stdout | Each <=1MiB; stderr counted/discarded, <=64KiB |
| Parent CLI V8 | Actual heap ceiling must be <=512MiB; command above gives 448MiB on current Node24 |
| Node reference | `--max-old-space-size=128` (320MiB total V8 heap on this host, not 128MiB RSS) |
| .NET reference/build | `DOTNET_GCHeapHardLimit=0x8000000` (128MiB managed heap configuration) |
| Scratch | After restore/build, <=256 entries, depth<=8, <=32MiB; fixed owned root only |
| Source audit | 31 fixed files, <=64KiB each, fingerprints before/after build and after campaign |
| Evidence | <=1MiB final CLI summary, exclusive new output directory |

Finite admitted algorithms/payloads bound in-process work; synchronous calls and
individual filesystem calls cannot be preempted at an exact millisecond. Heap
caps do **not** cap total OS working set, native memory or SDK I/O. Scratch checks
are stage admission checks, not an OS disk quota. No RSS/GC/installed/offline/target
machine or Runtime9D/60s certification is inferred. This tool executes only the
checked-in trusted code; do not use it as an untrusted-code execution service.

One owned reference at a time; overlap rejects BUSY. `close()` aborts and awaits
started child/pipe work, then removes the checked owned `refs-*` directory.
Fixed Node/Pilot.dll drivers are leaf tasks by construction. SDK/build and lifecycle
fixtures use Windows `taskkill /PID /T /F` (POSIX process groups elsewhere). Kill
failure/watchdog yields CLEANUP_UNVERIFIED, retains workspace and refuses success.
This is independent developer plumbing, not Runtime9D/Policy B changes.

Mutant status is KILLED, SURVIVED_REVIEW_REQUIRED, INVALID_REVIEW_REQUIRED or
PENDING_RUNTIME. Crashes are not silently counted as kills; no denominator is
reduced automatically. Two bounded uncached performance recipes are prepared but
not executed by mutation scoring: tool step caps do not prove a Runtime TLE.
The S3 frozen-set obligations/kill matrix and later Runtime gates remain separate.

The approved private build helper blocks source/evidence `/@fs` access, imports
into guarded production entries and private output paths. Targeted tests plus
production output audit verify current exclusion; keep all refs/tools/evidence
out of production resources, public modules and Renderer assets.

## E2-S3 staging (separately authorized after S2 acceptance)

```powershell
node --max-old-space-size=256 scripts/learning-official-tests/run-stage.mjs --seed=20261024
```

New S3 modules `pilot-{coverage,mutants,freeze,staging}.ts` refine S1 obligations,
verify/compact the pilot and generate two **fresh ignored** candidate trees.
All public samples are mandatory prefix; hidden IDs/bytes/proofs are deterministic.
Existing full-profile validators/reader/Registry account for a registered clone
and representation; shutdown/child scopes drain before READY-FOR-S4 is written.
Only volatile engineering observations are excluded from byte-identity comparison.
No release writer, normal resources/manifest/anchor change or app runtime path.

The developer C# project explicitly compiles Program.cs plus the nine Solution.cs
files, excluding incidental adjacent obj/Debug artifacts. Reference algorithms are
unchanged. S2 accepted116 PASS/1 SKIP evidence stays historical; S3 results and
fingerprints are separate. Two critical performance models remain pending actual
Runtime evidence. Actual single-owned60s performance is UNVERIFIED for every set;
developer batch timing is never a substitute. Stop for user pilot review at S4;
do not run S4 or promote/expand without explicit authorization.

## E2-S6 Wave B (16 IDs only, separately authorized)

`wave-b-spec.ts` defines the current ch5 remainder/ch6 domains, boundary facets,
independent proofs/oracles, deterministic recipes and finite fault catalogue.
`wave-b-staging.ts`, `wave-b-child.mjs`, `references/WaveB{.csproj,Program.cs}`
and the sixteen C#/JS pairs use the existing verifier, compactor, bounded child
lifecycle, full-profile reader, Registry screen and release transaction.

```powershell
node --max-old-space-size=256 scripts/learning-official-tests/run-wave-b.mjs
```

The CLI makes two fresh ignored roots and an exact reproducibility receipt.
Promotion requires the explicit `--promote=<first-root> --repro=<receipt>` pair,
all frozen/source fingerprints and reverified C#/JS/oracle Expected, baseline
release4, complete16-ID inventory, public parity and existing integrity gates.
It produces release5; no Judge Runtime/Submit entry point exists. Keep staging
and acceptance review separate from actual Runtime certification.

The two new uncached DP recursion performance models remain PENDING_RUNTIME,
alongside the three accepted prior models. Static maximum-size witnesses are
retained, never scored as timing kills. All Official60s evidence remains
UNVERIFIED. Finite mutation scores are not AST coverage or exhaustive bug proofs.
Use targeted ESLint with `--global module` for the sixteen trusted CommonJS
references (exact IDs, excluding pilot files with their existing global pragma).
See `docs/PHASE-9E2-S6-WAVE-B-ACCEPTANCE.md` for actual counts and limitations.
Stop after Wave B; Waves C/D, S7 and9E-3 require separate authorization.

## E2-S6 Wave C (seven chapter7 remainder IDs, separately authorized)

Developer-only wave-c-spec.ts/wave-c-staging.ts, run-wave-c.mjs/wave-c-child.mjs and references/WaveC.csproj/WaveCProgram.cs plus seven reference pairs use the existing bounded verifier/compactor/transaction. CLI: node --max-old-space-size=256 scripts/learning-official-tests/run-wave-c.mjs. Staging pins baseline release5; promotion requires --promote=<first-root> --repro=<receipt>, frozen references/oracle/coverage revalidation, matching source hashes and two-root identity. Release6 is already promoted; do not rerun promotion against it. No Runtime/Submit entry.68 cases/107 static obligations/21 correctness+14 broader kills; five new performance models remain pending, ten total. See docs/PHASE-9E2-S6-WAVE-C-ACCEPTANCE.md. Wave C awaits user acceptance; STOP before Wave D/S7/9E-3.

## E2-S6 Wave D (seven chapter8 remainder IDs)

`wave-d-spec.ts` defines exact matrix domains, facets, independent proofs/oracles and finite faults; `wave-d-staging.ts`, `run-wave-d.mjs`, `wave-d-child.mjs` and `references/WaveD.csproj`/`WaveDProgram.cs` plus seven pairs reuse the accepted bounded pipeline. `node --max-old-space-size=256 scripts/learning-official-tests/run-wave-d.mjs` requires baseline release6 and creates two clean roots. Promotion requires explicit `--promote=<first-root> --repro=<receipt>` and revalidates frozen Expected/coverage/source fingerprints. Release7 is already promoted; do not rerun promotion against it.57 cases/97 obligations/21 critical correctness+14 broader kills. Two new performance models pending,12 total; Official60s UNVERIFIED. Wave D acceptance is pending; STOP before E2-S7/9E-3. See `docs/PHASE-9E2-S6-WAVE-D-ACCEPTANCE.md`.
