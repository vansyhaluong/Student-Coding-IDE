# Student Coding IDE Architecture

## F6 — scoped Quick Action consent, 2026-11-12

SmartHintsService owns a RAM-only consent store separate from source-bound operation
sessions. Main derives disclosure categories from the validated immutable capture,
uses category-subset coverage and checks owner/document/exercise/language/origin/
provider identity and a fixed bounded lifetime before dispatch. Remembering authorizes
future manually initiated actions, never automatic retries or background requests.
Revoke/end removes the opaque session and cancels a pending operation; completed
local Hint Apply authority retains its existing independent guards. Source/edit,
reset/restore and panel closure retire operations while learning permission survives.
Exercise/language/learning exit, provider/key changes, document loss and expiry retire
permission. Preload exposes only a validated consent-revocation capability; Renderer
shows the brief disclosure and checkbox, or starts a freshly prepared request via
Main-verified reuse. Chat consent and all Run/Submit/proposal authorities stay separate.

## AI-SUGGEST-FIX-F5 — whole-submission advisory diagnostics, 2026-11-11

Suggest Fix with a single empty Monaco selection routes to DETECT_ISSUES;
nonempty selection stays SUGGEST_FIX with its existing frozen-selection parser,
signature/SH-1 checks and Diff/Confirm/Undo. No full-source pseudo-selection is
created. Detection is Gemini (or offline fake) only and does not depend on parser
availability, so syntax-invalid submissions can be analyzed without granting edit
authority. Analyze, Explain, Hint Apply F4 and Chat paths remain separate.

Practice captures its actual practice URI-checked model/source/version; the
existing hook and Main capture bind exercise/language/model ID/source revision/
fingerprint and trusted public package metadata before explicit snapshot consent.
Existing public Run receipts contribute only if source/revision/package/owner
identity matches; no new Run/compiler/Submit execution or renderer-supplied
compiler authority. Google transport/model/quota/coordinator stay unchanged;
the detection-only action has the same30s ceiling as Suggest Fix. No automatic
provider retry or model fallback. Oversized source is refused, never truncated.

Gemini returns a bounded DETECTION wire with up to8 syntax/logic/runtime/other
issues: severity, message, explanation, reason, impact, guidance, allowed public
Run evidence IDs and optional exact source quote/UTF-16 range. Main runtime-
validates the wire, mints IDs and fixes provenance to AI_INFERENCE and verification
to SUSPECTED. Range admission requires valid offsets, nonempty exact quoted text,
source bounds and no CRLF/surrogate split. A well-formed but nonmatching AI range
is resolved in Main only when its exact nonempty quote occurs uniquely in the
captured source, with reconstructed offsets revalidated through the same boundary
gate (2026-11-12 corrective amendment). Count overlapping occurrences as ambiguous.
Missing/ambiguous matches become null/INVALID_AI_RANGE; unknown stays null/UNLOCATED.
No nearest-line, fuzzy text search, newline/whitespace normalization or source
repair. Invalid schema/authority
claims fail the operation. Empty issues explicitly means no finding, not proof
of correctness. Existing confirmed compiler/Run failure/location facts appear
separately in RunEvidence; citing them never verifies an AI diagnosis of cause.

Canonical DETECTION status always has proposalId:null, never edits/Hint material
or Apply authority. Shared validators and existing Preload/status correlation
accept only the matching action/output and owner/source-bound result. No public
filesystem/process/Engine capability or new provider dependency was introduced.

PracticeEditor uses student-ide.ai-detection as its Monaco marker owner and
preserves all language-provider owners. Its attachment checks the captured model
ID/revision, actual URI/language/model version/source and exact quote before
mapping offsets through Monaco. Severity selects the marker level; source/hover
explicitly says unverified AI. Per the 2026-11-12 user clarification, an editor-owned
decoration collection immediately highlights affected lines light red with a red
margin alongside the exact markers. The original severity remains in the Monaco
marker; all detection line backgrounds use the requested light red. Exclusive
range ends at column one do not mark the following line. Plain-text marker
messages include explanation, reason, impact and guidance in the standard editor
tooltip. No bottom Error Details component/state or custom editor click handler
is mounted. Current issue-list actions only reveal/focus a valid range; unlocated
issues cannot select an invented position. No Apply/Confirm/Diff control.

Model content/model changes synchronously invalidate the attachment. Hook source/
exercise/language/model/session/expiry/close guards retire context and clear
markers and the owned decoration collection; edit-then-Undo cannot
resurrect an old result. Historical cards
remain readonly and cannot navigate after losing current result authority.
Cancel/timeout/invalid response use existing owned operation lifecycle. Limits:
16KiB source,8 findings,2048 output tokens; AI locations have syntactic snapshot
correspondence, not compiler-proven semantic correctness. No live accuracy or
comprehensive compiler-diagnostic ingestion claim is made.

## AG-02 — technical/security prototype findings, NO-GO, 2026-11-11

**Current recommendation remains unapproved for production.** Prototype code is
isolated under prototypes/ag02-opencode-v2, not imported by src/. Engine package
@opencode/cli-windows-x64 and @opencode/client are pinned2.2.7 from official npm;
the separate lockfile pins schema/protocol2.2.7 and transitive dependencies.
pins.json records registry SRI and executable identity. This is a binary package
pin, not a claim that --version or the Engine API ran. No V1 SDK/API is used.

Actual Node24.16.0 client and bundled Electron44 Main client probe passed against
an explicitly FAKE V2 HTTP/SSE fixture: Basic auth/denial, /api/info, session
creation, interrupt, event subscription/cancellation and timeout. Electron44.0.0
reported embedded Node24.18.1, ABI149, no stderr, OS exit0. Main bundle14 inputs,
no Core/Server. The installed dependency tree nevertheless includes Effect4.1.0
via schema/protocol; the lean Promise import is not proof of zero transitive
installation footprint. The first fixture returned the wrong session envelope;
correcting it to {data:...} per the pinned generated client fixed the test.

37 prototype tests PASS after that fixture correction;118 targeted existing
Ollama IPC/service, SmartHintsConfiguration and Learning Chat tests PASS with
fake transports. These are not Engine runtime tests. Broker tests cover read/
bounded search/proposal-only byte preservation, wrong owner/project/session/epoch/
consent, extra fields, forged snapshots, stale source/session, invalid ranges,
secret/path/size limits, traversal, absolute/drive-relative/UNC/device/ADS/reserved
paths, an actual external directory junction and hardlink. No file symlink or
Windows race/handle-level confinement certification follows. Synthetic fixture
creation is harness setup; the broker contains no write method or disk commit.

Standalone fake gateway tests cover fixed model/path/method, fake-loopback-only
upstream, auth/Origin/tool/size rejection before forwarding, local-token
replacement/revocation, per-forward budget, provider503, SSE function-call and
synthetic thought-signature preservation, and cancellation to upstream. Tokens
are generated in memory and not logged/persisted. This does NOT verify that a
running Engine respects provider baseURL or uses only the gateway. No Engine/MCP
end-to-end call or real Gemini request occurred. The fake fixture is deliberately
not a replacement Engine or production gateway.

**Hard gate: NO-GO for Engine launch in this environment.** Windows11 Home
10.0.26200 x64, non-administrator; no WindowsSandbox.exe was found and no verified
per-process filesystem/config/network confinement backend is implemented.
Read-only firewall inventory showed enabled profiles with default outbound action
NotConfigured, not an Engine-specific deny boundary. No system policy was changed.
An ordinary Node child under private cwd/HOME and deny-proxy variables successfully
read an outside synthetic canary and contacted an unapproved LOOPBACK canary
(one connection, exit0). This reproduces failure of the cooperative launch
approach, not an observed V2 Engine exploit or an external-egress measurement.
The harness's Engine gate always denies ENGINE_ISOLATION_UNVERIFIED, has no
bypass option and launches zero Engine processes. Client success, Job ownership,
and deny permissions cannot turn that failed isolation gate into GO.

Consequently actual effective Engine config/tool inventory/global-system-project
discovery, native read/write/shell/PTY/subagent/plugin/MCP/download denials,
Engine startup/health/session/events, timeout/crash/restart/descendant cleanup,
and Engine-to-Gemini routing remain UNTESTED/BLOCKED. Windows10 and Engine Windows11
runtime/CPU compatibility are UNVERIFIED. The declared2.2.7 Engine artifact may
be staged but must not be run by these harness files. Existing source/runtime
limitations from F4 are unchanged.

Static payload checks: archive SRI matches registry; archive SHA256
666d684601380ad9f7b54a004c6fe61c2a94827fac4a6150ba131ea85e507977;
EXE SHA256 e06a04f8ec2cbaab32262e9af1474975228a5e8d9ae516da67ac4d1cf0bade8a,
265672584 bytes, PE AMD64. Archive contains package.json and one EXE, no license
notice file. MIT is declared; source commit/provenance signature and bundled
third-party notices/native/DLL/WASM/runtime closure remain unverified. Copying
the EXE to a new resources/agent-engine path with spaces preserved its hash;
this is static relocation feasibility only, not a relocated launch or standalone
claim. No artifact executed/installed itself; no new installer was created.

Alternatives requiring explicit user decision: (1) provision a demonstrably
confined Windows VM/sandbox or application-specific restricted runner permitting
only the broker/gateway channels, then repeat AG-02 with stock pinned Engine;
(2) reconsider the separately designed Main-owned Gemini/tool loop without
OpenCode. Neither is implemented/selected here. Do not replace the hard gate by
more cooperative env flags, allow broad project tools or silently patch/fork Engine.
AG-03 remains NOT_STARTED. See IMPLEMENTATION-PLAN for commands and exact scope.

## AG-01 — Project Gemini/OpenCode Agent proposal, 2026-11-11

**DESIGN_READY for review, not production approved or runtime verified.** User
authorization is design-only (REQUIREMENT AG-01). Fact, inference and recommendation
are separated below. AG-02 is the next recommended activity: a separately
authorized fake-only compatibility/security prototype. No package is installed.

### Current source trace and separation

Fact: App.tsx mounts features/ai/AiChatPanel.tsx in both the Project sidebar and
a temporary Learning overlay. The panel owns ephemeral history and calls
window.studentIde.ai.getStatus/startChat/stopChat/onChatEvent. Preload
bridge/ai.ts validates requests, results and events against shared/contracts/ai.ts.
AiIpcService uses IpcHandlerRegistry, authorizePreferencesFrame, per-WebContents
active request ownership/frame correlation, overlap refusal and AbortController;
Main index.ts constructs OllamaService and routes only to the owning WebContents.
OllamaService probes GET /api/tags and streams POST /api/chat at fixed
127.0.0.1:11434 with qwen3:1.7b, stream:true, think:false. NDJSON and aggregate
output are bounded; malformed/unfinished streams fail; panel unmount, navigation,
renderer loss and shutdown cancel. There is no projectId/context/tool authority
in this API. Its window authorization alone is insufficient for an Agent.

Recommendation: Project mode uses a new agent namespace and panel adapter; never
extend ai:start-chat into a generic tool/command executor. Keep the existing
beUI presentation and sidebar interaction. Project agent is unavailable in
Learning; the current Learning overlay remains on the old chat path until a
separately approved UX decision, never receives agent tools. Learning Chat is a
different implementation (services/learning/chat + learning-chat IPC); Smart
Hints/Hint Apply are another domain. No session, schema, quota coordinator, grant,
parser, exercise source, hidden tests or official artifacts flow between them.

### Official evidence and option selection

