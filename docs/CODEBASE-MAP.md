# Student Coding IDE Codebase Map

This map describes the current independent source tree and planned module locations. The source remains the Phase 0 foundation, while Phase 1 documentation and architecture design are complete. Planned paths are design targets only; Phase 1 does not create them.

## Current source tree before Phase 2 implementation

| Current path | Role | Status |
|---|---|---|
| `src/main/index.ts` | Electron readiness, one BrowserWindow, secure webPreferences, application close behavior | Existing foundation |
| `src/preload/index.ts` | Empty preload entry | Existing foundation; domain bridge planned |
| `src/renderer/src/main.tsx` | React renderer bootstrap | Existing foundation |
| `src/renderer/src/App.tsx` | Minimal Phase 0 application surface | Existing foundation |
| `src/renderer/src/styles.css` | Tailwind import and initial global styles | Existing foundation |
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
