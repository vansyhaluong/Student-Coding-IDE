# REQUIREMENT.md

## Practice Problem Description typography — authorized 2026-11-12

Only the exercise-description article follows the user's LeetCode-style typography
direction: installed Geist, title 21px/600, body 15px/400/1.7, section headings 16px/600,
inline monospace 13–14px, lightly separated monospace examples and 12–16px paragraph
spacing. Preserve all exercise data/text, existing sections, Vietnamese and Markdown
formatting with safe offline rendering. Use the current Learning palette in either
application theme; do not introduce a new global Learning theme or touch other
panels. Narrow/resized panels must retain complete content without page overflow;
long code/tables may scroll locally. No Monaco/Run/Judge/AI/dependency/release work.

## Learning Settings footer — authorized 2026-11-12

Remove the two decorative bottom-left Learning sidebar lines and replace them
with a Settings gear matching Project's existing entry. Keep it available in
expanded/collapsed Roadmap states. Open the same application Settings dialog and
preferences store; when invoked from Learning, dialog/form colors use Learning
tokens instead of the Project theme. Preserve Project appearance, preference
persistence, learning content/drafts and existing error/recovery messages.

## F6 — scoped learning-session AI consent, authorized 2026-11-12

For Hint/Analyze/Explain/Suggest Fix only (including F5 detection), supersede
per-request snapshot confirmation with Main-owned RAM-only consent for the current
learning session, exercise, language/origin and provider instance. Actual captured
source/selection/public Run evidence define the requested scope; a remembered
grant covers only equal/narrower scopes. Code edits within that scope retain it;
exercise/language/origin/provider/key changes and scope expansion ask again.
The first concise themed dialog names Gemini and sent data, defaults “Ghi nhớ
trong phiên học này” on, and puts technical information under “Chi tiết”. Unchecked
means this request only; Cancel never starts inference. Provide explicit revocation.
Leaving Learning, document/window retirement, provider rotation or bounded session
expiry retires grants; closing only the assistant panel does not end Learning.
Keep immutable per-operation capture, quota/timeout/cancel, F4/F5 edit authority
and Chat's independent per-turn consent. No SDK, live Gemini, full suite/system
smoke, new report file, release/installer or Git publication work is authorized.

## AI-SUGGEST-FIX-F5 — authorized 2026-11-11

User explicitly authorizes a separate whole-submission detection path behind
Suggest Fix when Monaco has no selection. Capture the current Practice source,
model/revision and trusted public problem/optional same-snapshot public Run;
use the existing per-request Gemini consent and lifecycle. Return bounded,
validated advisory issues; only snapshot-matching, exact-quote ranges may mark
Monaco under a separate owner. AI findings remain suspected, even when citing
Run evidence. Existing confirmed Run/compiler evidence remains labeled separately.
Main may resolve inaccurate AI offsets using a unique exact source quote, then
revalidate all UTF-16/CRLF boundaries. Missing or repeated quotes remain unlocated;
no fuzzy/nearest-line match or source normalization is permitted. This is the
2026-11-12 corrective localization amendment. User clarification on
2026-11-12 supersedes the bottom Error Details presentation: as soon as detection
completes, highlight affected code lines light red directly in Code Editor.
Remove the bottom details section and its click-to-open behavior. Existing Monaco
marker tooltips may show the explanation; issue-list navigation only reveals a
current valid range. Keep the editor layout height intact. No detection edits,
grant, Diff, Apply, automatic Run/Submit or new provider/agent. Clear on edit,
model/exercise/language/session change. Keep selection Suggest Fix parser/Diff/
Confirm/Undo and Hint Apply F4 unchanged. This explicitly supersedes the earlier
selection-required UI restriction only for this new advisory path.

## AG-02 — isolated fake-only prototype authorization, 2026-11-11

User authorizes isolated OpenCode2 Engine/client pinning, compatibility/lifecycle/
negative-security investigation, synthetic project broker and fake Gemini gateway.
Prototype dependencies are permitted only inside prototypes/ag02-opencode-v2;
production dependencies, UI, Local AI/Ollama, Learning and P2 release remain
unchanged. No real credentials/provider calls, real agent writes, installer,
publication or AG-03 work. An unmet isolation gate requires NO-GO/BLOCKED rather
than unrestricted Engine execution or a silent architecture switch. This is the
explicit prototype exception to AG-01's design-only restriction; no production
agent capability is authorized. See IMPLEMENTATION-PLAN AG-02 for executed versus
blocked evidence. Historical AG-01 authorization below remains design history.

## AG-01 — Project Coding Agent design authorization, 2026-11-11

The user explicitly authorizes survey/design of a Gemini + OpenCode replacement
for Project Workspace Local AI Chat. This is a design-only exception to FR-038's
local-only/fixed Ollama direction and the future-agent exclusion. Phase 8 remains
the implemented baseline; neither replacement nor a new dependency is approved
for production by AG-01. AG-02–AG-06 each require separate authorization.

Proposed behavior: explicit cloud opt-in and an eligible project-file disclosure
manifest; Main-owned project-scoped read/search and proposal-only edits; readonly
Diff and manual Confirm before any Monaco mutation, with Undo/Redo and stale/dirty
conflict rejection. No automatic disk writes or code execution. Deny secrets,
outside-project access, shell/terminal, arbitrary network, external tools/plugins,
subagents, worktrees and configuration supplied by the project. Keep Electron
isolation and typed capability IPC. No raw Engine API, paths or credentials in
Renderer. Reuse a stored Gemini credential only through an explicitly consented
Main capability, never an exported key. Agent sessions, policies, budgets and
proposals are separate from Learning Chat/Smart Hints/Hint Apply and Practice.

AG-01 may update existing requirements/architecture/decision/map/plan documents;
it does not authorize SDK installation, real Gemini calls, production edits,
full-suite tests, Git publication or release modification. Acceptance is a
reviewable design with evidence, open feasibility gates and AG-02–AG-06 scope,
not runtime/Windows/security certification. See the AG-01 sections in ARCHITECTURE,
DECISIONS and IMPLEMENTATION-PLAN. Historical exclusions below continue to apply
outside this explicit design scope.

## AI-HINT-APPLY-F4 — authorized 2026-11-11

Correct HAS_IMPLEMENTATION target resolution: parser-confirmed nested block gaps,
unambiguous adjacent statement replacement from a boundary caret, and unique
safe insertion without requiring highlighting. Explicit nonempty ranges remain
exact targets; token-interior/outside-entry/ambiguous/stale targets fail closed.
Automatic inference is restricted to assignment fragments whose identifiers are
already bound at exactly one physical empty block. No typecheck/semantic-correctness
claim. Syntax-uncertain Hint classification remains non-authoritative; no guessed
recovery or conversion to NO_IMPLEMENTATION. Full-function HAS rewrites, invalid
candidates and foreign-language responses are rejected. Keep signature/grammar/
SH-1, consent/Diff/Confirm/Undo, three manual preparations, owned grants and no
extra inference. Preserve P2 release artifacts. This supersedes only the earlier
F1/F2 immediate-entry-body and exact-caret-target restrictions for Hint Apply.

## Learning Assistant Practice-only entry — authorized 2026-11-08

Remove the Learning Assistant trigger and panel from course introduction and
Tài liệu/theory pages. Practice retains its existing assistant entry and behavior.
This supersedes the theory Chat entry in AI-C4-A/B only; backend Chat contexts,
consent, Smart Hints and Apply contracts remain unchanged.

## AI-C4-F3 controlled Hint preparation retry - 2026-11-08

Supersedes the F1/F2 failed-preparation lock only. Permit at most three explicit manual
preparation attempts per trusted Hint, retaining its original
source/model/revision/package/owner binding and TTL. Main permits another request only
after a definite pre-grant TARGET_INVALID or CANDIDATE_INVALID failure. Duplicate
attempt IDs are idempotent; altered, parallel, stale, expired, consumed, discarded,
unsupported or uncertain transport outcomes fail closed. One successful proposal closes
preparation permanently. No inference or quota reservation on retry. Expose a correlated
fixed-enum stage/reason and remaining attempts; Copy stays independent. Persist only the
latest source-free fixed-field Apply diagnostic. No grammar, SH-1, signature,
model/schema/timeout or transaction change.

## AI-C4-F2 Hint Apply UI / Diff — authorized 2026-11-08

Enable Apply beside the independent Copy icon in each current eligible Practice
Hint code block; preserve the top-left language and Thinking/Steps/Code-last.
Capture the live Monaco source/model/version/revision and exactly one selection
or caret, then request F1 preparation using the owned Hint reference, never the
card's code/candidate. Main ignores the proposed selection for NO_IMPLEMENTATION
and determines the template body itself. HAS_IMPLEMENTATION still requires the
parser-confirmed explicit target. An entire-source selection is only an untrusted
Hint target request, never canonical authority or permission for a whole-file edit.

Valid preparation opens the existing readonly Diff. Confirm must consume the
owned grant through a typed Main gate with a fresh package identity check before
arming one local transaction; immediately recheck live model/source/revision/TTL
and blocked state before the synchronous batch. Keep native Undo/Redo. Discard,
cancellation, source/context changes or late replies revoke local authority and
pending/prepared Main work. Duplicate clicks and confirmations cannot create
additional edits. Chat/history cannot create or resurrect authority.

Expose Preparing, Review, Applied, Failed/Stale and Discarded states. Copy remains
independent. Preserve F1 one preparation per Hint, including parsed failure: report
the lock and request a new Hint only by explicit student action. No automatic
retry/rebase/inference. A future separately approved adjustment could allow one
explicit target reselection only when Main proves no grant was issued; it is not
implemented in F2. No Hint schema/model/quota/timeout or Run/Judge/Submit changes.

## AI-C4-F1 trusted Hint Apply backend — authorized 2026-11-08

Supersedes only the earlier prohibition on adding a Hint target-resolution
backend. Hint wire schema/model, consent, inference quota and timeouts remain
unchanged; no extra Gemini call. F1 adds typed prepareHintApply with strict input
validation and a separate proposal response, not an EDIT_PROPOSAL Hint status.
Renderer sends an operation reference, current snapshot assertions and optional
selection; it cannot submit Hint text, replacement/candidate, grants or trusted
offsets. Main looks up its owned verified COMPLETE Hint, verifies source/model/
revision/TTL and recaptures package/signature/starter identity before and after
parsing. Retain only bounded private material for the current operation, and
revoke it with its source/document/session/provider lifecycle or original TTL.

NO_IMPLEMENTATION requires a physically present parseable template function:
extract a matching full-function/method body with the parser and replace only
the original body block, preserving the original header. Missing functions,
bare signatures, unsupported expression bodies and uncertain context fail closed.
HAS_IMPLEMENTATION requires explicit selection or a parser-confirmed immediate
entry-body statement insertion boundary. Only the required entry function is
eligible; offsets are untrusted requests until the parser establishes them.
Candidate must pass existing canonical SH-1 limits plus parser syntax/signature/
outside-target structural checks. Never widen Suggest Fix or replace a whole file.

Main mints one separate Hint-provenance proposal/grant per current Hint, with
the original result TTL. Exact duplicate preparation is idempotent; changed
requests cannot replace the preparation or mint another grant. A failed parsed
preparation stays failed for that Hint. Consume is Main-only and single-use in
F1; no Renderer consumption or editor mutation API is introduced. Hint cards,
Copy/Apply placement and disabled Apply UI stay unchanged pending F2 approval.

## Hint Code Block Copy / Apply — authorized 2026-11-08

Each Hint code block keeps its language at the top left and shows an icon-only
Copy and icon-plus-label Apply at the top right, using the existing beUI Button
and Chat theme tokens. Copy preserves the exact code with success/error feedback.
Thinking, Steps and Code retain their order; Code stays last. Chat blocks are
unchanged. This supersedes the earlier display-only presentation restriction,
but does not grant editor authority to a Hint response.

Apply requires a separately validated, trustworthy target binding: the exact
template function when unimplemented, or a focused insertion/replacement when
implementation exists. Never infer offsets from response text or use Hint output
as an Apply grant. Require validation, readonly Diff, explicit manual confirmation,
source/revision/model freshness checks and native Undo. The current Hint DTO has
no target binding or proposal grant, and its private progress classification
does not establish either. Therefore Apply is disabled for all current Hint code
blocks, with a visible accessible explanation and guidance to select code and use
Suggest Fix / Review Diff / Apply Fix. Unknown, stale or invalid code cannot
bypass existing guards. No new target-resolution backend is introduced here.

## Context-aware Unified Hint — authorized 2026-11-07

Keep one advisory Hint with thinking, steps and code last. Main derives
NO_IMPLEMENTATION / HAS_IMPLEMENTATION / UNCERTAIN from the trusted exercise
starter and captured source, never a Renderer progress claim. Empty scaffolding
requires a complete function preserving the required signature; existing logic
requires a focused next/corrected fragment preserving the student's approach.
Apparently complete code calls for edge checks or justified improvements, never
invented defects. Uncertain syntax/template/structure permits observed-code
guidance only, with no claim of completion. No editor mutation or Fix authority.
Existing consent, quota, timeout, one-inference and cancellation policies apply.

## AI-C4-E beUI Assistant presentation — authorized 2026-11-06

Renderer uses free/open-source beUI conversation and prompt primitives for the
Learning Assistant: compact header, reader-aware transcript, right-aligned user
bubbles, left-aligned AI responses, theme-aware composer with four Quick Actions
and explicit context chip/consent. Completed responses support safe Markdown and
offline C#/JavaScript code highlighting. Unified Hint keeps code last; proposal
cards expose Review Diff/Discard only through the existing current operation.
No streaming/tool/thinking simulation, backend, quota or ownership changes.

## AI-C4-D Unified Hint — authorized 2026-11-06

Supersedes the earlier three-level Hint progression requirement. One Hint action
returns one card: thinking, implementation steps, then practical language-bound
code last. All sections are required and nonempty. One explicit consent permits
at most one inference/reservation; no retries, unlock levels or editor authority.
Legacy request levels normalize to the single action; old incomplete response
shapes fail closed. New cards are display-only, not approved Gemini replay data.

## Learning Assistant docked layout — authorized 2026-11-06

The original AI icon opens the unified Practice assistant as the third body
column, after description and editor, with no overlay on the editor. Opening AI
collapses the expanded learning roadmap. Closing AI restores two body columns
and keeps the editor instance/Undo state and the collapsed sidebar.

## AI-C4-B Unified Learning Assistant — authorized 2026-11-06

Learning Assistant is the single Chat/Smart Hints surface. Practice exposes Hint,
Analyze, Explain and Suggest Fix near the composer, with ordered request cards
and the existing per-action consent. Theory Chat shows these actions unavailable
until an exercise context exists. Main-owned Chat history remains separate from
display-only action cards: Renderer cannot submit action outputs for replay or
derive editor authority from any timeline entry.

