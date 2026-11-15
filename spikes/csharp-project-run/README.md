# M1-04 isolated Windows/.NET evidence

No application composition, SDK installation or production stdin capability.
Run from the repository root, with existing dependencies/toolchains:

```powershell
npm run build
node spikes/csharp-project-run/build-native.mjs
node_modules/.bin/electron.cmd spikes/csharp-project-run/harness.mjs
```

Generated fixtures/native binaries live in ignored `out/`; evidence JSON is
written under `evidence/`. The harness pins installed SDK versions with local
global.json files and never changes the system SDK or machine environment.
The isolated native translation unit includes the repository's own pipe/Job
primitives and adds inspection, EOF and root-only termination for evidence.
It does not invoke LanguageServiceManager or reuse any LSP session.

Stop/cancellation targets only explicitly owned Job objects. No global
build-server shutdown or process-name termination is used. See REPORT.md for
the tested platform, exact commands, findings and gate disposition.

The checked-in `evidence/results.json` is Windows 11 x64 evidence (32/32 PASS).
Under the 2026-10-07 ADR-024 amendment, it satisfies M1-04's acceptance platform
requirement; Windows 10 evidence is no longer required. Windows 10 is outside the
verified C# Project Run acceptance baseline. Compatibility is not claimed.
Raw JSON remains unchanged, including the historical BLOCKED disposition in
`verification.json`; REPORT.md records its supersession by the scope decision.
M1-05 prerequisites from this gate are satisfied, but M1-05 remains NOT_STARTED.
