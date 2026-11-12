# Architecture Decision Log

## F6 — remembered consent owned by Main, accepted 2026-11-12

User explicitly replaces Quick Action per-snapshot popup consent. Renderer-only
flags cannot authorize disclosure; persisting general approval exceeds the requested
session. Choose Main-owned ephemeral grants bound to owner/document, exercise,
language/origin, provider object and exact data-category coverage. Cap at the existing
30-minute session policy. Source edits may retire operations without retiring this
grant. Main derives scope from its immutable capture (source always included;
selection only for Explain/selection Fix; Run only when a trusted receipt contributed).
Prepared operations expose an opaque session reference and whether coverage exists;
reuse is revalidated at start, never trusted from a Renderer boolean. Explicit
single-request consent remains valid without remembering. Revocation cancels active
owned inference but does not revoke completed local F4 Apply proposals. Chat remains
independent. This supersedes earlier per-snapshot Quick Action confirmation only.

## AI-SUGGEST-FIX-F5 localization amendment — accepted corrective scope, 2026-11-12

The user's repeated report of missing editor highlights was reproduced by reading
the running app: two completed detection cards report INVALID_AI_RANGE for a
missing operand. Prior offline fixtures supplied correct offsets and missed this
failure. Reopen F5's strict-offset admission for this authorized corrective work.

Options: retaining offset-only admission hides findings with correct quotations;
fuzzy/nearest-line repair risks marking unrelated code; resolving one unique exact
source quote establishes deterministic snapshot correspondence without guessing.
Select the third option in Main only: prefer an already valid quote/offset range;
otherwise locate the quote only if it occurs exactly once (including overlapping
occurrences), then revalidate the reconstructed UTF-16/CRLF boundaries. No trimming,
case folding, newline normalization, fuzzy search or arbitrary occurrence choice.
Missing/ambiguous quotes stay unlocated; malformed wire still fails closed. This
supersedes only F5's blanket rejection of inaccurate AI offsets when a unique exact
quote proves the location. Provenance stays suspected AI; no edits/grants, retries,
new compiler pipeline, provider/dependency, consent or quota change is authorized.

## AI-SUGGEST-FIX-F5 — separate detection action, authorized 2026-11-11

User authorizes whole-submission advisory detection for Suggest Fix without a
selection. Use internal DETECT_ISSUES action and DETECTION result, never disguise
full source as SUGGEST_FIX selection or bypass its parser. Main owns canonical
issue identity/provenance; provider cannot grant verification/edit authority.
Range offsets must be bounded UTF-16 boundaries with exact nonempty quoted source
and text; invalid positions remain unlocated. Existing public Run receipts supply
only matching trusted evidence, not proof of AI-inferred causes. Own Monaco owner
and snapshot-bound cleanup/details; no new compiler/Run execution or agent SDK.

## AG-02 — Engine isolation gate BLOCKED / NO-GO, 2026-11-11

User authorized fake-only isolated technical/security prototype, not production.
Official npm client/Windows x64 binary packages are pinned2.2.7; client installed
with scripts disabled only in the prototype. Actual V2 Promise-client Node24/
Electron44 probes pass against a fake server, and synthetic broker/gateway
negative tests pass, but this does not establish Engine safety.

The private-cwd/proxy launch approach failed its synthetic outside-read and
unapproved-loopback canary (ordinary Node fixture, not Engine). No verified
Windows filesystem/config/network confinement backend is available in the
harness. Engine gate denies launch without override: zero Engine executions.
Effective permissions/discovery and Engine runtime/routing/lifecycle gates are
therefore untested, not passed by default or attributed as Engine vulnerabilities.
Keep AG-01 sidecar recommendation PROPOSED and AG-02 BLOCKED/NO-GO; no AG-03.

Before a future retry the user must choose/provision an enforceable confined
runner/VM and authorize the remaining prototype, or explicitly approve revisiting
the Main-owned Gemini loop alternative. No silent architecture or requirement
change, automatic privilege escalation/system firewall mutation, fork or live API.
Package license declaration is not dependency-notice/runtime-closure acceptance.

## AG-01 — Gemini/OpenCode Project Agent design decision proposal, 2026-11-11

**PROPOSED — not an Accepted production ADR.** User authorizes design only,
explicitly opening the FR-038 local-only/fixed Ollama and future-agent scope for
this survey. Phase8's implemented state/history and Learning decisions remain.
The ARCHITECTURE AG-01 section contains the current source trace and evidence.

Recommend an app-owned native Engine sidecar with Main-only @opencode/client
Promise API behind AgentService, not embedding Core into Electron. Official
[migration](https://opencode.ai/docs/migrate-v1/) identifies the V2 client and
breaking contracts; the old @opencode-ai/sdk/v2 entry is not OpenCode2 evidence.
Surveyed upstream dev manifests say2.2.7, but no published pair/hash/runtime is
selected or installed. Native Core dependencies create avoidable Electron ABI/
bundle coupling; sidecar still needs its own native Windows and payload gate.

Recommend no actual project root/key in Engine: private empty runtime workspace,
Main read/search/propose-only broker through one app-controlled MCP transport,
all native tools/ambient config/extensions/shell denied. Main owns a Gemini
protocol gateway with the real credential only at upstream dispatch; Engine
uses a disposable local token. Typed agent IPC never exposes Engine APIs.
Main proposals plus explicit readonly Diff/Confirm apply only to version-bound
Monaco buffers, with native Undo and explicit Save; no Engine disk write/revert.

Credential reuse is a future narrow Main port over existing encrypted storage,
not a second key export/ledger or reuse of Learning's inference coordinator.
Separate Agent opt-in/model/budgets/sessions/errors; revoke all credential leases
on key retirement. Existing Learning behavior/model/quota/Hint authorities must
remain unchanged and pass targeted regressions if that port is later approved.

No AG-02+ production permission follows. Open gates: exact published Engine/client
and license/runtime closure; secure config/Windows filesystem/egress confinement;
MCP/Gemini streaming/tool semantics; credential seam/model/budget; auto-save
suppression/consent UX; Win10/11/CPU/packaged evidence. V1 prototype R1/R2 README
egress NO-GO remains evidence, not superseded by adopting V2. Stock permissions,
proxy variables/cwd and Job Objects are not an OS sandbox. If a hard requirement
cannot be enforced, stop dependent work and record an explicit alternative;
do not ship a broad agent or silently fork Engine to bypass the gate.

## AI-HINT-APPLY-F4 target-resolution amendment — authorized 2026-11-11

Baseline real P2 parsers reproduced six failures in ten C#/JS cases: nested empty
loop carets and absent targets reject despite HAS classification; a return-boundary
caret inserts a second return. Explicit statement selections pass. Syntax-invalid
source is UNCERTAIN and stays denied. F4 authorizes correcting Hint-only target
resolution without widening parse grammar or changing Suggest Fix/SH-1.
Retain exact nonempty selections. Resolve safe nested block trivia gaps and an
unambiguous adjacent same-kind return/assignment replacement. Infer assignment
insertion only into a unique empty block with all fragment identifiers already
lexically bound; ambiguous cases require a target. Parser-resolved offsets use
a distinct PARSER_RESOLVED proposal target; Preload accepts it only for absent or
collapsed selection with the original owned/source-bound correlation. Never
retarget a nonempty selection. Main still mints/consumes one grant after complete
candidate/header/outside-AST and canonical SH-1 validation. Syntax uncertainty
remains denied, not recovered by guessing. No model, quota, Chat, Suggest Fix,
runtime version or timeout change. User task explicitly authorizes this amendment.

## AI-C4-F3.1 Chat shutdown transport lifetime - authorized 2026-11-08

Evidence: sealed Chat business state is drained before window destruction, but
LearningChatIpcService currently removes its handlers while that window is alive.
An already-sent Renderer close can then hit a missing handler; a STOPPING listener
alone cannot recall an in-flight IPC packet. Keep admission sealing at STOPPING
and business drain in SmartHintsConfiguration, but defer Chat transport teardown
until after WindowManager destroys the window. In the existing shutdown-last
pass, stop WindowManager before LearningChatIpcService. Retain the recovery window
until all mandatory business cleanup succeeds. All Chat methods stay sealed;
this does not extend any session, model, quota or editor authority. No sleeps,
exception suppression or timeout adjustment. This changes only the transport
teardown ordering authorized by the F3.1 lifecycle task.

Further trace: BrowserWindow closed occurs before WebContents destroyed, even
after the JavaScript exit event in the old path. WindowManager.stop must await
the owned WebContents destroyed event, sharing concurrent stop ownership and
retaining cleanup on failure. Only then may the sealed Chat transport be removed
and final Electron quit proceed. No time-based drain or native workaround.

## AI-C4-F3 retry amendment ? authorized - 2026-11-08

User explicitly authorizes bounded retries before any proposal/grant exists. Retain
failed attempt ID/digest/error records (maximum three) within the same owned operation;
repeat failures do not spend another attempt. Only Main-correlated no-grant errors may
unlock Preload/UI. Success, discard, consumption or uncertainty cannot be retried; no
automatic retry. Preserve all original binding, parser, package and SH-1 gates. Earlier
F1/F2 single-preparation statements are historical and superseded only for these
definite pre-grant failures.

## AI-C4-F2 Hint consume and manual Diff — authorized 2026-11-08

F2 acceptance exposed two F1 defects: repeated default SDK discovery exhausted
the unchanged 2s validation budget, and the real JS template's recognized
throw-new-Error placeholder was rejected by the reused baseline grammar. Reuse
only verified source-free asset identities with full byte/anchor revalidation.
For the separately classified NO_IMPLEMENTATION baseline only, share the exact
existing placeholder predicate. Never accept NewExpression in candidates or
Suggest Fix, skip AST parsing, infer offsets or increase budgets. Reopen F1
correctively and reverify its original scoped gates; no new work package starts.

User authorizes typed consume/discard IPC and Renderer integration of F1 proposals.
Consume revalidates the original preparation, owned grant and fresh trusted package
before arming one local synchronous Monaco transaction. Discard revokes pending
or prepared work. Main ignores snapshot selection for NO_IMPLEMENTATION and still
passes null to the unchanged template parser; HAS_IMPLEMENTATION requires its
verified explicit selection/caret. This avoids exposing private classification
or adding inference. F1's single preparation, including parsed failure, remains:
no automatic retry/rebase and no widened SH-1/Suggest Fix/parser grammar.

## AI-C4-F1 trusted Hint proposal amendment — authorized 2026-11-08

User authorizes a separate typed prepareHintApply backend, superseding the earlier
absence of Hint proposal authority, not the Hint wire schema. Main alone retains
bounded verified COMPLETE Hint context until expiry/invalidation, looks up the
owned operation and recaptures trusted package identity. Renderer cannot supply
Hint text, replacement/candidate or grants. A separate parser branch identifies
the exact template body or validates explicit selection/insertion in the entry
function; canonical SH-1 and signature/outside-target checks remain mandatory.
Separate proposals carry Hint provenance and a single-use Main grant. Existing
Suggest Fix guards are unchanged; no whole-file edits, inference, quota/timeout
change or Renderer integration. F2 requires separate authorization.

## AI-C4-D Hint progression amendment — accepted 2026-11-06

User explicitly authorizes replacing sequential Hint L1/L2/L3 with a single
three-part Hint. Retaining unlock or orchestrating three calls is rejected: one
request uses the existing coordinator, consent and single reservation path.
Normalize legacy level-bearing inputs; reject old output rather than fabricate
missing sections. Remove level/dedup summary state; new Hint content is not
approved for replay to Chat or later actions. Advisory language checks do not
grant compiler or editor authority; SH-1 and Fix guards remain unchanged.

## Selection Fix syntax recovery amendment — authorized 2026-11-06

The user authorizes superseding G0's blanket rejection of invalid baseline syntax
only for recoverable errors isolated in the selected function body. Keep the
existing Roslyn/TypeScript versions, grammar whitelist, required signatures and
outside-selection structural comparison. Use parser diagnostics and recovered
AST spans, never repair/reprint source or infer offsets. Missing/ambiguous body
boundaries, damaged headers, skipped/unisolated errors fail closed. Candidate must
parse without errors and preserve entry/header and outside-target structure.
Alternative of dropping structural validation is rejected. Scope is guards and
targeted offline tests; no provider, SH-1, SDK, Apply or execution changes.

## SH4-D6-3 applies approved G0-WIRE — 2026-11-05

User authorizes only Gemini replacement-only schema/instructions and reuse of
the D6-2 private validator. Apply G0-WIRE without changing canonical outputs or
SH-1. Fix gets a standalone instruction to avoid the old shared offset/old-text
guidance; other actions retain the exact original instruction/schema/input.
Local UTF-8 byte checks remain authoritative alongside schema character bounds:
replacement at most 16,384 bytes, rationale 2,048, advice 4,096, evidence at most
8 supplied public IDs (empty for CODE_ONLY), existing result bound unchanged.
No response repair/fallback or SELECTION_V1 enablement. G0-C1 construction and
structural/signature gates remain D6-4, not an implicit authorization here.

## SH4-D6-2 approved contract migration — 2026-11-05

User authorizes D6-2 after G0/D6-1. Apply G0-A nested required Fix selection and
range/fingerprint binding; retain consentVersion 1 and canonical outputs. Main
alone obtains packageVersion and private signatureIdentity from its package
lease. Capabilities require suggestFixMode DISABLED/SELECTION_V1 and a dense,
unique canonical C#/JS language list (DISABLED requires empty). Ship DISABLED
through this package, including a pre-dispatch Main guard; no kind-only fallback.
Prepare replacement-only private validation without wiring it to Gemini or SH-1.
No parser/dependency/provider/Apply decision changes. G0-C1 construction and
parser/signature guards remain authorized only by their later work packages.

## Normal Gemini Suggest Fix deadline amendment — 2026-11-03

User explicitly authorizes30 seconds for ordinary-app Suggest Fix only. Normal
Gemini Hint/Analyze/Explain and metadata-only Settings checks retain10 seconds.
Main selects the bounded action deadline and passes it privately to Gemini; the
adapter uses that same deadline/abort signal rather than a second duration timer.
Default standalone/legacy provider execution remains unchanged. Exact deadline
is exclusive: results processed before it may complete; at/after it time out.
Keep session TTL, quota/reservations, validation, privacy consent and manual edits.
Record only fixed action/stage/state/owner and numeric elapsed/deadline/status
diagnostics in Main; no source, key, provider text, request IDs or paths in logs.
No real inference, retry, new launcher, billing or unrelated changes authorized.

## Smart Hints normal usage policy correction — 2026-11-03

Authorized by the user's usage-limit fix task. Supersedes the normal-app lifetime
budget of3 below; the historical acceptance ledger and budget remain unchanged.
New normal configurations default to20 reservations per UTC day, configurable
1–300/day with native confirmation. Keep6/min and30/hour local throttles.
Reservations are never deleted/refunded; UTC rollover derives a new local day,
not a Google quota reset. Legacy configurations retain their limit (capped300)
and require an explicit Settings limit confirmation before further inference.
Show daily used/remaining/reset and lifetime reservations separately. Metadata
checks spend no local reservation and cannot prove generation quota recovery.
Distinguish local budget/throttle from Google's rate/quota observations. Unknown
HTTP429 is rate-limited with quota unspecified; never infer billing entitlement.
No automatic retry, credential change, billing action or live test is authorized.

## Smart Hints user configuration in ordinary/packaged IDE — 2026-11-03

Explicit user authorization replaces the isolated-only SH-4 provisioning choice
for the normal application. Reuse the Gemini adapter and SmartHintsService through
a Main-owned configurable provider; Settings defaults off and controls enable,
credential entry/removal and source-free status checks. Main serializes provider
replacement and aborts prior operations without resetting request quotas. No
acceptance CLI/ID/sample restriction in the normal flow; historical tools remain.

Credential must never enter any Electron Renderer, including an auxiliary window.
Choose a narrow Windows Node-API8 native key dialog in the Main process, rather
than a React password field/BrowserWindow or secret-bearing child-process pipe.
Use existing Windows x64/MSVC/Electron header toolchain, no new package; build and
load capability gates required. Main encrypts using Electron safeStorage async
DPAPI and persists ciphertext only. Fail closed if native entry or secure storage
is unavailable. DPAPI protects against other OS users, not malware in the same
Windows account; no forensic memory-wiping guarantee. Secret not part of IPC DTO.

Normal local request budget defaults to3, persisted and not reset by restart,
provider toggle or key rotation. Further budget is a deliberate Settings action
with native confirmation; it does not bypass6/min,30/hour,2048-token limits.
Agent has no authorization to increase the3 live-acceptance requests. Per-snapshot
privacy consent remains required; no automatic source, retries or paid fallback.
Model metadata verifies fixed model access only, not project billing/free tier.
Remove Free Tier guarantees from normal UI copy. Status check GET carries no code.
Reference: https://www.electronjs.org/docs/latest/api/safe-storage (checked today).

## SH-4 development Live UI launcher — authorized preparation, 2026-11-03

User authorizes launcher implementation and offline verification, not live calls.
Use a Main-only development argv gate, explicit approval ID/budget (1..30, no
default), project Free Tier/no-billing and samples-only attestations, plus native
Cancel-first confirmation. Packaged apps and ordinary development remain disabled.
Each approval is one activation, <=30 minutes; atomic no-clobber approval/POST
reservation records prevent relaunch renewal and refunds on failed/cancelled
delivery. Keep existing 6/min,30/hour,2048 tokens and per-action snapshot consent.
Isolated acceptance uses the already authorized30s cap; normal default10s remains.
Only exact supplied ch2-01 C#/JS draft snapshots (LF/CRLF, buggy or corrected
`a + b`) may leave Main; no other exercise, Solution origin or arbitrary source.
Model GET remains before every POST; project ownership/billing/quota cannot be
proved by metadata and must be explicitly attested, never inferred. No SDK,
contract/IPC/key field, retry, fallback, auto Apply/Run/Submit, production rollout
or separate live budget grant. This narrows acceptance data/provisioning only;
accepted SH-1/2/3 contracts and editing protections are unchanged.

## SH-4 Gemini Authorization Key compatibility - 2026-11-02

User explicitly authorizes the shared credential validator to support AQ. Authorization Keys alongside legacy Standard/AIza keys, consistent with Google API-key documentation. Confirmed defect: the old alphabet rejects the AQ. separator unconditionally; the old512 cap can also reject longer authorization strings. Keep legacy16..512 URL-safe shape, add only the AQ. branch with a4096-byte ASCII application cap and nonempty URL-safe payload; no trim, repair, Bearer conversion, key access/logging, retry or real API request. Google does not publish a fixed authorization-key length in the cited guide;4096 is our bounded header-safety policy, not a claimed Google limit. Production DISABLED and existing G4/G6/live acceptance gates remain. This is the user-authorized narrow key-format/bound amendment only; no architecture/business/schema decision changes.


