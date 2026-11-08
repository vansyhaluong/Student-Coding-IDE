# Student Coding IDE Codebase Map

## AI-C4-F2 Hint Apply integration — actual paths, 2026-11-08

- `src/renderer/src/features/learning/practice/use-hint-apply.ts`: new current-Hint
  lifecycle, frozen target, assistant lease, status, cancel/discard and review.
- `AssistantCodeBlock.tsx`, `AssistantQuickActions.tsx`, `LearningAssistantPanel.tsx`
  and `use-assistant-timeline.ts` in the Learning feature: Hint-only toolbar state
  and dedicated slot; Copy and display-only Chat/history remain separate.
- `practice/PracticeEditor.tsx`, `smart-hints-selection.ts`: live target capture.
  `PracticeWorkspace.tsx`, `SmartHintDiffPreview.tsx`, `smart-hint-edits.ts`: readonly
  Diff, typed consumed proposal, private armed-object check and shared transaction.
- `src/shared/contracts/smart-hints{,-validation}.ts`, Main `service.ts`,
  `src/main/ipc/exercise-ipc-service.ts`, `src/preload/bridge/smart-hints.ts`:
  typed bounded consume/discard gates with final package checks and correlation.
- `selection-fix-parser-runtime.ts` in Main Smart Hints: source-free Hint asset
  identity reuse with unchanged manifest/hash/SDK-anchor checks and budgets.
- Main `parsers/javascript.ts`, `parsers/hint-context-javascript.ts`: shared exact
  scaffold predicate for NO_IMPLEMENTATION baseline only; candidate and Suggest
  Fix grammar remain strict. Tests reject NewExpression in both other paths.
- `tests/renderer/hint-apply-ui.test.tsx`: new Workspace/IPC/real-parser/Monaco tests;
  existing Main Hint Apply, unified UI, toolbar and scoped TS config extended.
- `scripts/smoke-learning-assistant-offline.mjs`: C#/JS Hint Apply offline scenarios.

## AI-C4-F1 trusted Hint backend — actual paths, 2026-11-08

- `src/shared/contracts/smart-hints.ts`, `smart-hints-validation.ts`: typed
  prepareHintApply request and separate provenance proposal with strict validation.
- `src/main/services/learning/smart-hints/hint-apply-parser.ts`: new Main-private
  parser protocol and bounded edit-result validation.
- `parsers/javascript.ts`, `parsers/SelectionFixGuard.cs` in that domain: separate
  Hint body/selection/insertion parsing; existing Suggest Fix branches unchanged.
- `selection-fix-parser-runtime.ts`, `service.ts`, `configuration.ts`: bounded
  parser composition, ephemeral Hint retention, package rechecks, canonical
  proposal, idempotent preparation and Main-only single-use consumption.
- `src/main/ipc/exercise-ipc-service.ts`, `src/preload/bridge/smart-hints.ts`:
  semantic authorized channel and correlated typed bridge. No Renderer wiring.
- `tests/main/smart-hints-hint-apply.test.ts`: real C#/JS parser, backend, contract,
  IPC/Preload, ownership/forgery, lifetime and quota checks; scoped TypeScript
  config includes it. `electron.vite.config.ts`: new protocol in build identity.

## Hint code toolbar — actual paths, 2026-11-08

- `src/renderer/src/features/learning/AssistantCodeBlock.tsx`: opt-in Hint toolbar,
  browser clipboard feedback and disabled Apply explanation; existing beUI Button.
- `practice/SmartHintsPanel.tsx` in that feature: shared Advisory enables toolbar
  only for Hint. `practice/smart-hints.css`, `learning-assistant.css`: header/actions.
- `tests/renderer/smart-hints-ui.test.tsx`: toolbar, clipboard and unbound fallback
  cases; included in the existing scoped learning-assistant TypeScript config.

## Context-aware Hint correction — actual paths, 2026-11-07

- `src/main/services/learning/smart-hints/hint-context.ts`: private state/protocol
  types, parser-input validation and state-specific Hint code policy.
- `capture.ts`, `service.ts`, `configuration.ts` in that domain: trusted starter
  capture, immutable pre-consent classification, scoped parser composition and
  full-function signature checking for unimplemented Hint results.
- `gemini-provider.ts`, `gemini-schema.ts`, `adapter.ts`: Hint-only state and
  guidance; existing response DTO and other action payloads remain unchanged.
- `parsers/hint-context-javascript.ts`, `parsers/javascript.ts`,
  `parsers/SelectionFixGuard.cs`, `selection-fix-parser-runtime.ts` in that domain:
  advisory TypeScript/Roslyn branches over the existing bounded parse-only hosts;
  Selection Fix grammar/admission remains separate and unchanged.
- `electron.vite.config.ts`: build identity includes the new Hint/parser sources.
- `tests/main/smart-hints-context.test.ts`: 53 context/parser/fake-HTTP checks;
  `tests/fixtures/learning/chat-ipc.ts`: optional Main-only Hint parser port;
  `tests/tsconfig.learning-assistant.json`: scoped typecheck includes those tests.

## AI-C4-E beUI presentation — actual paths, 2026-11-07

- `src/renderer/src/features/learning/{LearningAssistantPanel,AssistantQuickActions}.tsx`,
  `learning-assistant.css`: beUI transcript/composer, compact action/context area,
  semantic IDE themes, responsive dock, request states and keyboard/focus behavior.
- `AssistantMarkdown.tsx`, `AssistantCodeBlock.tsx` in that feature: safe completed
  Markdown and escaped offline C#/JS tokens, shared with `practice/SmartHintsPanel.tsx`.
- `src/renderer/src/components/ai/prompt-input.tsx`: optional composition/label
  slots; existing stock defaults preserved. Source/license notes in its README.
- `practice/PracticeWorkspace.tsx`: current-operation proposal-card Discard using
  the existing cancellation pipeline. No Main, Preload or shared contract edits.
- Existing Renderer integration tests add beUI/Markdown/keyboard/focus/card cases.
  `scripts/smoke-learning-assistant-offline.mjs` adds actual-Electron beUI visual,
  theme/width/reader-scroll/reduced-motion and keyboard-consent checks.

## AI-C4-D Unified Hint — actual paths, 2026-11-06

- `src/shared/contracts/smart-hints.ts`, `smart-hints-validation.ts`: complete
  Hint sections, language-bound advisory code checks and legacy input normalization.
- `src/main/services/learning/smart-hints/{service,capture,gemini-provider,gemini-schema,adapter,response-failure,validation-diagnostics}.ts`:
  one Hint, no progression or Hint replay; strict schema and safe diagnostic fields.
- `src/preload/bridge/smart-hints.ts`: canonical Hint binding without level state.
- `AssistantQuickActions.tsx`, `practice/{PracticeWorkspace,SmartHintsPanel,use-smart-hints}.tsx/ts`
  in the learning feature: one button, ordered three-part advisory card with
  escaped offline tokenization; existing consent/session/Fix ownership retained.
- `tests/main/smart-hints-unified-hint.test.ts`: new schema/language/legacy,
  exactly-once reservation and Hint cancellation/timeout/stale regressions.
  Existing Smart Hints fixtures/runner/UI regressions and scoped tsconfig migrated.
- `scripts/smoke-learning-assistant-offline.mjs`: C# `hint` and JS `hint-js`
  modes over actual Electron; fake HTTP only, no live inference.

## AI-C4-C Offline acceptance — actual paths, 2026-11-06

- `scripts/smoke-learning-assistant-offline.mjs`: isolated actual Electron smoke
  over `out/ai-c4-c` bundles, synthetic HTTP/encryption, real shared coordinator,
  parser ports, Monaco and Diff. Checks artifact identities, consent/history,
  actions, stale/manual edits, quota/ownership/timeout and sanitized diagnostics.
  Writes only build-local screenshots, not a task/acceptance report.
- `LearningAssistantPanel.tsx`: observes refreshed Main session when releasing
  the shared UI lease; hides redundant composer during consent review.
- Chat UI regressions include delayed history ACK and consent layout;
  `tests/renderer/learning-workspace.test.tsx` measures equivalent scoped queries
  over real course DOM, independently of actual Electron visual evidence.

## AI-C4-B Unified panel — actual paths, 2026-11-06

- `src/renderer/src/features/learning/AssistantQuickActions.tsx`: four existing
  actions, capability/selection gating and validated Hint progression.
- `src/renderer/src/features/learning/use-assistant-timeline.ts`: bounded display
  ordering/identity and stale pending cards; no provider/history/edit authority.
- `LearningAssistantPanel.tsx`, `use-learning-assistant.ts`,
  `learning-assistant.css` in that feature: unified action/Chat surface and local
  shared admission, retaining typed Chat session lifecycle and backend history.
- `practice/PracticeWorkspace.tsx`: one entry/panel, existing snapshots and
  Diff/manual Apply/Discard callbacks. `practice/use-smart-hints.ts`: operation
  identity, narrow Cancel, late-ACK retirement and completed-Hint ACK handling.
- `practice/SmartHintsPanel.tsx`: shared advisory/evidence/consent exports; legacy
  standalone component remains testable but is not mounted by PracticeWorkspace.
- `src/main/ipc/exercise-ipc-service.ts`: existing Cancel dispatch preserves
  COMPLETE Hint results atomically; no SH-1 service or parser modification.
- `tests/renderer/learning-assistant-unified.test.tsx`: real typed bridges,
  configuration/services/coordinator, fake Gemini and actual Monaco text models.
  `tests/fixtures/learning/chat-ipc.ts`: optional synthetic parser guard port.
  Chat/Smart Hints renderer and Main IPC regressions and
  `tests/tsconfig.learning-assistant.json` cover the changed boundaries.

## AI-C4-A Chat panel — actual paths, 2026-11-06

- `src/renderer/src/features/learning/LearningAssistantPanel.tsx`,
  `learning-assistant.css`: Cursor-style advisory timeline, composer, context
  selector, manifest/code review, consent, status, empty state and auto-scroll.
- `src/renderer/src/features/learning/use-learning-assistant.ts`: typed Chat
  session/context lifecycle, consent/start/status/cancel and trusted history refresh.
- `LearningWorkspace.tsx`, `practice/PracticeWorkspace.tsx` in that feature:
  Learning/Practice entry points and read-only Monaco snapshot binding.
- `tests/renderer/learning-assistant.test.tsx`: real bridge/IPC/Main/configuration
  with fake Gemini HTTP; `tests/tsconfig.learning-assistant.json`: scoped typecheck.
- `tests/renderer/smart-hints-integration.test.tsx`: Chat open/close preserves
  existing Hint progression and live consent. Other Hint/Fix/Diff tests unchanged.

## AI-C3-B2 Chat IPC/application — actual paths, 2026-11-06

- `src/shared/contracts/learning-chat.ts`, `learning-chat-validation.ts`: eight
  typed APIs, strict local context/session/update/close requests; `learning.ts`
  adds the Chat API to the existing Learning namespace.
- `src/main/ipc/learning-chat-ipc-service.ts`: document/frame owner scopes,
  catalogue guard port, Main fingerprint construction, bounded result validation,
  navigation/context/shutdown retirement. `exercise-ipc-service.ts` forwards only
  its already-authorized Learning context invalidation sender to Chat.
- `src/main/services/learning/smart-hints/configuration.ts`: composes its ChatService
  using the same coordinator, credential/transport and sole daily ledger; retires
  sessions on configuration changes. `chat/service.ts` uses shared readiness/error
  hooks and supports synchronous shutdown sealing.
- `src/main/index.ts`: Main catalogue/frame authorization, owner observation,
  lifecycle and existing context-invalidation composition.
- `src/preload/bridge/learning-chat.ts`, `learning.ts`: semantic Chat bridge and
  response correlation; no UI. `electron.vite.config.ts` includes Chat in identity.
- `tests/main/learning-chat-ipc.test.ts`, `tests/preload/learning-chat.test.ts`,
  `tests/fixtures/learning/chat-ipc.ts`: fake-HTTP two-turn bridge/IPC/configuration
  integration and adversarial lifecycle/transport validation. Scoped config includes
  Main/Preload entrypoints; existing submission IPC regression covers context hook.

## AI-C3-B1 ChatService — actual paths, 2026-11-06

- `src/main/services/learning/chat/service.ts`: Main-only Chat lifecycle and
  orchestration; mandatory shared coordinator and borrowed provider ports,
  10s timer, dispatch reservation, valid-pair commit and retirement/cleanup hooks.
- `conversation-manager.ts`: live execution-to-reference reader; no DTO changes.
- `tests/main/learning-chat-service.test.ts`: fake-HTTP orchestration, actual
  SmartHintsService contention and existing configuration daily-ledger integration.
  Normal application/IPC/Preload wiring is added in C3-B2; UI remains absent.

## AI-C3-A Chat adapter — actual paths, 2026-11-06

- `src/main/services/learning/chat/gemini-chat-adapter.ts`: Main-private advisory
  multi-turn mapping, frozen capture checks, dedicated instruction/schema,
  response validation and SharedGeminiTransport consumer. No app wiring.
- `conversation-manager.ts`: identity-checked Main-only capture reader for adapters.
- `tests/main/learning-chat-gemini.test.ts`: fake-HTTP adapter tests; included by
  `tests/tsconfig.learning-chat.json` with existing Chat domain tests.

## AI-C2-B Chat domain — actual paths, 2026-11-06

- `src/shared/contracts/learning-chat.ts`, `learning-chat-validation.ts`: scoped
  DTOs, exact validation, policy caps, session/message/provenance/consent/status
  schemas; exported by the shared barrel without public APIs/channels.
- `src/main/services/learning/chat/conversation-manager.ts`: trusted owner/session,
  bounded complete-pair history, prepare/consent and opaque execution lifecycle,
  revision/TTL/purge hooks. No inference or application event wiring.
- `src/main/services/learning/chat/context-builder.ts`: immutable scoped context,
  eligible replay, canonical digest/manifest, Main content policy and safe errors.
- `tests/contracts/learning-chat.test.ts`, `tests/main/learning-chat.test.ts`,
  `tests/fixtures/learning/chat.ts`, `tests/tsconfig.learning-chat.json`: synthetic
  domain-only validation and dedicated scoped typecheck. No new acceptance report.

## AI-C2-A2 shared Gemini transport — actual paths, 2026-11-06

- `src/main/services/learning/smart-hints/gemini-transport.ts`:
  fixed-model bounded HTTP lifetime, metadata readiness, reservation callback,
  abort/deadline/error handling, diagnostic types and typed contents-array input.
- `gemini-provider.ts`: unchanged action prompts/schema/content/Fix validation
  through shared HTTP; compatibility re-exports. `gemini-readiness.ts` imports
  fixed constants directly, preserving its Settings-only check behavior.
- `tests/main/smart-hints-gemini-transport.test.ts`: fake HTTP and synthetic
  consumers, request identity, status/bounds/key handling, cleanup/deadlines and
  shared external admission/ledger. No Chat Adapter or conversation implementation.
- `electron.vite.config.ts`: shared transport participates in build identity.

## AI-C2-A1 shared execution — actual paths, 2026-11-06

- `src/main/services/learning/smart-hints/execution-coordinator.ts`:
  Main-private admission lease, active exclusion, shared rate windows, once-only
  daily reservation port, cancellation/drain and shutdown sealing.
- `service.ts`, `configuration.ts`, `adapter.ts` in that directory: Smart Hints
  admission consumer and private reservation capability; configuration remains
  sole ledger owner and normal coordinator composition root.
- `tests/main/smart-hints-execution-coordinator.test.ts` and extended
  `smart-hints-configuration.test.ts`: synthetic consumer cross-admission/rates,
  real temporary durable ledger, failure/dedup/cancel/timeout/shutdown checks.
- `electron.vite.config.ts`: includes coordinator source in build identity.

No ChatService, conversation, Chat IPC/Preload/UI or C2-A2 code is added.

## Selection Fix syntax recovery — 2026-11-06

- `src/main/services/learning/smart-hints/parsers/{SelectionFixGuard.cs,javascript.ts}`:
  selected diagnostic/missing-node ownership, intact function-body boundaries,
  recovery preflight and strict candidate validation with the existing AST hole.
- `tests/main/smart-hints-selection-parser.test.ts`: recoverable syntax/logic,
  canonical construction/SH-1, fake service publication/NO_FIX, boundary rejection
  and ch4-01 SumToN whole-function reproducer using real parser assets.

## C# Suggest Fix SDK resolution correction — 2026-11-06

- `src/main/services/learning/smart-hints/selection-fix-sdk-resolver.ts`:
  Main-private G0 candidate filter reusing Learning's installation validation
  through its exported bounded filesystem port. Learning's default policy stays
  unchanged; only Fix restricts SDK/runtime/reference-pack/hostfxr versions.
- `selection-fix-parser-runtime.ts`, `parsers/SelectionFixGuard.cs`: selected
  absolute host, pinned runtime without roll-forward, both Roslyn assembly
  identities checked before readiness. Resolver participates in build identity.
- `tests/main/smart-hints-selection-sdk.test.ts`: installed SDK discovery,
  fail-closed faults and actual helper execution; parser tests use the private
  resolver and support an explicit scoped asset directory.

## SH4-D6-5 UI and Diff integration — actual paths, 2026-11-06

- `src/main/index.ts`, `services/learning/smart-hints/configuration.ts`: normal
  Main-owned parser guard composition, with existing provider/key/quota behavior.
- `src/main/services/learning/smart-hints/{service,selection-fix-guard}.ts`:
  local availability probe, supported-language capability, rotation/shutdown and
  runtime-failure invalidation; `src/main/ipc/exercise-ipc-service.ts` awaits the
  same capability response through existing owner/frame checks.
- `src/renderer/src/features/learning/practice/PracticeWorkspace.tsx`,
  `use-smart-hints.ts`, `SmartHintsPanel.tsx`, `smart-hints-selection.ts`:
  captureFix entry, supported-language readiness, range/consent copy, pre-consent
  Fix-only cancellation, consent freeze and stale/NO_FIX/error handling.
- `smart-hint-edits.ts`, `SmartHintDiffPreview.tsx` in that directory: canonical
  one-edit range/old-text assertion and distinct Applied/Discarded callbacks;
  reuse existing Diff/native Apply/Undo transaction.