Within the same source/model context, Chat, cursor movement, unrelated actions
and operation-only Cancel must preserve completed Hint levels. Source/context
changes and panel closure retire owned work; stale proposals have no Apply
authority. Review Diff/manual Apply/Discard/native Undo use the existing pipeline.
Analyze borrows public Run evidence and never starts Run. Shared Main admission,
quota/model/timeout and SH-1/parser behavior remain unchanged. No streaming,
persistence, automatic retry or new Quick Action backend is authorized.

## AI-C4-A Learning Assistant Chat UI — authorized 2026-11-06

Learning and Practice expose an advisory Gemini Chat panel with a Main-owned,
RAM-only timeline. Each turn requires prepare, a review of the scope/attachment
manifest and explicit consent before start; question-only never attaches code.
Selection/source require a current Monaco capture and a code preview. Closing,
navigation and context replacement retire the session; source revisions invalidate
operations/replay and retain Main reference history. No editor mutation authority,
streaming, persistence or multiple conversations. Existing Smart Hints and its
four actions remain independent; action-to-timeline integration awaits C4-B.
This supersedes the earlier no-Chat-UI scope restriction for C4-A only.

## AI Learning Assistant backend IPC — authorized AI-C3-B2, 2026-11-06

Learning Chat is exposed through typed `studentIde.learning.chat` session,
context, prepare/start/status/cancel APIs, without a Chat Panel rollout. Main
owns document identity and validates catalogue contexts; Monaco snapshot data
is local input, not trusted identity or consent to provider upload. Existing
Smart Hints configuration/key, fixed transport and coordinator/daily ledger are
shared. Explicit start consent remains mandatory. Provider/configuration,
document, context and shutdown retirement purge the ephemeral session. Chat
cannot issue editor commands, proposals or grants. C4 UI and live acceptance
remain separately authorized work; no automatic inference is introduced.

## AI Learning Assistant Chat domain — authorized AI-C2-B, 2026-11-06

Learning Chat V1 adds a bounded, ephemeral Main-owned conversation domain alongside
existing Smart Hints and Local AI Chat. This authorization covers contracts,
session/history and explicit question-only/selection/source context preparation
only. No automatic source/Run/hidden-test/solution upload, unlocked-level bypass,
editor action authority, new quota/provider state, database, adapter or UI rollout.
Source revision changes retain reference messages but invalidate old replay and
operations; panel/context/document/provider/key retirement must purge the session.
Actual event/credential/transport integration and precise token counting require
the subsequent approved steps. Existing Run/Judge/Submit/Apply/Undo are unchanged.

## Selection Fix syntax errors — authorized 2026-11-06

Suggest Fix supports logic errors and safely isolated syntax errors in C#/JS
function bodies. Preflight uses parser recovery/diagnostics to prove the selected
target and intact required signature; errors outside selection or unprovable
headers/boundaries fail closed. Missing-semicolon diagnostics attached to a next
token must be attributed to the selected owning statement, never to that token
merely because it is selected. Postflight requires an error-free candidate in
supported grammar and preserved headers/outside-selection structure. No automatic
source repair, range adjustment or change to consent, SH-1, quota or manual Apply.

## SH4-D6-5 selection Fix integration — authorized/verified scoped, 2026-11-06

Suggest Fix uses one exact Monaco selection and the existing full-source consent,
Main validation, canonical output and manual Diff/Apply/Undo path. Before consent,
selection changes cancel only Fix and preserve Hint progression. At consent the
target freezes; source/revision/model/context changes still invalidate it. No
automatic retarget/retry/Apply/Run/Submit; a failed Fix requires a fresh capture.
Consent explicitly discloses full source and selection sent to Gemini. NO_FIX
shows advice without a proposal or Diff. Preview and Apply require exactly one
canonical edit matching the frozen range and old text.

This supersedes the D6-1…4 normal-app disabled hold: SELECTION_V1 is available only
after Main's local parser/runtime probes pass, separately per language. Missing,
unsupported or changed parser assets fail closed. Offline integrated Electron
evidence covers the current Windows x64 build; installer/ASAR/Windows 10 and live
quality remain unverified. No change to SH-1, parser policy, provider/model,
quotas/timeouts or the other Smart Hints actions. D6-6 is not authorized here.

## SH4-D6-3 Gemini selection wire — authorized 2026-11-05

Only Gemini SUGGEST_FIX now requests a strict replacement-only proposal or
NO_FIX, using the frozen selection and full source/public task as context.
Reject model-authored locations/old text/edits and extra fields without repair.
Preserve Hint/Analyze/Explain prompts/schema, consent for full source, model,
token/time/quota limits, canonical outputs and SH-1. Main still disables Fix;
private wire cannot reach IPC or Apply until separately authorized construction
and structural/signature validation in D6-4 and later integration gates pass.
No parser, inference/live acceptance or mode enablement in D6-3.

## SH4-D6-2 selection Fix contract migration — authorized 2026-11-05

SUGGEST_FIX now requires one exact Practice SmartSelection. Public binding keeps
range/fingerprint only; Main retains an immutable source/selection capture and
trusted package/signature identity. Hint/Analyze/Explain and canonical output,
SH-1, manual Diff/Apply/Undo, provider settings and quotas retain their contracts.
Capabilities require suggestFixMode and suggestFixLanguages. Fix stays DISABLED
until the complete selection pipeline is integrated; reject legacy kind-only
requests and mixed bundles without fallback. D6-2 prepares a private strict
replacement-only validator, without changing Gemini schema/prompt or constructing
edits. This supersedes earlier ordinary-app Fix availability during migration.
D6-3 and later packages require separate authorization; no live calls in D6-2.

## Ordinary Gemini Suggest Fix timeout — authorized 2026-11-03

Suggest Fix alone gets at most30 seconds in the normal development/packaged
composition. Hint/Analyze/Explain and Settings checks retain10 seconds. Main and
Gemini use one Main-owned deadline, including metadata/reservation/body/validation;
session TTL may shorten it. Preserve loading/Cancel, manual consent, all quotas,
strict schema/source guards and manual Diff/Apply. Log only safe action/state,
elapsed/duration, stage, request kind, numeric HTTP status and timeout owner in
Main. No retry/duplicate, real API, new launcher or unrelated feature change.

## Normal Smart Hints usage-limit correction — authorized 2026-11-03

Replace normal-app lifetime3 with a configurable local UTC-day reservation limit
(new default20, range1–300). Preserve all durable reservations/lifetime totals.
Legacy settings require explicit daily-limit confirmation, not a silent grant.
Display daily usage/remaining/reset and distinguish LOCAL_BUDGET_EXHAUSTED,
LOCAL_RATE_LIMIT, GEMINI_RATE_LIMIT and GEMINI_QUOTA_EXHAUSTED. Keep6/min,30/hour,
timeouts, cancellation, snapshot consent and manual edits. Status/readiness never
reserves inference. Model checks cannot prove generation quota or billing tier.
No provider quota reset, ledger deletion, automatic retry, billing action, real
Gemini call or new acceptance launcher is authorized for this correction.

## Smart Hints normal-application provisioning — authorized 2026-11-03

Current user authorization supersedes earlier acceptance-only/production-disabled
provisioning restrictions for the normal feature. Both ordinary development and
packaged Windows IDE support explicit Settings enablement (default off), fixed
Gemini gemini-3.1-flash-lite, secure Main-only credential configuration/storage,
status-only connection check and real Learning/Practice data after per-action
privacy consent. No approval ID, acceptance launcher or samples-only restriction
in the normal flow. Keep existing quotas, source/revision guards, cancellation,
manual Diff/Apply/Undo/Redo and no automatic Run/Submit. No developer key shipped.
Actual UI acceptance may use at most3 human-initiated inferences; fake tests are
regression evidence only. No automatic retry, billing enablement or free-cost claim.

## SH-4 development Live UI launcher authorized — 2026-11-03

Prepare a development-only Learning/Practice Gemini launcher with Main-only
credential access, explicit per-launch approval ID and separately approved
inference budget, model/project-tier preflight, sample-only input and per-action
consent. Normal development and packaged production stay DISABLED. Preserve
SH-1/2/3 contracts/guards; no auto AI/Apply/Run/Submit, retry or paid fallback.
Verify only offline using fake transport; STOP before real key/API/live budget use.

## SH-4 Gemini replacement authorized - 2026-11-02

User replaces OpenRouter with direct Google Gemini REST in Electron Main, fixed gemini-3.1-flash-lite and Main-only GEMINI_API_KEY. Preserve SH-1/2/3 business contracts, UI/actions, validation/source guards/manual Apply and Undo/Redo. Structured Outputs application/json with a provider-specific JSON Schema, plus full internal validation. Free Tier only: require per-attempt project Free Tier/no-billing attestation and authenticated model metadata before inference; metadata cannot attest billing tier. No billing enablement, retries, alternate models or paid fallback. This task is offline only; live requires separate approval. Preserve OpenRouter history; no Judge/Run/Submit/dependency/Monaco patch or Git publication.


## SH-4 timeout correction authorized ? 2026-11-02

Isolated development live-smoke execution may use at most 30 seconds. Preserve production 10s, all earlier evidence, strict schema/parser, single inference, no retry/paid fallback. This task authorizes offline verification only; no real API request or key access. STOP after offline.


## SH-4 runner attempt management authorized - 2026-11-02

The user authorizes offline-only runner correction for independent attempts:
explicit live attempt ID, immutable model/time/approval scope, separate reservation
and result, atomic no-clobber publication, concurrency/duplicate prevention and
UNKNOWN on uncertain delivery. Preserve all legacy evidence/markers. Existing
North profile, Main-only key, consent, zero-price/cap/source guards and production
DISABLED stay unchanged. No actual OpenRouter request in this task. Deliver one
manual PowerShell command bound to the already approved North first-live attempt;
creating a different ID is not an automatic grant for another inference.


## SH-4 diagnostics and optional North development profile ? 2026-11-02

Latest user authorization permits offline corrective diagnostics and preparation of
`cohere/north-mini-code:free` in the isolated development/manual runner only.
Default/production model and DISABLED gate remain unchanged. Fresh catalogue and
endpoint availability/$0/max_tokens verification must precede North use. Preserve
JSON-only prompt/strict validation/SH-3 guards, zero price ceilings and disabled
fallbacks. No real OpenRouter request or key access is authorized in this task;
STOP after offline verification and await separate live approval.


## SH-4 OpenRouter replacement authorized — 2026-11-02

Current user authorization replaces SH-4 NVIDIA NIM with OpenRouter Free only:
`openrouter/free`, fixed Chat Completions endpoint, Main environment key. Preserve
SH-1–3 consent, quotas, validation, source guards and native Diff/Apply/Undo/Redo.
No automatic action/retry/paid fallback. Production defaults DISABLED. Offline
tests/build and Electron/Monaco smoke are authorized; at most one synthetic live
request after key/free-route verification, then STOP for SH-4 user acceptance.
Missing key or unverifiable free routing stops live work. No D2/D3 scope change.

## SH-3 accepted / SH-4 authorized — 2026-10-29

The user accepts SH-0/1/2/3 COMPLETE — PASS WITH LIMITATIONS and authorizes SH-4:
Main-only NVIDIA NIM hosted DeepSeek for personal development/test/demo, using
NVIDIA_API_KEY without persistence or Renderer exposure. This replaces direct
DeepSeek provider selection for SH-4 only; accepted AI-D2/D3 remain unchanged.
Reuse snapshot consent, public-only capture, strict outputs, caps, cancellation
and guarded native Diff/Apply/Undo. No automatic actions/retry/paid fallback.
Production stays DISABLED. Offline integration/tests/build/Electron are authorized;
STOP before the first real API request for separate endpoint/model/budget approval.
No new dependency, Monaco patch change, Judge/Storage/Completion or Git mutation.

## SH-2 accepted / SH-3 authorized — 2026-10-29

Explicit user authorization accepts SH-0/SH-1/SH-2 COMPLETE — PASS WITH LIMITATIONS
and enables SH-3 only: read-only Monaco diff, explicitly confirmed validated
structured edits, exact source/context/model/revision/TTL guards, one native Undo
group per Apply and existing draft/autosave integration. Real Monaco standalone
verification and scoped Electron smoke are authorized. No auto Run/Submit, rewrite,
rebase, new dependencies, Judge/Storage/Completion/D2 contract changes or live keys.
Production stays DISABLED; SH-4 NOT_STARTED. STOP after SH-3 for user acceptance.

## SH-1 accepted / SH-2 authorized — 2026-10-28

SH-1 is COMPLETE — PASS WITH LIMITATIONS by explicit user acceptance;114 focused
PASS and known Main/typecheck/Monaco-import/Electron/live limits are retained.
SH-2 authorizes only Practice Smart Hints drawer, progressive hints, analysis,
Practice/Solution selection explanation, proposal/NO_FIX presentation, per-snapshot
consent and Renderer lifecycle wiring through unchanged SH-1 APIs. Production
remains unconfigured; no Diff/Apply/Undo, provider/key, Judge/History/D2 changes.
SH-3/SH-4 remain NOT_STARTED; no unrelated phase acceptance changes.

## SH-0 accepted / SH-1 authorized — 2026-10-28

SH-0 is COMPLETE — PASS WITH LIMITATIONS by explicit user acceptance. SH-1 alone
is authorized: independent Smart Hints contracts/service, public draft capture,
Main-private exact Public Run Receipt, per-snapshot consent, bounded fake-provider
operations and typed IPC/Preload. HINT/ANALYZE/EXPLAIN/SUGGEST_FIX support C#/JS,
empty/incomplete source and read-only Solution explanation. G1–G5 and G6 consent
structure are approved for this scope; live cost/key/model/provisioning remain SH-4.
No UI/Monaco Apply, live requests, Judge/Official/History/Completion/D2-contract
changes. Existing dirty work, acceptance and historical evidence are preserved.

## WA-B1 accepted / WA-B2 UI authorized — 2026-10-28

WA-B1 COMPLETE — PASS WITH LIMITATIONS, formally accepted.550 relevant PASS
including80 focused; scoped tsc/lint/diff PASS; native/Electron/build/performance/RAM
limitations retained. WA-B2 adds a dynamic Wrong Answer tab after Submissions for
the current qualified Submit only, without waiting for History commit. Public
values use B1 diagnostic; absent/unavailable detail uses truthful unclassified
fallback. Same-reference once-only auto-open, Attempt/context retirement, independent
storage status, committed-only three-column History and existing Run/Source/Restore/
Completion remain required. No AI/network, Main contract or hidden-policy changes.

## WA-B1 authorization — 2026-10-28

User-approved public-only exception to aggregate Submit status: final qualified
WrongAnswer may include Main-verified public-sample Input/Actual/Expected from the
same submission, or a fixed DETAIL_UNAVAILABLE fallback without case classification.
Diagnostic is ephemeral, bounded32 KiB within the existing256 KiB response, and
never stored in History/records/backup/checksum. Hidden Official values/IDs/indices/
visibility/logs and private Judge metadata remain forbidden. Grading, fail-fast,
Run, Storage/Restore/Completion remain unchanged. WA-B1 covers Main/shared/IPC/
Preload only; no UI/WA-B2, AI/network or unrelated phase work. See ADR-025 amendment.

## AI-D authorization — 2026-10-28