Fact: [V2 migration](https://opencode.ai/docs/migrate-v1/) identifies
@opencode/client as the released V2 API client; @opencode-ai/sdk/v2 examples in
the [V1 SDK docs](https://opencode.ai/v1/docs/sdk/) are not proof of OpenCode 2
compatibility. V2 uses permissions arrays and shell/subagent action names.
The migration notes external_directory is allowed by default: never inherit it.
The [V2 API](https://opencode.ai/docs/api) labels selected HTTP routes
experimental; prompt, interrupt, permission reply and event transport need a
pinned adapter. Its event stream is volatile: disconnection/overflow loses events.
No permission or applied-edit state may be reconstructed by blindly replaying SSE.

Fact: surveyed upstream dev manifests identify client/core/CLI 2.2.7, MIT, and
Bun 1.4.4 build tooling. These are mutable source observations, NOT a locked
published artifact selection. [Promise client README](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/client/README.md)
describes a fetch client without Core/Effect runtime dependencies. In contrast,
[Core manifest](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/package.json)
has Node/Bun conditional imports and native SQLite/PTY/watcher/image/search
dependencies. Node support in source does not establish Electron 44 ABI support.

| Option | Benefits | Material costs/risks | AG-01 choice |
| --- | --- | --- | --- |
| Embed Core/Engine in Main (or Electron utility process) | Direct hooks; fewer HTTP boundaries | Native/runtime dependency closure, Electron ABI/rebuild conflicts with existing patched node-pty, Main crash/resource coupling; utility process still needs compatibility evidence | Reject for first implementation |
| App-owned Engine sidecar + Main-only V2 Promise client | Engine runtime separate from Electron ABI; bounded lifecycle and protocol adapter; independently versioned payload | Extra binary/data/loopback surface, config discovery and egress must be constrained and tested | Recommended, conditional on AG-02 gates |
| Gemini directly in Main with an app-owned loop | Smallest runtime/policy surface | Reimplements orchestration and does not fulfill OpenCode Engine objective | Contingency requiring a new explicit decision if sidecar gates fail |

This is a recommendation, not a claim that a standalone Engine SDK is merely a
pure JS import. Do not use createOpencode defaults/global executables/auto-daemon
discovery. Main explicitly launches its exact payload and owns its lifetime.

### Proposed process, provider and credential boundaries

Project panel -> typed agent Preload -> AgentIpcService -> AgentService in Main.
AgentService composes EngineAdapter (V2 client), AgentProjectTools (authorization),
AgentProposalService (candidate authority) and GeminiAgentGateway (provider I/O).
One owner/project generation and one active turn per session; no background work.
Engine starts in a NEW empty private runtime workspace, not the student's repo
or a copy containing its config. It is given an opaque session alias, approved
source content only through tools, and a random revocable local gateway token.
Absolute project roots, true Gemini keys and inherited developer credentials
are absent from its config/env/argv. Its own app-managed runtime/data files are
distinct from agent project-file capabilities; no promise of an OS sandbox is
inferred from cwd, environment variables or Engine permission settings.

Use only one app-controlled authenticated loopback MCP endpoint hosted by Main,
with readFile/searchFiles/proposeEdit tools and no resources/prompts/URLs/shell.
MCP here is a private integration transport, not an extension marketplace or
user-configurable server registry. Main binds a random port and per-session
capability, validates exact Origin/Host/transport schema/owner/epoch and byte
limits, rejects unknown methods/tools and credentials in model arguments.
[V2 MCP documentation](https://opencode.ai/docs/mcp-servers/) supports remote
servers; exact headers, initialization and cancellation behavior are AG-02 gates.
If unsupported, stop and reconsider the transport rather than enable filesystem
write tools or a broad plugin. No plugin dependency is preapproved.

Disable all native Engine file read/search/edit/write/patch tools and shell,
PTY, execute/Code Mode, subagent, worktree, skill, webfetch/websearch, browser,
images, formatters, snapshots/revert and automatic updates/downloads. Allow only
the three broker tools. Unknown permissions fail closed. The [V2 permissions](https://opencode.ai/docs/permissions/)
use last-match rules and separate MCP tool actions; they are defense in depth,
not Main authorization. [Config](https://opencode.ai/docs/config/) discovers
ancestor/global/system settings and executable extensions. Private HOME/config/
data/cache/cwd plus a minimal environment are necessary but not evidence that
all discovery is disabled. Validate effective config/tool inventory at startup;
unexpected provider/plugin/MCP/agent/config source => NOT_READY. No changes to
the student's global config, tools, PATH or system settings.

Only the Main GeminiAgentGateway sends HTTPS to a fixed Google Gemini Developer
API host/model/method allowlist. [Google provider source](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/ai/src/providers/google.ts)
supports baseURL and API-key authentication via x-goog-api-key. Proposed Engine
google provider points to the loopback gateway using a disposable local token.
Gateway validates path/model/body/tool names and request ownership, rejects
redirects/arbitrary destinations, removes local auth and injects the true key
only into upstream headers. Bound input/output/tokens/steps/time; reserve budget
before EACH actual provider forward, including follow-up/compaction/retry calls.
Do not reuse Learning's once-per-operation reserveInference memoization for an
agent loop. No silent retries/model fallback, remote file/URL uploads, alternate
providers or live connection check. Gemini streaming/tool-call framing, thought
signatures and provider baseURL behavior must survive fake-protocol fixtures;
do not coerce them into the existing Smart Hints JSON schema.
Google's [function-calling contract](https://ai.google.dev/gemini-api/docs/function-calling)
places actual function execution in the application: receiving a model tool call
is not approval. Preserve required protocol state across turns and execute only
the Main-validated broker action. Follow the [API-key security guidance](https://ai.google.dev/gemini-api/docs/api-key):
keep credentials out of browser code; verify compatibility with the user's
supported key type/restrictions without changing Learning's validator here.

Fact: SmartHintsConfiguration currently owns a private in-memory key, encrypted
settings, native Main key-entry UI, safeStorage and Learning's shared coordinator;
it exposes no reusable credential API. Recommendation: a narrowly authorized
Main-only GeminiCredentialBroker supplies gateway dispatch leases (no key getter
to Renderer/Engine); adapt the existing configuration through an internal port
without changing its enablement/model/quota/storage semantics. Reuse requires a
separate Agent opt-in; Learning enablement does not imply Agent consent. Preserve
the single encrypted credential record; no plaintext duplicate/auth.json/.env.
Key replacement/removal revokes the credential generation and drains its Agent
gateway before reuse, without turning off or spending Learning's logical budget.
Agent enablement/budget and provider failures stay Agent-owned. Actual Google
quota is shared when using the same credential and cannot be isolated by local
ledgers; report that fact. Any credential seam refactor needs AG-03 regression
gates and explicit approval; it is not implemented by this design.

Renderer receives hasKey/readiness and redacted domain errors only. Engine logs
can at most contain a revoked local token, never the Google key. Do not persist
raw Engine/provider logs or HTTP bodies/headers; project content can itself be
sensitive. Emit fixed-enum phase/error/counter/timing diagnostics only. Inspect
crash/session/cache/log artifacts for canary credentials and source retention.
Discard/delete private data only after owned process-tree settlement and path/
link/ownership checks; failures retain a safe cleanup-required state. Directory
removal is not forensic erasure and no durable chat history is in the first scope.

### Project access, proposal, confirmation and Undo

Assumption for first scope: one existing UTF-8 text file applied per confirmation;
several file proposals may be reviewed individually, without an atomic multi-file
claim. No create/delete/rename, binary, permissions or encoding conversion.
Read access is explicitly granted for a disclosed eligible file manifest per
session/turn, with bounded directory/search results. Initially propose limits of
20 files/1 MiB aggregate context, 256 KiB/file, 100 search hits, 8 provider forwards
and 120 seconds/turn; AG-02 measures and AG-03 approves exact constants. Engine
never broadens that manifest. Reading another file requires explicit scope
approval; a read approval cannot approve edits.

AgentProjectTools uses ProjectService.getAuthorizedProject and the existing
FileSystemService containment primitives, with an additional Agent policy on
EVERY read/search/proposal/consume. Reject absolute/drive-relative/UNC escapes,
traversal, ADS, reserved/device paths, case aliases, links/junctions/reparse and
hardlink aliases; revalidate file and ancestor identity around I/O. Exclude .git,
dependencies, generated/out/release files, .env*, credential/private-key/cert/
auth/settings/log files and app userData. Add known-secret/value scanning and
reject suspicious files/content instead of silently redacting code used in a
diff. Search filters BEFORE reading and before returning paths/snippets; the
existing SearchService exclusions alone are insufficient for secrets. Recognize
that pattern scanning cannot prove arbitrary text contains no unknown secret;
explicit eligible manifests and fail-closed canary tests are required. Project
instructions and tool results are untrusted data, never executable config or
authority to change permissions/send new context. Atomic no-follow Windows I/O
and residual same-user races need AG-02 evidence; do not claim existing string
realpath checks alone settle them.

Dirty Monaco models are authoritative for open files. A session-owned editor
capture protocol records project generation, canonical model identity, monotonic
renderer revision (including edit-then-Undo), Monaco version, EOL, source hash
and disk fingerprint. Treat submitted snapshot text as untrusted bounded input;
Main alone authorizes its path. Closed files are authorized/read by Main and
opened as models before applying; a mismatched disk snapshot requires recapture.
Never merge a disk-based candidate over a dirty model or silently save/reload it.

proposeEdit receives a relative path, issued snapshot ID, nonoverlapping text
edits and bounded rationale. Main validates scope/ranges/hashes/limits and builds
the immutable before/after candidate itself; model text cannot mint a proposal.
Return opaque proposalId/digest/expiry and safe relative-path Diff data. Readonly
Diff does not mutate a model/disk; pause the turn before the proposal is reviewed.
Confirm consumes a one-use owner/session/turn/project/model/revision/source-bound
grant. Recheck scope, source/disk state and expiry; duplicate exact consumes are
idempotent, mismatched replays denied, ambiguous transport outcome never re-applied.
Renderer rechecks the live model immediately after correlated ACK, then uses one
synchronous Monaco edit transaction with undo stops. No stale auto-rebase. Dirty
or external changes since capture invalidate the proposal and require new review;
even change-then-Undo invalidates authority. Discard/Stop revoke proposals.

Result is an UNSAVED Monaco buffer with native Undo/Redo, not Engine disk edits.
Suspend/defer existing auto-save for pending proposals and the Agent-applied
transaction until an explicit normal Save; UI states this clearly. The existing
EditorModelManager createSaveSnapshot/acceptSave and use-editor-workspace save
path remain the disk-write owner. Existing FileSystemService.write is a direct
write, not a compare-and-swap transaction; do not claim it protects agent stale
disk commits. A future direct/atomic multi-file write would need a separate design.
Saved edits follow normal editor Undo semantics: Undo changes the buffer and a
later explicit Save changes disk. Never use Engine revert/Git checkout as Undo.

### Proposed typed IPC and lifecycle

New side-effect-free contracts/agent.ts + agent-validation.ts; private schemas
map Engine/MCP DTOs to application types. Conceptual API (not SDK method names):
getStatus({projectId}), openSession({projectId,scopeConsent}),
startTurn({sessionId,clientTurnId,prompt}), stopTurn({sessionId,turnId}),
captureEditorSnapshot({sessionId,relativePath,modelSnapshot}),
approveReadScope({sessionId,requestId,decision}),
getProposal({sessionId,proposalId}), consumeProposal({sessionId,proposalId,digest}),
discardProposal({sessionId,proposalId}), closeSession({sessionId}), onEvent(listener).
No public raw permission.reply, Engine endpoint/port/token, provider config,
absolute paths, arbitrary shell, generic invokeTool or arbitrary diff execution.
Only a correlated visible manual Confirm arms consume; grant is not transferable
to another proposal/model. Capability validators cover exact shapes, text/array
limits, enums and request/reply correspondence on both sides of the bridge.

Events carry owner-scoped session/turn IDs, project epoch, monotonic sequence and
safe state: status/textDelta/readScopeRequested/proposalReady/terminal/error.
Readiness is separate from turn lifecycle (NOT_READY/READY versus IDLE/RUNNING/
WAITING_READ_SCOPE/WAITING_CONFIRM/STOPPING/STOPPED/FAILED). Errors distinguish
dependency/credential/provider/policy/target/candidate/stale/conflict/cleanup.
One terminal event per turn; bounded early-event buffering and stale-event drops.
On event transport gap, cancel/freeze the turn, reconcile authoritative session
state using the pinned API and revoke pending confirmations; never infer success
or repeat a prompt/tool/model forward from a missing SSE event.

Close panel, leave Project mode, switch/close project, lose/navigate WebContents,
replace/remove key or quit: seal admission, revoke capabilities/proposals,
interrupt Engine session, abort gateway/MCP work, await owned process/descendant
cleanup, then close transports and private runtime. Interrupt timeout escalates
only to verified owned-tree termination using the existing Windows lifecycle
boundary, never process-name/global daemon killing. Job Objects manage lifetime,
not filesystem/network confinement. Cleanup failure retains STOPPING and ownership
for retry under ADR-021. No detached/global auto-start service or restart loop.

### Compatibility and unresolved gates

Fact: repository host Node v24.16.0, installed Electron44.0.0 and builder26.18.0;
host Node is NOT Electron's embedded Node/ABI. [Electron platform support](https://raw.githubusercontent.com/electron/electron/main/README.md)
lists Windows10+, while [OpenCode install docs](https://opencode.ai/docs/) offer
Windows x64 and x64-baseline standalone CLI artifacts. Neither certifies the
exact combination or oldest supported Windows/CPU. AG-02 must pin matching
published Engine/client versions, checksums/source revision, package exports and
license closure; test real Node24 client, Electron44 Main bundle/ESM/import graph,
and native Win10/11 x64 Engine startup without WSL, globally installed Bun/Node/
OpenCode, Git Bash, auto-downloads or unsupported CPU instructions. Surveyed
2.2.7 is a candidate only, not a new dependency/version decision.

Future packaging places verified Engine EXE plus DLL/native/WASM/model-catalog/
provider assets and notices under resources/agent-engine via extraResources.
The installed builder26.18.0 schema/config must be used for implementation;
upstream [builder schema](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/scheme.json)
is reference evidence, not authority to change the pinned builder version.
Resolve using process.resourcesPath when packaged; explicit build asset root in
development, never cwd/source tree/PATH/npx. SDK client stays in Main's production
dependency closure only. Executables live outside ASAR ([Electron ASAR limits](https://www.electronjs.org/docs/latest/tutorial/asar-archives)).
Include audited runtime closure, not the whole repo/out/, SDK tests, session DB,
logs, encrypted user keys or runtime downloads. Bundle runtime if the chosen
artifact needs one; do not assume a Bun build script means Bun is required on
the student's machine or claim standalone before proving the payload closure.
Retain current Node24/.NET10/VC++ prerequisites for unrelated IDE features.

Historical local prototypes are V1 SDK/Engine1.19.4, NOT V2 evidence. Their R1/R2
README files report unexpected bootstrap network activity and an unresolved
Engine egress/live-API NO-GO. They are evidence only; no historical launcher is
run or gate waived. The referenced old review docs are absent in this checkout;
do not invent their contents. AG-02 must demonstrate no ambient config/code or
unexpected egress with fake credentials/providers and an enforceable isolation
mechanism. Permission/proxy variables alone are not an OS security boundary.
If startup/config/egress confinement cannot meet requirements using a stock
payload, production remains BLOCKED: return evidence and alternatives for an
explicit decision, never silently patch/fork Engine or weaken the restrictions.

Open decisions: exact published version/payload/runtime; enforceable Windows
filesystem/config/egress isolation; verified MCP and Gemini framing; credential
port migration and independent Agent budget/model; exact consent/limits and
auto-save lease UX; minimum Windows/CPU and signing/distribution acceptance.
These block dependent implementation/live/release, not completion of AG-01's
design survey. See IMPLEMENTATION-PLAN for the gated AG-02–AG-06 proposal.

## AI-HINT-APPLY-F4 — Hint-only parser-resolved targets, 2026-11-11

Nonempty requested ranges remain exact targets, restricted to entry expressions
or leaf statement sequences; selecting an entire control-flow construct cannot
replace it with a Hint fragment. A collapsed caret resolves in physical block
trivia gaps, including nested blocks. A unique adjacent matching return or bound
assignment is replaced rather than creating a duplicate statement. Otherwise an
explicit valid gap may insert. Token-interior/ambiguous/outside-entry requests
fail closed. Null/default boundary caret may infer an assignment insertion only
into one empty block with all fragment identifiers already lexically bound;
multiple candidates or more than128 blocks require an explicit target. This is
parse-only scope evidence, not type checking or proof of algorithm correctness.

Every full candidate still passes unchanged grammar, exact entry signature/header,
outside-target AST shape and SH-1 canonical checks. No complete-function Hint
rewrite is admitted for HAS_IMPLEMENTATION. Syntax-uncertain Hint classification
remains non-authoritative and gets an explicit CLASSIFICATION denial; Selection
Fix recovery is unchanged. No new inference or renderer target authority exists.

Main emits PARSER_RESOLVED only when its verified offsets differ from an absent/
collapsed request. Preload admits that kind only for such requests and retains
the original operation/source/package/model/revision/TTL correlation and exact
consume ACK. HAS_IMPLEMENTATION nonempty selections still require SELECTION with exact offsets.
Readonly Diff/manual Confirm, one-shot WeakSet arming, native Undo/Redo, stale
rejection, Discard and the three-attempt F3 policy remain unchanged. This section
supersedes the historical immediate-body/exact-caret restrictions below only for
Hint Apply, not Suggest Fix, Chat or provider schema/model/quota.

## Learning Assistant entry scope — 2026-11-08

LearningWorkspace no longer owns a theory Chat trigger, panel or open state.
PracticeWorkspace retains the existing assistant lifecycle and entry point.
Main/Preload Chat contracts and context support remain unchanged.

## AI-C4-F3.1 awaited renderer endpoint teardown - 2026-11-08

BrowserWindow.closed is not the endpoint lifetime barrier. WindowManager retains
its owned WebContents and returns one shared stop promise until 'destroyed'. It
propagates destroy errors and retains failed cleanup for retry. Mandatory business
cleanup still precedes the recovery window; configuration drains Chat/Hint and
shared inference first. The final pass destroys/joins the renderer endpoint,
then removes the sealed LearningChatIpcService transport. No new admission is
possible at STOPPING; queued teardown calls receive typed denials while the
endpoint remains alive. Preload revokes Chat correlations on validated terminal
lifecycle events and removes its lifecycle/unload subscriptions. This complements
Main ordering, rather than depending on cross-process event delivery timing.
No transport tombstone, arbitrary delay, timeout or Hint authority change.

## AI-C4-F3 bounded pre-grant retry - 2026-11-08

The owned operation stores at most three attempt IDs, request digests and fixed
failures. Exact failed duplicates reuse the error; changed duplicate IDs and
parallel changed requests are rejected. A new attempt needs a definite retryable
pre-grant rejection. Once a proposal exists, no other preparation may replace it.
All original capture/package/source/revision/TTL checks run on each new attempt;
consume, discard and native Monaco transaction semantics remain unchanged.

Parser results preserve fixed stage/reason enums. The prepare-only IPC exception
projection rechecks document/frame/epoch and validates correlated no-grant details;
Preload unlocks only that failure, never an uncertain transport response. UI
releases the assistant lease without Discard only on this definitive rejection.
There is no automatic retry or inference. Runtime diagnostics atomically replace
one source-free last-rejected-Hint-Apply record with stage/reason, attempt, classification,
language, build identity and observation time, plus a fixed guard reason when
available. Successful retries preserve the last rejection. No source/candidate/
offsets or IDs.
The old manual incident has no retained Hint Apply diagnostic and cannot be
retrospectively assigned to a parser stage.

## AI-C4-F2 consumed Hint proposal → native transaction — 2026-11-08

PracticeEditor.captureHintApply captures one Monaco selection/caret with exact
source/model identity/version, EOL and renderer revision. useHintApply accepts
only the current useSmartHints COMPLETE Practice operation, never timeline text.
It leases the existing assistant slot as HINT_APPLY while Preparing/Review and
freezes the target at click time. Cursor movement after capture cannot rebase it.
The CodeBlock receives presentation callbacks/status only; Copy stays separate.

prepareHintApply accepts an untrusted selection alongside any snapshot. Main
ignores it only for its own NO_IMPLEMENTATION classification and passes null to
the unchanged template parser. HAS_IMPLEMENTATION retains parser-confirmed range
or statement-boundary insertion checks; whole-file candidates remain forbidden.
The existing F1 proposal and strict HINT status schemas remain separate.

Typed consumeHintApply submits the original preparation and opaque proposal ID.
Main rejects duplicate/concurrent consumption, mismatched requests, expired or
revoked grants, and freshly changed package/signature/starter identity. Its
bounded confirmation gate then reaches the existing single-use primitive.
Preload validates/correlates the exact prepare/consume envelopes and epochs,
retains digests rather than source snapshots, and never retries uncertain ACKs.
Typed discardHintApply revokes a pending or prepared grant, aborts local parser/
consume work and drops retained capture without converting Hint history to edits.

createHintSmartFix freezes the proposal/candidate. Only an exact Main consume ACK
arms that object in a private WeakSet. The existing applySmartFix transaction
accepts this distinct HintSmartFix branch only when armed; raw HINT statuses and
forged objects remain rejected. Both branches retain canonical old-text/EOL,
exercise/language/source/revision/model/version/URI/TTL checks, one synchronous
executeEdits batch and native undo stops. Suggest Fix admission is unchanged.
Diff Confirm guards in-flight duplicate clicks; Discard/source invalidation during
an awaited ACK prevents any late transaction, even after Undo restores equal text.

Actual Electron revealed repeated default SDK discovery exhausting the existing
2s Hint validation budget. MainSelectionFixGuard now retains at most two
source-free Hint asset identities. Every reuse still rereads manifest/artifact
bytes and rechecks SDK anchors using the existing load(expected) path. Missing or
changed assets fail closed; parser grammar and all budgets/timeouts are unchanged.
No new inference, quota owner, native dependency or Run/Judge/Submit path.

The actual JS starter contains throw-new-Error. Its recognized unimplemented
scaffold is admitted only in the original Hint baseline after the existing
NO_IMPLEMENTATION classifier succeeds. Both branches share the exact placeholder
predicate; the AST is still parsed, bounded and checked. Candidate parsing and
Suggest Fix use the original strict grammar, with no NewExpression allowance.
Tests explicitly reject NewExpression in those paths. Only a verified original
template body can be replaced; no guessed spans or synthesized file baseline.

## AI-C4-F1 Main-owned Hint proposals — 2026-11-08

SmartHintsApi.prepareHintApply uses a dedicated semantic channel and strict
request/proposal validators. ExerciseIpcService authorizes the sender/frame and
passes trusted package capture into SmartHintsService. Preload correlates the
current Hint operation, binding, source digest, canonical edit, target and epochs;
it does not synthesize proposals. Hint output/status schemas are unchanged.

For eligible COMPLETE Practice Hints, the current owned operation retains a
detached immutable minimal capture: source/binding, signature/identity, starter
and classification; statement/constraints/run observations are stripped. No
history store or extra ledger exists. New Smart operation, cancellation, context
retirement, document destruction/navigation, provider changes, shutdown and the
original result TTL clear the capture and proposal. Consume drops the capture.

Preparation compares snapshot assertions with retained authority, recaptures
package version/signature/starter both before and after parser work, and runs a
separate private Hint parser protocol in the existing bounded TypeScript/Roslyn
hosts. NO_IMPLEMENTATION extracts a full-function body's AST span and replaces
only the original body block. HAS_IMPLEMENTATION verifies requested entry-function
selection or immediate entry-body statement insertion boundaries. Parse-only
grammar, exact original header, outside-target AST structure and unchanged SH-1
canonical limits must all pass. No source-text search, whole-file replacement,
generic executor or extra inference is used. Local preparation is bounded by
the existing parser budgets and a 10s outer ceiling, never extending result TTL.

The separate HintApplyProposal has source binding, Hint reference, exact target,
canonical EDIT_PROPOSAL, independent UUID and original expiry. One memoized
preparation per current Hint gives duplicate idempotence; altered requests and
failed-preparation replacement are rejected. Main-private consumeHintApply checks
owner/scope/reference/expiry and consumes a grant once. No consume IPC exists yet.
F2 must add final live-model checks and Diff/manual Apply integration separately;
the existing Suggest Fix/SmartFix/Monaco pipeline is unchanged and continues to
reject raw HINT statuses. Historical cards cannot create authority.

## Hint code toolbar — 2026-11-08

Shared Advisory opts Hint blocks into AssistantCodeBlock's toolbar. The existing
vendored beUI Button uses semantic Chat theme tokens. Clipboard writes use the
browser clipboard API only, preserve exact text, report failure and ignore late
completion after text/language changes or unmount. Chat blocks do not opt in.
Hint has no verified edit target or proposalId; Main-private implementation state
is pedagogical context, not edit authority. Apply is visibly disabled with an
accessible reason. No conversion to SmartFix, guessed ranges, synthetic grant,
new IPC or editor mutation path. Existing Selection Fix validation, readonly Diff,
single-use grant, revision/model checks and native Undo transaction are preserved.

## Main-derived Hint context — 2026-11-07

Public package capture retains only the selected language's trusted starter for
Hint. SmartHintsService classifies the detached snapshot before consent using
the existing bounded Main-owned TypeScript/Roslyn parse processes, through a
separate advisory protocol branch. Exact required entry shape and recognized
placeholder statements establish NO_IMPLEMENTATION; parsed non-placeholder
statements establish HAS_IMPLEMENTATION. Unsupported/missing templates, damaged
syntax, ambiguous structure or unavailable parser assets yield UNCERTAIN.
This describes observed progress, never correctness or editor authority.

Only the derived state, existing public signature and source reach Gemini, with
state-specific system/schema guidance. Raw starters stay Main-private. For
NO_IMPLEMENTATION, Main additionally parses the returned whole function and
rejects incomplete declarations, changed signatures or a remaining placeholder.
This is a Hint-only advisory check after existing response validation; it does
not modify SH-1 or the Selection Fix grammar, Diff/Apply/Undo. Parser work uses
the existing operation deadline/abort/cleanup and rechecks freshness across awaits.

## AI-C4-E beUI Renderer composition — 2026-11-07

LearningAssistantPanel composes the existing MIT beUI Message/MessageBubble,
MessageScroller and PromptInput. Small optional PromptInput composition/label
props preserve its defaults for the existing Local AI consumer. No new package
or agent workflow is installed. Existing Chat/Smart Hints hooks and timeline
remain authoritative for UI lifecycle; no Main/Preload/shared changes occur.
AssistantMarkdown uses installed react-markdown/remark-gfm, drops raw HTML and
remote images, and renders links as text. AssistantCodeBlock reuses the existing
offline Monaco tokenizers, creating no model or editor authority. Card Discard
uses the same current-operation cancel path; Review Diff still checks previewFix.

## AI-C4-D Unified Hint amendment — 2026-11-06

HINT has no progression state. Main validates the complete thinking/steps/code
result, including the code's bound exercise language, before COMPLETE; Preload
and Renderer validate it again. Legacy levels are normalized at request ingress.
Cards retain the existing bounded timeline identity and no Apply authority.
New Hint output is not supplied as previousHints or trusted Chat history.

## AI-C4-B Unified Chat/action presentation — 2026-11-06

PracticeWorkspace mounts one LearningAssistantPanel and one toolbar entry. It
reuses useSmartHints and the existing typed Smart Hints bridge; the legacy drawer
is not mounted in production. Shared Advisory, RunEvidence and SmartHintsConsent
presentation is exported from SmartHintsPanel, preserving the original consent.
AssistantQuickActions supplies context/capability-gated controls and Hint levels.
Theory has no exercise authority and leaves the four action controls disabled.

useAssistantTimeline maintains a bounded 64-row RAM display index using prefixed
request IDs and Main-correlated operation IDs. Loading/failure/cancel/result update
the original row in place. Chat text is rendered exclusively from Main session
messages; action outputs come only from useSmartHints' validated COMPLETE values.
Action cards are not Chat history and never enter Chat prepare/start payloads.
No Main replay policy or shared contracts are extended. Historical/stale cards
remain reference text; Review Diff asks the current hook for previewFix and checks
the live operation ID and capability. Stored cards cannot mint a SmartFix.

A synchronous Renderer lease prevents Chat/action sends from crossing during
prepare/consent/inference; Main's existing shared coordinator remains authoritative.
Operation-only cancellation preserves the Smart Hints source context and levels,
including cancelling a late prepare ACK without retiring the Hint session.
Closing still retires the whole source session. Source edits invalidate live
proposals and turn pending cards into cancelled references. Diff/Apply/Discard
callbacks and native editor Undo are reused without modifying their transaction.

The existing exercise IPC Cancel route synchronously preserves an already COMPLETE
Hint. This prevents Main/UI progression divergence if completion beats UI polling.
An active Hint Cancel waits for its typed ACK and validates/accepts a winning
COMPLETE through the normal hook path. Other cancellations retain their existing
dispatch. The guard runs after request/owner/frame validation; SH-1 service,
provider, parser, quotas and timeout code are untouched.

## AI-C4-A Renderer Learning Assistant — 2026-11-06

LearningAssistantPanel and useLearningAssistant use only the typed learning.chat
bridge. Main remains the sole history owner: Renderer renders getSession messages,
never constructs or appends optimistic history. Serialized session transitions,
local epochs, operation identity/sequence and terminal guards reject stale work.
Open/get and explicit close cover panel lifetime; context changes cancel the old
turn, update source bindings or retire/open a different exercise/language/chapter.
Unmount cancels inference before a fresh get/close, preventing completion from
advancing the revision between those calls. A bridge-scoped Renderer lifecycle
queue also orders close/open across separate panel mounts, so old cleanup cannot
close a rapidly reopened session. This queue stores no history or provider state.
Main retirement through the existing Submit/navigation context signal is tolerated
when opening the new context. Practice samples its existing read-only Monaco
capture every 200ms only while Chat is visible; known draft changes immediately
disable stale context. Status polling is single-flight at 350ms with cleanup.

All scopes present a prepared manifest before explicit consent/start. Selection
freshness includes range, source and model/version checks; no code is inferred
from a question-only request. Timeline text is rendered as inert React text.
Chat has no storage, editor commands, proposals or Apply/Undo capabilities.
Smart Hints stays mounted with its independent state and lifecycle. Quick Actions
remain outside the Chat timeline until C4-B. No provider/quota/timeout changes.

## AI-C3-B2 application/IPC Chat integration — 2026-11-06

SmartHintsConfiguration now composes ChatService with its existing coordinator,
transport, borrowed credential, known-key content policy, readiness/remote-limit
callbacks and provider generation. Provider/key restore/removal/toggle and budget
changes retire Chat state. Configuration shutdown seals admission and joins Chat
before clearing the key/ledger I/O. Rate/daily budget still has one owner; spending
the last reserved unit does not invalidate that operation. Failed HTTP updates
the existing readiness/remote-limit state without erasing the fixed FAILED status.

LearningChatIpcService registers eight semantic routes. Main's existing app
main-frame authorizer and observed WebContents bind a Main-generated document
scope; no renderer-supplied owner, history, generation or provider authority is
accepted. Local context input is checked against the Main course/exercise
catalogue and Main computes its source fingerprint. No hidden package data,
solution, course text or public Run evidence is automatically captured. Session
guards recheck document and catalogue authority across inference awaits.

Main composition observes navigation/process loss/destruction, wires the existing
Learning context invalidation signal, registers Chat lifecycle and seals it at
STOPPING. Explicit close/update APIs cover panel/context/source notifications;
future C4 must invoke them when its UI state changes. These APIs do not grant
source supplied by Renderer any filesystem/editor authority or prove UI selection
independently of the renderer-owned Monaco model.

Preload exposes `learning.chat` with strict request/result validation, bounded
payloads, session/generation/context/revision/operation/binding correlation,
initial/monotonic sequence and immutable terminal correlation. Local epochs reject
responses after open/update/close/unload. It retains only transport correlation,
not conversation history or quota. Application startup/prepare/open do not infer.
Chat UI, real Gemini/countTokens and installed-artifact acceptance remain later.

## AI-C3-B1 Main Chat orchestration — 2026-11-06

ChatService composes its ContextBuilder/ConversationManager and per-operation
GeminiChatAdapter/SharedGeminiTransport. A mandatory Main provider port borrows
the existing configuration's credential/transport/generation and retirement
subscription; the same existing SharedExecutionCoordinator must be injected.
There is no default coordinator, quota ledger or independently configured model.
Readiness describes configuration/key state, not remaining daily/rate budget:
consuming the final reserved unit must not invalidate its own response.

openSession/getSession/closeSession, prepare/start/status/cancel and updateContext
delegate owner, consent digest, operation ID, revision, TTL, bounded history and
status sequence to the conversation domain. Prepare makes no HTTP request.
Start validates consent before admission, then owns one absolute 10s deadline
(bounded by session expiry), AbortSignal and task cleanup. Only the transport's
beforeInference callback can spend the admitted one-attempt daily reservation.
Valid COMPLETE commits a whole pair; stale/cancelled/failed/late output cannot
commit. Adapter/transport own no retry, session or admission state.

Provider/key retirement notifications purge sessions and abort owned execution;
generation checks also fail closed if notification was missed. Context/language
changes retire through open/update hooks, source changes retain reference history
but invalidate replay. Main close/navigation callers must call closeSession with
the matching trusted owner. stop purges all sessions, removes the provider
subscription and joins Chat tasks; configuration still owns global coordinator
shutdown/drain, including outstanding ledger I/O. Chat release cannot cancel or
shut down a different consumer. C3-B2 adds normal application/configuration and
IPC/Preload wiring; UI and live acceptance remain subsequent work.

## AI-C3-A advisory Gemini Chat adapter — 2026-11-06

GeminiChatAdapter reads immutable prepared input through a Main-only authority
port bound to ConversationManager.capture (execution WeakMap identity/currentness)
and validates replies through ContextBuilder.reply (mandatory content policy).
Historical user/assistant messages become user/model contents in original order;
the last user content contains only the consented question and explicit attachment.
No owner, consent token, context binding, grants or private session state enters
the provider body. A dedicated instruction/schema permits only CHAT_REPLY text.

SharedGeminiTransport retains fixed model/key/readiness, bounded HTTP, external
reservation callback, abort/deadline and safe diagnostics. The complete wire body
must fit 64KiB without truncation; response wire is bounded at 96KiB, reply JSON
at 32KiB and generation at 2048 output tokens. Only STOP, a single model candidate,
valid text parts and the exact reply DTO are accepted. Unsafe/partial/tool payloads
fail closed. Execution freshness is checked across awaits and before return.

The adapter does not commit history, own inference admission/quotas, retry, grant
editor authority or execute code. C3-B1 supplies coordinator admission, the outer
deadline and trusted authority ports through ChatService; normal application
composition remains later. Smart Hints is unchanged.

## AI-C2-B conversation and consent domain — 2026-11-06

ConversationManager owns one RAM-only session per trusted Main owner/document
scope. Public prepare cannot supply owner/history/system instructions/provenance
or action authority. Context, provider-generation marker, Main check callback,
one-use consent token and opaque execution identity bind each operation. Session
TTL is absolute 30 minutes; prepare TTL is 60 seconds. Retire/purge hooks cover
panel/context/navigation/provider/key/shutdown; production event wiring is later.
Source/model updates increment revision, cancel active capture and retain only a
reference timeline; previous context is excluded from replay, including edit+Undo.

Only validated complete user/assistant pairs commit atomically. History is capped
at 32 messages/48KiB with oldest-whole-pair eviction; replay selects up to 8 eligible
pairs. Current context/provider generation must match, and source-derived history
cannot flow into question-only or a different selection. Terminal cancel does not
relabel a completed reply; no proposal, edit or consume authority is represented.

ContextBuilder freezes question, selected history and an explicitly requested
source/selection attachment. Selection mode does not copy outside source into the
provider input. No package solution, hidden tests, Hint progression or Run receipt
is read. Digest covers payload/provenance, context, revision and provider generation;
manifest reports exact input/history byte sizes, selected IDs, no public Run and
tokenCount=null. Input is bounded to 56KiB (8KiB reserved beneath the existing 64KiB
request cap for a future adapter envelope); old replay pairs may be dropped, never
the current question/source/selection. Final HTTP and token checks remain later.

A required Main content-policy port rejects known sensitive forms before prepare
and reply commit; it owns no credentials/provider state and has no permissive
default. Future composition must supply the real policy and owner/context guards.
This domain has no transport, inference timer, quota ledger, persistence or IPC.

## AI-C2-A2 shared Gemini HTTP boundary — 2026-11-06

SharedGeminiTransport owns one bounded request lifetime: fixed Gemini model/URLs,
metadata readiness GET, authenticated JSON POST, response decoding/strict envelope
JSON, byte limits, HTTP/429 mapping, secret checks, abort/listener/reader cleanup
and safe diagnostics. It has no rate window, ledger, conversation or action state.
Reservation remains the injected C2-A1/configuration callback immediately before
POST; normal calls retain the outer Main deadline, with no second timer. Direct
legacy callers retain their existing bounded timer. One lifetime allows at most
one generation, with no retry/fallback; body is detached before reservation I/O.

GeminiSmartHintsAdapter builds the unchanged action-specific instruction/schema/
input, validates candidate/finish/content/usage, parses action JSON, validates Fix
replacement-only wire and projects action diagnostics. SmartHintsService retains
canonical construction, SH-1, guards and publication. Compatibility re-exports
preserve existing imports. Settings' explicit source-free connection check keeps
its original HTTP/error semantics and imports the fixed constants from transport.
The Main-private transport request accepts user/model text contents arrays for a
future adapter, but does not create chat history/session or public capabilities.

## AI-C2-A1 shared execution ownership — 2026-11-06

Normal SmartHintsConfiguration owns one SharedExecutionCoordinator and injects
it into SmartHintsService. Coordinator owns the exclusive admitted execution and
6/minute, 30/hour windows. Settings/configuration retains the only durable daily
ledger, UTC budget, encrypted credential and remote limit state. An admitted
Main-private lease calls that existing reservation port at most once, immediately
before inference; repeated/failed/uncertain calls cannot spend twice or retry.
Neither admission nor metadata checking creates a daily reservation.

SmartHintsService retains consent/owner/status/Hint/Fix authority and the existing
10s/30s timer, AbortController and cleanup. It releases admission in execution
finally; abort alone does not free an unsettled execution. Early release also
waits for outstanding reservation I/O. Configuration provider retirement cancels
and joins the active consumer; shutdown seals admission and drains it. Future
Main consumers must use this configured instance and release after their cleanup,
not instantiate independent rate/budget state. Existing standalone fixtures retain
their rate-only composition. No new public capability or provider wire field.

## Selection Fix isolated syntax recovery — authorized 2026-11-06

Original-source parsing may retain recovery nodes only when every syntax error
is contained in the exact selection inside an intact function body. Required
headers, real body delimiters, supported grammar and target identity must remain
provable. Postflight parses the entire candidate strictly and compares the
outside-target AST and headers against the recovered baseline. No source repair,
normalization or offset changes; canonical construction/SH-1 remain unchanged.
This supersedes the baseline-syntax rejection in historical G0/D6 evidence only.

Roslyn can place a missing-semicolon diagnostic on the next physical token. The
guard accepts that boundary case only with a recovered missing semicolon owned
by a fully selected statement and whitespace-only gap to the token; frozen
offsets never move. Physical token ends define the AST hole, excluding recovery
tokens' zero-width positions. TypeScript likewise checks missing-node ownership
and the preceding statement for its pinned semicolon diagnostic. A diagnostic
being inside selection alone is insufficient. Candidate parsing remains strict.

## SH4-D6-5 integrated selection capability — 2026-11-06

Normal Main provisions MainSelectionFixGuard into SmartHintsConfiguration.
The existing capability IPC now awaits a read-only, single-flight local probe;
only ready parser languages are advertised in canonical C#/JS order. Probes do
not call HTTP or reserve quota. Provider rotation/shutdown abort and join probes;
runtime guard failure withdraws the affected language. Prepare and Start still
fail closed, with per-operation preflight/readiness/postflight from D6-4.

PracticeWorkspace captures through captureFix; the hook retains its exact target
and selection fingerprint. Cursor readiness only cancels an unconfirmed Fix,
using the existing cancel(reference), including a late prepare ACK; it never
retires the Hint context. Explicit consent rechecks and freezes target freshness.
Source/model/revision/context guards remain active through COMPLETE/preview/Apply.
Fix errors require recapture rather than reuse of an already frozen snapshot.

One canonical selection assertion runs before result preview and in the existing
Apply helper. Native transaction/undo stops, single-use consume and readonly Diff
stay in their existing owners. Applied closes through its own callback; Discard
does not report success or mutate source. No raw provider/parser authority crosses
IPC. The normal capability hold in D6-4 is superseded only for actual ready assets.
Installer/ASAR/clean-machine/Windows 10 acceptance and D6-6 remain outside this task.

## SH4-D6-4 Main construction and structural fence — 2026-11-06

The Main-private selection guard port preflights immutable captured source and
trusted signature before PREPARED. No inference/reservation occurs on preflight
failure. The existing Start path rechecks asset readiness, validates replacement
wire and maps one edit using frozen offsets/source.slice; SH-1 stays unchanged.
Only after candidate parse/signature/outside-target structure checks and owned
cleanup may the existing COMPLETE path allocate proposalId. Valid NO_FIX skips
candidate construction and has no grant. Other actions retain their paths.

The app builds a standalone TypeScript 6.0.3 worker and trusted Roslyn helper;
runtime never resolves the TypeScript devDependency or compiles student code.
C# is restricted to validated Windows x64 SDK 10.0.112/runtime 10.0.12/Roslyn
5.0.0.0; unsupported/missing assets or grammar fail closed without regex fallback.
Main validates manifest digests/version/SDK anchors, uses bounded per-operation
resources within the existing outer deadline, and terminates/awaits parser exit.
Private stage/reason telemetry contains no source, selection, response or paths.
The normal composition still supplies no guard and advertises DISABLED/[];
UI/consent/cutover remains D6-5. Canonical output and Diff/Apply/Undo are unchanged.

## SH4-D6-3 Gemini replacement-only boundary — 2026-11-05

Gemini Fix uses its own system instruction and strict schema: EDIT_PROPOSAL has
only replacementText/rationale/evidence; NO_FIX has only reason/advice. The input
keeps full source/public task/signature/context plus action.selection (exact text
and range) and sourceEol. Model identity, private signature identity, hashes and
tokens stay out of provider input. Hint/Analyze/Explain retain the original
complete instruction, schema and input fields.

After strict JSON parsing, Gemini validates Fix with isSelectionFixWire and
returns that private object unchanged. This is not canonical SmartOutput and
does not run SH-1 or construct edits. Existing Main Fix dispatch remains blocked
before reservation/network, so private wire cannot reach public status/Renderer.
D6-4 owns deterministic construction plus source/EOL/no-op/structural/signature
validation; later integration owns actual consent/Diff/Apply acceptance. No
timeout, token, quota, provider selection or process-lifecycle change here.

## SH4-D6-2 selection contract boundary — 2026-11-05

Renderer/Preload/Main share required Fix selection and strict capability fields.
Prepare validates exact UTF-16 slice/positions/EOL/boundaries/caps/proper subset;
bound action contains range plus SHA-256, never selection text. Preload checks
the first reply against source and selection fingerprints and range, then pins
the operation binding. Main clones before package await and freezes its private
capture; signatureIdentity version/hash comes from the trusted public lease and
never enters status/provider DTOs. Selection does not enter the Hint source key.
Normal capability is DISABLED with an empty language list; service start rejects
Fix before reservation/dispatch, and Renderer disables Fix. No legacy fallback.
The private selection-fix.ts validator is unconnected preparation only. Canonical
output, SH-1, provider schema/prompt and manual editing are unchanged. Structural
preflight, wire mapping and full selection consent integration remain later D6.

## SH4-D3 Suggest Fix wire guidance — 2026-11-05

Gemini Main adapter appends exact original-snapshot UTF-16/edit instructions
only for SUGGEST_FIX. Its private inference input adds sourceEol from the
already-validated PRACTICE origin (LF/CRLF), including single-line snapshots;
this enum does not grant new authority or expose model identity/path/secrets.
Suggest Fix JSON Schema adds descriptions only; public/shared output shapes,
constraints and SH-1 predicates remain authoritative and unchanged. Other
actions keep existing prompts/schema/context. No output repair, fuzzy matching,
retry, provider/token/quota/lifecycle or manual editing changes. Offline evidence:
`AI-SMART-HINTS-GEMINI-CONTRACT-FIX-ACCEPTANCE.md`; live quality remains unverified.

## SH4-D1 private failure diagnostics — 2026-11-05

Main-only validation-diagnostics explains rejected outputs without changing the
shared acceptance predicates. Normal configuration correlates projected failure
reasons by ephemeral request ID, then removes that ID from terminal logs/storage.
Allowlisted reason/field/output kind, bounded edit count, provider error origin
and build/model identity extend the existing one-record atomic best-effort sink.
No diagnostic DTO/authority crosses IPC. HTTP, metadata, reservation and later
persistence failures remain distinct privately while public status codes remain
unchanged. No prompt/schema/provider/quota/retry/editing behavior change.
See `AI-SMART-HINTS-GEMINI-DIAGNOSTICS-ACCEPTANCE.md` for offline evidence and limits.

## Suggest Fix failure evidence — 2026-11-03

Main diagnostics now project allowlisted finishReason, configured wire token cap,
inference-dispatch flag, nullable numeric usage counts and envelope/output JSON/
SH-1 schema validation states. Missing provider data remains unknown, not zero.
No source, response text, error message, key or provider-controlled string is
retained. Main atomically stores only its latest Suggest Fix terminal diagnostic
in `smart-hints-last-suggest-fix.json` under userData (bounded one-record file),
independently of the encrypted settings and immutable reservation ledger. Best-
effort diagnostic persistence cannot change inference/acceptance; stop awaits it.
No IPC shape, provider, timeout, token cap or other feature policy changes here.

## Ordinary Gemini Suggest Fix execution deadline — 2026-11-03

Normal configuration selects30s for Suggest Fix and10s for other actions. Shared
defaults, standalone/legacy provider policies and Settings metadata checks remain
unchanged. SmartHintsService owns the execution timer and passes a private
request/deadline/clock context to the provider. Gemini uses the same deadline and
parent abort signal; it does not start a second timer in that composition. Direct
adapter callers retain their existing bounded timer. Validate before and after
output processing; deadline equality fails closed. Per-operation diagnostics are
discarded after one terminal event and contain no source or credentials. Main
logs an allowlisted projection only; no new public IPC field or authority.

## Normal Smart Hints Settings composition — 2026-11-03

Main owns secure native credential input, OS-encrypted key persistence, enablement,
connection state and local usage budget. Narrow settings IPC carries only
booleans/enums/counters, never a key. Renderer settings invoke native credential
entry and status check without source data. The same SmartHintsService used by
Learning/Practice swaps its internal provider on explicit configuration changes,
retaining rate counters and aborting stale operations. Source capture, consent,
strict outputs and manual Monaco transactions remain unchanged. Ordinary and
packaged Windows composition uses this path, default off; acceptance modules are
optional legacy test tools. Native input runs in Main, not a hidden Renderer.

Normal usage policy correction: Main derives local UTC-day usage from immutable
timestamped reservation files and preserves the lifetime reservation sequence.
Default20/day, configurable1–300 via native-confirmed Settings; legacy limits
require explicit review. Local6/min and30/hour throttles remain separate. Main
persists sanitized Google429 kind/cooldown without raw errors or quota IDs.
Metadata success and local-day rollover cannot clear Google's last observation;
only a successful manual inference clears it. Provider cooldowns gate manual
attempts; expiration never dispatches a request. Unknown429 means rate-limited
with unspecified quota, not proof of daily exhaustion. All keys stay in Main.

## SH-4 development Live UI composition — 2026-11-03

Main optionally provisions a scoped acceptance SmartHintsService through a
development argv gate and native attestation. Packaged runtime exits that gate
before parsing/IO/secret access; default service stays disabled. Separate local
userData owns draft/settings isolation and one-use approval/reservation records.
Main limits capture to fixed public ch2-01 draft snapshots, budgets before model
GET and reserves durably before POST. No new shared DTO, IPC, Renderer privilege
or auto execution. Credential is removed from Main environment after acquisition
and retained only in the disposable provider closure; cancel/failure removes the
live-launch credential environment entry. No memory-zeroing guarantee is claimed.

## SH-4 Gemini Main boundary - 2026-11-02

Gemini replaces the active Main provider through SmartProvider/SmartHintsService; no new IPC channels, business DTO shape or UI flow. Only capability identity adds GEMINI_FREE and provider consent copy changes. Fixed REST endpoints and ephemeral Main-only GEMINI_API_KEY, private bounded diagnostics, provider-specific wire schema; internal strict JSON/output/edit checks remain authoritative. Authenticated models.get precedes inference; Free Tier is an explicit Main approval/consent attestation, not inferred from metadata. Default production disabled/10s, isolated smoke30s. Preserve OpenRouter audit modules and artifacts without using their transport in Gemini flow. Offline-only authorization; no billing/retry/fallback or other subsystem change.


## SH-4 development smoke deadline ? 2026-11-02

Isolated Main smoke explicitly selects developmentSmoke after development and
approval gates. Main execution and OpenRouter adapter both use 30000ms; the
Main timer starts first and bounds adapter work, reservation/evidence I/O,
headers, body and validation. Shared/default production policy remains 10000ms.
Only private smoke evidence gains fixed stage/timeout-owner enums; no IPC or
Renderer configuration, schema/parser or lifecycle ownership change.


## SH-4 OpenRouter provider boundary — 2026-11-02

Supersedes NIM provisioning below only for SH-4. Main owns the fixed OpenRouter
Free adapter and ephemeral OPENROUTER_API_KEY behind existing development/approval
gates. Renderer receives OPENROUTER_FREE capability identity, never credentials or
network authority. Existing snapshot consent/start/quota/lifecycle and SH-3 edit
guards remain owners; no new IPC/dependency. Prompt-only JSON, strict bounded
response/action validation, private routed model metadata and discarded reasoning.
Production remains DISABLED; no automatic retry, paid route or alternate endpoint.

## SH-4 authorized provider boundary — 2026-10-29

SH-3 is accepted COMPLETE — PASS WITH LIMITATIONS. SH-4 extends the existing
Main-owned SH provider seam with fixed NVIDIA NIM endpoint/model and ephemeral
environment credential, without a new backend or generic network IPC. Production
and unapproved development compositions stay DISABLED, even when a key is present.
Development and explicit Main approval gates precede reading NVIDIA_API_KEY;
existing consent/start owns the only dispatch. Shutdown aborts operations and
clears the retained credential. JS strings/environment cannot promise memory wiping.
The bounded SH JSON adapter retains fake protocol compatibility; D2 is unchanged.
Capabilities add NVIDIA_NIM without exposing key/endpoint configuration to Renderer.
NIM consent identifies NVIDIA, public snapshot/selection/prior-hint data and
trial/abuse-monitoring limitations. No new edit authority: SH-3 exact source guards,
native Undo, and draft ownership remain unchanged. No real request is authorized yet.

## SH-3 option A verified integration — 2026-10-29

This supersedes earlier SH-3 blocked notes. The approved pinned dependency patch
binds Monaco's global hover factory to its root standalone instantiation service,
with strict build/install version/hash verification and checked rollback. Diff
continues to own ephemeral models. Its component owns one host ResizeObserver and
coalesces mode/dimension writes into a cancellable animation frame; automatic
Diff-root observation is disabled to prevent native-modal geometry feedback.
Cleanup cancels pending layout, detaches model and disposes editor before models.
Native one-batch edits/Undo/source guards and existing draft ownership are unchanged.
Only injected FAKE may enable local Apply; default production has no provider/key
and remains DISABLED. No new IPC editing/process/filesystem authority or shared
preview service. Delivery FIXED — AWAITING USER ACCEPTANCE, SH-4 NOT_STARTED.

## SH-3 unblock diagnosis — 2026-10-29

No architecture change is authorized or implemented. The independent reproducer
establishes an installed Monaco dependency lifetime defect: a global hover factory
retains the instantiation service of a disposed Diff. A separate live editor can
then fail creating SuggestWidgetStatus/ActionBar. This does not require an Apply
transaction, draft write or SH controller. The dependency correction is a pending
decision in [Unblock options](AI/AI-SMART-HINTS-SH3-UNBLOCK-OPTIONS.md). Native Redo
and strict console safety gates remain open; all normal Diff/Apply controls stay
disabled. No window-owned preview service or internal Monaco bridge was added.

## SH-3 local diff and transaction — 2026-10-29

**Release gate BLOCKED:** real-editor stress produced unresolved disposed-service/
model errors and a native Redo timeout. The implementation below is gated off:
all normal compositions, including FAKE, report Apply false; Diff entry is hidden.
Only the separate diagnostic harness injects true. Do not treat the description
as a successful safety/acceptance claim. See SH-3 acceptance for actual results.

Verified current Practice COMPLETE proposals may mint an immutable, single-use
Renderer-local grant. Its verified source SHA-256 binding is retained from the
operation; exact source equality to that hashed snapshot, context, revision,
snapshot closure/model object, URI, local model ID/version, EOL and TTL are
rechecked synchronously at Apply. No rehash await or rebase between guard and edits.
`smartCandidate` is repeated before mutation; a single `executeEdits` batch is
bounded by native Undo stops, maps primary/reversed/multiple selections and keeps
scroll/focus. No setValue/custom undo or rollback fallback. A failed transaction
locks the editor's Apply capability. Existing onChange/usePractice/DraftQueue owns
Apply/Undo/Redo persistence; no draft format/Storage owner change. Stale/consumed
preview grants are cleared; ephemeral diff models are disposed independently.
The schema permits true only with FAKE, but current runtime keeps Apply false in
all normal compositions after the failed safety gate. Production remains DISABLED;
no provider/key, IPC edit authority or auto Run/Submit. SH-4 stays gated.

## SH-2 Renderer integration — 2026-10-28

After formal SH-1 acceptance, the authorized Practice drawer uses the unchanged
`learning.smartHints` capability. Renderer captures exact Practice model identity,
version/source/primary selection or a single registered Solution code node with
independent language. Explicit per-action snapshot consent precedes `start`.
Independent context retirement covers edit/model change, reset, admitted Restore,
exercise/language switch, leaving Learning, pagehide, close and disposal. Late
responses cannot publish into a retired context; uncertain ACKs recover status
without replaying start. Admission records Solution origin before asynchronous
hashing, so retirement also revokes captures that have no operation yet. Solution
snapshots bind descendant DOM identities as well as text; equivalent-text
retokenization retires selection provenance. Manual recovery replaces the one
scheduled status poll. The editor remains mounted while opening the drawer.
Proposals are read-only; no edit/Apply API or D2/Run/Submit authority is added.
Production remains DISABLED with no provider/key. SH-3/SH-4 remain separately gated.

## SH-1 Smart Hints core — 2026-10-28

SH-0 accepted COMPLETE — PASS WITH LIMITATIONS; SH-1 implemented pending acceptance.
Separate `learning.smartHints` typed capability and Main service own public capture,
consent/token, sequence, SH context/session, quota, abort/TTL and validated outputs.
Main IPC reuses owner/main-frame/document authority without the Run/Submit service
generation. Source retirement does not call Run/Submit/D2 context invalidation.
Main-private Public Run Receipt copies verified public mapping during the same Run
lease, binds source fingerprint/operation/schema and is released/expired separately.
Only terminal finalized safe public results attach to matching captures; otherwise
CODE_ONLY. No Official acquisition or raw logs/paths/stack enter SH capture.
Structured UTF-16 proposals validate against exact captured old text; no Apply API.
Production composition has no provider/key/network transport and reports DISABLED.
Only tests inject the fake transport adapter. D2 contracts/policy, Judge, Storage,
History, Completion and Renderer remain unchanged. See
[SH-1 acceptance](AI-SMART-HINTS-SH1-ACCEPTANCE.md) for baseline test/typecheck limits.

## WA-B2 authorized UI boundary — 2026-10-28

WA-B1 is formally accepted COMPLETE — PASS WITH LIMITATIONS; evidence and native/
build/Electron/performance limitations remain unchanged. B2 consumes existing
SubmissionStatus in the Renderer observer; PracticeDescription owns the dynamic
Wrong Answer tab and a presentational panel renders only validated public values
or fixed fallback. No History persistence or Main/IPC authority/contract changes.
Reuse existing Tabs/Practice tokens and same operation/context/sequence suppression.

## WA-B1 approved boundary — 2026-10-28

Same leased package verifies public prefix/sample identity/args/Expected; only
public sample source values and the same settled comparison's Actual enter a
bounded detached diagnostic. Judge verdict reduction is unchanged. Only final
qualified WrongAnswer publishes the diagnostic through existing SubmissionStatus
projection/IPC/typed Preload, under existing owner/frame/context/ref/sequence checks.
Capture errors never alter grading.32 KiB diagnostic fits unchanged256 KiB response.
Hidden mismatches or unverifiable provenance use a fixed unclassified fallback.
No hidden values/Official case metadata/logs/private plan details cross transport.
Diagnostic retires with operation/context and never enters persistence/History.
This public-only ADR-025 exception adds no authority, channels, UI or network.

## AI-D2 authorized boundary — 2026-10-28

Dedicated `learning.analysis` prepare/start/status/cancel → typed Preload → Main
semantic channels. Existing Exercise IPC owns source-reference decryption and
owner/main-frame/context stamps. Main captures a bounded exact committed source
from SubmissionReadModel and version-matching statement using the Registry's
public capability. Capture releases store/Registry resources before dispatch;
no private record or storage authority crosses IPC. Main-private provider seam
reuses the accepted D1 direct adapter with fixed request policy and strict JSON.
TTL/single-use capture, explicit versioned consent, requestId/sequence, context
revocation and independent AbortController protect lifecycle. Advisory results
are ephemeral; no grading, completion, editing or persistence authority. Default
composition supplies no provider/credentials and fails closed. Local AI remains
separate. UI/live provisioning require separate authorization. E7 is unchanged.

## 1. Architecture goals

Student Coding IDE is an independent Electron + React + TypeScript desktop application. Orca is evidence for architecture study only; this design does not depend on Orca source, history, or runtime artifacts.

V1 architecture prioritizes:

- a complete local-first student workflow on Windows 10/11;
- a narrow Electron security boundary;
- explicit ownership of files, processes, state, and cleanup;
- responsive renderer behavior for I/O and long-running operations;
- graceful degradation when Git, runtimes, or current Monaco providers are unavailable;
- simple module boundaries that can support future formatter, debugger, and AI work without implementing them now.

The architecture is requirement-driven. It deliberately omits Orca's agent, worktree orchestration, remote execution, cloud, mobile, and hosted-review complexity.

## 2. Process model

```text
Renderer (sandboxed React UI)
  |-- Monaco models and editor UI
  `-- Phase 3 Monaco-native language providers/workers
        |
        | typed, validated preload API for privileged domains only
        v
Preload Bridge
        |
        | Electron IPC
        v
Main Process
  |-- Project / Filesystem / Search
  |-- Settings / Persistence / Git
  `-- Terminal / Run / Process Manager

Phase 5.5 C# language intelligence after the 5.5B hard gate:
Main-owned LanguageServiceManager -> app-owned pinned csharp-ls child process
```

The application starts as one main window in V1. The main process owns application readiness, window creation, dependency/service initialization, shutdown coordination, and cleanup of IDE-owned processes. Multi-window, deep links, custom protocols, and background/tray behavior are not V1 requirements.

### Process ownership matrix

| Capability | Owner | Reason |
|---|---|---|
| Electron lifecycle and windows | Main | Electron privileged API ownership |
| Filesystem and project search | Main | Path authorization and non-blocking I/O boundary |
| Terminal PTY | Main | Native process ownership and cleanup |
| Run execution | Main | stdout/stderr/exit/stop and process-tree lifecycle |
| Git CLI | Main | External executable and repository path validation |
| Settings and persistence | Main | Controlled local storage and atomic writes |
| Runtime/dependency detection | Main | PATH and configured executable validation |
| Current Phase 3 Monaco language providers | Renderer browser workers | No external process or privileged authority required |
| Phase 5.5 C# language-server process | Main child process | Isolation, project scope, lifecycle, protocol routing, and cleanup |
| Monaco and its browser workers | Renderer | Editor is a browser UI concern |
| Tabs, dirty state, view state | Renderer | Interactive editor state |
| Explorer, Problems, Terminal, Output, Git UI | Renderer | Presentation and user interaction |
| IPC contract implementation | Preload + Main | Capability-limited bridge and validation |

## 3. Main, preload, and renderer responsibilities

### Main process

The main process may access Node and Electron privileged APIs. It:

- creates and secures application windows;
- validates project roots and all filesystem paths;
- owns ProjectService, FileSystemService, SearchService, SettingsService, PersistenceService, TerminalService, RunService, GitService, DependencyDetectionService, ProcessManager, and the Phase 5.5 C# LanguageServiceManager lifecycle;
- serializes domain errors across IPC;
- forwards scoped events only to live renderer subscribers;
- coordinates shutdown and cleans up PTYs, run processes, watchers, and the C# language server.

The main process must not expose a generic shell runner to the renderer. Long operations must be asynchronous and cancellable where required.

### Preload bridge

Preload is a thin adapter. It exposes domain APIs with explicit input/output types, not Electron primitives. It does not contain business logic, retain application state, or expose `ipcRenderer` itself.

Candidate public surface:

```text
window.studentIde.project
window.studentIde.file
window.studentIde.search
window.studentIde.terminal
window.studentIde.run
window.studentIde.git
window.studentIde.settings
window.studentIde.lifecycle
```

Phase 5.5 adds a narrow `window.studentIde.language` semantic surface. It exposes
typed C# capability requests, document synchronization, diagnostics/status
events, and cancellation only. It never exposes raw LSP/JSON-RPC, process
controls, executable details, cwd, spawn arguments, or canonical project roots.

### Renderer

The renderer owns React presentation and interaction state. It may request authorized operations through preload, but it cannot access Node, arbitrary filesystem paths, raw IPC, a shell, or child processes directly.

The renderer modules are:

- Application Shell;
- Project and Explorer UI;
- Editor UI and EditorModelManager;
- current Phase 3 language provider orchestration and Monaco workers;
- Problems UI;
- Terminal UI;
- Output UI;
- Git UI;
- Settings UI.

## 4. Service boundaries

| Module | Responsibility | Explicit non-responsibility |
|---|---|---|
| ProjectService | Open/create/close/switch one local folder project; validate root; persist minimal recent-project metadata needed by project lifecycle | User-facing Recent Projects UX/management, file content, editor tabs, Git behavior |
| FileSystemService | Scoped list/read/write/create/rename/delete/stat/watch operations plus authoritative active-project filesystem availability | UI state and Monaco models |
| SearchService | Async project search with exclusions, progress, cancellation token | Renderer traversal of project files |
| EditorModelManager | File-to-Monaco-model mapping, dirty status, view state, language id, disposal | Direct disk access |
| TerminalService | Interactive PTY sessions, input, resize, shell profiles, terminal exit | Run-button output semantics |
| RunService | Bounded non-interactive run sessions, stdout/stderr/exit/stop | Interactive shell sessions |
| ProcessManager | Internal registry and common child-process cleanup primitives | Generic renderer command execution |
| GitService | Typed local Git operations and error mapping | Hosted PRs, credentials UI, arbitrary Git command bridge |
| Renderer LanguageProviderManager | Current Monaco provider registry, capabilities, bounded source synchronization, diagnostics, status | Disk access, runtime execution, external process ownership, Problems presentation |
| Main LanguageServiceManager | Phase 5.5 C# session registry, `csharp-ls` lifecycle, validated semantic routing, synchronization, diagnostics, status, and cleanup | Runtime execution, Monaco presentation, Problems presentation, or generic process control |
| DependencyDetectionService | Detect runtimes, Git, and C# language-service dependencies independently | Starting those services/processes |
| SettingsService | Validate/default/update user and workspace settings | Renderer-only transient state |
| PersistenceService | Versioned local serialization, atomic writes, recovery | Feature-specific policy |

## 5. IPC architecture

IPC contracts live in a shared, side-effect-free contract layer. Each domain defines request, success, error, and event payloads. Runtime input validation occurs in the main process even when TypeScript types exist.

### Interaction forms

- **Request/response:** finite operations such as `file:read`, `file:write`, `git:status`, or `settings:get`.
- **Event stream:** repeated output such as `terminal:data`, `run:stdout`, diagnostics, and watcher changes.
- **Lifecycle event:** service/session transitions such as `terminal:exit` and `run:exit`; Phase 5.5 C# adds scoped language-status events.
- **Cancellation:** an operation starts with an opaque operation/session ID and is cancelled through a domain-specific endpoint.

### Naming convention

Use `<domain>:<verb-or-event>` in lowercase kebab case. Candidate channels include:

```text
project:open            file:list-directory
project:close           file:read
search:start            file:write
search:cancel           file:changed
file:get-status         file:status-changed
terminal:create         terminal:event
terminal:input          terminal:resize
terminal:close
run:start               run:stdout
run:stop                run:stderr
run:exit                git:status
settings:update
```

No public `language:start`, `language:stop`, `language:restart`, raw-log, or
external-provider process channel is part of V1. Phase 5.5 language IPC uses
semantic operations and Main-owned lazy lifecycle only.

Event subscriptions return an unsubscribe function. Main removes listeners when a WebContents or session is destroyed. Event payloads include a session/operation ID so stale output cannot update a replacement session.

### Errors

Thrown Node/Electron objects never cross IPC directly. Main maps them to:

```ts
type AppError = {
  code:
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'INVALID_INPUT'
    | 'DEPENDENCY_MISSING'
    | 'PROCESS_FAILED'
    | 'PROCESS_CANCELLED'
    | 'SERVICE_CRASHED'
    | 'UNSUPPORTED'
    | 'INTERNAL_ERROR'
  message: string
  operation?: string
  details?: Record<string, string | number | boolean | null>
  retryable: boolean
}
```

Messages are safe for users; developer details and stack traces remain in logs. Paths and command arguments that could contain secrets are redacted where appropriate.

## 6. State ownership

| State class | Examples | Owner/storage |
|---|---|---|
| Persistent app state | recent projects, theme, editor preferences, configured executable paths | Settings/Persistence in main |
| Workspace state | open tabs, active tab, panel visibility, optional cursor/view snapshots | Versioned state keyed by canonical project path |
| Editor state | Monaco models, dirty buffers, disk-missing/conflict state, selections, undo stack | EditorModelManager in renderer; never blindly overwritten by disk |
| Ephemeral UI state | dialogs, hover/loading state, menu state | React component/feature store only |
| Process state | terminal/run session IDs and lifecycle; one active-project C# language session | Owning main-process service |

React local state and focused feature stores are sufficient initially. Selection of a renderer store library is `TBD` until Phase 2 demonstrates cross-feature needs; Redux/Zustand is not selected solely because Orca uses Zustand.

### Phase 9 direction — workspace modes and Learning ownership

Status: Phase 9 IN_PROGRESS; 9A–9C COMPLETE. 9D Common, 9D.1, 9D.2 and overall
9D are **COMPLETE — PASS WITH LIMITATIONS**, finally accepted by the user
2026-10-23; A01/A02/A03 FIXED — PASS. 9E–9G remain NOT_STARTED. This status-only
reconciliation changes no architecture, security boundary, Policy B or budget.
[Accepted 9D review](PHASE-9D-FINAL-REVIEW.md) preserves scoped Windows 11 evidence,
unverified Windows/UNC/9G and all other named limits; repository lint remains FAIL.
Execution-time status notes below are historical and superseded by this closure.
The detailed 9A–9G roadmap is in Implementation Plan Section 13.6.
Existing Phase 1–8 decisions remain unchanged.

The current three-column Project Mode layout in `App.tsx` remains authoritative:

| Surface | Project Mode | Learning Mode |
|---|---|---|
| Left `.project-sidebar` | Projects: Open/Switch, Create, Active Project, Recent Projects, Settings | Learning Roadmap: chapters and progress |
| Center `.preview-surface` | EditorWorkbench plus Terminal / Problems / Output; tabs and Run integrated in the workspace header | Learning Workspace, using space released on the right |
| Right `.explorer-sidebar` | Project Tools: Explorer, Search, Source Control / Git | Hidden |

Learning extends the IDE as a separate application workspace mode; it is not a
project, modal, dialog, editor tab or replacement for Project Mode. An application
header Learning entry beside Local AI (`GraduationCap` from existing lucide-react
as the icon direction) toggles Project ↔ Learning. No additional sidebar is
created. Hide Project bottom panels in Learning; Exercise Test Cases / Result
remain separate from Project Output. No fixed pixels or percentages are prescribed
for Learning layout or its optional resizable problem/editor split.

#### Mode state and lifecycle

Entering Learning changes presentation, not the active project. It must not
close/switch the project, close documents, discard unsaved code, restart terminals
or reset project state. Preserve active project, open/active documents, unsaved
buffers, Monaco models, Projects sidebar state, selected Explorer/Git tab and
presentation state, terminal sessions and bottom panel state; restore them when
returning where applicable. Hiding presentation must not invoke project/document/
process teardown.

Project and Learning state are isolated. Learning → Project → Learning resumes
chapter, lesson/exercise/quiz, selected language, code draft, applicable Run/Submit
results and learning position. Renderer owns interactive presentation/session
state; Main retains privileged process and persistence ownership. Owner-loss and
application-shutdown cleanup still apply. ADR-011's unresolved shared state choice
is not resolved by this direction.

#### Learning domain and content

Use local data-driven Course, Chapter, Lesson/material, Exercise and Quiz content,
separate from React logic. Never hard-code chapters in components. The only
subject is Kỹ thuật lập trình, with exactly the eight chapter names/order in
Requirement Section 21, Phase 9; no course selector/management or chapter 9/10.
Chương 1 — Giới thiệu môn Kỹ thuật lập trình covers introduction, objectives, skills, learning
method and mode guidance without mandatory exercise/quiz. Later chapters may
expose Lý thuyết, Luyện tập, Trắc nghiệm and Tiến độ. Theory/quizzes are selected
and authored from Internet references, stored locally for offline use, with
provenance and license/copyright compliance. No automated scraping or bulk copying
of copyrighted material; no CMS or actual content import in this design task.

Learning Workspace hosts Course Introduction, Lesson Workspace, Exercise List,
Exercise Workspace and Quiz Workspace. Material opens lessons; Practice opens
the exercise list then an exercise; Quiz opens the quiz workspace. Exercises group
by chapter, not topic/tag, with Easy/Medium/Hard difficulty and Chưa làm / Đang làm /
Hoàn thành status. LeetCode-inspired problems require suitable rights or lawful
reauthoring with source attribution.
Quizzes support theory multiple choice, code reading, predicted output and error
identification, with navigation, answers, scoring and results.

#### Exercise documents and shared Monaco foundation

Project Document != Exercise Document. Reuse current Monaco/editor infrastructure
and shared configuration/wrappers where appropriate; do not duplicate the editor
architecture. Project EditorModelManager is not the source of truth for exercise
code. Exercise documents have independent identities, sessions and model
lifecycles; code is not automatically written to the student project or shown in
its file tree. Shared foundation extraction belongs to an authorized future
implementation package.

Exercise Session owns exerciseId, selectedLanguage, solution drafts per language,
current Run/Submit results, completion/progress and draft/dirty state where needed.
C# → JavaScript → C# preserves the earlier C# Code Draft. Results remain associated
with the appropriate session/language/code. The workspace header provides
breadcrumb/title, language selector, Run and Submit; the Problem panel and Monaco
editor sit above Test Cases / Run Result / Submission Result, with My Solutions
evolving into persisted Submission History for Accepted and trustworthy graded
failures; My Solutions→Submission History migration is APPROVED H5. Problem content
includes Description, Input, Output, Examples and Constraints.

The Exercise model is language-neutral: id, title, difficulty, statement, input/
output specifications, examples, constraints, test cases and allowed languages.
Language metadata defines the function, parameters/types, return type, starter
code, compatible test cases, Monaco language id and runtime adapter. Only C# and
JavaScript are in Phase 9 V1; Python/Java are excluded. This does not expand current Project
Run or language intelligence capabilities.

#### Approved 9D.2 JavaScript architecture (2026-10-22; single-sample internal execution verified)

Use one fresh Node.js process/Learning Windows Job per Main-catalogue sample,
a fixed harness and `node:vm` context separation. This is local process
containment, not a malicious-code security sandbox: vm/Jobs/workspaces do not
restrict filesystem/network/account rights or guarantee authentic child results.
Never evaluate student code or serialize its live objects in Main/Renderer.
Only synchronous functions and existing int32/boolean/string/int32[]/string[]/
int32[][] types are supported; imports/npm/async are excluded.

A Learning-only resolver selects the first verified compatible stable Node 24.x
on absolute Main PATH entries, without patch pin, shell/CWD search, Project
resolver, auto-download or major fallback. Junction/nvm is permitted only with
safe canonical target/identity verification; retain and revalidate selection
within the operation. Fixed version/capability probes run in an owned Learning
Job during Prepare with 512 MiB aggregate commit and within the original 10 s
Prepare/60 s operation due. Step 2 implements the narrow Learning-only Prepare
quota/context mapping: JavaScript gets 512 MiB, C# retains null/non-process Prepare.
No unowned probe or relabelled execute. The fixed probe retains all Jobs and raw
I/O accounting in the existing adapter; selection revalidation captures alias and
canonical ancestry/file metadata. Native/Policy B implementation is unchanged.

Parse-only syntax checking uses the existing compile phase (30 s/2 GiB), without
running student top-level code. Each execute retains 2 s including startup/
serialization/I/O and 512 MiB. Strict versioned UTF-8 JSON stdin/EOF and one stdout
response are schema/index/type/size validated; distinguish syntax, runtime and
protocol failures. Raw bytes across all processes retain the 1 MiB operation cap.
Sequential samples require the existing VERIFIED barrier; cancellation, ownership,
cleanup/retry/recovery, one-operation admission and Policy B remain unchanged.

Add a JavaScript-specific result DTO/optional observation over existing Exercise
channels and Result Panel; preserve C# contracts. Reject language/schema/ownership/
revision mismatches and stale results; bound the full snapshot envelope. No Judge,
comparison, Submit, Accepted/Wrong Answer, persistence or new Stop/Cancel UI.
Installed Node only in 9D.2; bundling/distribution is 9G. Six implementation steps,
targeted tests and Windows 10/11 verification requirements:
[9D.2 plan](PHASE-9D2-JAVASCRIPT-PLAN.md). Step 1 separately authorized 2026-10-22:
standalone DTOs/strict protocol validators and Main-only ports implemented;
[contracts evidence](PHASE-9D2-JAVASCRIPT-CONTRACTS.md). Step 1 COMPLETE — PASS WITH
LIMITATIONS by user acceptance 2026-10-22 (pre-existing full-repo lint limitation
accepted); 9D.2/Common IN_PROGRESS. Step 2 COMPLETE — PASS WITH LIMITATIONS by
user acceptance 2026-10-22, with 169 targeted tests PASS,
including 10 real Prepare Jobs on Windows 11 x64 and one real C# Sum regression;
[Step 2 evidence/accepted limitations](PHASE-9D2-NODE-RESOLVER-PROBE.md).
Step 3 separately authorized/implemented and accepted 2026-10-22 is COMPLETE —
PASS WITH LIMITATIONS: fixed raw child asset, exclusive identity/hash-verified files,
parse-only vm.Script syntax check and Main-internal sample-0 execution. A fresh
context receives primitive JSON only; console/arguments/result normalization are
context-owned, and Main sees validated bytes only. Strict Step 1 request/response
validation and private syntax frames separate syntax/runtime/protocol errors.
259 targeted tests PASS, including 60 native operations / 172 Jobs with VERIFIED
cleanup on Windows 11 / Node v24.16.0 x64. [Step 3 evidence/limits](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md).
Step 4 separately authorized/implemented 2026-10-22 is COMPLETE — PASS WITH LIMITATIONS
by user acceptance 2026-10-23: Main-only JavaScript adapter/orchestrator, Prepare/Syntax once,
sequential fresh Jobs, VERIFIED barriers and fail-fast with exact suffix.
160 targeted tests PASS, including 16 native cases / 57 JavaScript Jobs all
VERIFIED/closed; selected real C# multi-case regression PASS.
[Step 4 evidence/limits](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md). Step 5 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE;
production integration evidence: PHASE-9D2-JAVASCRIPT-UI-IPC.md. Step 6 was separately authorized 2026-10-23; no next-phase work is authorized. No architecture/Policy B, existing
runtime/native, Step 1 or C# contract changes.

#### Exercise, Judge and runtime boundary

Learning V1 uses function-signature test harnesses. Students implement the supplied
function, not Main() or a complete Console program. Exercise Runtime generates
the driver, compiles if necessary and calls the function in a controlled child
process. Students need no project, Terminal or compiler command. Internal pipes
and output capture are transport details, not a STDIN/STDOUT problem contract.
Phase 9E Run uses current code with public samples only and comparison; custom
Run is deferred pending separate authorization. Show Input, Expected Output,
Actual Output, Passed/Failed and errors. Run never saves an Accepted Solution or
marks completion. Submit judges official public/hidden cases against the code
snapshot taken at Submit; only 100% pass earns Accepted.

User clarification (2026-10-19): Practice exposes Run and Submit only, with no
Stop/Cancel UI. Runtime stop/cancellation is internal lifecycle behavior for
timeout, resource limits, exercise/language switches, leaving Learning, application
close and cleanup. A narrow owner-validated stop() contract may support lifecycle
calls without creating a user-facing control. Unlike mode-state retention,
leaving Learning cancels active Exercise execution; Project/Terminal sessions
remain unchanged. Submit/Accepted persistence and My Solutions integration belong
to 9E, with successful persistence required before saved/completion acknowledgement.
Initial Common quotas/deadlines were subsequently approved on 2026-10-20;
the JavaScript Prepare probe mapping was approved on 2026-10-22 below.
This clarification authorizes no UI or production implementation.

```text
Renderer → typed Preload API → IPC → Main
  → Exercise Service → Run public samples OR Judge official Submit tests
    → Exercise Runtime adapter → C# compiler/SDK + driver OR Node.js + driver
  → Judge result → eligible graded record persistence → history saved status
    → completion acknowledgement only for committed Accepted
```

These are planned responsibilities, not implemented APIs/modules. Exercise
Service coordinates owned exercise execution; Judge Service owns test
orchestration and comparison; runtime adapters own language-specific harness,
prepare/compile/execute coordination in Main. Student code never executes directly
in Electron Main or Renderer. The runtime foundation supports temporary exercise
workspaces, bounded process I/O, time/resource limits, Stop and cleanup.
Project Run and Exercise Run may reuse narrow internal process primitives while
retaining separate session lifecycles and behavior. No generic command executor
is exposed to Renderer.

**9E-0 approved design, 2026-10-23:** design/documentation is COMPLETE. At that
approval,9E implementation was NOT_STARTED; subsequent user acceptance9E1-AC1
closes **9E-1 COMPLETE — PASS WITH LIMITATIONS**.9E remains IN_PROGRESS,
subsequent 9E-2 design approval authorizes E2-S1 only (9E-2 IN_PROGRESS; S1
COMPLETE — PASS after separate M1=A approval; S2 accepted COMPLETE — PASS WITH
LIMITATIONS; S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — ACCEPT WITH LIMITATIONS; S5 COMPLETE — PASS WITH LIMITATIONS; S6 Wave A IN_PROGRESS (delivered/pending user acceptance); B–D/S7 NOT_STARTED).
All six architecture decisions and
9E0-A1–A4/B1–B3/C1–C3 are recorded in
[ADR-025 approval](DECISIONS.md#phase-9e-0--approved-judge-and-submit-decisions-2026-10-23).
Exercise Packages with stable IDs and a data-driven Main registry feed a Generic
Judge; adding compatible data does not change the Engine. Main allowlists
`exact-typed@1` for six types; private C# Submit protocol evidence retains Run
compatibility. Foundation package schemas/modules and approved ProductExceptSelf
sample migration are implemented/accepted in9E-1; later private-runtime/Judge/
Submit APIs remain unimplemented. This status closure changes no architecture.

Judge consumes settled evidence through the existing language orchestration in
the same ExerciseService operation/ExerciseSession; it creates no independent
admission, process lifecycle, timer or cleanup manager. Public samples precede
hidden official cases; development-time verified frozen sets have no fixed count.
Submit projection exposes aggregate counts, coarse stages and safe verdict/status
only; no hidden inputs/expected/actual/console/diagnostics or case-level metadata
on invoke/event/poll/stop/error routes. Run retains public-sample detail.

Learning-only `accepted.json` uses versioned immutable records, serialized writer
and store-wide OS lease, staging/sync/read-back/backup/atomic replacement and commit
identity verification. Snapshot64 MiB, record2 MiB, metadata16 KiB; warn48/56 MiB;
free disk≥2×candidate bytes+16 MiB; no per-exercise version-count cap or automatic
version deletion. Summary32 default/100max, response256 KiB, row1 KiB, cursor512bytes,
source chunks32 KiB. Commit final guard plus same-turn replacement dispatch marks
admission; cancellation before it prevents replacement, afterwards settle/reconcile.
15s caller/storage-shutdown wait and5s slow notice retain underlying I/O/lease;
safe retries≤3 total with250ms/1000ms backoffs, no ambiguous blind retry. Core close
signal is not storage cancellation; runtime cleanup12s remains separate. Managed
shutdown joins runtime and retained commit before disposing dependencies. Completion
derives only from verified committed Accepted records; Submission History also
reads committed graded failures under the amendment below; pending/saved/failed/
unknown are distinct from execution verdict and cleanup proof.

Approved storage/coverage/performance release criteria and measurement matrix are
specified in [A/B/C decisions](PHASE-9E0-REMAINING-DECISIONS.md), with
[design sequences/integration](PHASE-9E-JUDGE-SUBMIT-DESIGN.md). Targets are
NOT MEASURED, acceptance UNVERIFIED until demonstrated; no implied Windows10/UNC/9G
PASS. Failed benchmark requires evidence and approval of remedies, not an automatic
capacity/architecture/quota change. Existing runtime60s/2s, all phase/memory/output
limits and Policy B remain unchanged.

Renderer remains unprivileged. Main runtime-validates typed requests, allowed
languages/actions and exercise/session/operation ownership, controls temporary
paths and compiler/runtime invocation, rejects stale results, bounds execution
and output, and cleans up owned processes/resources. Preserve existing Windows
ownership and shutdown rules. Common policy was approved on 2026-10-20 in ADR-025;
integration and production acceptance remain due. Temporary workspaces do not
alone establish OS sandboxing.

**9D Common contract (approved 2026-10-20):** Main issues opaque Exercise session
IDs/generations; IPC derives owner from the authorized sender/frame, never a
renderer-supplied owner or Project ID. Run captures code/source revision; snapshots
carry session/generation/sequence for stale-result rejection. Lifecycle stop is
context change/leaving Learning; timeout, resource, owner-loss and shutdown causes
originate in Main. DTO validation does not authorize a sender or prove termination.
Public DTOs contain no paths, argv, PIDs, Job handles, hidden tests or Judge verdicts.
Shared declarations live in `src/shared/contracts/exercise.ts` and
`exercise-validation.ts`; step 1 does not wire StudentIdeApi, IPC, native or UI.

Learning owns its manager lifetime, process adapter/Job and managed cleanup
barrier; reuse ProcessManager APIs unchanged. Main composition registers additive
Learning dependencies/service/IPC/owner subscriptions so reverse shutdown stops
admission/events before dependencies disappear. STOPPING seals admission and
invalidates generation synchronously. Owner navigation/destruction, context
switch and leaving Learning cancel only Exercise. DesktopApplication and quit
coordinator retain their existing failure/retry behavior; unresolved Learning
cleanup rejects stop and prevents final quit. Project/Terminal/shared process
and Project native implementation remain unchanged.

One Learning operation, sequential cases, no queue. Operation due is 60 s after
admission on a monotonic clock, never reset by phases. Prepare/probe is 10 s total,
compile 30 s, execute 2 s/case including startup; each phase is clamped to operation
due. Cleanup is outside this budget, with a 12 s caller wait over all cleanup,
including I/O. Timeout rejects the caller while retaining task, lease and ownership.
Retry joins pending work; after a failed task settles it can resume its retained
stage. No overlapping destructive cleanup or replacement admission over unresolved
ownership. The spike demonstrated the caller-boundary pattern at a reduced deadline;
its PolicySession is not an already complete whole-I/O deadline implementation.
Compile/execute Jobs have 2 GiB/512 MiB aggregate committed-memory limits, set/read
back before launch and covering descendants. Output is 1 MiB combined stdout/stderr
UTF-8 per operation; overflow cancels and cleans safely. These are initial approved
settings, not universal workload guarantees. Runtime OOM alone is not quota proof.

Policy B separates current termination proof, historical coverage and service
finalization. Empty Job/ActiveProcesses, retained identity handles signaled and
settled observers without unresolved errors establish current termination.
TotalProcesses mismatch alone is a historical gap, not a live process. Complete
coverage gives VERIFIED; incomplete coverage gives HISTORY_UNVERIFIED, quarantine
and false processClean/cleanupComplete even after service finalization. Pending
handles or failed verification give PROCESS_UNRESOLVED with retained ownership.
Acknowledged stages: OWNED → RELEASE_READY → native release/handle closure →
FINALIZED; only VERIFIED then permits identity/containment-checked deletion and
CLEANUP_COMPLETE. Write/sync/replace/read-back checkpoints; retry never operates
on released native state. Recovery validates checkpoint/workspace under an exclusive
lease, never kills recorded PIDs; OWNED/RELEASE_READY and historical gaps quarantine,
VERIFIED/FINALIZED may finish deletion. No automatic quarantine removal is approved.

**Native Learning implementation (Common step 3, 2026-10-20):** private Node-API
8 binding `runtime/native/learning-job.cpp`, loaded by `windows-exercise-native.ts`;
`windows-exercise-adapter.ts` implements the Core port and
`windows-exercise-lease.ts` implements the exclusive lease port. Each process
phase has an independent Job; adapter evidence aggregates every phase Job and
keeps old identity handles until staged cleanup. The binding sets/read-backs hard
Job commit and KILL_ON_JOB_CLOSE before CreateProcessW with JOB_LIST/HANDLE_LIST
attributes and CREATE_SUSPENDED. Root membership/creation identity is retained
before returning the suspended owner; Main retains it, checks quota/ownership and
deadline, then resumes. A delayed synchronous launch never resumes after its
deadline. This is process containment, not a full filesystem/network sandbox.

Bounded nonblocking pipe/Job polling retains descendant process handles and PID +
creation identity. Current members, ActiveProcesses, signaled handles and EOF/root
observer settlement gate release; TotalProcesses mismatch remains historical
uncertainty. Job memory-limit completion event 10 is distinct from runtime OOM
stderr/nonzero exit. Metrics are Job committed memory, never RSS. Native stage
query works after OS Job release so ambiguous errors can be reconciled without
querying/releasing a closed Job. Per-Job/per-handle successful actions are retained
for partial-failure retry. Finalizer/owner death containment is not clean proof.
File leases use non-inheritable FILE_SHARE_NONE handles, reject reparse files,
and release automatically on owner process death. Recovery continues using scoped
checkpoint/filesystem validation and leases; no PID-kill API is introduced.

9D.1 Step 4 adds Main-only one-shot UTF-8 stdin (1 MiB), inherited child read
handle and non-inherited parent overlapped pipe/event. Bounded nonblocking polls
advance partial writes; last completion closes EOF. CancelIoEx requests cancellation
while Job-owned storage remains until settlement; native observer/release gates
include pending stdin. Core retains deadlines, cleanup/retry and Policy B.
Evidence: [Learning native stdin](PHASE-9D1-NATIVE-STDIN.md). No C# invocation
or public capability is introduced by this transport step.

9D.1 Step 5 supplies `WindowsCsharpExecutionAdapter` for Main-internal sample
index 0 under ExerciseSession, owning distinct compiler/execute Jobs through
the existing Policy B barrier. SDK discovery/compile remain fully validated;
execute revalidates retained runtime/host-tree and artifact identities within the
original 2s due, without rediscovery. A trusted Main byte observer accounts raw
stdout/stderr before strict UTF-8 protocol validation. Productive bounded pipe
reads yield promptly; idle polls remain 15ms. Existing semantic failure reasons
map into Core without public DTO/API changes. Single-sample evidence:
[C# execution](PHASE-9D1-CSHARP-EXECUTION.md).

Step 6 adds Main-only `runCsharpSamples` over an already admitted ExerciseSession:
compile once, then sequential catalogue cases in distinct retained Jobs. Before
each execute, a Core-owned barrier must prove aggregate VERIFIED tree and I/O
settlement; it neither releases handles nor closes the session. Pending barrier
tasks remain session-owned through cancellation and 12s caller waits. The original
60s deadline and 1 MiB byte counter span all phases/cases; each execute still has
2s including startup/I/O. Results contain the attempted prefix and exact ordered
`notRunCaseIndices` suffix; owner-invalidated observations cannot be published.
Final cleanup/retry uses unchanged Policy B. Evidence:
[C# multi-case](PHASE-9D1-CSHARP-MULTICASE.md). Step 6 itself did not wire production.

9D.1 Step 7 connects the existing Windows ExerciseService factory to the C#
adapter/orchestrator. Production C# Run now uses the existing Exercise channels;
JavaScript remains UNSUPPORTED. An optional C# snapshot observation carries a
Main-catalogue schema, bounded compile diagnostics and attempted/not-run results.
Main validates the observation, IPC/Preload revalidate it and the panel binds its
schema to the displayed exercise. No request gains cases, expected values, paths,
commands or handles. A 4-KiB transport-envelope reserve in C# result composition
keeps the full snapshot below 1 MiB; the original raw-output quota is unchanged.
Pending/invalidated attempts have no publishable C# DTO. Core sequence advances
at phase entry and settlement so progress and completed observations remain
ordered. Renderer polling preserves newer events if an older invoke is rejected,
and cannot overwrite a final event with a transport error. The existing Result
panel shows actuals, NOT_RUN and safe diagnostics/failure messages without
comparison, persistence or Stop/Cancel controls. Windows 11 production Electron
and live Project Run/PTY isolation evidence:
[C# production wiring](PHASE-9D1-CSHARP-UI.md). User accepted 9D.1 COMPLETE —
PASS WITH LIMITATIONS on 2026-10-21; [final review](PHASE-9D1-FINAL-REVIEW.md).
Common and 9D.2 remain IN_PROGRESS; Step 1 COMPLETE — PASS WITH LIMITATIONS by
user acceptance 2026-10-22; Step 2 COMPLETE — PASS WITH LIMITATIONS by user
acceptance 2026-10-22, Step 3 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22;
Step 4 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23), Step 5 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE. Windows 10/packaging remain unverified; production Accepted-record
Restore awaits 9E. C# Run ~7–8s optimization is backlog after Phase 9.

The additive native build hook produces a Learning-only artifact and leaves the
Project native implementation/build script unchanged. No Main composition, IPC,
Preload, renderer or language harness is wired by this step. Native proof has
targeted Windows 11 x64 evidence; application lifecycle/IPC/owner validation,
global admission and live Project/Terminal regression remain integration gates.

**ExerciseService/Main integration (Common step 4, 2026-10-20):**
`learning/exercise-service.ts` owns one operation globally, no queue, issues UUID
session IDs and increasing generations, and supplies a shared Main host epoch to
Core. A synchronous factory configures a trusted driver before admission; it may
not launch/probe/do I/O. Core starts its single monotonic operation clock at
admission and runs owned prepare followed by the finite configured phase plan.
Language drivers are absent in this step: default Main composition rejects run
as LANGUAGE_ADAPTER_UNAVAILABLE, never performs an empty successful execution.

Main registers the service immediately before WindowManager, leaving the relative
order of every existing managed service intact. At STOPPING, existing Project/
Git/C# beginShutdown calls remain in order and Learning synchronously seals
admission, invalidates generation/publication and begins owned cleanup. Reverse
managed shutdown waits for Learning before stopping existing domains; WindowManager
remains shutdownLast. Failure rejects stop and preserves the retry surface through
the unchanged DesktopApplication/quit coordinator. No shared ProcessManager, Run,
Terminal or Project native implementation changes.

The service observes WebContents full main-frame navigation, render-process-gone
and destruction. Only its owning Exercise is invalidated/cancelled; subframe and
in-place navigation do not cancel. A new completed document load can accept a new
operation after prior ownership cleanup; old session/generation/completion and
publication stay invalid. Live sender/frame IPC authority is still a step 5 gate;
owner IDs and internal service methods are not a renderer API. One final snapshot
is cached at most, cleared on replacement/invalidation, with cloned bounded DTOs.

Managed start schedules recovery and returns synchronously so the service is
registered before waiting on filesystem/lease I/O. Learning admission is blocked
while recovery is pending/failed; Project startup is not awaited on that work.
Validated checkpoint discovery delegates to lease-owned Core recovery; orphan
workspaces remain untouched/quarantined. Recovery failures remain visible and
must resolve through retry before graceful shutdown succeeds. A caller deadline
never abandons the retained recovery workspace/task/lease. Core likewise audits
a cancelled admitted session that has not started a phase using an actual scoped
OWNED checkpoint before cleanup, without invoking a language driver.

Only additive Main composition/owner/STOPPING hooks are connected. No Exercise
IPC, Preload, renderer UI or C#/JS driver is wired. Unit tests exercise actual
DesktopApplication/quit coordination with mock owners/adapters/window stop ports;
live Main windows, IPC routing, Project Run/PTY concurrency remain later acceptance.

**Exercise IPC/Preload integration (Common step 5, 2026-10-20):**
`exercise-ipc-service.ts` registers only run/snapshot/lifecycle-stop channels;
`preload/bridge/exercise.ts` exposes `studentIde.learning.exercise` with run,
snapshot, stop and onChanged, without raw IPC or generic execution capability.
Exact shared validators reject ownership/path/command/PID/handle/native options.
Main authorizes a current Electron main frame and a registered app owner, then
ExerciseService verifies Main-issued session/generation ownership. An IPC-owned
document epoch additionally rejects replies after navigation/process loss even
if Electron reuses the same frame token. Awaited replies reauthorize the frame;
run/snapshot replies also recheck the current service reference. Lifecycle stop
checks ownership before retiring the generation and awaiting actual Policy B
cleanup; failure does not discard the service's pending task or ownership.

Publication uses one bounded route tied to the original owner/frame/document
epoch/session/generation. Main validates the bounded snapshot and current service
sequence; the Preload rejects unsolicited identities, stale generations and
non-increasing events. One buffered event can precede a run reply, but only the
authorized reply may bind that identity. Preload subscriptions share one transport
listener, have independent/idempotent removers, and dispose on unload. Domain/native
errors are normalized to safe typed errors with no raw messages/details. Combined
UTF-8 output remains capped by unchanged Core plus outbound snapshot validation.

The managed IPC service starts after ExerciseService and stops before it; existing
Project/Terminal/service relative shutdown order is unchanged. STOPPING seals both
Learning service and IPC synchronously. At Common step 5, production Run was UNSUPPORTED:
no C#/JS drivers, Renderer UI, Judge or Submit is enabled. Targeted tests use mock
adapters/owners for active execution and pending cleanup. A production Main/Preload
Electron 44 smoke verified real invoke/security/reload/unregistered-owner rejection
and graceful idle shutdown; active native IPC operations and live Project Run/PTY
concurrency remain acceptance work.

**Learning Renderer integration (Common step 6, 2026-10-20):** LearningWorkspace
uses `practice/use-exercise-runtime.ts` for the existing Exercise API. Run captures
the current exercise/language/code and a local source revision; only Main's reply
can bind a session/generation. Local context tokens revoke UI work, never authorize
execution. A context has one subscription and one attempt; events require the
bound identity, matching exercise/language/source revision and increasing sequence.
Admission generations must increase. A snapshot probe after admission recovers
events delivered before the invoke reply; subsequent 500 ms observation polls do
not overlap I/O, stop at finalization/context disposal and do not alter deadlines.

Exercise/language change sends internal CONTEXT_CHANGED stop; leaving the kept-
mounted Learning surface, unmount or pagehide sends LEARNING_LEFT. Late admission
replies are used only to stop the old Main-issued session, never to update a new
view. Unsubscribe/timer disposal and live/context checks protect async results.
Draft/close/navigation callbacks likewise guard unmount. Main owner loss remains
the authoritative fallback when a renderer cannot deliver its best-effort stop.

The existing Run icon now calls the API and opens the existing Result panel.
Run stays disabled during admission/execution/unresolved cleanup. UI distinguishes
idle/running/error/unsupported/cancellation/cleanup-pending/finalization; quarantine
retains false clean flags. Errors use fixed safe messages and output is escaped
text, without Judge verdicts. Submit remains disabled and no Stop/Cancel is added.
Common step 6 verified production C#/JS Run returning UNSUPPORTED; no language execution was faked.
Renderer/active-operation unit tests use mock APIs. A production Renderer/Preload/
Main Electron smoke verifies the real unsupported path and idle lifecycle; native
execution with live IPC/Renderer and concurrent Project Run/PTY remains acceptance.

Judge outcomes are Accepted, Wrong Answer, Compilation Error, Runtime Error and
Time Limit Exceeded; internal Judge errors are a separate category. Partial test
success never grants Accepted/completion. Re-submit is allowed. Failed submissions
with trustworthy WA/Compilation-Syntax/Runtime/TLE/MLE/OLE verdicts now require
persisted immutable history under the approved amendment. Infrastructure/protocol,
invalidated or untrusted outcomes are not automatically graded failures. A later
failure cannot revoke earlier saved completion; Run never creates history.
Full hidden input/output must not be exposed through student-facing result
payloads or UI. Offline hidden tests are not absolutely secret or tamper-proof.
Project Output is not the Exercise Run/Judge result store.

User-approved 9D runtime revision (2026-10-19, versions approved 2026-10-20):
Learning uses installed stable .NET SDK 10.x and Node.js 24.x without patch locking.
No runtime download,
installation or bundling is implemented in 9D. Learning owns its resolver,
harness and execution sessions and may use the same existing executables.
Missing/incompatible dependencies produce clear errors; no automatic installation
or switch to an unapproved version. Project behavior, runtime selection, PATH,
global.json, RunService, ProcessManager, Terminal, Editor, Explorer and existing
native adapters must remain unchanged. Reuse existing internal APIs unchanged;
missing argv/Job/quota support belongs in a Learning-only adapter. Shared
initialization/integration edits and new technical decisions require prior user
confirmation. Runtime distribution remains a packaging-stage requirement; its
installer integration will be discussed and decided separately.
At packaging, candidates include bundling SDK/Node; if size/technical barriers
justify it, fallback may use an additional runtime pack
or detected installed runtime with clear guidance. Redistribution, package size,
packaging fallback threshold and custom-case/comparison details remain open in
ADR-025. JavaScript architecture was approved on 2026-10-22; implementation and
Windows acceptance remain due. C# direct Roslyn/filesystem discovery and sample-only
Run are approved; [9D.1 Step 1](PHASE-9D1-CSHARP-CONTRACTS.md) declares JSON
stdin/actual-result protocol, safe diagnostic/failure DTOs and Main-only SDK/
compiler/adapter ports. No resolver/compiler/native stdin/adapter or wiring is
implemented by this step. Result data must be bound to existing Main session/
generation/sequence before later public routing; it never grants cleanup proof
or Judge verdicts. Existing Exercise API/Snapshot and Common policies are unchanged.
Production enforcement/acceptance of Common policy remains due. 9D verifies
installed-runtime execution; 9G verifies packaged offline Run/Submit on another
Windows machine
without development tools. Project Run PATH policy and csharp-ls remain unchanged.

#### Learning persistence and Local AI

Learning records live in a dedicated directory under Electron userData, never
the install directory or Project Explorer. Reuse PersistenceService where suitable:
Main-owned versioned JSON, serialized safe writes, migrations, backup and recovery.
Auto-saved per-exercise/per-language Code Drafts are distinct from Accepted records.
Each Accepted Solution keeps immutable code-at-Submit, exercise id, language,
timestamp, result and necessary test-set identity/version. Retain multiple versions
without overwriting. Submission History combines committed Accepted and eligible
failed graded records, with filters and confirmed source Restore. Failed H1–H5
contract is now APPROVED separately; it never becomes completion authority.
Only successful persistence permits saved/new completion acknowledgement. If the
write fails, report it separately from the Accepted verdict; retain earlier saved
completion. Run and failed submissions never create Accepted records.

9E must establish Accepted-record/completion consistency and crash recovery before
9F adds durable Code Draft auto-save, chapter progress, quiz results and last
learning position. Exercise states are Chưa làm / Đang làm / Hoàn thành. Accepted
commit/capacity/recovery policies are APPROVED by 9E-0; executable schema and
implementation/acceptance remain due. Later9F auto-save scheduling and aggregate
progress rules remain separate open details in ADR-025. No account/backend/cloud.

#### Submission History amendment — approved H1–H5 contract, implementation pending

The approved product policy routes trustworthy Accepted to unchanged Accepted
Storage, and trustworthy graded failures to Failed History persistence. A Submit
produces one immutable submission identity/source/verdict and targets one store;
not a required pair of writes. Judge/ExerciseService/Runtime9D share the same
admission, cancellation, cleanup and shutdown ownership. No second lifecycle or
cross-store completion transaction is introduced by the requirement.

Failed store path `userData/learning/failed-submissions.json` is APPROVED by H1.
Reuse of a Learning-only writer implementation is feasible, with separate validated
documents/policies/read models; existing PersistenceService has no transaction
proof for either new store. Accepted64MiB/15s stays; Failed32MiB/record2MiB/
metadata16KiB/warnings24–28MiB/10s caller wait/3s slow notice are approved. Strict
VERIFIED-complete eligibility, shared OS lease, one-store routing, generation-vector
cursor, partial-read status and UI generalization are approved in
[H1–H5 design](PHASE-9E-JUDGE-SUBMIT-DESIGN.md#16-approved-h1h5--submission-history).
Full Failed store alone does not disable Run/Submit once known refusal/IO settles;
unresolved retained I/O/runtime ownership still blocks replacement admission.
Package/parser decisions **9E1-L1–L12 are APPROVED** in
[ADR-025](DECISIONS.md#phase-9e-1--package-limits-approved-2026-10-23), with all
detailed bounds in the [approved specification](PHASE-9E1-PACKAGE-ASSET-PARSER-LIMITS-REVIEW.md).
Main owns fixed external full five-asset packages and generic trusted manifest; no
exercise-ID-specific Judge branches. Manifest4MiB/4,096 packages, package6MiB,
registry256MiB logical referenced bytes are independent admission ceilings.
Approved S4-D1 adds explicit schema/policy2 public-only staging:4 public assets,
metadata official:null; full5-asset admission remains unchanged and fail-closed.
S4-D2 adds public browsing acquisition and detached bounded DTO reservations in
the same Registry/reader/ledger, with ownership and retained shutdown. Runtime
public sample plans load in owned Prepare; official access stays Prepare-only.
Public verification never supplies official/release readiness or fallback.
Byte-limited reads/hash/strict UTF-8 and bounded structural scanner precede
JSON.parse; exact schema/typed validation and allowlists follow. Lazy verified
manifest/summary plus one active package uses16MiB canonical parsed-data proxy,
1,000,000 nodes/8MiB raw buffers, counting retained plans/clones; pinned active data
cannot be evicted. These budgets do not promise a heap bound. Runtime cache misses use
owned Prepare within10s/60s; tracked startup readiness must not create an unbounded
Project startup wait or unowned lifecycle. Main projects bounded public DTOs only.
Global manifest/registry faults fail the registry; local asset faults isolate the
package; preserve user drafts/history/committed completion, never substitute public
samples for official Accepted. Technical128-case ceiling is not a default or a
Runtime budget guarantee. No Runtime/Core/Policy B/quota changes. Foundation
Steps1–5 modules are implemented/accepted in their recorded scopes; later
Official Test authoring/private runtime/Judge/Submit modules remain unimplemented.
Step1 accepted COMPLETE;
Step2 actual resource/integrity/build modules and limitations are listed in
[Step2 evidence](PHASE-9E1-STEP2-RESOURCE-INTEGRITY-ASSETS.md), now accepted COMPLETE.
Step3 implemented under APPROVED S3-D1–D4, accepted COMPLETE — PASS WITH LIMITATIONS;
see [report](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md).
Step4 COMPLETE — PASS WITH LIMITATIONS by user acceptance under APPROVED S4-D1/D2;
Step5 COMPLETE — PASS WITH LIMITATIONS (Current Host Only), user-approved
acceptance-scope amendment2026-10-24, S5-AC1. Both original loader target hosts
remain UNVERIFIED, mandatory before9E-7 acceptance/release certification; this
does not change architecture, security, Runtime deadlines/ceilings or S5-P2 A/B2/C.
**Phase9E-1 COMPLETE — PASS WITH LIMITATIONS**, user acceptance9E1-AC1,
2026-10-24; [final acceptance](PHASE-9E1-FINAL-ACCEPTANCE.md#9-official-phase9e-1-closure).
Phase9E remains IN_PROGRESS. Subsequent user approval of the 9E-2 design,
seven-step plan and E2-D1–D5 authorizes E2-S1 only: 9E-2 IN_PROGRESS, E2-S1
COMPLETE — PASS after separate M1=A approval; E2-S2 COMPLETE — PASS WITH
LIMITATIONS, user accepted. S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — ACCEPT WITH LIMITATIONS; S5 COMPLETE — PASS WITH LIMITATIONS; S6 Wave A IN_PROGRESS (delivered/pending user acceptance); B–D/S7 NOT_STARTED. [S2 report](PHASE-9E2-S2-TOOLING-REFERENCES.md),
[S3 evidence](PHASE-9E2-S3-PILOT-CANDIDATE-EVIDENCE.md). S5 promotes only accepted pilot data through the existing build-generated anchor; no architecture/Runtime change. Actual Official Runtime remains UNVERIFIED.
See [S1 evidence](PHASE-9E2-S1-SEMANTIC-PILOT-SPECIFICATION.md). D5 approves the
ambiguity-resolution process, not an interpretation. No architecture/Runtime change.
[Step5 closure](PHASE-9E1-STEP5-FOUNDATION-ACCEPTANCE.md#15-approved-step5-closure--current-host-only).
[Step4 evidence](PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md)
records63 public packages, bounded IPC and additive Main Run binding; Runtime9D unchanged.
Step2 resource/deployment contracts S2-R1–R4 are subsequently APPROVED; see
[ADR-025](DECISIONS.md#phase9e-1-step2--s2-r1r4-approved-2026-10-23).
Source assets are config-relative resources/learning/exercises, emitted beneath
Main output resources/learning/exercises, selected there in development and from
external process.resourcesPath/learning/exercises when packaged. No fallback.
Main compiled manifest anchor pins raw bytes/version/hash; roots/children reject
links, files reject hardlinks, with before/after handle/path/parent checks and
explicit Node TOCTOU limitations. Explicit empty bootstrap is not test readiness.
S3-D1–D4 are now APPROVED: exact pre-allocation ledger, single-owner slot/flight
leases/BUSY, capability readiness and tracked nonblocking startup/retained shutdown.
Full contract: [Step3](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md#2-approved-precise-contracts).
Step3 introduced no separate filesystem/integrity path, lifecycle manager or public
IPC. Step4 bounded public IPC is implemented and accepted; its staging gate is resolved by S4-D1/D2.
Loader latency/RSS/GC/startup/stall have accepted current-host evidence under
S5-AC1; no full target-matrix certificate. Required hosts remain UNVERIFIED,
mandatory before9E-7/release certification; installed offline/resource-security
limitations remain UNVERIFIED where untested. No architecture/policy change.

Completion reads only verified committed Accepted records even if Failed store is
unavailable. History listing needs explicit store availability; partial All cannot
claim complete counts. No hidden input/expected/actual/console/stack/private evidence
in either store, merged IPC projections, events or logs. UI shows persisted source
and verdict/time/language, never substitutes renderer pending results for saved history.

Learning V1 has no AI dependency. Phase 8 retains local Ollama at the fixed
endpoint and `qwen3:1.7b`, text chat, no Agent/tools/project file access and no
automatic exercise context. Local AI stays on the application header and can open
as a temporary overlay in Learning. Opening it must not reveal hidden Project
Tools; closing it returns to Learning Workspace. AI Tutor, exercise-aware AI and
automatic code context remain separate future extensions.

## 7. Project and filesystem architecture

V1 has one active local folder project. Opening a project canonicalizes and validates its root. Every file operation carries a project ID plus a project-relative path; main resolves the path and verifies the result remains under the authorized root. Absolute unrestricted paths are not accepted from renderer domain APIs.

Explorer directories load lazily. The service returns typed entries with stable relative paths and file kind. Default exclusions for project search are `.git/`, `node_modules/`, `dist/`, `build/`, and `out/`. Search runs outside the renderer, streams bounded results/progress, and supports cancellation.

V1 watcher support is minimal and only required where necessary for Explorer refresh or external-file detection. FileSystemService publishes a project-scoped `AVAILABLE` or `UNAVAILABLE` state when watcher startup/runtime monitoring or the active root becomes unusable. Renderer mutations are disabled while that authority is unavailable; close and reopen/switch remain the recovery path.

Advanced watcher recovery, overflow handling, and complex external-conflict reconciliation are not Phase 2 acceptance criteria. Any watcher created for V1 is scoped to the active project and disposed on project switch or shutdown.

Symlinks are represented explicitly and are not traversed outside the project root by default. Delete/rename operations validate the target immediately before mutation. Phase 2B deletion is a main-owned, project-scoped move to the operating-system Recycle Bin after renderer confirmation; it never silently falls back to permanent deletion. Unsaved editor protection is resolved before close/switch, independently of filesystem deletion behavior.

## 8. Editor architecture

`Editor UI` mounts Monaco, renders tabs, prompts for unsaved changes, and translates user actions. `EditorModelManager` owns one Monaco model per canonical file identity and stores:

- URI and language ID;
- last disk version and current buffer version;
- dirty state;
- tab reference count;
- selection, cursor, and scroll state;
- external-change/conflict state.

`FileSystemService` alone reads and writes disk data. Opening creates or reuses a model after an async file read. Saving captures the intended buffer version, writes through IPC, and only marks clean if the model has not changed during the write. If an external watcher read authoritatively returns `NOT_FOUND`, the model retains its in-memory content and enters an explicit disk-missing state; normal save is blocked rather than silently recreating the path. Closing the final tab disposes its model unless retained by a deliberate workspace-cache policy. Project close disposes all models for that project.

Current Monaco providers consume model/document change events through renderer
adapters. Problems navigation opens the target model and reveals the exact
line/column. Theme and editor preferences are applied from settings. Large files
may disable expensive language features while preserving edit/save; Phase 3B
established the initial bounded thresholds recorded in Section 12.

## 9. Terminal architecture

The selected direction is xterm.js in the renderer and `node-pty` in the main process. The renderer terminal object is a view; the main `TerminalService` owns PTYs and the authoritative session registry.

A terminal session has `CREATING`, `RUNNING`, `CLOSING`, `EXITED`, or `FAILED`
state; ID, shell profile, cwd, and dimensions. IPC covers create, input, resize,
close, data, and exit. V1 supports multiple sessions but does not persist live
PTYs across application restarts.

The terminal IPC adapter exact-validates create/input/resize/close requests and
derives renderer ownership exclusively from the invoking WebContents. It routes
the typed event union on one `terminal:event` channel only to that live owner.
The preload exposes only those semantic operations and a validated,
unsubscribe-returning event API; it never exposes raw IPC. Actual WebContents
destruction or a new main-frame document load closes only that owner's sessions,
while React remounts and same-document navigation do not affect PTYs.

The Renderer keeps one session-scoped `TerminalController` outside the React
component tree. It owns stable xterm/FitAddon instances and host elements, one
preload event subscription, per-session sequence/write state, visible-only fit
observers, and local disposal. React owns Bottom Panel visibility, selected-tab
presentation, controls, and explicit focus requests only; component remounts do
not recreate xterm instances or destroy Main PTYs. The panel height is bounded
session-only UI state and is not persisted.

Main batches each session's ordered PTY output over a short 8 ms window and
bounds queued UTF-8 data to 64 KiB before forcing a flush. It keeps no output
history or replay buffer. Final session metadata is retained only in a bounded
256-entry tombstone set for idempotent close; native handles and listeners are
released on final exit.

Project close or switch acquires a Main-owned, project-scoped terminal transition
lease before renderer confirmation. The lease blocks new terminal creation and
drains creates already in flight so the transition cannot miss a PTY. Dirty
editor decisions are resolved before a separate destructive terminal warning.
After confirmation, Main closes only the old project's sessions and commits the
project transition only after cleanup succeeds. Cancellation, renderer loss,
timeout, or cleanup failure preserves both current project authority and any
terminal sessions not successfully closed; renderer state is reconciled only
after the authoritative project-changed event.

On Windows, the V1 shell profile resolves in this order: valid `pwsh`, Windows PowerShell, then `ComSpec`/`cmd.exe`. Phase 2E does not support a configured custom shell; user-configurable shell selection is deferred to Phase 6 Settings. The initial cwd is the active project root. `node-pty` is native and therefore requires a Phase 2 Windows/native compatibility spike before Terminal implementation is accepted. That spike verifies installation, Electron ABI compatibility, PTY startup inside Electron, PowerShell/cmd launch, input/output, resize, close, process cleanup, and native-module feasibility on Windows. Full packaged-app verification, release artifacts, installer work, and installer smoke testing remain Phase 7 responsibilities. Cleanup waits for exit evidence and escalates termination without targeting unrelated processes.

Phase 2E-J corrective Step 2 makes a Windows Job Object the primary V1 terminal
process-tree owner. The pinned `node-pty` 1.1.0 ConPTY source is patched
reproducibly so `CreateProcessW` receives `PROC_THREAD_ATTRIBUTE_JOB_LIST` in its
existing `STARTUPINFOEX` path. A new Windows terminal therefore starts already
inside its dedicated Job or creation fails closed. Main verifies a narrow native
capability marker before spawn; an upstream/unpatched binary cannot silently
serve a new production terminal.

The native layer retains each Job `HANDLE` behind an opaque integration-created
token. Root-process exit records a lifecycle fact but does not destroy that
registry entry, release ProcessManager responsibility, or finalize the terminal.
TerminalService funnels natural exit, explicit close, project cleanup, and
renderer-owner loss through one idempotent finalization task:
`TerminateJobObject`, bounded confirmation that
`JobObjectBasicAccountingInformation.ActiveProcesses == 0`, native handle
release, then ProcessManager/session release and exactly one terminal exit event.
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is deliberately not enabled. A termination,
empty-confirmation, or release failure retains the token, handle, session, and
ProcessManager ownership and fails closed.

The prior fingerprinted `taskkill.exe /PID <pid> /T /F` backend remains only for
explicit legacy/unestablished-Job ownership. It still requires immediate OS
identity revalidation. It is forbidden once Job ownership was established and
is never attempted after Job termination failure. The process-tree seam and
native token remain Main-only; Renderer, preload, IPC, and shared terminal
contracts gain no PID, Job, executable, environment, signal, or kill authority.
V1 remains Windows 10/11 x64; packaged/installed verification remains Phase 7.

## 10. Run architecture

The existing Phase 4 behavior described below is implemented JavaScript Run.
ADR-024 extends the planned contract to C# Project Run with line-oriented stdin;
the extension is `NOT_STARTED`. The non-interactive Run ownership row in Section
4 describes the current baseline, not a prohibition on this approved extension.
Terminal/PTY and LanguageServiceManager remain separate lifecycle domains.

### Planned C# Project Run design — ADR-024

#### Strategy, runtime and identity

Main composes a fixed list of internal strategies: existing JavaScript and planned
`CSharpRunStrategy`. No Renderer registration or plugin runner system. Add a
semantic target kind (`javascript-file` / `csharp-project`) to Run contracts;
exact validators reject unsupported kinds and extraneous process fields. Main
authorizes active project, owner and canonical target before strategy dispatch.
Runtime resolution takes the authorized strategy/target context: Node for JS;
dotnet inventory plus effective project SDK for C#. Retain independent statuses;
never use csharp-ls availability as Run readiness.

Replace every `execution.args[0]` identity check in prepare, duplicate-preparation
detection, start serialization and launch revalidation with a Main-only immutable
authorized identity: project identity + target kind + normalized canonical target
path. Return identity alongside preparation, not derived from executable or args.
No canonical path crosses IPC. Revalidate target identity, project/owner generation,
runtime and execution fingerprint immediately before native creation. Preserve
one active session per canonical target and concurrency for different targets;
another owner cannot replace an owned session.

`PreparedRun` becomes a narrow execution plan: one JS step or two C# steps,
explicit executable/argument array/cwd/environment policy, stdin mode, and trusted
step purpose. This is Main-only data. A Run session owns every step, callback and
cleanup under ProcessManager. Intermediate build exit/EOF is not the session's
final exit; clean the step completely before the next one. Use a step generation
to reject late build callbacks. Stop cancels the plan, including the gap between
steps. Register ownership before each native creation and retain failed cleanup.

For C#, reserve an owned STARTING session after cheap target/request authorization
and return it before asynchronous probes/build. Publish bounded preparation,
build-restore and execute phases separately from the existing RunState enum.
Stop can cancel preparation and its owned finite probes without awaiting an
unbounded start promise. Default probes: 20 seconds each, 1 MiB captured output;
all probe handles join session/owner cleanup. JS's existing start semantics and
event ordering remain compatible. Pending preparations must not outlive owner or
project generations. User code/ReadLine has no exercise timeout; Stop remains
available. Queue/write and cleanup deadlines are independently bounded.

#### C# target discovery, selection and SDK

`CSharpRunTargetResolver` lives in the Run domain. Bounded recursive discovery
uses FileSystemService listing/authorization, excludes `.git`, `node_modules`,
`bin`, `obj`, `dist`, `build`, `out`, and skips symlinks under the existing policy.
Nested projects are independent candidates; `.sln` and IntelliSense selection do
not determine the entry project. Deduplicate canonical Windows identities.
Initial bounds: 100,000 directory entries and 64 evaluated projects/references;
overflow produces an explicit discovery-limit result, never a partial auto-choice.

Do not infer eligibility from raw XML, filename or the presence of Program.cs.
From each candidate's directory, resolve effective SDK with `dotnet --version`
and evaluate Debug properties with fixed evaluation-only MSBuild JSON requests.
Query OutputType, TargetFramework(s), TargetFrameworkIdentifier/Version,
UsingMicrosoftNETSdk, UsingMicrosoftNETSdkWeb, UseWPF, UseWindowsForms,
IsTestProject and ProjectReference items. Accept SDK-style `Exe`, one modern
`.NETCoreApp` framework, no Web/WPF/WinForms/test project. Reject `Library`,
`WinExe`, .NET Framework, ambiguous/multiple frameworks and unsupported SDKs.
Some computed properties can be empty during evaluation-only requests. Validate
the single TFM and evaluated SDK flags, and treat unresolved metadata as a
preflight failure rather than building a target just to discover eligibility.
M1-04 must verify property availability against real supported SDK templates.
Custom project logic still executes under the existing trusted-project policy;
evaluation is not sandboxing or proof that arbitrary MSBuild targets are safe.

PATH dotnet resolution and SDK inventory parsing may reuse dependency helpers;
the current DotnetSdkDetector has a language-server-specific SDK >=10 restriction.
Do not change that behavior globally or call it as Run's eligibility policy.
Run gets its own SDK policy: accept a stable effective SDK >=8 only when it can
evaluate/build the single framework; Windows acceptance covers net8.0 and net10.0
with their compatible SDKs. Do not reimplement global.json rollForward rules:
let CLI resolve from the same candidate cwd used for evaluation/build/run,
including applicable ancestor global.json. Failed selection is invalid
configuration; no SDK is missing dependency. Successful evaluation is preliminary;
targeting packs, workload/restore failures and missing runtime can still fail later.

Authorize evaluated ProjectReferences recursively inside the active root with
cycle detection and canonical deduplication. Reject missing/out-of-root references.
This confines IDE path authority, not the behavior of user code or all MSBuild
imports/resources. Candidate result DTOs contain only relative path, display name,
eligibility/reason and typed resolution state. No eligible project yields
`NO_RUNNABLE_PROJECT`; all candidates blocked by SDK yield a dependency failure,
not a misleading empty result. An unassessable candidate prevents claiming there
is exactly one valid project. Present failures and allow explicit selection of a
known eligible project; never silently ignore a broken candidate.

`CSharpRunTargetStore` uses separate versioned Main JSON persistence keyed by
canonical project identity, storing only relative selected `.csproj`. Revalidate
saved paths and eligibility; removed/changed targets cause fresh selection rather
than running a substitute silently. One valid candidate auto-selects, multiple
require choice unless a still-valid saved choice exists. Persistence failure is
reported; corrupt data safely falls back to selection. No LSP store mutation.

#### Execution, errors and saved-source guard

Fixed Main-created steps (same candidate cwd and Debug configuration):

1. `dotnet build <csproj> --configuration Debug --disable-build-servers`, implicit
   restore enabled, with verified no-node-reuse policy for owned MSBuild workers.
2. `dotnet run --project <csproj> --configuration Debug --no-build --no-restore
   --no-launch-profile --disable-build-servers`.

This uses SDK incremental build output, never an IDE cache, and avoids guessing
build/runtime boundaries from localized text. Shared build-server escape/ownership
is a hard native acceptance gate; do not kill machine-wide compiler servers.
The exact fixed flags/environment policy must pass the M1-04 compatibility gate
on supported SDKs before production composition. No user-supplied CLI switches.

Dependency/evaluation errors precede execution. Nonzero build step yields typed
`BUILD_OR_RESTORE_FAILED` with exit code and distinct streams. Recognized structured
NuGet/compiler diagnostics may annotate it, but build versus restore must not be
guessed from prose. Run-step failure yields `EXECUTION_FAILED` with its exit code;
it can represent dotnet launch/runtime-host failure or user-program failure.
Do not claim exact user exception versus missing runtime without structured
evidence. Spawn, observation, input and cleanup failures have separate safe domain
reasons. Raw stacks/process metadata remain private; program stdout/stderr is
intentional output, rendered as text and not forwarded into developer logs.

Renderer computes dirty/external-conflict guards over all retained documents in
the active folder project, not just the active C# file. Current unsaved-transition
coordination exchanges approval only; it has no model snapshot/revision API.
Plan a Run-owned bounded saved-source handshake in `RunSourceGuard`, patterned
after its trusted-owner routing, without changing project-close approvals:
Main emits a guard request with projectId/sessionId/opaque requestId; the owning
Renderer responds with the same identities, monotonically increasing document
revision and aggregate dirty/conflict flags. Exact validators reject unknown or
stale replies; a 5-second timeout fails closed. Renderer invalidates the preparing
session when model revision changes during build; it owns all Monaco data and
sends no buffer contents. The Main record is only a launch guard, not editor state.
Recheck revision/guard and disk authorization before each
step; invalidate launch if edits happen while build runs. Block conservatively
when dirty/conflict state is unknown. Already-running programs are not restarted
or auto-saved by later edits. External changes during build require revalidation;
SDK build is not an atomic source snapshot and cannot promise immunity to all
concurrent external writes. Preserve editor contents and conflict semantics.

#### Native pipes and session-scoped input

Extend WindowsPipedProcessAdapter with bounded argument arrays and explicit
Main-only stdin mode (`closed` for JS/build; `line-input` for C# execution).
Implement correct per-argument Windows quoting, NUL checks, explicit executable,
shell:false, controlled inherited environment and handles. Keep existing native
JS/Git/LSP entry points compatible; a dedicated Run entry/writer may reuse the
internal pipe/Job primitives but never LSP sessions or language-process factories.
Argument limits must respect CreateProcess command-line limits and fail safely.

Native writes run asynchronously off the JS thread, ordered with one write in
flight per session. PipedRunProcess gains optional Main-only stdin writing/closure;
RunService's wrapper must forward this capability (it currently forwards only
close/ownership). Creation-time Windows Job assignment remains atomic. Pending
writes and callback references participate in resource finalization; Stop must
cancel/unblock a blocked pipe without waiting forever for a read.

Proposed typed `sendInput` request: projectId, sessionId, monotonic sequence and
text (line data). Main appends LF and writes UTF-8. Empty text is one empty line;
CRLF/lone CR are normalized to LF, multiline paste retains order, final LF is
added only if absent. Reject NUL/invalid surrogate data. `closeInput` sends EOF
as an idempotent ordered barrier; later input is rejected. EOF is not Stop.

Exact validation occurs in Main IPC, domain entry and Preload response/event
boundaries. Main verifies trusted frame, owner, active project/generation, exact
live session, C# execute step, input-open state and expected sequence. JS/build
sessions never accept input. No PID, handle, path, executable, command or arbitrary
channel in the input request. Completion means pipe delivery, not program read.
Expose typed input capability/status and acknowledgements, not pipe handles.
`RUNNING` means the owned Run command is alive; do not infer that the application
is currently blocked in ReadLine from a prompt or output text.

Initial Main bounds: 16 KiB UTF-8 per submission after newline normalization,
64 KiB and 32 submissions queued per session including the in-flight write;
10-second write deadline. Oversized submissions are rejected before enqueue;
busy queue returns retryable INPUT_BUSY without dropping existing bytes. Invalid
or duplicate sequences never replay data; ack loss never triggers automatic resend.
UI permits one outstanding submission and retains unsent text on failure; async
ack frees capacity only after delivered/failed. Write timeout closes further input
and initiates bounded session Stop, retaining cleanup ownership on failure.
Budgets are testable planning defaults; changes need documented evidence.

Stop/exit/owner loss/project lease/shutdown synchronously close the input gate,
reject queued writes and suppress stale acknowledgements before cleanup. Re-run
creates a new session/sequence; old text and writes are never forwarded. Root exit,
both output EOFs, empty Job, settled/cancelled writes and native handle release
are all required for completion. Stop during build, execution, ReadLine or blocked
stdin uses the same bounded tree termination. Cleanup failure blocks re-run,
project switch and successful application shutdown under ADR-021.

#### Minimal presentation changes

Keep one EditorRunAction in the current header. JS remains current-file Run;
C# context selects the remembered project target, with a compact chooser only
when needed and an explicit target label. No duplicate Run button/new sidebar.
RunController keys views by target kind/relative path plus project generation,
tracks authoritative session/step/input state and stale replies, and derives
project-wide save/conflict guards. Stop remains available during build/start
after a session exists; do not keep the current pending-start UI disable rule.
OutputPanel retains existing Bottom Panel hierarchy, tokens, stream display and
resizing. Add line composer, Send and EOF controls for the selected live C# session;
Enter sends, Shift+Enter inserts a line, and composition input is not sent mid-IME.
Hide/disable input for JS/build/closed sessions, retain unsent text on busy/error,
clear session input state on re-run/project invalidation, and avoid stdin history
or developer logging. No PTY, ANSI terminal emulation or ReadKey promise.
Use Orca baseline 4bb337741c335cfcc428d3b4271023566e2dadb8 for implementation UI
review; no material visual redesign is authorized by this planning task.

RunService is separate from TerminalService. A run session represents a command selected by a trusted language/project strategy, not arbitrary renderer text. It has `STARTING`, `RUNNING`, `STOPPING`, `EXITED`, `FAILED`, or `CANCELLED` state and emits separate stdout, stderr, and terminal exit metadata.

The main process starts it with an explicit executable, argument array, cwd,
controlled environment additions, and `shell: false`. V1 permits one active run
per target. Re-running the same target stops its current run, awaits successful
cleanup, and only then starts the replacement, without a confirmation prompt.
Sessions for the same target must never overlap; cleanup failure blocks replacement.

Main resolves Node from its process PATH in Phase 4 V1. Missing Node produces a
safe `MISSING` state and blocks Run with an actionable message. No bundled Node,
configured absolute Node path, or Node-path Settings UI is included; configured
Node paths are future Settings scope. Renderer has no executable selection authority.

Dirty active targets block Run with a Save-first message. No auto-save, stale-disk
execution, temporary-file execution, or mutation of the authoritative editor
buffer is allowed. The single primary Run button sits on the right side of the
editor header. Output is a sibling of Problems and Terminal in the existing
Bottom Panel; there is no competing panel system or Terminal redesign.

After project close/switch confirmation, stop all old-project Run sessions and
await successful cleanup before committing the transition. Failure preserves
current project/editor state. Root unavailability stops project-owned runs and
rejects stale events; old-project output cannot mutate replacement project UI.
Run cleanup integrates with existing transition/shutdown ownership, without
changing Terminal behavior. Windows piped-process ownership feasibility must
be established before production Run lifecycle implementation.

The user accepted the isolated native spike as evidence for creation-time Job
ownership with separate pipes, including descendants surviving root exit. This
does not verify production Electron binding or packaging. Later native cleanup
must account for Job empty, root exit, both pipe EOFs, and native handle release;
Job accounting alone is insufficient.

4A implements only preparation/contract foundations. RunService uses an injected
Main-only authorization/runtime seam and owns immutable STARTING preparations
with opaque IDs and renderer-owner checks. Duplicate target preparations must
be released before another can be reserved; this is not user-facing re-run
behavior. 4C must stop/clean the old execution before replacement. No preparation
spawns a process or transitions to RUNNING. Filesystem existence/canonical scope,
active-project availability, and final pre-spawn revalidation belong to the
later concrete authority; current-editor/dirty tracking remains Renderer-owned
and a renderer dirty flag must not be mistaken for disk authorization.

4B adds a Main-only Windows x64 Node-API piped-process adapter and PATH Node
detection. The native binding creates the process suspended with creation-time
Job ownership and explicit inherited pipe handles, installs asynchronous bounded
pipe observers, then resumes it. Release requires root exit, both delivered EOFs,
drained callbacks, and an empty Job. RunService's internal launch seam registers
ownership before native creation and retains it when cleanup fails. ProcessManager
and Terminal semantics are unchanged. The production build emits the native
artifact beside the Main-only runtime entry; portable builds skip native compilation
and unsupported hosts fail closed when constructing the adapter.

4C implements semantic start/stop and per-canonical-target serialized re-run in
RunService using the existing RunSession states. Different targets can run
concurrently. Run events carry immutable session snapshots and are routed to the
owning window's injected Main event sink; callbacks must match both the exact
live session record and its target record. Finalized/old callbacks are ignored.
Root exit initiates cleanup of any surviving descendants; exit events are emitted
only after root exit, both EOFs, native release and successful cleanup. Natural
exit 0 becomes EXITED, non-zero/observation failure becomes FAILED, and explicit
Stop before root exit becomes CANCELLED. Cleanup failure remains STOPPING with a
safe retryable error and retained ownership; it cannot unblock a replacement.
ProcessManager's existing cleanupOwner method uses a unique per-session resource
owner key to await/share/retry cleanup without stopping other targets. Registration
is removed only after successful finalization. A bounded 128-entry completed
snapshot cache makes recent duplicate/late Stop idempotent without retaining output
or native resources; unknown/evicted or foreign session IDs fail closed.
The Main-only preparation and launch seams remain available for foundation tests.
Actual filesystem authority composition, project transitions, application shutdown,
live IPC event routing and UI are still later-package work; no Run capability is
wired into the live renderer by 4C.

4D composes Run in Main and adds RunProjectLifecycle as a managed service. Its
ProjectService guard is registered after UnsavedTransitionService, preserving
existing dirty/save/discard/cancel and Terminal confirmation/cleanup behavior.
Only post-confirmation does it acquire a Run start-blocking lease and await
project-owned cleanup. The lease survives asynchronous project creation/persistence
until the existing project-changed or transition-failed notification. Failed
cleanup throws a safe domain error before mutation and retains retryable ownership.
No new transition queue or shutdown coordinator is introduced.

Existing FileSystemService status subscriptions drive unavailable-project cleanup;
there is no Run watcher. Events are muted immediately for unavailable sessions,
while native exit/EOF accounting continues internally. Generation checks invalidate
asynchronous starts across leases, unavailability and reopen, including immediately
before native creation. Pending starts and cleanup request promises are awaited so
the small interval between session finalization and ProcessManager tracking removal
cannot let a transition finish early. FileSystemService.authorizeRunFile provides
Main-only regular-file/canonical-root/availability checks through its existing path
resolver; no canonical paths are returned over IPC.

DesktopApplication STOPPING immediately blocks new Run starts and event delivery.
RunProjectLifecycle.stop awaits RunService cleanup in the existing reverse service
order, before unsaved/project/filesystem/ProcessManager dependencies stop. Failures
retain STOPPING and the failed service for retry under ADR-021; WindowManager remains
shutdown-last. Main routes only existing session DTO events to their owner; Run
invoke handlers/preload APIs and UI are still not exposed. Shared Main build chunks
remain beside the entry so the verified native/ binding path survives Rollup sharing.

4E registers the 4A IPC/Preload factories as studentIde.run with start, stop and
onEvent only. Main observes Run owners before dispatch and invalidates pending
starts on renderer navigation/destruction. Owner cleanup remains in RunService,
using existing ProcessManager release/retry semantics; no renderer execution
options or independent shutdown coordinator are introduced.

The existing editor-tabs header hosts one right-aligned Run entry point and
contextual Stop. It uses the active EditorModelManager file, dirty/disk/conflict
state and project availability for presentation guards; Main remains final disk
and runtime authority. Missing Node is reported from the start result without a
new dependency-query API. Re-run sends the same semantic start; Main stops/releases
the old session before emitting the replacement. Pending IPC is view state only.

The focused Output RunController projects authoritative session DTOs into
per-target output views, preserving distinct streams and delivery order. It accepts
new session identities only for its outstanding start, ignores superseded events,
and never replaces a newer event state with an older invoke response. Output
notifications batch per animation frame. Project/availability changes invalidate
pending replies, clear views and scheduled frames; one application-level Run
subscription survives panel switches and is removed on unmount. Output uses the
existing Bottom Panel tab/height/PanelResizer pattern and CSS tokens. No global
all-domain store or new ADR-011 selection is introduced.

RunSession/event DTOs carry no executable, native handle, cwd, args,
environment, or canonical root. Internal PreparedRun is never a wire DTO.

Stop terminates the IDE-owned process tree on Windows, waits for exit, then escalates within a bounded timeout. Application shutdown performs the same cleanup. The low-level ProcessManager may share process tracking and tree-termination utilities, but cannot erase semantic differences among run, PTY, and external language-server processes such as Phase 5.5 C#.

Phase 4 V1 runs only the current authorized JavaScript `.js` file inside the
active project via Node.js. Built-in Run Project, npm/package-manager scripts,
dev-server orchestration, project entry configuration, and framework/project
launcher logic are deferred. Future Run Project requires an explicitly authorized
entry/script policy.

RunService selects a narrow internal RunStrategy that supports a target and
prepares the explicit executable, arguments, cwd, and controlled environment
additions. JavaScriptRunStrategy is the only concrete Phase 4 V1 strategy. This
is not a plugin system or a renderer execution capability.

TypeScript Run is deferred, not permanently rejected; Phase 3 TypeScript
intelligence remains supported. A future authorized phase may add
TypeScriptRunStrategy without redesigning core RunService after ADR-014 decides
and verifies runtime, tsconfig, and compile/transpile policy. No TypeScript
runtime, compile/transpile strategy, ts-node, tsx, or Node-native TypeScript
execution policy is selected for V1. No placeholder TypeScript strategy or Run
dependency is introduced. ADR-014 does not block Phase 4 JavaScript Run. Python
Run and Tier 3 built-in runners remain future work.

## 11. Git architecture

GitService uses the local Git CLI through a typed wrapper. Calls use an executable plus argument array, never shell-concatenated commands. It provides dependency status, repository detection, status, stage/unstage, commit, branch list/current, switch, and bounded history. Output is parsed into domain types; cancellation and timeouts apply to long reads.

Git status is independent of editor, runtime, and language-service availability. Missing or invalid Git leaves the core editor operational and produces an explicit Source Control state. V1 delegates authentication to Git and the operating system; the IDE neither stores credentials nor implements hosted pull-request providers.

Phase 5A resolves Git from Main's process `PATH` only. A validated `git.exe` is
`AVAILABLE`; a completed lookup with no usable executable is `MISSING`.
`NOT_CONFIGURED` and configured-path `INVALID_CONFIGURATION` remain public
contract states reserved for future configured-path support. Repository probing
uses only fixed Main-owned arguments and the authorized canonical project root
as cwd. A working tree is accepted only when Git's canonical top-level root
equals that project root using platform-correct identity comparison; an ordinary
non-Git folder or a project nested inside a parent repository is the normal
`NOT_REPOSITORY` state.

Before filesystem canonicalization, Git top-level stdout must contain exactly
one fully-qualified path (with at most one terminal LF/CRLF). Windows drive and
UNC syntax is validated in full; relative/current-drive paths, malformed path
components, NUL/control characters and extra lines fail with `PROCESS_FAILED`.
Unvalidated output never reaches `realpath` or resolves against process cwd.
Canonical comparison continues to use the existing Windows case/separator-aware
project identity. The finite runner settles only after child `close`, including
spawn failure and cancellation, so exit/PID state alone cannot claim cleanup.

Phase 5D composes GitService through GitOperationLifecycle and a Main-only
GitOwnedCommandRunner. Each request has a project/owner generation and request
identity; Main rejects obsolete reads and Preload rejects replies superseded
while in transport. Project changes, root unavailability, renderer navigation/
destruction and application shutdown invalidate the appropriate work. A project
transition waits for Git operations and owned cleanup before releasing authority.
Mutations are serialized. Cancellation stops preparation; after mutation dispatch,
the bounded command drains and preserves applied or explicitly unknown outcomes,
without automatic retry. Stale applied outcomes discard their status snapshot.

Git document ownership is established by Main before window load. Navigation
start revokes the previous document; only a committed current main-frame event
restores availability. Both Git context and operation IPC verify Electron's
sender frame against the committed `processId`/`frameToken` values, reject
detached/disposed frames and never restore ownership on request. These frame
values stay inside Main; shared Git DTOs and Renderer authority are unchanged.

On Windows, the production Git runner creates each process inside an atomic
Windows Job using the existing private native pipe/ownership primitives. A Git
root exit terminates surviving owned hook descendants; release requires root
exit, both pipe EOFs, native settlement and an empty Job. Cleanup failure retains
ownership and blocks new work, project release and application shutdown until a
cleanup retry succeeds. Run retains its separate single-target native entry and
semantic lifecycle. No generic process capability crosses Preload.

## 12. Language-service architecture

```text
Renderer LanguageProviderManager (Phase 3 V1)
  |-- Provider Registry
  |-- Capability Detection
  |-- Bounded Project Snapshot / Document Synchronization
  |-- Completion / Hover / Signature / Definition Routing
  |-- Diagnostics Routing
  `-- Worker Status and Cleanup
```

Phase 3 V1 selected Monaco-native workers/providers for JavaScript, TypeScript,
HTML, CSS, and JSON. C# and PHP used Monaco tokenization only in that completed
phase. Each current
provider declares supported language IDs, capabilities, worker availability, and
document synchronization. Provider failure must not stop the editor or another
provider. Diagnostics from JavaScript, TypeScript, CSS, and JSON are normalized
with document URI, range, severity, message, source, and optional code, then
routed to model markers and Problems UI. HTML completion and hover use the
current Monaco HTML provider, but HTML diagnostics and Problems contribution are
deferred because that provider has no validation support. No alternate HTML
validator/provider is added in current V1.

JavaScript/TypeScript project visibility uses a bounded snapshot/source
synchronization strategy. It does not mirror all of `node_modules`, and it does
not expose the real canonical project root to Renderer merely for module
resolution. Dirty Monaco content takes precedence over an older project
snapshot. Phase 3B measurements support an initial 3C safety ceiling of 500
source files, 5 MiB total UTF-8 content, and 256 KiB per file. These are bounded
implementation defaults, not a promise to load every project file; 3C must keep
edit/save available when a source is excluded and may lower the bounds if live
responsiveness evidence requires it.

Candidate discovery reuses the existing validated, project-ID plus relative-path
FileSystemService capabilities. It traverses deterministically, excludes
`node_modules` and unsupported paths before content reads, checks file metadata
before reading, and stops at the count/byte bounds. Main remains disk authority;
the Renderer receives neither a canonical root nor arbitrary read capability.

Phase 3C implements this flow in the Renderer language feature. Initial project
activation builds background Monaco models for eligible `.js`, `.jsx`, `.ts`,
and `.tsx` sources. `EditorModelManager` adopts an existing URI model when a
file opens or is renamed, so one canonical model identity is retained and its
dirty buffer remains authoritative. Existing project-scoped file events update a
changed source incrementally; the existing coarse `renamed` watcher event causes
a bounded rescan/diff for create, delete, and filesystem rename awareness. No
polling, second watcher, new IPC, or disk authority is introduced.

The production controller serializes synchronization work and captures both
project and provider generations before asynchronous discovery/read operations.
Project switch, close, root unavailability, and renderer disposal invalidate
those tokens and dispose only provider-owned background models. Late work cannot
populate a newer project generation. Provider failure records a safe status but
does not change editor/save ownership; a later ordinary project initialization
can recover without manual restart UX or loss of dirty buffers.

When the active project root becomes `UNAVAILABLE`, project intelligence stops
and stale diagnostics are cleared. Editor buffers, syntax highlighting, and the
open project state remain intact. Project switch/close and renderer reload must
dispose synchronized sources, worker subscriptions, and stale markers scoped to
the prior project.

No external language-server process, Python dependency detection, or
process-control language IPC was authorized in Phase 3. If bounded project
snapshot data cannot reuse an existing project/file capability, it must use a
narrow project-scoped and runtime-validated Main/Preload contract; it grants no
canonical-root or arbitrary filesystem access. All Python and Java support is
deferred, not permanently removed. If a future phase adds an external provider,
Main owns `LanguageServiceManager`, executable selection, process lifecycle,
workspace scoping, restart, and cleanup; Preload exposes only a narrow typed and
runtime-validated domain bridge. Renderer never receives raw filesystem,
canonical-root, IPC, or process authority.

JSON schema resolution is offline and deny-by-default in current Phase 3. Phase
3D configures no schemas and disables schema requests. A later package may
register only explicitly bundled or application-trusted schemas; network schema
fetching requires a future recorded trust decision.

### Phase 5.5 C# external-provider design

Phase 5.5 is a newly authorized V1 extension; it does not rewrite the completed
Phase 3 C# syntax-only history. Syntax remains Monaco tokenization. Completion,
hover, signature help, definition, and diagnostics use `csharp-ls` through a thin
semantic LSP↔Monaco adapter. References, rename, code actions/quick fixes,
refactoring, formatter, advanced semantic tokens, Razor, metadata/BCL/generated
virtual-document navigation, debugger, C# Run, workspace diagnostics, and loose
`.cs` full intelligence remain deferred.

Main owns `LanguageServiceManager`, the `csharp-ls` child process, JSON-RPC/LSP
connection, real workspace paths, session state, request cancellation, opaque
completion-resolve handles, diagnostics result IDs, and bounded shutdown/cleanup.
The Phase 5.5B verified stack is `csharp-ls` 0.27.0,
`vscode-languageserver-protocol` 3.18.3, and `vscode-jsonrpc/node` 9.0.2.
Production uses the app-owned pinned server. Development may first use a
project-private provider and then PATH fallback.

The renderer registers Monaco providers per semantic capability and maps only
typed semantic DTOs. Public requests carry `projectId` and project-relative path;
Main resolves and canonicalizes the real path and derives ownership from trusted
Electron sender/document identity. The public bridge contains no raw LSP or
JSON-RPC message, PID, executable path, cwd, spawn argument, canonical project
root, diagnostic `resultId`, or general process control. Definition targets are
accepted only when they are `file:` URIs inside the canonical active project
root. Metadata and external targets return an unsupported result in V1.

#### Workspace selection

Both `.sln` and `.slnx` are solution candidates. A saved valid selection is
reused. Exactly one candidate is selected automatically. Multiple candidates
require a user selection which is remembered per project. When there is no
solution but one or more `.csproj` files exist, the session uses project mode.
Main may perform bounded discovery only for preflight and UX in project mode;
the current `csharp-ls` owns actual recursive project discovery/loading, so Main
does not claim control over the exact loaded project set. With no solution or
project, C# remains syntax-only. The IDE never creates a temporary solution.

Workspace readiness is an independent Main-owned state: `READY`,
`SELECTION_REQUIRED`, `NO_CSHARP_WORKSPACE`, or `PREFLIGHT_FAILED`. After
selection and before provider startup, Main probes the effective SDK with
`dotnet --version`, parses a selected `.sln`/`.slnx` with `dotnet sln <path>
list`, extracts listed `.csproj` path tokens without matching localized prose,
bounded-discovers projects in project mode, and evaluates each selected/discovered
`.csproj` with evaluation-only MSBuild `-getProperty`/`-getItem` JSON. Main also
validates evaluated `ProjectReference` paths for containment and existence. All
commands use executable/argument arrays, bounded discovery/output/time, and no
requested build, restore, or target. A preflight failure leaves the semantic
service stopped. The IDE must not intentionally write the workspace or create a
solution during preflight. V1 evaluation supports user-trusted projects only:
MSBuild evaluates project/import logic and is not a sandbox. No side-effect-free
guarantee is made for arbitrary untrusted projects (ADR-022, 2026-09-11).

`READY` guarantees only that SDK selection, solution parsing where applicable,
bounded project evaluation, and explicit project-reference checks passed. It
does not guarantee that `csharp-ls` later creates or loads an equivalent Roslyn
workspace. In particular, evaluation-only MSBuild does not prove targeting-pack
availability. This bounded false-positive risk is accepted for V1 and is kept
honest in the public state rather than inferred from provider log text.

#### Dependency and lifecycle

The C# language-service dependency requires .NET SDK 10 or newer, with .NET 10
LTS as the V1 acceptance baseline. Main probes the effective process PATH and
uses `dotnet --list-sdks`; Renderer cannot choose or probe executables. Dependency
state is independent of service lifecycle: `MISSING` and
`INVALID_CONFIGURATION` describe dependency failures, while `STOPPED`,
`STARTING`, `RUNNING`, and `CRASHED` describe a usable dependency's service.
`NOT_CONFIGURED` is reserved for future configured-path support.

`RUNNING` means only that the owned `csharp-ls` process is alive and its LSP
session initialized successfully. It does not assert Roslyn workspace health.
Empty completion, null hover, empty definition, or no diagnostics are valid
semantic outcomes and never drive workspace readiness. Human-readable provider
messages remain redacted Main-only diagnostics and never drive the production
state machine.

Startup is lazy with at most one C# session for the active project. Main performs
LSP `initialize`, then `initialized`, and negotiates UTF-16. Unexpected process
exit transitions the service to `CRASHED`; V1 has no automatic restart loop or
public manual start/stop/restart surface. Project close/switch, renderer owner
loss, root unavailability, and application shutdown invalidate session work and
reject stale results. Graceful shutdown orders invalidate/cancel → LSP
`shutdown` → response → `exit` → bounded process and descendant cleanup.

The authorized 5.5D C# native entry point supplies stdin/stdout/stderr pipes and
atomic Windows Job membership at creation. Root exit does not release ownership.
Finalization terminates the Job, confirms it empty, drains I/O, and releases;
failure retains ownership for a later cleanup attempt. This is Main-only and
does not change Terminal, Run, or Git behavior.

#### Document synchronization and diagnostics

The Monaco dirty buffer is authoritative. An open C# model sends `didOpen`, then
ordered incremental `didChange`, optional `didSave`, and `didClose`; Monaco model
version is the LSP document version. Ordered batching is allowed, but changes may
never be dropped, and pending changes must flush before semantic requests. Every
response is guarded by project, session, document, and where applicable model
version. Existing FileSystemService watcher events supply filesystem awareness;
open/dirty document synchronization wins over watcher disk content.

C# V1 uses pull diagnostics for open documents. Diagnostic `resultId` stays in
Main, while normalized typed diagnostics feed Monaco markers and the existing
Problems aggregation/navigation path. Workspace diagnostics are deferred.
Provider and document disposal clear only their owned C# markers and reject late
results without changing editor/save ownership.

HTML, CSS, and JSON remain model-local Monaco providers rather than project
indexes. HTML supplies syntax, completion, and provider-supported hover. CSS and
JSON additionally supply diagnostics from current in-memory Monaco content;
their marker lifecycle follows model/provider disposal and feeds the renderer-
owned Phase 3E aggregation boundary. HTML has no current diagnostic source. C#
diagnostics join that aggregation boundary only through Phase 5.5.

Phase 3D verifies this model-local path against the actual Monaco workers. HTML
completion (tags and attributes) and hover use the dirty in-memory model. CSS
completion, hover, validation, diagnostic updates, and diagnostic clearing use
the current model. JSON provides local schema-free completion where the worker
can infer peer properties, plus syntax diagnostics that update and clear after
edits; useful JSON hover is unavailable without a configured local schema.
Explicit remote `$schema` values do not trigger network access. Model removal
ends the worker mirror and diagnostic lifetime, while project switch/close keep
using the existing editor-owned disposal path.

Phase 3E consumes existing JavaScript, TypeScript, CSS, and JSON Monaco markers
without producing or rescanning diagnostics. A renderer-owned Problems store
normalizes provider/file replacement scopes, rejects stale project/provider
generations and model versions, groups by project-relative file identity, and
sorts deterministically by file and range. Project switch/close, root
unavailability, provider disposal, and renderer disposal remove their owned
state. In completed Phase 3, HTML, C#, PHP, Python, and Java contributed no
Problems diagnostics. Phase 5.5 adds C# diagnostics without altering that history.

The existing Bottom Panel hosts Terminal and Problems as sibling tabs. Selecting
a problem uses the existing editor workspace flow to open or reuse the canonical
Monaco model, activate its tab, and reveal the diagnostic range. An already-open
dirty model remains authoritative and is never replaced by a disk read. Stale,
deleted, or old-project targets fail safely without recreating a file or exposing
canonical project-root data.

Current renderer providers expose only capability/status states that apply to
Monaco workers. The broader language-service state vocabulary
`NOT_CONFIGURED`, `MISSING`, `STARTING`, `RUNNING`, `STOPPED`, `CRASHED`, and
`INVALID_CONFIGURATION` is retained for providers where those states genuinely
apply. Phase 5.5 applies the external-service subset documented above; external
process discovery and lifecycle were not a Phase 3 V1 gate. Runtime detection
remains independent, with dependency states `NOT_CONFIGURED`, `MISSING`,
`AVAILABLE`, and `INVALID_CONFIGURATION`. `RunService` and Phase 4 have no
lifecycle coupling to language providers.

Current V1 has no user-facing language-service restart button, command, menu, or
IPC endpoint. Renderer-owned providers may be disposed and
reinitialized when Monaco's existing architecture naturally supports recovery.
Recovery must preserve authoritative dirty EditorModelManager buffers and reject
stale project/provider generations. The Phase 5.5 C# service exposes status UX
but no public manual lifecycle API or automatic restart loop.

## 13. Persistence

Use versioned JSON under Electron's per-user application-data directory, separated into:

- an app-level settings/recent-projects document;
- workspace-state documents keyed by a stable hash of canonical project path.

Writes use temporary-file plus replace semantics, are serialized per document, and retain a last-known-good backup. Documents include `schemaVersion`; migrations are ordered, small, and tested. Invalid/corrupt state is quarantined or backed up, defaults are loaded, and the user receives a recoverable warning. Workspace state is convenience data and must never be the only copy of source content.

### Phase 6 implemented settings boundary

The app document uses schema version 2: recent-project metadata plus the exact
`theme`, `fontSize`, `tabSize`, and `autoSave` preferences. Version 1 migrates
existing history and supplies approved defaults. Settings and history updates
transform the latest state inside one write queue, avoiding lost metadata from
concurrent updates. Invalid primary JSON is preserved as `.corrupt` before a
successful replacement; recovery is reported to the renderer as a safe flag.

Settings and Recent Projects requests validate payloads and the current Main
frame. Recent paths are display metadata only; opening/removal accepts an opaque
history ID, and opening still passes the existing canonical-root and unsaved
transition guards. Removal changes history without closing the project or
deleting its files.

Per the user-approved Phase 6 clarification in DECISIONS.md, dependency UX is
guidance only: existing Node/Git PATH detection and the existing C# status policy.
Custom runtime, Git, shell and C# executable selection remain deferred. There are
no workspace-specific preference overrides or remappable shortcuts in this phase.
Auto Save follows ADR-023 and calls the existing editor save flow; no source
buffers are placed in app persistence and Run retains Save-first behavior.

## 14. Cancellation and lifecycle

- Search uses an operation ID and cooperative cancellation; late result events are ignored.
- Run stop is a lifecycle transition with process-tree termination and final exit event.
- Terminal close terminates one PTY session; application shutdown closes all sessions.
- Git reads accept cancellation/timeout; mutating Git operations are not reported cancelled unless process exit and repository outcome are known.
- Current Monaco-worker requests may be cancelled when supported; worker recovery remains renderer-owned. Phase 5.5 C# semantic requests support cancellation while service lifecycle remains Main-owned.

Cancellation is domain-specific. There is no public generic cancellation or command API.

Application shutdown uses `RUNNING -> STOPPING -> STOPPED`. `STOPPING` blocks
new work while Main stops started services in reverse dependency order. A
service is released from `DesktopApplication` ownership only after its `stop()`
call succeeds. The WindowManager is the final recovery surface and stops only
after all other mandatory cleanup succeeds.

Cleanup failure propagates, retains the application in `STOPPING`, preserves the
failed service and its process/Job ownership, and prevents Electron's final quit.
A later graceful quit retries only retained cleanup; concurrent quit requests
share the in-flight shutdown. `STOPPED` means every required service cleanup,
including TerminalService Job finalization and ProcessManager release, has
succeeded. Only then does the Main-owned quit coordinator authorize one final
`app.quit()` pass. The recursive `before-quit` event and final window close pass
through that authorization without starting another cleanup transaction.

Window close requests route into the same Electron quit coordinator and remain
prevented while cleanup is pending or failed. `window-all-closed` also calls the
same intercepted `app.quit()` path on non-macOS platforms; it cannot bypass
mandatory cleanup. This policy covers graceful application shutdown only. It
does not claim cleanup guarantees for Task Manager force termination, power
loss, operating-system crashes, or equivalent unpreventable termination, and it
introduces no `app.exit()`, `process.exit()`, timeout force-quit, or force-quit
fallback.

## 15. Logging

Main, renderer, run/terminal, and provider diagnostics have separate sources and
relevant operation IDs. Main owns persistent diagnostic logs and rotation policy;
renderer forwards structured diagnostics through a narrow logging method if
needed. Phase 5.5 keeps `csharp-ls` logs Main-only and redacted; no raw log API is
public. Terminal content and run output remain user-visible session data rather
than general application logs.

User-facing errors explain action and recovery. Developer diagnostics include timestamps, component, operation/session ID, state transition, and redacted technical cause. Do not log secrets, environment dumps, file contents, Git credentials, or access tokens.

## 16. Security

The Phase 0 foundation already enables `contextIsolation`, disables `nodeIntegration`, and enables renderer sandboxing. Phase 1 finds no security blocker, but Phase 2 must preserve these rules:

- renderer has no direct Node/Electron access;
- preload exposes only domain methods and never raw `ipcRenderer`;
- main validates payload shape, project identity, path scope, session ownership, and allowed operation;
- no generic shell command or unrestricted filesystem bridge;
- external URLs allow only explicit safe protocols and open through a validated main-process handler;
- navigation away from the packaged/development renderer origin is blocked;
- no unsafe `eval`, arbitrary preload exposure, or secret logging;
- all listeners and privileges are released with their owner.

## 17. Windows considerations

- Canonicalization accounts for drive letters, case-insensitive comparison, UNC paths, separators, reserved names, and long paths.
- Use Node path APIs; never concatenate filesystem separators.
- Phase 4 Node detection uses only Main's process `PATH`; configured absolute
  Node paths and their Settings UI are deferred. For future authorized configured
  executable support, detection checks configured absolute path first, then the
  effective `PATH`, and distinguishes invalid configuration from missing dependency.
- PTY selection and shell arguments are Windows-aware; PowerShell and `cmd.exe` quoting are not interchangeable.
- Run/Git use executable plus argument arrays and avoid `shell: true`.
- Phase 5.5 C# dependency detection uses Main's PATH plus `dotnet --list-sdks`;
  .NET 10 LTS is the acceptance baseline for running `csharp-ls`.
- Phase 5.5 C# workspace preflight uses `dotnet`/MSBuild without shell execution,
  build, restore, or targets; Windows exit codes, timeouts, path containment, and
  bounded discovery/output are interpreted structurally rather than by matching
  localized human-readable error text.
- Process stop validates ownership and terminates descendants without broad process-name killing.
- The Phase 2 native compatibility spike must confirm that `node-pty` installs, matches the Electron ABI, starts inside Electron, handles PowerShell/cmd, input/output, resize, close, and owned-process cleanup on Windows.
- Phase 2E-H recorded actual Windows x64/ConPTY behavior and implemented ADR-020's verified targeted owned-root process-tree termination. V1 intentionally retains the Windows 10/11 x64 label without deriving a minimum build from the evidence host. Phase 2E-I retains Ubuntu CI as the portable automated gate and requires recorded actual-Windows Electron evidence for terminal-affecting work; Phase 7 owns packaged/installed Windows CI and release acceptance.
- Phase 7 verifies native-module inclusion in the full packaged application, release artifact, installer, CI packaging path, and Windows installer smoke test.
- Watcher behavior, locked files, antivirus delays, and atomic-replace fallbacks require Windows integration tests.

## 18. Future extension boundaries

Local AI Chat is implemented through Renderer → typed Preload → IPC → Main → Ollama. Main owns local Ollama network access at fixed `http://127.0.0.1:11434`, the fixed `qwen3:1.7b` model, streaming and cancellation; Renderer owns the ephemeral chat UI. AI Agent behavior, tools and file context remain future work and are not implemented.

Formatter integrates through an editor command/provider boundary; debugger through a future DAP-oriented service. Neither is implemented or required for V1. Cloud, collaboration, remote workspaces, mobile, extension host/marketplace, worktree orchestration, and AI agent process hooks are omitted.

## 19. Phase boundaries

- Phase 2 implements project, explorer, editor, unsaved protection, search, and terminal against these contracts. ProjectService may persist the minimal recent-project metadata required for project lifecycle; it does not implement the user-facing Recent Projects management experience.
- Phase 3 implements Monaco-native intelligence for JavaScript, TypeScript,
  HTML, CSS, and JSON; syntax-only C#/PHP; and Problems integration without
  changing privileged boundaries. All Python support and Java support are
  deferred to a future authorized phase.
- Phase 4 implements trusted run strategies and Windows process-tree cleanup.
- Phase 5 implements GitService.
- Phase 5.5 extends C# from its completed Phase 3 syntax-only baseline with a
  Main-owned `csharp-ls` service and semantic Monaco providers. Phase 5.5B is a
  hard compatibility gate before 5.5C–5.5H; packaged/installed acceptance stays
  in Phase 7.
- Phase 6 completes settings, dependency configuration UX, and the user-facing Recent Projects UX and management experience.

- Phase 9 adds the planned Learning workspace mode and 9A–9G content, exercise,
  runtime/judge, quiz/progress and stabilization packages described in Section 6.
  It does not change completed Project Mode or Phase 8 decisions.

Any required deviation must be recorded in `DECISIONS.md` before implementation changes the architecture.


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


## Official Phase9E-2 closure /9E-3 planning authorization — 2026-10-25

The user formally accepts **Phase9E-2 COMPLETE — PASS WITH LIMITATIONS**, including E2-S7 final review/handoff. Accepted evidence is preserved:63 full-profile/0 public-only,504 cases (126 public/378 hidden),789/789 static obligations,206/206 critical correctness and126/126 broader models, manifest release7 SHA75ddbf0447e4708882c1e8e1f96e7cbebf97bf5aa170a14713e96755a9d3e081 and matching compiled anchor. All12 performance models remain PENDING_RUNTIME; Official60s/release certification UNVERIFIED. Historical FAILs/SKIP, source/line-ending limitations and9E1-AC1/S5-AC1 deferred platform/loader/reliability/installed gates remain unchanged. This closure uses accepted evidence; no tests/Runtime/build/profiling or resource regeneration/revalidation executed in this documentation task.

Only9E-3 source survey, design and implementation planning are now authorized. [Official Runtime design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md) and [implementation plan](PHASE-9E3-IMPLEMENTATION-PLAN.md) are **PROPOSED — NOT APPROVED**. **9E-3 NOT_STARTED — DESIGN PROPOSED**; E3-D1–D4 and every implementation step await user approval/explicit package authorization. No production code/resources, Judge/Submit/Comparator/Accepted Storage, deadlines/ceilings/ownership/security/Policy B or .gitattributes change, Git publication or automatic Step1 start. Later phase statuses unchanged. This dated record supersedes earlier pending9E-2 status statements; their evidence/history remains intact.
