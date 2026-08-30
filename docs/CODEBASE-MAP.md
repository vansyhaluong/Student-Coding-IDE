# Student Coding IDE Codebase Map

This map describes the current independent source tree and planned module locations. Phase 2A established the application and security foundations, Phase 2B added the authorized project/filesystem Explorer, Phase 2C added retained Monaco editing and data-safety behavior, and Phase 2D completed bounded project search, editor navigation, and the Orca/STYLEGUIDE corrective UI pass. Later Core IDE features remain assigned to Phase 2E and subsequent work packages.

## Current source tree through Phase 2D

| Current path | Role | Status |
|---|---|---|
| `src/main/index.ts` | Electron readiness, secure BrowserWindow composition, unsaved-close coordination, renderer-owned search event routing, and deterministic shutdown | Implemented through Phase 2D |
| `src/main/app/` | DesktopApplication startup order, lifecycle state, and deterministic reverse-order cleanup | Implemented Phase 2A foundation |
| `src/main/window/` | Secure BrowserWindow ownership and accepted navigation/external-URL policy | Implemented Phase 2A foundation |
| `src/main/ipc/` | Validated handler registration, safe result/error mapping, lifecycle transition resolution, project/file adapters, and owner-scoped search start/cancel adapters | Implemented through Phase 2D |
| `src/main/errors/` | Structured domain errors and safe IPC serialization | Implemented Phase 2A foundation |
| `src/main/services/project/` | One active project, create/open/close/switch, transition guards, identity, authorization, and recent metadata | Implemented Phase 2B |
| `src/main/services/filesystem/` | Authorized lazy list/read/write/stat/create/rename/Recycle Bin operations and bounded watcher lifecycle | Implemented through Phase 2C |
| `src/main/services/search/` | Main-owned asynchronous disk-content traversal, exclusions, binary/size policy, batching, bounds, ownership, and cooperative cancellation | Implemented Phase 2D |
| `src/main/services/lifecycle/` | Transition-ID unsaved-change coordination for project switch/close and application close, including timeout and renderer-ownership checks | Implemented Phase 2C |
| `src/main/services/persistence/` | Versioned JSON, serialized writes, backup, and recovery foundation | Implemented Phase 2A foundation |
| `src/main/services/process/` | Internal owned-resource registry and deterministic cleanup primitives | Implemented Phase 2A foundation; no process executor |
| `src/shared/contracts/` | Side-effect-free error, validation, lifecycle, project, file, and search request/event/public API contracts | Implemented through Phase 2D |
| `src/preload/index.ts` and `src/preload/bridge/` | Narrow typed lifecycle/project/file/search bridges with response/event validation and subscription cleanup | Implemented through Phase 2D |
| `src/renderer/src/main.tsx` | React renderer bootstrap, packaged Geist loading, and renderer-session editor-model disposal on real page unload | Implemented through Phase 2D |
| `src/renderer/src/App.tsx` | Resizable Orca-aligned project/editor/tools shell, top-chrome editor tabs, Explorer/Search coordination, and unsaved decision presentation | Implemented through Phase 2D |
| `src/renderer/src/components/` | Shared semantic buttons, focus-managed dialogs, and keyboard/pointer sidebar resizing | Implemented Phase 2D corrective pass |
| `src/renderer/src/features/explorer/` | Lazy Explorer tree, local feature state, refresh, mutation controls, errors, and confirmation | Implemented Phase 2B |
| `src/renderer/src/features/editor/` | Renderer-session model owner, Monaco lifecycle/data safety, and explicit search-result reveal/select/focus navigation | Implemented through Phase 2D |
| `src/renderer/src/features/search/` | Search query/state, grouped bounded results, cancellation, stale-event guards, and navigation requests | Implemented Phase 2D |
| `src/renderer/src/styles.css` | Semantic dark tokens and Orca-aligned shell, typography, controls, Explorer/Search, editor, dialogs, interaction states, and scrollbars | Implemented through Phase 2D |
| `tests/` | Vitest contract, service, IPC, preload, security/lifecycle, path/model, and file-scoped jsdom integration/regression tests | Implemented through Phase 2D |
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
| Language intelligence | LanguageServiceManager | `src/main/services/language/` | Provider registry/lifecycle/status/logs | 3 |
| Monaco language adapters | Language adapters | `src/renderer/src/features/language/` | Monaco/provider request and diagnostics integration | 3 |
| Problems | Problems UI/model | `src/renderer/src/features/problems/` | Normalized problems and file/range navigation | 3 |
| Dependency detection | DependencyDetectionService | `src/main/services/dependencies/` | Runtime, Git, and language executable state | 3–6 |
| Run | RunService | `src/main/services/run/` | Trusted strategies, output, exit, stop/tree cleanup | 4 |
| Output | Output UI | `src/renderer/src/features/output/` | stdout/stderr/exit presentation | 4 |
| Git | GitService | `src/main/services/git/` | Detection, status, stage, commit, branch, history | 5 |
| Source Control | Git UI | `src/renderer/src/features/git/` | Git status/actions/dependency states | 5 |
| Settings | SettingsService | `src/main/services/settings/` | Schema/defaults/validation/update | 6 |
| Persistence | PersistenceService | `src/main/services/persistence/` | Versioned JSON, atomic writes, migration/recovery | 2/6 |
| Settings UI | Settings UI | `src/renderer/src/features/settings/` | Theme/editor/path settings, validation UX, and user-facing Recent Projects management | 6 |
| Test support | Service/IPC fixtures | `tests/` or colocated `*.test.ts` | Critical unit and integration gates | 2–7 |

## Dependency direction

```text
Renderer features -> preload domain API -> shared contracts -> main IPC adapters -> domain services

Domain services -> small platform adapters (filesystem, PTY, child process, Git, persistence)
```

Main domain services must not import renderer code. Renderer features must not import Node/Electron privileged APIs. Shared contracts must not execute code or depend on Electron runtime objects.

## Deliberately absent

No planned V1 directory exists for AI agents, Codex/Claude providers, worktrees, remote execution, cloud sync, mobile, collaboration, extension host/marketplace, formatter, or debugger.