The user accepts **AI-D1 COMPLETE — PASS WITH LIMITATIONS** (65 targeted PASS,
0 FAIL; 42 fake requests in the final batch). Historical prototype evidence is
unchanged. Real DeepSeek, production Electron verification and key provisioning
remain UNVERIFIED.

The user explicitly authorizes **AI-D2 only**: advisory analysis of verified
committed Accepted/graded Failed source plus matching public statement through
dedicated typed Main/Preload/IPC. Payload contains only language, saved source,
public statement and packageVersion; no samples/Expected/Judge internals. Consent
is mandatory. Verification uses synthetic fixtures/fake providers exclusively;
production fails closed without separately approved provisioning. No editor/draft
capture, source/verdict/completion changes, tools/agents, UI (AI-D3) or live API
(AI-D4). This narrow online advisory use is an explicit addition to the previous
Local AI scope; it does not authorize any excluded agent capability. E7 and all
unrelated historical acceptance remain unchanged.

## 1. Tổng quan dự án

### 1.1. Tên dự án

**Student Coding IDE**
Tên tạm thời, có thể đổi sau.

### 1.2. Nền tảng phát triển và repository

Student Coding IDE là một desktop IDE được xây dựng độc lập từ đầu trong
repository riêng. Project không phải là fork trực tiếp của Orca, không clone
source Orca vào source tree để chỉnh sửa và không kế thừa Git history của Orca.

#### 1.2.1. Student Coding IDE repository

* Student Coding IDE repository: <https://github.com/vansyhaluong/Student-Coing-IDE>
* Repository model: Independent implementation.

Repository này là source repository chính thức của Student Coding IDE. Không gọi
repository này là Orca fork trong documentation hoặc Git workflow của project.

#### 1.2.2. Orca Reference Repository

* Reference repository: <https://github.com/stablyai/orca>
* Reference branch: `main`
* Reference Commit: `4bb337741c335cfcc428d3b4271023566e2dadb8`
* Reference license: MIT License.

Reference Commit phải được lưu trong `docs/REFERENCE-BASELINE.md` để quá trình
nghiên cứu có thể tái lập khi Orca tiếp tục thay đổi.

Orca chỉ được sử dụng như một **Reference Implementation** để nghiên cứu:

* Kiến trúc Electron desktop IDE và application lifecycle.
* Main process, preload, renderer và IPC.
* Monaco Editor integration.
* File system handling.
* Integrated terminal và process execution.
* Git integration.
* Workspace/project management.
* Settings và local persistence.
* UI/UX patterns.

Mô hình phát triển chính thức:

```text
Orca
  ↓
Reference / Architecture Study
  ↓
Design Decisions
  ↓
Student Coding IDE
  ↓
Independent Implementation
```

Việc tham khảo Orca không đồng nghĩa với sao chép nguyên module, nhập source tree
Orca hoặc sửa Orca thành Student Coding IDE.

### 1.3. Technology Stack

Stack đã được xác lập qua Phase 0 và các ADR được chấp nhận trong Phase 1:

| Thành phần | Công nghệ / định hướng |
| --- | --- |
| Desktop shell | Electron |
| Renderer UI | React + TypeScript |
| Build / Development | electron-vite |
| Editor | Monaco Editor |
| Terminal UI | xterm.js |
| Terminal / PTY backend | `node-pty`, subject to the Phase 2 Windows/native compatibility gate |
| Styling | Tailwind CSS |
| Local persistence | Versioned JSON dưới Electron user data, với atomic write, backup và recovery |
| Git | Local Git CLI phía sau typed GitService |
| Language Intelligence | Monaco-native providers cho JavaScript/TypeScript/HTML/CSS/JSON trong Phase 3; C# intelligence qua Main-owned `csharp-ls` được authorize cho Phase 5.5 sau compatibility hard gate |

Student Coding IDE là Electron desktop application, không phải Next.js web
application. Các lựa chọn còn TBD hợp lệ, bao gồm renderer shared state library,
provider cho các ngôn ngữ deferred và TypeScript Run strategy, phải
được ghi quyết định trong `docs/DECISIONS.md` trước khi subsystem tương ứng được
implementation.

### 1.4. Mục tiêu

Xây dựng một IDE desktop phục vụ việc:

* Viết code bằng tay.
* Quản lý project.
* Chạy chương trình.
* Xem output và lỗi.
* Làm việc với Git.
* Hỗ trợ nhiều ngôn ngữ lập trình.

Trong giai đoạn đầu, dự án **chưa triển khai hoặc tập trung vào AI Agent**.

Mục tiêu chính là xây dựng một IDE hoạt động ổn định trước, sau đó mới xem xét tích hợp AI trong các giai đoạn tiếp theo.

---

## 2. Phạm vi dự án

### 2.1. Trong phạm vi

Phiên bản đầu cần hỗ trợ:

1. Quản lý project.
2. Quản lý file và thư mục.
3. Code editor.
4. Terminal tích hợp.
5. Chạy chương trình.
6. Hiển thị output.
7. Git cơ bản.
8. Quản lý nhiều project gần đây.
9. Settings cơ bản.
10. Giao diện desktop trên Windows.
11. IntelliSense cho các ngôn ngữ ưu tiên của phiên bản đầu.
12. Diagnostics trong editor và Problems panel.

---

### 2.2. Ngoài phạm vi hiện tại

Các chức năng sau **chưa thực hiện trong giai đoạn đầu**:

* AI Agent.
* Codex integration.
* Claude Code integration.
* Gemini integration.
* Grok integration.
* AI tự động sửa source code.
* AI tự động chạy command.
* Multi-agent orchestration.
* AI worktree.
* Cloud IDE.
* Collaboration nhiều người dùng.
* Đồng bộ project lên cloud.
* Marketplace extension riêng.
* Formatter, bao gồm Format Document và Format on Save.
* Debugger, bao gồm breakpoint, stepping, variables và call stack.

Các chức năng này có thể được nghiên cứu ở phase sau.

---

## 3. Đối tượng sử dụng

### 3.1. Sinh viên / người học lập trình

Người dùng có thể:

* Tạo project.
* Mở project có sẵn.
* Tạo file.
* Tạo folder.
* Viết code.
* Chạy code.
* Xem kết quả.
* Xem lỗi.
* Sử dụng terminal.
* Quản lý source bằng Git.

---

## 4. Yêu cầu chức năng

### FR-001 — Mở project

Người dùng có thể mở một thư mục trên máy làm project.

#### Yêu cầu

* Cho phép chọn thư mục từ hệ thống.
* Hiển thị cấu trúc thư mục trong Explorer.
* Project được hiển thị trong workspace hiện tại.
* Có thể chuyển sang project khác.

---

### FR-002 — Tạo project mới

Người dùng có thể tạo một project mới.

#### Yêu cầu

Người dùng nhập:

* Tên project.
* Vị trí lưu project.

Hệ thống tạo thư mục project tương ứng.

Giai đoạn đầu có thể chỉ hỗ trợ tạo thư mục project trống.

Trong V1, người dùng chọn thư mục cha và nhập tên project. Hệ thống chỉ tạo một
thư mục project trống mới dưới thư mục cha đó. Nếu thư mục đích đã tồn tại, thao
tác phải thất bại an toàn; không tái sử dụng thư mục rỗng có sẵn, ghi đè, hợp
nhất nội dung hoặc tự động chọn tên khác.

---

### FR-003 — Recent Projects

Hệ thống lưu danh sách các project đã mở gần đây.

#### Yêu cầu

Hiển thị:

* Tên project.
* Đường dẫn.
* Thời gian mở gần nhất.

Người dùng có thể nhấn vào project để mở lại.

---

## 5. File Explorer

### FR-004 — Hiển thị cấu trúc project

Explorer phải hiển thị:

* Folder.
* Subfolder.
* File.

Dạng cây thư mục.

---

### FR-005 — Tạo file

Người dùng có thể:

* Chọn folder.
* Tạo file mới.
* Nhập tên file.

Ví dụ:

```text
main.js
index.html
Program.cs
main.py
```

---

### FR-006 — Tạo folder

Người dùng có thể tạo folder mới trong project.

Ví dụ:

```text
src/
components/
services/
models/
```

---

### FR-007 — Rename

Cho phép đổi tên:

* File.
* Folder.

---

### FR-008 — Delete

Cho phép xóa:

* File.
* Folder.

Phải có xác nhận trước khi xóa folder không rỗng hoặc thực hiện thao tác xóa có
nguy cơ làm mất dữ liệu.

Trong V1, mọi thao tác xóa file hoặc folder đều yêu cầu xác nhận rõ ràng trong
Renderer. Sau khi xác nhận, Main chuyển mục tiêu vào Recycle Bin bằng capability
Electron được giới hạn cho domain filesystem. Không xóa vĩnh viễn và không tự
động fallback sang xóa vĩnh viễn nếu thao tác Recycle Bin thất bại.

---

## 6. Code Editor

### FR-009 — Mở file

Khi người dùng chọn file trong Explorer:

* File được mở trong editor.
* Nội dung được hiển thị.
* File có thể chỉnh sửa.

---

### FR-010 — Multiple Tabs

Cho phép mở nhiều file cùng lúc dưới dạng tab.

Ví dụ:

```text
main.ts | app.ts | package.json
```

Người dùng có thể:

* Chuyển tab.
* Đóng tab.
* Xem trạng thái file chưa save.

---

### FR-011 — Syntax Highlighting

Editor phải hỗ trợ tô màu syntax theo ngôn ngữ.

Mức hỗ trợ ngôn ngữ của phiên bản đầu được chia thành các tier:

#### Tier 1 — Language Intelligence

Các ngôn ngữ thuộc Phase 3 V1 cần được ưu tiên triển khai đầy đủ:

* JavaScript.
* TypeScript.

Acceptance criteria tối thiểu cho mỗi ngôn ngữ Tier 1:

* Syntax highlighting.
* Completion.
* Hover.
* Signature Help.
* Go to Definition.
* Diagnostics.
* Problems panel.

Run không phải deliverable của Phase 3. Phase 4 V1 chỉ Run file JavaScript `.js`
hiện tại trong active project. TypeScript Language Intelligence vẫn được hỗ trợ;
TypeScript Run được defer sang future scope với decision gate ADR-014.

#### Tier 2 — Language Intelligence

Các ngôn ngữ cần hỗ trợ:

* HTML.
* CSS.
* JSON.

Acceptance criteria Tier 2:

* HTML: Syntax highlighting, Completion và Hover nếu Monaco provider hỗ trợ.
  Diagnostics và Problems contribution cho HTML được defer vì current approved
  Monaco HTML provider không có validation support.
* CSS: Syntax highlighting, Completion, Hover nếu Monaco provider hỗ trợ,
  Diagnostics và Problems contribution.
* JSON: Syntax highlighting, Completion trong phạm vi local provider behavior,
  Hover nếu Monaco provider hỗ trợ, Diagnostics và Problems contribution.

Tier 2 không bắt buộc hỗ trợ Run trong V1.

#### Tier 3 — Syntax-only trong Phase 3 V1

Trong Phase 3 V1, các ngôn ngữ sau chỉ có acceptance criteria về syntax
highlighting:

* C#.
* PHP.

Đây là phạm vi lịch sử đã hoàn tất của Phase 3. Phase 5.5 mở rộng C# thành V1
Language Intelligence với syntax highlighting, Completion, Hover, Signature
Help, Go to Definition, Diagnostics và Problems integration. PHP vẫn syntax-only.

C# Run không thuộc Phase 5.5. Find References, Rename Symbol, Code Actions/Quick
Fix, refactoring, formatter, advanced semantic tokens, Razor, metadata/BCL/
generated virtual-document navigation, debugger và full intelligence cho loose
`.cs` files đều được defer.

#### Deferred — Future language support

Python và Java được defer khỏi toàn bộ V1 acceptance scope hiện tại. Monaco có thể tiếp
tục nhận diện extension và tokenize `.py` hoặc `.java` như behavior incidental,
nhưng Phase 3 không implement hoặc claim completion, hover, signature help,
definition, diagnostics, Problems integration hoặc language-server lifecycle cho
hai ngôn ngữ này.

Python Run, Python runtime integration và Java syntax support cũng không phải
acceptance criteria của V1 hiện tại.

Đây không phải permanent removal. Future phase có thể bổ sung Python và Java mà
không thay đổi ownership boundary hiện tại: Monaco/editor state ở Renderer,
project/filesystem authority ở Main, typed narrow Preload bridge khi cần, và mọi
external language-server process phải do Main sở hữu.

Quyết định defer này áp dụng cho cả Language Intelligence và Run trong V1 hiện
tại. Chỉ một future scope decision được authorize mới có thể đưa Python hoặc Java
trở lại acceptance criteria.

Khái niệm hỗ trợ ngôn ngữ trong phiên bản đầu không bao gồm formatter,
debugger, refactoring nâng cao, Rename Symbol toàn project, Call Hierarchy hoặc
Test Explorer.

---

### FR-012 — Auto Save / Manual Save

Người dùng có thể lưu file bằng:

```text
Ctrl + S
```

Auto Save được bật hoặc tắt trong Settings theo FR-036.

---

### FR-013 — Unsaved Changes Protection

IDE phải bảo vệ file có thay đổi chưa được lưu khi người dùng:

* Đóng tab.
* Đóng project.
* Chuyển project nếu thao tác làm mất editor state.
* Đóng application.

Nếu có unsaved changes, người dùng phải có các lựa chọn tương đương:

```text
Save
Don't Save
Cancel
```

IDE không được tự ý discard source code. Requirement này phải tuân thủ
NFR-004 — Data Safety.

---

### FR-014 — Line Number

Editor hiển thị số dòng.

---

### FR-015 — Search trong file

Cho phép tìm kiếm nội dung trong file hiện tại.

Phím tắt:

```text
Ctrl + F
```

---

### FR-016 — Search trong project

Cho phép tìm kiếm text trên toàn bộ project.

Kết quả cần hiển thị:

* File.
* Dòng.
* Nội dung match.

Search toàn project phải:

* Chạy bất đồng bộ và không block renderer.
* Không làm đóng băng UI khi project có nhiều file.
* Mặc định loại trừ hoặc có cơ chế loại trừ các thư mục không cần thiết như
  `.git/`, `node_modules/`, `dist/`, `build/` và `out/`.
* Ưu tiên hỗ trợ hủy search đang chạy; nếu chưa có trong V1, search vẫn phải
  chạy nền và UI phải tiếp tục phản hồi.

---

### FR-017 — IntelliSense

Đối với các ngôn ngữ Tier 1, IDE phải hỗ trợ:

* Code completion.
* Hover information.
* Signature Help / Parameter Information.
* Go to Definition.
* Kích hoạt suggestion tự động hoặc bằng `Ctrl + Space`.

Đối với Tier 2, Completion là bắt buộc; Hover được yêu cầu khi language service
hỗ trợ. Signature Help và Go to Definition của Tier 2 là optional enhancement,
không phải acceptance criteria của V1.

Find References là optional enhancement và không phải acceptance criteria của V1.

