# Student Coding IDE Codebase Map

This map describes the current independent source tree and planned module locations. Phase 2A established the application and security foundations, Phase 2B added the authorized project/filesystem Explorer, Phase 2C added retained Monaco editing and data-safety behavior, Phase 2D completed bounded project search and the Orca/STYLEGUIDE corrective UI pass, Phase 2E completed the integrated terminal and Windows Job-owned cleanup path, Phase 2F completed cross-feature stabilization, Phase 3B established the Monaco-native language foundation, Phase 3C implemented production bounded JS/TS project synchronization, Phase 3D completed model-local HTML/CSS/JSON intelligence, Phase 3E added Problems aggregation and navigation, Phase 3F completed stabilization/final verification, Phase 4 completed the controlled JavaScript Run/Output domain and stabilization gate, and Phase 5 completed the Main-owned local Git integration, lifecycle, right-sidebar UI and final stabilization gate. Later work remains assigned to subsequent authorized work packages.

Phase 5B extends that foundation with bounded Git status and selected-file
stage/unstage through validated IPC/Preload, without Renderer UI.

Phase 5C adds staged-only commit, a local branch snapshot, safe existing-local
branch switch and bounded HEAD history. Phase 5D adds coordinated owner lifecycle,
stale reply guards and owned Windows Git process cleanup. Phase 5E adds the
right-sidebar Source Control UI and Main-owned Names search; Phase 5F verified
the integrated Phase 5 exit gate without adding production modules. Phase 5.5B
adds isolated compatibility evidence. Phase 5.5C adds shared semantic contracts
and Main-only dependency foundations; Phase 5.5D–E add the provider lifecycle,
workspace/preflight and document synchronization; Phase 5.5F adds the validated
semantic IPC/Preload boundary and C# Monaco providers.

## Current source tree through Phase 5.5F