## SH-4 G4/G6 Gemini provider amendment - 2026-11-02

Explicit user authorization supersedes OpenRouter as the active SH provider. Direct Gemini REST generateContent, fixed gemini-3.1-flash-lite, GEMINI_API_KEY via x-goog-api-key header in Main only. No SDK/dependency. Preserve SH-1 action/output validators and all SH-2/3 safety boundaries. Send a separate supported JSON Schema per action via generationConfig.responseJsonSchema and responseMimeType application/json; source-dependent UTF-16/exact text/evidence/EOL/byte constraints remain local. Use default production 10s, isolated development smoke 30s, existing quotas/token/size caps. Require development/live approval plus explicit project Free Tier attestation; models.get checks exact model/capability before POST but cannot prove billing or remaining quota. Uncertain tier means no inference. Production default stays disabled. No real API/key access now. OpenRouter modules/scripts/evidence remain historical; new app composition and Gemini runner never invoke them. Final acceptance pending.


## SH-4 development smoke timeout amendment ? 2026-11-02

User explicitly authorizes offline correction of the 10s timeout. Isolated development smoke uses a fixed 30000ms execution cap in Main service, OpenRouter adapter, preflight GET and new attempt manifests/consent. Production/shared SMART_HINT_POLICY stays 10000ms; normal development composition also keeps 10000ms unless Main explicitly selects developmentSmoke. Overall runner watchdog is 300000ms (two 60s consents, up to three 30s metadata GETs, one 30s inference, startup/persistence margin); it is not an inference timeout. No schema/parser, retry, fallback, key access, real API, history overwrite or rollout authorization. G4/G6 live acceptance stays open.


## SH-4 G4/G6 bounded development profile amendment ? 2026-11-02

The user explicitly authorizes an optional named North free development profile,
not a production substitution. This amends the fixed-model restriction below only
for isolated manual/development composition. Main validates the exact :free ID,
fresh catalogue and endpoint zero prompt/completion prices (request price zero if
present), availability and max_tokens support; unverifiable metadata fails closed.
No response_format, provider fallback, model fallback or retry; caps unchanged.
Diagnostics are a Main/manual-only numeric/enum projection with UNKNOWN on absent,
unrecognized or conflicting evidence. No raw body/message/header dump or IPC field.
This task permits fake/offline work only; the spent live marker is preserved.
Separate live approval and a separately reviewed attempt identity are still needed.
No other decision or architecture boundary changes.


## SH-4 G4/G6 provider replacement — 2026-11-02

Explicit user authorization supersedes NVIDIA NIM for SH-4 only: fixed OpenRouter
`openrouter/free`, `https://openrouter.ai/api/v1/chat/completions`, Main-only
`OPENROUTER_API_KEY`. Official Free Router documentation and public model catalogue
confirm zero prompt/completion pricing. Keep existing caps and dev/approval gates,
production DISABLED. Send zero price ceilings and disable provider fallbacks; no
client retry, repair, alternate endpoint/model, OpenCode or paid route. Prompt-only
JSON avoids requiring endpoint-specific structured-output support; strict envelope,
content and action/edit validators remain mandatory. Accept bounded routed-model
metadata privately, discard reasoning, never convert prose into edits. Consent names
OpenRouter and its selected free provider, whose data policy may vary. At most one
synthetic live smoke is authorized after valid key/free-route verification, with no
retry; missing key or unverifiable free route requires STOP. This is a connectivity
test budget, not a permanent feature quota. Final user acceptance/rollout stays open.
See `docs/AI/AI-SMART-HINTS-SH4-ACCEPTANCE.md` for sources and actual results.

## SH-3 acceptance / SH-4 G4-G6 offline provisioning — 2026-10-29

The user accepts SH-3 COMPLETE — PASS WITH LIMITATIONS and explicitly selects
NVIDIA NIM hosted DeepSeek for SH-4 personal development/test/demo, superseding
the earlier direct-DeepSeek selection only for SH. No D2/D3 contract/rollout change.
Official current catalogue/reference identify deepseek-ai/deepseek-v4.1-flash and
https://integrate.api.nvidia.com/v1/chat/completions. Older DeepSeek free routes
are marked deprecated; no automatic model substitution. See SH-4 acceptance for
primary sources, trial conditions and unresolved account-specific limits.
Use Main-only process environment NVIDIA_API_KEY, ephemeral scoped credential,
no persisted key/config UI/dependency. Existing2048 output tokens,10s timeout,
6/min30/hour caps remain; do not adopt the model's much larger default budget.
JSON-only prompt plus strict parser/service schema guards; no undocumented JSON/
thinking extensions. Reasoning, if returned, is bounded and discarded, never an
advisory or Renderer field. Dev + Main approval gate defaults false, prior to key
access. No real API request until separately approved; G4/G6 live account quota,
quality/latency and final consent/rollout acceptance remain open.

## SH-3 option A verification — 2026-10-29

User-approved dependency exception is implemented exactly:0.56.0 import/factory
correction with fixed original/patched hashes, captured backup, checked rollback,
idempotence and install/build script. No other dependency source/version change.
Modal layout uses the existing SH-3 component's single observer/RAF ownership,
not a new shared service. Repeated automated native gates PASS; normal injected
FAKE may advertise Apply, unconfigured production and shutdown remain false.
Delivery FIXED — AWAITING USER ACCEPTANCE; tracking IN_PROGRESS, no COMPLETE.
Original Redo timeout's individual cause remains unverified; current native gate
passes exact repeated scenarios. See acceptance. Earlier blocked notes are history;
SH-4 remains NOT_STARTED and no unrelated ADR changed.

## SH-3 option A approved — 2026-10-29

The user explicitly approves option A from the unblock proposal: the exact
Monaco0.56.0 import/hover-factory correction, strict version/original/patched hashes,
captured original, checked idempotence/rollback, reproducible script and install/
build hook. No package installation, other dependency patch or renderer service
redesign is authorized by this exception. Root instantiation lifetime is used by
the factory; no provider or editing authority changes. G3 safety remains pending:
keep normal Diff/Apply disabled until repeated zero-console-error Monaco/app
gates pass. Production DISABLED and SH-4 NOT_STARTED. No automatic COMPLETE.

## SH-3 unblock dependency gate — 2026-10-29, PENDING APPROVAL

Renewed user authorization permits investigation and scoped SH-3 corrections,
requiring STOP before dependency/architecture/out-of-scope module changes.
Independent controls establish Monaco0.56.0's global hover factory retaining a
Diff-owned disposed child instantiation service. No product correction or new
architecture was chosen. The reviewed dependency candidate remains unapplied;
see [Unblock options](AI/AI-SMART-HINTS-SH3-UNBLOCK-OPTIONS.md). Historical native
Redo and current ResizeObserver gates remain open. G3 safety is unresolved, all
normal Apply false, SH-3 BLOCKED and SH-4 NOT_STARTED. No unrelated ADR changed.

## Smart Hints G3 enable authorization — 2026-10-29

Execution result: **BLOCKED — NOT PASS**. Repeated real standalone verification
produced unresolved lifecycle/disposed-service/model errors and a native Redo
timeout. G3 safety gate is not resolved. All normal compositions, including fake,
report Apply false and hide Diff entry. Only isolated diagnostic harness enables
the draft implementation. STOP under the user's explicit safety instruction.

User authorizes SH-3 guarded native transaction and real Monaco/Electron evidence.
Accepted G3 offset bounds/exact old text/no rewrite policy is unchanged. Renderer
may mint a local single-use Apply grant only for a verified current Practice
COMPLETE proposal. No new IPC edit authority. FAKE capabilities may advertise Apply;
DISABLED production must keep Apply false. No await between final guard and edits,
no custom Undo/setValue rollback/rebase; transaction evidence failure locks Apply.
G4/G6 live provisioning and SH-4 remain gated. No unrelated ADR is reopened.

## Smart Hints G1–G6 scope approval — 2026-10-28

SH-0 accepted COMPLETE — PASS WITH LIMITATIONS; implement SH-1 only. G1: separate
service/contracts, safe reuse of unchanged D2 transport/validation primitives.
G2: Main-private Public Run Receipt tied to exact leased package/source/operation;
otherwise CODE_ONLY. G3: structured UTF-16 edits/exact old text/binding/validation,
no Apply yet. G4: System Design technical caps approved for fake-only testing;
live monetary policy is not approved. G5: progressive source/context sessions and
Solution Explain read-only; UI deferred SH-2. G6: per-request/snapshot consent;
key/model/live provisioning deferred SH-4. No existing ADR/D2 authority is replaced.

## WA-B1 formal acceptance / WA-B2 authorization — 2026-10-28

User accepts **WA-B1 COMPLETE — PASS WITH LIMITATIONS**:550 related PASS including
80 focused PASS, scoped tsc/lint/diff PASS. Accepted public-only provenance,
32 KiB/final qualified WA/operation-local/no History policy remains unchanged.
Native/Electron/build and target-host performance/RAM remain unverified.
WA-B2 is separately authorized for Renderer UI using the accepted contract, current
Practice theme/Tabs and existing ownership/lifecycle/History/Run boundaries. No new
Main authority or ADR change is needed; E7/AI-D1/D2/D3 history/status unchanged.

## ADR-025 amendment — WA-B1 approved, 2026-10-28

The user approves a narrow exception to aggregate-only Submit projection: only
Main-verified public-sample mismatch evidence from the same operation may accompany
final qualified WrongAnswer in STORAGE/SETTLED. Public Input/Expected come from
the matching leased public sample; Actual comes from the same settled RETURNED
comparison. No hidden values, Official IDs/indices/visibility, private plan metadata,
console/stack/internal diagnostics may cross transport. Missing provenance or
capture failure yields a fixed safe fallback. Diagnostic is operation-local,
at most32 KiB encoded inside the unchanged256 KiB response cap, never persisted
in records/history/backup/checksum. Comparator/reducer/fail-fast, Runtime budgets,
Storage/Restore/Completion authority remain unchanged. B1 excludes Renderer UI,
AI/network, native/full-suite/build/E2E. Existing acceptance history is unchanged.
This explicit user-approved public-only amendment supersedes aggregate-only wording
solely for this diagnostic; hidden Official Tests remain private.

## AI-D1 acceptance / AI-D2 authorized decisions — 2026-10-28

User accepts AI-D1 **COMPLETE — PASS WITH LIMITATIONS**: 65 targeted PASS/0 FAIL,
42 final-batch fake requests; native fetch/direct API, strict JSON, timeout,
cancellation, single-use and redaction accepted within the prototype. Historical
evidence/OpenCode prototypes remain intact. Real API, Electron runtime and key
provisioning remain UNVERIFIED.

User authorizes D2 saved-submission advisory analysis only. Accepted D1 bounds
and no-retry/no-repair/no-fallback policy apply. Source must be a verified
committed Accepted/graded Failed record; current public content must match its
packageVersion or fail `CONTENT_VERSION_MISMATCH` (no historical lookup added).
Input is exactly language/source/publicStatement/packageVersion. Capture TTL is
60 seconds; status is pull-based, correlated by requestId/sequence. One retained
operation per owner suppresses duplicate prepare/start and recovers lost ACK.
Explicit consent version 1 is required before dispatch. D2 production composition
has no provider/credential loader, environment-key lookup or live transport.
Tests may inject a Main-private fake transport/provider. No existing Runtime,
Registry identity, Storage write or E7 policy changes. Live model/endpoint,
provisioning, budgets and data terms remain separate D4 approval gates.

## Phase 9E-5 formal final acceptance — 2026-10-26

User formally accepts **Phase 9E-5 and E5-S1–S6: COMPLETE — PASS WITH LIMITATIONS**.
[Final acceptance](PHASE-9E5-FINAL-ACCEPTANCE.md) retains42 S6 targeted PASS,
29 focused regression PASS,30 filtered S5 tests (not PASS) and historical scoped
typecheck/lint/diff PASS. No evidence rerun, cross-step count aggregation, ADR
reopening or storage/security policy change; earlier execution statuses below are
historical. All original evidence/failures/corrections/limitations remain intact.

Documentation-only closure: consistency/document diff checks, no production/test
changes or tests/build/typecheck/lint/native/benchmark/smoke runs. E4 current-artifact
handoff remains NOT PASS; native/target-host/release certification UNVERIFIED;
storage durability/performance uncertified;12 performance models PENDING_RUNTIME;
all deferred verification gates unchanged. No end-to-end production/release
certification. **E6/E7 NOT_STARTED; STOP pending separate explicit E6 authorization.**

## E5-S2 formal acceptance — 2026-10-26

User formally accepts **E5-S2 COMPLETE — PASS WITH LIMITATIONS**. S1 remains COMPLETE — PASS WITH LIMITATIONS; Phase9E-5 IN_PROGRESS; S3–S6 NOT_STARTED. [S2 accepted packet](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md) retains29 targeted PASS/0 FAIL/0 SKIP, checked filesystem/identity/bounded read/staging, shared lease/retained ownership/release retry, actual Windows cross-process contention/reacquisition, unchanged native SHA256 and scoped typecheck/lint/diff PASS. Historical lint failure, corrections, first27/final29 coverage and limitations remain intact; no evidence rerun/rewrite.

Documentation-only acceptance: consistency/diff checks, no production/tests/typecheck/lint/build/native/smoke/user-data changes. E5-D1–D6 policies unchanged. Storage durability/crash recovery/performance/general native provenance/release remain NOT MEASURED or UNVERIFIED as recorded; E4 current-artifact handoff stays NOT PASS. This does not approve transaction/recovery or release certification. **STOP; await separate S3 authorization.** Earlier delivery/pending statements below are historical.

## E5-S1 formal acceptance / E5-S2 checked files and lease delivery — 2026-10-26

User formally accepts **S1 COMPLETE — PASS WITH LIMITATIONS (81 tests PASS)** and authorizes only **S2 checked filesystem/shared native lease**, including targeted temporary-file tests, Windows cross-process lease contention/release/reacquisition, native fingerprints, scoped typecheck/lint/diff. S1 sources/tests and E4 acceptance are unchanged/not rerun. E5-D1–D6 remain APPROVED with no new architecture/policy decision.

[S2 report](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md): new Main-private `store-files.ts`/`store-lease.ts`, two targeted suites and dedicated child lease fixture;29 PASS/0 FAIL/0 SKIP, scoped tsc/lint/diff PASS. Initial lint no-this-alias failure corrected; first27-test run PASS, then stale-token lifecycle review fix and two focused regressions yielded29 PASS, not56 unique tests. Native binary SHA256 `97dd803603ba655ab58d1df24e5de4957ff226c8ea31e1491d58c4bcfe0cbcc3` unchanged from preflight through final audit; actual acquireLease/close contention both directions, reacquisition and fixture stage/discard only, no Jobs/Runtime/Judge. This is new limited S2 lease evidence, not certification of E4 current artifacts/general native behavior.

**Phase9E-5 IN_PROGRESS — E5-S2; S2 REVIEW COMPLETED — AWAITING USER ACCEPTANCE (tracking IN_PROGRESS); S3–S6 NOT_STARTED.** Byte primitives do not implement a submission transaction, crash recovery, commit authority or completion. Native close failures retain handles; unresolved replacement/file identity stays retained for later managed reconciliation, not blind retry. Node TOCTOU/power-loss/UNC/target-matrix/performance limitations remain explicit. No native binary/Runtime/Core/ExerciseService/Official/public API/user-data changes or Git publication. STOP before S3; E4 recorded acceptance/current-artifact NOT PASS/current native broadly UNVERIFIED and deferred gates unchanged.

## Phase 9E-5 — Design / six-step plan / E5-D1–D6 APPROVED — 2026-10-26

User formally APPROVES [Storage Design](PHASE-9E5-SUBMISSION-STORAGE-DESIGN.md), [six-step plan](PHASE-9E5-IMPLEMENTATION-PLAN.md) and all six E5 decisions. **Only E5-S1 pure records/validation/storage contracts is authorized.** Phase9E-5 IN_PROGRESS — E5-S1; E5-S2–S6 NOT_STARTED. S1 delivery awaits independent user acceptance; approval does not permit advancing to S2.

| Decision | APPROVED selection / implementation boundary |
|---|---|
| E5-D1 | Immutable Accepted/Failed schemas, strict allowlists, deterministic encoding/checksum, Main-issued IDs/timestamps, Submit-only well-formed Unicode preserving exact source/CRLF. Accepted `userData/learning/accepted.json`; Failed `userData/learning/failed-submissions.json`. Run/draft validation unchanged |
| E5-D2 | Learning-only writer/shared store-family OS lease over existing native primitive, checked fail-closed filesystem; no generic PersistenceService/Runtime/native/Core change. Implementation S2, not S1 |
| E5-D3 | Versioned separate envelopes, one-target guarded atomic replacement, idempotency/retry/unknown reconciliation and deterministic recovery without staging promotion. Precommit expiry starts at first storage continuation entry,15s Accepted/10s Failed, no retry reset. S1 vocabulary/schema/encoding only; execution S3 |
| E5-D4 | Committed read model, Accepted-derived completion, partial availability/conflicts and bounded summaries/cursor/source chunks. Actual committed-read logic S4 |
| E5-D5 | Immutable Submit capture, trusted identity in owned Prepare, same-operation hold-through-commit, service-owned commit guard, retained storage/shutdown/owner invalidation. Integration S5 |
| E5-D6 | Public Submit/status and committed-read IPC/Preload allocated to S6 under E4-D4. Six independent stop gates; S6 safe transport only, UI/History/Restore E6 |

**S1 scoped verification APPROVED:** targeted `submission-records.test.ts`, scoped TypeScript for two new source modules/test and imported closure, targeted ESLint and scoped diff checks only. No full suite/repository checks/build/native/filesystem/restart/Official Runtime/UI/smoke/performance operations. This explicit S1 amendment supersedes general quality-command requirements for S1 only; no production configuration change.

S1 concrete schema1 uses UUIDv4 identities, ISO UTC millisecond timestamps, exact SHA256 UTF-8 source, fixed canonical JSON field order, checksum over the envelope without checksum, and a trailing LF in encoded snapshots. Genesis is sequence1/null predecessor/one record; subsequent envelope links immediately preceding sequence/ID/digest; supplied-predecessor validation also checks same-store append-only prefix plus one record. These are pure data/encoding rules within approved D1/D3, not proof of commit/ownership/trusted Judge origin. [S1 report](PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md) records81 synthetic tests PASS and scoped checks; **REVIEW COMPLETED — AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS.