Phase 3 V1 phải dùng các Monaco/browser-worker provider API chuẩn ở Renderer cho
JavaScript, TypeScript, HTML, CSS và JSON; không triển khai logic IntelliSense
đặc thù rải rác trong editor và không yêu cầu external language-server process.

Phase 5.5 C# V1 dùng provider-per-capability: Monaco tokenization tiếp tục sở hữu
syntax; Main-owned `csharp-ls` cung cấp Completion, Hover, Signature Help, Go to
Definition và Diagnostics qua thin semantic LSP↔Monaco adapter. Renderer chỉ
nhận typed semantic API; không nhận raw LSP/JSON-RPC, PID, executable path, cwd,
spawn arguments hoặc canonical project root. `vscode-languageserver-protocol`
3.18.3 và `vscode-jsonrpc/node` 9.0.2 là transport/protocol versions được Phase
5.5B verify cùng `csharp-ls` 0.27.0.

C# workspace chọn solution theo thứ tự: reuse lựa chọn `.sln`/`.slnx` hợp lệ đã
lưu; tự chọn khi có đúng một candidate; yêu cầu người dùng chọn và nhớ theo
project khi có nhiều candidate; không có solution nhưng có `.csproj` thì dùng
project mode; không có solution/project thì syntax-only. Không tạo temporary
solution. Trong project mode, Main chỉ được bounded discovery cho preflight/UX;
`csharp-ls` hiện tại sở hữu recursive project discovery/loading thực tế nên IDE
không claim kiểm soát chính xác tập project được load.

Workspace readiness là state riêng với dependency và service lifecycle:

```text
READY
SELECTION_REQUIRED
NO_CSHARP_WORKSPACE
PREFLIGHT_FAILED
```

Sau workspace selection, Main phải chạy structured preflight trước khi start
`csharp-ls`: kiểm tra effective SDK selection bằng exit code của `dotnet
--version`, parse selected `.sln`/`.slnx` bằng exit code của `dotnet sln <path>
list`, extract các listed `.csproj` path tokens mà không match localized prose,
bounded-discover `.csproj` trong project mode, rồi evaluation-only từng project bằng
`dotnet msbuild` với `-getProperty`/`-getItem` JSON và Main-owned containment/
existence checks cho `ProjectReference`. Preflight không được request target,
build, restore, generate solution, chạy user program, hoặc chủ động ghi vào workspace.
Theo quyết định được duyệt 2026-09-11 (ADR-022), V1 chỉ hỗ trợ evaluation cho
user-trusted projects. MSBuild evaluation không phải sandbox và có thể thực thi
evaluation-time logic từ project/import; không bảo đảm không có side effect
cho arbitrary untrusted projects. Phase 5.5E không thêm sandbox hoặc trust UX.
`PREFLIGHT_FAILED` không start semantic service. `READY` chỉ xác nhận các check
cấu trúc/evaluation nói trên; nó không claim Roslyn workspace tương đương sẽ load
hoàn hảo trong `csharp-ls`.

Runtime và dependency detection phải dùng các trạng thái khái niệm:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Provider abstraction hiện tại phải biểu diễn capability/status phù hợp với
Monaco workers. Với Phase 5.5 C#, dependency failure dùng `MISSING` hoặc
`INVALID_CONFIGURATION`, còn service lifecycle dùng:

```text
STOPPED
STARTING
RUNNING
CRASHED
```

`NOT_CONFIGURED` được reserve cho future configured paths. Dependency state và
service lifecycle không được gộp hoặc suy diễn từ nhau.
`RUNNING` chỉ có nghĩa process `csharp-ls` còn sống và LSP initialize thành công;
nó không chứng nhận Roslyn workspace health. Empty completion, null hover, empty
definition hoặc không có diagnostics không được dùng để suy ra workspace failure.
Human-readable provider messages/logs chỉ là Main-owned diagnostic evidence,
không phải readiness/state-machine input.

Tên hiển thị thực tế có thể khác nhưng behavior phải tương đương với loại provider
đang dùng. Current Monaco provider phải báo availability/failure có thể hành động
và không được thất bại im lặng; executable discovery, process restart/crash và
external-server log UX không phải Phase 3 V1 acceptance criteria.

Runtime và language service là hai dependency độc lập:

```text
Runtime != Language Service
```

Ví dụ kiến trúc cho future Python support: Python runtime dùng để chạy chương
trình; Python language service dùng cho IntelliSense và diagnostics. Hai
dependency này vẫn phải độc lập nếu future scope được authorize. Ví dụ chỉ mô tả
khả năng mở rộng kiến trúc; Python runtime, Python Run, Python Language
Intelligence và Python language-service lifecycle đều không phải V1 acceptance
criteria hiện tại.

---

### FR-018 — Diagnostics

Đối với Tier 1 và Tier 2 CSS/JSON, IDE phải:

* Hiển thị lỗi và cảnh báo tại vị trí tương ứng trong editor.
* Phân biệt Error, Warning và Information.
* Tổng hợp diagnostics trong Problems panel.
* Cho phép chọn một diagnostic để chuyển đến file và dòng tương ứng.
* Cập nhật diagnostics khi nội dung file thay đổi.
* Không block editor trong khi language service đang phân tích source.

Diagnostics từ language service phải được tách khỏi stderr và exit code của
chức năng Run Code.

Phase 5.5 áp dụng các behavior editor/Problems tương đương cho C# bằng pull
diagnostics trên open documents. Workspace diagnostics được defer; diagnostic
`resultId` không vượt qua public IPC.

HTML diagnostics và HTML Problems contribution được defer khỏi V1 hiện tại vì
approved Monaco HTML provider không triển khai validation. V1 không bổ sung
custom HTML validator/parser, dependency mới hoặc external HTML provider để thay
thế capability này.

---

## 7. Terminal

### FR-019 — Integrated Terminal

IDE cung cấp terminal tích hợp.

Người dùng có thể chạy các command như:

```bash
node app.js
python main.py
dotnet run
npm install
npm run dev
git status
```

---

### FR-020 — Multiple Terminal

Có thể mở nhiều terminal session.

Ví dụ:

```text
Terminal 1
Terminal 2
Terminal 3
```

---

### FR-021 — Terminal Working Directory

Khi mở terminal trong project, working directory mặc định phải là thư mục project.

Ví dụ:

```text
D:\Projects\MyApp
```

---

## 8. Run Code

### FR-022 — Run Current File

Người dùng có thể chạy file hiện tại bằng nút:

```text
▶ Run
```

Phase 4 V1 chỉ chạy file JavaScript `.js` hiện tại đã được xác thực thuộc active
project bằng Node.js. Các extension khác không được Run trong V1.

Chỉ có một primary Run action ở bên phải editor header, áp dụng cho file active;
không có Run button trùng lặp, global project Run hay npm/framework launcher.

Nếu editor model của target dirty, chặn Run và thông báo yêu cầu Save trước.
Không auto-save, chạy stale disk content hay tạo temporary execution file;
authoritative Monaco/editor buffer phải được giữ nguyên.

Mỗi target chỉ có một active run. Bấm Run lại cùng target tự dừng run hiện tại,
chờ cleanup hoàn tất rồi mới tạo run mới; không overlap và không confirmation
prompt trong V1. Cleanup thất bại không được khởi chạy replacement.

Main resolve Node từ process `PATH`; Renderer không resolve/chọn executable.
Không bundled Node, configured absolute Node path hay Node-path Settings UI trong
Phase 4. Không resolve được Node thì báo `MISSING`, chặn Run và hiển thị lỗi hữu
ích, an toàn. Configured Node path được defer sang future Settings scope.

Sau khi project close/switch được xác nhận, dừng mọi Run thuộc project hiện tại
và chờ cleanup thành công trước khi hoàn tất transition. Cleanup lỗi thì không
close/switch, giữ current project/editor state. Khi root unavailable, dừng các
Run thuộc project và reject late/stale events; output project cũ không được cập
nhật UI của project thay thế. Không thay đổi Terminal behavior.

Ví dụ:

```text
.js  → node file.js
.ts  → Run DEFERRED, không hỗ trợ trong V1 hiện tại
```

TypeScript Run được defer, không bị từ chối vĩnh viễn. V1 không chọn TypeScript
runtime, compile/transpile strategy, `tsx`, `ts-node` hay Node-native TypeScript
execution policy. ADR-014 là gate cho future TypeScript Run, không chặn JavaScript
Run của Phase 4. Strategy tương lai phải được quyết định và kiểm chứng trước khi
thêm TypeScript execution.

RunService giữ abstraction RunStrategy nội bộ, hẹp; Phase 4 chỉ có concrete
JavaScriptRunStrategy. Future TypeScriptRunStrategy có thể được bổ sung khi được
authorize mà không thiết kế lại core RunService; không tạo placeholder production
code hay dependency TypeScript Run trong V1.

Run phải kiểm tra runtime tương ứng độc lập với language service. Nếu runtime bị
thiếu hoặc cấu hình không hợp lệ, IDE phải báo lỗi rõ ràng thay vì fail silent.

Các ngôn ngữ khác có thể được mở rộng sau. Run cho Tier 3 không phải acceptance
criteria của V1. Python Run được defer khỏi V1 hiện tại.

---

### FR-023 — Run Project

#### Approved C# Project Run extension — planning baseline (2026-10-07)

Current status: `IN_PROGRESS`; M1-01 through M1-12 (including M1-09a) and M2-01 through M2-05 COMPLETE.
M2-06 automated Windows 11 x64 Electron evidence PASS; manual W cells were not run, so M2-06 and M2-07 are not COMPLETE. RunService queues Console lines for a live C#
execute step. Typed IPC, Preload, and the Output line composer expose send, close,
and status for that step. JavaScript and build do not accept Console input.
Main C# build/execute, typed IPC/Preload, and the workspace target/Run/Stop/Output
presentation are verified. Milestone 1 core acceptance is COMPLETE.
The original planning authorization was design/documentation only. Console input
is a typed session capability with an Output line composer. Milestone 2 automated
Windows 11 x64 Electron acceptance passed on 2026-11-15. Manual W cells and M2-07
completion remain outstanding. The Phase 4 scope below remains historical acceptance;
the C# exception is governed by ADR-024 and Implementation Plan Section 13.7.
Phase 5.5 intelligence and Phase 9 Exercise Runtime do not implement this feature.

C# Project Run's verified acceptance platform is **Windows 11 x64** (scope
revision, 2026-10-07; ADR-024 amendment). Windows 10 is outside the verified
C# Project Run acceptance baseline. Compatibility is not claimed. This exception
does not change the Windows 10/11 requirements for other IDE capabilities,
including the historical Phase 4 Run scope and Phase 7 packaging.

- Milestone 1: SDK-style C# Console Application, single target framework, selected
  `.csproj` under the active project root. Never execute the active `.cs` file as
  an independent program. Automatically select exactly one eligible Console
  project; otherwise require explicit choice. Remember the choice per project,
  revalidate it on use, and keep it separate from IntelliSense workspace selection.
- Main determines executable, arguments, cwd and SDK policy. Check PATH SDK
  inventory, effective `global.json` selection and evaluated target framework.
  Use SDK build/implicit restore followed by `dotnet run --project <csproj>` with
  fixed no-build/no-restore and no-launch-profile options; no IDE build cache.
- Run only saved sources. Block on dirty buffers or unresolved external conflicts
  in the active folder project, including open referenced files; do not save,
  discard or overwrite automatically. Recheck before starting execution.
- Support Run, Stop, serialized Re-run, stdout, stderr and exit code. Preserve
  project/owner validation, owned process-tree cleanup and fail-closed transitions.
  Build/restore may write SDK `bin`/`obj` output and use configured NuGet feeds.
  This is execution of a user-trusted project, not an OS sandbox.
- Milestone 2: line-oriented Console input in the existing Output surface, sent
  through validated typed IPC to stdin of the exact owned live Run session.
  Support repeated and multiline input, bounded queues/backpressure, and reject
  stale input after Stop, exit, Re-run or project/owner invalidation. Do not
  substitute Terminal/PTY. `Console.ReadKey`, cursor control and full terminal
  emulation are outside this line-input contract.
- Preserve current JavaScript Run behavior. No standalone `.cs`, ASP.NET/Web API,
  debugger, launch profiles, advanced multi-target selection, Exercise Runtime/
  Judge, SDK installation or generic Renderer execute/shell API in this MVP.

C# Run is `COMPLETE` only when both milestone exit gates, regression tests and
Windows acceptance pass. A completed Core milestone alone is partial delivery.

Built-in Run Project được defer, không phải acceptance requirement của Phase 4
V1. V1 chỉ Run file `.js` hiện tại trong active project theo FR-022.

`npm run ...`, npm/package-manager script execution, dev-server orchestration,
project entry configuration và framework/project launcher logic đều ngoài scope
Phase 4 V1. Không implement project entry selection. Một future phase được
authorize có thể bổ sung Run Project sau khi quyết định rõ entry/script policy.

Các lệnh như `python`, `dotnet run`, `php artisan serve` và lệnh Java vẫn có thể
được người dùng tự nhập trong Integrated Terminal; khả năng terminal chung này
không phải built-in language support. Built-in Run Project cho Python, .NET,
Laravel, Java và các framework Tier 3 là future enhancement, trừ khi requirement
được thay đổi sau này. Framework auto-detection cũng không thuộc V1.

---

## 9. Output Panel

### FR-024 — Hiển thị Output

Khi chạy chương trình, output được hiển thị trong tab `Output`, sibling của
`Problems` và `Terminal` trong Bottom Panel hiện có. Không tạo panel architecture
khác hay redesign Terminal. stdout và stderr được phân biệt, kèm running state,
target context, exit result và Stop khi đang chạy.

Ví dụ:

```text
Hello World
Process exited with code 0
```

---

### FR-025 — Hiển thị Error

Nếu chương trình lỗi, hệ thống hiển thị:

* stderr.
* Exit code.
* Nội dung lỗi.

Ví dụ:

```text
ReferenceError: user is not defined
Process exited with code 1
```

---

### FR-026 — Stop Process

Nếu chương trình đang chạy, người dùng có thể nhấn:

```text
■ Stop
```

để kết thúc run session.

Trên Windows 10/11, Stop Process phải:

* Dừng process chính của run session.
* Cố gắng terminate các child process thuộc session.
* Tránh để orphan process tiếp tục chạy khi có thể.
* Cleanup các process do IDE tạo khi đóng application.

Không được terminate process không thuộc run session của IDE.

---

## 10. Git

### FR-027 — Git Repository Detection

IDE tự kiểm tra project có Git hay không.

Nếu có `.git`, hiển thị thông tin Git.

Git là external dependency. IDE phải xác định tối thiểu các trạng thái:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Nếu Git không được tìm thấy hoặc cấu hình không hợp lệ:

* Core editor vẫn phải hoạt động.
* Source Control UI phải báo Git unavailable và không fail silent.
* IDE phải cung cấp hướng dẫn cấu hình hoặc Git path nếu cần.

---

### FR-028 — Git Status

Hiển thị file:

* Modified.
* Added.
* Deleted.
* Untracked.

---

### FR-029 — Git Stage / Unstage

Cho phép stage file.

