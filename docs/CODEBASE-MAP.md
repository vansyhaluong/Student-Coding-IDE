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

Local AI Chat through Phase 8C (`COMPLETE`):
`src/renderer/src/features/ai/AiChatPanel.tsx` owns the ephemeral conversation;
`src/renderer/src/components/ai/` contains the five stock beUI components and
their required local support modules, with source attribution and MIT license.
App owns only the toggle/overlay; Explorer/Git stay mounted and the right resizer
stays above the panel. Typed AI contracts and Main-owned Ollama integration exist.

Current Phase 8A Local AI UI structure (`COMPLETE`):

```text
Renderer (src/renderer/src/)
└── features/ai/
    └── AiChatPanel.tsx
```

UI integration flow: App chrome → Local AI toggle → AiChatPanel → beUI AI
primitives. The selected primitives in `src/renderer/src/components/ai/` are:

- Message (`message.tsx`).
- MessageBubble (`message-bubble.tsx`).
- MessageScroller (`message-scroller.tsx`).
- PromptInput (`prompt-input.tsx`).
- StreamingResponse (`streaming-response.tsx`).

The top-right toggle opens/closes the right-sidebar overlay without blocking
the editor. `qwen3:1.7b` is the fixed local model.

Phase 8A, 8B and 8C Streaming & Reliability are COMPLETE.
`src/shared/contracts/ai.ts` defines the typed AI API; `src/preload/bridge/ai.ts`
and `src/main/ipc/ai-ipc-service.ts` validate the request/response boundary.
`src/main/services/ai/ollama-service.ts` calls fixed `http://127.0.0.1:11434`
with fixed `qwen3:1.7b`, conversation history, `stream:true` and `think:false`.
The 8B complete-response API has been replaced by typed `startChat`, `stopChat`
and `onChatEvent`. Main parses NDJSON incrementally and forwards request-identified
chunk/complete/error/stopped events only to the owning renderer. `src/main/index.ts`
wires the AI event callback and window observation. AI IPC owns active requests,
sender authorization, overlap prevention and window/navigation/shutdown cleanup.
AiChatPanel updates one response, guards stale/early events, cancels on unmount,
and preserves partial content after Stop or error. Thinking... lasts until the
first content chunk. The service uses AbortController, bounded records/output,
timeouts, availability checks and malformed/interrupted-stream errors.
AI tests live in `tests/main/ai-ollama.test.ts`, `tests/main/ai-ipc.test.ts` and
`tests/renderer/ai-chat-panel.test.tsx`. No agent, tools, file context or persistence exists.

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
| `patches/` and `scripts/` | Inspectable node-pty Windows Job tooling, production-build Monaco worker discovery smoke, and Phase 5.5 validated development dependency launcher | Implemented through corrective Phase 5.5F/G |
| `src/shared/contracts/` | Side-effect-free error, validation, lifecycle, project, file/filesystem-status, search, terminal, Run, Git and C# language/status/diagnostic contracts | Implemented through Phase 5.5G |
| `src/preload/index.ts` and `src/preload/bridge/` | Narrow typed domain bridges including exact-validated Git and C# semantic/diagnostic operations; identity and stale reply guards, normalized transport errors and subscription cleanup | Implemented through Phase 5.5G |
| `src/renderer/src/main.tsx` | React renderer bootstrap, packaged Geist/xterm styles, and renderer-session editor/terminal/language/Problems disposal on real page unload | Implemented through Phase 3E |
| `src/renderer/src/App.tsx` | Resizable Orca-aligned project/editor/tools shell, top-chrome editor tabs, Explorer/Search/Source Control coordination, Terminal/Problems Bottom Panel ownership, ordered dirty/terminal transition decisions, transition locks, unavailable-project UX, active-project language synchronization, Problems navigation, and C# status presentation | Implemented through Phase 5.5G |
| `src/renderer/src/components/` | Shared semantic buttons, focus-managed dialogs, and keyboard/pointer sidebar and Bottom Panel resizing | Implemented through Phase 2E-F |
| `src/renderer/src/features/explorer/` | Lazy Explorer tree, local feature state, refresh, mutation controls, errors, confirmation, and trusted file-level Git decorations | Implemented through Phase 5E |
| `src/renderer/src/features/explorer/ExplorerContextMenu.tsx` | Local floating file/folder/background menus, viewport bounds, keyboard navigation and dismissal; ProjectExplorer retains mutation/dialog ownership | Authorized Explorer context-menu follow-up |
| `src/renderer/src/features/editor/` | Renderer-session EditorModelManager/model owner, Monaco lifecycle/data safety, Search/Problems range navigation, deleted-file state, fail-closed dirty/terminal transition presentation, document lifecycle events, and adoption of existing provider models by canonical URI | Implemented through Phase 3E |
| `src/renderer/src/features/language/` | Renderer-owned Monaco workers for JS/TS/HTML/CSS/JSON plus Main-backed C# semantic providers, open-document diagnostics, status presentation, safe URI/generation identity, synchronization, cleanup and stale-work rejection | Implemented through Phase 5.5G |
| `src/renderer/src/features/problems/` | Project/provider-generation-safe normalized Monaco and C# diagnostic aggregation, marker consumption, grouped Problems presentation, cleanup, and file/range navigation requests | Implemented through Phase 5.5G |
| `src/renderer/src/features/search/` | Shared Names/Contents query state, bounded results, cancellation, stale-event guards, navigation requests, and immediate-submit/project-reset lifecycle safety | Implemented through Phase 5E |
| `src/renderer/src/features/terminal/` | Renderer-session TerminalController, xterm/FitAddon factory, stable session hosts, ordered writes, fitting/resizing, shared Bottom Panel tabs, and multiple-session controls | Implemented through Phase 3E |
| `src/renderer/src/styles.css` | Semantic dark tokens and Orca-aligned shell, typography, controls, Explorer/Search/Source Control, editor, Terminal/Problems/Output Bottom Panel, C# status details, dialogs, interaction states, and scrollbars | Implemented through Phase 5.5G |
| `tests/` | Vitest contract, service, IPC, preload, security/lifecycle, Monaco and C# language/diagnostic/status tests, Run lifecycle/UI regression, Git integration, repeated cleanup, and Search race coverage | Implemented through Phase 5.5G |
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
| C# semantic routing | CsharpSemanticService and mapping | `src/main/services/language/csharp-semantic-service.ts`, `src/main/services/language/csharp-semantic-mapping.ts`, `src/main/services/language/csharp-diagnostic-mapping.ts` | Trusted-frame/project/document/version authorization, flush-before-request, bounded safe mapping, completion-handle/result-ID retention, diagnostic serialization, cancellation and contained definition targets | 5.5F–5.5G actual |
| C# language IPC | LanguageIpcService | `src/main/ipc/language-ipc-service.ts` | Exact request validation and capability-scoped workspace/document/semantic/status routing; no raw protocol/process or lifecycle-control channel | 5.5F actual |
| C# preload bridge | Language bridge | `src/preload/bridge/language.ts` | Narrow typed semantic API, exact response/event validation and subscription cleanup; no raw IPC/LSP/process authority | 5.5F actual |
| C# Monaco integration | C# client/providers/diagnostics/status/navigation | `src/renderer/src/features/language/csharp/` | Renderer-session document sync, four semantic providers, C# marker/Problems publication, bounded post-edit settling, separate dependency/workspace/service status UX, cancellation, stale-result rejection and contained navigation | 5.5F–5.5G actual |
| C# real-app corrective verification | Production Electron stack with test-only observation | `scripts/smoke-csharp-acceptance.mjs` | Fresh console fixture, hover/completion/signature UI, diagnostic marker/Problems update and clear, effective capabilities and registration checks; automated acceptance only | F/G corrective evidence; user-confirmed manual acceptance and 5.5H COMPLETE |
| C# semantic verification | Main/IPC/Preload/Renderer tests | `tests/main/csharp-semantic.test.ts`, `tests/main/language-lsp.test.ts`, `tests/renderer/csharp-semantic-providers.test.ts`, `tests/renderer/csharp-diagnostics.test.ts`, `tests/renderer/csharp-status.test.tsx`, `tests/contracts/language-validation.test.ts` | Ownership, exact validation, synchronization, mapping, private handles/result IDs, diagnostics, status, cancellation, provider registration and late-result disposal coverage | 5.5F–5.5G verified |
| Problems | Problems UI/model | `src/renderer/src/features/problems/` | Normalized problems and file/range navigation | 3 |
| Dependency detection | DependencyDetectionService | `src/main/services/dependencies/` | Runtime, Git, and Phase 5.5C C# SDK/provider detection foundations; current Phase 3 Monaco workers need no executable detection | 4–6/5.5C actual |
| Run execution | RunService / internal RunStrategy / JavaScriptRunStrategy | `src/main/services/run/` | 4A–4E execution, lifecycle and narrow UI composition exist. Future TS strategy remains behind ADR-014; Run Project/npm scripts/project entry deferred | 4/Future |
| Output | Output UI | `src/renderer/src/features/output/` | Existing Bottom Panel sibling with stdout/stderr/exit/error output; single editor-header Run entry and contextual Stop | Implemented 4E |
| Git | GitService | `src/main/services/git/` | Detection, status, stage, commit, branch, history | 5 |
| Source Control | Git UI | `src/renderer/src/features/git/SourceControl.tsx` | Project-session Git status, selected-row stage/unstage, commit draft, local branch switch, bounded history, unavailable/unknown/applied recovery | Implemented 5E |
| Settings | SettingsService | `src/main/services/settings/settings-service.ts`, `src/main/ipc/settings-ipc-service.ts`, `src/shared/contracts/settings.ts`, `src/preload/bridge/settings.ts` | Exact schema/default/update, trusted-frame IPC, Node/Git dependency guidance | 6 actual |
| Persistence | PersistenceService | `src/main/services/persistence/persistence-service.ts` | Serialized atomic updates, v1-to-v2 app metadata migration, backup/corruption recovery | 2/6 actual |
| Settings UI | Settings UI | `src/renderer/src/features/settings/` | Light/Dark/System, editor preferences, fixed shortcuts, dependency guidance and Recent Projects management | 6 actual |
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