Approved9E0-A/B/H1–H5 capacities/timeouts/eligibility/completion/security unchanged. E4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope); current-artifact handoff NOT PASS/current native UNVERIFIED,12 models PENDING_RUNTIME, general Official60s/target-host/reliability/release UNVERIFIED; storage performance NOT MEASURED/durability UNVERIFIED. No S2–S6 or E6/7 implementation authorization, artifact rebuild/history restoration or Git publication.

## Phase 9E-4 — Option A recorded-hash acceptance APPROVED — 2026-10-26

The user explicitly approves **Option A — Recorded-hash Acceptance** in the [final acceptance](PHASE-9E4-FINAL-ACCEPTANCE.md). S1/S2/S3 remain COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only); Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope);9E-5 NOT_STARTED. Existing4/4 native PASS/22 Jobs/VERIFIED cleanup/content release/zero Registry ledger and scoped checks are accepted for recorded native-run artifact hashes only. This supersedes prior pending acceptance statements without rewriting receipts, hashes or drift audit.

Current-artifact handoff remains **NOT PASS**. The different current native binary is UNVERIFIED; `out/main/index.js` changed post-run without full-app verification. No current-artifact/release certification; finalized artifacts require appropriate release verification.12 models PENDING_RUNTIME; general Official60s/target-host/reliability/release UNVERIFIED; deferred loader/installed/offline/filesystem gates unchanged. No architecture/verdict/Runtime/security decision changes.9E-5 must design commit-time owner validation, same-operation hold-through-commit and storage/recovery; public Submit transport remains unimplemented and needs explicit allocation under E4-D4. Documentation-only acceptance; no tests/native operations/rebuild/restore/production changes or9E-5 implementation authorization.

## Phase 9E-4 — User approval / E4-S1 authorization — 2026-10-26

The user **APPROVES** the [Generic Judge design](PHASE-9E4-GENERIC-JUDGE-DESIGN.md), [four-step plan](PHASE-9E4-IMPLEMENTATION-PLAN.md) and E4-D1–D4. Only S1 comparator/private types is authorized; S2–S4 NOT_STARTED. Existing verdict semantics/precedence, Runtime/security/quotas/deadlines/ownership/Policy B unchanged.

| Decision | APPROVED selection |
|---|---|
| E4-D1 | Option A: narrow leased Judge view, synchronous consumer, service-owned final handoff after VERIFIED cleanup/release; integration awaits S3 |
| E4-D2 | Main-private comparator/reducer/scalar eligibility contracts, preserving approved verdict semantics/precedence; S1 defines types/comparator only |
| E4-D3 | Four independently accepted steps, targeted verification. S1 explicit amendment: targeted tests/scoped typecheck/lint/diff checks only; no full checks/build/E3/native/benchmark/UI smoke |
| E4-D4 | Main-private Judge only in 9E-4. Public Submit transport/IPC/UI remains required/unimplemented and must be assigned to an approved package before UI work; no silent omission/automatic implementation |

Historical document deletions are user-intended; no restore/investigation. User-restored ExerciseService briefly checked unchanged against Git baseline with E3 seams/dependencies present. [S1 evidence](PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md) is pure comparator evidence, not native Judge certification. Phase9E-3 COMPLETE — PASS WITH LIMITATIONS; Phase9E-4 IN_PROGRESS — E4-S1, awaiting acceptance. Stop before S2.

This log records decisions for Student Coding IDE. It does not describe Orca decisions. `Accepted` decisions are implementation constraints; `Proposed` decisions require the named gate before implementation.

## ADR-001 — Build and development tool

- **Status:** Accepted
- **Context:** Phase 0 requires an Electron + React + TypeScript desktop foundation with a fast development loop.
- **Options:** Vite with custom Electron wiring; electron-vite; another bundler.
- **Selected option:** `electron-vite`.
- **Rationale:** It is already verified by the Phase 0 foundation and keeps main, preload, and renderer builds explicit.
- **Consequences:** Configuration remains in `electron.vite.config.ts`; no Next.js application layer is introduced.
- **Phase:** 0, confirmed in Phase 1.

## ADR-002 — Privileged process boundary

- **Status:** Accepted
- **Context:** Files, shells, Git, child processes, and local settings require Node/Electron privileges.
- **Options:** Node-enabled renderer; broad preload bridge; sandboxed renderer with narrow preload APIs.
- **Selected option:** Sandboxed, context-isolated renderer with Node integration disabled and domain-specific preload APIs.
- **Rationale:** It meets the desktop security requirement and contains privilege at auditable boundaries.
- **Consequences:** Main owns privileged services; preload has no business state and never exposes raw `ipcRenderer`.
- **Phase:** 1.

## ADR-003 — IPC contracts

- **Status:** Accepted
- **Context:** The renderer needs finite calls, streams, lifecycle notifications, and cancellation.
- **Options:** Generic invoke/execute API; untyped channels; typed domain contracts with runtime validation.
- **Selected option:** Typed domain contracts, `<domain>:<action>` naming, main-side validation, serialized `AppError`, scoped events, and domain cancellation.
- **Rationale:** Compile-time types alone do not secure the runtime boundary; generic execution would widen authority.
- **Consequences:** Contract types remain side-effect free; every event subscription returns cleanup; no raw shell/filesystem channel exists.
- **Phase:** 1.

## ADR-004 — V1 project model

- **Status:** Accepted
- **Context:** Orca supports repositories, worktrees, folder workspaces, and remote execution hosts; V1 requires a student to open/create one local project.
- **Options:** Reproduce Orca workspace model; multi-root workspace; one active local folder project.
- **Selected option:** One active local folder project with recent-project metadata and per-project workspace UI state.
- **Rationale:** It satisfies V1 without agent/worktree/remote orchestration.
- **Consequences:** Project switching uses unsaved-change protection; multi-root and worktrees are future scope.
- **Phase:** 1.

## ADR-005 — Filesystem and search ownership

- **Status:** Accepted
- **Context:** Renderer file access must be safe and large projects must not freeze UI.
- **Options:** Renderer Node access; unrestricted absolute-path API; main-owned project-scoped API.
- **Selected option:** Main-owned async filesystem/search services using project IDs and validated relative paths.
- **Rationale:** This preserves authorization and supports lazy traversal, watchers, exclusions, progress, and cancellation.
- **Consequences:** Default search exclusions are `.git`, `node_modules`, `dist`, `build`, and `out`; symlinks are not followed outside root by default. Phase 2 filesystem monitoring exposes only project-scoped `AVAILABLE`/`UNAVAILABLE` authority, with close/reopen recovery rather than a new workspace-recovery system.
- **Phase:** 1.

## ADR-006 — Editor model ownership

- **Status:** Accepted
- **Context:** Tabs, dirty buffers, save races, language IDs, and view restoration need one owner.
- **Options:** Component-local models; one global text blob per tab; renderer EditorModelManager.
- **Selected option:** Renderer-owned EditorModelManager with one Monaco model per canonical file identity; disk I/O remains in FileSystemService.
- **Rationale:** It preserves undo/model identity across tab switches and separates UI, model, and disk responsibilities.
- **Consequences:** Saves are version-aware; closing/switching invokes unsaved protection; models and subscriptions have explicit disposal. Externally deleted open files retain their buffer in an explicit disk-missing state and are not silently recreated by normal save.
- **Phase:** 1.

## ADR-007 — Terminal implementation

- **Status:** Accepted, with Phase 2 Windows/native compatibility gate
- **Context:** V1 requires a real integrated terminal on Windows with resize, input/output, and cleanup.
- **Options:** `child_process` pipes; direct ConPTY implementation; xterm.js + `node-pty`; web terminal service.
- **Selected option:** xterm.js renderer UI plus main-process `node-pty`.
- **Rationale:** Pipes do not provide terminal semantics; direct ConPTY is disproportionate; the selected pair is established and maps cleanly to the required process boundary.
- **Windows V1 shell policy:** Resolve valid `pwsh`, then Windows PowerShell, then `ComSpec`/`cmd.exe`. Phase 2E has no configured custom-shell support; user-configurable shell selection is deferred to Phase 6 Settings.
- **Consequences:** `node-pty` is native. Before Terminal implementation is accepted, the Phase 2 spike verifies installation, Electron ABI compatibility, PTY startup inside Electron, PowerShell/cmd launch, input/output, resize, close, process cleanup, and native-module feasibility on Windows. Full packaged-app verification, release artifacts, installer work, and installer smoke testing remain Phase 7 responsibilities. If the compatibility spike fails, reopen this ADR before feature code proceeds.
- **Phase 2E-B evidence (2026-08-30):** On Windows x64, the `node-pty` 1.1.0 shipped prebuild loaded and operated under Electron 44.0.0 / bundled Node 24.18.1 / module ABI 149 without rebuilding. Windows PowerShell was selected because `pwsh` was unavailable; the repository-root PTY passed deterministic input/output, resize, Ctrl+C, single exit-event/code capture, owned-PID release, and clean Electron-exit checks. An electron-vite Main build retained external `node-pty` resolution and repeated the native smoke successfully. `@electron/rebuild` and a native build chain are not required now. This evidence does not claim production TerminalService behavior, descendant-tree cleanup, packaging, or installer acceptance.
- **Phase:** 1 decision; Phase 2 spike/implementation.

## ADR-008 — Separate process semantics

- **Status:** Accepted
- **Context:** Terminal PTYs and Run processes launch OS processes; a future authorized external language server would also launch a process but would have a different protocol and lifecycle.
- **Options:** One public `executeCommand()` service; three domain services over limited shared internals.
- **Selected option:** TerminalService and RunService remain separate. If future scope authorizes an external provider, LanguageServiceManager is a third separate domain; internal ProcessManager only shares ownership registry and safe cleanup primitives.
- **Rationale:** A generic executor loses domain semantics and creates a dangerous renderer capability.
- **Consequences:** Each implemented service has its own applicable states, cancellation, output, cleanup, and error mapping. This ADR preserves but does not require a V1 external LanguageServiceManager.
- **Phase:** 1.

## ADR-009 — Git implementation

- **Status:** Accepted
- **Context:** V1 needs predictable local Git behavior and explicit dependency detection.
- **Options:** Direct Git CLI calls in handlers; Node Git implementation/library; typed service wrapping the local Git CLI.
- **Selected option:** A typed GitService wrapping the local Git CLI with executable/argument arrays.
- **Rationale:** It keeps native Git semantics visible and debuggable while centralizing parsing, validation, cancellation, and errors.
- **Consequences:** Git must be installed or configured; dependency state is `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, or `INVALID_CONFIGURATION`. Credentials are delegated to Git/OS. Hosted reviews are omitted.
- **Phase 5A policy:** Main performs PATH-first detection of exact `git.exe`
  candidates without PATHEXT or cwd fallback. A validated candidate is
  `AVAILABLE`; absence is `MISSING`. `NOT_CONFIGURED` and configured-path
  `INVALID_CONFIGURATION` remain in the public contract but are not emitted by
  Phase 5A. Renderer supplies no executable, cwd, arguments, or shell content.
  Repository detection runs a bounded fixed Git probe at the authorized active
  project root. Git's canonical top-level must equal the canonical project root;
  a normal non-Git folder or a subfolder of a parent repository returns the
  typed `NOT_REPOSITORY` state rather than an `AppError`.
- **Phase:** 1 decision; implementation Phase 5.

## ADR-010 — Persistence strategy

- **Status:** Accepted
- **Context:** Recent projects, settings, configured paths, and workspace UI state must survive restart without a database server.
- **Options:** Browser localStorage; one unversioned JSON blob; server/database; versioned main-owned JSON documents.
- **Selected option:** Versioned JSON in Electron user data, split into app settings/recent projects and per-workspace state.
- **Rationale:** It is local-first, inspectable, small, and controllable at the privileged boundary.
- **Consequences:** Use serialized atomic replacement, last-known-good backup, schema migrations, defaults, and corruption recovery. Exact helper package is not selected; a package is unnecessary unless Phase 2 analysis proves value. Phase 2 retains only minimal recent-project metadata; list-management and any product limit policy remain part of the Phase 6 Recent Projects UX rather than an invented Phase 2 setting.
- **Phase:** 1.

## ADR-011 — Renderer state management

- **Status:** Proposed
- **Context:** The shell needs persistent, workspace, editor, process-view, and ephemeral state without overengineering.
- **Options:** React local/context state; Zustand; Redux; another store.
- **Selected option:** `TBD` during early Phase 2 based on actual cross-feature update needs; default to local state and focused feature stores.
- **Rationale:** Orca's Zustand usage reflects a much larger product and is not sufficient reason to add a dependency.
- **Consequences:** Phase 2 must document the choice before shared shell/project/editor state expands; no global all-domain store.
- **Phase:** 2 decision gate.

## ADR-012 — Error, logging, and cancellation model

- **Status:** Accepted
- **Context:** Node errors are not stable IPC contracts and long operations need usable recovery.
- **Options:** Pass thrown errors; string-only errors; structured application errors and domain cancellation.
- **Selected option:** Structured `AppError` categories, redacted source/session logs, and domain-specific cancellation/lifecycle operations.
- **Rationale:** UI receives actionable states while detailed diagnostics remain available without leaking secrets.
- **Consequences:** Search, Run, Terminal, Git, and language requests define their own cancellation semantics and ignore stale events by ID.
- **Phase:** 1.

## ADR-013 — Language intelligence boundary

- **Status:** Accepted
- **Context:** Tier 1/2 capabilities must survive provider failure and remain independent of runtimes. Phase 3B confirmed that every Phase 3 intelligence language could use Monaco/browser workers without an external process. Phase 5.5 later authorizes C# as the first external-provider extension under this boundary.
- **Options:** Feature code talks directly to individual workers/servers; a renderer provider manager for browser workers; one Main LanguageServiceManager for external processes; a provider boundary spanning both execution models.
- **Selected option:** Phase 3 uses a renderer-owned LanguageProviderManager and Monaco/browser-worker adapters. Phase 5.5 adds a separate Main-owned LanguageServiceManager for C#; it was not a Phase 3 implementation requirement.
- **Rationale:** Providers differ, but diagnostics, capability checks, status UX, and isolation must be consistent.
- **Consequences:** Runtime/dependency detection uses `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, and `INVALID_CONFIGURATION`. Current workers expose only applicable capability/status and renderer-owned recovery/cleanup behavior. The broader external-service lifecycle vocabulary was not imposed as a Phase 3 exit gate; ADR-022 applies it to C# with dependency/lifecycle separation. Provider registry, document sync, normalized diagnostics, status, and cleanup remain required for current Monaco providers. C# and later external providers remain Main-owned and independent of runtime execution.
- **V1 recovery clarification:** Manual user-facing `Restart Language Service` is not required. Current Monaco/browser-worker providers use safe disposal and natural renderer-owned reinitialization/recovery where supported, without a restart button, command, menu item, IPC endpoint, or new lifecycle UX. Dirty buffers remain authoritative and stale project/provider generations remain rejected. ADR-022 retains no public manual lifecycle API or automatic restart loop for C#.
- **Phase:** Phase 1 boundary, resolved for Phase 3 by ADR-015 and Phase 3B evidence; extended for C# Phase 5.5 by ADR-022.

## ADR-014 — TypeScript execution strategy

- **Status:** Deferred — future TypeScript Run decision gate; not a Phase 4 V1 blocker
- **Context:** Explicit user scope clarification limits Phase 4 V1 to the current authorized JavaScript `.js` file inside the active project via Node.js. TypeScript Language Intelligence remains supported from Phase 3; TypeScript Run is deferred, not permanently rejected.
- **Options:** `tsx`; `ts-node`; compile with `tsc` then Node; Node native type stripping where the detected runtime supports the file/project.
- **Selected option:** None. V1 selects no TypeScript runtime, compile/transpile strategy, `tsx`, `ts-node`, or Node-native TypeScript execution policy. The options below are future comparison evidence only, not approved dependencies or implementation work.
- **Rationale:**
  - `tsx`: simple and fast; adds a dependency and may differ from project build configuration.
  - `ts-node`: familiar but configuration/ESM behavior can be harder for beginners.
  - `tsc` + Node: accurate compile diagnostics but slower and needs output/config lifecycle.
  - Node native TypeScript: no runner dependency but behavior depends on Node version and supports only erasable syntax/config limitations.
- **Consequences:** Before a future authorized TypeScript execution implementation, decide and verify the strategy, including Windows paths, ESM/CommonJS, source maps/error locations, `tsconfig`, runtime compatibility, cancellation/tree cleanup, and the authorized file/project scope. Record the final selection here. RunService retains a narrow internal RunStrategy boundary with only JavaScriptRunStrategy in Phase 4 V1; a future TypeScriptRunStrategy must not require redesigning core RunService. Do not implement placeholder TypeScript production code.
- **Related scope clarification:** Built-in Run Project, npm/package-manager scripts, dev-server orchestration, project entry configuration, and framework/project launcher logic are deferred from Phase 4 V1. Future Run Project requires a separately authorized entry/script policy. This clarification resolves no other Run behavior or lifecycle decision.
- **Phase:** Future TypeScript Run gate; not a dependency or exit gate for current Phase 4 JavaScript implementation.

### Approved Phase 4 V1 Run policies

Explicit user decisions apply to current-file JavaScript Run only:

- One active session per target. Re-run stops the old session and awaits
  successful cleanup before replacement, with no prompt or overlapping sessions.
- Dirty target: block Run and require explicit Save; do not auto-save, execute
  stale disk content, create temporary execution files, or mutate editor buffers.
- Node detection: Main-controlled process PATH only; unresolved Node is `MISSING`
  and blocks Run with a safe useful error. Bundled Node, configured absolute Node
  paths, and Node-path Settings UI are deferred. No detection dependency is approved.
- Confirmed project close/switch waits for all project Run cleanup before commit;
  cleanup failure preserves current project/editor state. Root unavailability
  stops project runs and rejects stale events, including across replacement projects.
- One primary Run action on the right of the editor header. Output joins Problems
  and Terminal in the existing Bottom Panel. No duplicate Run affordance or
  Terminal redesign.
- Windows process-tree feasibility is a read-only gate before implementation:
  verify creation-time ownership for a Node process with separate stdout/stderr,
  descendants after root exit, bounded whole-tree cleanup, and reuse of existing
  shutdown/project ownership. No production/native/dependency/package-lock change,
  ProcessManager redesign, timeout change, lifecycle change, or test weakening is
  authorized by that review. Report insufficiency for user decision.

These are approved product policies, not evidence of an implemented RunService
or a passed Windows feasibility gate. ADR-014 remains deferred as stated above.

