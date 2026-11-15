# Exercise Runtime 9D.0 spike

Developer-only Windows x64 prototype. See [REPORT.md](REPORT.md) for results,
reuse boundaries, limitations and pending production decisions.
No Learning UI, public IPC, Project RunService, Terminal or draft-store integration.

Prerequisites: existing repository dependencies, Node 24, developer .NET SDK
10.0.112/reference packs, MSVC x64, cached Electron headers/import library and
the local Git object b4e23fabfa690201d179d93c1596af7849c3d5c0. No install/download.
The pinned SDK/limits are experimental, not production policy.

From repository root:

```powershell
node spikes/exercise-runtime-9d0/build.mjs
node out/exercise-runtime-9d0/verify.cjs
```

After TypeScript-only changes, build with `--js-only` to retain the already built
isolated native binding. All generated files stay in `out/exercise-runtime-9d0/`;
production native artifacts are not overwritten. Each session directory is removed
after successful owned-process cleanup. Build/evidence and verifier fixtures remain.

Focused quality checks (no full application rebuild):

```powershell
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --esModuleInterop --target ES2022 --module commonjs --moduleResolution node --ignoreDeprecations 6.0 --types node spikes/exercise-runtime-9d0/runtime.ts spikes/exercise-runtime-9d0/windows-spike-adapter.ts spikes/exercise-runtime-9d0/verify.ts
node node_modules/eslint/bin/eslint.js spikes/exercise-runtime-9d0/build.mjs spikes/exercise-runtime-9d0/runtime.ts spikes/exercise-runtime-9d0/windows-spike-adapter.ts spikes/exercise-runtime-9d0/verify.ts
git diff --check
```

Results: `out/exercise-runtime-9d0/results.json`. The reviewed Windows 11 run is
preserved in [evidence/windows11-x64.json](evidence/windows11-x64.json).