Phase 5.5D–5.5G provide the Main C# LSP core, workspace/preflight and document
synchronization, semantic/diagnostic IPC and Preload bridge, Renderer completion,
hover, signature-help, definition and open-document diagnostics, Problems
contribution, and separate dependency/workspace/service status UX. PHP remains tokenization-only.
No Python, Java, or custom/alternate HTML diagnostics provider was added.

## Phase 6 actual integration and verification paths

- `src/renderer/src/features/editor/auto-save.ts` schedules the existing
  version-aware save flow after 1000 ms without an edit; owning models and
  `use-editor-workspace.ts` retain dirty/conflict decisions.
- `EditorWorkbench.tsx` applies font/tab/theme settings to retained Monaco models.
  `features/terminal/xterm-factory.ts` follows theme changes and releases its
  observer with the terminal view.
- Project history remains Main-owned in `project-service.ts`; list/open/remove
  use opaque IDs through `project-ipc-service.ts` and the project preload bridge.
- `tests/main/settings-service.test.ts`, `tests/renderer/settings.test.tsx`,
  `tests/renderer/auto-save.test.ts` and expanded project/IPC/editor/preload tests
  cover persistence, boundary validation, lifecycle, failure handling and UX.
- `scripts/smoke-settings.mjs` uses production Main/Preload and a renderer build
  with a test-only model observation point. Isolated fixtures, JSON evidence and
  screenshots live under ignored `out/phase6-smoke/`. No observation capability
  is included in the production renderer build.

