# Phase 5.5B C# LSP compatibility report

- Date: 2026-09-10
- Host: Windows x64
- Gate result: **PASS — COMPLETE candidate**
- Scope: isolated spike only; Phase 5.5C production work was not started

## Selected stack

- `csharp-ls` 0.27.0, commit `d48ab7781176d2d369ceeb31d986503c2ad493e2`
- .NET SDK 10.0.401 and Microsoft.NETCore.App 10.0.12, isolated under `.dotnet/`
- `vscode-languageserver-protocol` 3.18.3
- `vscode-jsonrpc` 9.0.2
- Electron 44.0.0 (embedded Node 24.18.1, modules ABI 149)
- electron-vite 5.0.0, Vite 7.3.6, TypeScript 6.0.3

The normal process `PATH` exposed .NET SDKs 8.0.410 and 9.0.314 only, so the
dependency probe correctly represented the host as missing the required SDK 10+.
Behavioral probes explicitly prepended the isolated .NET 10 installation. No
production application dependency or language-service implementation was added.

## Corrective preflight decision

Use this structured Main-owned sequence before starting `csharp-ls`:

1. Run `dotnet --version` from the selected workspace to verify effective SDK
   selection, including `global.json`, by process outcome and exit code.
2. For a selected `.sln` or `.slnx`, run `dotnet sln <path> list` and use its exit
   code as a syntax/parse gate; extract `.csproj` path lines without matching
   localized prose, then verify those solution members.
3. For every selected/discovered `.csproj`, run evaluation-only
   `dotnet msbuild <project> -getProperty:... -getItem:ProjectReference` and parse
   the JSON only on exit zero.
4. Main validates every evaluated `ProjectReference` for root containment and
   existence. Project mode uses bounded discovery (64 projects, depth 8 in the
   spike) and excludes `bin`, `obj`, `build`, `out`, and `node_modules`.

Commands use an absolute executable, argument arrays, `shell: false`, timeouts,
bounded output/discovery, isolated CLI/NuGet directories, and no target, build,
restore, graph build, or `getTargetResult`. A fixture target that would create a
marker was never executed, and content-hash snapshots found no workspace change
in any case.

### Mechanisms compared

| Mechanism | What it validates | Decision |
|---|---|---|
| `dotnet --version` in workspace cwd | Effective SDK selection and unavailable `global.json` SDK via exit state | Chosen as the SDK-selection gate |
| `dotnet sln <path> list` | `.sln`/`.slnx` parsing and listed project paths via exit state | Chosen for selected solutions; correctness uses exit state, not localized text |
| MSBuild `-getProperty`/`-getItem` per project | Project evaluation, SDK/import resolution, machine JSON, evaluated project references | Chosen; it does not execute a target |
| Main reference containment/existence check | Missing, escaping, or invalid evaluated `ProjectReference` paths | Chosen because evaluation alone can succeed with a missing reference |
| `dotnet build`, `restore`, `ResolveReferences`, graph build, or `getTargetResult` | Deeper build/targeting availability | Rejected: may write outputs, restore/network, or execute arbitrary project targets/tasks |

`-getProperty`/`-getItem` cannot evaluate a solution directly, so projects are
evaluated individually. The preflight reads and evaluates user project/import
data and may invoke SDK resolution, but it does not run project targets or user
programs. This is appropriate only for a user-authorized local workspace under
Main's existing path, timeout, ownership, and redaction controls.

## Corrective fixture results

| Workspace mode | Expected structured result | Observed |
|---|---|---|
| valid `.sln` | `READY` | PASS; solution parsed and project JSON evaluated |
| broken `.sln` | `PREFLIGHT_FAILED` | PASS; `SOLUTION_PARSE_FAILED`, exit 1 |
| `.sln` with one missing project | `PREFLIGHT_FAILED` | PASS; `PROJECT_REFERENCE_MISSING` even though solution parse exited zero |
| valid `.slnx` | `READY` | PASS; solution parsed and project JSON evaluated |
| broken `.slnx` | `PREFLIGHT_FAILED` | PASS; `SOLUTION_PARSE_FAILED`, exit 1 |
| valid `.csproj` | `READY` | PASS |
| malformed `.csproj` | `PREFLIGHT_FAILED` | PASS; `PROJECT_EVALUATION_FAILED` |
| missing `ProjectReference` | `PREFLIGHT_FAILED` | PASS; Main check produced `PROJECT_REFERENCE_MISSING` |
| unknown project SDK | `PREFLIGHT_FAILED` | PASS; project evaluation exited nonzero |
| unavailable `net99.0` targeting pack | `READY` residual | PASS as designed; evaluation does not verify targeting-pack availability |
| `global.json` selects unavailable SDK | `PREFLIGHT_FAILED` | PASS; `SDK_SELECTION_FAILED` with nonzero Windows exit |
| no solution + two projects | `READY` | PASS; exactly the two intended projects were evaluated |

