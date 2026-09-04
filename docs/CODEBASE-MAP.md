# Student Coding IDE Codebase Map

This map describes the current independent source tree and planned module locations. Phase 2A established the application and security foundations, Phase 2B added the authorized project/filesystem Explorer, Phase 2C added retained Monaco editing and data-safety behavior, Phase 2D completed bounded project search and the Orca/STYLEGUIDE corrective UI pass, Phase 2E completed the integrated terminal and Windows Job-owned cleanup path, Phase 2F completed cross-feature stabilization, Phase 3B established the Monaco-native language foundation, Phase 3C implemented production bounded JS/TS project synchronization, Phase 3D completed model-local HTML/CSS/JSON intelligence, Phase 3E added Problems aggregation and navigation, and Phase 3F completed stabilization/final verification. Phase 4 and later work remain assigned to subsequent authorized work packages.

## Current source tree through Phase 3

| Current path | Role | Status |
|---|---|---|
| `src/main/index.ts` | Electron readiness, secure BrowserWindow composition, unsaved/terminal transition coordination, owner-scoped search/terminal event routing, production TerminalService/IPC composition, and fail-closed Electron quit wiring | Implemented through Phase 2E-J corrective Step 3 |
| `src/main/app/` | DesktopApplication startup/reverse shutdown ownership plus Main-only before-quit approval, in-flight cleanup sharing, retry, and final-quit coordination | Implemented through Phase 2E-J corrective Step 3 |
| `src/main/window/` | Secure BrowserWindow ownership, accepted navigation/external-URL policy, and final-quit authorization that prevents the last window bypassing cleanup | Implemented through Phase 2E-J corrective Step 3 |
| `src/main/ipc/` | Validated handler registration, safe result/error mapping, lifecycle/project/file/search adapters, project-scoped filesystem status, and terminal handlers with owner-only event routing and WebContents cleanup | Implemented through Phase 2F |
| `src/main/errors/` | Structured domain errors and safe IPC serialization | Implemented Phase 2A foundation |
| `src/main/services/project/` | One active project, create/open/close/switch, transition guards, identity, authorization, and recent metadata | Implemented Phase 2B |
| `src/main/services/filesystem/` | Authorized lazy list/read/write/stat/create/rename/Recycle Bin operations, bounded watcher lifecycle, and authoritative active-project availability | Implemented through Phase 2F |
| `src/main/services/search/` | Main-owned asynchronous disk-content traversal, exclusions, binary/size policy, batching, bounds, ownership, and cooperative cancellation | Implemented Phase 2D |
| `src/main/services/lifecycle/` | Transition-ID dirty-buffer and terminal coordination for project switch/close plus application-close unsaved protection, including timeout and renderer-ownership checks | Implemented through Phase 2E-G |
| `src/main/services/persistence/` | Versioned JSON, serialized writes, backup, and recovery foundation | Implemented Phase 2A foundation |
| `src/main/services/process/` | Internal owned-resource registry plus narrow Main-only Job-owned/legacy-root process-tree abstraction, primary Windows Job finalizer, and gated fingerprinted taskkill legacy backend | Implemented through Phase 2E-J corrective Step 2; no public process executor |
| `src/main/services/terminal/` | Main-owned TerminalService registry/ownership/lifecycle/batching, project-transition leases, Windows shell resolution, environment policy, native-independent PTY port, sole production patched-node-pty adapter, retained natural-root ownership, and unified Job finalization | Implemented through Phase 2E-J corrective Step 2 |
| `patches/` and `scripts/` | Inspectable node-pty Windows Job tooling plus the production-build Monaco worker discovery smoke | Implemented through Phase 3B |
| `src/shared/contracts/` | Side-effect-free error, validation, lifecycle, project, file/filesystem-status, search, and terminal request/event/state contracts | Implemented through Phase 2F |
| `src/preload/index.ts` and `src/preload/bridge/` | Narrow typed lifecycle/project/file/search/terminal bridges with normalized transport errors, request/response/event validation, and subscription cleanup | Implemented through Phase 2F |
| `src/renderer/src/main.tsx` | React renderer bootstrap, packaged Geist/xterm styles, and renderer-session editor/terminal/language/Problems disposal on real page unload | Implemented through Phase 3E |
| `src/renderer/src/App.tsx` | Resizable Orca-aligned project/editor/tools shell, top-chrome editor tabs, Explorer/Search coordination, Terminal/Problems Bottom Panel ownership, ordered dirty/terminal transition decisions, transition locks, unavailable-project UX, active-project language synchronization, and Problems navigation | Implemented through Phase 3E |
| `src/renderer/src/components/` | Shared semantic buttons, focus-managed dialogs, and keyboard/pointer sidebar and Bottom Panel resizing | Implemented through Phase 2E-F |
| `src/renderer/src/features/explorer/` | Lazy Explorer tree, local feature state, refresh, mutation controls, errors, and confirmation | Implemented Phase 2B |
| `src/renderer/src/features/editor/` | Renderer-session EditorModelManager/model owner, Monaco lifecycle/data safety, Search/Problems range navigation, deleted-file state, fail-closed dirty/terminal transition presentation, document lifecycle events, and adoption of existing provider models by canonical URI | Implemented through Phase 3E |
| `src/renderer/src/features/language/` | Renderer-owned Monaco/browser-worker capability/provider/status contracts for JS/TS/HTML/CSS/JSON; safe virtual URI and diagnostic generation identity; worker routing/defaults; production bounded JS/TS discovery, snapshots, model synchronization, project/file lifecycle cleanup, and stale-work rejection; explicit HTML/CSS/JSON provider defaults with offline JSON schema policy. HTML diagnostics are deferred because the current provider has no validation support; C#/PHP are tokenization-only and no Python/Java/external provider exists | Implemented through Phase 3D |
| `src/renderer/src/features/problems/` | Project/provider-generation-safe normalized diagnostic aggregation, Monaco marker consumption, grouped Problems presentation, cleanup, and file/range navigation requests | Implemented Phase 3E |
| `src/renderer/src/features/search/` | Search query/state, grouped bounded results, cancellation, stale-event guards, navigation requests, and immediate-submit/project-reset lifecycle safety | Implemented Phase 2D plus verified corrective fixes during Phase 3E |
| `src/renderer/src/features/terminal/` | Renderer-session TerminalController, xterm/FitAddon factory, stable session hosts, ordered writes, fitting/resizing, shared Bottom Panel tabs, and multiple-session controls | Implemented through Phase 3E |
| `src/renderer/src/styles.css` | Semantic dark tokens and Orca-aligned shell, typography, controls, Explorer/Search, editor, Terminal/Problems Bottom Panel, dialogs, interaction states, and scrollbars | Implemented through Phase 3E |
| `tests/` | Vitest contract, service, IPC, preload, security/lifecycle, Phase 2 feature coverage, Monaco capability/worker/URI/diagnostic tests, bounded JS/TS feasibility/performance smokes, Phase 3C discovery/model/live-sync/lifecycle integration coverage, actual-worker HTML/CSS/JSON checks, Problems aggregation/UI/navigation/lifecycle coverage, repeated project/provider cleanup, and Search race regressions | Implemented through Phase 3F |
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
| Future external language services | LanguageServiceManager | `src/main/services/language/` | Deferred Main-owned external provider executable/lifecycle/validated routing; no current Phase 3 module required | Future |
| Problems | Problems UI/model | `src/renderer/src/features/problems/` | Normalized problems and file/range navigation | 3 |
| Dependency detection | DependencyDetectionService | `src/main/services/dependencies/` | Runtime, Git, and future external-language executable state; current Phase 3 Monaco workers need no executable detection | 4–6/Future |
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

No production `src/main/services/language/` module, external
LanguageServiceManager process, Python provider, or Java provider exists in the
current tree. No custom/alternate HTML diagnostics provider exists. C# and PHP
have tokenization only. These future modules must not be described as implemented
until a separately authorized scope creates and verifies them.