## Planned C# Project Run modules — ADR-024 / Plan Section 13.7

Status: `NOT_STARTED`; this table is a planning map, not an actual-source claim.
Existing Run/Output files are extended only in explicitly authorized future tasks.
No module below was created by the 2026-10-07 planning update.

| Domain / responsibility | Proposed path | Ownership / status |
|---|---|---|
| C# fixed build/run strategy | `src/main/services/run/csharp-run-strategy.ts` | Main Run domain; planned |
| Console target discovery/evaluation | `src/main/services/run/csharp-run-target-resolver.ts`, `csharp-run-preflight.ts` in that directory | Main; planned; not CsharpWorkspace or LSP session |
| Remembered Run target | `src/main/services/run/csharp-run-target-store.ts` | Main versioned JSON store; planned; separate from IntelliSense store |
| Run SDK eligibility | `src/main/services/dependencies/dotnet-run-runtime.ts` | Main; planned; shared inventory helpers, independent Run policy |
| Saved-source preparation guard | `src/main/services/run/run-source-guard.ts` | Main Run-owned bounded Renderer handshake; planned; no Monaco ownership |
| Bounded stdin queue | `src/main/services/run/run-input-queue.ts` | Main Run session; planned M2 |
| Existing identity/plan/process seams | `src/main/services/run/run-service.ts`, `run-strategy.ts`, `piped-process-adapter.ts`, `windows-piped-process-adapter.ts`, `native/run-process.cpp` | Existing actual modules; planned extension with JS/Git/LSP regressions |
| Semantic Run wire boundary | `src/shared/contracts/run.ts`, `src/main/ipc/run-ipc-service.ts`, `src/preload/bridge/run.ts` | Existing actual modules; planned target/phase/guard/input DTOs and validators |
| Target selection and line composer | `src/renderer/src/features/output/run-controller.ts`, `EditorRunAction.tsx`, `OutputPanel.tsx`, `use-project-run.ts` | Existing actual Output feature; planned minimal extension |
| Compatibility evidence | `spikes/csharp-project-run/REPORT.md` and isolated harness | Planned M1-04 evidence only; no new dependency without separate authorization |
| C# Run acceptance | `tests/main/csharp-run-*.test.ts`, `tests/renderer/run-output.integration.test.tsx`, `scripts/smoke-csharp-run.mjs` | New focused tests/smoke planned; existing integration suite extended |