Final measured case totals ranged from 51 ms to 4.8 seconds on this host. Warm
valid solution/project-mode cases were approximately 1.1–1.5 seconds; the first
SDK/solution case incurred a 4.8-second cold start, and the unknown-SDK failure
took 2.9 seconds. These are spike measurements, not a production guarantee.

## Provider and semantic evidence

The original deliberately malformed `Broken.csproj` still initialized, registered
normal capabilities, and stayed alive without a structured provider workspace
failure. Human log/progress text remained the only explicit provider message and
is retained solely as diagnostic evidence.

The corrective rerun also proved semantic results cannot be a health detector:

- a valid loaded workspace legitimately returned zero completions, null hover,
  zero definitions, and zero diagnostics at a comment position;
- the malformed workspace returned zero completions, null hover, and zero
  definitions while still producing local document diagnostics; on this run a
  workspace-symbol request also returned a result.

Therefore empty completion/definition, null hover, absent diagnostics, and even
the presence of some local semantics are all ambiguous. No production readiness
rule may use them, and no provider-log phrase is matched.

## Readiness semantics and residual risk

Workspace readiness is separate from dependency and service lifecycle:

- Workspace: `READY`, `SELECTION_REQUIRED`, `NO_CSHARP_WORKSPACE`,
  `PREFLIGHT_FAILED`.
- Dependency: `MISSING`, `INVALID_CONFIGURATION` (`NOT_CONFIGURED` remains
  reserved for future configured paths).
- Lifecycle: `STOPPED`, `STARTING`, `RUNNING`, `CRASHED`.

Policy: selected workspace → structured preflight → on `PREFLIGHT_FAILED`, keep
the semantic service stopped → on `READY`, start `csharp-ls` → successful LSP
initialize means `RUNNING`.

`READY` guarantees only the checks listed above. `RUNNING` guarantees only an
alive process and initialized LSP session. A preflight can pass while `csharp-ls`
later fails to create/load an equivalent Roslyn workspace; the targeting-pack
case demonstrates one concrete false-positive boundary. This residual is
acceptable for V1 because deterministic structural failures are stopped without
unsafe execution, public state makes no stronger claim, and process/protocol/
request failures remain observable. A silent provider-internal mismatch is not
fully observable, so it is recorded explicitly rather than disguised as health.

## Original compatibility evidence

The selected stack passed stdio lifecycle, required dynamic capabilities, dirty
incremental versions 1–13, UTF-16/Unicode, completion/resolve/cancellation,
hover/signature/definition, pull diagnostics, `.sln`, `.slnx`, recursive project
mode, special Windows paths, watched-file registration, graceful/unexpected exit
cleanup with zero survivors, Electron imports, strict TypeScript, and electron-
vite production bundling. Current `csharp-ls` also recursively loaded projects
under generated-looking directories, so Main does not claim control over its
actual recursive project set.

## Quality gates

- Focused corrective preflight: PASS, 12/12 cases
- Focused broken/valid semantic ambiguity rerun: PASS
- Spike strict TypeScript build: PASS
- Spike Electron 44 import probe: PASS
- Spike electron-vite production build: PASS
- Root `npm run typecheck`: PASS
- Root `npm run lint`: PASS
- Root `npm test`: PASS, 811/811
- Root `npm run build`: PASS
- Root `git diff --check`: PASS

The first full root test run had one existing timing-sensitive Windows Monaco
test timeout (810/811). The focused test passed and the unchanged full rerun
passed 811/811; no timeout, retry, assertion, or worker setting was changed.

## Reproduction

After provisioning the ignored `.dotnet/` and `.tools/csharp-ls.exe` resources:

```powershell
npm install
npm run build
npm run probe:preflight
$env:DOTNET_ROOT = (Resolve-Path '.dotnet').Path
$env:PATH = "$env:DOTNET_ROOT;$env:PATH"
node dist/harness.js
npm run probe:electron
npm run build:electron-vite
```

Machine evidence is in `evidence/preflight-results.json`, `evidence/results.json`,
and `evidence/electron-probe.json`. Local SDKs, provider binaries, dependencies,
and build output remain ignored and are not production application dependencies.