## ADR-015 — Phase 3 V1 language scope and providers

- **Status:** Accepted — Phase 3 V1 scope resolved; C# external-provider extension is governed by ADR-022
- **Context:** The original candidate scope included Python intelligence and Java syntax. Phase 3A confirmed that the web-language requirements can use Monaco-native providers while Python would introduce a materially different external-service dependency and lifecycle. The approved V1 scope is JavaScript/TypeScript, HTML/CSS/JSON, and syntax-only C#/PHP; Python and Java are intentionally deferred rather than permanently removed.
- **Options:** Monaco built-in workers; external LSP/language services; a mixed architecture; reduce current scope while preserving the provider boundary for future languages.
- **Selected option:**
  - Use Monaco-native workers/providers for JavaScript, TypeScript, HTML, CSS, and JSON.
  - Give JavaScript/TypeScript bounded project visibility through a bounded project snapshot/source synchronization strategy. Do not mirror all of `node_modules`, and do not expose the real canonical project root to Renderer merely for TypeScript resolution.
  - Use Monaco tokenization only for C# and PHP.
  - Use measured initial JS/TS snapshot ceilings of 500 source files, 5 MiB total
    UTF-8 content, and 256 KiB per file for the 3C implementation baseline. Keep
    editing/saving available for excluded sources and revisit only with measured
    evidence.
  - Keep JSON schema resolution offline and deny-by-default. Phase 3D may use
    explicitly bundled or application-trusted schemas, but may not enable
    implicit network fetching.
  - Defer HTML diagnostics and HTML Problems contribution from current V1
    because the approved Monaco HTML provider has no validation support. Keep
    HTML syntax, completion, and provider-supported hover; do not add a custom
    validator/parser, dependency, external provider, project index, IPC, or
    network capability to replace diagnostics.
  - When the active project root becomes `UNAVAILABLE`, stop project intelligence and clear stale diagnostics while preserving editor buffers, syntax highlighting, and the open project.
  - Defer Python provider selection and all Python LSP lifecycle work. No Pyright, basedpyright, python-lsp-server, `vscode-jsonrpc`, Python interpreter detection for intelligence, or Python document synchronization is approved in current Phase 3.
  - Defer Python runtime integration and Python Run from current V1.
  - Defer all Java support from current V1, including required syntax acceptance, language intelligence, Run, and Java-specific provider/runtime infrastructure.
  - Defer every external language-server process implementation from Phase 3. Preserve Main ownership as a future extension boundary only.
- **Rationale:** This is the smallest architecture that meets the approved current capabilities without adding an external process, new privileged bridge, or language-runtime coupling. The provider boundary keeps later Python and Java additions possible without redesigning Editor, Project, or Language ownership.
- **Consequences:** Phase 3B established snapshot thresholds, exclusions, safe virtual URI mapping, dirty-model precedence, trusted/offline JSON schema policy, provider status contracts, and cleanup rules before production intelligence implementation. It verified editor, JavaScript/TypeScript, HTML, CSS, and JSON workers from local hashed production-renderer assets; JS/TS same-file, cross-file, mixed-language, JSX/TSX, definition and diagnostics feasibility; dirty-model precedence; project cleanup; and stale project/provider generation protection. Phase 3C converted the JS/TS path into bounded production synchronization. Phase 3D verified model-local HTML completion/hover, CSS completion/hover/diagnostics, and local schema-free JSON completion/diagnostics while disabling schema requests; JSON hover produces no useful result without a configured local schema. Phase 3 providers stay Renderer/Monaco-worker based. Phase 3 diagnostic inputs were JavaScript, TypeScript, CSS, and JSON; HTML diagnostics require a future separately approved provider decision. No Python or Java provider exists, and C#/PHP remained tokenization-only in Phase 3. ADR-022 newly authorizes the C# external-provider extension without rewriting that history. Full packaged/installed acceptance remains Phase 7 and is not claimed by Phase 3B-3D or Phase 5.5A–5.5H.
- **Rejected for Phase 3:** Wholesale `node_modules` mirroring; arbitrary package discovery or unrestricted external type loading; canonical project-root exposure to Renderer for TypeScript resolution; generic language IPC; Renderer-owned filesystem/process authority; Python/Java providers; every external language-server process.
- **Phase:** Phase 3A provider gate resolved and Phase 3B evidence recorded; the Phase 3 scope was clarified before 3C. ADR-022 governs the separately authorized Phase 5.5 C# extension.

## ADR-016 — IPC runtime validation

- **Status:** Accepted
- **Context:** Renderer-to-main IPC crosses the privileged Electron boundary. TypeScript compile-time types do not validate values received at runtime.
- **Options:** Hand-written validators; Zod; Valibot; another lightweight schema-validation mechanism.
- **Selected option:** Use small explicit validators for Phase 2 IPC contracts. Every renderer-to-main request is validated before it reaches a domain service, validators return normalized field-level issues, and a type assertion such as `as SomeRequest` is never treated as validation.
- **Rationale:** Phase 2A has a small contract surface with simple object, identifier, and path primitives. Explicit validators make the privileged checks auditable and testable without adding a schema runtime or bundling cost. If later contract scale makes duplication or drift material, this ADR must be reopened before adding a schema library.
- **Consequences:** Validation occurs at the privileged boundary; invalid payloads map to `INVALID_INPUT`; domain services receive validated data; validators and their inferred/narrowed contract types are tested together; no generic unrestricted IPC payload is allowed.
- **Phase:** 1 principle; mechanism resolved in Phase 2A.

## ADR-017 — External URL and navigation policy

- **Status:** Accepted
- **Context:** BrowserWindow navigation and external URL opening cross a privileged Electron boundary. The development renderer uses an HTTP origin, but that internal development transport must not authorize arbitrary external HTTP navigation.
- **Options:** Allow common web/mail protocols; allow HTTPS only; block all external opening.
- **Selected option:** External opening is limited to validated `https:` URLs. Block `http:`, `mailto:`, `file:`, custom protocols, and every other external protocol. Renderer navigation remains restricted to the exact current application origin; the electron-vite development renderer origin is an internal development exception only, while packaged navigation remains restricted to packaged application content.
- **Rationale:** HTTPS-only external opening provides the required documentation-link capability with the smallest approved external protocol surface.
- **Consequences:** Main validates URLs before calling `shell.openExternal`; preload never exposes unrestricted external opening or Electron shell primitives; in-window navigation away from the exact application origin is denied.
- **Phase:** 2A security policy.

## ADR-018 — Automated test infrastructure

- **Status:** Accepted
- **Context:** Phase 2A requires executable unit, main/service, IPC-boundary, persistence, security, and lifecycle tests. The repository currently uses Vite/electron-vite with TypeScript and has only a failing placeholder test command.
- **Options:** Node.js built-in test runner; Jest with a TypeScript transform; Vitest; a full Electron end-to-end runner as the initial test layer.
- **Selected option:** Use Vitest in its Node environment by default for unit, main/service, contract, persistence, security, and adapter-level IPC integration tests. Use explicit Electron port/factory adapters so privileged behavior can be exercised without exposing or heavily mocking live Electron objects. Renderer component integration tests that require DOM interaction use file-scoped jsdom with React Testing Library; Node remains the environment for all other tests. Add full Electron end-to-end tooling only when a later work package has behavior that requires it.
- **Rationale:** Vitest shares the existing Vite TypeScript transform, supplies assertions/mocking in one compatible dependency, and runs on both CI Node 22 and the supported local Node versions. Node's runner would require a separate TypeScript execution convention; Jest would duplicate the Vite transform; a browser/Electron E2E stack is disproportionate before a workflow genuinely requires it. Phase 2B corrective review demonstrated a concrete need for component interaction coverage that reducer-only tests could not provide, so `jsdom`, `@testing-library/react`, and `@testing-library/dom` were explicitly approved as development-only dependencies.
- **Consequences:** `npm test` is the stable CI command and runs Vitest once; focused tests use `*.test.ts`; CI runs tests after typecheck and lint; only Renderer component test files opt into jsdom; real Electron smoke/E2E coverage remains a later incremental gate rather than being claimed by component or adapter tests.
- **Phase:** 2A test infrastructure gate; component-test environment extended during Phase 2B corrective review.

## ADR-019 — Phase 2C editor integration and data-safety policy

- **Status:** Accepted
- **Context:** Phase 2C requires retained Monaco models, source-file writes, unsaved protection across project/application transitions, Explorer coordination, and bounded external-change behavior. The existing architecture fixed ownership boundaries but intentionally left the React wrapper and destructive multi-document policies to the Phase 2C gate.
- **Selected options:**
  - Use `@monaco-editor/react` only as the React mounting layer and configure it with the locally imported `monaco-editor` instance. `EditorModelManager` remains authoritative for document/model identity, dirty baselines, view state, and disposal.
  - Keep focused React/editor state without adding a global renderer-state dependency. ADR-011 remains pending unless later cross-feature evidence requires a shared store.
  - Use one consolidated `Save All` / `Don't Save All` / `Cancel` decision for transitions involving multiple dirty documents. A failed save aborts the transition; earlier successful saves remain saved.
  - Before deleting one open dirty file, require `Save` / `Don't Save` / `Cancel`. Only an approved and, where selected, successfully saved document is closed before the existing Recycle Bin operation.
  - Deleting a folder resolves every open dirty descendant in one consolidated `Save All` / `Don't Save All` / `Cancel` decision. Descendants are selected by normalized project-relative ancestry, never raw string-prefix matching. All required saves must succeed before any affected document is closed; clean descendants close immediately before the Recycle Bin request. A failed Recycle Bin operation is surfaced and never falls back to permanent deletion.
  - Automatically reload externally changed clean documents while retaining view state where practical. Preserve dirty buffers and expose an external-change conflict warning; no Phase 2C merge editor is introduced.
  - Save source files through a validated direct write. Source-file atomic replacement and disk-conflict/version detection are not claimed. Application/workspace JSON persistence retains ADR-010 atomic replacement.
  - Use a narrow transition-ID request/response protocol driven by Main. It participates in the authoritative ProjectService transition guard and application-close coordination; invalid/stale responses, renderer disappearance, timeout, and save failure fail closed.
- **Rationale:** These policies preserve the accepted privilege boundary and prevent silent source loss while keeping Phase 2C smaller than a general conflict-management or renderer RPC subsystem.
- **Consequences:** File write receives only ProjectId, normalized project-relative path, and text. Project/application transitions may wait for the owning renderer. The protocol is lifecycle-specific, validates transition ownership and identity, and cannot execute arbitrary renderer requests. Phase 2C tests must cover save races, multi-document decisions, delete coordination, external changes, timeout/disappearance, and stale transition responses.
- **Phase:** 2C decision gate.

## ADR-020 — Windows terminal descendant-process cleanup

- **Status:** Accepted — reopened and superseded by Phase 2E-J corrective Step 2.
- **Context:** Phase 2E-B proved Electron/`node-pty` native compatibility and Phase 2E-D/G implemented semantic session/project cleanup. Phase 2E-H then proved that `node-pty` `kill()` alone was insufficient: shell PID 22796 and child PID 18376 exited, but owned grandchild PID 26396 remained alive after three seconds while unrelated control PID 29916 correctly survived. Main had already emitted one exit and removed the ProcessManager resource, creating a false-clean descendant state.
- **Options:** Retain current `node-pty` close/kill behavior if controlled evidence proves it sufficient; invoke targeted `taskkill /PID <owned-pid> /T`; enumerate and terminate a validated owned process tree; contain PTY trees with Windows Job Objects.
- **Selected option:** Windows Job Object is the primary Windows V1 terminal process-tree backend. A small reproducible patch to pinned `node-pty` 1.1.0 extends its ConPTY `STARTUPINFOEX` path with `PROC_THREAD_ATTRIBUTE_JOB_LIST`, assigning a dedicated Job atomically at the native `CreateProcessW` boundary. Spawn fails closed if the patched capability, Job creation, attribute association, or process creation is unavailable. The native integration retains the Job handle behind an opaque integration-created token independent of root-process lifetime. Natural root exit retains session and ProcessManager ownership. Finalization is explicit `TerminateJobObject`, bounded `ActiveProcesses == 0` confirmation, `CloseHandle`, then session/ProcessManager release. `KILL_ON_JOB_CLOSE` is not enabled. The previous fingerprinted targeted-taskkill backend remains only for explicit legacy/unestablished ownership and is forbidden after Job establishment or Job termination failure.
- **Trade-offs:**
  - Current behavior is smallest and easiest to maintain, but evidence may show descendants survive.
  - Targeted `taskkill /T` is built into Windows, but PID ownership/reuse, invocation, force semantics, and close races require strict control.
  - Process-tree enumeration can validate targets individually, but ancestry snapshots race with spawn/exit and add permissions/platform code.
  - Job Objects provide strong containment/kill-on-close semantics, but introduce native integration, nesting, ABI, maintenance, and Phase 7 packaging implications.
- **Evidence:** The original Phase 2E-H targeted-taskkill evidence remains valid only for the gated legacy backend. Corrective Step 2 rebuilt the patched native module for Electron 44 x64 and verified its capability marker. The native smoke created shell 28332, child 24636, grandchild 16628, Job-owned conhost helpers 28792 and 25964, and unrelated control 2396. After the shell exited naturally, its PID was gone while the Job remained valid with four active descendants. Explicit Job termination removed the descendants/helpers, preserved the control process, confirmed the Job empty, released the handle, and produced one PTY exit event. A production-service Electron smoke used shell 33128, child 31128, grandchild 6332, and control 5888; ProcessManager stayed registered after natural root exit and reached zero only after successful Job finalization, with one terminal exit. Automated lifecycle/race tests verify failure retention and duplicate-trigger sharing.
- **Related decisions:** V1 remains Windows 10/11 x64 without turning this evidence host into a minimum build. Phase 7 retains packaged/installed Windows CI and release acceptance. Renderer/preload authority is unchanged. Phase 2E-J corrective Step 1 fixed ProcessManager cleanup ownership; Step 2 owns natural-root/Job finalization; Step 3 separately owns application-shutdown semantics.
- **Consequences:** Every newly created production Windows terminal is Job-owned or fails creation. Root PID is not cleanup authority after Job establishment. Job failure retains native and Main ownership; no PID fallback is allowed. An opaque token can address only Jobs created by this integration, and unknown/stale tokens fail. Patch application and Electron ABI rebuild fail loudly, while packaging policy remains Phase 7. Never kill by process name or expose generic renderer spawn/signal/process-control authority.
- **Phase:** 2E-J corrective Step 2; Phase 7 retains packaged/installed verification.

## ADR-021 — Graceful application shutdown failure semantics

- **Status:** Accepted.
- **Context:** Phase 2E-J found that `DesktopApplication` transitioned to
  `STOPPED` in a `finally` path and Electron's `before-quit` handler called
  `app.quit()` after cleanup rejection. Either path could report false shutdown
  success after terminal/Job cleanup failed.
- **Selected option:** Graceful shutdown is fail-closed. The application uses
  `RUNNING -> STOPPING -> STOPPED`, reaches `STOPPED` only after every mandatory
  started service stops successfully, and remains `STOPPING` after failure.
  Successfully stopped services are removed individually; the failed service
  and not-yet-stopped dependencies remain owned for a deterministic later retry.
  Concurrent shutdown calls share one in-flight attempt. WindowManager stops
  last so the existing close surface remains available while cleanup is
  incomplete.
- **Electron coordination:** The first `before-quit` is prevented while close
  approval and cleanup run. Cleanup success authorizes exactly one final
  `app.quit()`; the resulting recursive event passes through without another
  stop. Cleanup failure is logged through a redacted Main callback, does not
  authorize final quit, and clears only the failed attempt so a later graceful
  quit can retry. BrowserWindow close and non-macOS `window-all-closed` route
  through this same coordinator.
- **Rationale:** This preserves the Step 1 ProcessManager and Step 2 Windows Job
  ownership invariant without adding a force-quit policy, failure UX, public
  lifecycle state, dependency, native helper, or Renderer/preload/IPC authority.
- **Consequences:** `STOPPING` can be retained across a failed cleanup attempt;
  normal privileged work remains unavailable, but the existing window close
  path can request another retry. No automatic retry, timeout force quit,
  `app.exit()`, or `process.exit()` fallback exists. Unpreventable OS/process
  termination remains outside graceful-shutdown guarantees.
- **Evidence:** Phase 2E-J corrective Step 3 automated coverage verifies state
  transitions, error propagation, retained ownership, retry, concurrent calls,
  recursive quit protection, final-quit cardinality, and WindowManager bypass
  prevention. Electron 44 Windows x64 native smokes verify live-root and
  natural-root Job cleanup before `STOPPED`, one final quit request, descendant
  removal, ProcessManager release, and unrelated-process survival.
- **Phase:** 2E-J corrective Step 3.

## ADR-022 — Phase 5.5 C# language intelligence

- **Status:** Accepted; Phase 5.5B compatibility gate passed on 2026-09-10.
- **Context:** C# completed Phase 3 as syntax-only. A newly authorized Phase 5.5
  extends C# V1 with completion, hover, signature help, go to definition,
  diagnostics, and Problems integration while preserving the sandboxed Renderer,
  one-active-project model, editor data safety, and independent Run lifecycle.
- **Options:** Integrate a full VS Code compatibility layer in Renderer; expose
  raw LSP/JSON-RPC through Preload; or use a Main-owned `csharp-ls` process with a
  thin semantic LSP↔Monaco adapter and typed capability-specific APIs.