- `tests/renderer/smart-hints-selection-flow.test.tsx`,
  `tests/main/smart-hints-selection-availability.test.ts`: typed bridge/Main/fake
  Gemini selection lifecycle and capability failure/race tests. Existing parser,
  edits and Diff suites are updated for the integrated selection invariant.
- `scripts/test-smart-hints-selection-offline.mjs`: isolated real built app and
  Monaco/parser/IPC flow with fake HTTP only; stdout evidence, no acceptance file.

No second Apply path, parser-policy/SH-1 change, or D6-6 implementation.

## SH4-D6-4 construction and parsers — actual paths, 2026-11-06

- `src/main/services/learning/smart-hints/selection-fix.ts`: strict wire and
  exact immutable selection assertion; source-derived canonical one-edit mapper.
- `service.ts` in that directory: private guard preflight/readiness/postflight,
  lifecycle cleanup and publication ordering; normal capability stays disabled.
- `selection-fix-{guard,protocol,parser-runtime,diagnostics}.ts`: Main-private
  lease/scope, bounded protocol, verified runtime assets/SDK and safe fixed enums.
- `parsers/javascript.ts`, `parsers/SelectionFixGuard.cs`: parse-only AST grammar,
  required signatures, target geometry and outside-target structure comparison.
- `configuration.ts`, `gemini-provider.ts`: safe guard diagnostic projection and
  shared private wire rejection classification, preserving other action behavior.
- `scripts/build-smart-hints-parser-assets.mjs`,
  `scripts/check-smart-hints-parser-assets.mjs`, `electron.vite.config.ts`: trusted
  build assets/license/manifest in actual Main output; relocated built-entry check.
- `tests/main/smart-hints-selection-{construction,parser}.test.ts`: synthetic
  provider/service and real C#/JS parser, assets, failure and lifecycle coverage.
- `tests/tsconfig.sh4.json`: includes private parser TypeScript in scoped checks.

No Renderer/Apply pipeline or D6-5 cutover is added by D6-4.

## SH4-D6-3 Gemini selection wire — actual paths, 2026-11-05

- `src/main/services/learning/smart-hints/gemini-schema.ts`: Fix-only strict
  replacement/no-fix schema with bounded strings/evidence; other schemas retained.
- `gemini-provider.ts` in that directory: standalone Fix instruction, same frozen
  source/selection/EOL input, private wire validation before returning; no mapper.
- `selection-fix.ts`: existing private validator is now used by Gemini; validation
  rules are unchanged. Main `service.ts` still blocks Fix dispatch.
- `tests/main/smart-hints-gemini-contract.test.ts`, `smart-hints-gemini.test.ts`:
  fake-transport C#/JS selection matrix, strict replacement/legacy rejection,
  non-Fix compatibility and unchanged network policy. No new report file.

## SH4-D6-2 contract migration — actual paths, 2026-11-05

- `src/shared/contracts/smart-hints{,-validation}.ts`: required Fix selection,
  bound range/fingerprint, strict selection and capability migration validation.
- `src/main/services/learning/smart-hints/capture.ts`, `service.ts`: detached,
  frozen private target/trusted signature identity; Fix dispatch remains disabled.
- `src/main/services/learning/smart-hints/selection-fix.ts`: private replacement
  wire type/validator only, not connected to provider or edit construction.
- `src/preload/bridge/smart-hints.ts`, Main `exercise-ipc-service.ts`: strict
  first-response binding/capability guards using existing ownership/lifecycle.
- Practice hook/workspace/panel: no legacy Fix fallback; other actions retained.
- `tests/main/smart-hints-selection-contract.test.ts`,
  `tests/renderer/smart-hints-selection-capability.test.tsx`, contract/core/IPC/
  Preload suites and `tests/tsconfig.sh4-d6-2.json`: scoped migration verification.

## SH4-D6-1 local Fix selection capture — actual paths, 2026-11-05

- `src/renderer/src/features/learning/practice/smart-hints-selection.ts`:
  `createPracticeFixSelectionBinding`, local immutable Fix snapshot/readiness,
  geometry checks and source/selection epochs; legacy capture functions unchanged.
- `PracticeEditor.tsx` in that directory: local `captureFix` editor capability,
  owned cursor/model/content/language observers and current workspace context.
- `PracticeWorkspace.tsx`, `SmartHintsPanel.tsx`: source-free readiness summary,
  explicitly unavailable selection mode; no new request/consent action wiring.
- `tests/renderer/smart-hints-fix-selection{,-monaco}.test.tsx`: geometry/races/
  freshness/disposal and real Monaco model coverage; existing integration tests
  verify readiness does not reset Hint progression or dispatch requests.
- `docs/SH4-D6-1-SELECTION-CAPTURE-ACCEPTANCE.md`: verification and limitations.
  No Main/shared/provider/Apply pipeline changes; D6-2 and D6-4 remain separate.

## SH4-D3 Suggest Fix contract guidance — actual paths, 2026-11-05

- Existing `src/main/services/learning/smart-hints/gemini-provider.ts`: Fix-only
  exact UTF-16/original source/EOL/NO_FIX instructions and private sourceEol enum.
- Existing `gemini-schema.ts` in that domain: Fix-only field/branch descriptions;
  no change to schema constraints or output shape.
- `tests/main/smart-hints-gemini-contract.test.ts`: synthetic C#/JS/LF/CRLF,
  UTF-16/end-exclusive/NO_FIX/unsafe edits, schema equivalence and other actions.
- `docs/AI-SMART-HINTS-GEMINI-CONTRACT-FIX-ACCEPTANCE.md`: offline acceptance,
  D2 exact mismatch evidence and explicit next-live-acceptance boundary.

## SH4-D1 safe diagnostics — actual paths, 2026-11-05

- `src/main/services/learning/smart-hints/validation-diagnostics.ts`: Main-private
  read-only SH-1 rejection reasons and bounded output summary; shared validators
  remain unchanged.
- Existing `response-failure.ts`, `service.ts`, `configuration.ts`,
  `gemini-provider.ts`, `adapter.ts`: projected/correlated normal-app diagnostics
  and provider failure sources, with unchanged public contracts/request behavior.
- `electron.vite.config.ts`: build-time diagnostics source identity injection.
- `tests/main/smart-hints-safe-diagnostics.test.ts`: synthetic normal-app
  regression, privacy, I/O/cancellation and acceptance-equivalence corpus.
- `docs/AI-SMART-HINTS-GEMINI-DIAGNOSTICS-ACCEPTANCE.md`: SH4-D1 offline report;
  no live evidence or original root-cause correction claimed.

## Suggest Fix failure evidence — actual paths, 2026-11-03

- `gemini-provider.ts` under `src/main/services/learning/smart-hints/`: safe
  finish/token/usage/envelope/output JSON projections before strict rejection.
- `service.ts`: exact private SH-1 schema-validation result in lifecycle evidence.
- `configuration.ts`: terminal projection and atomic bounded last-Suggest-Fix
  JSON under userData, separate from secrets/settings/reservations.
- `src/main/index.ts`: fixed-message diagnostic-store failure sink only.
- Existing Main configuration tests and Electron Gemini UI harness cover503,
  MAX_TOKENS, safety, missing JSON and valid focused edits without real inference.
- `docs/AI/AI-SMART-HINTS-SUGGEST-FIX-PROVIDER-INVESTIGATION.md`: actual-request
  evidence missing; product failure remains BLOCKED, not declared fixed.

## Ordinary Suggest Fix30s correction — actual paths, 2026-11-03

- `src/shared/contracts/smart-hints.ts`: normal Gemini action timeout helper,
  no change to shared10s default or IPC payload shape.
- `src/main/services/learning/smart-hints/service.ts`, `adapter.ts`: Main-only
  execution deadline/context and one-shot lifecycle diagnostics.
- `gemini-provider.ts`, `configuration.ts` in that directory: shared Main
  deadline, action selection, reservation stage and safe terminal projection.
- `src/main/index.ts`: `[SmartHints execution]` Main console diagnostic sink.
- `SmartHintsPanel.tsx`, `use-smart-hints.ts` in renderer practice: consent30s
  for Gemini Suggest Fix, clear timeout message, existing loading/Cancel.
- Main configuration/Renderer Smart Hints tests plus the existing
  `scripts/smoke-smart-hints-gemini-ui.mjs`: normal Main dependency injection,
  fake15s response,30s timeout and real Monaco/IPC UI coverage. No new runner.

## Normal Smart Hints usage limits — actual paths, 2026-11-03

- `src/main/services/learning/smart-hints/configuration.ts`: daily policy, legacy
  review/migration, immutable reservation recovery, source-free status, persisted
  sanitized provider-limit observation; normal path independent of acceptance.
- `src/main/services/learning/smart-hints/gemini-limit.ts`: bounded structured429
  classification and cooldown extraction, abort/stream cleanup, no raw error DTO.
- `src/main/services/learning/smart-hints/service.ts`: read-only local rate reset.
- `src/shared/contracts/smart-hints-settings.ts`, Settings IPC/preload and
  `src/renderer/src/features/settings/SmartHintsSettings.tsx`: validated daily
  limits, four distinct limit states, usage/reset display and offline refresh.
- `tests/main/smart-hints-configuration.test.ts`, `smart-hints-gemini-limit.test.ts`,
  scoped Settings IPC/preload/Renderer tests: fake-only usage-policy regressions.

## SH-4 NOT_READY corrective coverage — actual paths, 2026-11-03

- Existing practice `use-smart-hints.ts`/`SmartHintsPanel.tsx`: independent provider
  capability probes, guarded explicit refresh, manual availability when disabled.
- Existing Main `smart-hints/live-ui-acceptance.ts`: safe private reason enums,
  unchanged approval/budget/sample/credential guards; no new IPC/DTO.
- Existing renderer/main Smart Hints tests: before/after race, stale probe order,
  negative cache recovery, diagnostic reasons and budget3 no-renewal coverage.
- Existing `smoke-smart-hints-gemini-ui.mjs` scenario `capability-race`: real
  Main/IPC + actual Monaco revision change, fake budget3/transport; explicit
  recheck of negative gates remains disabled with zero HTTP.
- `docs/AI/AI-SMART-HINTS-SH4-NOT-READY-FIX.md`: evidence, state distinctions and
  safe recheck; original live incident cannot be attributed without session data.

## SH-4 current UI acceptance review — actual coverage, 2026-11-03

- Existing `scripts/smoke-smart-hints-gemini-ui.mjs`: public Sum educational fake
  responses/exact0→b proposal; computed current-host Monaco diff, old/new source
  and read-only editor assertions before screenshot/Apply. No app code change.
- `docs/AI/AI-SMART-HINTS-SH4-UI-FINAL-OFFLINE-ACCEPTANCE.md`: current matrix,
  fresh evidence/logs, baseline failures, manual checklist and readiness with the
  existing gated launcher. Replaces older missing-launcher readiness limitation.

## SH-4 development Live UI launcher — actual paths, 2026-11-03

- `src/main/services/learning/smart-hints/live-ui-acceptance.ts`: Main argv
  approval, sample allowlist, one-use activation and durable inference budget;
  composes existing service/Gemini adapter. Main index retains disabled default.
- `scripts/run-smart-hints-live-ui.mjs`: offline preparation, local Electron entry
  and isolated userData; no key argument/config or implicit live budget.
- `scripts/smoke-smart-hints-gemini-ui.mjs --launcher`: fake HTTP/confirmation,
  actual Main argv composition and launcher entry; no app fake-transport switch.
- `tests/main/smart-hints-live-ui.test.ts`:25 service/provider integration cases.
- `docs/AI/AI-SMART-HINTS-SH4-LIVE-UI-LAUNCHER.md`: PowerShell/key/budget/off
  instructions, evidence and manual checklist; STOP before live grant.

## SH-4 offline Learning/Practice UI acceptance - actual paths, 2026-11-03

- `scripts/smoke-smart-hints-gemini-ui.mjs`: isolated real Electron UI/preload/IPC,
  capture/service/Gemini adapter, synthetic transport and credential only;
  progressive actions, review/edit guards, error and owner-abort scenarios.
  Test-only in-memory composition; no production config/source change or live mode.
- `docs/AI/AI-SMART-HINTS-SH4-UI-ACCEPTANCE.md`: actual offline matrix, limitations,
  baseline failures, manual checklist and STOP before separately approved live UI.

## SH-4 AQ. compatibility - actual coverage, 2026-11-02

Existing gemini-provider.ts shared geminiKeyState now recognizes the literal AQ. separator with a bounded4KiB local auth-key branch; Standard/AIza bounds remain512. Main composition and manual smoke use this same validator. Existing Gemini provider/smoke tests and native PowerShell/Node/Electron env test cover both fake key types and unchanged x-goog-api-key, with no Authorization/Bearer. No new runtime module/IPC/business contract.127 focused tests PASS; [report](AI/AI-SMART-HINTS-SH4-GEMINI-AUTH-KEY-COMPATIBILITY.md).


## SH-4 Gemini key investigation - actual coverage, 2026-11-02

Existing gemini-provider.ts exports the single Main-only geminiKeyState safety
classifier; existing smoke/runner use precise private key/consent/HTTP codes and
KEY_VALIDATION stage. No business DTO/IPC/secret authority change or new runtime
module. New tests/scripts/smart-hints-gemini-env.test.mjs runs a fake-key actual
PowerShell -> Node supervisor -> Electron Main chain using a separate temp root,
without workspace attempt/evidence mutation. Existing Gemini Main/smoke tests
cover local rejection and unchanged header.90 focused PASS; details:
[Key investigation](AI/AI-SMART-HINTS-SH4-GEMINI-KEY-INVESTIGATION.md).


## SH-4 Gemini replacement - actual paths, 2026-11-02

- `src/main/services/learning/smart-hints/gemini-provider.ts`: Main-owned fixed
  Gemini REST model check/inference, bounded reads/diagnostics, approval and Free
  Tier attestation gates; existing SmartHintsService owns consent/quota/state and
  output/edit validation. `gemini-schema.ts`: provider wire-only JSON schemas.
- `src/main/index.ts`: Gemini factory, production/default approval and tier false.
  Existing shared smart-hints capability type/validator add GEMINI_FREE only;
  SmartHintsPanel existing consent identifies Google/model/Free Tier.
- `scripts/sh4-gemini-smoke.ts`, `sh4-gemini-smoke-main.ts`,
  `run-smart-hints-gemini-live.mjs`: new isolated synthetic Main smoke, offline
  Electron GUI test and bounded supervisor. Only Main reads GEMINI_API_KEY.
- Existing neutral `scripts/sh4-attempt-store.mjs`/`.d.mts`: fixed Gemini profile
  with separate `out/sh4-gemini-attempts/<offline|live>/<attempt-id>/` namespace;
  existing consent window adds Gemini recipient copy. Legacy OpenRouter live CLI
  is retired before dispatch; its source/tests/historical evidence are retained.
- `tests/main/smart-hints-gemini.test.ts`, `smart-hints-gemini-smoke.test.ts`:
  fake-transport schema/envelope/HTTP/quota/deadline/cancellation/lifecycle tests.
  `tests/scripts/smart-hints-gemini-runner.test.mjs`: immutable attempts, isolation,
  supervisor timeout/cleanup and retired/denied CLI. Existing renderer UI test
  adds Gemini consent; SH-4 scoped tsconfig covers the new TS entries.
- Acceptance and live handoff: `AI/AI-SMART-HINTS-SH4-GEMINI-ACCEPTANCE.md`.
  SH-1/2/3 ownership and business DTOs remain; no new IPC/dependency/Monaco patch.


SH-4 envelope audit actual paths (2026-11-02):
`src/main/services/learning/smart-hints/envelope-diagnostics.ts` projects only
fixed guard/field names and presence/type states. The existing response-failure
sink sanitizes it; adapter and isolated smoke attach it. Regression coverage:
`tests/main/smart-hints-openrouter-envelope.test.ts`. No shared IPC owner changed.
Evidence/contract audit: `AI/AI-SMART-HINTS-SH4-ENVELOPE-INVESTIGATION.md`.


SH-4 response classification actual paths (2026-11-02):
`src/main/services/learning/smart-hints/response-failure.ts` owns Main-private safe
failure-stage/content-type/schema-field projection. Existing adapter/service and
development factory feed only the isolated smoke's private evidence; no shared
IPC DTO or Renderer import. Covered by
`tests/main/smart-hints-response-classification.test.ts` plus current SH suites.
Evidence: `AI/AI-SMART-HINTS-SH4-RESPONSE-CLASSIFICATION.md`.


SH-4 runner attempt management actual paths (2026-11-02):
`scripts/sh4-attempt-store.mjs` and `.d.mts` implement private runner artifact
ownership/no-clobber publication; tested by
`tests/scripts/smart-hints-attempt-store.test.mjs` and
`tests/main/smart-hints-attempts.test.ts`. Existing launcher/Main/offline Electron
entry now use `out/sh4-attempts/<live|offline>/<attempt-id>/` for manifest,
reservation, final result, progress, bundle and user-data. Legacy out/ evidence
is read-only; no production/IPC owner changed. See SH-4 Acceptance for checks.


SH-4 offline stabilization actual paths (2026-11-02):
`scripts/sh4-openrouter-diagnostics.ts` is a Main/manual-only bounded projection,
covered by `tests/main/smart-hints-openrouter-diagnostics.test.ts` and the existing
runner tests. Existing OpenRouter factory/runner support the optional fixed North
development profile; no Renderer/shared IPC module or architecture owner changed.
See the latest SH-4 investigation/Acceptance for evidence and live restrictions.


SH-4 manual consent UI actual paths:
`scripts/sh4-consent-window.ts` (isolated secure BrowserWindow, no preload/IDE IPC),
`scripts/sh4-consent-electron-tests.ts` (`--offline-consent-tests` only),
`tests/scripts/smart-hints-consent-window.test.mjs` (window/security/lifecycle).
The existing launcher bundles either interactive Main or explicit offline tests;
interactive `--offline-check` now requires both consent decisions. Scoped tsconfig
includes both new TS scripts. See `docs/AI/AI-SMART-HINTS-SH4-CONSENT-UI.md`.

SH-4 runner corrective coverage also exists at
`tests/scripts/smart-hints-live-supervisor.test.mjs` (isolated fake/dummy-child
lifecycle). Runner stages and atomic run-correlated results remain in the existing
manual launcher/Main/support files. Diagnosis: `docs/AI/AI-SMART-HINTS-SH4-RUNNER-DEBUG.md`.
The same launcher/Main also expose `--offline-check`: synthetic transport/key,
separate offline result/user-data, no production import or live marker mutation.
Main evidence lives in immutable `out/sh4-live-runner/progress-<runId>-<sequence>.json`
snapshots; only the launcher publishes the final aggregate result. Safe fallback
failure snapshots also remain private to this manual runner.