| Current path | Role | Status |
|---|---|---|
| `src/main/index.ts` | Electron readiness, secure BrowserWindow, unsaved/terminal coordination, Main Run/Git/Search/C# language composition, owner routing/navigation cleanup and fail-closed quit wiring | Implemented through Phase 5.5F; privileged domains use owned lifecycle and cleanup |
| `src/main/app/` | DesktopApplication startup/reverse shutdown ownership plus Main-only before-quit approval, in-flight cleanup sharing, retry, and final-quit coordination | Implemented through Phase 2E-J corrective Step 3 |
| `src/main/window/` | Secure BrowserWindow ownership, accepted navigation/external-URL policy, and final-quit authorization that prevents the last window bypassing cleanup | Implemented through Phase 2E-J corrective Step 3 |
| `src/main/ipc/` | Validated handler registration, safe result/error mapping, lifecycle/project/file/search/terminal/Run adapters, and identity-scoped semantic Git state/status/index/commit/branches/history handling | Implemented through Phase 5E |
| `src/main/errors/` | Structured domain errors and safe IPC serialization | Implemented Phase 2A foundation |
| `src/main/services/project/` | One active project, create/open/close/switch, transition guards, identity, authorization, and recent metadata | Implemented Phase 2B |
| `src/main/services/filesystem/` | Authorized lazy list/read/write/stat/create/rename/Recycle Bin operations, bounded watcher lifecycle, and authoritative active-project availability | Implemented through Phase 2F |
| `src/main/services/search/` | Main-owned asynchronous Contents and file-name traversal, exclusions, binary/size policy where applicable, batching, bounds, ownership, and cooperative cancellation | Implemented through Phase 5E |
| `src/main/services/lifecycle/` | Transition-ID dirty-buffer and terminal coordination for project switch/close plus application-close unsaved protection, including timeout and renderer-ownership checks | Implemented through Phase 2E-G |
| `src/main/services/persistence/` | Versioned JSON, serialized writes, backup, and recovery foundation | Implemented Phase 2A foundation |
| `src/main/services/process/` | Internal owned-resource registry plus narrow Main-only Job-owned/legacy-root process-tree abstraction, primary Windows Job finalizer, and gated fingerprinted taskkill legacy backend | Implemented through Phase 2E-J corrective Step 2; no public process executor |
| `src/main/services/run/` | Main-owned preparation/strategy, Run lifecycle, per-target re-run, project/owner-generation guards, Windows piped-process adapter/native binding and managed RunProjectLifecycle integration | Implemented and stabilized through Phase 4 |
| `tests/main/run-project-lifecycle.test.ts`, `scripts/smoke-run-project-lifecycle.mjs` | Real coordinator/service integration tests and native project/application smoke | 4D verification |
| `tests/main/run-lifecycle.test.ts`, `scripts/smoke-run-lifecycle.mjs` | Deterministic lifecycle/cleanup/re-run/stale-event tests and production Electron lifecycle verification | 4C verification |
| `src/main/services/dependencies/node-runtime.ts` | Main PATH-only Node detection; rejects relative/current-drive paths and returns safe missing/invalid states | 4B implemented |
| `src/main/services/dependencies/git-executable.ts` | Main PATH-only exact `git.exe` detection; ignores unsafe entries and grants no Renderer/configured-path authority | 5A implemented |
| `src/main/services/git/` | Private finite/streaming runner and GitService exact-root authorization, bounded status, selected-file stage/unstage, staged commit, local branch snapshot/safe switch and HEAD history | 5C semantic operations; 5D owned production runner and lifecycle |
| `src/main/services/git/git-operation-lifecycle.ts` | Project/window generations, read supersession, mutation draining, transition guards and fail-closed shutdown | 5D implemented |
| `src/main/services/git/git-document-owners.ts` | Main-only committed-document ownership and trusted sender-frame rejection; registered before window load | 5D document remediation |
| `tests/main/git-document-owners.test.ts`, `scripts/smoke-git-document-owners.mjs`, `tests/fixtures/git-document.html` | Deterministic IPC document races and real Electron same-WebContents reload/old-document request verification | 5D document remediation |
| `src/main/services/git/git-owned-command-runner.ts` | Windows native Git process, bounded output/timeout, Job cleanup and retained cleanup failure | 5D implemented |
| `src/main/ipc/git-lifecycle-ipc-service.ts`, `src/shared/contracts/git-lifecycle.ts`, `src/preload/bridge/git-identity.ts` | Exact identity envelope, owner-scoped context and receiving stale-result guards without widening semantic APIs | 5D implemented |
| `tests/main/git-lifecycle.test.ts`, `tests/main/git-lifecycle-ipc.test.ts`, `tests/main/git-owned-runner.test.ts`, `tests/main/git-owned.integration.test.ts` | Deterministic ownership/IPC/shutdown races plus real Windows Git hooks, descendants and cancellation | 5D verification |
| `tests/helpers/git-semantic-transport.ts` | Identity framing for retained semantic bridge regression fixtures | 5D test support |
| `scripts/smoke-git-native.mjs` | Production native binding in Electron: Unicode/quoted argv, commit/history, pipe settlement and empty Job release | 5D Windows smoke |
| `src/main/services/git/git-local-parser.ts` | Fixed machine-output parsing for local branch names and bounded typed history; rejects malformed records | 5C implemented |
| `tests/main/git-local.test.ts`, `tests/main/git-local.integration.test.ts` | Contract/IPC/Preload/outcome validation and production GitService/runner tests in temporary local repositories, including exact local `@` fallback and preservation | 5C remediation verified: 44 tests, including 32 real Git cases |
| `src/main/services/git/git-status-parser.ts` | Incremental bounded porcelain v2 parser; staged/unstaged slots, rename/copy pairs, conflicts and internal unborn state | 5B implemented |
| `src/main/services/git/git-path-authority.ts` | Canonical selected-file containment, deleted-path ancestor authorization and directory expansion rejection | 5B implemented |
| `tests/main/git-status-parser.test.ts`, `tests/main/git-status-service.test.ts` | Parser/contract, path authority, mutation outcome and IPC/Preload regressions | 5B verified |
| `tests/main/git-status.integration.test.ts`, `tests/main/git-stream-runner.test.ts` | Temporary real Git status/index/worktree preservation and real streaming process cleanup | 5B verified; real Git repository cases require Windows PATH Git |
| `tests/main/git-foundation.test.ts`, `tests/main/git-foundation.integration.test.ts` | Strict top-level path and IPC authority regressions; real Git process cleanup and temporary repository exact-root/non-repository/nested-root integration | 5A remediation verification; real integration requires Windows PATH Git and explicitly reports unavailable environments |
| `scripts/build-run-native.mjs`, `scripts/smoke-run-native.mjs`, `tests/fixtures/run/`, `tests/main/run-runtime.test.ts` | Electron native artifact compilation, real process smoke fixtures, runtime/launch boundary regression | 4B verification |
| `src/shared/contracts/run.ts`, `src/main/ipc/run-ipc-service.ts`, `src/preload/bridge/run.ts` | Exact Run validation and live narrow start/stop/event capability; no Renderer process options | 4A foundation, 4E composition |
| `src/renderer/src/features/output/` | EditorRunAction, OutputPanel, useProjectRun subscription ownership and RunController per-target session/output projection | Implemented 4E |
| `tests/renderer/run-output.integration.test.tsx`, `scripts/smoke-run-ui.mjs` | Deterministic UI/Preload/RunService integration and production Electron/native Run UI verification | 4E verification |
| `tests/main/run-foundation.test.ts` | 4A contracts, path/authority rejection, strategy preparation, session ownership, IPC/preload validation and cleanup | 37 focused tests |
| `src/main/services/terminal/` | Main-owned TerminalService registry/ownership/lifecycle/batching, project-transition leases, Windows shell resolution, environment policy, native-independent PTY port, sole production patched-node-pty adapter, retained natural-root ownership, and unified Job finalization | Implemented through Phase 2E-J corrective Step 2 |
| `patches/` and `scripts/` | Inspectable node-pty Windows Job tooling plus the production-build Monaco worker discovery smoke | Implemented through Phase 3B |
| `src/shared/contracts/` | Side-effect-free error, validation, lifecycle, project, file/filesystem-status, search, terminal, Run, and Git state/status/mutation/branch/history/identity contracts | Implemented through Phase 5E |
| `src/preload/index.ts` and `src/preload/bridge/` | Narrow typed domain bridges including exact-validated semantic Git operations through commit/branches/history; identity and stale reply guards, normalized transport errors and subscription cleanup | Implemented through Phase 5E |
| `src/renderer/src/main.tsx` | React renderer bootstrap, packaged Geist/xterm styles, and renderer-session editor/terminal/language/Problems disposal on real page unload | Implemented through Phase 3E |
| `src/renderer/src/App.tsx` | Resizable Orca-aligned project/editor/tools shell, top-chrome editor tabs, Explorer/Search/Source Control coordination, Terminal/Problems Bottom Panel ownership, ordered dirty/terminal transition decisions, transition locks, unavailable-project UX, active-project language synchronization, and Problems navigation | Implemented through Phase 5E |
| `src/renderer/src/components/` | Shared semantic buttons, focus-managed dialogs, and keyboard/pointer sidebar and Bottom Panel resizing | Implemented through Phase 2E-F |
| `src/renderer/src/features/explorer/` | Lazy Explorer tree, local feature state, refresh, mutation controls, errors, confirmation, and trusted file-level Git decorations | Implemented through Phase 5E |
| `src/renderer/src/features/editor/` | Renderer-session EditorModelManager/model owner, Monaco lifecycle/data safety, Search/Problems range navigation, deleted-file state, fail-closed dirty/terminal transition presentation, document lifecycle events, and adoption of existing provider models by canonical URI | Implemented through Phase 3E |
| `src/renderer/src/features/language/` | Renderer-owned Monaco/browser-worker capability/provider/status contracts for JS/TS/HTML/CSS/JSON; safe virtual URI and diagnostic generation identity; worker routing/defaults; production bounded JS/TS discovery, snapshots, model synchronization, project/file lifecycle cleanup, and stale-work rejection; explicit HTML/CSS/JSON provider defaults with offline JSON schema policy. HTML diagnostics are deferred because the current provider has no validation support; C#/PHP are tokenization-only and no Python/Java/external provider exists | Implemented through Phase 3D |
| `src/renderer/src/features/problems/` | Project/provider-generation-safe normalized diagnostic aggregation, Monaco marker consumption, grouped Problems presentation, cleanup, and file/range navigation requests | Implemented Phase 3E |
| `src/renderer/src/features/search/` | Shared Names/Contents query state, bounded results, cancellation, stale-event guards, navigation requests, and immediate-submit/project-reset lifecycle safety | Implemented through Phase 5E |
| `src/renderer/src/features/terminal/` | Renderer-session TerminalController, xterm/FitAddon factory, stable session hosts, ordered writes, fitting/resizing, shared Bottom Panel tabs, and multiple-session controls | Implemented through Phase 3E |
| `src/renderer/src/styles.css` | Semantic dark tokens and Orca-aligned shell, typography, controls, Explorer/Search/Source Control, editor, Terminal/Problems/Output Bottom Panel, dialogs, interaction states, and scrollbars | Implemented through Phase 5E |
| `tests/` | Vitest contract, service, IPC, preload, security/lifecycle, Phase 2 feature coverage, Monaco capability/worker/URI/diagnostic tests, Run lifecycle/UI regression, Git foundation/status/local/lifecycle/UI integration, repeated cleanup, and Search race coverage | Implemented through Phase 5F |
| `electron.vite.config.ts` | main/preload/renderer build configuration | Existing foundation |
| `docs/` | Requirements, reference, architecture, decisions, and thesis record | Existing and Phase 1 output |