- **Selected option:**
  - Main owns `LanguageServiceManager`, `csharp-ls`, JSON-RPC/LSP transport,
    executable selection, workspace paths, lifecycle, cancellation, and cleanup.
  - Use provider-per-capability: Monaco tokenization for C# syntax;
    `csharp-ls` for completion, hover, signature help, definition, and diagnostics.
  - Use pinned `csharp-ls` 0.27.0 with `vscode-languageserver-protocol` 3.18.3
    and `vscode-jsonrpc/node` 9.0.2, the exact stack verified by Phase 5.5B.
    Phase 5.5B itself installs nothing into the production application.
  - The public language API is semantic and typed. It carries `projectId` plus
    project-relative paths and exposes no raw LSP/JSON-RPC, PID, executable path,
    cwd, spawn arguments, canonical project root, or raw logs. Main derives the
    owner from trusted Electron sender/document identity and performs runtime
    validation, path resolution, canonicalization, and containment checks.
  - Completion resolve uses opaque Main-owned handles. Diagnostic `resultId`
    remains Main-only. Definition targets are limited to `file:` URIs inside the
    canonical active project root; metadata/BCL/generated and external targets
    are unsupported in V1.
  - Support `.sln` and `.slnx`. Reuse a saved valid selection; auto-select one
    candidate; request and remember a per-project selection for multiple
    candidates; use project mode when no solution and one or more `.csproj`
    files exist; fall back to syntax-only when neither exists. Never create a
    temporary solution. Main may use bounded discovery for project-mode
    preflight/UX, while current `csharp-ls` owns recursive project discovery and
    actual loading; Main does not claim the exact loaded project set.
  - Keep workspace readiness independent from dependency and service lifecycle.
    Workspace states are `READY`, `SELECTION_REQUIRED`, `NO_CSHARP_WORKSPACE`,
    and `PREFLIGHT_FAILED`. After selection, Main preflights the effective SDK
    with `dotnet --version`, parses a selected solution with `dotnet sln <path>
    list`, extracts listed `.csproj` path tokens without matching localized
    prose, bounded-discovers projects in project mode, runs evaluation-only MSBuild
    `-getProperty`/`-getItem` JSON for each project, and validates evaluated
    `ProjectReference` containment/existence. It requests no build, restore, or
    target and does not intentionally create or modify workspace files. `PREFLIGHT_FAILED`
    prevents provider startup; a pass becomes `READY`.
  - Authorized 5.5E trust clarification (2026-09-11): V1 C# workspace evaluation
    supports user-trusted projects only. MSBuild evaluation is not a sandbox;
    trusted project/import sources may execute evaluation-time logic. The IDE
    must not intentionally build, restore, invoke targets, create temporary
    solutions, or modify the workspace during preflight. There is no guarantee
    of side-effect-free evaluation for arbitrary untrusted projects. Keep the
    approved preflight sequence and bounded READY/RUNNING meanings. No sandbox
    architecture or trust UX is added in 5.5E; new trust UX needs a user decision.
  - Start lazily with one C# session for the active project. Initialize with LSP
    `initialize` then `initialized` and UTF-16. Treat Monaco dirty content as
    authoritative; send `didOpen`, ordered incremental `didChange`, `didSave`,
    and `didClose`, using Monaco model version as document version. Batching may
    preserve order but cannot drop changes; flush before semantic requests.
  - Reuse FileSystemService watcher events. Open/dirty document sync wins over
    disk watcher content. Reject stale project/session/document results. Use
    pull diagnostics for open documents; defer workspace diagnostics.
  - Shutdown in this order: invalidate/cancel, LSP `shutdown`, await response,
    send `exit`, then bounded child/descendant cleanup. Unexpected exit becomes
    `CRASHED`; V1 has no automatic restart loop or public start/stop/restart API.
  - Require .NET SDK 10 or newer to run current `csharp-ls`; use .NET 10 LTS as
    the V1 acceptance baseline. Main detection uses process PATH plus
    `dotnet --list-sdks`. Dependency state (`MISSING`,
    `INVALID_CONFIGURATION`) remains separate from service lifecycle (`STOPPED`,
    `STARTING`, `RUNNING`, `CRASHED`); `NOT_CONFIGURED` is reserved for future
    configured paths.
  - `RUNNING` means the owned process is alive and LSP initialization succeeded;
    it does not certify an equivalent Roslyn workspace. Empty completion, null
    hover, empty definition, and no diagnostics are never workspace-health
    signals. Provider log/progress text is diagnostic evidence only and never a
    correctness or readiness dependency.
  - After 5.5B passes, production uses an app-owned pinned `csharp-ls`.
    Development may use a project-private provider before PATH fallback.
- **Rationale:** This retains Monaco and the existing Problems/editor ownership,
  keeps protocol and process authority in Main, avoids a broad VS Code runtime
  surface, and gives each supported feature an auditable semantic contract.
- **Deferred:** References, rename, code actions/quick fix, refactoring,
  formatter, advanced semantic tokens, Razor, metadata/BCL/generated virtual
  documents, debugger, C# Run, loose `.cs` full intelligence, workspace
  diagnostics, configured provider paths, and public/manual restart UX.
- **Hard-gate evidence required:** Phase 5.5B must exercise real `csharp-ls` on
  Windows and verify dependency/version probing; stdio JSON-RPC/LSP lifecycle;
  advertised capabilities; dirty/incremental sync; UTF-16/Unicode; completion,
  resolve, and cancellation; hover/signature/definition; pull diagnostics;
  `.sln`, `.slnx`, and project mode; no-solution recursive discovery behavior
  and performance; paths containing spaces, `#`, and Unicode; dynamic watched-
  file registration; workspace-load failure detection without parsing human log
  strings; crash/shutdown and descendant cleanup; and electron-vite, typecheck,
  and build compatibility. Phase 5.5C–5.5H cannot begin unless this gate passes.
- **Consequences:** Phase 7 retains full packaged/installed provider and Windows
  installer acceptance. A failed 5.5B gate blocks production implementation and
  requires recorded reevaluation; it does not authorize silently changing the
  provider, transport, security boundary, or capability scope.
- **Phase 5.5B evidence (2026-09-10):** The Windows stack
  (`csharp-ls` 0.27.0, .NET SDK 10.0.401/runtime 10.0.12,
  `vscode-languageserver-protocol` 3.18.3, `vscode-jsonrpc` 9.0.2, Electron
  44.0.0, and electron-vite 5.0.0) passed capability, synchronization, Unicode,
  workspace-mode, lifecycle, cleanup, import, typecheck, and build probes. The
  original malformed-project probe proved that provider initialization and
  semantic emptiness cannot detect workspace health: the process stayed alive
  and only human text reported the load problem.
- **Corrective Phase 5.5B evidence (2026-09-10):** An isolated structured
  preflight produced deterministic exit/JSON/path-check outcomes for valid and
  broken `.sln`, `.slnx`, and `.csproj`; missing `ProjectReference`; unknown
  project SDK; unavailable `global.json` SDK; unavailable targeting framework;
  and multi-project project mode. It made no workspace changes and did not run
  the fixture's mutation target. An unavailable targeting pack still passed,
  proving the documented residual false-positive boundary. A valid workspace
  also legitimately returned empty completion, null hover, empty definition,
  and no diagnostics, while the broken workspace returned similarly empty/null
  semantic results and could still produce local diagnostics. Therefore semantic
  results and human logs remain excluded from readiness. The revised bounded
  readiness policy is sufficient for V1 without claiming perfect Roslyn health.
  Full evidence is in
  `spikes/csharp-lsp-compatibility/REPORT.md`.
- **Phase:** 5.5A design baseline; 5.5B hard gate; 5.5C–5.5H implementation and
  verification only after PASS.
- **Authorized 5.5D process decision (2026-09-10):** A dedicated Main-only native
  C# entry point supplies stdin/stdout/stderr pipes and atomic Windows Job
  ownership at creation. Retain ownership after root exit through terminate,
  confirmed empty, and release. Verify hard-killed root/surviving descendants.
  Terminal, Run, Git, public authority and bounded readiness remain unchanged.

## Dependency candidate register

Phase 5.5A installed no package. Phase 5.5B installed trial dependencies only in
the isolated compatibility spike. Authorized Phase 5.5C then added the exact
verified protocol and JSON-RPC versions as production runtime dependencies.

| Area | Candidate | Pros | Cons / maintenance risk | Native/Windows impact | Status |
|---|---|---|---|---|---|
| Editor | `monaco-editor` | Required editor engine, strong language primitives | Large bundle/worker configuration | No native ABI; worker packaging must be verified | SELECTED by requirement |
| React Monaco integration | `@monaco-editor/react` over local `monaco-editor` | Thin mount integration while the app retains model/view/disposal ownership | Requires explicit local loader and worker configuration | No native impact | SELECTED Phase 2C |
| Terminal UI | `@xterm/xterm` + fit/search addons as needed | Established terminal rendering | Version/addon compatibility | No native ABI | SELECTED |
| PTY | `node-pty` | Real PTY/ConPTY semantics | Native rebuild and release maintenance | High: Electron ABI and installer test | SELECTED with gate |
| Persistence | Small internal JSON adapter | Minimal dependency and explicit schema | Must correctly implement atomic/recovery behavior | Windows file locks/rename tests | SELECTED direction |
| Git | Direct CLI behind internal wrapper | Transparent, predictable, easy to diagnose | Must parse output and map failures | External Git detection required | SELECTED |
| JS/TS intelligence | Existing Monaco TypeScript worker with bounded project snapshot | Meets accepted capability scope without external process | Snapshot thresholds, exclusions, and project fidelity require verification | Browser-worker packaging only | SELECTED Phase 3A; no new dependency |
| HTML/CSS/JSON intelligence | Existing Monaco workers | Built for editor integration | Confirm HTML completion/hover, CSS/JSON diagnostics, and trusted/offline JSON schema behavior; HTML diagnostics are deferred | Browser-worker packaging only | SELECTED Phase 3A; no new dependency |
| C# intelligence | `csharp-ls` 0.27.0 + `vscode-languageserver-protocol` 3.18.3 + `vscode-jsonrpc/node` 9.0.2 | Roslyn-based external provider behind standard typed protocol libraries; verified structured preflight | Preflight is intentionally not proof of equivalent Roslyn workspace health; distribution remains a later gate | Windows process/lifecycle and Phase 7 packaging impact | SELECTED by Phase 5.5B; exact runtime libraries installed by Phase 5.5C |
| Python intelligence | Future provider decision; Pyright/basedpyright/python-lsp-server remain unselected candidates | Deferred evaluation can use future requirements and packaging evidence | Would add external-service distribution, IPC, lifecycle, and security cost | Future Windows/process gate required | DEFERRED; no current Phase 3 dependency |
| Java intelligence | Future provider decision | Preserves future extensibility | Would add provider/runtime/process complexity if an external server is selected | Future Windows/process gate required | DEFERRED; no current Phase 3 dependency |
| TypeScript Run | `tsx`, `ts-node`, `tsc` + Node, native Node TS | Future comparison only; no V1 selection | Semantics/version/config trade-offs | Must test Windows invocation/stop before future execution | DEFERRED; future ADR-014 gate |
| Automated tests | `vitest` | Reuses Vite/TypeScript transform; unit, service, and adapter integration support | Keep Electron E2E separate until required | No native ABI; CI Node 22 compatible | SELECTED Phase 2A |

## ADR-023 — Phase 6 Auto Save semantics

- **Status:** Accepted — explicitly approved by the user on 2026-09-13.
- **Context:** FR-012 and FR-036 require an Auto Save toggle but did not specify
  scheduling or failure behavior. Phase 6 stopped at this product decision gate.
- **Selected option:** Auto Save defaults to OFF. When ON, a dirty file is saved
  through the existing save flow after 1000 ms without a new edit. A new edit
  before the deadline resets the timer. Save failure or conflict preserves dirty
  state and reports the error; no force overwrite and no automatic retry loop.
- **Alternatives considered:** Save after an idle delay, or save on focus loss.
  The user selected the 1000 ms idle-delay behavior.
- **Consequences:** Preserve existing version-aware save, conflict protection and
  owning-domain boundaries. Run retains its existing Save-first policy; this
  decision does not authorize Run-triggered saving or stale-buffer execution.
- **Phase:** 6. Implemented and verified 2026-09-14; see Phase 6 completion evidence in IMPLEMENTATION-PLAN.md. The accepted decision is unchanged.

### Phase 6 UX clarification — Accepted (2026-09-13)

User-approved: fixed V1 shortcuts, no remapping; dialogs have priority; Terminal
retains its keys except terminal toggle; editor Ctrl+S/Ctrl+F do not steal input.
Recent Projects is unbounded MRU. Removal deletes history only. Missing paths
produce actionable errors and retain entries for explicit removal.
Defaults: Dark, font 13 px, tab size 2, Auto Save OFF. Font integers 8–40; tabs
2/4; theme Light/Dark/System. Dependencies are guidance only, with no custom
executable paths. Existing runtime/Git/C# authority remains unchanged.

## ADR-024 — C# Project Run and line-oriented Console input

- **Status:** Accepted design baseline, 2026-10-07; production `NOT_STARTED`.
  User explicitly authorized Console `.csproj` Run and Console.ReadLine design
  in two milestones. This ADR records that scope change, not implementation
  authorization or verified native compatibility.
- **Evidence:** RunService hardcodes JavaScriptRunStrategy, uses context-free
  resolveRuntime and derives identity from execution.args[0]. The Windows Run
  adapter accepts one argument and no stdin; the process wrapper does not forward
  stdin. Native C# language pipes demonstrate asynchronous writes, but their
  sessions/lifecycle cannot be used for Run. Output/EditorRunAction currently
  resolve a saved JS file and disable Stop while start IPC is pending.
- **Options:** A single dotnet run with implicit build/restore is simplest but
  supplies no reliable structured build-versus-runtime boundary; parsing localized
  logs is insufficient. SDK build then dotnet run --no-build/--no-restore supplies
  an explicit boundary and avoids duplicate build work, at the cost of two owned
  steps and cancellation between them. Terminal/PTY offers terminal interaction
  but is explicitly excluded. Standalone file-based apps are outside project scope.
- **Selected option:** Run-domain fixed CSharpRunStrategy plus independent target
  resolver/store; immutable canonical target identity separate from argv;
  strategy-aware runtime resolution; SDK build then dotnet run --project with
  fixed no-build/no-restore/no-launch-profile flags. SDK owns incremental output.
  Preserve JavaScript strategy and one-active-session-per-target policy.
- **Input:** Milestone 2 extends Run's pipes with typed session-owned line input,
  bounded asynchronous writes, sequence validation, backpressure and EOF. Run is
  still separate from interactive Terminal PTYs. ADR-008 ownership separation,
  ADR-020 retained Job ownership and ADR-021 fail-closed cleanup remain Accepted.
- **Scope clarification:** This supersedes general deferral of C# Project Run
  only for the extension in FR-023; Phase 4 and 5.5 historical acceptance and
  ADR-014 TypeScript deferral remain unchanged. It does not authorize Web projects,
  launch profiles, multi-target selection, loose .cs, debugger or Phase 9 work.
- **Policies:** SDK-style single-framework Console Exe only; candidate-cwd SDK
  selection by CLI/global.json; Run-specific stable SDK >=8 policy, Windows
  net8.0/net10.0 evidence required. Keep language SDK >=10 checks unchanged.
  Project-wide dirty/conflict Save-first guard; no Run auto-save. Separate versioned
  Run-target persistence. Initial discovery/input limits and exact semantic DTOs
  are recorded in Architecture Section 10 and Plan Section 13.7.
- **Consequences / gates:** Two steps require session-versus-step lifecycle and
  Stop during preparation/build. Shared compiler-server ownership, inherited stdin,
  blocked writes, Windows argument quoting and source-change races must pass the
  specified evidence gate before dependent production work. Build/restore failure
  is a combined category; execution failure includes host/launch/program failure
  unless structured evidence supports a finer cause. No new dependency selected.
- **Traceability:** FR-023 extension / FR-024 Output, Architecture Section 10,
  Implementation Plan Section 13.7 (M1 Core, M2 Input & Completion). Overall C#
  Run remains NOT_STARTED and cannot become COMPLETE after M1 alone.