## SH-4 OpenRouter replacement — actual paths, 2026-11-02

- Manual-only `scripts/run-smart-hints-openrouter-live.mjs` bundles/launches isolated
  `sh4-openrouter-smoke-main.ts`; `sh4-openrouter-smoke.ts` uses existing Main SH
  service/adapter with synthetic C# capture, native consent, free metadata checks
  and one persistent inference reservation. No production entry import or new IPC.
  `tests/main/smart-hints-live-runner.test.ts`, existing SH-4 scoped tsconfig:
  offline injected-transports verification; safe artifacts under out/.

- `src/main/services/learning/smart-hints/openrouter-provider.ts` replaces the NIM
  provider file; fixed free route/model and existing gated ephemeral credential.
- SH `adapter.ts`: OpenRouter envelope/metadata support, prompt JSON validation,
  zero price ceilings, no provider fallback; historical fake protocol remains.
- `src/main/index.ts`: OPENROUTER_API_KEY loader, liveApproved false.
- Shared SmartCapabilities/validator: OPENROUTER_FREE replaces NVIDIA_NIM;
  Practice `SmartHintsPanel.tsx`: OpenRouter/routed-provider consent text.
- `tests/main/smart-hints-openrouter.test.ts` replaces NVIDIA tests; Renderer UI
  tests verify new recipient/consent. Existing SH-4 scoped tsconfig includes both.
- SH-1–3 service/capture/receipt/diff/apply modules retain their existing ownership.

## SH-4 actual integration paths — 2026-10-29

- Main SH `nvidia-provider.ts`: fixed NVIDIA NIM adapter, scoped ephemeral key,
  development/approval-gated factory; `index.ts` keeps liveApproved false.
- SH `adapter.ts`: bounded shared SH-only JSON transport with separate fake/NIM
  protocol parameters, credential reflection rejection, response-stream cleanup.
- SH `service.ts`: provider identity capability and shutdown credential disposal;
  shared SmartCapabilities/validator: NVIDIA_NIM mode, no new channel or payload key.
- Practice `SmartHintsPanel.tsx`: NVIDIA recipient/trial/privacy consent copy.
- `tests/main/smart-hints-nvidia.test.ts`, existing Renderer UI tests and
  `tests/tsconfig.sh4.json`: fake-only security/protocol/lifecycle verification.
- `docs/AI/AI-SMART-HINTS-SH4-ACCEPTANCE.md`: actual evidence/live approval checklist.

## SH-3 option A — verified actual paths, 2026-10-29

- `scripts/apply-monaco-hover-lifetime-patch.mjs`, `package.json`: exact-version/
  hash dependency patch, captured-original backup, checked rollback/idempotence,
  prebuild/postinstall; no new package.
- `tests/scripts/monaco-hover-lifetime-patch.test.mjs`:17 filesystem safety cases.
- `practice/SmartHintDiffPreview.tsx`: single owned host observer, cancellable RAF
  mode/size writes, read-only models and ordered disposal.
- `tests/renderer/smart-hints-diff.test.tsx`:3 layout/coalescing/disposal cases.
- Main SH `service.ts` and core test: verified fake-only Apply and shutdown guard.
- Diagnostic/smoke scripts retain strict console failures, native trace and
  responsive DOM readiness; final3 full native runs PASS without probe.
- Status FIXED — AWAITING USER ACCEPTANCE, tracking IN_PROGRESS. Earlier blocked
  entries below are historical. Actual production DISABLED; SH-4 NOT_STARTED.

## SH-3 unblock diagnostics — actual paths, 2026-10-29

- `scripts/diagnose-smart-hints-lifecycle.mjs`: isolated real standalone Monaco
  no-Diff/live-editor baseline, Diff/dispose/Suggest reproducer and native keyboard
  Undo/Redo control. No SH provider or Run/Submit.
- Existing `scripts/smoke-smart-hints-apply.mjs`: diagnostic `--baseline` and
  `--matrix-only`, native content/key/focus/canRedo traces; every console error now
  fails the smoke. Actual product controls remain disabled.
- `docs/AI/AI-SMART-HINTS-SH3-UNBLOCK-OPTIONS.md`: independently established source
  ownership chain, exact unapplied dependency candidate/hash and validation gate.
- SH-3 remains BLOCKED. No application/dependency/architecture changes in this
  investigation; further correction needs approval at the dependency boundary.

## SH-3 Diff/Apply/Undo — actual paths, 2026-10-29

**BLOCKED — NOT PASS:** these paths exist as gated implementation. Real standalone
lifecycle/Redo safety failed; normal compositions keep Apply false and hide Diff.
The diagnostic script alone injects true; do not treat it as a release entry point.

- `practice/SmartHintDiffPreview.tsx`: native modal, readonly Monaco DiffEditor,
  isolated ephemeral models, inline narrow layout, accessible hunk text, disposal.
- `practice/smart-hint-edits.ts`: synchronous guarded one-batch native transaction,
  deterministic selection mapping, scroll/focus and postcondition checks.
- Existing `practice/{PracticeEditor,PracticeWorkspace,SmartHintsPanel}.tsx`,
  `use-smart-hints.ts`, `smart-hints-selection.ts`, `smart-hints.css`: local grant,
  Preview/Apply/Discard, busy gates, context retirement and existing draft path.
- Shared `smart-hints.ts`, `smart-hints-validation.ts` and Main SH `service.ts`:
  fake-only Apply capability, production still disabled; no new IPC channel.
- `tests/renderer/smart-hints-edits.test.tsx`: real model/UTF-16/EOL/native undo,
  draft queue failure/inflight and Project sentinel; existing SH UI tests add
  grant/fingerprint/context/expiry/duplicate protections. `tests/tsconfig.sh3.json`.
- `scripts/smoke-smart-hints-apply.mjs`: production app and real standalone editor,
  fake IPC, isolated userData; keyboard Undo/Redo, diff/focus/selection/autosave.
- [SH-3 acceptance](AI/AI-SMART-HINTS-SH3-ACCEPTANCE.md): actual verification,
  baseline failures, manual checklist and limitations. No SH-4 implementation.

## SH-2 Smart Hints UI — actual paths, 2026-10-28

- `src/renderer/src/features/learning/practice/SmartHintsPanel.tsx`: drawer,
  per-snapshot consent dialog, progressive hints, host Run observations, advisory
  analysis/explanation, read-only proposals/NO_FIX and recovery controls.
- `practice/use-smart-hints.ts`: Renderer-local context, admission, binding/hash/
  sequence validation, consent, polling, expiry and independent retirement.
- `practice/smart-hints-selection.ts`: exact Practice model/primary selection and
  registered single-code-node Solution DOM capture; no edit capability.
- Existing `PracticeWorkspace.tsx`, `PracticeEditor.tsx`, `PracticeDescription.tsx`,
  `PracticeSolution.tsx`: local capture, Monaco action/keyboard/toolbar, Solution
  selection and lifecycle wiring; established Practice presentation retained.
- `practice/smart-hints.css`, existing `src/renderer/src/styles.css`: scoped
  drawer/dialog styles loaded through the existing stylesheet entry.
- `tests/renderer/smart-hints-{selection,ui,integration}.test.tsx`,
  `tests/tsconfig.sh2.json`: component/selection and accepted bridge → Main service
  → fake transport tests. Component Monaco hosts are mocked.
- `scripts/smoke-smart-hints-ui.mjs`: separate Electron acceptance harness using
  production Renderer/Preload and real Monaco, synthetic SH IPC responses and
  isolated userData; no provider/network or Run/Submit execution. No test mode is
  added to production composition. Evidence/screenshots are generated under `out/`.
- `tests/sh2-baseline.vitest.config.mts`: read-only HEAD overlay of four Practice
  components for the Learning timeout absence control; no checkout/fixture edits.
- [SH-2 acceptance](AI-SMART-HINTS-SH2-ACCEPTANCE.md): evidence and limitations.

## SH-1 Smart Hints core — actual paths, 2026-10-28

- `src/shared/contracts/smart-hints.ts`, `smart-hints-validation.ts`: separate
  semantic APIs, exact schemas, request consent, bounded typed public evidence and edits.
- `src/main/services/learning/smart-hints/{capture,public-run-receipt,service,adapter}.ts`:
  public acquisition, Main-only receipt, independent ephemeral lifecycle and injected
  fake DeepSeek transport. Unchanged D2 parser/transport interfaces are imported.
- Existing `package-run-binding.ts`, `exercise-service.ts`: detached public mapping
  from admitted leased inputs, finalized owner-bound receipt, TTL/retirement only.
- Existing `src/main/ipc/exercise-ipc-service.ts`, `src/main/index.ts`: dedicated SH
  channels, owner/frame checks and unprovisioned production composition.
- `src/preload/bridge/smart-hints.ts`; existing `bridge/learning.ts`, shared
  `learning.ts`/`index.ts`: typed capability, immutable binding/epoch/sequence guards.
- `tests/{contracts,main,preload}/smart-hints*.test.ts`,
  `tests/fixtures/learning/smart-hints.ts`, `tests/tsconfig.sh1.json`: synthetic
  focused integration/security/lifecycle/Run tests. No production Renderer change.
- `tests/sh1-baseline.vitest.config.mts`: read-only HEAD overlay for the existing
  Run regression control; never checks out or overwrites working files.
- [SH-1 acceptance](AI-SMART-HINTS-SH1-ACCEPTANCE.md): actual checks and limitations.

## Learning Chapter 2 Solutions — 2026-10-28

User-authorized content extension only; preserve existing ch2-01 Sum and Solution
UI. All9 Chapter2 exercises now have C#/JavaScript teaching content;8 added.

- `src/renderer/src/features/learning/practice/chapter2-solutions.ts`: authored
  ch2-02–ch2-09 analysis, algorithm, meaningful numbered source lines, complete
  code and complexity. Existing `solutions.ts` adds the eight exact-signature mappings.
- `tests/fixtures/learning/chapter2-solution-public.ts`: public metadata/samples/
  starters only and independent boundary examples; no Official/hidden test reads.
- `tests/renderer/chapter2-solutions.test.tsx`,
  `tests/main/chapter2-solution-runtime.test.ts`, `tests/tsconfig.solutions-chapter2.json`:
  content/Copy/signature/pilot-preservation, trusted teaching-code C#/JS execution
  and independent finite-domain checks. No Native Judge/IDE build.
- [Chapter2 review](LEARNING-SOLUTIONS-CHAPTER2-REVIEW.md):157 selected PASS/0 FAIL/
  0 SKIP, scoped tsc/targeted lint/diff PASS; inherited phase acceptance unchanged.

## WA-B1 accepted / WA-B2 Wrong Answer UI — 2026-10-28

WA-B1 is formally COMPLETE — PASS WITH LIMITATIONS;550 related PASS including80
focused and scoped tsc/lint/diff evidence retained without native/build/E2E or
target-host performance/RAM certification. B2 actual Renderer paths:

- `practice/WrongAnswerPanel.tsx`: existing validated B1 status only; safe typed
  JSON text for public values, truthful fallback, fail-fast counts, storage and
  stale-source notice. No data acquisition/History/AI authority.
- Existing `practice/PracticeDescription.tsx`, `PracticeWorkspace.tsx`,
  `use-submission.ts`: dynamic fourth tab, guarded local Attempt marker, same-ref
  once-only selection and context/pagehide retirement. Editor/Run remain mounted
  independently. `SubmissionResult.tsx` exports unchanged storage message formatter.
- Existing `learning.css`: scoped light Practice tokens, restrained error/success
  accents and independently scrollable values; shared Tabs implementation unchanged.
- `tests/renderer/wrong-answer-ui.test.tsx`, `tests/tsconfig.wa-b2.json`: synthetic
  UI verification. Existing `submission-history.test.tsx` has a narrow assertion/
  fixture update for approved WA auto-navigation; pre-existing edits preserved.
- [WA-B2 acceptance](WA-B2-WRONG-ANSWER-UI-ACCEPTANCE.md): delivery/verification,
  Electron manual checklist and limitations. No Main/Preload/shared/storage change.

## WA-B1 safe public diagnostic — 2026-10-28

- `src/shared/contracts/submission-diagnostic.ts`:32 KiB bounded descriptor/typed
  validation and public mismatch/unavailable union; `submission.ts` and
  `submission-validation.ts` bind optional diagnostic to WA STORAGE/SETTLED status.
- `src/main/services/learning/judge/public-sample-diagnostic.ts`: Main-only same
  leased package public provenance verification, bounded detached capture/fallback.
- Existing `official-case-plan.ts`, `judge-service.ts`, `exercise-service.ts`:
  synchronous resolver at mismatch, final-qualified publication and retirement.
  Comparator/verdict reducer, execution count and storage authority are unchanged.
- Existing `submission-projection.ts`, `src/preload/bridge/submission.ts`:
  explicit projection, strict validation/clone and immutable same-ref evidence.
  Existing Exercise IPC routes carry the extended status without new channels.
- `tests/{contracts,main,preload}/wa-diagnostic.test.ts`,
  `tests/fixtures/learning/wa-diagnostic.ts`, `tests/tsconfig.wa-b1.json`:
  synthetic contract/provenance/real-service/storage/IPC/Preload verification.
- [WA-B1 acceptance](WA-B1-SAFE-DIAGNOSTIC-ACCEPTANCE.md): no Renderer/WA-B2,
  hidden policy relaxation, storage schema/migration, AI/network or native/build work.

## AI-D2 Submission Analysis — 2026-10-28

Actual paths:

- `src/shared/contracts/analysis.ts`, `analysis-validation.ts`: semantic operations,
  consent, status/result allowlists and bounds; exported by contracts index.
- `src/main/services/learning/analysis/`: Main-private `contracts.ts`,
  `validation.ts`, `adapter.ts` promoted independently from accepted D1; `capture.ts`
  for existing committed-read/public Registry projection; `service.ts` for ephemeral
  single-use operations, deduplication, cancellation and status.
- Existing `storage/submission-read-model.ts` and `learning-store.ts`: bounded
  read-only analysis projection; existing write/recovery/lease policy unchanged.
  `submission-projection.ts` extends its encrypted source token with selected
  exercise/language/version metadata for exact Main-private analysis binding.
- Existing `src/main/ipc/exercise-ipc-service.ts`: separate analysis channels use
  the same owner/frame/context/source-reference authority as Submission History.
  `src/main/index.ts` composes a fail-closed unprovisioned service.
- `src/preload/bridge/analysis.ts` through `bridge/learning.ts`: typed pull-based
  analysis API, requestId/sequence/shared epoch filtering and unload cleanup.
- `tests/{main,preload,contracts}/analysis*.test.ts`,
  `tests/fixtures/learning/analysis.ts`, `tests/tsconfig.ai-d2.json`: synthetic
  isolated verification and scoped compiler closure. No Renderer UI added.

## Learning Chapter 7 Solutions — 2026-10-27

Chapter 6 was accepted by the user before authorizing this content extension. No UI redesign or E7/candidate acceptance change.

| Actual path | Owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/chapter7-solutions.ts` | Offline authored guidance for ch7-01–ch7-09, C#/JavaScript; exact array signatures, full source and meaningful-line explanations |
| Existing `solutions.ts` | Add nine Chapter 7 mappings under unchanged public ID/signature lookup |
| `tests/fixtures/learning/chapter7-solution-public.ts` | Public-only metadata/samples/starters and independent boundary examples |
| `tests/renderer/chapter7-solutions.test.tsx`, `tests/main/chapter7-solution-runtime.test.ts` | UI/content/Copy/no-division/preservation tests, isolated .NET/Node execution and nine finite-domain oracles |

Results and limitations: [Chapter 7 Solution review](LEARNING-SOLUTIONS-CHAPTER7-REVIEW.md).

## Learning Chapter 6 Solutions — 2026-10-27

Chapter 5 was accepted by the user before authorizing this content extension. Existing UI and earlier content remain unchanged; no E7/candidate acceptance change.

| Actual path | Owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/chapter6-solutions.ts` | Independently authored offline guidance for ch6-01–ch6-09, C#/JavaScript; statement-required local helpers, exact public signatures, complete code and ordered meaningful-line explanations |
| Existing `solutions.ts` | Add nine Chapter 6 mappings under unchanged exact ID/signature lookup |
| `tests/fixtures/learning/chapter6-solution-public.ts` | Public-only metadata/samples/starters and independent boundary examples |
| `tests/renderer/chapter6-solutions.test.tsx`, `tests/main/chapter6-solution-runtime.test.ts` | UI/content/Copy/helper/preservation checks, isolated .NET/Node execution and independent finite-domain oracles |

Results and limitations: [Chapter 6 Solution review](LEARNING-SOLUTIONS-CHAPTER6-REVIEW.md).

## Learning Chapter 5 Solutions — 2026-10-27

Chapter 4 was accepted by the user before authorizing this content extension. No E7/candidate acceptance change.

| Actual path | Owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/chapter5-solutions.ts` | Independently authored offline guidance for ch5-01–ch5-09, both languages; exact string/string-array signatures, complete source and meaningful-line explanations |
| Existing `solutions.ts` | Add nine Chapter 5 mappings under unchanged exact ID/signature matching |
| `tests/fixtures/learning/chapter5-solution-public.ts` | Public metadata/samples/starters and independent examples only |
| `tests/renderer/chapter5-solutions.test.tsx`, `tests/main/chapter5-solution-runtime.test.ts` | UI/content/Copy/preservation checks, isolated .NET/Node execution and small-domain brute-force oracles |

Results and limitations: [Chapter 5 Solution review](LEARNING-SOLUTIONS-CHAPTER5-REVIEW.md).

## Learning Chapter 4 Solutions — 2026-10-27

User-authorized content extension only; existing Solution UI and Chapter 2/3 content unchanged. No E7/candidate acceptance change.

| Actual path | Owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/chapter4-solutions.ts` | Independently authored offline guidance for ch4-01–ch4-09, C#/JavaScript; complete source and ordered meaningful-line explanations |
| Existing `solutions.ts` | Register nine Chapter 4 IDs under the existing exact public signature lookup |
| `tests/fixtures/learning/chapter4-solution-public.ts` | Public-only exercise assets and independent boundary examples; no private testcase reads |
| `tests/renderer/chapter4-solutions.test.tsx`, `tests/main/chapter4-solution-runtime.test.ts` | All content/Copy/language/mapping checks and isolated .NET/Node teaching-code verification |