There is no Orca source tree, submodule, runtime dependency, or copied Orca module in this repository.

## Planned module map

| Feature | Conceptual module | Planned directory | Responsibility | Phase |
|---|---|---|---|---:|
| App lifecycle | DesktopApplication | `src/main/app/` | Startup order, window lifecycle, service initialization, shutdown | 2 foundation work |
| Window security | WindowManager | `src/main/window/` | Secure BrowserWindow, navigation/external URL policy | 2 foundation work |
| Shared contracts | Domain contracts | `src/shared/contracts/` | Side-effect-free request/result/event/error types | 2 onward |
| Preload API | Domain bridges | `src/preload/bridge/` | Narrow contextBridge adapters, event cleanup | 2 onward |
| Project | ProjectService | `src/main/services/project/` | Active local project and minimal recent metadata required by project lifecycle | 2 |
| Project UI | Project UI | `src/renderer/src/features/project/` | Open/create/close/switch interactions | 2 |
| Explorer | FileSystemService | `src/main/services/filesystem/` | Authorized list/read/write/mutations/watch | 2 |
| Explorer UI | Explorer UI | `src/renderer/src/features/explorer/` | Lazy tree, refresh, file operations | 2 |
| Project search | SearchService | `src/main/services/search/` | Async excluded search, progress, cancellation | 2 |
| Search UI | Search UI | `src/renderer/src/features/search/` | Query/results/progress/cancel/navigation | 2 |
| Editor | EditorModelManager | `src/renderer/src/features/editor/models/` | Monaco model identity, dirty/version/view/disposal | 2 |
| Editor UI | Editor UI | `src/renderer/src/features/editor/` | Monaco mount, tabs, save, unsaved prompts | 2 |
| Application layout | Application Shell | `src/renderer/src/app-shell/` | Explorer, Editor Area, Bottom Panel, Status Bar | 2 |
| Terminal backend | TerminalService | `src/main/services/terminal/` | PTY sessions, shell profiles, resize, cleanup | 2 |
| Terminal UI | Terminal UI | `src/renderer/src/features/terminal/` | xterm views and session controls | 2 |
| Common process internals | ProcessManager | `src/main/services/process/` | Owned-process registry and safe cleanup primitives | 2/4 |
| Current language intelligence | LanguageProviderManager and Monaco adapters | `src/renderer/src/features/language/` | Renderer-owned Phase 3 provider registry/capabilities, bounded source sync, Monaco workers, diagnostics, status, and cleanup; no external process | 3 |
| C# compatibility evidence | Isolated `csharp-ls`/LSP Windows spike | `spikes/csharp-lsp-compatibility/` | Actual 5.5B harness, structured workspace-preflight fixtures, report, and machine evidence; not production code; hard gate passed | 5.5B actual |
| C# external language service | LanguageServiceManager and C# adapter | `src/main/services/language/` | Main LSP core, C# adapter, workspace/preflight, ordered document sync, semantic routing and retained Job cleanup | 5.5D–5.5F actual |
| Internal LSP transport | LspConnection | `src/main/services/language/lsp-connection.ts` | Pinned JSON-RPC streams, correlation, cancellation, deadlines, safe errors, server handlers and disposal | 5.5D actual |
| C# protocol mapping | CSharpLsAdapter | `src/main/services/language/csharp-ls-adapter.ts` | UTF-16 initialize/capability capture; semantic methods and notification primitives; private completion/result-ID caches; watched-registration allowlist | 5.5D adapter; 5.5E synchronization controller actual |
| C# process ownership | WindowsCsharpProcessFactory | `src/main/services/language/csharp-process.ts` | Resolver-selected provider, fixed args, native stdin/stdout/stderr, retained atomic Job ownership and bounded finalization | 5.5D actual |
| C# manager and errors | LanguageServiceManager | `src/main/services/language/language-service-manager.ts`, `src/main/services/language/language-error.ts` | One session, separate dependency/lifecycle state, effective capabilities, no automatic restart, safe errors and cleanup retry retention | 5.5D core; 5.5E–F composition |
| C# native entry point | Main-only pipe/Job binding | `src/main/services/run/native/run-process.cpp` | Dedicated `createCsharp`, asynchronous `writeCsharp` and finite-command `createCsharpPreflight`; existing Run/Git entry paths retained | 5.5D actual |
| C# workspace and selection | CsharpWorkspace / CsharpWorkspaceStore | `src/main/services/language/csharp-workspace.ts`, `src/main/services/language/csharp-workspace-store.ts` | Bounded discovery, per-project selection, project/syntax-only mode and structured preflight | 5.5E actual |
| C# preflight process | CsharpPreflightProcess | `src/main/services/language/csharp-preflight-process.ts` | Fixed SDK/solution/evaluation commands, bounded output/deadlines and retained native Job cleanup | 5.5E actual |
| C# workspace lifecycle | CsharpWorkspaceSession / CsharpOwnerLifecycle | `src/main/services/language/csharp-workspace-session.ts`, `src/main/services/language/csharp-owner-lifecycle.ts` | Lazy active-project session, project/root/owner invalidation and shutdown; composed in Main index | 5.5E actual |
| C# document synchronization | CsharpDocumentSync / DocumentSyncQueue | `src/main/services/language/csharp-document-sync.ts`, `src/main/services/language/document-sync-queue.ts` | Ordered incremental UTF-16 versions, dirty shadow, editor-save notification, flush/stale guards and Renderer client entry | 5.5E–5.5F actual |
| C# file awareness | CsharpWatchedFiles | `src/main/services/language/csharp-watched-files.ts` | Existing FileSystemService events, dynamic glob/kind registration, open-buffer precedence and stale cancellation | 5.5E actual |
| C# workspace verification | Focused tests and real Electron smoke | `tests/main/csharp-workspace-sync.test.ts`, `tests/main/csharp-preflight-process.test.ts`, `scripts/smoke-csharp-preflight.mjs`, `scripts/smoke-csharp-workspace.mjs` | 47 focused tests, real native preflight and provider workspace/document/cleanup cycles | 5.5E verified |
| C# verification | Fake LSP and Windows smoke | `tests/main/language-lsp.test.ts`, `tests/fixtures/csharp-native-child.mjs`, `scripts/smoke-csharp-native.mjs` | Protocol/lifecycle tests; real Electron hard-killed root/surviving descendant, blocked stdin, and provider initialize/shutdown | 5.5D actual |
| C# dependency detection | C# dependency/provider resolver | `src/main/services/dependencies/` | Actual PATH-only .NET SDK inventory and private/app-owned `csharp-ls` resolver/version-probe foundation in `dotnet-sdk.ts`, `csharp-ls.ts`, `language-probe.ts`, and `windows-executable.ts`; no session or preflight orchestration | 5.5C actual |
| C# language contracts | Semantic language contracts | `src/shared/contracts/language.ts`, `src/shared/contracts/language-validation.ts` | Project-relative semantic/document DTOs, truthful workspace modes, declared/effective capabilities, bounded opaque handles and exact validators without raw protocol/process fields | 5.5C foundation; 5.5F public contract actual |
| C# semantic routing | CsharpSemanticService and mapping | `src/main/services/language/csharp-semantic-service.ts`, `src/main/services/language/csharp-semantic-mapping.ts` | Trusted-frame/project/document/version authorization, flush-before-request, bounded safe mapping, completion-handle retention, cancellation and contained definition targets | 5.5F actual |
| C# language IPC | LanguageIpcService | `src/main/ipc/language-ipc-service.ts` | Exact request validation and capability-scoped workspace/document/semantic/status routing; no raw protocol/process or lifecycle-control channel | 5.5F actual |
| C# preload bridge | Language bridge | `src/preload/bridge/language.ts` | Narrow typed semantic API, exact response/event validation and subscription cleanup; no raw IPC/LSP/process authority | 5.5F actual |
| C# Monaco integration | C# client/providers/navigation | `src/renderer/src/features/language/csharp/` | Renderer-session document sync, four capability-specific providers, explicit UTF-16/range/kind/Markdown mapping, cancellation, stale-result rejection and contained definition navigation | 5.5F actual; diagnostics/status UI remain 5.5G |
| C# semantic verification | Main/IPC/Preload/Renderer tests | `tests/main/csharp-semantic.test.ts`, `tests/renderer/csharp-semantic-providers.test.ts`, `tests/contracts/language-validation.test.ts` | Ownership, validation, synchronization, mapping, handles, cancellation, provider registration and late-result disposal coverage | 5.5F verified |
| Problems | Problems UI/model | `src/renderer/src/features/problems/` | Normalized problems and file/range navigation | 3 |
| Dependency detection | DependencyDetectionService | `src/main/services/dependencies/` | Runtime, Git, and Phase 5.5C C# SDK/provider detection foundations; current Phase 3 Monaco workers need no executable detection | 4–6/5.5C actual |
| Run execution | RunService / internal RunStrategy / JavaScriptRunStrategy | `src/main/services/run/` | 4A–4E execution, lifecycle and narrow UI composition exist. Future TS strategy remains behind ADR-014; Run Project/npm scripts/project entry deferred | 4/Future |
| Output | Output UI | `src/renderer/src/features/output/` | Existing Bottom Panel sibling with stdout/stderr/exit/error output; single editor-header Run entry and contextual Stop | Implemented 4E |
| Git | GitService | `src/main/services/git/` | Detection, status, stage, commit, branch, history | 5 |
| Source Control | Git UI | `src/renderer/src/features/git/SourceControl.tsx` | Project-session Git status, selected-row stage/unstage, commit draft, local branch switch, bounded history, unavailable/unknown/applied recovery | Implemented 5E |
| Settings | SettingsService | `src/main/services/settings/` | Schema/defaults/validation/update | 6 |
| Persistence | PersistenceService | `src/main/services/persistence/` | Versioned JSON, atomic writes, migration/recovery | 2/6 |
| Settings UI | Settings UI | `src/renderer/src/features/settings/` | Theme/editor/path settings, validation UX, and user-facing Recent Projects management | 6 |
| Test support | Service/IPC fixtures | `tests/` or colocated `*.test.ts` | Critical unit and integration gates | 2–7 |