Tương đương:

```bash
git add
```

Cho phép unstage file nếu Git abstraction được chọn hỗ trợ an toàn trong V1.

---

### FR-030 — Git Commit

Cho phép nhập commit message và commit.

Ví dụ:

```text
feat: add student management
```

---

### FR-031 — Git Branch

Cho phép:

* Xem branch hiện tại.
* Xem danh sách branch.
* Checkout hoặc switch branch.

Tạo branch mới có thể được hỗ trợ trong V1 nếu Git abstraction đã chọn đáp ứng
an toàn; đây không phải acceptance criteria bắt buộc.

---

### FR-032 — Git History

Cho phép xem lịch sử commit cơ bản.

Hiển thị:

* Commit hash.
* Message.
* Author.
* Date.

---

## 11. Settings

### FR-033 — Theme

Cho phép lựa chọn:

* Light.
* Dark.
* System.

---

### FR-034 — Editor Font Size

Cho phép thay đổi kích thước font editor.

---

### FR-035 — Tab Size

Cho phép cấu hình:

```text
2 spaces
4 spaces
```

---

### FR-036 — Auto Save

Cho phép bật hoặc tắt Auto Save.

---

## 12. Keyboard Shortcuts

Các shortcut cơ bản:

| Chức năng      | Shortcut         |
| -------------- | ---------------- |
| Save           | Ctrl + S         |
| Find           | Ctrl + F         |
| New File       | Ctrl + N         |
| Open Project   | Ctrl + O         |
| Terminal       | Ctrl + `         |
| Search Project | Ctrl + Shift + F |

Shortcut có thể thay đổi sau.

---

## 13. Dữ liệu cục bộ

### FR-037 — Local Application State

IDE có thể lưu cục bộ các thông tin:

* Recent projects.
* Settings.
* Theme.
* Editor preferences.
* Workspace state.

Dữ liệu phải được lưu trên máy người dùng.

Không yêu cầu database server riêng.

---

## 14. Database của project người dùng

IDE không yêu cầu project phải sử dụng database cụ thể.

Người dùng có thể tự phát triển project sử dụng:

* MySQL.
* PostgreSQL.
* SQLite.
* SQL Server.
* MongoDB.
* Database khác.

IDE chỉ đóng vai trò môi trường phát triển.

---

## 15. Yêu cầu phi chức năng

### NFR-001 — Desktop Application

Ứng dụng phải chạy được trên Windows.

Mục tiêu ban đầu:

```text
Windows 10
Windows 11
```

---

### NFR-002 — Local First

Các thao tác chính phải hoạt động trên máy người dùng:

* Editor.
* Files.
* Terminal.
* Git.
* Run code.
* Language Intelligence.
* Settings và project state.

Không phụ thuộc cloud để thực hiện các chức năng cơ bản.

---

### NFR-003 — Performance

IDE cần:

* Mở file nhanh.
* Không block UI khi chạy terminal.
* Không đóng băng editor khi process đang chạy.
* Search project và language analysis không block renderer.
* Có khả năng xử lý project có nhiều file.

---

### NFR-004 — Data Safety

Không được tự động:

* Xóa source.
* Ghi đè file mà không cần thiết.
* Reset Git repository.
* Xóa commit.

Các thao tác nguy hiểm cần có xác nhận.

---

### NFR-005 — Maintainability

Source code Student Coding IDE phải:

* Tách module rõ ràng.
* Có ranh giới rõ giữa renderer, preload và main process.
* Có documentation.
* Có naming convention nhất quán.
* Không phụ thuộc vào source tree hoặc internal module của Orca.

---

### NFR-006 — Language Provider Reliability

Current Monaco/browser-worker providers và Phase 5.5 C# external provider phải
chạy tách biệt với luồng giao diện chính. Khi provider khởi tạo chậm, bị lỗi hoặc
bị dừng:

* Editor vẫn phải cho phép xem, sửa và lưu file.
* IDE phải biểu diễn trạng thái/failure của provider bằng contract hiện có và
  không fail silent.
* Provider phải được dispose an toàn và được reinitialize/recover khi kiến trúc
  Monaco renderer-owned hiện có hỗ trợ tự nhiên.
* Dirty editor buffers vẫn là authoritative và không được mất hoặc bị ghi đè
  trong quá trình provider recovery.
* Stale project/provider generations phải tiếp tục bị reject.
* Lỗi của một ngôn ngữ không được làm hỏng provider của ngôn ngữ khác.

Manual user-facing `Restart Language Service` không phải V1 requirement. V1
không thêm public start/stop/restart API hoặc raw log API. C# unexpected exit
chuyển service sang `CRASHED`; không có automatic restart loop trong V1.

---

### NFR-007 — Desktop Security Boundary

Renderer không được truy cập filesystem, process, shell hoặc Node.js API một
cách tùy tiện. Kiến trúc phải ưu tiên boundary:

```text
Renderer
   ↓
Preload API
   ↓
IPC
   ↓
Main Process
   ↓