Results and limitations: [Chapter 4 Solution review](LEARNING-SOLUTIONS-CHAPTER4-REVIEW.md).

## Learning Chapter 3 Solutions — 2026-10-27

User-authorized content extension and balanced Solution panel gutters; no E7/candidate acceptance change.

| Actual path | Owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/chapter3-solutions.ts` | Independently authored offline guidance for all nine Chapter 3 exercises, both languages; full source retains syntax-only lines while walkthrough includes only meaningful lines with real line numbers |
| Existing `solutions.ts`, `PracticeSolution.tsx`, `learning.css` | Add Chapter 3 mappings and optional complete-source/line-number fields; preserve ch2-01 content; equal panel gutters, existing UI and editor isolation |
| `tests/fixtures/learning/chapter3-solution-public.ts` | Public-only metadata/samples/starters and independent examples; no Official testcase reads |
| `tests/renderer/chapter3-solutions.test.tsx`, `tests/main/chapter3-solution-runtime.test.ts` | Content/Copy/mapping coverage plus isolated .NET 10 and Node teaching-code verification |

Results and limitations: [Chapter 3 Solution review](LEARNING-SOLUTIONS-CHAPTER3-REVIEW.md).

## Learning Solution pilot UI — 2026-10-27

User-authorized Renderer-only phase-1 Solution content; no E7/candidate acceptance change.

| Actual path | Owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/solutions.ts` | Offline independently authored `ch2-01` teaching content, exact exercise/signature lookup, language-specific explained lines and derived complete code |
| `src/renderer/src/features/learning/practice/PracticeSolution.tsx` | Read-only Solution panel, independent language selection, existing Monaco tokenizers without creating editor models, clipboard feedback |
| Existing `PracticeDescription.tsx`, `learning.css` | Description / Solution / Submissions navigation and existing scroll-panel styling |
| `tests/renderer/practice-solution.test.tsx` | Pilot content/public signature checks, JavaScript examples, navigation, copy and editor isolation |

Verification and limitations: [Solution pilot review](LEARNING-SOLUTION-PILOT-REVIEW.md).

## Phase9E-6 formally accepted actual UI — 2026-10-26

**E6-S1–S3 and Phase 9E-6 COMPLETE — PASS WITH LIMITATIONS; Phase 9E-7 NOT_STARTED.**
User formally accepts [E6](PHASE-9E6-FINAL-ACCEPTANCE.md): S1 42 new/47 regression
PASS, S2 41/18 PASS (38 filtered not PASS), S3 48/58 PASS and scoped checks within
each recorded scope. No phase-wide count aggregation or verification rerun. This
supersedes earlier review-pending/future statuses; original evidence/corrections remain.

| Actual path | Renderer owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/use-submission-source.ts` | Existing E5 Source API, contiguous bounded UTF-8 chunks/identity checks, complete-only code publication, manual retry and retired read suppression |
| `src/renderer/src/features/learning/practice/SubmissionSourceViewer.tsx` | Read-only C#/JavaScript Monaco view with isolated disposable model; no editable practice model reuse |
| `src/renderer/src/features/learning/practice/SubmissionDetails.tsx` | In-pane metadata/back/source/availability, explicit Restore consent and duplicate/draft-context guards |
| Existing `use-submission-history.ts`, `SubmissionHistoryPanel.tsx`, `PracticeDescription.tsx` | Retain opaque source binding privately, select/back Details, retire on exercise/language/tab/leave changes |
| Existing `LearningWorkspace.tsx`, `PracticeWorkspace.tsx`, `use-practice.ts`, `learning.css` | Guarded private Restore plumbing to existing atomic draft/language edit and explicit replacement intent; return boolean success, no new queue/lifecycle |
| `tests/renderer/submission-details.test.tsx`, `submission-history.test.tsx` |48 new tests PASS;58 direct History/Practice/editor replacement regression PASS; initial2 textarea CRLF assertions corrected with exact payload checks |
| `docs/PHASE-9E6-S3-DETAILS-RESTORE-ACCEPTANCE.md`, `PHASE-9E6-FINAL-ACCEPTANCE.md` | S3/phase formally accepted; original step-local evidence/limits, documentation-only closure and E7 handoff |

No Main/Preload/Judge/Storage/API/Official/Runtime/Project or dependency changes.
S1/S2 evidence and two legacy fixture cast exclusions remain; real Monaco/Electron/
native-host-release/durability/performance conditions remain unverified as recorded.
E4 current-artifact NOT PASS,12 models PENDING_RUNTIME and deferred gates unchanged.
**STOP after E6 acceptance; E7 requires separate explicit authorization. No Git publication.**

## Phase9E-6 E6-S1 accepted / E6-S2 actual History tabs — 2026-10-26

**E6-S1 COMPLETE — PASS WITH LIMITATIONS; E6-S2 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); Phase9E-6 IN_PROGRESS; E6-S3/E7 NOT_STARTED.**
This supersedes earlier S1-pending/S2-unauthorized notes; original evidence remains.

| Actual path | Renderer owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/PracticeDescription.tsx` | Exercise-keyed default Description/Submission tabs; original description content, editor remains outside tabs |
| `src/renderer/src/features/learning/practice/use-submission-history.ts` | Committed per-exercise ALL/32-row reads, stale cursor restart/identity checks, coalesced saved refresh and retired-read suppression |
| `src/renderer/src/features/learning/practice/SubmissionHistoryPanel.tsx` | Safe summary table, committed saved states, availability/unknown totals/recovery warnings, completion from existing observer; no details/source access |
| `PracticeWorkspace.tsx`, `LearningWorkspace.tsx`, `learning.css` in existing Learning feature | Pane/active wiring and Learning token styling; no Run/Submit lifecycle reset |
| `tests/renderer/submission-history.test.tsx` |41 new UI PASS;14 existing Practice/4 focused S1 integration PASS,38 S1 cases filtered, not PASS |
| `docs/PHASE-9E6-S2-SUBMISSION-HISTORY-ACCEPTANCE.md` | S1 acceptance, S2 evidence/typecheck correction and inherited limitations/STOP |

Main/Preload/Judge/Storage/API/Runtime/Project and S1 submission observer are unchanged.
S1 retains42 new/47 regression PASS, two legacy fixture cast exclusions and unverified
Electron/native smoke; per-file regression split corrected to14/10/23 without
changing47. Inherited E4 current-artifact NOT PASS, native/host/release UNVERIFIED,
storage durability/performance uncertified,12 PENDING_RUNTIME models and deferred
gates unchanged. **STOP before E6-S3 details/source Restore.**

## Phase9E-6 E6-S1 actual Submit UI — 2026-10-26

**E6-S1 REVIEW COMPLETED — AWAITING USER ACCEPTANCE (tracking IN_PROGRESS);
Phase9E-6 IN_PROGRESS; E6-S2/E7 NOT_STARTED.** Phase9E-5 remains accepted COMPLETE —
PASS WITH LIMITATIONS. This section supersedes earlier notes that all Submit UI
is absent or E6 is wholly unauthorized; only S1 is authorized/delivered.

| Actual path | Renderer owner / scope |
|---|---|
| `src/renderer/src/features/learning/practice/use-submission.ts` | Existing E5 public API observation, immutable capture, Main ref/sequence binding, status-only ACK recovery, context retirement and committed completion |
| `src/renderer/src/features/learning/practice/SubmissionResult.tsx` | Safe verdict vs storage, prior-source notice, committed completion/UNKNOWN/recovery warning; no hidden evidence |
| `src/renderer/src/features/learning/practice/PracticeWorkspace.tsx`, `LearningWorkspace.tsx`, `learning.css` | Submit button/result and busy wiring; existing Learning layout and Run API retained |
| `tests/renderer/submission-ui.test.tsx` |42 targeted UI PASS;47 existing direct renderer regression PASS, controlled APIs/editor only |
| `docs/PHASE-9E6-S1-SUBMIT-UI-ACCEPTANCE.md` | Scope, verification history, scoped typecheck boundary/legacy fixture errors, inherited limitations and STOP |

No Main/Preload/Judge/Runtime/Storage/contracts or Project changes. History UI and
Restore are deferred. E4 current-artifact NOT PASS, native/host/release UNVERIFIED,
storage durability/performance uncertified,12 models PENDING_RUNTIME and deferred
gates unchanged. **STOP before E6-S2; explicit acceptance/authorization required.**

## Phase9E-5 accepted actual safe transport — 2026-10-26

**Phase 9E-5 and E5-S1–S6 COMPLETE — PASS WITH LIMITATIONS; E6/E7 NOT_STARTED.**
User formally accepts S6's42 targeted PASS/29 focused regression PASS/30 filtered
S5 tests (not PASS) and historical scoped checks. All step-local evidence/failures/
corrections/limits are preserved without count aggregation or rerun. This section
supersedes older future/pending notes; original module ownership remains unchanged.
E4 current-artifact handoff remains NOT PASS; native/target-host/release UNVERIFIED;
storage durability/performance uncertified;12 models PENDING_RUNTIME and deferred
verification gates unchanged.

| Actual path | Owner / scope |
|---|---|
| `src/shared/contracts/submission.ts`, `submission-validation.ts`; `index.ts`, `learning.ts` exports/composition | Safe semantic public Submit/status/ref/committed reads/context API, pure strict validation/bounds; separate LearningApi.submission preserves ExerciseApi's four Run methods |
| `src/main/services/learning/submission-projection.ts` | Main explicit safe projections and process/context-scoped encrypted read bindings; internal hashes/plan/Judge data stay Main-private |
| `src/main/ipc/exercise-ipc-service.ts` | Existing owner/frame/epoch coordinator extended with fixed Submit/read/context routes, current/ref retry, monotonic publication and safe boundaries |
| `src/main/services/learning/exercise-service.ts`, `src/main/index.ts` | Read-only context stamp/coarse counts and managed store/event wiring; S5 guard/operation/storage semantics unchanged |
| `src/preload/bridge/submission.ts`, `learning-order.ts`; `exercise.ts`, `learning.ts` composition | Typed validated Submit bridge, one pre-ACK buffer, lifetime cleanup and cross-mode transport generation/context ordering |
| `tests/contracts/submission.test.ts`, `tests/main/submission-ipc.test.ts`, `tests/preload/submission-bridge.test.ts` |17/15/10 new targeted PASS; controlled real-service→Judge→temporary-store→transport lost-ACK flow, no native/student execution |
| `tests/fixtures/learning/submission-transport.ts` | Synthetic transport DTOs only |
| `docs/PHASE-9E5-FINAL-ACCEPTANCE.md` |42 new +29 directly affected regression PASS/0 FAIL/30 filtered, scoped checks, consolidated S1–S6 evidence/limits and E6 handoff |

No Renderer/PracticeWorkspace/UI/History/Restore changes, schema/policy/native work,
new lifecycle or release certification. **STOP pending separate explicit E6 authorization.**

## Phase9E-5 E5-S5 actual same-operation integration / S4 accepted — 2026-10-26

**S1–S4 COMPLETE — PASS WITH LIMITATIONS; S5 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
User accepts S4's72 PASS/3 focused regression PASS/scoped checks; original evidence/
limitations retained without rerun. This supersedes historical future/pending notes.

| Actual path | Main owner / scope |
|---|---|
| `src/main/services/learning/exercise-service.ts` | Submit intent before same admission/execute, once-bound plan/capture, private safe status handle, VERIFIED runtime finalization, same-op retained transaction/live guard/retry and independent15s/10s storage shutdown joins |
| `src/main/services/learning/official-case-plan.ts` | Main-only CURRENT selection in existing owned Prepare/Registry lease; expected-identity Official/Judge path stays exact |
| `src/main/index.ts` | Managed storage dependency before ExerciseService; lazy existing native lease binding retained until service stops; no second operation coordinator |
| `tests/main/submission-service.test.ts` |35 controlled source/route/eligibility/guard/cleanup/unknown/ACK/expiry/shutdown/privacy integration tests PASS; no native/student execution |
| `docs/PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md` |35 new +96 directly affected regression PASS/0 FAIL/1 filtered; scoped checks, initial failures/corrections, limitations and stop gate |

S1–S4 sources, Judge/Runtime/Core/Registry/Official/native/public Run remain unchanged.
The integration uses S3 verified settlement and S4 committed completion; no new schema,
queue/index, public DTO/IPC/preload/UI/History/Restore or durability certification.
**STOP for user S5 acceptance; S6 remains unauthorized.**

## Phase9E-5 E5-S4 actual committed reads / S3 accepted — 2026-10-26

**S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; S4 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); S5/S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
User accepts S3's40 PASS/28 S2 regression PASS/1 native live SKIP and scoped checks;
history/limits preserved. This supersedes historical pending/future statements below.

| Actual path | Main owner / scope |
|---|---|
| `src/main/services/learning/storage/submission-read-model.ts` | Lease-authenticated committed snapshots, derived ordering/conflict indexes, safe bounded summaries, generation/availability/integrity cursors, immutable UTF-8 source chunks, Accepted-only completion; private DTOs only |
| `src/main/services/learning/learning-store.ts` | S3 transaction façade extended with history/source/completion, matching read-task join and retained read-resource settlement/exclusion; no service wiring |
| `tests/fixtures/learning/submission-read-fixture.ts` | Synthetic canonical records/snapshots and isolated temporary checked storage with simulated lease/fault ports; no actual native |
| `tests/main/submission-read-model.test.ts` |50 targeted committed/partial/conflict/pagination/source/privacy/resource tests PASS |
| `tests/main/submission-completion.test.ts` |22 targeted Accepted-only/missing/unavailable/recovered/candidate-exclusion tests PASS |
| `docs/PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md` |72 new PASS/0 FAIL/0 SKIP,3 directly affected façade regression PASS (37 filtered), scoped checks and limitations |

S1–S3 contracts/helpers/transaction sources unchanged. Completion does not read
Failed; no persisted progress/index or optimistic grade. S3 backup warning/repair
policy is preserved. No S5/S6 service/transport/UI/Restore, actual native execution,
power-loss/performance/release certification. **STOP for user S4 acceptance.**

## Phase9E-5 E5-S3 actual transaction/recovery — 2026-10-26

**S1/S2 COMPLETE — PASS WITH LIMITATIONS; S3 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); S4–S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
This current section supersedes historical S3-future/status statements below.

| Actual path | Main owner / scope |
|---|---|
| `src/main/services/learning/learning-store.ts` | One unsettled continuation, immutable retry/conflict façade; no service/IPC/committed read-model integration |
| `src/main/services/learning/storage/snapshot-transaction.ts` | Atomic one-target staging/backup/guarded primary/verification, bounded safe retry and expiry, retained unknown settlement, authenticated-lease recovery/classified availability |
| `src/main/services/learning/storage/store-files.ts` | S2 primitives extended with checked free-space/evidence scan and settled rename reconciliation |
| `src/main/services/learning/storage/store-lease.ts` | Existing shared OS lease, extended FULL/CONFLICT error vocabulary; native lifecycle unchanged |
| `tests/main/submission-store.test.ts` |40 synthetic temporary-directory transaction/recovery tests PASS; no native Judge/Runtime |
| `docs/PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md` | Commands,68 targeted PASS/0 FAIL/1 native live SKIP, scoped checks, historical corrections and limitations |

Guard injection grants no owner/commit authority; S5 owns integration. Recovered
backup view is explicitly older/read-only; no automatic repair or temp promotion.
Controlled restart tests do not certify power-loss durability, performance or
production commits. Historical S1/S2 acceptance and E4 limitations remain intact.
**STOP after S3 pending user acceptance; S4–S6 remain unauthorized.**

## Phase9E-5 E5-S2 actual checked files/shared lease — 2026-10-26

S1/S2 formally accepted COMPLETE — PASS WITH LIMITATIONS (81/29 historical targeted PASS respectively, no rerun). Phase9E-5 IN_PROGRESS; S3–S6 NOT_STARTED and not authorized. Final S2 acceptance is documentation-only, preserving file/native/scoped evidence, corrections and all limitations; no transaction/recovery/release certification. This supersedes historical pending statuses below. STOP awaiting S3 authorization.

| Actual path | Main owner / scope |
|---|---|
| `src/main/services/learning/storage/store-files.ts` | Trusted-root/ancestor/file identity checks; fixed primary/backup/lock paths; bounded checked bytes; exclusive owned staging/sync/close/read-back/discard; guarded schema-blind sibling replacement and retained unresolved resources |
| `src/main/services/learning/storage/store-lease.ts` | Shared Accepted/Failed native acquireLease/close wrapper, typed redacted errors, authenticated ephemeral tokens, busy refusal/retained close retry, stale-token revocation; no fallback or process API |
| `tests/main/submission-store-files.test.ts`, `submission-store-lease.test.ts` |29 targeted PASS/0 FAIL/0 SKIP; real temporary filesystem checks, controlled faults/lifecycle and actual Windows cross-process lease exclusion/reacquisition/fingerprint |
| `tests/fixtures/learning/submission-lease-peer.mjs` | Dedicated child lease holder/contender only, no Jobs/Runtime calls |
| `docs/PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md` | Actual S2 evidence/command history/limitations/stop gate |

Ignored scoped tools/receipt under `out/e5-s2/`; no production build/config/native artifact generated. Actual native lease evidence is restricted to unchanged SHA256 `97dd803603ba655ab58d1df24e5de4957ff226c8ea31e1491d58c4bcfe0cbcc3` and current Windows x64 host. No S1/E4 rerun, real user storage or submission commit/recovery/service integration. S3 transaction/recovery/S4 reads/completion/S5 service/S6 transport remain absent. Inherited current-artifact handoff NOT PASS/general native/target-host/release UNVERIFIED,12 models PENDING_RUNTIME, storage performance NOT MEASURED/durability UNVERIFIED remain.

## Phase9E-5 E5-S1 actual pure submission contracts — 2026-10-26

Design/six-step plan/E5-D1–D6 APPROVED; only S1 authorized. Phase9E-5 IN_PROGRESS — E5-S1; S1 REVIEW COMPLETED — AWAITING USER ACCEPTANCE; S2–S6 NOT_STARTED. This current status supersedes historical proposal/phase-not-started notes below.