TerminalService, LanguageServiceManager and Exercise Runtime retain independent
semantics. No generic renderer process service, new panel system or public native
handle is introduced by this map. Actual paths/statuses update only after verified
implementation; packaged/installed acceptance remains Phase 7.

## Phase 9 Learning modules — ADR-025 / Plan Section 13.6

Status: `IN_PROGRESS` overall. 9A–9C are COMPLETE by user acceptance;
9D Common is IN_PROGRESS (contracts/Core/native/Main lifecycle, typed IPC/Preload
and Renderer integration, approved 2026-10-20); remaining live acceptance is due;
9D.1 is IN_PROGRESS through C# production wiring and Windows 11 live UI verification; final acceptance/Windows 10/packaging remain due. 9D.2 and 9E–9G remain NOT_STARTED.

Step 5 actual modules: `src/main/services/learning/runtime/csharp-execution-adapter.ts`
and `csharp-runtime-files.ts`, with retained artifact verification in the compiler/
compile workspace and additive raw-byte/semantic-failure integration in Learning
adapter/Core. Actual tests: `tests/main/csharp-execution-adapter.test.ts`,
`csharp-runtime-files.test.ts`, `csharp-execution.integration.test.ts`. Evidence:
`docs/PHASE-9D1-CSHARP-EXECUTION.md`.

Step 6 actual driver: `src/main/services/learning/runtime/csharp-orchestrator.ts`;
additive Learning Core barrier in `exercise-session.ts`/`exercise-limits.ts`,
adapter/port extensions and exact `notRunCaseIndices` contract validation. New
real integration: `tests/main/csharp-multicase.integration.test.ts`; extended
contract, adapter, Core and single-sample regression tests. Evidence:
`docs/PHASE-9D1-CSHARP-MULTICASE.md`.

Step 7 extends the existing `src/main/services/learning/exercise-service.ts`
Windows factory with the C# driver. Optional typed observation/validation lives in
shared `exercise.ts`, `exercise-validation.ts` and `csharp-execution-validation.ts`;
the existing IPC/Preload routes reuse those validators. Existing
`practice/use-exercise-runtime.ts` and `PracticeTestPanel.tsx` handle progress,
actuals, diagnostics and stale-invoke/event ordering. New UI tests:
`tests/renderer/csharp-result-panel.test.tsx`. Production Electron acceptance:
`scripts/run-learning-csharp-ui-acceptance.mjs` and `smoke-learning-csharp-run.mjs`.
Evidence and full file list: `docs/PHASE-9D1-CSHARP-UI.md`. No new IPC channel or
DesktopApplication/Project/Terminal/native implementation change in Step 7.