## Phase 5E actual UI and verification paths

- `src/renderer/src/App.tsx` retains Explorer and Source Control in the right
  sidebar with accessible icon tabs; `styles.css` provides existing-token Git
  controls and dark scrolling. Git remains mounted across tab switches and is
  replaced on project identity changes.
- `src/renderer/src/features/git/file-decoration.ts` projects the trusted Git
  snapshot into file-only Explorer badges and colors. SourceControl publishes
  that snapshot through App; Explorer creates no additional Git requests or
  lifecycle. Invalidated snapshots and old project identities are hidden.
- `tests/renderer/file-decoration.test.ts` covers display priority and conflict
  distinction; Explorer integration tests cover snapshot sharing, accessibility,
  nested files, invalidation and project replacement.
- `tests/renderer/source-control.test.tsx` covers semantic actions, draft
  retention, mutation outcomes, stale reads, lock recovery and Preload identity
  integration. `tests/renderer/project-explorer.integration.test.ts` covers shell
  tabs, Search retention and project-close draft reset.
- `scripts/smoke-git-ui.mjs` exercises the built App, production Preload/Main Git
  IPC, document ownership and native runner against a temporary local repository.
  `scripts/smoke-phase-5e-ui.mjs` verifies production component layout with fixture
  responses. Generated screenshots are under `out/phase-5e-ui/`.
  The real Git smoke also checks Orca-aligned geometry, accessible file labels,
  and keyboard resizing to 220 px with viewport and content containment.
- Existing resumed Names/Contents search changes remain in SearchService, search
  contracts/IPC/Preload, SearchPanel and ProjectExplorer. Their regression paths
  are `tests/main/search-names.test.ts`, `tests/preload/search-names.test.ts`,
  and `tests/renderer/search-names.test.tsx`.

## Dependency direction

```text
Renderer features -> preload domain API -> shared contracts -> main IPC adapters -> domain services

Domain services -> small platform adapters (filesystem, PTY, child process, Git, persistence)
```

Main domain services must not import renderer code. Renderer features must not import Node/Electron privileged APIs. Shared contracts must not execute code or depend on Electron runtime objects.

## Deliberately absent

No planned V1 directory exists for AI agents, Codex/Claude providers, worktrees, remote execution, cloud sync, mobile, collaboration, extension host/marketplace, formatter, or debugger.

Phase 5.5D–5.5F provide the Main C# LSP core, workspace/preflight and document
synchronization, semantic IPC/Preload bridge, and Renderer completion, hover,
signature-help and definition providers. C# diagnostics, Problems contribution
and status UX remain absent until Phase 5.5G. PHP remains tokenization-only.
No Python, Java, or custom/alternate HTML diagnostics provider was added.