| Actual path | Main owner / verified scope |
|---|---|
| `src/main/services/learning/storage/submission-contracts.ts` | Immutable capture/Accepted/Failed/document/target/status/availability contracts and approved byte/wait/read policy configuration; no disk/timers/IDs minted |
| `src/main/services/learning/storage/submission-validation.ts` | Strict data allowlists, well-formed Submit source/SHA256, detached frozen values, canonical record/document encoding/checksum, capacity, pure candidate routing/idempotency and supplied-predecessor lineage checks |
| `tests/main/submission-records.test.ts` |81 synthetic tests PASS, including privacy/source/identity/lineage and real measured64MiB/32MiB exact/+1byte snapshots; no Official assets or I/O/native tests |
| `docs/PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md` | Actual S1 results/encoding rules/bounds/limitations and user stop gate |

`learning-store.ts`, file/lease/transaction/recovery/read-model/service/transport implementation remains future S2–S6. Pure validation/checksum/candidate projection is not trust, commit capability, saved state or completion. D6 now assigns safe transport to S6 before E6 UI; no public contract is added by S1. Scoped tsc/lint/diff PASS; ignored `out/e5-s1/tsconfig.json` selects new modules/test/imported closure without emission or production configuration change. No build/native/current-artifact certification. E4 recorded scope/NOT PASS current handoff, current native UNVERIFIED,12 models PENDING_RUNTIME and target-host/reliability/release UNVERIFIED remain; storage performance NOT MEASURED/durability UNVERIFIED.

## Phase 9E-4 E4-S4 actual targeted native acceptance — 2026-10-26

S1–S3 COMPLETE — PASS WITH LIMITATIONS, user accepted. S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only); Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope), formally user accepted under Option A;9E-5 NOT_STARTED. This current status supersedes earlier step-local historical statuses below.

| Actual path | Owner / scope |
|---|---|
| `tests/main/generic-judge-service.integration.test.ts` | Four sequential current-host actual service/compiled-opener/native Judge operations: correct and real WA Divide in C#/JS; private scalar receipts, barrier/ownership/release/privacy proof and unchanged22-file fingerprints |
| `out/e4-s4/` (ignored verification artifacts) | Scoped tsc config; separate50-input Main emission/dependency audit; four native receipts and one summary, no production artifact/anchor replacement |
| `docs/PHASE-9E4-FINAL-ACCEPTANCE.md` | Actual four-operation result matrix, inherited evidence/failures/limits,9E-5 conditions and final user stop gate |

4 tests PASS/0 FAIL/0 SKIP on recorded artifacts,16 comparisons/22 native Jobs, VERIFIED cleanup/zero fixture ledger. Native-run22 fingerprints match; final audit finds2 post-run ignored artifact changes (native binary/Main index), so **current-artifact handoff NOT PASS** remains unchanged despite Option A functional acceptance. The different current native binary remains UNVERIFIED; Main index lacks full-app verification. No current-artifact/release certification. No S4 production edit/restore/rerun; receipts/hashes/drift audit preserved. S1–S3 tests/native faults/63×2/performance/release matrices not rerun.12 models PENDING_RUNTIME; general Official60s/target-host/reliability/release UNVERIFIED; deferred loader/installed/offline/filesystem gates unchanged. Release verification must verify finalized artifacts;9E-5 must design commit-time owner validation, same-operation hold-through-commit and storage/recovery. Public Submit transport remains unimplemented pending explicit E4-D4 allocation. No Submit/storage/history implementation or9E-5 authorization.

## Phase 9E-4 E4-S3 actual Main-private integration — 2026-10-26

S1/S2 COMPLETE — PASS WITH LIMITATIONS, user accepted. Phase9E-4 IN_PROGRESS; S3 REVIEW COMPLETED — AWAITING USER ACCEPTANCE (tracking IN_PROGRESS); S4 NOT_STARTED.

| Actual path | Owner / scope |
|---|---|
| `src/main/services/learning/judge-service.ts` | Operation-local synchronous comparator accumulator/reducer composition; no independent service/admission/lifecycle |
| `src/main/services/learning/exercise-service.ts` | Existing service `runJudge`, actual owner/source/session facts, VERIFIED cleanup/release sealing before slot release, retained retry and guarded private result/raw completion |
| `src/main/services/learning/official-case-plan.ts` | Same leased plan; narrow Judge-only Expected view, current barrier budget guards, input-borrow count and successful content-release facts |
| `src/main/services/learning/runtime/official-execution-contracts.ts` | Additive Main-only Judge handle extending existing raw completion; language input descriptor unchanged |
| `tests/main/generic-judge-service.test.ts` |37 controlled Judge tests, plus60 directly affected existing regressions; [S3 evidence](PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md) |

S1/S2 implementation/semantics, language adapters, shared driver/Core, Registry and frozen data unchanged. No public API/storage/history or native acceptance.97 unique relevant tests PASS after documented fixture corrections; inherited12 models PENDING_RUNTIME and target-host/release UNVERIFIED. Earlier sections retain step-local history.

## Phase 9E-4 E4-S2 actual reducer — 2026-10-26

S1 formally accepted COMPLETE — PASS WITH LIMITATIONS; original93 PASS/scoped checks/failures/limitations preserved. Phase9E-4 IN_PROGRESS; S2 REVIEW COMPLETED — AWAITING USER ACCEPTANCE, tracking IN_PROGRESS; S3/S4 NOT_STARTED.

| Actual path | Owner / scope |
|---|---|
| `src/main/services/learning/judge/verdict-reducer.ts` | Pure Main-private fact consistency/precedence/case/overall/eligibility reduction. No execution, comparison, owner authentication or lifecycle |
| `src/main/services/learning/judge/judge-contracts.ts` | S2 adds observed operation binding, post-VERIFIED comparator evidence, release-failure fact and safe Core reason/Runtime failure-phase projection |
| `tests/main/judge-verdict-reducer.test.ts` |110 synthetic reducer PASS;93 affected S1 regression PASS; scoped checks and limitations in [S2 report](PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md) |

No comparator semantic, Runtime/driver/Core/Registry/policy/resource/public API change. Real owner attestation/leased hook/final handoff awaits S3; native Judge acceptance awaits S4; public transport package allocation remains required.12 models PENDING_RUNTIME; target-host/release UNVERIFIED. Earlier step records below retain historical scope/status.

## Phase 9E-4 E4-S1 actual modules — 2026-10-26

Design/four-step plan/E4-D1–D4 APPROVED; S1 only authorized. Phase9E-3 COMPLETE — PASS WITH LIMITATIONS; Phase9E-4 IN_PROGRESS — E4-S1 delivered/awaiting user acceptance. S2–S4 NOT_STARTED.

| Actual path | Owner / scope |
|---|---|
| `src/main/services/learning/judge/exact-typed-comparator.ts` | Main-private pure exact-typed@1; six types, density/Unicode/rectangular validation, Expected L6 versus Actual Runtime bounds; no clone/process/I/O |
| `src/main/services/learning/judge/judge-contracts.ts` | Main-private type-only comparator/case/verdict/state/evidence/owner/cleanup/eligibility vocabulary; no reducer/runtime authority |
| `tests/main/exact-typed-comparator.test.ts` | Behavioral/type boundaries;93 targeted PASS, scoped tsc/lint PASS; [evidence](PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md) |

Judge service/reducer/integration remain planned. No public Run/Submit/IPC/Preload/Renderer/storage/Runtime/frozen-resource changes. Public transport allocation remains required under E4-D4.12 models PENDING_RUNTIME; target-host/release UNVERIFIED.

## E2-S6 Wave B actual modules — 2026-10-25

Current inventory: **49 full/14 public-only, release5**; Wave A accepted COMPLETE,
Wave B delivered PASS WITH LIMITATIONS/pending user acceptance. C/D/S7/9E-3 NOT_STARTED.

| Actual path | Owner / scope |
|---|---|
| scripts/learning-official-tests/wave-b-spec.ts |16 domains, semantic facets, seeded recipes, independent oracles/proofs and critical/broader models; developer only |
| scripts/learning-official-tests/wave-b-staging.ts, run-wave-b.mjs, wave-b-child.mjs |Existing verifier/compactor/reader/Registry/transaction composition; exact16-ID trusted dispatch and two-root freeze/revalidation |
| scripts/learning-official-tests/references/WaveB.csproj, WaveBProgram.cs and16 ID/{Solution.cs,solution.js} pairs |32 trusted C#/JS references, fixed allowlisted builds; excluded from shipping |
| tests/main/official-test-wave-b.test.ts, official-test-wave-b-release.test.ts, official-test-wave-b-integrity.test.ts |Domain/coverage/quarantine, active49/14 release and fail-closed reader/build checks |
| scripts/smoke-learning-pilot-promotion.mjs, smoke-learning-editor-sync.mjs |Power C#/JS public smoke option and real enabled/visible Learning↔Project draft smoke |
| resources/learning/exercises/{16 Wave B IDs}/judge/v1.json, exercise.json, manifest.json |Existing full-profile data only; package2, release5; prior33 full packages unchanged |
| docs/PHASE-9E2-S6-WAVE-B-ACCEPTANCE.md |Per-ID proofs/counts/hashes/budgets, current63 inventory, failures/limitations and stop gate |

No production Registry/parser/cache/lifecycle/Runtime module was added. The Wave A
map below retains its release4 historical inventory; its release tests now also
verify all49 active full packages and unchanged Wave A cases.

## E2-S6 Wave A actual modules — 2026-10-25

