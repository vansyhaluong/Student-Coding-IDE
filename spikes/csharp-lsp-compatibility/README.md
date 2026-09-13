# C# LSP Compatibility Spike

This directory contains isolated Phase 5.5B evidence and harness code. It is not
production application code. Local SDKs, tools, npm packages, build output, and
runtime artifacts are ignored and stay within this directory.

The spike tests the ADR-022 stack and structured workspace preflight on Windows.
See `REPORT.md` for the evidence, selected versions, guarantees, residual risk,
and reproduction commands. The 2026-09-10 corrective gate passed; Phase 5.5C
remains unstarted and requires separate authorization.

With the ignored .NET 10 SDK and `csharp-ls.exe` provisioned in `.dotnet/` and
`.tools/`, run:

```powershell
npm install
npm run build
npm run probe:preflight
$env:DOTNET_ROOT = (Resolve-Path '.dotnet').Path
$env:PATH = "$env:DOTNET_ROOT;$env:PATH"
npm run probe:node
npm run probe:electron
npm run build:electron-vite
```