- **Sources:** Microsoft [dotnet run](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-run)
  (implicit restore, multi-framework requirement, launch-profile suppression),
  [dotnet msbuild](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-msbuild)
  and [global.json](https://learn.microsoft.com/en-us/dotnet/core/tools/global-json).
  [evaluation-only JSON](https://learn.microsoft.com/en-us/visualstudio/msbuild/evaluate-items-and-properties)
  is supported by MSBuild 17.8+ (SDK 8 baseline). SDK inventory/evaluation is
  evidence, not proof of runtime readiness or sandboxing.

## ADR-025 — Phase 9 Learning and function-based exercises

- **Status:** Accepted design direction per explicit user scope revision,
  2026-10-16. Status reconciled 2026-10-19: 9A–9C COMPLETE under their recorded
  user acceptance. Final status reconciliation, 2026-10-23: **9D Common, 9D.1,
  9D.2 and overall 9D COMPLETE — PASS WITH LIMITATIONS** by explicit user final
  acceptance; A01/A02/A03 FIXED — PASS; 9E–9G NOT_STARTED. This updates tracking
  only, not any Accepted architecture/runtime/Policy B decision. Existing FAILs,
  missing reports and Windows/UNC/9G/9E/coverage/console/latency limits remain
  recorded in [accepted final review](PHASE-9D-FINAL-REVIEW.md); no unverified gate
  becomes PASS. The following earlier approval/step statuses are historical:
  production Common was approved 2026-10-20, beginning with shared contracts/
  validators/tests and documentation only.
  9D.1 is COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-21;
  see [final review](PHASE-9D1-FINAL-REVIEW.md). Ready for 9D.2, which remains
  IN_PROGRESS; Step 1 COMPLETE — PASS WITH LIMITATIONS by user acceptance
  2026-10-22; Step 2 COMPLETE — PASS WITH LIMITATIONS by user acceptance
  2026-10-22 for installed Windows 11 probe scope; Step 3 COMPLETE — PASS WITH
  LIMITATIONS by separate user acceptance 2026-10-22; Step 4 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23;
  Step 5 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23; Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE; 9E–9G remain NOT_STARTED. Step 1 contracts evidence/acceptance limitations are below.
  Windows 10/packaging remain unverified, production Accepted-record Restore
  awaits 9E, and C# Run ~7–8s optimization is after Phase 9. No accepted runtime
  policy or architecture decision changes with this status update.
  Unresolved details below are neither
  selected implementations nor passed gates.
- **Context/evidence:** Previous Phase 9 planning described future courses, four
  adapters, STDIN/STDOUT problems, partial scoring and function harnesses outside
  V1. The user's revised scope replaces those planned directions. No Phase 2–8,
  Phase 5.5 or C# Project Run decision/acceptance is reopened.
- **Selected scope:** One subject, Kỹ thuật lập trình, exactly the eight chapters
  in Requirement Section 21. No course selector/management or chapters 9/10;
  Chapter 1 needs no mandatory exercises/quizzes. Local-first theory/quizzes are
  selected and authored with source/license records; no automated scraping or
  bulk copyrighted copying. Apply rights checks to LeetCode-inspired problems.
- **Exercise choice:** Chapter-based Easy/Medium/Hard exercises, only C# and
  JavaScript. Per-language function signatures, parameters, return types, starter
  code and compatible tests; generated harnesses replace standalone STDIN/STDOUT
  problems. No student-written Main()/Console program. Separate exercise models
  reuse Monaco foundation; per-exercise/language Code Drafts auto-save.
- **Run/Submit (9E-0 approved clarification, 2026-10-23):** Phase 9E Run executes
  and compares public samples only, never grants completion; custom Run is deferred
  and requires separate authorization.
  Submit uses official public/hidden tests; only 100% pass is Accepted. Distinguish
  student verdicts from internal Judge errors. The later approved Submission
  History amendment below supersedes the original Accepted-only history restriction.
  Re-submission is allowed; later failure cannot revoke saved
  completion. Hidden offline tests are not absolutely secret.
- **Practice controls clarified by user, 2026-10-19:** only Run and Submit are
  student-facing; no Stop/Cancel button. Run executes sample tests and displays
  results; 9E Submit judges official tests and routes eligible graded records to
  persisted Submission History under the amendment below. Only committed Accepted
  creates completion. 9D stop/cancellation is
  internal only: timeout/resource limits, exercise/language switch, leaving
  Learning, IDE close and cleanup. An internal owner-validated stop() contract
  is allowed without corresponding UI. Exercise cancellation must not affect
  Project Mode or Terminal. Common limits were subsequently approved on
  2026-10-20 below; no Stop UI or Judge implementation is authorized.
- **Persistence:** Main-owned versioned JSON in a separate Learning directory
  under userData, safe writes/recovery, reuse PersistenceService where suitable.
  Accepted snapshots retain code-at-Submit, exercise/language/time/result/test-set
  metadata; multiple versions, no overwriting. Accepted completion authority remains
  separate from the new approved graded-failure history. Successful Accepted
  persistence is required before reporting newly
  completed progress; write failure remains visible separately from Judge Accepted.
- **Runtime revision approved by user, 2026-10-19:** 9D uses compatible installed
  .NET SDK and Node.js only, with no runtime download, installation or bundling.
  Learning owns resolver/harness/execution sessions and may share existing
  executable files. Missing/incompatible runtime is an explicit dependency error;
  no automatic installation or switch to an unapproved version. The 2026-10-20
  approval selects stable .NET SDK 10.x and Node.js 24.x without patch locking.
  Observed patch versions remain evidence, not the supported-version policy.
  Project Mode must not change: preserve runtime selection, PATH/global.json,
  RunService, ProcessManager, Terminal, Editor, Explorer and existing native adapters.
  Reuse internal APIs unchanged; prefer a Learning-only adapter for missing
  argv/Job/quota capabilities. Present shared initialization/integration changes
  and new technical decisions to the user before implementing them.
- **Common production approval, 2026-10-20:** shutdown/cleanup 30/30 and resource
  validation 16/16 latest per-variant PASS support Policy B. Historical failed
  runs remain evidence; see [spike report](../spikes/exercise-shutdown-9d-common/REPORT.md).
  VERIFIED requires empty current Job membership/ActiveProcesses, all retained
  identity handles signaled, settled observers/I/O and no unresolved errors or
  historical coverage gap. TotalProcesses mismatch alone means historical
  uncertainty, not a live process: classify HISTORY_UNVERIFIED only after current
  termination conditions pass. Release/finalize with acknowledged quarantine;
  processClean=false and cleanupComplete=false, workspace retained. Live/pending
  handles or observer/ownership/query/native errors remain PROCESS_UNRESOLVED,
  with ownership retained. Watchdog containment is never successful proof.
  Stages: OWNED → acknowledged RELEASE_READY → Job release → retained handles
  closed → acknowledged FINALIZED → safe workspace deletion → acknowledged
  CLEANUP_COMPLETE (last two only for VERIFIED). Persist by write/sync/replace/
  read-back; retry resumes the retained stage, never respawns or operates on
  released native state. Recovery takes an exclusive lease and rereads scoped,
  validated checkpoints, never kills historical PIDs. OWNED/RELEASE_READY and
  historical gaps quarantine; only VERIFIED/FINALIZED permits deletion recovery.
  No automatic quarantine deletion is approved.
- **Approved initial Common bounds:** prepare/probe 10 s total; compile 30 s and
  2 GiB aggregate Job commit; execute 2 s/case including runtime startup and
  512 MiB aggregate Job commit; operation 60 s from admission on one monotonic
  clock across all phases/cases, excluding cleanup. Phase due = min(operation
  due, phase start + phase budget). Cleanup wait 12 s per caller attempt includes
  I/O: timeout reports failure, retains ownership and the original pending task;
  retry joins it until settled. No overlapping destructive cleanup or false
  finalization. A settled failed task may retry from its retained stage.
  One Learning operation globally, cases sequential, no queue; pending cleanup
  blocks replacement admission. Output is 1 MiB combined stdout/stderr UTF-8 per
  operation; overflow cancels and cleans safely. Quota setup/read-back precedes
  launch and covers descendants. Runtime OOM alone is not Job-limit proof.
  Shutdown seals admission/invalidates generation synchronously; unresolved
  cleanup rejects shutdown and preserves retry. Acknowledged HISTORY_UNVERIFIED
  can finish service shutdown with quarantine and false clean flags.
  Reduced spike quotas/deadlines are experimental. Full production integration,
  deadline coverage, output/concurrency bounds and Windows acceptance remain due.
  Additive Learning integration points from final review are approved in principle;
  the first implementation step does not wire Main/IPC/native/UI. Project Mode,
  Terminal, DesktopApplication, ProcessManager, RunService and Project native
  adapter implementation/behavior remain unchanged.
- **C# execution decisions approved by user, 2026-10-20:** use installed stable
  SDK 10.x Roslyn csc.dll directly, with Learning-only filesystem discovery,
  no product patch pin/download/install/major fallback or Project resolver.
  Learning-only extensions for runtime/native stdin/process results/DTO/error
  mapping are approved in principle, with implementation staged separately.
  Run executes Main catalogue samples and returns actual values only; no custom
  cases, comparison, Submit or results persistence in 9D.1. Comparison/Submit/
  persistence remain 9E; custom-case support needs separate scope approval.
  Step 1 authorizes declarations, protocol/validators/tests and documentation
  only. It does not authorize implementing resolver/compiler/adapter/native stdin,
  composition, IPC wiring or UI. Protocol v1 and minimal failure/diagnostic ports:
  [C# contracts](PHASE-9D1-CSHARP-CONTRACTS.md). Actual native/adapter/offline and
  supported-Windows acceptance remains due; Common policy is unchanged.
- **JavaScript architecture approved by user, 2026-10-22 (design only):** select
  survey option B: new Node process/Learning Windows Job per catalogue sample,
  fixed harness plus `node:vm` for context separation, explicitly not a security
  sandbox against malicious code. Direct Node execution exposes unnecessary host
  APIs; stronger OS isolation would require separately authorized research. Jobs
  do not restrict filesystem/network/account rights or guarantee child-result
  authenticity. No new OS sandbox or Permission Model is selected.
  Learning-only PATH-first verified stable Node 24.x; no patch lock, shell/CWD,
  Project resolver, fallback major or auto-download. Allow junction/nvm only with
  safely verified canonical target/executable identity and launch revalidation.
  Fixed version/capability probes belong to Learning Jobs in Prepare, 512 MiB
  aggregate Job commit, within the original Prepare 10 s/operation 60 s due.
  Approve the narrow Main-only Learning Prepare probe/context quota extension
  in principle; current adapter rejects Prepare process launches. No Policy B,
  C# preparation behavior or native/Project redesign is approved.
  Parse-only syntax checking uses compile phase; synchronous functions and six
  existing types only, no imports/npm/async. Strict bounded JSON stdin/stdout must
  separate syntax/runtime/protocol failures. Add JavaScript-specific result DTOs
  and observation over existing channels/Result Panel without changing C#
  contracts, authority or quotas. No Judge/comparison/Submit/Accepted/Wrong Answer.
  Preserve deadlines, barriers, cancellation, ownership, cleanup/recovery and
  isolation. Node bundling remains 9G; 9D.2 uses installed runtime only.
  [Six-step plan](PHASE-9D2-JAVASCRIPT-PLAN.md) defines scope, acceptance, targeted
  tests and Windows 10/11 evidence. Step 1 was separately authorized 2026-10-22:
  standalone DTOs/strict protocol validators/mappings and Main-only ports
  implemented, 308 targeted JS/Common/C# tests PASS; C# contracts unchanged.
  [Contract evidence](PHASE-9D2-JAVASCRIPT-CONTRACTS.md) records full-repo lint
  limitation accepted by the user on 2026-10-22: Step 1 COMPLETE — PASS WITH
  LIMITATIONS. 9D.2/Common IN_PROGRESS; Step 2 separately authorized and implemented,
  with 169 targeted tests PASS including 10 real Windows 11 Prepare Jobs and
  one real C# Sum regression. [Step 2 evidence](PHASE-9D2-NODE-RESOLVER-PROBE.md).
  Step 2 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22;
  Step 3 separately authorized/implemented 2026-10-22: fixed child/vm harness,
  exclusive workspace, parse-only syntax and internal single catalogue sample
  path verified. 259 targeted tests PASS, including 60 real native operations /
  172 Jobs; [Step 3 evidence](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md).
  Step 3 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22.
  Step 4 separately authorized/implemented 2026-10-22: Main-internal adapter and
  sequential samples, fresh Jobs/VERIFIED barriers, fail-fast and retained cleanup;
  160 targeted tests PASS, 57 real JavaScript Jobs VERIFIED/closed and selected
  real C# multi-case PASS. [Step 4 evidence](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md).
  Step 4 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 5 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE; Step 5 separately authorized 2026-10-23; Step 6 was separately authorized 2026-10-23; stop for its user acceptance.
  No new architecture decision, shared-contract or Policy B changes;
  production factory/IPC/UI execution and Windows 10/packaging remain due.
- **Distribution deferred to packaging:** Keep the requirement for offline use
  without student runtime setup; discuss and decide installer integration separately.
  No bundled delivery implementation or exact delivery form is selected for 9D.
  C# requires SDK/equivalent compilation tooling, not .NET Runtime alone. Candidates
  include bundling SDK/Node, an additional runtime pack or detected installed runtime
  with clear guidance if
  size/technical evidence requires it. Bundling supports offline, setup-free use
  but adds package size/maintenance; fallback reduces base size but adds setup.
  Exact versions, size and fallback trigger are not decided here.
- **Boundaries:** Main coordinates controlled child processes; never execute
  student code in Main/Renderer. Exercise Runtime has its own lifecycle, separate
  from Project Run/Terminal/language services; reuse narrow internal helpers only.
  ADR-002/003/008/010 and existing owned Windows cleanup remain constraints.
- **Traceability:** Requirement Section 21; Architecture Section 6; Codebase Map
  planned Learning modules; Language Support planned Exercise scope; Plan 13.6.

### Phase 9E-0 — Approved Judge and Submit decisions (2026-10-23)

**Status: APPROVED design; 9E-0 COMPLETE (documentation/design only).** The user
approved all six architecture decisions and all ten decisions 9E0-A1–9E0-C3.
At this historical9E-0 approval, Phase9E implementation/9E-1 were `NOT_STARTED`;
design acceptance did not authorize coding. Current9E-1 closure is recorded in
9E1-AC1 below. This subsection supersedes earlier open wording for these
specific 9E decisions. Historical 9D evidence/status notes above remain historical.

Approved architecture:

1. Independent Exercise Packages, stable IDs and a data-driven Main registry;
   adding a compatible exercise does not change Generic Judge Engine. Correct
   ProductExceptSelf samples to its existing constraints during authorized migration.
2. Main allowlisted `exact-typed@1` for all six types; private C# Submit protocol
   evidence extension with existing Run compatibility. No arbitrary package checker code.
3. Sample-only Run with comparison; official public-then-hidden Submit, 100% PASS
   for Accepted; custom Run deferred. Reuse ExerciseService/Runtime lifecycle,
   not a second Judge admission/process ownership system.
4. Deterministic development-time generators, references, independent verification
   and coverage analysis; compact frozen official sets, no fixed case count and
   no generator/reference execution at Submit. Public samples appear exactly once
   in the official public prefix.
5. Main-owned hidden data; Submit exposes only aggregate counts, coarse stages
   and safe verdict/status. No hidden inputs/expected/actual/console/diagnostics
   or case-level metadata through any IPC/event/poll/error projection.
6. Learning-only versioned snapshot `userData/learning/accepted.json`; immutable
   multi-version Accepted records, transactions, idempotency and crash recovery;
   the baseline excluded failed records from Accepted Storage. The amendment below
   adds graded-failure history separately, leaving that store contract unchanged.
   Only all-pass plus VERIFIED complete cleanup enables Accepted commit;
   completion derives from verified committed records, not an IPC acknowledgement.

| Decision ID | Approved policy |
|---|---|
| 9E0-A1 | Snapshot ≤64 MiB encoded; record ≤2 MiB; metadata ≤16 KiB/record. No fixed versions-per-exercise cap beyond byte capacity; never delete/truncate/overwrite prior Accepted versions automatically. |
| 9E0-A2 | Warn at48 MiB/high56 MiB; free space ≥2×candidate bytes+16 MiB before commit. Preserve legacy over-capacity read-only/recovery; no automatic capacity increase/pruning. Logical cap differs from backup/staging physical footprint. |
| 9E0-A3 | Summary pagination default32/max100; encoded response ≤256 KiB, summary row ≤1 KiB; cursor ≤512 bytes; source chunks ≤32 KiB raw UTF-8 with safe boundaries and encoded response check. No full history/source snapshot IPC. |
| 9E0-A4 | Storage release targets: normal commit p95≤5s, observed max≤10s; Main event-loop stall p95≤50ms/max≤100ms. Monitor snapshots >16 MiB; review RSS delta>256 MiB. Targets APPROVED, NOT MEASURED. |
| 9E0-B1 | Final owner/generation/validity/expiry guard and same-turn primary replacement dispatch define commit admission. Pre-admission cancellation prevents replacement; after admission settle/reconcile, no rollback promise. |
| 9E0-B2 | Caller and storage shutdown wait15s/attempt; slow notice after5s; retained transaction/I/O/lease. Safe transient retries max3 attempts total, backoffs250ms/1000ms; no blind retry on ambiguous outcome. |
| 9E0-B3 | Serialized writer, store-wide OS lease using existing Learning native primitive; staging, sync/read-back, verified backup, atomic replacement and commit identity/lineage verification. submissionId idempotency; pending/saved/failed/unknown distinct; managed shutdown retains unresolved I/O/lease. |
| 9E0-C1 | 100% declared semantic obligations have official witnesses;100% curated critical mutants detected; broader applicable non-equivalent mutation score target≥90%, every survivor analyzed. Reference plus independent verification; no fixed official count. |
| 9E0-C2 | Initial release targets: warm Core operation p95≤45s, observed warm/fresh-app max≤50s; case p95≤1.2s/max≤1.5s; Prepare≤8s; compile/syntax≤24s; raw aggregate output and retained envelope each≤768 KiB; execute peak≤384 MiB/compile≤1.5 GiB with trusted measurement; normal VERIFIED cleanup≤10s. All APPROVED targets, NOT MEASURED. |
| 9E0-C3 | Windows10 x64/2 physical cores/8 GiB/SSD and Windows11 x64/≥4 physical cores/16 GiB/SSD. Per exercise×language×machine×representative valid implementation:20warm+5 first-operation-after-app-restart; borderline50warm+10fresh-app. Missing machine/evidence=UNVERIFIED, not PASS. |

All runtime quotas, Core/native/Policy B remain unchanged: operation60s,
execute2s/case, Prepare10s, compile30s, cleanup caller wait12s, compile2 GiB,
execute512 MiB, raw output1 MiB, one operation/no queue. Storage caller wait15s
is separate post-runtime work, not a Core deadline change. Existing process
containment is not a malicious-code OS sandbox or absolute offline test secrecy.

Implementation modules/schemas remain **PROPOSED implementation**, not actual
services. Performance targets are **NOT MEASURED**, acceptance remains
**UNVERIFIED** until execution evidence exists. If any benchmark/gate fails,
report evidence and proposed remedies, then obtain approval; do not silently
change capacity, architecture, coverage, isolation or quotas. Package asset/parser
ceilings were subsequently approved as L1–L12 below. Historical known-bad-test-set
completion handling remains a separate unresolved policy if needed.

Details and acceptance dependencies:
[Judge/Submit design](PHASE-9E-JUDGE-SUBMIT-DESIGN.md),
[approved A/B/C specification](PHASE-9E0-REMAINING-DECISIONS.md), and
[Plan 9E](IMPLEMENTATION-PLAN.md#9e--local-judge--submit).

### Phase 9E amendment — Submission History (Accepted + graded failures)

Historical approval sequence: product scope approved first; then all H1–H5 details
approved in the next subsection. Its later approval supersedes pending wording
in this historical entry; it does not imply implementation acceptance.

**APPROVED requirement amendment, 2026-10-23.** This changes the earlier product
restriction against persisting failed graded submissions; it does not rewrite
the approved9E-0 Accepted contract or mark Failed Storage design as approved.
9E-0 remains COMPLETE for the accepted baseline; Phase9E implementation and9E-1
remain NOT_STARTED. No code authorization is granted.

Approved: persist immutable captured source/revision and trustworthy final verdict
for Accepted, WA, Compilation/Syntax Error, Runtime Error, TLE, MLE, OLE. Deliberate
Submit always creates a new version even for identical source; same-submissionId
internal retries are idempotent. No automatic version deletion/overwrite. Run
creates no history. Infrastructure/Protocol Failure, Cancelled/Invalidated or
untrusted/incomplete verdict is not automatically a failed graded record.

Only verified committed Accepted creates completion. Failed history never does;
later failure cannot revoke prior completion. Judge verdict, storage outcome and
completion remain separate. Submission History lists persisted records with
All/Accepted/Failed, verdict/language/submitted time, source viewing and confirmed
Restore; Renderer transient state is not history authority. Hidden payloads,
console/stack/diagnostics and private Judge evidence do not enter history records.

Accepted `accepted.json`, capacity64MiB/record2MiB/metadata16KiB, A/B/C policies and
15s retained caller wait remain unchanged. `failed-submissions.json` is a preferred
candidate, not an approved contract. Failed capacity/record/read bounds, wait/
shutdown/lease/recovery, unified ordering and cleanup eligibility, plus final UI
label/component migration remain **PROPOSED** in
[subsequently approved H1–H5](PHASE-9E-JUDGE-SUBMIT-DESIGN.md#16-approved-h1h5--submission-history).
Do not inherit64MiB/15s automatically or create a second Judge lifecycle. New
gates must be approved before dependent contracts/persistence/UI implementation.

### Phase 9E amendment — H1–H5 approved (2026-10-23)

**APPROVED:** all five Submission History decisions H1–H5, including the previously
recommended contract. This closes P9-HISTORY policy gates; implementation remains
PROPOSED/NOT_STARTED and measurements NOT MEASURED/acceptance UNVERIFIED.
The earlier amendment's pending wording is historical and superseded by this entry.

| Decision | Approved contract |
|---|---|
| H1 | `userData/learning/failed-submissions.json`, encoded snapshot32MiB/record2MiB/metadata16KiB, warnings24/28MiB; no version-count cap beyond byte capacity, automatic prune/truncate/overwrite or Accepted-capacity borrowing. Safe full/legacy/recovery policy; disk reserve≥2×candidate+16MiB. Accepted64MiB/2MiB/16KiB/15s unchanged. |
| H2 | Failed caller/shutdown wait10s/attempt, slow notice3s, retained task/I/O/lease; max3 safe transient attempts total,250ms/1000ms backoff within original precommit window; ambiguous outcome reconciles, never blindly retried. Caller timeout alone is not commit-failure proof. Proposed Failed performance targets from H2 are now approved release targets p95≤3s/max≤7s, NOT MEASURED. |
| H3 | Main-trusted final WA/Compilation-Syntax/Runtime/TLE/MLE/OLE, immutable source, VERIFIED complete cleanup/current owner at commit admission. Trusted compile/syntax errors may have zero cases. Infrastructure/protocol/cancelled/untrusted outcomes excluded; unsafe cleanup defers/omits graded record without weakening Policy B. |
| H4 | Shared Learning-store OS lease via existing primitive, same ExerciseService operation, one authoritative target per submission, immutable routing/IDs and idempotency. Main bounded merge with generation-vector cursor and explicit partial availability; Accepted completion independent of Failed errors. Default32/max100 summaries,response256KiB,row1KiB,cursor512bytes,source32KiB UTF-8 chunks with response bounds. No two-store transaction/second lifecycle. |
| H5 | Generalize My Solutions to Submission History, All/Accepted/Failed, verdict/language/submitted time/version info, immutable source view and confirmed Restore. Main committed records only; no hidden evidence or renderer-simulated save/completion. |

Full Failed storage does not itself disable Run/Submit. After known refusal and
settled I/O/ownership, release operation normally and allow subsequent operations
under existing guards; keep grade and storage failure distinct. Pending retained
I/O/lease or unresolved runtime ownership still blocks replacement admission.
Do not delete history to free capacity or call a save error Infrastructure verdict.

Only pre-admission cancellation can promise no replacement. After admission settle/
reconcile and suppress stale ACK, not rollback. Completion still requires verified
committed Accepted. Windows/durability/performance evidence is still unverified.
H1–H5 did not approve package asset/parser limits; subsequent L1–L12 approval below
now resolves that gate. Full numeric policy and semantics:
[9E-1 limits review](PHASE-9E1-PACKAGE-ASSET-PARSER-LIMITS-REVIEW.md).
9E-0 remains COMPLETE baseline;9E implementation/9E-1 NOT_STARTED, no coding permission.

### Phase 9E-1 — Package limits approved (2026-10-23)

**APPROVED:** the user accepted all twelve RECOMMENDED options 9E1-L1–L12,
including all detailed bounds, counting conventions and failure semantics in the
[approved specification](PHASE-9E1-PACKAGE-ASSET-PARSER-LIMITS-REVIEW.md).
This amendment supersedes earlier pending package-limit wording; it does not
change six architecture decisions, A1–C3, H1–H5 or Runtime/Core/Policy B.

| Decision | APPROVED design policy |
|---|---|
| 9E1-L1 | Manifest≤4MiB;≤4,096 active unique packages; stable exercise/case IDs≤64 ASCII characters, not paths; explicit exercise chapters2–8 within the existing eight-chapter course. |
| 9E1-L2 | Raw metadata≤256KiB, samples≤512KiB, Judge set≤4MiB, C#/JavaScript starter≤64KiB each; package≤6MiB and exactly five referenced assets. Whitespace counts; independent maxima need not fit jointly. |
| 9E1-L3 | Registry≤256MiB logical referenced raw assets including manifest; both count and byte caps apply. Not eager heap or compressed footprint; no truncation/subset admission. |
| 9E1-L4 | Bounded actual reads before allocation/parse; strict UTF-8/no BOM, pre-scan decoded duplicate keys/structure before JSON.parse, exact schema and bounded traversal. Raw JSON≤4MiB subject to smaller asset caps; depth12/root0;32 properties/object;100,000 properties/asset;200,000 nodes/asset; key64 UTF-16 units; general string262,144 units; array65,536; numeric token64 ASCII chars. No hooks/eval/prototype keys/coercion; finite and schema-specific numeric validation. |
| 9E1-L5 | Title256, statement131,072, constraints≤32×2,048, URL2,048, source-use8,192 UTF-16 units; existing URL policy retained. Signature≤16 ordered unique parameters with≤64 ASCII-character safe identifiers/reserved-name checks; metadata byte cap still wins. |
| 9E1-L6 | Six existing types only. Exact int32/boolean; valid Unicode string≤32,768 UTF-16 units; int32[]≤65,536; string[]≤1,024 with per-string32,768 and total65,536 units; rectangular dense matrix≤1,024 rows/columns and65,536 cells; each serialized typed value≤256KiB. No normalization/coercion; generic well-shaped empty values remain valid subject to authoring constraints. |
| 9E1-L7 | Public samples1–16; official cases1–128 with public prefix and hidden coverage; unique IDs, stable ordering, exact-once sample linkage, signature/type/arity/hash/version and exact-typed@1 allowlist validation. Schema/package/test-set versions positive safe integers≤int32max. Technical128 is not a default count or runtime feasibility claim. |
| 9E1-L8 | Canonical per-case request and synthetic valid RETURNED expected response with empty console≤512KiB each; no execution of synthetic response. Summary32 default/100 max; page≤256KiB; final encoded public detail≤1MiB, including escaping. Preserve current63 compatibility and bounded draft access. |
| 9E1-L9 | Manifest pins exact raw byte lengths and SHA-256 hashes; trusted application root digest/version; exact supported schemas, fail closed. No absolute local secrecy/anti-tamper guarantee. |
| 9E1-L10 | Main-owned fixed external five-file assets, generic emitted manifest/build copy, bounded safe contained resource resolver; no per-ID imports, arbitrary code/archive/download. Reject path traversal/Windows ambiguity/reparse escape; installed packaging must be verified separately. |
| 9E1-L11 | Lazy manifest/summary plus one active package; resident canonical parsed-data logical budget16MiB,1,000,000 nodes, raw buffers8MiB. Count retained/cloned/pinned plans; evict only unpinned data. Cache misses belong to owned Prepare10s/operation60s; no pre-admission deadline evasion. Startup is tracked Main readiness, not an unbounded Project startup block. Review incremental RSS>128MiB; loader stall targets p95≤50ms/max≤100ms are approved but NOT MEASURED. Logical budgets are not heap guarantees. |
| 9E1-L12 | Global manifest/registry faults make registry unavailable; local child faults isolate the package with truthful availability. Safe diagnostics, no official→sample fallback for Accepted, preserve drafts/history/completion. Reviewed versioned policy upgrades; parity/security/memory/Windows packaging release gates. |

Full field tables, byte definitions and path/read semantics in the linked
specification are normative design detail for these decisions. Adding64/65 is
package data plus regenerated manifest, without Generic Judge exercise-ID branches.
Coverage remains first:100% declared obligations/critical mutants, independent
expected verification and approved both-language performance gates. If coverage
needs more than128 cases, report evidence for approval; never drop critical cases
or split Submit to evade60s. Existing Runtime2s/case/60s and quotas are unchanged.

**Status at design approval:** 9E-0 COMPLETE baseline;9E-1 and Phase9E implementation NOT_STARTED.
Steps1/2 accepted COMPLETE — PASS WITH LIMITATIONS; S2-R1–R4 remain APPROVED.
Step3 was initially blocked on precise registry contracts, not new ceilings:
[pending gate report](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md).
Its S3-D1–D4 recommended contracts are now APPROVED in the amendment below.
Phase9E/9E-1 IN_PROGRESS; Steps4–5 NOT_STARTED.
Modules/schema/API implementation forms remain PROPOSED; explicit start approval
is still required for subsequent steps. Performance/RSS/GC/startup/stall NOT MEASURED; loader/offline
packaging/runtime acceptance UNVERIFIED. Gate failures require evidence and user
approval of changes, not automatic ceiling increases or reduced coverage.

### Phase9E-1 Step2 — S2-R1–R4 APPROVED (2026-10-23)

The user approved all four recommended contracts in the
[Step2 specification](PHASE-9E1-STEP2-RESOURCE-INTEGRITY-ASSETS.md#2-approved-contract-selections).
R1: config-relative source `resources/learning/exercises`, Main output/dev
`out/main/resources/learning/exercises`, packaged external
`process.resourcesPath/learning/exercises`; select one trusted mode, no fallback.
R2: canonical deployment base, reject linked asset roots/children and multi-link
files; stable handle/path/parent identity checks before/after bounded reads.
Node observations do not guarantee atomic namespace resolution against malicious
swap-and-restore or all opaque Windows reparse tags. Fail closed when required
conditions cannot be verified; stronger native containment needs separate scope.
R3: build-established compiled Main manifest anchor (version/rawBytes/SHA-256),
exact raw-byte asset hashing and deterministic signature encoding v1 as specified;
never bootstrap runtime trust from a mutable adjacent manifest/hash. SHA-256 is
not a digital signature or absolute anti-tamper mechanism.
R4: explicit tracked empty bootstrap manifest; missing/corrupt declared assets
fail build. Synthetic complete packages remain fixture-only, never production
Official Tests or a runtime fallback. No changes to L1–L12 or Runtime9D.
Step2 accepted COMPLETE — PASS WITH LIMITATIONS with its original evidence and
named limitations intact. Step3 resumed under the approved precise contracts
below; Steps4–5 remain NOT_STARTED. No S2 decision reopened.

### Phase9E-1 Step3 — S3-D1–D4 APPROVED (2026-10-23)

The user approved all recommended detailed contracts in the
[Step3 specification](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md#2-approved-precise-contracts).
D1: exact canonical tree/copy bytes/nodes and raw-buffer ownership ledger,
reservation before allocation/parse, aliases not duplicate trees, retained
raw+parsed overlap, settlement before releasing failed/cancelled reservations.
D2: one slot/flight; same admitted owner/generation/key joins one acquisition and
lease; other owners or different keys BUSY while loading/pinned; evict only
unpinned, immutable reuse, explicit verified retry, no queue/LRU/hot reload.
D3: STARTING/AVAILABLE/UNAVAILABLE/STOPPING/STOPPED; package DECLARED/LOADING/
VERIFIED_RESIDENT/UNAVAILABLE; resource evidence distinct from Public Run, Judge,
Submit and release capability. Bootstrap and fixtures provide no Judge readiness.
D4: one Main instance, tracked manifest-only startup without blocking Project;
private owned Prepare context for cache misses, no new timers/budgets; shutdown
seals admissions and retains tasks/leases/reservations until settlement/cleanup.
Full detailed semantics in the linked report apply, not only this summary.
No L1–L12, S2-R1–R4, Runtime/Core/Policy B/quota change. Step3 resumes; Steps4/5
NOT_STARTED. Performance NOT MEASURED, inherited platform limitations UNVERIFIED.

### Phase9E-1 Step4 — S4-D1/D2 APPROVED (2026-10-23)

The user APPROVED both recommended detailed contracts in the
[Step4 report](PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md#4-approved-step4-staging-decisions).
S4-D1: explicit version2 public-only4-asset profile with official:null, alongside
unchanged version1 full5-asset fail-closed admission. No fake official data or
downgrade; numeric ceilings unchanged. S4-D2: capability-specific public ownership
in the same Registry/reader/ledger; official acquisition only in owned Prepare.
All detailed recommended semantics apply. Step4 is now COMPLETE — PASS WITH
LIMITATIONS by formal user acceptance; Steps1–4 are accepted COMPLETE — PASS WITH
LIMITATIONS.9E-1 remains IN_PROGRESS; Step5 remains NOT_STARTED. Closure changes
documentation only, preserving703 PASS/1 SKIP and all prior evidence/limitations.
The following gate evidence is historical and superseded by approval and closure.

Step4 is authorized; read-only inspection found an unresolved staging contract:
L2/L10 and actual full-profile validation require5 real assets including official
public+hidden cases, while Step4 excludes9E-2 production Official Test authoring.
The approved sequencing anticipates public staging without defining its admission
profile. Current Registry acquisition also requires Runtime Prepare, not public
browsing ownership. No accepted contract is silently changed.

[Step4 evidence and alternatives](PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md)
proposes S4-D1 (explicit versioned4-public-asset staging profile alongside unchanged
full5-asset semantics) and S4-D2 (capability-specific public acquisition within the
same Registry/reader/ledger/lifecycle, official access only in owned Prepare).
Both were proposed at inspection and are now **APPROVED** above; no numeric ceiling or Runtime change.
The earlier block is resolved; Steps1–3 remain accepted COMPLETE — PASS WITH
LIMITATIONS;9E-0 COMPLETE. Step5 and9E-2 onward NOT_STARTED. Resume affected
implementation only after user approval; no dummy Judge assets or implicit fallback.

### Phase 9 Open Decisions / Pending Verification

Resolve and record these in authorized work before dependent implementation.
Common approval above resolves its policy gates, not adapter/packaging acceptance.
9E-0 approval resolves the listed Judge/comparison/storage design policies, not
their implementation, benchmark or acceptance evidence. Historical9D descriptions
in P9-HARNESS/P9-EXECUTION below do not reopen approved9E-0 policies: comparison
`exact-typed@1`, private C# Submit protocol evidence and Run compatibility are
APPROVED; executable contracts and runtime acceptance are still dependent work.

| Gate | Open detail / required evidence | Before dependent work |
|---|---|---|
| P9-STATE | Resolved for 9A by explicit user instruction: React state in App.tsx for workspaceMode, selectedChapterId and Learning sidebar collapse; retain Project UI mounted and hidden/inert. No new store or dependency. ADR-011 remains open for broader shared-state expansion. | Recorded before 9A implementation, 2026-10-17 |
| P9-CONTENT | Resolved for 9B, 2026-10-17: supplied manifest schemaVersion 1 and eight authored Vietnamese Markdown files in docs/learning; one continuous page per chapter. Main bundles fixed inputs as raw strings at build time, validates and exposes read-only semantic course/material DTOs. Preserve sourceUsePolicy and per-reference review flags, which grant no third-party copying rights. User approved react-markdown + remark-gfm; reuse Monaco tokenization without models/execution for C# display. HTML/remote media disabled; reference URLs displayed as external source text, no renderer navigation authority. | 9B only; later exercise/quiz schemas remain open |
| P9-HARNESS | C# protocol unchanged. Steps 1–3 COMPLETE — PASS WITH LIMITATIONS. Step 3 fixed vm harness/syntax accepted; Step 4 Main-internal multi-case adapter/driver reuses it with fresh Jobs, VERIFIED barriers and exact fail-fast suffix. 160 targeted tests PASS / 57 real JavaScript Jobs VERIFIED. No new contracts, factory/IPC/UI or Judge/comparison | PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md; Step 4 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 5 COMPLETE — PASS WITH LIMITATIONS (accepted 2026-10-23); Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE; comparison 9E |
| P9-RUNTIME | Learning PATH-first stable Node24 resolver, safe junction/file identity validation and owned Prepare 512 MiB/10 s mapping implemented; no patch lock/download/install/major fallback or Project resolver. Windows 11 Node v24.16.0 observed in 10 real Jobs with VERIFIED cleanup; 169 tests PASS including one real C# Sum regression. Windows 10/actual UNC/packaging/concurrent Project-PTY smoke remain unverified. Sample execution was unverified at Step 2 closure; subsequent Step 3 evidence is recorded in P9-HARNESS | PHASE-9D2-NODE-RESOLVER-PROBE.md; Step 2 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22; Step 6/9G evidence still due |
| P9-EXECUTION | Policy B/Common limits unchanged. Step 6 VERIFIED barriers retain Jobs/handles/checkpoints and pending work until final cleanup. Step 7 verifies C# production UI execution, resource failures, lifecycle/stale rejection and cleanup retry alongside real Project Run/PTY. Output envelope validation does not increase the raw quota. JavaScript/Judge/comparison remain later packages | PHASE-9D1-FINAL-REVIEW.md; Common IN_PROGRESS; C# 9D.1 COMPLETE — PASS WITH LIMITATIONS; Windows 10/packaging and remaining 9D.2/9E gates due |
| P9-STORAGE | 9E Accepted snapshot/commit/capacity/read/lease/recovery policies APPROVED by 9E-0, decisions9E0-A1–A4/B1–B3 above; implementation schemas/modules still proposed, performance NOT MEASURED and acceptance UNVERIFIED. 9F extended progress/quiz remains separate. | 9E-0 COMPLETE design only;9E-5/9E-7 must implement/verify before storage acceptance |
| P9-PROGRESS | Draft auto-save scheduling/failure/conflict handling, Chưa làm → Đang làm trigger, chapter aggregation, quiz scoring and last-position schema | 9F; preserve 9C drafts and 9E completion invariant |
| P9-PACKAGE | Installer/portable delivery form, optional runtime-pack setup, supported Windows 10/11 clean-machine offline evidence without developer tools | 9G; does not replace Phase 7 acceptance |
| P9-HISTORY | H1–H5 APPROVED in amendment above; Failed32MiB/10s, trusted VERIFIED eligibility, shared lease/one-target merge and Submission History UI. Implementation/schema forms remain PROPOSED, performance NOT MEASURED/acceptance UNVERIFIED. | Policy resolved; package/parser L1–L12 also approved; implement/verify only after explicit authorization |

Failed gates do not authorize silent fallback, weaker completion rules, extra
languages or Project Mode changes. Stop affected work and seek a decision if
evidence requires changing accepted scope/architecture.

### Phase9E-1 S5-P2 — A/B2/C APPROVED (2026-10-24)

Người dùng nghiệm thu [S5-P2 design](PHASE-9E1-S5-P2-COOPERATIVE-DESIGN.md)
và APPROVE A, B2, C; cho phép triển khai và kiểm chứng correction S5-F1.
A: một resumable validation kernel, soft5ms, caps8,192 chars/512 nodes/2,048
steps/32 manifest entries, checkpoint256 chars/64 steps, hash64KiB,
`setImmediate` và cross-stage work budget. B2: additive private cooperative
copy/representation/packet, retained pending work và owner pin/reservations,
one derived job/owner, overlap BUSY; public IPC không đổi. C: native atomics
giữ nguyên, đo riêng và dừng nếu vẫn fail acceptance; không tự thêm Worker.
L1–L12/S2/S3/S4, Runtime9D/Core/native, Policy B/deadlines giữ nguyên.
Approval không là performance PASS và không đóng Step5/9E-1 hoặc mở9E-2.
Correction evidence phải giữ historical FAIL và phân biệt unverified hosts.

### Phase9E-1 S5-O1 — Bounded Batching APPROVED (2026-10-24)

Người dùng APPROVE S5-O1 theo
[Step5 performance diagnostics](PHASE-9E1-STEP5-PERFORMANCE-DIAGNOSTICS.md):
bounded batching trong shared scanner/generator kernel, freeze traversal nếu cần,
giảm handoffs/checkpoint overhead với nguyên validation/error/statistics semantics.
Toàn bộ S5-P2 A/B2/C,5ms/caps/cadence/mandatory barriers, ownership/reservations/
leases/single-flight/cancellation/shutdown/deadlines giữ nguyên. Không O2/O3,
S5-R1/S5-A1, Worker hoặc Runtime9D/SDK/Core/native/IPC contract changes.
Cho phép implementation, targeted verification/build và đúng bốn unchanged
Step5 workloads. Approval không là acceptance evidence hoặc Step5/9E-1 closure.

### Phase9E-1 Step5 — Current-host acceptance scope amendment APPROVED (2026-10-24)

**S5-AC1 — APPROVED by explicit user decision:**
**Step 5: COMPLETE — PASS WITH LIMITATIONS (Current Host Only).**
This adjusts the acceptance scope; it is not full PASS against the original
target-machine matrix and changes no loader/Runtime/security policy.

Reason: the user accepts current-host S5-F1/O1 evidence and the foundation gates
that passed there, with the limitations retained. The two missing loader target
measurements B1a/B1b in the final review are transferred to **mandatory9E-7/release
certification gates**, not deleted, satisfied or replaced by this host:

| Gate | Required target | Status | Must be completed before |
|---|---|---|---|
| B1a | Windows10 x64,2 physical cores,8GiB RAM,SSD | UNVERIFIED | Acceptance of9E-7 /release certification |
| B1b | Windows11 x64,≥4 physical cores,16GiB RAM,SSD | UNVERIFIED | Acceptance of9E-7 /release certification |

Use the existing4 loader scenarios with unchanged fixtures/workload/registered
clone, stall p95≤50ms/max≤100ms and unchanged ceilings; record latency,RSS/GC,
resident budgets and cleanup on each target. Current-host PASS is not either
reference-host PASS. Missing/failing target evidence blocks9E-7/release approval.

Accepted evidence remains244 PASS/1 package file-symlink SKIP, separate444
regression PASS, scoped typecheck/targeted lint/build and named production smokes,
plus the recorded S5-F1/O1 measurements. No tests/build/profiling rerun for closure.
Historical FAILs are preserved. C# PREPARE_TIMEOUT cause/reliability remains
UNVERIFIED; full-app stall/RSS attribution remains incomplete. Actual file-symlink,
UNC, opaque reparse and installed/offline limitations and their release gates
remain unchanged; installed/9G obligations are not discharged by this decision.
S5-R1 remains COMPLETE — DIAGNOSTICS ONLY; its concurrency prototype remains
NOT PASS and **must not enter production**. L1–L12, security checks, Runtime9D,
Policy B/deadlines/quotas and S5-P2 A/B2/C are unchanged.

[Acceptance report Section15](PHASE-9E1-STEP5-FOUNDATION-ACCEPTANCE.md#15-approved-step5-closure--current-host-only)
records scope/evidence/conditions. At S5-AC1 approval, Phase9E-1 was retained
IN_PROGRESS pending separate confirmation; subsequent9E1-AC1 below formally
closes it. **9E-2 remains NOT_STARTED and requires separate authorization.**
No automatic phase closure,
production optimization, tests/build/profiling or Git publishing is authorized.

### Phase9E-1 — Official acceptance COMPLETE (2026-10-24)

**9E1-AC1 — User-approved acceptance record:**
**Phase 9E-1: COMPLETE — PASS WITH LIMITATIONS.** The user formally accepts
[final acceptance report](PHASE-9E1-FINAL-ACCEPTANCE.md#9-official-phase9e-1-closure)
and S5-AC1. Steps1–4 remain COMPLETE — PASS WITH LIMITATIONS; Step5 remains
COMPLETE — PASS WITH LIMITATIONS (Current Host Only). This closes the foundation,
not the whole Phase9E, reference-host matrix, Official Tests or release.

Reason/evidence: the reviewed approved contracts and accepted Steps1–5 have no
remaining in-scope foundation blocker after S5-AC1. Existing counts, build/smoke
and S5-F1/O1 measurements are accepted as recorded, without rerun or rewriting
historical failures. Earlier NOT_STARTED/IN_PROGRESS/pending text in dated
records is historical, not the current9E-1 status.

**Mandatory deferred release conditions are unchanged:** B1a Windows10 x64/
2 physical cores/8GiB/SSD and B1b Windows11 x64/≥4 physical cores/16GiB/SSD remain
**UNVERIFIED**, must pass existing4 loader scenarios/workload/registered clone,
p95≤50ms/max≤100ms and budget/cleanup observations **before9E-7 acceptance/release
certification**. Current-host PASS is not either reference-host PASS.
Historical PREPARE_TIMEOUT cause/reliability, full-app stall/RSS attribution,
file-symlink/UNC/opaque reparse and installed/offline limitations remain with
their recorded Runtime/platform/9E-7/9G gates. No UNVERIFIED becomes PASS.
SDK concurrency prototype: **NOT PASS — excluded from production**, absolutely
no promotion. S5-P2 A/B2/C, L1–L12/S2/S3/S4, security, Runtime9D/Core/native,
Policy B/deadlines/ceilings/quotas and ownership/lifecycle are unchanged.

The technical foundation and phase-acceptance prerequisites for9E-2 are now
satisfied. **9E-2 remains NOT_STARTED; explicit user approval to start it is still
required.** No Official Test authoring, Judge/Submit, optimization or other phase
is authorized. Documentation/consistency/diff only; no tests/build/profiling,
production changes or commit/push/merge. STOP for9E-2 authorization.

### Phase 9E-2 — Design approved; E2-S1 authorized (2026-10-24)

The user formally APPROVED [Official Test Sets design](PHASE-9E2-OFFICIAL-TEST-SETS-DESIGN.md),
[seven-step plan](PHASE-9E2-IMPLEMENTATION-PLAN.md) and **E2-D1–D5**. This supersedes
the previous current-status statement that 9E-2 awaited start authorization,
without rewriting the dated 9E-1 closure or its evidence. **Phase 9E-2 IN_PROGRESS;
only E2-S1 authorized. E2-S2–S7 remain NOT_STARTED.**

| ID / status | Accepted decision | Execution boundary |
|---|---|---|
| E2-D1 — APPROVED | Hybrid curated witnesses, deterministic exploration, independent oracle and compact frozen selection; pilot exactly ch2-04, ch3-04, ch4-09, ch5-03, ch5-07, ch7-01, ch7-05, ch8-01, ch8-08 | No fixed/default Official Case count; coverage-first evidence; user pilot acceptance before expansion |
| E2-D2 — APPROVED | Developer authoring/evidence outside released resources; planned narrow dev-server private deny/bundle-exclusion checks | No new public IPC; no tools/reference/guard code in S1; implement only in separately authorized S2 scope |
| E2-D3 — APPROVED | Separate candidate correctness, engineering feasibility screen and actual private Runtime/release certification | No 60s/deadline/coverage waiver; actual official operation evidence belongs to 9E-3/7; pending critical performance obligations remain explicit |
| E2-D4 — APPROVED | Staged pilot, user acceptance, separately authorized mixed-profile pilot promotion, then bounded remaining waves | No bulk generation/promotion or expansion under S1 authorization |
| E2-D5 — APPROVED, PROCESS ONLY | Per-exercise semantics review; stop affected work on ambiguity/conflict and request user decision | **No ambiguous interpretation approved by this row**; no silent content/sample/contract change |

E2-S1 produced [semantic specification and baseline](PHASE-9E2-S1-SEMANTIC-PILOT-SPECIFICATION.md):
63/126 public inventory, 252 asset hash/length checks, 63 signature bindings,
126 typed sample checks and 74 fixed predicate/classification assertions. These
are narrowly scoped specification evidence, not an Official Set or Runtime PASS.

**Historical M1 review — initially OPEN / NOT APPROVED:** MinWindow wording can mean a unique returned string
or a unique minimum interval. Example `s="aa",t="a"` distinguishes domains;
the returned text is unambiguous but there are two minimum positions. Recommendation
is unique returned text; alternate unique-interval reading is presented without
changing the statement. At that initial review neither reading had been approved. Current two samples
fit both. Affected family/full-domain predicate acceptance is stopped; no new
tie-breaker, implicit restriction, sample edit or coverage waiver.

Status transition: E2-S1 NOT_STARTED -> IN_PROGRESS under user authorization ->
**BLOCKED on M1** after delivering specification. At that initial delivery, eight unaffected worksheets were
ready for review; full S1 exit gate was NOT PASS pending semantic decision and user
acceptance. E2-S2 remains NOT_STARTED; no partial start without authorization.

9E1-AC1/S5-AC1, L1–L12/S2/S3/S4/S5-P2 A/B2/C, Runtime 9D, Policy B, deadlines,
identity/security/ownership and quotas are unchanged. Reference hosts B1a/B1b
remain UNVERIFIED, mandatory before 9E-7/release certification. PREPARE_TIMEOUT,
full-app stall/RSS attribution, filesystem/installed/offline gates remain with
their recorded owners. SDK concurrency prototype **NOT PASS — excluded from
production**. No Judge/Submit/Comparator/Accepted Storage or further phase starts.

### Phase 9E-2 — M1=A approved; E2-S1 accepted COMPLETE — PASS (2026-10-24)

**M1 — APPROVED: A, Unique Returned String.** The user explicitly resolves
MinWindow uniqueness by the content of the returned string, not interval position.
After the existing base domain checks, let U contain distinct texts of all minimum
covering intervals. No covering interval is valid with Expected `""`; otherwise
the input is valid exactly when |U|=1, Expected that sole text. Multiple minimum
positions with identical text are permitted. No leftmost tie-breaker is added.

Approved anchors: `("aa","a")` valid, Expected `"a"`;
`("aba","ab")` invalid due to distinct shortest texts; no-solution inputs remain
valid with Expected `""`. Existing public samples/constraints are unchanged.
This is an explicit semantic decision following E2-D5's process, not an implicit
interpretation approved by E2-D5 itself.

Closure verification: 16 fixed in-memory MinWindow domain assertions PASS and
approved text/no-answer anchors PASS; baseline 63 packages/126 samples, manifest
and 252 raw asset hashes/lengths unchanged. Historical 74 assertions, prior
BLOCKED/NOT PASS and all earlier evidence remain recorded, not rewritten as PASS.
The [S1 worksheet](PHASE-9E2-S1-SEMANTIC-PILOT-SPECIFICATION.md) now specifies all
nine pilot domains with no remaining semantic blocker.

**E2-S1: COMPLETE — PASS**, under the user's conditional acceptance and successful
verification. Transition BLOCKED -> IN_PROGRESS on M1 approval -> COMPLETE after
closure checks. Phase 9E-2 remains IN_PROGRESS; E2-S2–S7 NOT_STARTED. No production,
sample/constraint, schema/Runtime/security changes, generators/references or
Official assets. All inherited limitations/9E1-AC1 remain; no Runtime performance
or reference correctness certification is inferred. Stop for E2-S2 authorization.

### Phase 9E-2 — E2-S2 implementation authorization/evidence (2026-10-24)

The user explicitly authorizes E2-S2 after accepted E2-S1/M1=A. No new architecture
or semantic decision is introduced: E2-D1–D5 and all inherited contracts remain.
Actual developer-only tooling, nine C#/JS references, independent checkers and
the narrow approved build-private-boundary enforcement are documented in
[S2 report](PHASE-9E2-S2-TOOLING-REFERENCES.md). No frozen Official Set, production
package, Runtime/Judge/Submit change or remaining54-exercise work is authorized.

Scoped implementation disposition **PASS WITH LIMITATIONS**:116 PASS/1 SKIP,
typecheck/targeted lint/build PASS, actual CLI9-ID replay,378 output files audited
without authoring leakage; baseline63/126/252 unchanged.43 prepared models yield
41 correctness/domain kills and2 PENDING_RUNTIME, not a performance waiver.
Developer heap/I/O/scratch guards are not new Runtime quotas or OS RSS certification.
E2-S2 IN_PROGRESS pending user acceptance; E2-S3–S7 NOT_STARTED. Do not infer
official/runtime/release readiness or start S3 without explicit authorization.

### Phase 9E-2 — S2 accepted / S3 staging authorized and delivered (2026-10-24)

User formally accepts **E2-S2 COMPLETE — PASS WITH LIMITATIONS**:116 PASS/1 SKIP,
nine C#/JS pairs, independent oracles/private-boundary evidence retained. Two
performance models remain PENDING_RUNTIME, not converted to PASS. User explicitly
authorizes **E2-S3 staging only**, not S4 execution or promotion.

[S3 report](PHASE-9E2-S3-PILOT-CANDIDATE-EVIDENCE.md):9 frozen candidates/73 cases,
49 groups/90 facets,44 critical correctness kills plus18 broader kills, two
critical performance items pending under unchanged E2-D3. Two clean roots,
274 deterministic files byte-identical;109 targeted PASS, typecheck/lint PASS.
Shared reader/Registry budget, registered clone/representation/shutdown and
public/production parity verified; actual Runtime60s remains UNVERIFIED for all.
Private developer csproj explicitly allowlists driver+nine sources after observed
default-glob Debug attribute collision; algorithms, SDK Resolver/Runtime, quotas
and policies unchanged. This is an implementation correction, no new ADR/waiver.

S3 disposition PASS WITH LIMITATIONS, implementation/evidence delivered pending
user acceptance at S4; S4–S7 NOT_STARTED. No production assets/manifest/compiled
anchor change, no Judge/Submit or remaining54 authoring. 9E1-AC1/S5-AC1, M1=A and
all inherited release/host/security/reliability gates remain unchanged. Stop.


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


## Official Phase9E-2 closure /9E-3 planning authorization — 2026-10-25

The user formally accepts **Phase9E-2 COMPLETE — PASS WITH LIMITATIONS**, including E2-S7 final review/handoff. Accepted evidence is preserved:63 full-profile/0 public-only,504 cases (126 public/378 hidden),789/789 static obligations,206/206 critical correctness and126/126 broader models, manifest release7 SHA75ddbf0447e4708882c1e8e1f96e7cbebf97bf5aa170a14713e96755a9d3e081 and matching compiled anchor. All12 performance models remain PENDING_RUNTIME; Official60s/release certification UNVERIFIED. Historical FAILs/SKIP, source/line-ending limitations and9E1-AC1/S5-AC1 deferred platform/loader/reliability/installed gates remain unchanged. This closure uses accepted evidence; no tests/Runtime/build/profiling or resource regeneration/revalidation executed in this documentation task.

Only9E-3 source survey, design and implementation planning are now authorized. [Official Runtime design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md) and [implementation plan](PHASE-9E3-IMPLEMENTATION-PLAN.md) are **PROPOSED — NOT APPROVED**. **9E-3 NOT_STARTED — DESIGN PROPOSED**; E3-D1–D4 and every implementation step await user approval/explicit package authorization. No production code/resources, Judge/Submit/Comparator/Accepted Storage, deadlines/ceilings/ownership/security/Policy B or .gitattributes change, Git publication or automatic Step1 start. Later phase statuses unchanged. This dated record supersedes earlier pending9E-2 status statements; their evidence/history remains intact.

### Phase9E-3 proposed implementation selections — NOT APPROVED

| ID | Proposed selection / user decision required | Existing contracts retained |
|---|---|---|
| E3-D1 | Input-driven language adapters with Run wrappers; Main-only Official variant on the same ExerciseService | No public Official flag/IPC, second operation/service/Registry or lifecycle |
| E3-D2 | Aliased leased plan/current-input serialization, bounded retained prefix; synchronous post-VERIFIED CONTINUE/STOP hook | Same phase/operation deadlines/accounting/Policy B; no comparator, async hook lifecycle or streaming redesign |
| E3-D3 | Main-private protocol evidence and extraction/reuse of the existing bounded JSON kernel; preserve public C# mapping/v1 envelopes | No public private fields, new wire-version approval or guessed student blame |
| E3-D4 | Six independently gated packages, eight-ID both-language pilot before separately authorized63×2 bridge screen |12 pending models and9E-7 repeat/target certification remain distinct; no automatic step transition |

These are proposed implementation choices, not accepted ADR changes or implementation permission. Exact scope/stop gates are in the new design/plan; obtain user review before recording any approval.


## User approval / E3-S1 delivery — 2026-10-25

The user **APPROVES the Phase9E-3 design, six-step plan and E3-D1–D4**, and explicitly authorizes **E3-S1 only**. This dated record supersedes earlier proposal/authorization statements without deleting history. **Phase9E-2 COMPLETE — PASS WITH LIMITATIONS; Phase9E-3 IN_PROGRESS — E3-S1; E3-S2–S6 NOT_STARTED.** Architecture approval is not advance permission for later implementation.

| Decision | Approved selection | Scope restriction |
|---|---|---|
| E3-D1 — APPROVED | A: input-driven adapter reuse; future Main-only admission on the existing ExerciseService | Public Run unchanged; no S1 admission or Official execution wiring |
| E3-D2 — APPROVED | Leased plan and existing accounting; synchronous post-VERIFIED CONTINUE/STOP hook | S1 establishes contracts/controlled lifetime tests only; no production consumer hook |
| E3-D3 — APPROVED | Existing strict JSON kernel extraction; private C# evidence; public mapping and wire v1 unchanged | Native/private response mapping and execution await S2/S3 |
| E3-D4 — APPROVED | Six steps; eight-ID pilot in both languages, accepted before expansion to63 | Each later step needs its own authorization |

[S1 acceptance](PHASE-9E3-S1-PRIVATE-CONTRACTS-ACCEPTANCE.md): implementation delivered **PASS WITH LIMITATIONS — awaiting user acceptance**. Main-private leased identity/input contracts, pure signature/harness seams and existing strict JSON kernel extraction only. No adapter execution, service admission, Core/Registry/native lifecycle or public IPC/DTO change. Preserve all12 PENDING_RUNTIME models, Official60s UNVERIFIED, historical failures/SKIP and deferred9E1 gates. STOP before E3-S2; no commit/push/merge.