| Actual path | Owner / scope |
|---|---|
| scripts/learning-official-tests/wave-a-spec.ts |24 fixed domains/curated inputs/actual-input coverage predicates/independent oracles/finite critical+broader models; developer only |
| scripts/learning-official-tests/wave-a-staging.ts, run-wave-a.mjs |Existing verifier/compactor/reader/Registry/transaction composed for two-root generation, readback/revalidation and authorized Wave A-only promotion |
| scripts/learning-official-tests/wave-a-child.mjs |Bounded fixed24-ID trusted JS reference dispatch; no student runtime |
| scripts/learning-official-tests/references/{24 Wave A IDs}/{Solution.cs,solution.js}, WaveA.csproj, WaveAProgram.cs |48 developer reference solutions and exact allowlisted C# build/dispatch; not packaged |
| tests/main/official-test-wave-a.test.ts, official-test-wave-a-release.test.ts |Domain/arithmetic/facets/mutation/quarantine/determinism, actual33/30 reader/Registry/ownership budgets |
| .gitattributes |Only resources/learning/exercises/** marked -text to preserve approved raw hashes under Windows Git; no asset byte change |
| eslint.config.mjs |CommonJS environment for24 new references; original three chapter2–4 pilot sources excluded from override |
| resources/learning/exercises/{24 Wave A IDs}/judge/v1.json, exercise.json and manifest.json |Existing full schema, package2 for new24;33 full/30 public-only, release4; original nine full packages unchanged |

Shared model/references/verify/pilot-freeze/pilot-release remain the sole developer kernel/child/compactor/transaction; no app Registry/parser/Runtime added. [Wave A report](PHASE-9E2-S6-WAVE-A-ACCEPTANCE.md) is COMPLETE/user accepted; Wave B separately delivered, C/D/S7/9E-3 NOT_STARTED.


## E2-S5 actual promotion modules — 2026-10-24

| Actual path | Owner / scope |
|---|---|
| scripts/learning-official-tests/pilot-release.ts, run-release.mjs | Developer-only accepted-byte RC/lock/whole-tree rollback driver; not app/IPC/runtime |
| scripts/smoke-learning-pilot-promotion.mjs | Secure production Electron/Monaco/native public C#/JS Divide smoke with isolated userData |
| tests/main/official-test-pilot-promotion.test.ts | Complete release transaction/baseline/rollback/lock tests |
| tests/main/official-test-promoted-registry.test.ts | Actual nine full packages, accepted data/copies/representations/accounting/BUSY/cancellation/shutdown |
| tests/main/official-test-promoted-integrity.test.ts | Actual mixed release mutated copies: private reader/build fail-closed, stale anchors/hash/version/signature |
| resources/learning/exercises/{nine pilot IDs}/judge/v1.json | Main-private exact accepted Judge bytes; corresponding metadata/pkg2; manifest release3 |

[S5 report](PHASE-9E2-S5-PILOT-PACKAGE-PROMOTION.md): S5 formally COMPLETE — PASS WITH LIMITATIONS. Wave A delivery is recorded above; B–D/S7 remain NOT_STARTED. No app Registry/Runtime module added.


## Phase 9E-2 E2-S3 actual staged candidates — 2026-10-24

User authorized S3 only after accepting S2. [S3 evidence](PHASE-9E2-S3-PILOT-CANDIDATE-EVIDENCE.md)
COMPLETE — PASS WITH LIMITATIONS. [S4 review](PHASE-9E2-PILOT-ACCEPTANCE.md)
COMPLETE — ACCEPT WITH LIMITATIONS; S5 COMPLETE — PASS WITH LIMITATIONS; S6 Wave A delivered/pending user acceptance; B–D/S7 NOT_STARTED.

| Actual path(s) | Owner / behavior |
|---|---|
| `scripts/learning-official-tests/pilot-coverage.ts`, `pilot-mutants.ts` | Developer-only90 fine-grained facets/49 fact-derived groups, retained S2 catalogue plus three critical adjacency/greedy models and18 broader conditional models |
| `scripts/learning-official-tests/pilot-freeze.ts` | Verified pool/Expected, deterministic coverage/kill compactor, mandatory public prefix, stable hidden IDs, exact Judge bytes and per-case proof |
| `scripts/learning-official-tests/pilot-staging.ts`, `run-stage.mjs` | Fresh ignored trees; mixed9 full/54 unchanged public-only; shared validators/reader/Registry registered clone/representation/shutdown; readback verification and byte-identity comparison |
| `scripts/learning-official-tests/references/Pilot.csproj` | Narrow developer build-input allowlist, driver+nine solution files; excludes incidental obj/Debug sources without changing reference algorithms/Runtime |
| `tests/main/official-test-pilot-staging.integration.test.ts` |27 S3 integration controls, real SDK/Node/oracle/repro/schema/integrity/private HTTP/quarantine/whole-asset nodes/resident accounting |
| `out/official-tests/e2-s3-*/` and `e2-s3-evidence-*/` | Ignored candidate trees/proofs/test-only anchors and reproducibility evidence; not app runtime trust roots or release assets |

At S3 delivery no production resources/Runtime/contracts changed. S4 was later
accepted; the separately authorized S5 now promotes exact pilot data as recorded
above. No Judge/Submit/Comparator/Accepted Storage or remaining54 sets.

## Phase 9E-2 E2-S2 actual developer tooling — 2026-10-24

COMPLETE — PASS WITH LIMITATIONS, user accepted116 PASS/1 SKIP and nine pairs/
oracles/private controls; two performance models remain PENDING_RUNTIME.
S3 subsequently closed and S4 accepted as above; S5 COMPLETE — PASS WITH LIMITATIONS; S6 Wave A delivered/pending user acceptance; B–D/S7 NOT_STARTED. [Evidence](PHASE-9E2-S2-TOOLING-REFERENCES.md).
Developer source is independent of production module/IPC/resource ownership.

| Actual path(s) | Owner / purpose |
|---|---|
| `scripts/learning-official-tests/{model,author,domains,oracles,mutants,verify}.ts` | Developer-only nine-ID typing/shared parser reuse, versioned bounded exploratory inputs, S1 domains, independent checks, mutation mapping and fail-closed verification; no frozen sets or promotion |
| `scripts/learning-official-tests/{process,references}.ts` | Fixed developer child lifecycles, single-flight/close-drain, offline SDK build, stream/heap/scratch limits and source fingerprints; not Runtime9D |
| `scripts/learning-official-tests/{run,reference-child}.mjs`, `README.md` | Fixed CLI/in-memory tool bundle and Node dispatch; safe developer usage |
| `scripts/learning-official-tests/references/{Pilot.csproj,Program.cs,NuGet.Config}` | BCL-only checked net10.0 driver with package sources cleared; build intermediates only under ignored owned out/official-tests/refs-* |
| `scripts/learning-official-tests/references/<id>/{Solution.cs,solution.js}` | Exactly nine pairs: ch2-04, ch3-04, ch4-09, ch5-03, ch5-07, ch7-01, ch7-05, ch8-01, ch8-08; independently authored from accepted S1, no released references |
| `tests/main/official-test-{authoring,lifecycle-private}.test.ts`, `official-test-references.integration.test.ts` | Scoped deterministic/domain/quarantine/mutation/private HTTP/bundle/lifecycle tests plus real offline C#/JS/oracle agreement |
| `src/main/services/learning/content/exercise-package-build.ts` | Existing approved build owner; narrow E2-D2 private dev-server/import/emitted-path guards, preserving resource emission/integrity |
| `out/official-tests/` | Ignored developer summary evidence; no release inclusion; exact owned temporary refs-* directories removed after settled processes |

No Runtime/Judge/Submit/Comparator module, Official package asset, public IPC or
schema is added. Existing catalogue, samples, L1–L12 and ownership remain intact.

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

Status: `IN_PROGRESS` overall. 9A–9C are COMPLETE; 9D Common, 9D.1, 9D.2
(Steps 1–6) and overall 9D are **COMPLETE — PASS WITH LIMITATIONS**, final user
acceptance 2026-10-23. A01/A02/A03 FIXED — PASS. 9E–9G remain NOT_STARTED.
[Accepted 9D final review](PHASE-9D-FINAL-REVIEW.md) indexes actual artifacts,
missing historical reports and preserved FAILs. Windows 10/UNC/packaging and
remaining named coverage limits stay UNVERIFIED; C# ~7–8s optimization is after
Phase 9, Accepted Restore/Judge/Submit await 9E, and full lint retains its 1,106
historical errors. No future feature or compatibility gate is completed here.

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
| Exercise catalogue and drafts (9C migrated by9E-1 Step4) | `resources/learning/exercises/manifest.json` and63 explicit-ID public package directories; `src/main/services/learning/practice-store.ts`, `src/shared/contracts/practice.ts`; test-only baseline `tests/fixtures/learning/legacy-exercises.json` | Production4-asset schema/policy2 public-only packages, no Judge sets; stable IDs/starters/samples preserved except approved ProductExceptSelf correction. Draft schema1/keys preserved; exercises.ts is only an empty frozen internal-adapter compatibility default, no embedded catalogue |
| Narrow Practice bridge (actual9E-1 Step4, COMPLETE — PASS WITH LIMITATIONS) | `src/main/ipc/practice-ipc-service.ts`, `src/preload/bridge/practice.ts` | Authenticated bounded pages/detail/version-guarded draft chunks, capped legacy load/save and owned close/resume handshake; no execution/path API or hidden metadata |
| Exercise resources/integrity/build (actual9E-1 Step2; accepted COMPLETE — PASS WITH LIMITATIONS) | `src/main/services/learning/content/exercise-package-resources.ts`, `exercise-package-resources-runtime.ts`, `exercise-package-build.ts`, `exercise-package-anchor.d.ts`; resources/learning/exercises/manifest.json; electron.vite.config.ts; tests/main/exercise-package-resources.test.ts | Approved S2-R1–R4 roots, identity/hash/schema reader, compiled anchor and Main-only emission/empty bootstrap; Renderer dev-server denial. Historical Step2 evidence preserved. Step3 adds accounting callbacks through this same reader, no second integrity path |
| Lazy registry/resident ownership (actual9E-1 Step3; accepted COMPLETE - PASS WITH LIMITATIONS) | `src/main/services/learning/content/exercise-package-registry.ts`, `exercise-package-budget.ts`; Main composition `src/main/index.ts`; tests/main/exercise-package-registry.test.ts and exercise-package-budget.test.ts | APPROVED S3-D1–D4: exact scanner/reader pre-allocation reservations, one slot/flight/owner lease, BUSY/eviction/retry/copies; scoped readiness, nonblocking manifest start and retained shutdown. No current Run/IPC/catalogue migration. Evidence: docs/PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md |
| Package contracts/validation (actual9E-1 Step1; user accepted COMPLETE) | `src/shared/contracts/exercise-package.ts`; Main-only `src/main/services/learning/content/exercise-package-contracts.ts`, `exercise-package-policy.ts`, `bounded-package-json.ts`, `exercise-package-validation.ts`; tests/main/bounded-package-json.test.ts and exercise-package-validation.test.ts | Additive public/private types, approved L1–L12 policy, strict pre-parse byte/UTF-8/structure checks and exact schema/typed/linkage/declared-manifest validation. No resource resolver, actual hash verification, registry, IPC/migration, Judge or Runtime changes. Evidence: docs/PHASE-9E1-STEP1-CONTRACTS-VALIDATION.md |
| Public migration/Run binding (actual9E-1 Step4, COMPLETE — PASS WITH LIMITATIONS) | `src/main/services/learning/content/public-exercise-projection.ts`, `src/main/services/learning/package-run-binding.ts`; existing contracts/validator/reader/build/Registry, ExerciseService/Main composition and Learning UI; tests/main/exercise-package-migration.test.ts | APPROVED S4-D1/D2 extend the accepted Steps1–3 foundation with public-only profiles/public ownership, accounted detached summaries and owned-Prepare sample plans delegated to unchanged9D adapters. Full5-asset profile remains fail-closed. Steps1–3 rows above record their historical scoped evidence; current Step4 evidence in docs/PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md |
| Package foundation acceptance (actual9E-1 Step5; COMPLETE — PASS WITH LIMITATIONS (Current Host Only)) | `scripts/measure-learning-package-foundation.mjs`, `scripts/measure-learning-package-electron-smoke.mjs`, `tests/fixtures/learning/package-foundation-measurement.ts`, `tests/main/exercise-package-foundation-acceptance.test.ts` | User scope amendment S5-AC1 accepted2026-10-24: existing S5-F1/O1 and passing foundation evidence,244 package PASS/1 SKIP plus444 separate regression; historical FAIL preserved. Both loader target hosts UNVERIFIED, mandatory before9E-7 acceptance/release certification. See acceptance report Section15; full matrix/installed/security limitations retained. Phase9E-1 COMPLETE — PASS WITH LIMITATIONS under9E1-AC1;9E-2 NOT_STARTED, not authorized |
| S5-F1 cooperative correction (actual; accepted scoped current-host result) | `src/main/services/learning/content/exercise-package-work.ts`; existing bounded JSON/validation/resources/Registry modules; private Main composition/Practice IPC/package-run-binding callers; `tests/main/exercise-package-cooperative.test.ts`; `scripts/measure-learning-package-correction.mjs` | APPROVED S5-P2 A/B2/C: one resumable kernel, private bounded scheduling/freeze, controlled async representations/copies/packets, same anchored reader/ledger/leases. Historical fixtures/workload preserved; available-host plain stall p95/max PASS, required hosts UNVERIFIED. F1/O1 evidence accepted in Step5 Current Host Only closure; docs/PHASE-9E1-S5-F1-CORRECTION.md remains original correction evidence. Phase9E-1 COMPLETE — PASS WITH LIMITATIONS by9E1-AC1 |
| Isolated Exercise runtime prototype (9D.0 only) | `spikes/exercise-runtime-9d0/` | Developer-only harness, local SDK/Node and selective argv/Job primitive port; no production service/IPC/UI or shared native/process edits; evidence in REPORT.md |
| Semantic Learning contracts (actual 9B) | `src/shared/contracts/learning.ts` | Side-effect-free course/material DTOs and response validation; 9C exercise contracts live in practice.ts; quiz contracts deferred |
| Narrow Learning bridge (actual 9B) | `src/preload/bridge/learning.ts`, `src/main/ipc/learning-ipc-service.ts` | Read-only getCourse; exact empty request validation and Main frame authorization; no path/command input |
| Exercise coordination (actual step 4) | `src/main/services/learning/exercise-service.ts`; additive wiring in `src/main/index.ts` | Main global admission, identities/generation, owner invalidation, tracked startup recovery, Policy B cleanup/shutdown barrier; lazy independent native/lease factory, no language driver or renderer API; tests/main/exercise-service.test.ts |
| Exercise IPC/Preload (actual step 5) | `src/main/ipc/exercise-ipc-service.ts`, `src/preload/bridge/exercise.ts`; Learning API/bridge and additive Main wiring | Exact semantic requests, registered sender/main-frame/document-epoch authority, session/generation/sequence filtering, sanitized errors, bounded output validation and unload-safe subscriptions; tests/main/exercise-ipc.test.ts, tests/preload/exercise-bridge.test.ts; scripts/smoke-exercise-ipc.mjs tests built production Main/Preload without language drivers |
| Exercise Common DTOs/policy (actual step 1) | `src/shared/contracts/exercise.ts`, `exercise-validation.ts`; exported by contracts/index.ts | Side-effect-free run/session/lifecycle/snapshot declarations, approved bounds and exact validators; tests/contracts/exercise-validation.test.ts; no IPC/Main/native/UI wiring |
| Learning Runtime Core (actual step 2; native port added step 3) | `src/main/services/learning/runtime/exercise-session.ts`, `exercise-workspace.ts`, `exercise-checkpoint.ts`, `exercise-recovery.ts`, `exercise-limits.ts`, `exercise-runtime-adapter.ts` | Policy B state machine, monotonic deadlines, retained/deduplicated cleanup, scoped filesystem checkpoints/recovery, adapter and exclusive-lease ports; tests/main/exercise-session.test.ts and exercise-workspace.test.ts; managed by ExerciseService since step 4 |
| Learning Windows Job/lease implementation (actual step 3) | `src/main/services/learning/runtime/native/learning-job.cpp`, `windows-exercise-native.ts`, `windows-exercise-adapter.ts`, `windows-exercise-lease.ts`; `scripts/build-learning-native.mjs` and additive hook in `electron.vite.config.ts` | Independent suspended Job-list launch, hard aggregate quota read-back, identity handles, bounded nonblocking pipe/Job polling, staged release, OS-exclusive leases; artifact `out/main/native/learning/learning-job.node`; independent factory composed in step 4, no Project native/process changes |
| Native Learning tests (actual step 3) | `tests/main/windows-exercise-adapter.test.ts`, `windows-exercise-native.integration.test.ts`; `tests/fixtures/learning/` | Mock error mapping/stage tests plus real Windows Job/handles/quota/lease tests; bounded allocator built only with `--test-fixtures`; development evidence under `out/learning-native-step3/` |
| Common live acceptance (actual step 7; test-only) | `scripts/run-exercise-common-acceptance.mjs`; `tests/fixtures/learning/common-acceptance.ts`; `docs/PHASE-9D-FINAL-REVIEW.md` | Fixed-driver Electron/IPC/Preload/Job/Project/PTY composition, 14 scoped checks and real-clock 60s/12s evidence; not a replacement language adapter. Common and overall 9D accepted COMPLETE — PASS WITH LIMITATIONS after real C#/JS integration and A01/A02/A03 closure; Windows 10/UNC/9G and named limits retained. Original step-7 report reference is missing; actual artifacts are indexed in the final review |
| C#/JavaScript harness adapters | `src/main/services/learning/runtime/` | Main, 9D; actual modules listed below. Both adapters and Common accepted COMPLETE — PASS WITH LIMITATIONS; JavaScript Steps 1–6 complete, production factory/IPC/UI verified. See PHASE-9D-FINAL-REVIEW.md and PHASE-9D2-JAVASCRIPT-PLAN.md |
| JavaScript execution contracts (actual 9D.2 Step 1) | `src/shared/contracts/javascript-execution.ts`, `javascript-execution-validation.ts`; `src/main/services/learning/runtime/javascript-execution-contracts.ts`; shared index exports; `tests/contracts/javascript-execution.test.ts` | Standalone DTO/schema/strict JSON + UTF-8/Unicode + duplicate/depth/size validators, failure mappings, Main-only type ports; 308 targeted JS/Common/C# tests PASS; no runtime/IPC integration. Specification: PHASE-9D2-JAVASCRIPT-CONTRACTS.md; COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22, pre-existing lint limitation accepted |
| JavaScript Node resolution/probe (actual 9D.2 Step 2) | `src/main/services/learning/runtime/javascript-node-files.ts`, `javascript-node-resolver.ts`, `javascript-node-probe.ts`; narrow edits in `exercise-session.ts`, `windows-exercise-adapter.ts` | Main-only PATH-first stable 24.x, PE/file/alias identity + revalidation, fixed owned Prepare probe/512 MiB, raw accounting and retained cleanup; no native/Policy B/C# contract changes. Tests: `tests/main/javascript-node-{resolver,probe}.test.ts`, `javascript-node-probe.integration.test.ts`; `tests/fixtures/learning/javascript-node-files.ts`; Core test additions. PHASE-9D2-NODE-RESOLVER-PROBE.md |
| JavaScript harness/syntax (actual 9D.2 Step 3) | `src/main/services/learning/runtime/javascript-harness.ts`, `javascript-harness-child.mjs`, `raw-harness.d.ts`, `javascript-harness-workspace.ts`, `javascript-syntax.ts`, `javascript-single-sample.ts` | Fixed raw child asset, exclusive identity/hash-verified source/harness, parse-only syntax and Main-internal sample index 0 only. Tests: `tests/main/javascript-{harness,syntax,single-sample}.test.ts`, `javascript-harness.integration.test.ts`; 259 targeted tests PASS / 172 real Jobs. PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md; no multi-case or factory/IPC/UI wiring |
| JavaScript multi-case execution (actual 9D.2 Step 4) | `src/main/services/learning/runtime/javascript-execution-adapter.ts`, `javascript-orchestrator.ts`; `tests/main/javascript-execution-adapter.test.ts`, `javascript-multicase.integration.test.ts` | Prepare/Syntax once, sequential fresh Jobs, VERIFIED barriers, ordered actuals/fail-fast exact suffix and Core-owned retained cleanup. 160 targeted tests PASS, 16 JS native operations / 57 Jobs VERIFIED/closed, selected real C# multi-case PASS; COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23. PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md; no factory/IPC/UI wiring |
| JavaScript response integration (actual 9D.2 Step 5, COMPLETE — PASS WITH LIMITATIONS) | `src/shared/contracts/exercise{,-validation}.ts`; `src/main/services/learning/exercise-service.ts`; `src/main/ipc/exercise-ipc-service.ts`; `src/preload/bridge/exercise.ts`; `src/renderer/src/features/learning/practice/{use-exercise-runtime.ts,PracticeTestPanel.tsx}`; `scripts/smoke-learning-javascript-ui.mjs` | Production JS factory, independent bounded observation, context/revision/ordering guards and existing Result Panel tabs. 172 distinct targeted tests PASS; real Electron smoke 3 operations/9 Jobs VERIFIED and released/closed. COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23; PHASE-9D2-JAVASCRIPT-UI-IPC.md |
| JavaScript acceptance (actual 9D.2 Step 6, COMPLETE — PASS WITH LIMITATIONS) | `scripts/accept-learning-javascript-run.mjs`, `scripts/investigate-javascript-worker-step6.mjs`, `scripts/verify-monaco-diagnostics-a02.mjs`; `docs/PHASE-9D2-JAVASCRIPT-ACCEPTANCE.md` | Accepted production Electron/native/lifecycle/isolation and Monaco evidence. A01/A02 FIXED — PASS; initial FAIL evidence retained. Independent 907 PASS/11 SKIP targeted merge, A01 32 PASS and A02 23 PASS; not a full-suite sum. Windows 10/UNC/9G and all named limits remain unverified |
| C# Prepare-timeout correction / whole-9D closure | `src/main/services/learning/runtime/csharp-execution-adapter.ts`; `tests/main/csharp-execution-adapter.test.ts`; `scripts/accept-csharp-prepare-timeout-a03.mjs`; `docs/PHASE-9D-FINAL-REVIEW.md` | A03 FIXED — PASS: trusted Core PREPARE_TIMEOUT maps to TIMEOUT/prepare, lifecycle invalidation remains suppressed; 88 targeted PASS and real Resolver/Electron reproduction PASS. User accepted Common/overall 9D COMPLETE — PASS WITH LIMITATIONS; 9E remains NOT_STARTED |
| C# execution contracts (actual 9D.1 Step 1) | `src/shared/contracts/csharp-execution.ts`, `csharp-execution-validation.ts`; `src/main/services/learning/runtime/csharp-execution-contracts.ts`; `tests/contracts/csharp-execution.test.ts` | Standalone bounded sample-only DTOs, JSON harness protocol, failure/diagnostic validators and Main-only resolver/compiler/adapter declarations; no runtime/native/IPC/UI implementation. Specification: `docs/PHASE-9D1-CSHARP-CONTRACTS.md` |
| C# SDK discovery (actual 9D.1 Step 2) | `src/main/services/learning/runtime/csharp-sdk-resolver.ts`; `tests/main/csharp-sdk-resolver.test.ts`; `docs/PHASE-9D1-SDK-RESOLVER.md` | Filesystem-only numeric stable 10.x selection, contained PE/CLR and manifest validation, harness reference closure, safe failures and frozen selection. Controlled synthetic installations and separate actual installed-filesystem observation; no compiler process, Project resolver, composition or public path capability |
| C# SDK bounded-concurrency prototype (test-only; NOT PASS for production promotion) | `scripts/sdk-concurrency-prototype-source.mjs`, `scripts/profile-sdk-concurrency-prototype.mjs`; `tests/fixtures/learning/sdk-concurrency-{pool,loader}.ts`; `tests/main/csharp-sdk-concurrency-prototype.test.ts` | Generated current-kernel copy, experimental4 tasks/64MiB, in-memory Electron injection only. Same checks/faster measured discovery, but reproduced cross-file temporal freshness mismatch; do not import into production. R1 diagnostics accepted COMPLETE — DIAGNOSTICS ONLY; prototype review in docs/PHASE-9E1-S5-R1-BOUNDED-CONCURRENCY-PROTOTYPE.md; Phase9E-1 COMPLETE — PASS WITH LIMITATIONS; prototype NOT PASS — excluded from production;9E-2 NOT_STARTED |
| Learning process results (actual 9D.1 compiler unblock) | `src/main/services/learning/runtime/exercise-runtime-adapter.ts`, `windows-exercise-adapter.ts`; adapter/native integration tests; `docs/PHASE-9D1-PROCESS-RESULT-PORT.md` | Main-only nonzero OS exit observation, conservative process/stream settlement and typed failures/Job-limit evidence. Existing Common runPhase behavior and Policy B remain; no output buffer, native stdin, public API or compiler implementation |
| C# compile pipeline (actual 9D.1 Step 3) | `src/main/services/learning/runtime/csharp-harness.ts`, `csharp-compiler.ts`, `csharp-diagnostics.ts`, `csharp-compile-workspace.ts`; exact-selection helper in csharp-sdk-resolver.ts; tests/main/csharp-{harness,compiler,compiler.integration}.test.ts | Fixed typed harness, direct local Roslyn in Learning Job, contained exclusive files, safe bounded diagnostics and Core raw-byte accounting before redaction. Real compile/error/cancellation evidence in docs/PHASE-9D1-CSHARP-COMPILER.md; no native stdin/sample execution or public wiring |
| Local Judge | `src/main/services/learning/judge-service.ts` | Main, 9E; public/hidden tests, 100% Accepted, distinct internal error |
| Learning submission storage/transport (actual S3–S6) | `src/main/services/learning/learning-store.ts`, `storage/snapshot-transaction.ts`, `storage/submission-read-model.ts`, `submission-projection.ts`, `exercise-service.ts`/`official-case-plan.ts`/`src/main/index.ts`; public contracts and preload bridge above | Main one-target retained commit/recovery/committed reads and same-operation Submit, safe transport accepted COMPLETE — PASS WITH LIMITATIONS; E6 UI/Restore and9F extended progress separate; existing 9C drafts use practice-store.ts |
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


## E2-S3 closure / E2-S4 review — 2026-10-24

Historical S4 review-delivery state below; superseded by the later user acceptance/S5 entry.

User authorized S3 closure subject to evidence verification and S4 review only.
E2-S3 COMPLETE — PASS WITH LIMITATIONS; E2-S4 REVIEW COMPLETED — AWAITING USER ACCEPTANCE; E2-S5–S7 NOT_STARTED. Phase9E-2 remains IN_PROGRESS.
[Independent pilot review](PHASE-9E2-PILOT-ACCEPTANCE.md) recommends **ACCEPT WITH LIMITATIONS** for the exact nine staging datasets/process only; this is not user acceptance. Fresh read-only audit confirms73 cases (18 public/55 hidden),274 deterministic files,49 groups/90 facets,44 correctness/domain and18 broader model kills, Registry clone/representation budgets and zero shutdown. Historical109 targeted PASS and accepted S2 116 PASS/1 SKIP remain unchanged. Two performance mutants PENDING_RUNTIME and all actual Official Runtime60s UNVERIFIED, especially Reshape13-case overhead. Twelve private URL probes returned403;378 existing bundle files scanned without a private marker leak. No new sets, candidate edits, production changes/promotion or application tests/build/profiling. No authorization for S5 or remaining54 exercises. All inherited Runtime/security/release limitations remain.


## E2-S4 accepted / E2-S5 promotion delivered — 2026-10-24

Historical S5 delivery state below; superseded by formal S5 acceptance/Wave A entry.

The user formally accepts E2-S4 COMPLETE — ACCEPT WITH LIMITATIONS for the exact nine datasets/process, then separately authorizes E2-S5 promotion. S4 COMPLETE — ACCEPT WITH LIMITATIONS; S5 IN_PROGRESS — implementation/verification delivered, awaiting user acceptance; S6–S7 NOT_STARTED. Phase9E-2 remains IN_PROGRESS;9E-3 NOT_STARTED.

[S5 delivery](PHASE-9E2-S5-PILOT-PACKAGE-PROMOTION.md): exact accepted73 cases (18 public/55 hidden) promoted as9 full +54 unchanged public-only packages; manifest release3, pilot packageVersion2. Normal build generated the matching compiled anchor. All63 public semantics and189 sample/starter files unchanged;262 emitted resource files verified. Unique targeted results376 PASS/1 SKIP; typecheck/targeted lint/build PASS; real promoted Divide C#/JS public Run and Monaco/draft smokes PASS. No new production TS/Runtime/IPC/schema/security policy changes. Historical44/44 correctness and18/18 broader kills retained; two performance models PENDING_RUNTIME and actual Official Runtime60s UNVERIFIED, especially Reshape. Inherited9E1-AC1/S5-AC1/host/filesystem/installed/reliability gates and SDK prototype NOT PASS remain unchanged. No S6/S7, remaining54 authoring, Judge/Submit or Phase closure; stop for S5 user acceptance.


## E2-S5 accepted / E2-S6 Wave A delivered — 2026-10-25

E2-S5 **COMPLETE — PASS WITH LIMITATIONS**, user formally accepted; release3/pilot73/376 unique PASS+1 SKIP and timeout/isolated6 PASS history preserved. User authorized **Wave A only**. [Wave A report](PHASE-9E2-S6-WAVE-A-ACCEPTANCE.md):24 sets/185 cases (48 public/137 hidden),280 obligations,72/72 critical correctness and48/48 broader models detected; new PrimeCount performance model PENDING_RUNTIME alongside two inherited pending models. Two final clean roots312 files byte-identical;33 full+30 public-only/63 exercises, manifest release4 SHA dab51425d8f0e3cdc8ced4cec32e6bba8048d376a9669203111a8629138d2482; normal build/actual compiled opener match. All public samples/starters/signatures and nine pilot packages unchanged. Final targeted515 unique PASS/1 SKIP after recorded fixture failures; typecheck/targeted lint/build, C#/JS Sum and Monaco/draft smokes PASS. Two developer reference method corrections were reverified on all185 frozen cases with new source lineage and no data change.

E2-S6 Wave A **IN_PROGRESS — delivered PASS WITH LIMITATIONS, awaiting user acceptance**; Waves B–D NOT_STARTED; E2-S7/9E-3 NOT_STARTED. Phase9E-2 IN_PROGRESS. Official60s/release matrix UNVERIFIED, including high-count DigitCount21/NextDate17; original9E1-AC1/S5-AC1/platform/installed/reliability limitations retained; SDK prototype NOT PASS/excluded. No new contract/semantic decision, Runtime/security/deadline/ceiling change, Judge/Submit/Comparator/Accepted Storage or next-wave authorization. Stop.


## Wave A accepted / Wave B authorized — 2026-10-25

The user formally accepts **E2-S6 Wave A COMPLETE — PASS WITH LIMITATIONS**.
Fresh [preflight](../out/official-tests/wave-b-preflight.json) confirms release4,
286 source/frozen/emitted resources,33 full/30 public-only,185 Wave A cases,
73 unchanged pilot cases,280 obligations,72 critical and48 broader kills.
Compiled anchor matches in the runtime chunk.515 PASS/1 SKIP and the accepted
Run/Monaco/draft/quality results remain historical evidence, not fresh test runs.
Three performance models remain PENDING_RUNTIME; Official60s UNVERIFIED,
including DigitCount21/NextDate17. All historical failures/limitations retained.
Only Wave B16 is authorized and begins IN_PROGRESS. Waves C/D, S7 and9E-3
remain NOT_STARTED. No Runtime/security/ceiling/deadline change or Git publication.


## E2-S6 Wave B delivery — 2026-10-25

Wave A **COMPLETE — PASS WITH LIMITATIONS**, user accepted. Wave B **IN_PROGRESS —
delivered PASS WITH LIMITATIONS, awaiting user acceptance**.
[Wave B acceptance packet](PHASE-9E2-S6-WAVE-B-ACCEPTANCE.md):16 new sets/121 cases
(32 public/89 hidden),166 static obligations,48/48 critical correctness and32/32
broader kills;2 new DP performance models pending plus3 inherited pending.
Two clean roots320 files byte-identical; manifest release5 SHA
43c46cc6c361219f7dd2960e8575f4bf7ab6e0a1599f2839dace3809b89ea804, compiled opener
and302 resources match.49 full/14 public-only/63 total;33 prior full packages,
258 prior cases and189 public sample/starter files unchanged.562 unique targeted
PASS/1 SKIP; initial transaction timeout and isolated4 PASS, initial build exit1
and isolated build PASS, all invocation/audit/lint history retained. Typecheck/
targeted lint/build/Power C#-JS/Monaco-drafts-workspace PASS. .gitattributes reviewed,
unchanged; raw-byte integrity preserved. Official60s/release/platform/reliability
limitations remain UNVERIFIED; SDK prototype NOT PASS/excluded. No new semantic/
architecture decision or Runtime/security/deadline/ceiling change. Phase9E-2/E2-S6
remain IN_PROGRESS; Waves C/D, S7 and9E-3 NOT_STARTED. Stop for user acceptance;
no commit/push/merge or next-wave authorization.

### Wave B actual developer/data/test paths

- scripts/learning-official-tests/wave-b-spec.ts:16 domains, facets, oracle proofs, curated/seeded inputs and finite mutants.
- wave-b-staging.ts /run-wave-b.mjs /wave-b-child.mjs in that directory: bounded authoring/readback/freeze/two-root receipts and existing transaction promotion.
- references/WaveB.csproj, WaveBProgram.cs and16 ID/{Solution.cs,solution.js} pairs: developer-only checked C#/JS inputs.
- `tests/main/official-test-wave-b.test.ts`, `official-test-wave-b-release.test.ts`, `official-test-wave-b-integrity.test.ts`: focused domain/coverage/quarantine, production/data/Registry and fail-closed tests.
- `resources/learning/exercises/<16 Wave B IDs>/judge/v1.json`, corresponding `exercise.json` and root `manifest.json`: actual promoted full-profile data.
- docs/PHASE-9E2-S6-WAVE-B-ACCEPTANCE.md: per-ID/current63 inventory and evidence/limitations.

No production Registry/parser/cache/lifecycle/Runtime module was created.


## Wave B accepted / Wave C authorized — 2026-10-25

The user formally accepts **Wave B COMPLETE — PASS WITH LIMITATIONS**.
[Fresh preflight](../out/official-tests/wave-c-baseline.json) confirms release5,
302 source/frozen/emitted resources,49 full/14 public-only,16 new sets/121 cases
(32 public/89 hidden),166 obligations,48 critical and32 broader kills, historical
562 unique PASS/1 SKIP and accepted smokes. Existing quality results are historical,
not new runs. All failures, SKIP, LF/CRLF/.gitattributes issues and5 performance
models PENDING_RUNTIME/Official60s UNVERIFIED remain. Exactly7 Wave C IDs are now
authorized/IN_PROGRESS; Wave D, S7 and9E-3 NOT_STARTED. No other scope authorized.


## E2-S6 Wave C delivery — 2026-10-25

Wave B **COMPLETE — PASS WITH LIMITATIONS**, formally accepted; release5/121 cases/562 unique PASS+1 SKIP and all failures/limitations retained. [Wave C packet](PHASE-9E2-S6-WAVE-C-ACCEPTANCE.md): exactly7 chapter7 remainder sets/68 cases (14 public/54 hidden),107 static obligations,21/21 critical correctness and14/14 broader kills;5 new performance models plus5 inherited remain PENDING_RUNTIME. Two final clean roots318 files byte-identical; release6 SHA bf2d43d27d87cfe85f233de6e3c39f2fb96464a94047cd00a6fec282efd41d1e, compiled opener/309 resources match.56 full/7 public-only/63 total;49 prior full packages/379 accepted cases and189 sample/starter files unchanged.595 unique targeted PASS/1 SKIP; sandbox fork/CLI invocation failures retained. Typecheck/targeted lint/build,44 private URL probes/125 bundle files, MaxProfit C#/JS public Run7 Jobs and Monaco/drafts PASS. Raw LF/CRLF/.gitattributes unchanged. Official60s, especially three12-case sets, remains UNVERIFIED with inherited platform/reliability/release limitations. No semantic/architecture decision, Runtime/security/deadline/ceiling change or Git publication.

Wave C **IN_PROGRESS — delivered PASS WITH LIMITATIONS, awaiting user acceptance**. Phase9E-2/E2-S6 IN_PROGRESS; Wave D, E2-S7 and9E-3 NOT_STARTED. STOP.

Wave C actual developer paths: `scripts/learning-official-tests/wave-c-{spec,staging}.ts`, `run-wave-c.mjs`, `wave-c-child.mjs`, `references/WaveC{.csproj,Program.cs}`, seven chapter7 reference pairs; `tests/main/official-test-wave-c{,-release,-integrity}.test.ts`; seven promoted chapter7 `exercise.json`/`judge/v1.json` pairs and release6 manifest. No new production service.


## Wave C accepted / Wave D authorized — 2026-10-25

User formally accepts **Wave C COMPLETE — PASS WITH LIMITATIONS**. [Baseline receipt](../out/official-tests/wave-d-baseline.json) confirms release6/309 raw source-emitted assets,56 full/7 public-only,68 Wave C cases (14 public/54 hidden),107 obligations,21 critical correctness and14 broader kills;595 historical PASS/1 SKIP,10 performance models PENDING_RUNTIME and Official60s UNVERIFIED retained. No Wave C tests rerun. Exactly seven chapter8 remainder IDs are authorized; Wave D IN_PROGRESS. E2-S7/9E-3 NOT_STARTED. Verification scope is Official Test Sets only; no UI/Project/PTY/Monaco/draft/public Run smoke, full suite/full lint or profiling. All historical failures/limitations retained.


## E2-S6 Wave D delivery — 2026-10-25

Wave C **COMPLETE — PASS WITH LIMITATIONS**, user accepted;68 cases/107 obligations/21 critical+14 broader kills/595 historical PASS+1 SKIP retained without rerun. [Wave D acceptance packet](PHASE-9E2-S6-WAVE-D-ACCEPTANCE.md): exactly7 chapter8 remainder sets,57 cases (14 public/43 hidden),97/97 static obligations,21/21 critical correctness and14/14 broader kills;2 new performance models plus10 inherited remain PENDING_RUNTIME. Two clean roots325 files byte-identical; release7 SHA75ddbf0447e4708882c1e8e1f96e7cbebf97bf5aa170a14713e96755a9d3e081, compiled opener/source-frozen-emitted316 resources match.63 full/0 public-only/63 total;56 prior full packages/447 cases and189 sample/starter files unchanged.133 scoped tests PASS/0 FAIL,5 explicitly deselected outside-scope tests, inherited SKIP retained. Scoped tooling typecheck/targeted lint/normal anchor build/integrity/Registry/public projection/privacy PASS; no UI/Project/PTY/Monaco/drafts/public Run smoke or earlier-wave correctness rerun. Official60s/release certification UNVERIFIED;12 pending performance models, prior failures/platform/reliability/LF-CRLF limitations retained; .gitattributes unchanged. No semantic decision, architecture/Runtime/security/deadline/ceiling change or Git publishing.

Wave D **IN_PROGRESS — delivered PASS WITH LIMITATIONS, awaiting user acceptance**. Phase9E-2/E2-S6 IN_PROGRESS; E2-S7/9E-3 NOT_STARTED. STOP awaiting user review; no automatic next package.

Wave D actual paths: `scripts/learning-official-tests/wave-d-spec.ts`, `wave-d-staging.ts`, `run-wave-d.mjs`, `wave-d-child.mjs`; `references/WaveD.csproj`, `WaveDProgram.cs`, seven chapter8 reference pairs; `tests/main/official-test-wave-d.test.ts`, `official-test-wave-d-release.test.ts`, `official-test-wave-d-integrity.test.ts`; seven authorized chapter8 `exercise.json`/`judge/v1.json` pairs and release7 manifest. Existing release inventory fixtures updated; public-only compatibility test now uses synthetic public-only metadata. No new production service or framework.


## E2-S7 final review/handoff — 2026-10-25

User formally accepts **E2-S6 Wave D COMPLETE — PASS WITH LIMITATIONS**; all S6 waves are accepted. [Final acceptance packet](PHASE-9E2-FINAL-ACCEPTANCE.md) delivers the63-set typed inventory/full Judge+signature hashes, preserved domain/reference/oracle and witness/mutation lineage, resource/output-risk register,12 exact pending performance models, inherited failures/SKIP/release matrix and existing Main-private plan acceptance obligations for9E-3. Fresh read-only audit verifies manifest7/compiled root,63 full/0 public-only/504 cases (126 public/378 hidden),316 files/2179471 raw registry bytes,789 static witnesses/206 critical correctness+126 broader kills, accepted frozen origins/current source fingerprints and125 current bundle files without tested private leak. All12 runtime models remain PENDING_RUNTIME; Official60s/release certification UNVERIFIED. No production resources/source/contracts, Registry/parser/cache, Runtime/Judge/Submit/Comparator/Accepted Storage change; no tests/lint/build/profiling/app smokes rerun; no Git publication. Historical evidence/failures/limitations and .gitattributes unchanged.

**E2-S7: REVIEW COMPLETED — AWAITING USER ACCEPTANCE** (execution tracking IN_PROGRESS). **Phase9E-2: IN_PROGRESS — AWAITING FINAL ACCEPTANCE. Phase9E-3: NOT_STARTED. STOP** for final user decision; no automatic phase transition.

E2-S7 actual deliverable: `docs/PHASE-9E2-FINAL-ACCEPTANCE.md` — final data acceptance matrix,63 typed set/signature identities, performance/deferred register and9E-3 handoff specification only. Ignored private audit/index: `out/official-tests/e2-s7-final-audit.json`; read-only helper `e2-s7-audit.cjs` joins existing readers/frozen receipts without reference execution or new production module. Retain/transfer these private evidence artifacts outside app resources.


## Official Phase9E-2 closure /9E-3 planning authorization — 2026-10-25

The user formally accepts **Phase9E-2 COMPLETE — PASS WITH LIMITATIONS**, including E2-S7 final review/handoff. Accepted evidence is preserved:63 full-profile/0 public-only,504 cases (126 public/378 hidden),789/789 static obligations,206/206 critical correctness and126/126 broader models, manifest release7 SHA75ddbf0447e4708882c1e8e1f96e7cbebf97bf5aa170a14713e96755a9d3e081 and matching compiled anchor. All12 performance models remain PENDING_RUNTIME; Official60s/release certification UNVERIFIED. Historical FAILs/SKIP, source/line-ending limitations and9E1-AC1/S5-AC1 deferred platform/loader/reliability/installed gates remain unchanged. This closure uses accepted evidence; no tests/Runtime/build/profiling or resource regeneration/revalidation executed in this documentation task.

Only9E-3 source survey, design and implementation planning are now authorized. [Official Runtime design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md) and [implementation plan](PHASE-9E3-IMPLEMENTATION-PLAN.md) are **PROPOSED — NOT APPROVED**. **9E-3 NOT_STARTED — DESIGN PROPOSED**; E3-D1–D4 and every implementation step await user approval/explicit package authorization. No production code/resources, Judge/Submit/Comparator/Accepted Storage, deadlines/ceilings/ownership/security/Policy B or .gitattributes change, Git publication or automatic Step1 start. Later phase statuses unchanged. This dated record supersedes earlier pending9E-2 status statements; their evidence/history remains intact.

### 9E-3 planning artifacts / proposed paths

Actual documents: `docs/PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`, `docs/PHASE-9E3-IMPLEMENTATION-PLAN.md`. Source survey confirms existing Registry/private reader/Runtime9D/sample binding; no Official execution port exists yet. Proposed only (files not created): `src/main/services/learning/official-case-plan.ts`, `runtime/execution-plan.ts`, `runtime/official-execution-contracts.ts`, `runtime/execution-driver.ts`, `runtime/csharp-official-evidence.ts`, and neutral internal protocol-kernel extraction `src/shared/contracts/execution-json.ts`. New test/acceptance paths in the plan are likewise NOT_STARTED. Use existing owner modules; no new Registry/cache/native lifecycle/production Judge in9E-3.


## User approval / E3-S1 delivery — 2026-10-25

The user **APPROVES the Phase9E-3 design, six-step plan and E3-D1–D4**, and explicitly authorizes **E3-S1 only**. This dated record supersedes earlier proposal/authorization statements without deleting history. **Phase9E-2 COMPLETE — PASS WITH LIMITATIONS; Phase9E-3 IN_PROGRESS — E3-S1; E3-S2–S6 NOT_STARTED.** Architecture approval is not advance permission for later implementation.

| Decision | Approved selection | Scope restriction |
|---|---|---|
| E3-D1 — APPROVED | A: input-driven adapter reuse; future Main-only admission on the existing ExerciseService | Public Run unchanged; no S1 admission or Official execution wiring |
| E3-D2 — APPROVED | Leased plan and existing accounting; synchronous post-VERIFIED CONTINUE/STOP hook | S1 establishes contracts/controlled lifetime tests only; no production consumer hook |
| E3-D3 — APPROVED | Existing strict JSON kernel extraction; private C# evidence; public mapping and wire v1 unchanged | Native/private response mapping and execution await S2/S3 |
| E3-D4 — APPROVED | Six steps; eight-ID pilot in both languages, accepted before expansion to63 | Each later step needs its own authorization |

[S1 acceptance](PHASE-9E3-S1-PRIVATE-CONTRACTS-ACCEPTANCE.md): implementation delivered **PASS WITH LIMITATIONS — awaiting user acceptance**. Main-private leased identity/input contracts, pure signature/harness seams and existing strict JSON kernel extraction only. No adapter execution, service admission, Core/Registry/native lifecycle or public IPC/DTO change. Preserve all12 PENDING_RUNTIME models, Official60s UNVERIFIED, historical failures/SKIP and deferred9E1 gates. STOP before E3-S2; no commit/push/merge.

### E3-S1 actual paths and boundaries

- Actual: `src/main/services/learning/official-case-plan.ts` — trusted admitted-Prepare binding over the existing full Registry lease; frozen identity/comparator binding; Judge-only case alias; input-only execution descriptor; registered per-input representation; current Core-phase guards and owner-controlled VERIFIED release. No production caller.
- Actual: `src/main/services/learning/runtime/execution-plan.ts` — six-type readonly input/signature contract, independent Official count1–128 and index/arity/type checks. `src/main/services/learning/runtime/official-execution-contracts.ts` — private observations/completion and synchronous consumer type only.
- Actual extraction: `runtime/csharp-harness.ts` signature-only generator with legacy wrapper; `runtime/javascript-harness.ts` pure source/request helpers with legacy wrapper (relative to the Learning owner). `src/shared/contracts/execution-json.ts` is the existing strict protocol kernel used by JS validation, without a public barrel export.
- Actual tests: `tests/main/official-case-plan.test.ts`, `tests/contracts/official-execution-internal.test.ts`, `tests/contracts/execution-json.test.ts`. Acceptance document is linked above. `out/e3-s1/tsconfig.json` is ignored scoped verification scaffolding, not a production resource.
- Still planned/unimplemented: Official language ports/private parser mapping, execution-driver/consumer wiring, same-service Official admission, native pilot and full63 verification. Existing C#/JS prepared-execution contracts remain public-sample based; pure S1 helpers do not turn them into Official adapters.

## E3-S2 actual C# input/evidence port — 2026-10-25

User accepts E3-S1 COMPLETE — PASS WITH LIMITATIONS (333 historical PASS/0 SKIP)
and authorizes E3-S2 only. This current record supersedes the S1-only path status
above; its evidence/history is retained. [S2 review](PHASE-9E3-S2-CSHARP-OFFICIAL-RUNTIME-ACCEPTANCE.md)
is **PASS WITH LIMITATIONS — REVIEW COMPLETED, AWAITING USER ACCEPTANCE**.

| Actual path | Ownership/behavior |
|---|---|
| `src/main/services/learning/runtime/csharp-execution-adapter.ts` | Existing lifecycle shared by legacy Run constructor and Main-private Official input loader; indexed input, one compile, fresh case processes; private evidence, retained input borrow and original cleanup ports |
| `src/main/services/learning/runtime/csharp-execution-contracts.ts` | Input-only loader/preparation and private C# result ports; legacy prepared Exercise input remains compatible |
| `src/main/services/learning/runtime/csharp-compiler.ts` | Uses S1 signature-only harness generator; original Roslyn/workspace/runtime policy; raw bytes charged before diagnostic decoding |
| `src/main/services/learning/runtime/csharp-official-evidence.ts` | New Main-only strict-v1 parser/evidence mapper using the extracted JSON kernel; no public C# failure-union edit |
| `tests/main/csharp-official-evidence.test.ts`, `tests/main/csharp-official.integration.test.ts` | Private protocol controls and real compiled-anchor Registry/Roslyn/dotnet/Jobs proof over frozen Divide/LeapYear; affected adapter/compiler tests also updated |

182 unique targeted PASS/0 SKIP (173 controlled unit/contract +9 native), scoped
typecheck/lint/emission build and whitespace PASS. Ignored `out/e3-s2/` contains
scoped tooling, emitted verification bundle and private native receipts only.
S3 JavaScript port, S4 service admission/consumer wiring, S5 pilot and S6 full63
remain planned/unimplemented. No public Official API, Comparator or second Runtime.

## E3-S3 actual JavaScript input/evidence port — 2026-10-25

User accepts **S2 COMPLETE — PASS WITH LIMITATIONS** (182 historical unique
PASS/0 FAIL/0 SKIP;173 unit/contract +9 native), then authorizes S3 only.
[S3 report](PHASE-9E3-S3-JAVASCRIPT-OFFICIAL-RUNTIME-ACCEPTANCE.md) delivers **PASS
WITH LIMITATIONS — REVIEW COMPLETED, AWAITING USER ACCEPTANCE**. S2 source/tests/
report and its native coverage/performance/60s limitations remain unchanged.

| Actual path | Responsibility |
|---|---|
| `src/main/services/learning/runtime/javascript-execution-adapter.ts` | Existing public Run constructor delegates to the same input-driven implementation as the Main-private Official loader/result; one probe/syntax, fresh indexed cases, current guards and retained input borrow |
| `src/main/services/learning/runtime/javascript-execution-contracts.ts` | Input-only preparation, trusted loader and private evidence; legacy Exercise preparation remains supported |
| `src/main/services/learning/runtime/javascript-harness.ts` | Signature/count preparation using S1 pure seam; exact existing Source.json and unchanged fixed child/workspace identity behavior |
| `src/main/services/learning/runtime/javascript-syntax.ts` | Prepared-input type seam only; parse-only syntax behavior unchanged |
| `src/main/services/learning/runtime/javascript-official-evidence.ts` | New private strict JSON/typed/native evidence mapping, JS RETURNED exit0 / FAILED exit1 |
| `tests/main/javascript-official-evidence.test.ts`, `tests/main/javascript-official.integration.test.ts` | New protocol controls and real compiled-anchor Registry/Node24/Jobs/frozen-set/public Run proof; affected adapter/harness tests updated |

279 unique executed PASS (264 unit/contract +15 native);14 prior native PASS were
filtered out of the final one-test invocation. Scoped typecheck/lint/emission
build and whitespace PASS. Ignored `out/e3-s3/` owns verification config/bundle/
private native receipts only. No fixed child, public/shared contract, Core/native,
Node selection/probe, Registry, C#, service composition or frozen resource edit.
S4 same-service admission/consumer, S5 pilot and S6 full63 remain unimplemented.

## E3-S3 formal acceptance — 2026-10-25

User accepts **E3-S3 COMPLETE — PASS WITH LIMITATIONS**. The existing JS paths and
unchanged [S3 evidence](PHASE-9E3-S3-JAVASCRIPT-OFFICIAL-RUNTIME-ACCEPTANCE.md)
remain as delivered:279 unique PASS (264 unit/contract +15 native),14 final
filtered SKIPs previously PASS, scoped quality gates PASS, public Run compatibility,
VERIFIED barriers/final cleanup, zero Registry ledger and private-data boundaries.
Historical failures,12 PENDING_RUNTIME models, Official Runtime60s UNVERIFIED and
incomplete native/release coverage are retained. No code/path or old acceptance
evidence changed in this documentation closure. **Phase9E-3 IN_PROGRESS;
E3-S4–S6 NOT_STARTED. STOP; no next-step authorization.**

## E3-S4 actual admission/driver/hook paths — 2026-10-25

S1–S3 are user-accepted COMPLETE — PASS WITH LIMITATIONS; user authorizes **S4 only**.
[S4 report](PHASE-9E3-S4-DRIVER-HOOK-PRIVATE-ADMISSION-ACCEPTANCE.md): **PASS WITH
LIMITATIONS — REVIEW COMPLETED, AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS.

| Actual path | Owner / behavior |
|---|---|
| `src/main/services/learning/exercise-service.ts` | Common admission/active slot; internal RUN/OFFICIAL kind and Main-only operation capability; private completion, generation/recovery/shutdown and public route guards |
| `src/main/services/learning/official-case-plan.ts` | Same-Core binding, factory/full acquisition only in Prepare; current phase/owner and final content-release callback |
| `src/main/services/learning/runtime/execution-driver.ts` | Shared fixed-language stage/barrier loop; exact adapter claim, guarded synchronous CONTINUE/STOP and retained disposition |
| `runtime/csharp-orchestrator.ts`, `runtime/javascript-orchestrator.ts` (Learning owner) | Existing public Run wrappers over the shared loop; same result mapping/progress |
| `runtime/official-execution-contracts.ts`, `runtime/csharp-execution-adapter.ts`, `runtime/javascript-execution-adapter.ts` | Main-private capability/borrowed settled evidence, truthful cancellation prefix/suffix; owner-guarded/public getters remain protected |
| `tests/main/official-runtime-driver.test.ts`, `official-runtime-service.test.ts`, `official-runtime-service.integration.test.ts` | New hook/owner/Registry/IPC/retained cleanup controls plus real Windows C#/JS service entry/public Run parity; affected existing adapter/contract assertions updated |

221 unique PASS/0 SKIP (219 controlled +2 native), scoped typecheck/lint/composition
build/whitespace PASS. Ignored `out/e3-s4/` owns scoped tooling/bundle/private native
receipts only. No public Official/Submit API, extra service/Registry/lifecycle,
Core/native policy, frozen resource or Comparator/Verdict/storage change.
S5 eight-ID pilot and S6 full63×2 remain planned/unimplemented; performance/host/
release coverage remains pending as documented. **STOP for S4 user acceptance.**

## E3-S4 accepted closure / E3-S5 pilot review — 2026-10-25

The user formally accepts **E3-S4 COMPLETE — PASS WITH LIMITATIONS**. Its
[unchanged report](PHASE-9E3-S4-DRIVER-HOOK-PRIVATE-ADMISSION-ACCEPTANCE.md)
matches approved plan Section6:221 unique historical PASS/0 FAIL/0 SKIP
(219 controlled +2 native). No S4 test rerun or historical evidence rewrite.
All historical failures/native coverage limitations remain.

Only the exact eight-ID S5 pilot is now authorized. [S5 report](PHASE-9E3-S5-OFFICIAL-RUNTIME-PILOT-ACCEPTANCE.md)
delivers **PASS WITH LIMITATIONS — REVIEW COMPLETED, AWAITING USER ACCEPTANCE**,
tracking IN_PROGRESS:40 unique PASS/0 FAIL/0 SKIP (4 contracts +36 actual native
tests),16/16 full exercise/language pairs,162 returned Official cases,238 Jobs
including controlled failures and public Run regressions. Barriers/final cleanup
VERIFIED, final Registry ledgers zero; input-only/private publication boundaries
and public Run compatibility preserved. No production code correction, new
decision, architecture/policy/public-contract/frozen-resource change or Git
publication. Scoped typecheck/lint/test-fixture emission/receipt audit/diff checks
PASS. Prior reports and dirty work are preserved.

All12 performance models remain **PENDING_RUNTIME**; general Official Runtime60s,
other target hosts, installed/reliability/release certification and full63×2
remain **UNVERIFIED**. Pilot success does not discharge these obligations.
**Phase9E-3 IN_PROGRESS; E3-S1–S4 COMPLETE — PASS WITH LIMITATIONS;
E3-S5 REVIEW COMPLETED — AWAITING USER ACCEPTANCE (IN_PROGRESS);
E3-S6 NOT_STARTED. STOP; no S6 authorization.**


### S5 actual test-only paths

- `tests/main/official-runtime-pilot.test.ts`: fixed8-ID/16-source SHA,
  frozen identity/six-type input-only generation, controls and production exclusion.
- `tests/main/official-runtime-pilot.integration.test.ts`:16 complete native
  pairs,18 native fault/STOP/lifecycle controls and2 ordinary public Run regressions.
- `tests/fixtures/learning/official-runtime/{pilot-solutions.ts,pilot-pins.json,pilot-native.ts,README.md}`:
  pinned reference adaptations, actual Windows service/compiled Registry/native
  observer, ownership-preserving fixture cleanup and provenance. Test-only;
  no app imports/resources or alternate runtime. Ignored private receipts and
  summary live in `out/e3-s5/`.

## E3-S5 formal user acceptance / closure — 2026-10-25

The user formally accepts **E3-S5 COMPLETE — PASS WITH LIMITATIONS** based on
[the unchanged S5 report](PHASE-9E3-S5-OFFICIAL-RUNTIME-PILOT-ACCEPTANCE.md).
Preserved historical evidence:40 tests PASS/0 FAIL/0 SKIP (4 contract +36 native),
16/16 exercise/language pairs,162 Official cases,238 native Jobs, VERIFIED barriers
and final cleanup, Registry ledger zero, scoped public Run/Main-private isolation
and typecheck/lint/fixture-build/diff checks PASS; no production code change.

Historical failures and limitations remain unchanged. All12 performance models
remain **PENDING_RUNTIME**; general Official Runtime60s remains **UNVERIFIED**;
release certification and target-host verification remain incomplete. This is a
documentation-only acceptance closure: no tests/native integration/build/lint/
benchmarks rerun, no production/resources/fixtures/old acceptance evidence edited,
and no commit/push/merge. Earlier review records remain historical.

**E3-S5 COMPLETE — PASS WITH LIMITATIONS; E3-S6 NOT_STARTED;
Phase9E-3 IN_PROGRESS. STOP; no S6 or Phase9E-4 implementation authorized.**

## E3-S6 full catalogue review / Phase9E-3 final handoff — 2026-10-25

Only S6 is authorized after user-accepted S1–S5. [Final packet](PHASE-9E3-FINAL-ACCEPTANCE.md)
delivers **PASS WITH LIMITATIONS — E3-S6 REVIEW COMPLETED, AWAITING USER ACCEPTANCE**,
tracking IN_PROGRESS.126/126 complete exercise/language pairs PASS:110 new native
operations/846 cases +16 unchanged S5 operations/162 cases,1008 returned cases and
1197 full-set native Jobs. No pilot rerun, partial-prefix PASS, coverage reduction,
batching, policy waiver or production change. Barriers/final cleanup VERIFIED,
Registry ledgers zero, private input/public isolation and accepted Run parity kept.

New S6 verification:115 unique tests PASS after corrections (5 contract/audits
+110 native); preserve initial1 filesystem-test FAIL and3 final name-filtered
SKIPs already PASS earlier. No native failure/skip. Scoped typecheck/lint,
test-report build,126-row receipt audit,758-file boundary integrity, document and
diff checks PASS. New test tooling/type corrections and all older S1–S5 histories
remain documented; old acceptance reports/S5 receipts/frozen assets are unchanged.

All12 performance models remain **PENDING_RUNTIME**. Current-host63×2 correct-source
screen passes original budgets; general Official Runtime60s, target-host/release/
installed/reliability certification remain **UNVERIFIED**. No slow fixtures,
mutation campaign,20-warm+5-fresh matrix or9E-4/Submit/storage implementation.
No commit/push/merge. **Phase9E-3 IN_PROGRESS — AWAITING FINAL ACCEPTANCE;
E3-S6 REVIEW COMPLETED — AWAITING USER ACCEPTANCE;9E-4 NOT_STARTED. STOP.**


### S6 actual test-only paths

- `tests/main/official-runtime-catalogue.test.ts`: pins/identity/compiled assets,
 16-row pilot reuse, negative receipt checks and production exclusion.
- `tests/main/official-runtime-catalogue.integration.test.ts`:110 sequential new
 complete sets through the existing service/native runner; no pilot launches.
- `tests/fixtures/learning/official-runtime/catalogue-solutions.json`,
 `catalogue-pins.json`, `catalogue-evidence.ts`, `catalogue-report.ts`,
 `CATALOGUE.md`: fixed reference adaptations, test-only Main assertions,
 read-only126-row join and provenance. Existing `pilot-native.ts` gains only
 additive fixed-source/evidence-directory options, not a second runtime.
- `docs/PHASE-9E3-FINAL-ACCEPTANCE.md`: complete matrix, pending-model register,
 limitations and9E-4 consumer obligations; ignored receipts/matrix/tooling under
 `out/e3-s6/`, with original16 full receipts under `out/e3-s5/`.

## Phase9E-3 / E3-S6 formal user acceptance and closure — 2026-10-25

The user formally approves **E3-S6 and Phase9E-3 COMPLETE — PASS WITH LIMITATIONS**.
All six packages E3-S1–S6 are COMPLETE — PASS WITH LIMITATIONS, user accepted.
[Final accepted packet](PHASE-9E3-FINAL-ACCEPTANCE.md) preserves126/126 pairs PASS,
1008/1008 Official cases,110 new operations plus16 reused pilot operations,
1197 native Jobs and115 unique tests PASS after correction. Historical1 unit FAIL
and3 filtered SKIPs remain. Native barriers/final cleanup VERIFIED, Registry ledger
zero, scoped public Run compatibility/Main-private isolation and unchanged
production/frozen sets remain accepted evidence, without rerunning tests.

Ready handoff: Main-private Official Case Plan; C#/JavaScript Official Runtime;
same-service admission/shared driver; synchronous post-VERIFIED CONTINUE/STOP;
private actual/error observations; owner-bound completion/cleanup evidence;
frozen63 exercises/504 cases. Final report Section11 lists the remaining9E-4
responsibilities only: Generic Comparator, case/overall Verdict, Judge reduction,
fail-fast/failure classification and Accepted conditions from execution/cleanup
facts. No new Judge survey, design or implementation was performed or authorized.

All historical failures/SKIP/limitations and deferred9E-1/9E-2 gates remain.
All12 performance models stay **PENDING_RUNTIME**. General Official Runtime60s,
target-host, reliability and release certification stay **UNVERIFIED**; current-
host126-operation PASS is not release certification. Earlier pending-review
records, including the original design status, are superseded by this acceptance
without rewriting their evidence. This closure changes only status documents;
no production/tests/fixtures/Runtime/Official resources or prior accepted reports,
no tests/native integration/build/lint/smoke/benchmarks rerun, no Git publication.

**E3-S1–S6 COMPLETE — PASS WITH LIMITATIONS.
Phase9E-3 COMPLETE — PASS WITH LIMITATIONS. Phase9E-4 NOT_STARTED.
STOP; separate user authorization required before any further work.**