9D.1 Step 4 extends existing `runtime/native/learning-job.cpp`,
`windows-exercise-native.ts` and `windows-exercise-adapter.ts` with one-shot bounded
UTF-8 stdin/EOF and retained overlapped I/O. Actual verification paths:
`tests/main/learning-stdin.integration.test.ts`,
`tests/fixtures/learning/stdin-owner.mjs`, and adapter regressions. Evidence:
`docs/PHASE-9D1-NATIVE-STDIN.md`. Step 4 itself adds no C# execution driver or public path capability.
Actual 9A/9B/9C paths below are implemented; later paths
remain proposed. One subject and exactly eight chapters, without a course
selector. Supplied lesson data is separate from React with source/license-review
metadata; 9B acceptance limits are in `PHASE-9B-ACCEPTANCE.md`.

| Responsibility | Proposed path / existing reuse | Ownership / package |
|---|---|---|
| Mode and eight-chapter Roadmap | `src/renderer/src/features/learning/`, integration with existing `App.tsx` | Renderer, 9A; retain project/editor/terminal state |
| Learning header controls (authorized UI follow-up) | `src/renderer/src/features/learning/LearningSidebarHeader.tsx` | Renderer; App composes title and collapse/expand button beside the logo in the existing chrome, using its existing sidebar state; explicit no-drag control |
| Local content and provenance (actual 9B) | `docs/learning/manifest.json`, `docs/learning/chapters/chapter-01.md`–`chapter-08.md`; `src/main/services/learning/content/course.ts`, `raw-content.d.ts` | Main embeds fixed inputs at build time; no repository paths read at runtime; P9-CONTENT resolved for lessons only |
| Theory presentation (actual 9B); quiz deferred | `src/renderer/src/features/learning/LearningWorkspace.tsx`, `ChapterMaterial.tsx`, `highlight-csharp.ts`, `use-learning-course.ts`, `learning.css` | Renderer; eight continuous theory pages, safe Markdown/GFM, model-free C# tokenization, source metadata; quizzes remain 9F |
| Learning section Tabs (authorized UI follow-up) | `src/renderer/src/components/motion/tabs.tsx`, local `lib/ease.ts`, `lib/utils.ts`, `README.md`, `LICENSE` | Stock MIT beUI Tabs with local import rewiring; controlled pill composition styled after Cursor pricing, guarded draft saving and retained theory panels; existing dependencies |
| Exercise session and workspace (actual 9C; runtime UI added Common step 6) | `src/renderer/src/features/learning/practice/` | Renderer; chapter list, independent Monaco/drafts, sample/result dock and My Solutions shell; Run invokes Exercise API with safe unsupported status until drivers exist; Submit disabled |
| Learning editor synchronization correction | `practice/PracticeEditor.tsx`, `use-practice.ts`, `PracticeWorkspace.tsx`; `tests/renderer/practice-editor-sync.test.tsx`; `scripts/smoke-learning-editor-sync.mjs` | Monaco owns live edits; initial context draft plus explicit Reset/Restore intent, no controlled stale draft echo. Existing autosave and context isolation retained; real Monaco evidence in PHASE-9D1-EDITOR-SYNC.md |
| Exercise Renderer lifecycle (actual Common step 6) | `src/renderer/src/features/learning/practice/use-exercise-runtime.ts`; LearningWorkspace, PracticeWorkspace, PracticeTestPanel and use-practice | Context-owned subscription/probe/attempt, Main-issued identity and sequence filtering, internal lifecycle stop and late-result disposal, source revision and safe status/output; tests/renderer/exercise-runtime.test.tsx and practice-workspace.test.tsx; scripts/smoke-exercise-renderer.mjs for production unsupported path |
| Exercise catalogue and drafts (actual 9C) | `src/main/services/learning/content/exercises.ts`, `src/main/services/learning/practice-store.ts`, `src/shared/contracts/practice.ts` | 63 authored exercises, six types; separate versioned Code Draft storage using PersistenceService, no Accepted records |
| Narrow Practice bridge (actual 9C) | `src/main/ipc/practice-ipc-service.ts`, `src/preload/bridge/practice.ts` | Validated load/save and owned close/resume handshake, no execution API |
| Isolated Exercise runtime prototype (9D.0 only) | `spikes/exercise-runtime-9d0/` | Developer-only harness, local SDK/Node and selective argv/Job primitive port; no production service/IPC/UI or shared native/process edits; evidence in REPORT.md |
| Semantic Learning contracts (actual 9B) | `src/shared/contracts/learning.ts` | Side-effect-free course/material DTOs and response validation; 9C exercise contracts live in practice.ts; quiz contracts deferred |
| Narrow Learning bridge (actual 9B) | `src/preload/bridge/learning.ts`, `src/main/ipc/learning-ipc-service.ts` | Read-only getCourse; exact empty request validation and Main frame authorization; no path/command input |
| Exercise coordination (actual step 4) | `src/main/services/learning/exercise-service.ts`; additive wiring in `src/main/index.ts` | Main global admission, identities/generation, owner invalidation, tracked startup recovery, Policy B cleanup/shutdown barrier; lazy independent native/lease factory, no language driver or renderer API; tests/main/exercise-service.test.ts |
| Exercise IPC/Preload (actual step 5) | `src/main/ipc/exercise-ipc-service.ts`, `src/preload/bridge/exercise.ts`; Learning API/bridge and additive Main wiring | Exact semantic requests, registered sender/main-frame/document-epoch authority, session/generation/sequence filtering, sanitized errors, bounded output validation and unload-safe subscriptions; tests/main/exercise-ipc.test.ts, tests/preload/exercise-bridge.test.ts; scripts/smoke-exercise-ipc.mjs tests built production Main/Preload without language drivers |
| Exercise Common DTOs/policy (actual step 1) | `src/shared/contracts/exercise.ts`, `exercise-validation.ts`; exported by contracts/index.ts | Side-effect-free run/session/lifecycle/snapshot declarations, approved bounds and exact validators; tests/contracts/exercise-validation.test.ts; no IPC/Main/native/UI wiring |
| Learning Runtime Core (actual step 2; native port added step 3) | `src/main/services/learning/runtime/exercise-session.ts`, `exercise-workspace.ts`, `exercise-checkpoint.ts`, `exercise-recovery.ts`, `exercise-limits.ts`, `exercise-runtime-adapter.ts` | Policy B state machine, monotonic deadlines, retained/deduplicated cleanup, scoped filesystem checkpoints/recovery, adapter and exclusive-lease ports; tests/main/exercise-session.test.ts and exercise-workspace.test.ts; managed by ExerciseService since step 4 |
| Learning Windows Job/lease implementation (actual step 3) | `src/main/services/learning/runtime/native/learning-job.cpp`, `windows-exercise-native.ts`, `windows-exercise-adapter.ts`, `windows-exercise-lease.ts`; `scripts/build-learning-native.mjs` and additive hook in `electron.vite.config.ts` | Independent suspended Job-list launch, hard aggregate quota read-back, identity handles, bounded nonblocking pipe/Job polling, staged release, OS-exclusive leases; artifact `out/main/native/learning/learning-job.node`; independent factory composed in step 4, no Project native/process changes |
| Native Learning tests (actual step 3) | `tests/main/windows-exercise-adapter.test.ts`, `windows-exercise-native.integration.test.ts`; `tests/fixtures/learning/` | Mock error mapping/stage tests plus real Windows Job/handles/quota/lease tests; bounded allocator built only with `--test-fixtures`; development evidence under `out/learning-native-step3/` |
| Common live acceptance (actual step 7; test-only) | `scripts/run-exercise-common-acceptance.mjs`; `tests/fixtures/learning/common-acceptance.ts`; `docs/PHASE-9D-COMMON-STEP7-ACCEPTANCE.md` | Separate out/ fixture bundle, never a production entry; real Electron/IPC/Preload/Job/Project Run/PTY with fixed Main driver and explicit fault/record injection. 60s/12s real-clock evidence; no C#/JS adapter or production debug endpoint. Common remains IN_PROGRESS pending review/supported-Windows/adapter acceptance |
| C#/JavaScript harness adapters | `src/main/services/learning/runtime/` | Main, 9D; generated driver, controlled compiler/Node processes, limits/Stop/cleanup |
| C# execution contracts (actual 9D.1 Step 1) | `src/shared/contracts/csharp-execution.ts`, `csharp-execution-validation.ts`; `src/main/services/learning/runtime/csharp-execution-contracts.ts`; `tests/contracts/csharp-execution.test.ts` | Standalone bounded sample-only DTOs, JSON harness protocol, failure/diagnostic validators and Main-only resolver/compiler/adapter declarations; no runtime/native/IPC/UI implementation. Specification: `docs/PHASE-9D1-CSHARP-CONTRACTS.md` |
| C# SDK discovery (actual 9D.1 Step 2) | `src/main/services/learning/runtime/csharp-sdk-resolver.ts`; `tests/main/csharp-sdk-resolver.test.ts`; `docs/PHASE-9D1-SDK-RESOLVER.md` | Filesystem-only numeric stable 10.x selection, contained PE/CLR and manifest validation, harness reference closure, safe failures and frozen selection. Controlled synthetic installations and separate actual installed-filesystem observation; no compiler process, Project resolver, composition or public path capability |
| Learning process results (actual 9D.1 compiler unblock) | `src/main/services/learning/runtime/exercise-runtime-adapter.ts`, `windows-exercise-adapter.ts`; adapter/native integration tests; `docs/PHASE-9D1-PROCESS-RESULT-PORT.md` | Main-only nonzero OS exit observation, conservative process/stream settlement and typed failures/Job-limit evidence. Existing Common runPhase behavior and Policy B remain; no output buffer, native stdin, public API or compiler implementation |
| C# compile pipeline (actual 9D.1 Step 3) | `src/main/services/learning/runtime/csharp-harness.ts`, `csharp-compiler.ts`, `csharp-diagnostics.ts`, `csharp-compile-workspace.ts`; exact-selection helper in csharp-sdk-resolver.ts; tests/main/csharp-{harness,compiler,compiler.integration}.test.ts | Fixed typed harness, direct local Roslyn in Learning Job, contained exclusive files, safe bounded diagnostics and Core raw-byte accounting before redaction. Real compile/error/cancellation evidence in docs/PHASE-9D1-CSHARP-COMPILER.md; no native stdin/sample execution or public wiring |
| Local Judge | `src/main/services/learning/judge-service.ts` | Main, 9E; public/hidden tests, 100% Accepted, distinct internal error |
| Future Learning records | `src/main/services/learning/learning-store.ts`; reuse existing `src/main/services/persistence/persistence-service.ts` where suitable | Main, 9E Accepted commit/recovery; 9F extended quiz/progress persistence; existing 9C drafts use practice-store.ts |
| Runtime resolution/distribution | Learning-only installed-runtime resolver planned under `src/main/services/learning/runtime/`; distribution asset paths deferred | User-approved 2026-10-19: 9D uses installed .NET SDK/Node only, no downloads/install/bundling or Project changes; installer integration decided separately at packaging; 9G clean-Windows evidence retained |

No Python/Java adapters or new language providers. Learning uses installed stable
SDK 10.x and Node 24.x without patch locking (approved 2026-10-20); no auto-install
or major fallback. Distribution form/size/packaging fallback remain separate gates.
Only narrow internal ownership/cleanup primitives may be reused; Project Run,
Terminal and language-service sessions/lifecycles remain independent.

Code Drafts already reside in `userData/learning/drafts.json`; future Accepted/progress
records also reside in a separate directory under Electron userData, never
installation folders or Project Explorer. Per-exercise/language Code Drafts are
separate from immutable Accepted snapshots (code-at-Submit, exercise, language,
timestamp, result, test-set metadata). Retain multiple Accepted versions. My
Solutions lists saved Accepted records only; failed submissions remain transient.
Saved/new completion follows successful commit, while later failures preserve
earlier completion. 9E must establish storage consistency before 9F extends
progress. Exact schema, filenames and recovery are P9-STORAGE/P9-PROGRESS gates.