Filesystem / Terminal / Git / Process
```

Yêu cầu:

* Bật `contextIsolation`.
* Tắt `nodeIntegration` trong renderer, trừ khi có quyết định đặc biệt được ghi
  rõ trong `docs/DECISIONS.md`.
* Chỉ expose API cần thiết qua preload.
* Validate input tại IPC boundary phù hợp.
* Không expose generic unrestricted shell execution API trực tiếp cho renderer.
* Các quyền filesystem, terminal, Git và process phải được giới hạn theo use case
  của IDE.

---

## 16. Kiến trúc dự kiến

Student Coding IDE có kiến trúc và source implementation độc lập. Orca chỉ là
nguồn tham khảo để hỗ trợ phân tích và design decisions.

Cấu trúc khái niệm:

```text
Desktop Application
│
├── Application Shell
│
├── Project Manager
│
├── File Explorer
│
├── Code Editor
│
├── Renderer Language Provider Manager
├── Main LanguageServiceManager (Phase 5.5 C#)
│
├── Problems Panel
│
├── Terminal
│
├── Run Service
│
├── Output Panel
│
├── Git Service
│
├── Settings
│
└── Local Persistence
```

Phase 5.5 bổ sung Main-owned LanguageServiceManager cho `csharp-ls`. Manager này
là lifecycle domain độc lập với Runtime và RunService, và chỉ expose semantic,
typed, runtime-validated C# capabilities qua Preload.

---

## 17. Phần tham khảo từ Orca

Các khu vực có thể nghiên cứu từ Orca:

* Desktop application architecture.
* Electron lifecycle.
* Main, preload và renderer separation.
* IPC architecture và security boundary.
* Monaco Editor integration.
* File Explorer architecture.
* Integrated Terminal architecture.
* Process execution và lifecycle.
* Git architecture.
* Workspace/project handling.
* Settings infrastructure.
* Local state.
* UI/UX patterns.

Việc tham khảo không đồng nghĩa với sao chép nguyên module hoặc kế thừa source
tree Orca. Student Coding IDE phải có implementation riêng phù hợp requirement và
design decisions của project.

---

## 18. Phần cần nghiên cứu trước khi implementation

Trước khi implementation subsystem tương ứng phải xác định:

1. Entry point của desktop application.
2. Main process.
3. Renderer process.
4. IPC architecture.
5. File system handling.
6. Monaco Editor integration.
7. Language service protocol và lifecycle.
8. Cách phát hiện runtime và language service trên Windows.
9. Diagnostics và Problems panel.
10. Terminal implementation.
11. Process execution.
12. Git implementation.
13. Local persistence.
14. Settings.
15. Project/workspace state.
16. AI architecture của Orca chỉ để xác định những concept không cần trong V1.
17. Electron security boundary của Student Coding IDE.
18. TypeScript run strategy.

---

## 19. Nguyên tắc phân loại khi nghiên cứu Orca

Phase 1 phải phân loại từng subsystem hoặc capability được khảo sát theo một
trong các nhóm:

```text
REFERENCE
REIMPLEMENT
ADAPT
ADD
OMIT
```

### REFERENCE

Nghiên cứu cách Orca giải quyết một vấn đề. Không mặc định sao chép
implementation.

### REIMPLEMENT

Xây dựng lại functionality tương đương bằng kiến trúc và source code của Student
Coding IDE.

### ADAPT

Giữ concept hoặc behavior hữu ích của Orca nhưng thiết kế implementation khác
cho phù hợp requirement.

### ADD

Feature Student Coding IDE cần nhưng Orca không có hoặc không đáp ứng requirement.

### OMIT

Feature Orca có nhưng Student Coding IDE V1 không cần triển khai.

---

## 20. Local AI Chat và AI Agent

### FR-038 — Local AI Chat

#### Yêu cầu

* Người dùng có thể mở và đóng Local AI Chat bằng toggle ở góc trên bên phải IDE.
* Chat hiển thị trong vùng workspace bên phải, phủ sidebar hiện có và không chặn
  editor; Explorer/Git vẫn mounted bên dưới.
* Người dùng có thể nhập và gửi prompt; giao diện hiển thị message của user và
  assistant bằng các primitive beUI Message, MessageBubble, MessageScroller,
  PromptInput và StreamingResponse.
* Runtime local AI dự kiến ban đầu là Ollama; model dự kiến là `qwen3:1.7b`.
  AI inference được định hướng chạy cục bộ trên máy người dùng.

#### Trạng thái và phạm vi Phase 8

* **8A — Chat UI: COMPLETE.** Toggle, overlay, input/message UI và các component
  beUI đã hoàn tất. Không có nhãn YOU/QWEN; Thinking... chỉ là trạng thái chờ.
* **8B — Ollama Integration: COMPLETE.** AiChatPanel dùng Ollama thật tại URL cố định
  `http://127.0.0.1:11434`, model cố định `qwen3:1.7b`. Luồng typed giữ ranh giới
  Renderer → typed Preload API → Electron IPC → Main service → Ollama.
  Tại mốc 8B, gửi lịch sử hội thoại trong bộ nhớ với `stream:false`, `think:false`,
  nhận phản hồi hoàn chỉnh. Đã có loading/error, kiểm tra Ollama/model và chặn gửi
  chồng lấn; 8C thay transport này bằng streaming.
* **8C — Streaming & Reliability: COMPLETE.** Gửi `stream:true`, giữ `think:false`,
  model và URL cố định. Main đọc NDJSON tăng dần; API typed startChat/stopChat/
  onChatEvent chuyển chunk/complete/error/stopped kèm request ID đến đúng renderer
  sở hữu request. UI cập nhật một phản hồi assistant, bỏ Thinking... khi nhận chunk
  nội dung đầu tiên. Stop dùng AbortController, giữ nội dung đã nhận và cho gửi lại.
  Có bảo vệ event cũ/trùng, event đến trước start acknowledgement, hủy khi đóng
  panel/mất cửa sổ và cleanup lifecycle. Lỗi Ollama/model, HTTP, stream sai định
  dạng/bị ngắt và timeout hiển thị gọn, không làm crash panel; không thêm agent,
  tools, file context hoặc persistence.

Phase 8 không bao gồm current-file context, selected-code context,
multi-file/project context, sửa file, chạy terminal command, tool calling hoặc
autonomous agent behavior. Đây là các khả năng AI Agent tương lai.

### Local AI Chat UI V1 — historical UI-only exception (2026-09-25)

Cho phép panel chat mock trong Renderer, phủ riêng sidebar phải và giữ Explorer/Git
mounted. Toggle Local AI, transcript mẫu, input và phản hồi mock chỉ dùng React
state trong phiên mở panel; đóng panel sẽ bỏ transcript. `qwen3:1.7b` chỉ là nhãn.
Tham khảo năm primitive beUI: Message, MessageBubble, MessageScroller, PromptInput,
StreamingResponse; dùng theme/scale hiện có. Không có Ollama, model call, streaming,
IPC/preload/backend AI, tools, file context, history hay persistence.
Ngoại lệ này không cho phép triển khai AI Agent hoặc các integration bên dưới.

### V1

AI Agent không thuộc scope V1. Student Coding IDE V1 không implement:

* AI Agent.
* Codex, Claude Code, Gemini hoặc Grok integration.
* AI authentication.
* AI process.
* AI navigation hoặc AI commands.
* AI worktree hoặc multi-agent orchestration.
* AI auto-edit.
* AI auto-run.

Core IDE phải hoạt động độc lập hoàn toàn với AI. Kiến trúc chỉ cần giữ ranh giới
module hợp lý để tương lai có thể bổ sung AI integration; không cần overengineer
extension point cho AI trong V1.

Source Orca không được import vào project, vì vậy V1 không có requirement xóa,
giữ hoặc disable source AI của Orca.

---

## 21. Phase phát triển

### Phase 0 — Project Initialization & Reference Baseline

Mục tiêu:

1. Tạo Student Coding IDE repository độc lập.
2. Không fork Orca làm source project.
3. Không clone source Orca vào Student Coding IDE.
4. Chốt stack ban đầu:
   * Electron.
   * React.
   * TypeScript.
   * `electron-vite`, đã được chọn và verify trong Phase 0.
   * Monaco Editor.
   * Tailwind CSS.
5. Khởi tạo desktop application foundation.
6. Application shell build thành công.
7. Application shell chạy được trên Windows.
8. Không implement feature IDE lớn trong phase này.
9. Ghi Orca reference repository.
10. Ghi Orca reference branch.
11. Ghi Orca Reference Commit SHA.
12. Tạo `docs/REFERENCE-BASELINE.md`.
13. Thiết lập lint, typecheck và build cơ bản.
14. Thiết lập project structure đủ để bước sang architecture design.

Kết quả:

```text
Student Coding IDE clean foundation runs successfully.
```

---

### Phase 1 — Orca Analysis & Architecture Design

Nghiên cứu Orca ở mức Reference Implementation:

* Desktop lifecycle.
* Main process.
* Preload.
* Renderer.
* IPC.
* Monaco integration.
* File system.
* Terminal.
* Process execution.
* Git.
* Workspace/project.
* Persistence.
* Settings.
* UI patterns.
* AI architecture chỉ để xác định phần không cần cho V1.

Mỗi subsystem phải được phân loại theo `REFERENCE`, `REIMPLEMENT`, `ADAPT`,
`ADD` hoặc `OMIT`.

Sau Phase 1 phải tạo hoặc cập nhật:

```text
docs/ARCHITECTURE.md
docs/ORCA-ANALYSIS.md
docs/CODEBASE-MAP.md
docs/DECISIONS.md
docs/LANGUAGE-SUPPORT.md
```

`ORCA-ANALYSIS.md` ghi lại phân tích source tham khảo Orca, evidence,
classification, risk và implication cho Student Coding IDE.

Phase 1 đã chọn xterm.js + `node-pty` với Phase 2 Windows/native compatibility
gate, chấp nhận local Git CLI phía sau typed GitService và chấp nhận versioned
JSON persistence. Provider Phase 3 hiện tại đã được ADR-015 chốt và Phase 3B xác
nhận bằng evidence; TypeScript Run giữ decision gate ADR-014 cho future scope,
không chặn Phase 4 JavaScript Run.

`CODEBASE-MAP.md` phải map source của Student Coding IDE, không sao chép codebase
map của Orca. Có thể có phần riêng ghi reference mapping của Orca nếu hữu ích.

---

### Phase 2 — Core IDE

Đảm bảo các chức năng:

* Project.
* Explorer.
* Editor.
* Tabs.
* Dirty state.
* Save.
* Unsaved changes protection.
* Search.
* Terminal.
* ProjectService có thể persist recent-project metadata tối thiểu cần cho project
  lifecycle; Phase 2 không triển khai đầy đủ Recent Projects UX hoặc management.

hoạt động ổn định.

---

### Phase 3 — Language Intelligence

Triển khai hoặc chỉnh sửa:

* Syntax highlighting và language detection cho JavaScript, TypeScript, HTML,
  CSS, JSON, C# và PHP theo capability matrix.
* Renderer-side provider contracts/registry cho Monaco-native workers; không có
  external language-server process trong Phase 3 V1.
* Completion, Hover, Signature Help và Go to Definition cho Tier 1 JavaScript và
  TypeScript.
* Completion và Hover theo capability đã cam kết cho Tier 2 HTML, CSS và JSON.
* Diagnostics trong editor cho JavaScript, TypeScript, CSS và JSON. HTML
  diagnostics được defer vì current Monaco provider không có validation support.
* Problems panel cho diagnostics của JavaScript, TypeScript, CSS và JSON. HTML
  Problems contribution được defer cùng HTML diagnostics.
* Bounded JS/TS project snapshot/source synchronization; không mirror toàn bộ
  `node_modules` và không expose canonical project root cho Renderer.
* Provider lifecycle/status, crash/failure handling và cleanup phù hợp với
  Monaco workers.
* Khi active project root `UNAVAILABLE`, dừng project intelligence và clear stale
  diagnostics nhưng giữ editor buffers, syntax highlighting và project mở.

Toàn bộ Python support và Java support được defer cho future phase và không thuộc
V1 acceptance hiện tại. Phase này không thêm Pyright, basedpyright,
python-lsp-server, Python LSP/IPC transport, Python interpreter detection cho
Language Intelligence hoặc Java-specific provider/runtime infrastructure.

Formatter và debugger không thuộc phase này.

---

### Phase 4 — Run & Output

Triển khai hoặc chỉnh sửa:

* Run file JavaScript `.js` hiện tại trong active project bằng Node.js.
* TypeScript Run và built-in Run Project được defer; không phải V1 acceptance.
* stdout và stderr.
* Exit code.
* Output panel và error output.
* Stop process và process tree cleanup.
* Runtime detection và missing runtime error.

---

### Phase 5 — Git

Hoàn thiện:

* Git dependency detection.
* Status.
* Stage.
* Unstage nếu phù hợp.
* Commit.
* Branch.
* Checkout/switch branch.
* History.

---

### Phase 5.5 — C# Language Intelligence

Phase 5.5 là scope extension mới được authorize sau khi Phase 3 đã hoàn tất C#
syntax-only. Phase này bổ sung Completion, Hover, Signature Help, Go to
Definition, Diagnostics và Problems integration cho C# project/solution.

Main sở hữu `csharp-ls`, LanguageServiceManager, real-path resolution, process
lifecycle và cleanup. C# language service khởi động lazy, tối đa một session cho
active project, dùng LSP `initialize` → `initialized`, UTF-16, và đồng bộ Monaco
buffer theo `didOpen` → ordered incremental `didChange` → `didSave` → `didClose`.
Monaco model version là document version; pending changes phải flush trước
semantic requests và không được drop. Dirty/open buffer thắng disk watcher
content; FileSystemService watcher hiện có được reuse.

Public language IPC chỉ nhận `projectId` và project-relative path. Main suy ra
owner từ trusted Electron sender/document identity, resolve/canonicalize path và
reject stale project/session/document results. Completion resolve dùng opaque
Main-owned handle. Definition chỉ được trả về `file:` URI nằm trong canonical
active project root. Diagnostic `resultId` giữ Main-only. C# dùng pull
diagnostics cho open documents; workspace diagnostics được defer.

`.NET SDK 10+` là dependency để chạy `csharp-ls`; `.NET 10 LTS` là acceptance
baseline. Main detection dùng process `PATH` và `dotnet --list-sdks`. Dependency
state (`MISSING`, `INVALID_CONFIGURATION`) tách khỏi service lifecycle
(`STOPPED`, `STARTING`, `RUNNING`, `CRASHED`); `NOT_CONFIGURED` được reserve cho
future configured paths. Production `csharp-ls` phải app-owned và pinned ở
version 0.27.0; development có thể dùng project-private provider rồi PATH fallback.

Phase 5.5B compatibility hard gate đã verify `csharp-ls` 0.27.0,
`vscode-languageserver-protocol` 3.18.3 và `vscode-jsonrpc` 9.0.2, gồm corrective
workspace-readiness preflight. Packaged/installed `csharp-ls` acceptance vẫn
thuộc Phase 7; Phase 5.5B không tự authorize bắt đầu 5.5C.

---

### Phase 6 — Settings & UX

Hoàn thiện:

* Theme.
* Editor settings.
* Auto Save.
* User-facing Recent Projects UX và management, dựa trên metadata foundation của
  ProjectService.
* Keyboard shortcuts.
* Runtime path configuration nếu cần; configured C# language-service path vẫn
  deferred và `NOT_CONFIGURED` được reserve cho future configured-path support.
* Git path nếu cần.
* UX states cho missing dependency và invalid configuration.

---

### Phase 7 — Testing & Stabilization

Quality gate bắt buộc:

```text
Build PASS
Typecheck PASS
Lint PASS
Critical unit tests PASS
Integration tests PASS
Windows packaging PASS
Installer smoke test PASS
```

Không yêu cầu coverage percentage cao trong V1. Test phải ưu tiên:

* File operations.
* Project state và unsaved changes protection.
* Terminal.
* Run process lifecycle và Stop Process.
* Process tree cleanup khi Stop hoặc đóng application.
* Git abstraction và Git dependency detection.
* Current Monaco provider/worker lifecycle, availability và failure handling.
* C# language-server lifecycle và cleanup đã implement qua Phase 5.5; Phase 7
  chịu trách nhiệm packaged/installed verification.
* Missing runtime.
* Settings persistence.
* Problems navigation.
* Project lớn và UI responsiveness.
* Windows packaging và installer smoke test.

---

### Phase 9 — Learning / Programming Techniques

Status: Phase 9 `IN_PROGRESS`; 9A–9C COMPLETE. Ngày 2026-10-23, người dùng nghiệm
thu 9D Common, 9D.1, 9D.2 và toàn bộ 9D **COMPLETE — PASS WITH LIMITATIONS**;
A01/A02/A03 FIXED — PASS. 9E–9G vẫn NOT_STARTED, cần phê duyệt riêng.
[Final Review 9D](PHASE-9D-FINAL-REVIEW.md) ghi evidence và giới hạn đã chấp nhận;
Windows 10/UNC/9G và các mục UNVERIFIED không trở thành PASS, full lint vẫn FAIL
1.106 lỗi lịch sử. Không thay đổi yêu cầu hay quyết định Phase 1–8/ADR-025.
Các ghi chú trạng thái theo từng bước bên dưới được giữ làm lịch sử thực hiện;
trạng thái nghiệm thu hiện hành là dòng tổng hợp này và Implementation Plan.

Learning là application workspace mode riêng bên cạnh Project Mode, chỉ cho môn
Kỹ thuật lập trình; không có chọn/quản lý nhiều môn. Header có Learning cạnh Local AI. Trong Learning,
left Projects sidebar trở thành Learning Roadmap; center trở thành Learning
Workspace; right Explorer/Search/Git sidebar và Project bottom panels bị ẩn.
Không tạo sidebar mới, close/switch project, mất editor buffer/tab/Monaco model
hoặc restart terminal. Hai mode có state riêng và tiếp tục được vị trí/trạng thái
đang làm việc trước đó khi chuyển lại.

Nội dung local data-driven tách khỏi React, theo đúng 8 chương cố định:

1. Giới thiệu môn Kỹ thuật lập trình
2. Kiến thức lập trình cơ bản
3. Cấu trúc rẽ nhánh
4. Cấu trúc lặp
5. Kỹ thuật xử lý chuỗi
6. Hàm
7. Kỹ thuật xử lý mảng một chiều
8. Kỹ thuật xử lý mảng hai chiều

Không thêm chương 9/10. Mỗi chương có Lý thuyết, Luyện tập và Trắc nghiệm theo
nội dung phù hợp; Chương 1 chủ yếu giới thiệu, không bắt buộc bài tập/trắc nghiệm.
Lý thuyết/trắc nghiệm tham khảo Internet có chọn lọc và biên soạn, lưu cục bộ để
học offline; ghi nguồn, tuân thủ giấy phép/bản quyền. Không tự động scraping hoặc
sao chép hàng loạt nội dung có bản quyền. Nhiệm vụ thiết kế này không xây CMS hay
nhập nội dung thực tế.

Bài tập tổ chức theo chương, không theo topic/tag như LeetCode; độ khó **Easy,
Medium, Hard**. Bài toán tham khảo LeetCode phải có quyền sử dụng phù hợp hoặc
được biên soạn lại hợp lệ, có ghi nguồn. V1 chỉ có **C# và JavaScript**.
Exercise Workspace gồm Description, Code Editor, Test Cases, Run Result,
Submission Result và Submission History (Accepted + failed graded submissions).
Generalize My Solutions thành Submission History đã APPROVED theo H5. Sinh viên viết trong hàm
mẫu, không tự viết Main() hoặc chương trình Console hoàn chỉnh. Mỗi bài định nghĩa
hàm, tham số, kiểu trả về, starter code và test case phù hợp từng ngôn ngữ.
Reuse Monaco foundation, nhưng Exercise Document/session độc lập Project Document;
không tự ghi code vào project/Explorer. Code Draft tự lưu riêng theo bài/ngôn ngữ;
C# → JavaScript → C# không mất bản nháp trước đó.

Phase 9E Run chỉ thử public samples và so sánh kết quả bằng code hiện tại;
custom Run deferred, cần phê duyệt riêng. Phạm vi triển khai 9D.1 được
duyệt ngày 2026-10-20 chỉ thực thi samples do Main catalogue chọn và trả actual
output; chưa comparison/custom cases. Comparison, Submit và lưu kết quả thuộc 9E.
Exercise Runtime tự chuẩn bị
function-signature test harness/driver, gọi hàm, biên dịch nếu cần và chạy ngầm;
sinh viên không tạo project, mở Terminal hay chạy lệnh compiler. Hiển thị Input,
Expected Output, Actual Output, Passed/Failed và lỗi phù hợp. Run không tạo
Accepted Solution và không đánh dấu hoàn thành bài tập.

Làm rõ giao diện 9D/9E theo xác nhận người dùng ngày 2026-10-19: sinh viên chỉ
thao tác Run và Submit; không có nút Stop hoặc Cancel trong Learning Practice.
Run thực thi test mẫu và hiển thị kết quả; Submit chấm bộ test chính thức và lưu
lịch sử graded submissions theo quy tắc persistence bên dưới; chỉ Accepted đã
lưu thành công mới tạo completion.
Stop/cancellation trong 9D chỉ là cơ chế nội bộ cho timeout, resource limit,
chuyển bài/ngôn ngữ, rời Learning, đóng IDE và cleanup. Có thể giữ stop() trong
contract lifecycle nội bộ nhưng không tạo điều khiển UI tương ứng. Việc ngắt
Exercise không được ảnh hưởng Project Mode hoặc Terminal. Ngày 2026-10-20 người
dùng duyệt Policy B và giới hạn Common trong ADR-025: prepare 10s, compile 30s/
2 GiB, execute 2s/case gồm startup/512 MiB, operation 60s monotonic xuyên các phase,
cleanup wait 12s/lần giữ ownership/tác vụ I/O pending, một operation không queue,
output gộp stdout/stderr 1 MiB UTF-8. Bước đầu chỉ triển khai shared contracts,
validators và tests; không tự triển khai UI, service hoặc các adapter.

Submit chấm bộ test chính thức gồm công khai và ẩn. Kết quả: Accepted, Wrong
Answer, Compilation Error, Runtime Error, Time Limit Exceeded; phân biệt riêng
lỗi nội bộ Judge. Chỉ vượt **100% test case** mới Accepted. Amendment đã APPROVED:
lưu immutable source-at-Submit cùng verdict hợp lệ: Accepted, Wrong Answer,
Compilation/Syntax Error, Runtime Error, TLE, MLE và OLE. Infrastructure/Protocol
Failure, Cancelled/Invalidated hoặc verdict chưa đáng tin không mặc định là failed
graded history. Run không tạo lịch sử. Được Submit lại; lần thất
bại sau không xóa trạng thái hoàn thành đã có. Không đưa toàn bộ hidden input/output
vào UI/DTO, nhưng test ẩn offline không có bảo mật tuyệt đối.

Dữ liệu Learning ở thư mục riêng dưới Electron userData, không ở thư mục cài đặt
hoặc Project Explorer. Định hướng JSON có phiên bản, Main-owned, ghi an toàn,
migration/backup/recovery; tận dụng PersistenceService nếu phù hợp. Code Draft
tự lưu để tiếp tục làm bài. Accepted Solution chỉ lưu khi Submit Accepted và ghi
thành công: giữ bản sao code tại thời điểm Submit, mã bài, ngôn ngữ, thời gian,
kết quả và thông tin bộ test cần thiết. Giữ nhiều phiên bản, không ghi đè bản cũ.
Submission History chỉ đọc Main-owned persisted records, có All/Accepted/Failed,
verdict/ngôn ngữ/thời điểm Submit, xem code và Restore có xác nhận; không tự ghi đè
draft đang sửa. Deliberate re-submit cùng code tạo version mới; internal retry
cùng submissionId không duplicate. Không tự xóa/ghi đè versions cũ. Chỉ xác nhận mới hoàn
thành sau khi ghi thành công; lỗi ghi phải báo riêng với kết quả Judge Accepted,
không báo thành công giả. Hoàn thành từ bản đã lưu trước đó vẫn giữ nguyên.
Judge verdict, storage pending/saved/failed/unknown và completion là ba trạng thái
riêng: chỉ Accepted đã verified commit tạo completion; failed history không bao giờ
là bằng chứng hoàn thành. WA/save-failed vẫn là WA với history chưa lưu, không phải
Infrastructure verdict giả. Hidden values/console/stack/private Judge evidence
không được ghi vào bất kỳ submission record nào.

H1–H5 đã APPROVED: Accepted Storage giữ nguyên9E-0, Failed dùng riêng
`userData/learning/failed-submissions.json`32MiB/record2MiB/metadata16KiB,
warnings24/28MiB, caller/shutdown wait10s và slow notice3s với retained I/O.
Một Submit route đúng một target dưới shared store lease; eligible failed grade
chỉ persist sau VERIFIED complete cleanup, kể cả trusted compile/syntax error
chưa chạy case. History có bounded pagination/partial availability, version info
và confirmed Restore; only committed Accepted tạo completion.
Xem [Approved H1–H5](PHASE-9E-JUDGE-SUBMIT-DESIGN.md#16-approved-h1h5--submission-history).
Failed store đầy không tự chặn Run/Submit khi I/O/ownership đã settle và existing
guards cho phép; không bỏ qua unresolved retained I/O/lease để admit operation mới.
Không nới Runtime/Core/Policy B hoặc tự xóa history. Package asset/parser decisions
**9E1-L1–L12 APPROVED** theo toàn bộ giới hạn và semantics trong
[specification đã duyệt](PHASE-9E1-PACKAGE-ASSET-PARSER-LIMITS-REVIEW.md) và
[ADR-025 amendment](DECISIONS.md#phase-9e-1--package-limits-approved-2026-10-23).
Manifest≤4MiB/4,096 packages; metadata256KiB, samples512KiB, Judge4MiB,
starter64KiB/ngôn ngữ; package6MiB, full profile exactly5 assets; registry256MiB logical bytes.
S4-D1/D2 APPROVED: version2 public-only staging profile có4 public assets và
official:null; full version1/explicit full profile vẫn bắt buộc5 assets và fail-closed.
Public ownership trong cùng Registry/reader/ledger; official acquisition chỉ ở owned
Prepare. Không có Judge data giả hoặc tự downgrade full package khi lỗi.
Main phải bounded-read/strict UTF-8/pre-scan trước JSON.parse, exact-schema/typed
validation, verify raw lengths/SHA-256/trusted manifest digest, fail closed và
không thực thi package code. Parser/field/value/envelope/cache ceilings chi tiết
L4–L11 đều bắt buộc; không chỉ kiểm tra kích thước sau parse. Public projection
tách hidden data; global registry faults và local package faults phân biệt,
không xóa drafts/history/completion khi bài không khả dụng.
Public samples≤16/official cases≤128 là technical ceilings, không phải default
test count; coverage-first và Runtime60s/2s cùng mọi quota/barrier giữ nguyên.
Thêm bài64/65 bằng package data và regenerated manifest, không sửa Generic Judge
theo exercise ID. 9E-0 COMPLETE; Steps1/2 đã nghiệm thu COMPLETE — PASS WITH
LIMITATIONS. Phase9E vẫn IN_PROGRESS; Step3 đã triển khai theo S3-D1–D4 APPROVED,
COMPLETE — PASS WITH LIMITATIONS, đã được người dùng nghiệm thu. Step4 đã được phép
và đã triển khai theo S4-D1/D2 APPROVED; Steps1–4 COMPLETE — PASS WITH LIMITATIONS,
đã được người dùng nghiệm thu; **Phase9E-1 COMPLETE — PASS WITH LIMITATIONS**
theo nghiệm thu tổng thể9E1-AC1 ngày2026-10-24,
Step5 COMPLETE — PASS WITH LIMITATIONS (Current Host Only), người dùng nghiệm thu
theo điều chỉnh phạm vi S5-AC1 ngày2026-10-24; không phải full target-matrix PASS.
Hai loader target hosts Windows10 x64/2 physical cores/8GiB/SSD và Windows11
x64/≥4 physical cores/16GiB/SSD giữ UNVERIFIED, bắt buộc hoàn thành trước nghiệm
thu9E-7/release certification. Không hạ stall p95≤50ms/max≤100ms hoặc ceilings;
không đổi security/Runtime/S5-P2 A/B2/C. Giữ historical Prepare reliability,
full-app attribution và file-symlink/UNC/opaque reparse/installed-offline limits;
R1 prototype **NOT PASS — excluded from production**, tuyệt đối không đưa vào
production. Phase9E-1 đã COMPLETE — PASS WITH LIMITATIONS;
Tại closure9E-1,9E-2 còn NOT_STARTED. Authorization tiếp theo đã duyệt design/
E2-D1–D5 và chỉ mở E2-S1: 9E-2 IN_PROGRESS, S1 COMPLETE — PASS sau approval
riêng M1=A và closure verification; S2 COMPLETE — PASS WITH LIMITATIONS đã được
user nghiệm thu. S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — ACCEPT WITH LIMITATIONS; S5 COMPLETE — PASS WITH LIMITATIONS; S6 Wave A IN_PROGRESS (delivered/pending user acceptance); B–D/S7 NOT_STARTED. Không đổi requirements/Runtime; S5 chỉ promote9 pilot assets đã duyệt.
Xem [Step5 closure](PHASE-9E1-STEP5-FOUNDATION-ACCEPTANCE.md#15-approved-step5-closure--current-host-only),
[Step4 evidence](PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md) và
[Step3 evidence](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md).
Runtime và dữ liệu drafts hiện có được giữ nguyên; Step4 chỉ migration public
catalogue/IPC và binding sample plans theo các quyết định đã phê duyệt.
S2-R1–R4 đã APPROVED: deterministic external resource roots, no fallback, canonical
containment/link/identity checks with documented Node TOCTOU limitations, compiled
Main manifest anchor/raw SHA-256/canonical signature v1 and explicit empty bootstrap.
Missing/corrupt declared assets fail build; bootstrap is not Official Test readiness.
See [Step2 contract](PHASE-9E1-STEP2-RESOURCE-INTEGRITY-ASSETS.md#2-approved-contract-selections).
S3-D1–D4 APPROVED theo [contract Step3](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md#2-approved-precise-contracts):
reservation trước allocation/parse, accounting aliases/copies/raw overlap; owner
single-flight/lease/BUSY/eviction/retry; capability readiness và startup/shutdown
giữ unsettled I/O. Không suy diễn resource VALID thành Public Run/Judge/release READY.
Approval ceilings không tự tạo acceptance PASS. Current-host loader latency/
RSS/GC/startup/stall đã có scoped evidence được nghiệm thu trong Step5/S5-AC1;
hai reference hosts vẫn UNVERIFIED, bắt buộc trước9E-7/release certification.
Windows/installed/offline limitations giữ nguyên; không blanket-certify các
target/release metrics từ measurements hiện tại.
Chốt thiết kế 9E-0 ngày 2026-10-23: sáu quyết định kiến trúc và mười quyết định
9E0-A1–9E0-C3 đã APPROVED trong [ADR-025](DECISIONS.md#phase-9e-0--approved-judge-and-submit-decisions-2026-10-23).
Exercise Package độc lập/stable ID, registry mở rộng bằng dữ liệu; sửa samples
ProductExceptSelf đúng constraints; `exact-typed@1` cho sáu kiểu và private C#
Submit protocol evidence giữ Run compatibility. Official tests được biên soạn,
independently verified và frozen ở development time, không fixed số case;
public samples xuất hiện đúng một lần ở official public prefix. Main chỉ trả
aggregate counts/coarse stages/safe verdict/status cho Submit; không hidden
values, console, diagnostics hoặc case-level metadata qua IPC/UI.

Accepted storage đã duyệt snapshot64 MiB/record2 MiB/metadata16 KiB, warning48/56 MiB,
không cap versions/bài ngoài byte capacity và không tự xóa/truncate/ghi đè versions;
disk reserve≥2×candidate bytes+16 MiB, safe legacy over-capacity recovery/read-only.
Read API có pagination/chunk bounds; commit caller wait15s riêng với retained I/O,
store-wide lease, idempotency và verified committed completion. Chi tiết giới hạn,
cancellation/shutdown/recovery và coverage/performance targets trong
[đặc tả A/B/C](PHASE-9E0-REMAINING-DECISIONS.md). Các performance targets đã duyệt
nhưng **NOT MEASURED**, acceptance thiếu evidence là **UNVERIFIED**, không phải PASS.
Nếu gate không đạt phải báo evidence/đề xuất và chờ duyệt; không tự đổi capacity,
architecture hoặc runtime quota. Runtime/Core/native/Policy B giữ nguyên.

9E-0 **COMPLETE** chỉ cho thiết kế/tài liệu; Phase 9E implementation và9E-1 vẫn
**NOT_STARTED**, chưa được cấp quyền coding. Tiến độ bài tập: Chưa làm, Đang làm,
Hoàn thành; dự kiến lưu vị trí học gần nhất,
tiến độ chương và kết quả trắc nghiệm. Schema/lịch tự lưu/quy tắc tổng hợp còn mở.

Quyết định runtime 9D được người dùng chốt ngày 2026-10-19: trước mắt Learning
chỉ sử dụng .NET SDK và Node.js phù hợp đã cài trên máy; không tải, cài thêm hoặc
triển khai bundled runtime trong 9D. Learning dùng resolver, harness và execution
session riêng, có thể dùng chung executable hiện hữu. Thiếu runtime phù hợp phải
báo lỗi rõ ràng, không tự cài hoặc chuyển sang phiên bản chưa được duyệt.
Project Mode phải giữ nguyên: không sửa runtime selection, PATH, global.json,
RunService, ProcessManager, Terminal, Editor, Explorer hoặc native adapter hiện tại.
Mọi sửa đổi điểm khởi tạo/tích hợp dùng chung và quyết định kỹ thuật mới phải được
trình người dùng xác nhận trước khi triển khai.
Yêu cầu phân phối SDK/công cụ biên dịch (không chỉ .NET Runtime) và Node.js để
không cần sinh viên tự cài vẫn giữ cho giai đoạn đóng gói; cách tích hợp vào bộ cài
sẽ được thảo luận và quyết định riêng, không được coi là đã chọn hoặc đã nghiệm thu.
Exercise Runtime độc lập Project Run, chỉ reuse internal primitives phù hợp,
không trộn session/vòng đời. Main điều phối qua typed Preload/validated IPC và
child processes được kiểm soát; không chạy code sinh viên trực tiếp trong Main
hoặc Renderer. Phải chạy offline, giới hạn thời gian/tài nguyên, có Stop, xử lý
lỗi và dọn file tạm/process tree. Thư mục tạm không đồng nghĩa OS sandbox.

Dự phòng khi quá lớn hoặc có trở ngại kỹ thuật: gói runtime bổ sung hoặc runtime
có sẵn trên máy, kèm phát hiện/hướng dẫn rõ ràng. Phiên bản, kích thước bộ cài,
ngưỡng fallback khi đóng gói còn Open Decision / Pending Verification trong
ADR-025. Kiến trúc JavaScript đã được duyệt ngày 2026-10-22 như dưới đây;
triển khai và nghiệm thu còn chờ. Protocol C# đã định nghĩa ở 9D.1 Bước 1; 9D.1 đã được
người dùng nghiệm thu COMPLETE — PASS WITH LIMITATIONS ngày 2026-10-21 trong
phạm vi installed-runtime Windows 11. Runtime Learning đã duyệt stable SDK 10.x
và Node 24.x, không khóa patch; 9D Common vẫn IN_PROGRESS, không đổi policy/giới hạn.
Nghiệm thu bản đóng gói trên máy Windows khác
không cài môi trường lập trình, gồm Run/Submit C# và JavaScript offline; không lấy
môi trường dev của máy build thay cho bằng chứng này.

Phê duyệt thiết kế 9D.2 ngày 2026-10-22: mỗi sample catalogue do Main chọn chạy
trong Node process/ Learning Windows Job riêng, harness cố định + `node:vm` tách
context; không cam kết security sandbox chống malicious code, hạn chế file/network
hay chống giả mạo kết quả tuyệt đối. Learning tự xác minh stable Node 24.x từ PATH,
không khóa patch/fallback major/tự tải/dùng Project resolver; junction/nvm chỉ khi
xác minh an toàn. Probe phải thuộc Learning Job trong Prepare, quota 512 MiB,
không vượt tổng Prepare 10s. Giữ nguyên Policy B, các quota/deadline khác,
cancellation, barrier, ownership, cleanup/recovery và isolation.
Harness chỉ hỗ trợ hàm đồng bộ và sáu kiểu hiện có; chưa imports/npm/async.
JSON stdin/stdout kiểm tra nghiêm ngặt; tách syntax error, runtime error và
protocol failure. DTO kết quả JavaScript riêng, reuse Exercise IPC channels và
Result Panel, không đổi hợp đồng C#. Chỉ trả actual samples, chưa Judge/comparison,
Submit hay Accepted/Wrong Answer. Bundling Node thuộc 9G; 9D.2 chỉ runtime cài sẵn
để phát triển/kiểm thử. [Kế hoạch sáu bước](PHASE-9D2-JAVASCRIPT-PLAN.md) có phạm vi,
tiêu chí nghiệm thu, targeted tests và bằng chứng Windows 10/11 cần bổ sung.
Step 1 được cấp phép riêng ngày 2026-10-22: DTO/strict protocol validators và
Main-only ports đã triển khai, 308 targeted contract tests PASS; chưa runtime/IPC.
[Bằng chứng Step 1](PHASE-9D2-JAVASCRIPT-CONTRACTS.md) ghi giới hạn full-repo lint.
Step 1 COMPLETE — PASS WITH LIMITATIONS theo nghiệm thu ngày 2026-10-22;
1.106 lỗi lint có sẵn ngoài phạm vi được chấp nhận là giới hạn. 9D.2 và 9D Common
giữ IN_PROGRESS. Step 2 COMPLETE — PASS WITH LIMITATIONS theo nghiệm thu ngày
2026-10-22: resolver/owned Prepare probe đã kiểm chứng trên Windows 11 x64 với
Node v24.16.0, 169 targeted tests PASS gồm 10 Jobs probe thật và một C# Sum
regression thật. [Bằng chứng/giới hạn Step 2](PHASE-9D2-NODE-RESOLVER-PROBE.md).
Step 3 được cấp phép và nghiệm thu riêng ngày 2026-10-22: COMPLETE — PASS WITH LIMITATIONS; fixed
harness/vm context, exclusive identity/hash-verified workspace, syntax chỉ parse
không chạy top-level và Main-internal sample index 0 đã kiểm chứng; 259 targeted
tests PASS gồm 60 native cases / 172 Jobs VERIFIED trên Windows 11 / Node v24.16.0
x64. [Bằng chứng/giới hạn Step 3](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md).
Step 4 được nghiệm thu ngày 2026-10-23: COMPLETE — PASS WITH LIMITATIONS; đã triển
khai Main-internal multi-case adapter/orchestrator, VERIFIED barriers và fail-fast
đúng prefix/suffix. 160 targeted tests PASS, gồm 16 native cases / 57 JavaScript
Jobs cleanup VERIFIED, handles đóng và leases giải phóng; một C# multi-case thật PASS.
[Bằng chứng/giới hạn Step 4](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md).
Step 5 COMPLETE — PASS WITH LIMITATIONS theo nghiệm thu ngày 2026-10-23; Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE. Evidence UI/IPC: PHASE-9D2-JAVASCRIPT-UI-IPC.md;
Windows 10/UNC thực tế, concurrent Project Run/PTY smoke hoặc packaging/bundled
Node (9G). Không nâng phạm vi chưa kiểm chứng thành PASS.
Không đổi yêu cầu quota/Policy B/C#.

Roadmap: 9A Learning Mode & Roadmap; 9B Course Content & Lessons; 9C Practice &
Exercise Workspace; 9D Exercise Runtime (C#, JavaScript, function-signature harness);
9E Local Judge & Submit; 9F Quiz & Learning Progress;
9G Learning UX & Stabilization. Trạng thái hiện tại: 9A–9C COMPLETE theo nghiệm
thu; 9D Common IN_PROGRESS qua Core/native/Main lifecycle, typed IPC/Preload và
Renderer integration và evidence thực tế Windows 11. 9D.1 COMPLETE — PASS WITH
LIMITATIONS theo xác nhận người dùng ngày 2026-10-21; đủ điều kiện chuyển sang
9D.2 IN_PROGRESS; Step 1 COMPLETE — PASS WITH LIMITATIONS ngày 2026-10-22,
Step 2 COMPLETE — PASS WITH LIMITATIONS; Step 3 COMPLETE — PASS WITH LIMITATIONS theo nghiệm thu ngày 2026-10-22,
Step 4 COMPLETE — PASS WITH LIMITATIONS ngày 2026-10-23; Step 5 COMPLETE — PASS WITH LIMITATIONS theo nghiệm thu ngày 2026-10-23; Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE. 9E–9G NOT_STARTED;
Windows 10/packaging chưa xác minh. Các mô tả Bước 1–7 sau đây là lịch sử từng bước.
C# dùng Roslyn csc.dll trực tiếp từ installed stable
SDK 10.x, discovery filesystem riêng Learning đã triển khai/kiểm thử đọc file;
Step 3 đã sinh harness/config và compile Roslyn thật trong Learning Job với
reference net10.0 cục bộ; chưa native stdin, chạy assembly/sample hoặc wiring.
Bằng chứng và giới hạn: PHASE-9D1-CSHARP-COMPILER.md. Step 4 bổ sung transport
stdin/EOF UTF-8 có giới hạn riêng Learning, đã kiểm thử với process Windows thật;
chưa chạy assembly/sample C#. Xem PHASE-9D1-NATIVE-STDIN.md.
Step 5 đã kiểm chứng Main-internal chạy sample đầu bằng Roslyn/.NET thật, JSON
stdin/EOF, sáu kiểu dữ liệu, lỗi và Policy B cleanup. Xem
PHASE-9D1-CSHARP-EXECUTION.md. Step 6 triển khai Main-internal compile một lần,
chạy sample catalogue tuần tự trong các Job riêng, fail-fast, barrier VERIFIED
giữa cases và notRunCaseIndices chính xác; giữ deadline/output xuyên operation
và Policy B. Xem PHASE-9D1-CSHARP-MULTICASE.md. Step 7 nối production C# Run
qua ExerciseService → IPC/Preload → Result Panel, đã kiểm chứng Electron thật
trên Windows 11, actuals, diagnostics, lỗi/resource limits, lifecycle và isolation
Project Run/PTY. JavaScript vẫn UNSUPPORTED; Submit disabled, không comparison
hoặc lưu kết quả chấm. Xem PHASE-9D1-CSHARP-UI.md và
[nghiệm thu cuối](PHASE-9D1-FINAL-REVIEW.md). 9D.1 COMPLETE — PASS WITH LIMITATIONS;
9D Common vẫn IN_PROGRESS. Run C# khoảng 7–8 giây được chấp nhận tạm, tối ưu sau
khi hoàn thành Phase 9. Windows 10/packaging chưa xác minh; Restore với production
Accepted records chờ Phase 9E. Không nâng các phạm vi này thành PASS.
Scope, dependencies và
exit gates: Implementation Plan Section 13.6; ownership: Architecture Section 6.
Roadmap này không mở rộng Project Run/language intelligence hiện tại; Python và
Java ngoài Phase 9 V1. Giữ nguyên quyết định/nghiệm thu Phase 2–8, 5.5 và C# Project Run.

Không yêu cầu account/backend/cloud hoặc AI. Local AI giữ scope/configuration
Phase 8, có thể mở overlay tạm trong Learning mà không hiện lại Project Tools;
đóng AI quay về Learning Workspace. AI Tutor, exercise-aware AI, automatic code
context và Agent/tools ngoài foundation. `NOT_STARTED` cho toàn Phase9 là trạng
thái ở roadmap ban đầu; current status theo Implementation Plan Section13.6,
gồm9E-1 COMPLETE — PASS WITH LIMITATIONS. Sau approval design/E2-D1–D5,
9E-2 IN_PROGRESS chỉ trong scope E2-S1; E2-S1 COMPLETE — PASS sau approval riêng
M1=A (Unique Returned String); E2-S2 COMPLETE — PASS WITH LIMITATIONS đã nghiệm thu;
S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — ACCEPT WITH LIMITATIONS; S5 COMPLETE — PASS WITH LIMITATIONS; S6 Wave A IN_PROGRESS (delivered/pending user acceptance); B–D/S7 NOT_STARTED. Xem
[S1 evidence](PHASE-9E2-S1-SEMANTIC-PILOT-SPECIFICATION.md). Đây là status update,
không thay đổi requirements/contracts hoặc tự giải quyết semantics.

---

## 22. Các phase tương lai

Các chức năng có thể xem xét sau khi core IDE hoàn thành:

### Phase Future — Formatter

Có thể bổ sung:

* Format Document.
* Format Selection.
* Format on Save.
* Chọn formatter mặc định theo ngôn ngữ.

### Phase Future — Debugger

Có thể bổ sung dựa trên Debug Adapter Protocol hoặc cơ chế tương đương:

* Debug configuration theo project.
* Breakpoint.
* Continue, Pause và Restart.
* Step Over, Step Into và Step Out.
* Variables.
* Call Stack.
* Debug Console.

### Phase Future — AI Tutor

AI chỉ:

* Giải thích code.
* Giải thích lỗi.
* Gợi ý hướng xử lý.

Không tự sửa nếu chưa được phép.

### Phase Future — Coding Agent

Có thể tích hợp:

* Codex.
* Claude Code.
* Gemini.
* Grok.
* OpenCode.

### Learning đã được đưa vào roadmap Phase 9

Learning Mode, exercises, test cases và learning progress thuộc roadmap chính
thức Phase 9 tại Section 21; không còn là nhóm feature future chưa xác định.
Project templates vẫn deferred, không thuộc Phase 9 foundation.

---

## 23. Git Workflow

Sử dụng:

```text
main
 ↑
develop
 ↑
feature/*
```

Ví dụ:

```text
feature/project-manager
feature/run-code
feature/output-panel
feature/git-history
feature/settings
```

Không development trực tiếp trên `main`.

Git workflow của Student Coding IDE không có upstream Orca vì Orca chỉ là
Reference Implementation. Nếu cập nhật Orca Reference Commit sau này, đó là một
research activity riêng và không được merge source Orca vào Student Coding IDE.

---

## 24. Commit Convention

Sử dụng Conventional Commits.

Ví dụ:

```text
feat: add run code action
fix: stop running process correctly
refactor: extract project service
docs: document terminal architecture
test: add project manager tests
```

---

## 25. Documentation

Dự án cần duy trì:

```text
docs/
├── REQUIREMENT.md
├── REFERENCE-BASELINE.md
├── ORCA-ANALYSIS.md
├── ARCHITECTURE.md
├── CODEBASE-MAP.md
├── IMPLEMENTATION-PLAN.md
├── LANGUAGE-SUPPORT.md
├── DECISIONS.md
└── CHANGELOG-THESIS.md
```

Convention ngôn ngữ: `REQUIREMENT.md` được duy trì chủ yếu bằng tiếng Việt; các
tài liệu technical architecture và reference được duy trì bằng tiếng Anh.

### REFERENCE-BASELINE.md

Ghi lại:

* Orca reference repository.
* Reference branch.
* Reference Commit SHA.
* Các feature Orca đã khảo sát.
* Những architectural patterns được tham khảo.
* Những phần không sử dụng.

File này không mô tả Orca như source baseline trực tiếp của Student Coding IDE.

### ORCA-ANALYSIS.md

Ghi lại source analysis, evidence, classification, risk và implication từ Orca
Reference cho Student Coding IDE. Evidence trong file phản ánh analysis đã được
verify ở Phase 1; các consistency update sau đó không mặc định re-verify Orca.

### ARCHITECTURE.md

Mô tả kiến trúc Student Coding IDE và các security/module boundary.

### CODEBASE-MAP.md

Mapping:

```text
Feature
→ Student Coding IDE module
→ Directory
→ Important files
```

Map này phải phản ánh independent source implementation của Student Coding IDE.
Reference mapping của Orca, nếu cần, phải nằm trong phần riêng và không được trộn
với codebase map của project.

### IMPLEMENTATION-PLAN.md

Execution roadmap gồm work-package dependencies, decision gates, test strategy
và phase exit criteria. File này không thay thế requirement hoặc architecture và
không tự cho phép bắt đầu implementation.

### LANGUAGE-SUPPORT.md

Ghi capability matrix ít nhất gồm:

```text
Language
Editor support
Language service
Runtime
Run support
Diagnostics
Completion
Status
```

Matrix phải bao phủ JavaScript, TypeScript, HTML, CSS, JSON, C#, PHP và ghi rõ
Python/Java là deferred future support. Mọi `TBD` thuộc current Phase 3 scope phải
được chốt trước khi implement Language Intelligence; provider selection cho
ngôn ngữ deferred chỉ được chốt khi future scope tương ứng được authorize.

Matrix khởi tạo có thể dùng cấu trúc:

| Language | Editor | Language service | Runtime | Run | Diagnostics | Completion | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| JavaScript | Monaco | Monaco-native worker | Node.js | V1 | V1 | V1 | Current Phase 3 V1 |
| TypeScript | Monaco | Monaco-native worker | Deferred; no V1 runtime selected | Deferred | V1 | V1 | Phase 3 intelligence supported; future Run gate ADR-014 |
| HTML | Monaco | Monaco-native worker | N/A | No | Deferred | V1 | Current V1 syntax/completion/conditional hover; diagnostics deferred |
| CSS | Monaco | Monaco-native worker | N/A | No | V1 | V1 | Current Phase 3 V1 |
| JSON | Monaco | Monaco-native worker | N/A | No | V1 | V1 | Current Phase 3 V1 |
| C# | Monaco | Main-owned `csharp-ls` after Phase 5.5B PASS | Deferred | Deferred | Phase 5.5 V1 | Phase 5.5 V1 | Phase 3 syntax-only complete; Phase 5.5 intelligence newly authorized |
| PHP | Monaco | None in Phase 3 V1 | Future | Future | Future | Future | Syntax only |
| Python | Incidental Monaco recognition only | Deferred | Deferred | Deferred | Deferred | Deferred | Future language/run phase; outside V1 |
| Java | Incidental Monaco recognition only | Deferred | Future | Future | Deferred | Deferred | Future language-support phase |

### DECISIONS.md

Ghi decision log hoặc ADR-style record cho các quyết định quan trọng, bao gồm:

* electron-vite build and development tool.
* IPC architecture.
* Terminal implementation.
* Language servers.
* TypeScript run strategy.
* Git implementation.
* Local persistence.
* Process management.

### CHANGELOG-THESIS.md

Chỉ ghi những feature và thay đổi quan trọng do independent implementation của
Student Coding IDE tạo ra.

---

## 26. Definition of Done

Một feature được xem là hoàn thành khi:

1. Đáp ứng requirement.
2. Không phá chức năng hiện có.
3. Build thành công.
4. Typecheck và lint thành công.
5. Không có lỗi runtime nghiêm trọng.
6. Critical unit test và integration test liên quan đều pass.
7. Đã commit vào feature branch.
8. Documentation được cập nhật nếu cần.

Đối với các ngôn ngữ thuộc current Phase 3 V1 scope, language intelligence chỉ
được xem là hoàn thành khi:

1. Monaco provider/worker khởi tạo đúng.
2. Provider subscriptions, synchronized sources và diagnostics được dispose đúng.
3. Provider disposal và reinitialization/recovery hoạt động khi Monaco worker
   tương ứng hỗ trợ tự nhiên; không yêu cầu manual restart UX.
4. Completion hoạt động.
5. Hover hoạt động cho Tier 1 và hoạt động cho Tier 2 nếu language service hỗ trợ.
6. Signature Help hoạt động cho Tier 1.
7. Go to Definition hoạt động cho Tier 1.
8. Diagnostics hoạt động cho JavaScript, TypeScript, CSS và JSON. HTML
   diagnostics được defer vì current Monaco provider không có validation support.
9. Problems panel hiển thị đúng cho diagnostics của JavaScript, TypeScript, CSS
   và JSON; HTML không contribute diagnostics trong current V1.
10. Chọn một Problem chuyển đúng đến file và dòng tương ứng.
11. Editor vẫn edit và save được trong mọi provider failure/status state áp dụng
    cho current Monaco providers.
12. Language service không block UI.
13. Lỗi language service của một ngôn ngữ không làm hỏng ngôn ngữ khác.
14. Missing provider resource hoặc invalid configuration không fail silent.

Đối với C# Phase 5.5, completion chỉ được xem là hoàn thành sau khi 5.5B hard gate
PASS và toàn bộ 5.5C–5.5H exit gates pass, bao gồm project/solution selection,
dirty incremental synchronization, semantic capability mapping, open-document
pull diagnostics, Problems integration, stale-result rejection, crash/shutdown
cleanup và Windows path/Unicode verification. Packaged/installed acceptance chỉ
được hoàn tất trong Phase 7.

---

## 27. Mục tiêu phiên bản đầu tiên

Phiên bản đầu được xem là đạt yêu cầu khi người dùng có thể thực hiện workflow:

```text
Mở IDE
   ↓
Mở/Tạo project
   ↓
Tạo file
   ↓
Viết code
   ↓
Nhận IntelliSense
   ↓
Xem Diagnostics/Problems
   ↓
Save
   ↓
Run
   ↓
Xem Output/Error
   ↓
Sửa code
   ↓
Commit Git
```

Toàn bộ workflow trên phải hoạt động **không cần AI Agent**.

Nếu runtime, language service hoặc Git bị thiếu hay cấu hình không hợp lệ, IDE
phải báo rõ trạng thái và action phù hợp thay vì để workflow âm thầm hỏng.

---

## 28. Nguyên tắc quan trọng của đồ án

Orca là open-source Reference Implementation được sử dụng để nghiên cứu kiến
trúc, behavior, UX và cách giải quyết technical problem. Student Coding IDE là
independent Electron + React + TypeScript implementation trong repository riêng.

Đồ án phải phân biệt rõ:

```text
Orca Reference
vs
Student Coding IDE Implementation
```

Project không claim toàn bộ concept IDE là tự phát minh. Những ý tưởng hoặc
architectural pattern tham khảo từ Orca phải được document rõ khi cần. Source
Orca không được coi là phần tự phát triển, và Student Coding IDE không được mô tả
như một bản skin hoặc rename của Orca.

Phần đóng góp của đồ án phải được ghi nhận rõ thông qua:

* Requirements.
* Architecture.
* Design decisions.
* Independent source implementation.
* Git history và feature branches.
* Tests.
* Documentation và change log.
* Feature behavior.
* UX adaptations.


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
