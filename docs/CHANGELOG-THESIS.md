# Student Coding IDE Thesis Changelog

## 2026-11-15 — Project chat composer shows the model and an add-file icon

The Project chat heading is now CHAT. The beUI Prompt Input shows a paperclip
for adding a file and the name gemini-3.1-flash-lite beside the Gemini mark.
The model stays the existing one. The paperclip does not attach a file yet.
Main file writes are unchanged.

Project chat panel tests PASS (12). Renderer and Node typecheck and scoped
ESLint PASS. No live Gemini call. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat shows agent activity on each reply

The Project chat request field stays the existing beUI Prompt Input. Each
agent reply now shows the beUI Agent Activity list above the answer. While
the turn runs, the list says it is working. After the turn, it names files
that were edited or created and deletes or renames that still need
confirmation. The answer, the file diff, and the confirm buttons stay. Main
file writes are unchanged. The activity search row does not open a link. No
new package was added.

90 focused tests PASS. Renderer and Node typecheck and scoped ESLint PASS.
`npm run build` was not run because `electron-vite dev` still has the native
modules open. No live Gemini call. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat file diff keeps long lines scrollable

Long source lines in the Project chat File Diff stay whole and scroll sideways
inside the sidebar. The diff still shows line numbers, additions, and removals,
and the line list still has a vertical cap. The short result, such as
"Updated Program.cs", stays above the diff. Auto-apply is unchanged, and
delete and rename still wait for confirmation. Main file writes are unchanged.

89 focused tests PASS, including a long-line panel check. Renderer and Node
typecheck and scoped ESLint PASS. `npm run build` stopped while linking native
modules because `electron-vite dev` already had those files open (LNK1104).
No live Gemini call. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat applies edits immediately and shows a file diff

The same Project chat now writes an edit or a new file during the turn, after
the existing path, owner, and generation checks. The chat shows a short result,
such as "Updated Program.cs", and a File Diff of the changed lines. It does not
show the full proposed source or Apply / Reject buttons for those changes. A
clean open tab still reloads, and a dirty tab still keeps its buffer and shows
the conflict. Delete and rename still wait for confirmation. A failed create
still removes only the empty file and the parent folders that operation
created. The Learning overlay stays on Ollama. No Shiki package was added.

No live Gemini call was made.

88 focused tests PASS, covering immediate edit and create, the file diff,
delete and rename confirmation, failed-create cleanup, and the existing
credential, Ollama chat, and filesystem checks. The filesystem suite (17) is
included in that count. Renderer and Node typecheck, scoped ESLint,
electron-vite build, and diff check PASS. No live Gemini call, full lint, full
suite, dependency, release, or Git publication. This is not an AG-01 or AG-02
completion.

## 2026-11-15 — Project chat reports Gemini credential and request failures

The same Project chat reads geminiCredential() from Settings on every Gemini
request. A missing or empty key fails closed before a request is sent, with no
fallback key. A rejected key, a quota or rate limit, a network failure, and an
invalid model response each show a fixed message in the chat. The key and the
provider body are not shown or logged. Stop and a project switch still abort
an in-flight turn. The Learning overlay stays on Ollama.

No live Gemini call was made. Manual smoke: enable the existing Settings key,
open a small project that contains no secrets, ask one short question in
Project chat, and record only whether it answered or which alert appeared.
Do not record the key or the prompt.

85 focused tests PASS, covering a missing credential, rejected key, quota,
network failure, invalid response, cancel, and the existing create, move,
delete, and Ollama chat checks. The filesystem suite (17) is included in that
count. Renderer and Node typecheck, scoped ESLint, electron-vite build, and
diff check PASS. No live Gemini call, full lint, full suite, dependency,
release, or Git publication. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat removes folders left by a failed create

The same Project chat now removes only the directories a confirmed create
created when that create fails. Removal runs after the empty-file cleanup,
deepest first, and uses the same non-recursive empty-directory delete already
used for a failed move. Directories that already existed stay. If folder
cleanup fails, the chat shows the original failure and the cleanup failure
together. The parent cap remains eight. The Gemini caller still reads
geminiCredential() from Settings on each request. A scripted loop covers the
failed-create parent cleanup with an injected test credential and no live
network call. The Learning overlay stays on Ollama.

81 focused tests PASS, covering failed-create parent cleanup, path safety, the
scripted Gemini loop, and the existing create, move, delete, and Ollama chat
checks. The filesystem suite (17) is included in that count. Renderer and Node
typecheck, scoped ESLint, electron-vite build, and diff check PASS. No live
Gemini call, full lint, full suite, dependency, release, or Git publication.
This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat removes an empty file left by a failed create

The same Project chat now removes only the empty file a confirmed create made
when the following write fails. Removal stays inside the project and uses the
existing file delete. A file that already existed stays. A created file that
received content stays. If cleanup fails, the chat shows the write failure and
the cleanup failure together. A failed edit, delete, or rename also shows a
clear message, and confirmation is still required before any write. The Gemini
caller still reads geminiCredential() from Settings on each request. A scripted
loop covers the failed-create cleanup with an injected test credential and no
live network call. The Learning overlay stays on Ollama.

76 focused tests PASS, covering failed-create cleanup, path safety, apply
failure messages, the scripted Gemini loop, and the existing move, delete,
create, and Ollama chat checks. The filesystem suite (17) is included in that
count. Renderer and Node typecheck, scoped ESLint, electron-vite build, and
diff check PASS. No live Gemini call, full lint, full suite, dependency,
release, or Git publication. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat removes folders left by a failed move

The same Project chat now removes only the directories a confirmed move created
when that move fails. Removal is best-effort, deepest first, and uses the
existing non-recursive empty-directory delete inside the project. Directories
that already existed are left in place. If cleanup itself fails, the chat
reports that failure together with the move failure. When both the source tab
and the destination tab have unsaved edits, Apply is blocked before any disk
write and the user is asked to save or discard the source first. A clean source
tab is still closed when only the destination tab is dirty. The Gemini caller
still reads geminiCredential() from Settings on each request. A scripted loop
covers the failed-move cleanup with an injected test credential and no live
network call. The Learning overlay stays on Ollama.

70 focused tests PASS, covering failed-move cleanup, dirty-source blocking,
path safety, the scripted Gemini loop, and the existing move, delete, create,
and Ollama chat checks. The filesystem suite (17) is included in that count.
Renderer and Node typecheck, scoped ESLint, electron-vite build, and diff check
PASS. No live Gemini call, full lint, full suite, dependency, release, or Git
publication. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat can move into new folders and delete an empty folder

The same Project chat can now move a file into a folder that does not exist yet.
After confirmation, up to eight missing destination parent directories are
created along that path, one level at a time. A deeper path is rejected before
any directory is created. The same chat can propose deletion of one empty
folder. That removal uses a non-recursive rmdir and is permanent. A non-empty
folder is refused, and deleting a file still uses the recycle bin. When the
destination path is already open, a clean destination tab is closed and the
source tab follows the new path. A dirty destination tab is kept, and the source
tab is closed so it does not stay on the old path. The Gemini caller still uses
the Settings credential. A scripted loop covers the move into a missing parent,
the empty-folder delete, and the confirm gate with an injected test credential
and no live network call. The Learning overlay stays on Ollama.

65 focused tests PASS, covering the missing-parent move, the depth bound,
empty-folder delete, non-empty and path refusal, tab conflicts, explorer
refresh, the Gemini request loop, and the existing create, delete, rename, and
Ollama chat checks. The run-lifecycle suite (16) also PASS after the filesystem
port gained non-recursive rmdir. Renderer and Node typecheck, scoped ESLint,
electron-vite build, and diff check PASS. No live Gemini call, full lint, full
suite, dependency, release, or Git publication. This is not an AG-01 or AG-02
completion.

## 2026-11-15 — Project chat can delete, rename, and create parent folders

The same Project chat can propose deleting one existing file or renaming it,
including a move to another folder. Each change is applied only after that
proposal is confirmed. Delete uses FileSystemService.deleteFile, which trashes
one file and refuses a directory. Rename uses FileSystemService.move and stays
inside the project. The destination parent must already exist. Creating a file
can create up to eight missing parent directories along that path, one level at
a time, and a deeper path is rejected before any directory is created. A clean
open tab closes after delete and follows a rename. A dirty tab keeps its unsaved
buffer. Explorer folders that are already open reload from the existing file
change event. The Gemini caller still uses the Settings credential. A scripted
loop covers delete, rename, and the confirm gate with an injected test
credential and no live network call. The Learning overlay stays on Ollama.

58 focused tests PASS, covering delete, rename, the confirm gate, path
rejection, parent-folder bounds, tab updates, explorer refresh, the Gemini
request loop, and the existing create and Ollama chat checks. The filesystem
suite also PASS. Renderer and Node typecheck, scoped ESLint, electron-vite
build, and diff check PASS. No live Gemini call, full lint, full suite,
dependency, release, or Git publication. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat can create files and confirm several edits

The same Project chat can now propose a new file and up to four file changes in
one turn. Each Apply still writes one file through FileSystemService, and only
after that proposal is confirmed. Create uses the existing create-file and write
paths; the parent directory must already exist. A clean open tab reloads. A dirty
tab keeps its buffer and shows the existing conflict banner. A new file that is
not open is read from disk when its tab is opened. The Gemini caller still borrows
the Settings credential and does not spend Learning quota. A scripted Gemini
response exercises create, edit, and the confirm gate without a live network call
or a stored key. The Learning overlay stays on Ollama.

35 focused tests PASS, covering create, path rejection, per-file confirmation,
chat context, the Gemini request loop, editor refresh, and the Ollama panel.
Renderer and Node typecheck, scoped ESLint, electron-vite build, and diff check
PASS. No live Gemini call, full lint, full suite, dependency, release, or Git
publication. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project chat uses the Gemini agent

The existing Project workspace chat now drives the Gemini project agent. The same
right-sidebar panel stays in place. Project mode calls session, turn, cancel, and
apply. The edit is written only after Apply. A clean open editor tab reloads from
the written text. A dirty open tab keeps its buffer and uses the existing
disk-conflict state. The Learning overlay still uses Ollama and has no file tools.
The separate Project Agent button and panel were removed.

29 focused tests PASS: project-chat confirm, editor refresh, the Ollama panel,
the agent service, the Gemini request shape, contract validation, and the
Project-chat overlay. Renderer and Node typecheck, scoped ESLint, electron-vite
build, and diff check PASS. No live Gemini call, full lint, full suite, dependency,
release, or Git publication. This is not an AG-01 or AG-02 completion.

## 2026-11-15 — Project Agent stage 1

Added a Project-workspace chat that can read one project file, list one directory,
and propose a replacement for one existing file. Main owns the Gemini tool loop,
path checks, owner binding, and the one-use confirm gate. The renderer applies an
edit only after the user chooses Apply. Cancel, owner loss, and a project switch
drop in-flight work and stored proposals. Learning Chat is unchanged. The OpenCode
sidecar remains design-only.

Ten focused agent tests PASS, covering path rejection, the confirm gate, stale
project generation, cancellation, the Gemini request shape, and the Apply button.
Ten preload bridge tests touched by the new API PASS. Renderer and Node typecheck,
scoped ESLint, electron-vite build, and diff check PASS. No live Gemini call,
full suite, dependency, release, or Git publication. This is not an AG-01 or AG-02
completion.

## 2026-11-12 — Practice Problem Description typography

Scoped the exercise article to installed Geist: 21px/600 title, 15px/400 body at
1.7 line height, 16px/600 section headings, 13.5px monospace code and 14px paragraph
spacing. Examples use a subtle Learning-token background and wrap; fenced code
and tables can scroll locally. Reused Markdown/GFM for prose/constraints, preserving
exercise fields, JSON examples, Vietnamese, source details and Learning palettes.
The stateful description tab now mounts a read-only presenter; no editor/runtime/AI
behavior or adjacent panel style changed.

Five focused tests PASS, including eight hidden local Electron theme/resize checks
for loaded fonts, metrics, contrast, complete content and no outer overflow. Scoped
typecheck/ESLint, isolated Renderer build and diff check PASS. Existing build chunk/
Monaco import warnings remain. No desktop capture, live Gemini, full suite/system
smoke, dependency addition, release/Setup edits or Git publication. Stopped here.

## 2026-11-12 — Learning Settings footer and matching dialog colors

Replaced the two decorative bottom-left sidebar lines with the existing Settings
gear in expanded/collapsed Learning Roadmap. The footer stays visible while chapter
navigation scrolls. It opens the App-owned SettingsDialog and shared preferences
save/cancel path; Learning-only semantic color overrides match the dialog and
inputs to the Learning canvas. Project settings behavior and palette remain intact.

21 distinct targeted Learning/Settings cases verified after fixing overly broad
queries in two new timed-out test cases; final three footer tests PASS. Renderer/
scoped test typechecks, changed-file lint, isolated full build and diff check PASS.
Known global Node-check CSS/Explorer fixture and1312 lint errors remain. No app/UI
capture or live Gemini; no backend, dependency, release/Setup or Git publication.

## 2026-11-12 — F6 scoped learning-session AI consent

Added Main-owned RAM-only Quick Action permission bound to learning owner/document,
exercise, language/origin, provider and actual captured source/selection/Run categories.
Remembered equal/narrower scopes survive code/model-version changes; expanded scopes
require explicit approval. Unchecked remember applies once, Cancel sends nothing,
and revoke/end/provider/document/expiry retirement prevents future reuse. Completed
local F4 preparation/consume keeps its independent source/grant guards. Chat unchanged.

Shortened the consent dialog, defaulted the remember checkbox on, moved technical
information under “Chi tiết” and added header revocation without changing Quick
Actions. Strict contracts/IPC/Preload verify opaque references; uncertain revoke
blocks starts pending acknowledgement. No persisted permissions or extra inference.

30 targeted cases PASS (25 F6 +2 F4 +2 F5 +1 Chat), scoped TypeScript/ESLint,
affected Main/Preload bundles, final Renderer build and diff check PASS. No full
suite/system smoke, UI capture, actual-app visual/live Gemini or installer claim.
No new report, dependency/SDK, release/Setup change or Git publication. STOP after F6.

## 2026-11-12 — Fix missing highlights from inaccurate AI offsets

Inspected the running app's completed Suggest Fix cards: both reported invalid
source locations and therefore had no editor markers. Earlier offline fixtures
only exercised correct locations. Recorded the F5 localization decision amendment
and added Main-only unique exact-quote resolution with final UTF-16/CRLF boundary
validation. Existing valid offsets retain priority; ambiguous/missing quotes stay
unlocated. No fuzzy matching/source normalization, edits, grants or extra inference.
Provider instructions prefer short exact unique single-line source quotations.

145 distinct focused cases verified after an isolated rerun of one initial5s
unified-test timeout; latest Main detection35/35 includes missing operands, duplicate
quotes and Unicode/EOL boundaries. Scoped TypeScript/ESLint, full isolated build
and C#/JS offline Electron detection using deliberately wrong provider offsets PASS.
Both mark the correct light-red source line, preserve cleanup/no-bottom layout and
exit cleanly with owned resources zero. Existing full-repository check failures
remain. Updated generated non-native output; the running Main and old invalid
cards require restart/fresh user-consented request. No real Gemini or user draft
change, full suite or packaged-host acceptance claim.

## 2026-11-12 — Suggest Fix inline red error lines, bottom details removed

Applied the user's presentation clarification: removed the bottom Error Details
component/state/click handler and its layout styles. Detection now immediately
highlights affected Code Editor lines light red with a red margin, including
warning-classified AI findings while preserving their actual marker severity.
Explanations stay in native editor marker tooltips. Current-only list navigation,
exact range validation, consent, edit cleanup and selection Fix remain unchanged.

113 focused detection/editor/selection/unified tests, scoped TypeScript/ESLint,
full isolated build and both C#/JS offline Electron smokes PASS. Verified actual
computed red color before clicking, no bottom details after all native click
targets, marker/decorations cleanup and clean OS exits with drained owned resources.
Both screenshots visually reviewed. Existing repository typecheck/lint failures
remain; no live Gemini, full suite or packaged-host acceptance claim.

## 2026-11-12 — Suggest Fix error-line interaction correction

Preserved the existing no-selection whole-source detection action and added
severity-colored editor line/margin decorations. Clicking affected text, trailing
whitespace, line numbers or margins opens current Error Details; exact diagnostic
ranges and unlocated results retain their original meaning. Owned decorations
clear with markers on edits/model changes/disposal. Selection Fix/Diff/Apply and
native Undo remain on the existing path. No backend/dependency/ADR changes.

182 targeted tests, scoped TypeScript/ESLint, full isolated production build and
final offline Electron C#/JS detection plus C# selection regression PASS. Actual
mouse clicks and screenshots verified. Existing repository-wide typecheck/lint
failures remain. Default output build hit a loaded native-file lock; the isolated
build passed and generated non-native outputs were restored. An initial JS smoke
had an OS shutdown invalid-handle failure after functional success; the identical
artifact rerun exited cleanly, without claiming that intermittent issue fixed.
No real Gemini/provider accuracy, full suite or packaged-host acceptance claim.

## 2026-11-11 — AI-SUGGEST-FIX-F5 whole-submission detection

Implemented no-selection Suggest Fix as a separate consented DETECT_ISSUES action
with no edit/grant/Diff authority. Main validates bounded issue fields/evidence,
mints IDs and fixes AI provenance to suspected; exact source-quote/UTF-16 range
matching controls localization. Invalid/unknown locations stay unmarked. Existing
verified public Run evidence is displayed separately. Own Monaco markers and
readonly Error Details support real marker/list clicks, navigation and immediate
stale/model/session cleanup, preserving language-provider owners. Selection
Suggest Fix parser/Diff/Confirm/Undo and F4 remain unchanged.

325 unique targeted tests PASS across two batches, including35 new F5 tests and
real-parser F4/selection regressions. Scoped tsc/lint, isolated production build,
final renderer build and diff checks PASS. Root typecheck remains blocked by
untouched Explorer fixture/CSS declarations; initial stale-test expectation and
unused-import failures corrected and retained in plan evidence. Final C#/JS
detection and C# selection offline Electron smokes PASS with actual bundles/
Monaco/parsers, fake Gemini only, clean OS exit0 and zero owned resources.
AI accuracy, comprehensive compiler ingestion and packaged acceptance are not
claimed. P2 Setup/release and unrelated work preserved; no live API, full suite,
new dependency, separate report or Git publication. F5 COMPLETE scoped,
PASS_WITH_LIMITATIONS; STOP.

## 2026-11-11 — AG-02 isolated component prototype, Engine gate NO-GO

Pinned official npm client/Windows x64 binary package2.2.7 only in a separate
prototype. Verified binary archive SRI and PE AMD64 without executing it. Built
synthetic project read/search/propose-only broker and fake-loopback Gemini
gateway, with actual V2 client type/runtime probes. Final37 prototype tests and
118 focused existing Ollama/Learning regressions PASS; initial one fake session
envelope failure corrected from the pinned client contract. Scoped tsc/lint,
Python syntax and isolated Electron Main bundle PASS; Electron44/Node24.18.1/
ABI149 probe against fake V2 server exit0, no stderr. No real provider/key.

Private-cwd/proxy canary reproduced outside-file access and unapproved loopback
access by an ordinary Node fixture. No proven Windows confinement backend is
available; Engine gate refuses launch without override. Zero Engine executions:
effective config/tools, Engine lifecycle/routing and target-host/runtime/license
closure remain unverified, not passed by component tests. AG-02 BLOCKED/NO-GO;
no production integration/AG-03/new installer. Existing release/P2 preserved.
Evidence and alternatives are recorded in existing architecture/decision/plan
documents; no separate report file created.

## 2026-11-11 — AI-HINT-APPLY-F4 scoped fix, PASS_WITH_LIMITATIONS

Real-parser baseline reproduced 6 failures in 10 cases: nested/no-selection
HAS_IMPLEMENTATION targets rejected and boundary return fragments inserted beside
the original return. Explicit statement selection already worked. Hint-only
C#/JavaScript parser resolution now admits verified nested gaps, infers only a
unique lexically bound empty-block assignment target and replaces a uniquely
adjacent matching statement. Parser-resolved proposal ranges are correlated by
Main/Preload; nonempty selections stay exact. Whole functions/control constructs,
ambiguous targets, stale/forged authority and invalid candidates remain denied.
Grammar, signature, SH-1, consent and F3 three-preparation authority unchanged.

151 unique targeted cases passed across serial/focused retries (not a clean
single batch); scoped typecheck/lint, production build and diff checks passed.
Exact new packaged assets passed C#/JS F4 and NO_IMPLEMENTATION offline Electron
smokes with real parsers/fake Gemini, Monaco Diff/Confirm/Undo/Redo and retry.
Isolated actual EXE passed foreign-cwd Run/Learning/Practice/Judge/native/workers
and OS exit 0. One prior functional JS smoke had native OS exit 0x80000003;
isolated retry passed exit 0. Native shutdown reliability remains unresolved.
Syntax-invalid Hint source stays UNCERTAIN with explicit safe refusal. No live
Gemini/full suite/new installer/publication. New artifacts only under out/;
P2 release and Setup checksum unchanged. Implementation plan records details.

## 2026-11-11 — WINDOWS-PACKAGING-P2 verified, NSIS created

Provisioned official NuGet csharp-ls 0.27.0 with pinned package hash/repository
signature, relocatable x64 private tool shim, full deployment closure, manifest
and upstream dependency notices. Packaging verifies the provider before/after
staging and output. No global student tool install or provider-version change.
Packaged Hint regression exposed P1's default Hint parser searching inside ASAR;
Main now supplies resourcesPath assets to both parser instances. No Hint policy
or feature changes. Final relocated EXE passed C# Monaco completion/diagnostics,
JS Project Run, JS/C# Learning Run/Judge/storage, workers and shutdown exit0.
Exact-ASAR C#/JS Hint Apply regressions passed with fake HTTP/encryption, no real
HTTP and clean child/parent exit. Scoped typecheck/lint and targeted 136 unique
tests across the recorded fixture correction/isolated retry passed.

Created release/Student Coding IDE Setup.exe (147,702,859 bytes); SHA256
29aac3320d2f65db932fc061a4c307fa66dade0c99194536d0248ee5e58cfd9b.
Verbatim embedded APP_64 archive, extracted 746-file parity, provider manifest,
ASAR/private-file/credential audits PASS. Retained all earlier build/test and
unrelated work. PASS_WITH_LIMITATIONS: external Node/.NET/VC++ prerequisites,
unsigned/default icon, clean-machine install/uninstall/Windows10/live Gemini
unverified. No publication, separate report, full suite, commit/push/merge or
Phase7/9G closure. STOP after P2.

## 2026-11-11 — Windows packaging resumed and revalidated

Restricted staging explicitly to production Main/Preload/Renderer directories
and anchored electron-builder projectDir to the repository. Fresh production
build and final unpacked packaging PASS; ASAR audit 234 entries and seven worker
bundles. Scoped resource/Node/C# SDK/local-key tests: 134 PASS/2 SKIP. Packaged
offline native ABI, parsers, Learning/Practice, JS/C# sample Run, Judge/storage,
six Monaco worker labels, AI disabled/no key and clean Windows close/exit PASS.
Retained all prior build/test artifacts and unrelated working-tree changes.
Full typecheck/lint retain existing failures; missing app-owned csharp-ls blocks
NSIS. No installer, real Gemini, separate report, full suite or Git publication.

## 2026-11-09 — Windows packaging configuration and unpacked verification

Added electron-builder 26.18.0 Windows x64 assisted-NSIS configuration and isolated
production/staging pipeline, preserving existing build/test artifacts and prior
working-tree changes. Only production Main/Preload/Renderer, four Main dependency
packages and required external Learning/parser/native assets are selected;
ASAR/private-file/credential-signature audits PASS. Main uses resourcesPath for
packaged parser/provider assets and userData for local encrypted key settings.
No key, environment configuration or userData is copied into the application.

Produced `release/win-unpacked/Student Coding IDE.exe` with correct product metadata.
Build and changed-file lint PASS; scoped tests 83 PASS/1 SKIP. Patched node-pty
Electron ABI and actual packaged offline JS/C# parser, sample Run, Judge Accepted,
saved storage, Learning, Monaco worker and native close/exit checks PASS. No real
Gemini call, installer, Git publication or separate report. Global typecheck/lint
retain existing unrelated errors. App-owned csharp-ls 0.27.0 is absent and blocks
NSIS. External Node/.NET/VC++ Runtime and clean-machine/installed acceptance remain
release prerequisites; no Phase 7/9G completion or runtime-distribution decision.

## 2026-11-08 - AI-C4-F3.1 scoped exit gate PASS_WITH_LIMITATIONS

Fixed Main shutdown returning before owned WebContents destruction: asynchronous
WindowManager.stop now joins the endpoint, shares concurrent stop and preserves
cleanup errors/retry. Chat business is sealed/drained first, while its transport
is removed after endpoint destruction. Preload revokes correlations at STOPPING/
STOPPED. Kept Hint Apply/retry, parser/SH-1, model/schema/quota and timeouts intact.

Added delayed-destruction, retry/error, sealed-late-IPC and bridge lifecycle tests;
138 targeted tests PASS, scoped TypeScript/ESLint and Main/Preload build PASS.
Existing offline smoke gained PID/phase/exit tracing and ownership assertions,
with final PASS only after process close. Eight final C#/JavaScript exits were 0
(three original-stdio plus one strict-stderr run per language), no Chat warning,
empty strict stderr, all owned counts zero. Baseline reproduced the native error
in Electron Main after JS exit with WebContents still alive. No native call stack
was collected; the fix is evidenced at the lifecycle boundary, not symbolicated
IOCP attribution. No live API, user-IDE restart, new report or publishing.

## 2026-11-08 - AI-C4-F3 scoped Hint Apply correction; exit gate BLOCKED

Implemented fixed target/candidate/signature/source/runtime failure projection
through the Hint parser, Main, typed IPC, Preload and UI. Added at most three
manual pre-grant target/candidate preparations on the same trusted Hint, with
idempotent failed IDs and a single valid proposal; original binding/TTL/package,
SH-1/parser, manual Diff, consume and native Undo/Redo guards stay in place.
Failed retryable preparation releases UI state without Discard or inference.
Source-free last-rejection diagnostics retain fixed stage/reason/attempt and
optional guard enum; a successful retry does not erase the last rejection.

Verified 466 selected tests across 15 files, scoped TypeScript/ESLint and actual
parser/Main/Preload/Renderer builds. Real-parser/fake-Gemini Electron confirms
both Hint flows and same-Hint reselection without a fourth inference. Final C#
functional checks passed but process exit was 1 after a Windows invalid-handle
error; JavaScript exit was 0. Normal shutdown also logs a late Chat-close handler
warning. These are recorded limitations, not a completed exit gate. The original
manual incident has no retained Hint Apply diagnostic, so its data-specific
cause remains unconfirmed. No live Gemini or unrelated execution changes.

## AI-C4-F2 Hint Apply UI / Diff — verified scoped, 2026-11-08

Enabled Apply beside Copy for the current owned Practice Hint. Capture freezes
the live Monaco source/model/revision and explicit selection/caret; Main chooses
the template body automatically when unimplemented. Typed prepare/consume/discard
flows preserve F1 authority, recapture package identity at confirmation, and open
the existing readonly Diff. Only a matching consume ACK arms a frozen local
object for one shared native transaction. Discard, stale snapshots, cancellation,
late ACKs and edit→Undo cannot resurrect a grant. Copy, code-last presentation,
Chat and Suggest Fix remain intact. UI states expose Preparing/Review/Applied/
Failed/Stale/Discarded and the retained one-preparation limit without retries.

Actual Electron exposed and verified two corrective F1 fixes: reuse source-free
SDK/asset identities with full byte/anchor checks inside existing budgets, and
admit only the exact recognized unimplemented JS scaffold in the original Hint
baseline. Candidate/Suggest Fix grammar, SH-1, signatures and outside-target
structure remain mandatory. F1 was reopened with evidence and closed after its
original/corrective 360 scoped checks passed; no unapproved feature was added.

481 distinct targeted cases in 15 files PASS in scoped batches, including all
30 final F2 UI cases, object-identity forgery, duplicate clicks/double confirmation,
source/package/TTL/cancellation and native Undo/Redo regressions. Scoped TS/ESLint,
Main/Preload/Renderer/parser builds and whitespace PASS. Final real-Electron C#/JS
smokes use real parser assets and fake Gemini, each with exactly three explicit
Hint POSTs/reservations and zero Apply inference, real HTTP, Run/Judge/Submit,
Renderer errors or diagnostic leaks. Actual Diff screenshots inspected. Artifact:
`out/hint-apply-f2`; final build identities are recorded in IMPLEMENTATION-PLAN.
Earlier fixture/timing failures and initial smoke failures are not passing
evidence. No new dependency, schema/model/quota/timeout change, native rebuild,
app restart/install, full suite, report or Git publishing. PASS_WITH_LIMITATIONS:
current Windows unpacked host, parse-only validation and one preparation per
current Hint. STOP after F2; no Gemini live started.

## AI-C4-F1 trusted Hint Apply backend — verified scoped, 2026-11-08

Added a strictly validated prepareHintApply API, authorized Main IPC and correlated
Preload bridge. Main retains minimal immutable material from its eligible owned
COMPLETE Hint, validates the requested source/model/revision/TTL, and rechecks
package version/signature/starter before and after parser work. Renderer cannot
supply Hint text, replacements, candidates or grants. Separate bounded parser
branches extract only the physical template body from a matching complete
function/method, or validate explicit entry-function selection/statement-boundary
insertion. Existing SH-1 canonical limits, signature and outside-target structure
are mandatory; no whole-file edits or widened Suggest Fix authority.

Independent Hint-provenance proposals retain the original result TTL. Exact
duplicate preparation is idempotent, changed preparation is rejected, and a
Main-only grant can be consumed once. Invalidation/expiry clears retained state.
No additional inference, ledger, model/schema/quota/timeout or Renderer changes;
Apply UI stays disabled and no consume IPC is exposed before F2.

62 new real-parser C#/JS/backend/contract/IPC/bridge checks and 285 direct
regressions PASS, 347 in 10 files. Scoped TypeScript/ESLint, Main/Preload bundles,
pinned TypeScript/Roslyn parser builds and whitespace PASS. Initial fixture
discovery/CRLF/reservation errors were corrected; final F1 run has no skipped
cases. Artifacts stay in `out/hint-apply-f1`; no native rebuild, app restart,
real Gemini, full suite, new report or Git publish. PASS_WITH_LIMITATIONS:
current Hint only, one preparation per Hint and conservative grammar/target
admission; parser checks do not prove compilation or algorithm correctness.
No Electron UI/packaging acceptance. F1 STOP; F2 not started.

## Hint code Copy / disabled Apply — verified scoped, 2026-11-08

Hint code blocks now expose top-right icon-only Copy and icon-plus-label Apply
using the existing beUI Button; language stays top-left and Code stays last.
Clipboard preserves exact Unicode/CRLF/whitespace, reports success or failure and
ignores completion after content replacement. Chat blocks retain their existing
presentation. Inspection confirmed current Hint output has no verified target
binding/proposal grant: Apply uses the explicitly authorized disabled fallback
with a visible accessible reason, for empty templates and partial code alike.
No target inference, editor grant, Main/Preload/IPC or mutation-path change.

Targeted toolbar/clipboard/UI, Chat, Suggest Fix, readonly Diff, manual Apply,
native Monaco Undo/Redo and stale/revision regressions pass. Added real-model
C#/JS checks reject Hint output as an Apply grant; Hint contract/invalid-response
regressions pass. One concurrent Chat focus assertion failed initially; all 26
Chat tests passed in the isolated rerun. Scoped TypeScript and changed-code ESLint
pass, including edit/Diff tests in the scoped config. Renderer-only production
build PASS in `out/hint-code-toolbar/renderer`; existing Monaco import warning
remains. Final whitespace PASS. No actual Electron visual smoke, live Gemini,
full suite, new report or Git publish. PASS_WITH_LIMITATIONS: Hint Apply disabled.

## Context-aware Unified Hint — verified scoped, 2026-11-07

Actual source review found no template/implementation distinction and a Hint
prompt allowing partial code regardless of progress. Main now classifies trusted
starter/source snapshots with bounded TypeScript/Roslyn parsers. Empty scaffolds,
comments, signatures and recognized placeholders require a complete matching
function; observed implementation gets focused next/corrected-fragment guidance;
uncertain inputs get conservative observed-code guidance without completion or
defect claims. Returned whole functions for unimplemented code must parse, retain
the required signature and contain no recognized unfinished branch. UI remains
thinking/steps/code-last; no editor authority, SH-1 or model/quota/timeout changes.

536 targeted tests PASS in 13 files (53 new context tests), covering both
languages, actual parser assets, fake Gemini, exactly-once reservation,
consent/cancel/timeout/stale, UI order and existing Chat/action/Fix behavior.
Scoped TypeScript/ESLint, isolated Main/parser builds and diff checks PASS.
No live Gemini, full suite, installed-IDE restart, packaging gate or Git publish.
Conservative classification and structural response checks do not establish
semantic correctness or guarantee live-model pedagogical quality.

## AI-C4-E beUI Learning Assistant — verified scoped, 2026-11-07

Reused official MIT beUI Message/MessageBubble/MessageScroller/PromptInput from
the existing vendored source; added safe Markdown and escaped offline Monaco
code blocks without dependencies. Compact composer unifies four actions and a
context chip; independent timeline preserves reading position, user/AI alignment,
consent focus and IDE theme tokens. Original AI icon and docked three-column
layout remain. Main/Preload, history policy, shared slot and guarded editor
authority are unchanged; proposal Discard reuses the existing pipeline.

206 tests PASS in 10 focused Renderer files; scoped TS/ESLint/Renderer build and
diff checks PASS. Actual isolated Electron final-bundle Chat/beUI smoke PASS:
dark/light, two widths, keyboard/reduced motion, consent, two-turn trusted replay,
cancel/late response, C# guarded Diff/Discard; JavaScript smoke also verified
public Run evidence and manual Apply/native Undo/Redo. Zero Renderer console
errors, real Gemini requests or diagnostic leaks; one reservation per fake POST.
Current Windows host/unpacked artifacts only; inert Markdown links/images and
plain fallback for unsupported code languages. PASS_WITH_LIMITATIONS. No C5,
live Gemini, full suite, new acceptance report or commits.

## AI-C4-D Unified Hint — verified scoped, 2026-11-06

Replaced sequential Hint levels with one consented action returning thinking,
implementation steps and practical language-tagged code last. Main validates all
sections and language binding; Preload/Renderer revalidate before display. Legacy
levels normalize away; old incomplete outputs reject. Removed progression and
summary replay state. Cards remain display-only with safe offline Monaco syntax
tokens and no editor authority. Other actions/Chat execution policies unchanged.

781 distinct targeted tests PASS in 28 related files; scoped TS/ESLint/build and
diff checks PASS. Actual isolated Electron C#/JavaScript Hint + follow-up Chat
PASS: one reservation per POST, no implicit Hint replay or editor edits, zero
console errors. Advisory code is not compiled/Run or proven semantically correct;
current Windows host/unpacked build only. PASS_WITH_LIMITATIONS; no live Gemini,
full suite, policy changes, new report files or commits. Stop after C4-D.

## Learning Assistant docked layout — verified scoped, 2026-11-06

Restored the original AI icon and docked Practice Chat to the editor's right;
description/editor/assistant share the body width. Opening AI collapses the
controlled roadmap; closing restores editor space without remounting Monaco.
40 related Renderer tests PASS; scoped TypeScript/ESLint/build/diff checks PASS.
Actual Electron at 1440/1280/1000px verifies non-overlapping columns, automatic
sidebar collapse and preserved editor/model identity on reopen. Zero inference
or console errors; no backend/consent/authority changes.

## AI-C4-C Offline Electron acceptance — verified scoped, 2026-11-06

Actual isolated Electron builds/typed IPC/Main services, fake Gemini HTTP,
TS/Roslyn parsers and Monaco Diff/editor passed Chat, JavaScript, C# syntax
recovery and shared-safety smoke. Fixed a stuck UI lease after asynchronous Main
history refresh and redundant composer layout during consent review. Added the
offline smoke driver and delayed-ACK/consent regressions. Measured and scoped
expensive course-test accessibility queries; the original two tests now pass
their default 5s timeout without changing product rendering.

304 targeted tests PASS, scoped TypeScript/ESLint/build/diff checks PASS. Main,
Preload and Renderer identities and five parser hashes verified. Real manual
Apply/Discard/Undo/Redo, stale proposals, consent/history provenance, shared
BUSY/rate/ledger, ownership and actual 10.305s timeout verified; zero console
errors and no canary source/question/key diagnostic leaks. Actual Electron
screenshots inspected. Current host/unpacked build only; installer, OS matrix
and live Gemini unverified. PASS_WITH_LIMITATIONS. No live calls, full suite,
provider/model/quota/timeout or SH-1/parser/Run/Judge/Submit changes. Stop before
live authorization; preserve unrelated working-tree changes.

## AI-C4-B Unified Learning Assistant — verified scoped, 2026-11-06

Replaced Practice's two AI entries/drawers with one Learning Assistant containing
Chat and Hint/Analyze/Explain/Suggest Fix controls. Reused the typed bridges,
Smart Hints hook/service, consent and canonical Fix/Diff/manual Apply pipeline.
Bounded request-identified cards preserve order across loading/result/failure and
source invalidation. Action cards never enter Chat history or mint Apply authority.
Operation-only Cancel preserves completed Hint levels; the existing IPC Cancel
route atomically returns an already committed Hint, and the hook accepts that
validated completion rather than losing progression in a polling race.

Final targeted run: 221/221 PASS across 11 files, including 16 unified cases and
one Main IPC regression. Shared admission/rate window, consent, stale output,
native Monaco model Apply/Undo/Redo, NO_FIX and forged proposal-like Chat text are
covered. Scoped TypeScript/ESLint, Renderer production build and whitespace PASS.
No SH-1 service, parser, provider/model/quota/timeout or Run/Judge/Submit changes.
No real Gemini/full suite/live Electron visual or installed acceptance; the new
fixture uses a synthetic guard and simulated Diff view. C4-B PASS_WITH_LIMITATIONS;
stop pending C4-C acceptance. Existing unrelated working-tree work is preserved.

## AI-C4-A Learning Assistant Chat UI — verified scoped, 2026-11-06

Added Learning/Practice advisory Chat panel and typed UI hook over the existing
Gemini Chat backend. All scopes require manifest consent before inference;
selection/source show code previews. Main-owned history, source/context binding,
session retirement, stale/duplicate guards and cancellation preserve the existing
Smart Hints flow. No automatic editor edits or Quick Actions timeline integration.
176 distinct targeted tests in eight files pass with fake HTTP only, including 22 Chat
integration cases and Hint/consent coexistence. Final lifecycle changes reverified
all 32 Chat/coexistence cases: rapid remounts share serialized bridge lifetime,
and unmount cancels inference before reading the close revision. Scoped TypeScript/ESLint,
Renderer production build and whitespace checks pass. Learning material tests
needed 20s rather than default 5s timeout. Live Electron/visual and real Gemini
acceptance were not performed. C4-A PASS_WITH_LIMITATIONS; stop before C4-B.

## AI-C3-B2 typed Chat application boundary — verified scoped, 2026-11-06

Composed ChatService inside the existing Smart Hints configuration with one shared
coordinator, credential/transport and durable ledger. Added eight typed IPC/Preload
APIs under Learning Chat, Main-generated document ownership/catalogue checks and
Main-computed snapshot fingerprints. Navigation/process/context/configuration
retirement and shutdown revoke captures/history; explicit consent gates inference.
Preload validates/correlates bindings, revision, operation, sequence and epochs;
Chat has no editor authority. 347 distinct targeted tests PASS, including 56
Chat IPC/Preload cases and direct Smart Hints/shared-state regressions. Scoped
typecheck/lint/whitespace and real-configuration Main/Preload Vite builds PASS.
No Chat UI, real API/countTokens, full suite/global gates or application restart.

## AI-C3-B1 Main ChatService — verified scoped, 2026-11-06

Added Main ChatService composition for conversation/context and Gemini adapter
with the mandatory existing coordinator, borrowed credential/provider-generation
ports and retire subscription. Consent precedes dispatch; one 10s deadline and
one external reservation protect each request. Only valid COMPLETE commits a
whole user/assistant pair. Cancellation/retirement/staleness/late output cannot
commit; shutdown joins Chat cleanup without stopping other consumers.
249 targeted tests PASS across eight files (44 new service cases), scoped
typecheck/lint/whitespace and standalone two-turn Main fake-HTTP bundle PASS.
Actual SmartHintsService contention and the configuration durable daily ledger
are tested. No live Gemini, application rollout, IPC/Preload/UI or new quota state.

## AI-C3-A Gemini multi-turn adapter — verified scoped, 2026-11-06

Added advisory-only GeminiChatAdapter over the shared fixed-model HTTP boundary.
Main identity-checked immutable capture supplies eligible history and explicit
consented context; exact CHAT_REPLY validation supplies no editor authority.
No session/quota owner, application wiring, retry or live API was added.
295 scoped tests PASS, including 48 adapter cases for roles/provenance, bounds,
malformed/safety/partial replies, secrets, HTTP failures, abort/deadline/cleanup
and stale late responses. Scoped typecheck/lint/whitespace and a standalone
two-turn fake-HTTP bundle PASS. Smart Hints behavior remains unchanged.

## AI-C2-B Chat contracts/session/context — verified scoped, 2026-11-06

Added strict Chat DTOs and Main-only RAM conversation/context domains. One session
per owner/document, absolute 30-minute TTL, 32 messages/48KiB, atomic complete pairs
and at most 8 eligible replay pairs. Consent binds immutable question/history/
explicit attachment with context/provider-generation provenance; source updates
invalidate pending work while retaining a non-replayed reference timeline.
Required Main policy blocks known secret forms; chat text cannot grant editor
authority. 61 targeted tests, scoped tsc/ESLint/whitespace and standalone domain
bundle/synthetic completion PASS, no network. Token counting and real composition/
Gemini/IPC/Preload/UI remain unimplemented. Existing Smart Hints behavior untouched.

## AI-C2-A2 shared Gemini transport — verified scoped, 2026-11-06

Extracted fixed-model HTTP/metadata/byte bounds/abort/error/diagnostic handling
from GeminiSmartHintsAdapter. Adapter retains action-specific payload and content
validation, including replacement-only Fix; transport owns no quota/history and
continues the existing reservation callback and 10s/30s/outer-deadline semantics.
355 targeted tests PASS across 10 files; scoped tsc/ESLint/whitespace and isolated
Main/parser build PASS. Synthetic multi-turn contents pass through unchanged;
two fake consumers share the existing coordinator without another ledger.
No live Gemini, ChatService/session/UI/IPC, timeout fix or unrelated Electron test.

## AI-C2-A1 shared execution coordinator — verified scoped, 2026-11-06

Extracted Smart Hints active admission and existing minute/hour limits into a
Main-private coordinator. A once-only lease delegates to the unchanged durable
daily reservation ledger in configuration; no second quota state or refund/retry.
Configuration cancels/joins shared consumers during provider retirement and seals/
drains shutdown. Smart Hints remains the only production consumer; Hint levels,
provider wire, 10s/30s deadlines, selection guards and Diff/Apply are unchanged.
277 targeted tests PASS, scoped TypeScript/ESLint/whitespace and Main/parser build
PASS. No real Gemini, full suite, unrelated Electron testing or user app restart.
No C2-A2/ChatService/UI/IPC implementation and no task report file.

## Selection Fix isolated syntax recovery — verified scoped, 2026-11-06

Roslyn/TypeScript preflight accepts provably isolated selected body syntax errors
while preserving required signatures and outside-target structure. Whole candidate
parsing stays strict. Missing-semicolon and missing-node ownership prevent an
error in an outside statement being mistaken for an error on its next token.
No source repair/offset adjustment, SH-1/provider/SDK/Apply policy change.
125 targeted tests PASS, scoped tsc/lint/whitespace and Main/parser build PASS;
relocated Electron Node parser closure verifies both languages without runtime
devDependency resolution. No live inference/GUI test or user app restart.

## C# Suggest Fix SDK resolution correction — 2026-11-06

Fix now discovers the approved 10.0.112 toolchain independently of Learning's
highest-SDK policy. Installed SDK 10.0.401 remains available to the existing dev
LSP and Learning flows. Explicit helper runtime pinning and both Roslyn identity
checks retain fail-closed availability. Verified 101 targeted tests, scoped
TypeScript/ESLint/Main-parser build and built-artifact Dev/Preview availability;
one parallel Learning timeout passed unchanged in isolation. No live inference,
SDK installation/removal or user application restart; packaging remains unverified.

## SH4-D6-6 final offline acceptance — verified scoped, 2026-11-06

Final D6 offline acceptance PASS_WITH_LIMITATIONS. Production src aggregate hash
is unchanged; no regression required a production fix. Extended only the existing
offline Electron runner's --final-acceptance mode, without a new report file.
303 targeted tests PASS/0 FAIL in 14 files; scoped SH-4 tsc, runner lint and
whitespace PASS; normal build PASS. Both relocated built parsers PASS without
runtime TypeScript resolution, and all 5 parser assets match manifest hashes.

8 additional final-artifact Electron check groups PASS: real C#/JS availability,
empty/multi-cursor/whole-file rejection, JS single-line/whole-function CRLF/UTF-16
Diff and native transactions, pending source edit/Undo and cancel with late
response rejection, Analyze/Explain compatibility, and private diagnostic
identity/privacy. Exactly 6 GET + 6 POST fake HTTP exchanges; no real HTTP or
Run/Submit. Main identity ece14d7c01ac150d0222fbb42d59324e0f2fdabfa05938c1e32614c93b36fec9.
ASAR/installer tooling/artifacts were absent; no installation was attempted.
Installer/ASAR/clean-machine/Windows 10/other SDK/CPU and live usefulness remain
unverified, so this is not release-ready. Ready to propose separately approved,
user-consented live acceptance on the verified artifact; no live request or
subsequent work was performed. Unrelated working-tree changes are preserved.

## SH4-D6-5 selection Fix UI / Diff — verified scoped, 2026-11-06

Integrated Monaco Fix capture with supported-language panel readiness, explicit
full-source/selection Gemini consent and Main-owned parser capability probes.
Selection movement cancels only pre-consent Fix and preserves Hint progression;
consent freezes the target while content/model/revision/context changes still
invalidate it. Preview and existing Apply verify the canonical single target.
Manual readonly Diff/native Undo/Redo and one-use grant are preserved; Applied
and Discarded complete separately, NO_FIX remains advice with no Diff. No legacy
fallback or frozen-snapshot Fix retry. SH-1/parser/model/quota/time policy unchanged.

Targeted batches 78/149/236/73 and final selection-flow 15 tests PASS (overlap,
not a unique total), scoped SH-4 tsc/eslint/CRLF-aware whitespace PASS.
Isolated/default integrated builds and 8 real
Electron 44 offline check groups PASS with normal config/typed IPC/Monaco and real
C#/JS parsers; only Gemini HTTP is fake (6 GET, 6 POST, zero real HTTP/Run/Submit).
Unsupported preflight exits loading with recapture guidance; late capability
replies from cancelled Fix requests cannot overwrite newer Hint consent.
SELECTION_V1 is provisioned for actual ready languages; current host C#/JS pass.
No new acceptance report/full suite/global quality run/live call/commit. Verdict
PASS_WITH_LIMITATIONS for installer/ASAR/clean-machine/Windows 10/live quality;
D6-6 remains separately authorized future work, not implemented here.

## SH4-D6-4 deterministic edits and signature fence — verified scoped, 2026-11-06

Completed the interrupted authorized Main-only D6-4 implementation. Frozen exact
selection supplies offsets/old text; replacement wire supplies replacement,
rationale/evidence. Original SH-1 gates precede parse-only candidate verification
and proposal allocation. NO_FIX has no proposal. Roslyn helper and standalone
TypeScript 6.0.3 worker enforce supported syntax/signatures and structure outside
the selected expression/statements/function; missing/changed parser, unsupported
grammar, stale context, cancellation and deadline fail closed. Cleanup joins owned
worker/helper exit; diagnostics retain only bounded private enums.

51 D6-4 and 352 direct regression tests PASS (403 total); scoped SH-4/build-config
tsc, eslint and D6-4 whitespace PASS. Isolated Main-only build and both relocated
parser entries under Electron 44.0.0 Node mode PASS without TypeScript resolution
from node_modules. No student execution, real API, dependency install, full/global
gate, GUI smoke or new report. Normal Selection V1 remains DISABLED. Verdict
PASS_WITH_LIMITATIONS: final UI integration, installer/ASAR/clean-machine/Windows
10 acceptance and unsupported SDK/CPU environments remain later gates. D6-5 is
ready for review/authorization only; no D6-5/6 implementation or automatic cutover.

## SH4-D6-3 Gemini replacement-only wire — verified scoped, 2026-11-05

Changed only Gemini Fix to strict replacementText/rationale/evidence or NO_FIX
schema and standalone selection-focused instructions. The frozen action carries
selected text/range, with full source/task/signature context and explicit EOL.
Gemini reuses the D6-2 private validator after strict JSON parsing; legacy edits,
model-authored offsets/old text, extra fields and invalid evidence are rejected
without repair/fallback/retry. Non-Fix complete prompts/schema/input are retained.
400 targeted/regression tests PASS in 13 files, scoped SH-4 tsc/eslint and local
whitespace PASS. Canonical/SH-1 file hashes are unchanged. No public contract,
mapper/parser/Apply/Undo or transport/model/token/quota/deadline changes. Normal
Selection V1 stays disabled; no build, full/global gates, Electron smoke, live
call or new report. D6-4 construction/guards require separate authorization.

## SH4-D6-2.1 contract compatibility cleanup — verified, 2026-11-05

Resolved the D6-2 legacy fixture/runner typecheck hold without a contract fallback:
exact source-derived selection/binding fixtures, DISABLED capability fixtures,
and private trusted synthetic signature identity for both Hint runners. Updated
normal service/UI expectations to reject Fix before HTTP/quota/grants; preserved
legacy adapter/SH-1/canonical advisory and native Diff/Apply/Undo unit coverage.
Final scoped SH-4 TypeScript, eslint and changed-file whitespace PASS; 530 targeted
tests PASS in 17 files, including both offline runners and shared boundary/Hint
regressions. No production contract/provider/schema, parser, quota or editing
changes. No full/global gates, build, Electron smoke, live call or new report.
D6-2 compatibility is complete; D6-3 still requires separate authorization.

## SH4-D6-2 selection contracts — verified scoped, 2026-11-05

Required exact Fix selection and public bound range/fingerprint; detached/frozen
Main capture with trusted lease signature identity, strict capability migration,
first-response Preload binding checks and private replacement wire validation.
Fix stays disabled in panel/workspace/hook and before Main reservation/dispatch.
No Gemini schema/prompt, canonical output, SH-1, Apply/Undo or quota changes.
136 scoped tests in 9 files, D6-2 TypeScript/eslint and local whitespace PASS.
At initial D6-2 delivery, broader SH-4 tsc included incompatible legacy Fix
fixtures/runner captures. The D6-2.1 entry above records the verified resolution.
No full/global tests/lint/typecheck, build, smoke, live calls or new report file.

## SH4-D6-1 local selection capture — verified offline, 2026-11-05

Added Renderer-only single-range Fix capture with frozen source/selection/origin,
model version/language and workspace revision binding, UTF-16 position round-trip,
size/EOL/full-source guards and separate source/selection freshness epochs. Local
target freeze preserves the captured range after cursor movement; source/context
changes and editor disposal remain stale. Readiness summaries do not contain source
and explicitly state that selection mode is not enabled. Existing Hint progression,
Explain capture, public/Main/provider contracts and Apply/Undo are unchanged.
32 added cases; 728 Smart Hints regressions plus 48 Practice compatibility tests PASS.
Scoped tsc/lint and final build PASS; global typecheck/lint/whitespace retain known
baseline failures. Test fixture/teardown mistakes were corrected; the new two-request
integration test uses a 10s test-only budget after an initial 5s timeout under load.
No parser dependency, real Gemini inference or D6-2 implementation. Verdict
PASS_WITH_LIMITATIONS; full selection consent/IPC/semantic validation comes later.

## SH4-D3 Gemini edit contract guidance — verified offline, 2026-11-05

After live D2 confirmed OLD_TEXT_MISMATCH, added Fix-only original-snapshot,
zero-based UTF-16/exclusive-end/exact old-text/EOL/focused edit/NO_FIX guidance
and schema descriptions. Private sourceEol reuses the validated origin enum;
shared predicates, public output shapes, processing/quotas/model and manual
editing remain unchanged.35 new synthetic tests;158 targeted and696 broad tests
PASS. Scoped tsc/lint/build PASS;12 Electron scenario families have PASS evidence
with fake transport and no real HTTP, including Diff/Apply/Undo/Redo. Initial
Monaco import/readiness timeout failures and successful unchanged reruns are
recorded, as are unrelated global baseline gate failures. No live request or
claim of improved live model quality. Report:
`AI-SMART-HINTS-GEMINI-CONTRACT-FIX-ACCEPTANCE.md`. STOP before live acceptance.

## SH4-D1 private diagnostics — verified offline, 2026-11-05

Added read-only SH-1 rejection reasons, explicit private PROVIDER origins,
normal-app failure correlation and bounded output/model/build metadata to the
existing atomic best-effort diagnostic sink. Shared validators/contracts/schema
are byte-identical; no prompt/model/quota/editing changes.661 scoped tests and
12 Electron offline scenarios plus3 final-artifact rechecks PASS; no real Gemini
calls. Final build and scoped tsc/lint PASS;
global gates retain unrelated baseline failures. Original live failure remains
unresolved pending approved evidence. Full report and final build verification:
`AI-SMART-HINTS-GEMINI-DIAGNOSTICS-ACCEPTANCE.md`. SH-4 not declared COMPLETE.

## Suggest Fix failure observability — verified offline, actual cause BLOCKED, 2026-11-03

Added safe finishReason, wire token cap, dispatch/usage/JSON/schema diagnostics
and atomic bounded last-Suggest-Fix record in Main. Retain unknown values as
unknown; never store source, output body, credentials or raw provider messages.
677/677 regression, scoped tsc/lint, build and12/12 existing Electron UI cases
PASS using fake transport. Verified503 maps to the reported PROVIDER message,
MAX_TOKENS/safety/invalid JSON remain rejected, and complete focused fixes still
support explanation/Diff/manual edits/Monaco Undo/Redo. No real API or token cap
increase. Actual user request evidence is missing; the defect is NOT declared
fixed. [Evidence and blocker](AI/AI-SMART-HINTS-SUGGEST-FIX-PROVIDER-INVESTIGATION.md).

## Ordinary Suggest Fix30s deadline — verified offline, 2026-11-03

Normal Gemini Suggest Fix now uses a single Main-owned30s deadline, including
metadata/reservation/body/validation. Other actions and Settings remain10s.
Adapter shares Main deadline/abort rather than competing timers; strict output,
quota/source/revision/privacy/manual edit controls retained. Added safe terminal
action/stage/elapsed/owner diagnostics and accurate consent/timeout copy.
672/672 regression, scoped tsc/lint and build PASS. Existing Electron harness
PASS9/9 on normal Main dependencies: C#/JS fake15s responses,30s timeout,
Diff/Apply/Discard/Undo/Redo, revision/cancellation/cleanup and no duplicates.
No real API/key read, new launcher, billing, baseline fix or Git publication.
Global baseline quality failures retained. Evidence:
[Suggest Fix30s correction](AI/AI-SMART-HINTS-SUGGEST-FIX-30S-FIX.md).

## Normal Smart Hints usage-limit correction — verified offline, 2026-11-03

Reproduced the normal-app lifetime3 default and shared local/Google quota label.
Replaced it with a native-confirmed daily policy (new default20, range1–300),
explicit legacy review, preserved lifetime reservations, fail-closed evidence
recovery and separate budget/rate/provider-quota states. Added bounded429 parsing,
persisted sanitized cooldowns and source-free usage refresh. No retries, live API,
key exposure, quota/ledger reset or unrelated runtime changes.658/658 scoped tests,
scoped tsc/lint and final build PASS; repository baseline failures retained.
Real post-fix UI/Gemini acceptance NOT_TESTED. See
[full evidence and ordinary-IDE checklist](AI/AI-SMART-HINTS-USAGE-LIMIT-FIX.md).

## SH-4 NOT_READY correction — verified offline, 2026-11-03

Reproduced two Renderer readiness defects: valid Main capabilities discarded on
source revision change; cached disabled state had no manual refresh path. Fixed
probe scope/order/lifetime and explicit availability checking, preserving every
source/action/consent guard. Added safe private Main approval/key/budget reason
codes with unchanged fail-closed behavior.619 tests, scoped tsc/lint, build and5
Electron cases PASS; fake budget3 preserved, one deliberate fake action, negative
gates zero HTTP. No actual key/API, live ID/ledger change, automatic retry,
Judge/Run/Submit or Git publication. Global baseline failures retained.
[Report](AI/AI-SMART-HINTS-SH4-NOT-READY-FIX.md) distinguishes proven code defects
from the user's particular incident, which remains NOT_VERIFIED without safe
session evidence. SH-4 IN_PROGRESS; production DISABLED. STOP offline.

## SH-4 current offline UI review — verified 2026-11-03

Re-ran614 Smart Hints tests, scoped tsc/lint, build,14 real Electron UI/entry
fake-transport scenarios and native Monaco25 checks/8 transactions: PASS.
Refined only harness public Sum responses (L1/L2/L3, current-source analysis,
exact0→b proposal) and asserted computed read-only Monaco diff/source equality
before screenshot/Apply. Zero real Gemini HTTP, credential leaks or forbidden
execution; pending timeout and four lifecycle requests aborted. Existing global
baseline failures retained. No product/Judge/Run/Submit code or Git publication.
[Current review/manual checklist](AI/AI-SMART-HINTS-SH4-UI-FINAL-OFFLINE-ACCEPTANCE.md).
Launcher readiness is now established offline; SH-4 IN_PROGRESS, production
DISABLED. STOP for separate live UI ID/budget approval.

## SH-4 development Live UI launcher — verified offline, 2026-11-03

Added Main-only gated development launcher with isolated drafts/settings,
one-use approval ID/budget, native project/Free Tier/sample attestation,
durable no-refund POST reservations and exact ch2-01 C#/JS snapshot scope.
Existing contracts, per-action consent, quotas and Monaco safeguards unchanged;
production DISABLED.614 scoped tests, scoped tsc/lint, build and14 native UI/entry
fake scenarios PASS;23 synthetic inferences,zero real HTTP/secret leaks/automatic
execution. Global baseline failures retained. No real key/API, live budget grant,
unrelated subsystem change or commit/push/merge.
[Handoff](AI/AI-SMART-HINTS-SH4-LIVE-UI-LAUNCHER.md).
SH-4 IN_PROGRESS; STOP for separate live UI budget approval.

## SH-4 offline UI acceptance evidence - 2026-11-03

Added isolated Learning/Practice Electron acceptance harness using real preload,
IPC, public capture, SmartHintsService and Gemini adapter with synthetic HTTP.
No real key/API, production setting, Judge/Run/Submit or accepted SH-1/2/3 code
changed. Nine offline UI scenarios PASS; scoped regression589/589, scoped
TypeScript/lint and build PASS; native Monaco regression25 checks/8 transactions
PASS. Global baseline gates remain reported as failures.
[UI report/manual checklist](AI/AI-SMART-HINTS-SH4-UI-ACCEPTANCE.md) separates offline
functionality from untested live educational quality and the pending gated live
UI launch path. SH-4 IN_PROGRESS, production DISABLED; STOP.

## SH-4 Google Authorization Key compatibility - verified offline, 2026-11-02

Fixed the shared Gemini validator rejecting AQ. at its period separator and extended only the auth-key cap to4096 ASCII bytes (local policy, not a published Google maximum). Standard/AIza compatibility and512 cap retained. Explicitly reject trailing control characters without trim/repair; REST remains x-goog-api-key only.127 scoped tests PASS, including both fake key types through native PowerShell -> Node runner -> Electron Main; scoped typecheck/lint/build/whitespace PASS. Global baseline failures documented. No real key/API, retry, historical evidence, SH-1/2/3/schema/provider/Monaco change or Git publication. SH-4 IN_PROGRESS, production DISABLED; [report](AI/AI-SMART-HINTS-SH4-GEMINI-AUTH-KEY-COMPATIBILITY.md). STOP offline.


## SH-4 Gemini key diagnostics - verified offline, 2026-11-02

Replaced ambiguous manual-runner KEY_MISSING_OR_INVALID with separate safe
missing/format/cancel/HTTP-auth codes and KEY_VALIDATION stage. Shared local
classifier keeps existing bounds/alphabet; no trim/repair, secret logging or
environment fallback. No inheritance/valid-key rejection defect reproduced;
fake-key actual PowerShell -> Node runner -> bundled Electron Main succeeds.
90 focused tests, scoped typecheck/lint/build/whitespace PASS. Global baseline
failures and unknown historical missing-versus-format cause remain explicit.
No real key/API, retry, old attempt/evidence mutation or Git publication.
SH-4 IN_PROGRESS, production DISABLED. [Report](AI/AI-SMART-HINTS-SH4-GEMINI-KEY-INVESTIGATION.md).


## SH-4 Gemini provider replacement - 2026-11-02

Implemented and verified offline: direct Main Gemini REST using fixed
 gemini-3.1-flash-lite/GEMINI_API_KEY, per-action API JSON Schema plus unchanged
SH-1 output/edit validators, model metadata before inference and explicit project
Free Tier attestation. Active Main composition uses Gemini with live/tier gates
closed; existing UI receives only new capability identity and recipient copy.
Historical OpenRouter remains auditable and its live CLI is retired. Isolated
Gemini attempt namespace, synthetic C# Hint L1 runner and single-command live
handoff added. No SDK/dependency, Judge/Run/Submit/Monaco patch or Git change.
Final538 tests/26 files, scoped typecheck/lint and build PASS; Gemini Electron
fake a1/a2 PASS, existing Monaco smoke25 checks/8 native edit transactions PASS.
Global baseline typecheck/lint/whitespace failures remain documented. No real
key read or API request/retry/paid fallback. SH-4 IN_PROGRESS, production
DISABLED. [Acceptance](AI/AI-SMART-HINTS-SH4-GEMINI-ACCEPTANCE.md). STOP offline.


## SH-4 development smoke timeout correction ? 2026-11-02

Verified offline: development smoke 30s through Main, OpenRouter adapter,
preflight GETs, new immutable manifests and consent; production/default 10s
unchanged. Added private stage/timeout-owner diagnostics and late-response body
cancellation. Delayed headers/body, timeout after HTTP200, abort, deadline races,
cleanup and existing strict guards:325 scoped tests PASS; scoped typecheck/lint
and build PASS. Global typecheck/lint/diff-check failures outside changed scope
remain documented. Historical evidence untouched; no real API/key read, retry,
paid fallback, schema/parser or Git publication. SH-4 IN_PROGRESS, production
DISABLED; STOP offline. [Report](AI/AI-SMART-HINTS-SH4-TIMEOUT-FIX.md).


SH-4 envelope contract audit verified offline (2026-11-02): fixed two proven
optional scalar metadata incompatibilities and added named Main-private envelope
guard/shape diagnostics without logging content/unknown names. Strict JSON and
SH-1 schema unchanged; actual North live root cause remains UNKNOWN. 192 scoped
and 454 broader overlapping tests PASS; scoped TypeScript/ESLint/build PASS;
global baseline failures retained. No API/key access, retry, model/Monaco or
historical evidence change. SH-4 IN_PROGRESS, production DISABLED, STOP after
offline. See `AI/AI-SMART-HINTS-SH4-ENVELOPE-INVESTIGATION.md`.


SH-4 safe response classification verified offline (2026-11-02): Main-only
ENVELOPE_INVALID / CONTENT_MISSING / JSON_PARSE_FAILED / SCHEMA_VALIDATION_FAILED
with enum content types and known schema field names; public errors unchanged.
Schema FAIL is recorded only for an actual SH-1 rejection. No raw body/prompt/
source/key persistence, repair, schema relaxation or live evidence modification.
164 focused and 426 broader overlapping fake tests, scoped TypeScript/ESLint/build
PASS; existing global baseline failures remain. No API/key access or retry;
production DISABLED, SH-4 IN_PROGRESS. See
`AI/AI-SMART-HINTS-SH4-RESPONSE-CLASSIFICATION.md` for files and limitations.


SH-4 runner attempt management verified offline (2026-11-02): explicit live
attempt IDs bound to model/time/synthetic C# Hint L1 approval scope; independent
immutable artifacts, atomic reservation/result and active runner lock. Preserve
legacy marker/result; crash/unknown delivery never auto-retries. 192 selected
tests PASS, scoped TypeScript/ESLint/build PASS, real offline Electron 39 checks
PASS with zero real HTTP. Global baseline failures unchanged. No real key/API,
dependency/Monaco/architecture/SH-1/2/3 change. Already-approved North command
prepared but not executed; SH-4 IN_PROGRESS, production DISABLED. Detailed evidence:
`AI/AI-SMART-HINTS-SH4-429-INVESTIGATION.md`.


SH-4 offline 429 diagnostics/free-model preparation (2026-11-02): implemented
selected Main-only numeric/enum metadata, conservative attribution and optional
fixed North :free development profile with catalogue/endpoint free/availability
gates. Default/production stays DISABLED; JSON/source/cost/no-retry guards remain.
988 selected regressions and final overlapping 72 focused tests PASS; scoped
TypeScript/ESLint/build PASS; offline Electron consent 39 checks and native Monaco
25 checks/8 transactions PASS. Existing global baseline failures remain. No real
OpenRouter/key access or live evidence/marker change. SH-4 IN_PROGRESS, STOP before
any new API call. See `AI/AI-SMART-HINTS-SH4-429-INVESTIGATION.md` for limitations.


## SH-4 invisible consent replaced with explicit window — 2026-11-02

Reproduced an invisible unowned native consent with actual offline Electron.
Dedicated stage/mode BrowserWindows now show in the taskbar, request focus and
provide explicit Confirm/Cancel, safe default Cancel, close/abort disposal and
unchanged timeout. Removed interactive offline auto-confirm and hidden Electron
startup. No preload/Node/raw IPC/network authority in the static consent page.
133 focused tests and 32 actual offline Electron checks PASS; captures reviewed.
OS-level click automation remains unverified due helper errors. No live request,
marker reset, production enablement or package completion claim. See
[consent UI report](AI/AI-SMART-HINTS-SH4-CONSENT-UI.md).

## SH-4 preflight consent timeout corrected — 2026-11-02

Run c36e0afd-d419-48e3-8848-acb61a7ae864 persisted PREFLIGHT_CONSENT before
watchdog termination, with no workflow HTTP dispatch. Both native consent awaits
now have 60s deadlines/abort and fixed expiry/failure codes; launcher reports safe
stages at the terminal. Existing HTTP 10s/watchdog 180s remain unchanged. Added
explicit OFFLINE Electron/fake-transport harness with separate artifacts and no
real key loader or live marker changes. Main now publishes immutable per-run
snapshots; the supervisor alone writes the aggregate result, removing competing
read/replace operations observed during offline repetition. 124 focused tests,
five consecutive final offline Electron runs, scoped tsc/lint, build
and actual offline runner PASS; full-project baseline failures remain. SH-4 stays
IN_PROGRESS; production DISABLED and STOP before real API. See
[runner debug](AI/AI-SMART-HINTS-SH4-RUNNER-DEBUG.md).

## SH-4 manual runner diagnostics corrected — 2026-11-02

Run IDs and atomic safe progress/error evidence now prevent stale results from
masking build/startup/early-exit failures. Added a bounded supervisor, owned-child
tree cleanup, explicit environment snapshot inheritance, metadata abort races and
post-reservation abort guards. Exclusive inference reservation and production
DISABLED are unchanged. 116 offline tests PASS, scoped tsc/lint and offline bundle/
build PASS; existing global baseline failures remain. Historical newer HTTP is
UNKNOWN; no real API request or marker reset. See
[runner debug](AI/AI-SMART-HINTS-SH4-RUNNER-DEBUG.md).

## SH-4 manual OpenRouter runner prepared — 2026-11-02

Added an isolated Electron Main smoke entry with inherited shell key, native
metadata/snapshot consent, account quota/catalogue zero-price verification,
existing SH service/adapter validation and a persistent exclusive one-inference
reservation. A Node/Vite launcher bundles offline, then starts Electron only when
the user runs it manually; --prepare-only never launches Electron or networking.
Synthetic C# Hint L1 only; safe metrics/validated hint artifact, no raw body/key,
retry, paid fallback or Run/Submit/Apply. Production wiring unchanged/DISABLED.
103 offline runner/provider/core tests PASS; scoped tsc/lint, standalone bundle
and repository build PASS. Existing global typecheck/lint/whitespace failures remain
recorded in SH-4 acceptance. No key read or real request during preparation; live
acceptance pending. No dependency or architecture change, commit/push/merge.

## SH-4 OpenRouter Free replacement — 2026-11-02

Replaced SH-4 NIM adapter/composition with fixed OpenRouter `openrouter/free` Chat
Completions and Main-only ephemeral OPENROUTER_API_KEY. Existing consent/quota/
lifecycle/structured action validation and SH-3 edit guards retained; consent now
identifies OpenRouter and selected free provider. Zero price ceilings, no fallback,
prompt JSON without forced schema, bounded routed metadata/reasoning handling.
Production/default DISABLED. Final sequential30 files624 tests PASS; scoped tsc/
lint and build PASS; final real Electron/Monaco25 checks/8 native transactions PASS,
zero console errors. Initial concurrent failures and full-project baseline failures
remain explicitly recorded in SH-4 acceptance, without an invented root cause.
Public docs/catalogue verify zero-cost route; local process key MISSING, so0 live
inference requests. Live quality/account/schema remain unverified. IN_PROGRESS,
awaiting user acceptance; STOP. No dependency/Judge/D2/source-guard or Git mutation.

## SH-3 accepted / SH-4 offline implemented — 2026-10-29

User accepts SH-3 COMPLETE — PASS WITH LIMITATIONS after artifact review of767
selected PASS, three consecutive real Monaco/Electron PASS with zero console errors
and unchanged exact Monaco patch hash. SH-4 implements Main-only NVIDIA NIM hosted
DeepSeek adapter, fixed documented V4.1 Flash route/model, approval-gated ephemeral
environment credential, accurate recipient consent and existing bounded validation/
quota/abort/source/draft semantics. Production and normal development stay DISABLED.
No real API/key, dependency install/upgrade, Judge/D2 contract or Git mutation.
Offline evidence:777 selected regression PASS;298 additional overlapping Judge/
Submit/provider PASS;81 final provider/core PASS; scoped tsc/lint and final build
PASS. New fake Electron smoke25 checks/8 native transactions PASS, zero console
errors. Independent full-project fixture/lint/whitespace failures remain unchanged.
SH-4 IMPLEMENTED — AWAITING LIVE ACCEPTANCE, tracking IN_PROGRESS. First real request
is stopped pending separate user approval; account quota/quality/latency remain
unverified. [Acceptance and Windows key/live checklist](AI/AI-SMART-HINTS-SH4-ACCEPTANCE.md).

## SH-3 option A fixed — awaiting user acceptance, 2026-10-29

Applied the approved exact Monaco0.56.0 global hover-factory lifetime correction
through version/hash-checked reproducible tooling; tested captured original,
idempotence, atomic writes and real rollback/reapply. Fixed modal resize feedback
with one host observer, RAF mode/dimension updates and cancellation before disposal.
Final33 suites734 PASS; separate6 Project/Monaco suites33 PASS. Three final fresh
full Electron/Monaco smokes PASS, zero console errors and8 native transactions each;
production DISABLED verified before synthetic fake IPC. Build/scoped checks PASS;
global baseline failures, historical Redo-cause uncertainty, OS/manual and PNG paint
capture limits are explicitly retained in acceptance. Fake-only Apply enabled;
no new package, live API/key, Judge/Storage/D2 change or Git mutation. SH-3 FIXED —
AWAITING USER ACCEPTANCE, not COMPLETE. SH-4 NOT_STARTED; STOP for user acceptance.

## SH-3 unblock diagnosis — dependency gate, 2026-10-29

Independent keep-live-editor/Diff-dispose/Suggest reproducer establishes the
Monaco0.56.0 global hover factory retaining a disposed Diff-owned instantiation
service: four fresh reproductions fail; no-Diff controls pass.72 standalone native
keyboard Undo/Redo cycles and app disabled matrices pass; historical Redo timeout
cause remains unresolved. Diagnostic app matrices complete8 transactions but fail
strict console checks on ResizeObserver. No suppression/timeout/guard change.
Added diagnostic-only baseline/matrix/trace and concrete version/hash-checked
unapplied dependency proposal.31-file regression attempt had657 PASS and56 SKIP
from two unchanged30000ms import hooks; isolated rerun of those suites56 PASS.
Scoped checks/build PASS; known global fixture/lint/whitespace failures retained.
SH-3 BLOCKED, all normal Diff/Apply disabled, SH-4 NOT_STARTED. User requires STOP
before dependency/shared-module changes; none applied. See
[acceptance](AI/AI-SMART-HINTS-SH3-ACCEPTANCE.md) and
[options](AI/AI-SMART-HINTS-SH3-UNBLOCK-OPTIONS.md). No install or Git mutation.

## SH-3 guarded draft implementation — BLOCKED, 2026-10-29

Implemented gated readonly Monaco diff, immutable proposal grants/exact source and
model guards, one-batch native Undo transaction and existing draft path.97 focused,
392 Renderer and224 Main/contracts/Preload tests passed; final fail-closed115-case
rerun, scoped tsc/lint and build passed. Repeated standalone Electron stress also
failed: native Redo timeout and disposed context-key/instantiation/model errors
after Diff/context changes. Earlier successful smokes do not establish a reliable
safety gate. Cause is not proven baseline. Per user STOP condition, all normal
compositions (including fake) report Apply false and hide Diff entry; diagnostic
harness only injects true. No release/acceptance claim; SH-3 BLOCKED, SH-4 NOT_STARTED.
See [SH-3 acceptance](AI/AI-SMART-HINTS-SH3-ACCEPTANCE.md). Production DISABLED;
no live key/API, dependency install, Judge/Storage/D2 change or Git mutation.
Post-STOP readonly Electron smoke PASS confirms no Diff/Apply controls and preserves
SH-2 behavior; it does not close the failed SH-3 safety gate.

## SH-2 stabilization and scoped acceptance — 2026-10-28

User-authorized corrective review resolves four proven SH-2 defects: duplicate
poll timers after manual recovery, same-text DOM retokenization provenance,
Solution retirement during pre-operation hashing and consent modal alignment.
Three logic regressions were demonstrated red before correction. Fresh50 focused,
392 Renderer and224 Main/contracts/Preload tests PASS; scoped tsc/lint/final build
PASS. Windows Electron/real Monaco smoke PASS with isolated userData and synthetic
SH IPC, including exact selection, consent/focus, read-only proposals and lifecycle.
Read-only controls reproduce Learning timeout and the prior Run regression without
SH-2 changes; no unrelated fixture/timeout/authority repair. Global typecheck/lint/
whitespace, missing System Design source and manual/platform/live limits remain in
[current acceptance](AI/AI-SMART-HINTS-SH2-ACCEPTANCE.md). SH-2 is COMPLETE — PASS WITH
LIMITATIONS under conditional acceptance authorization; SH-3/SH-4 NOT_STARTED.
No provider/key, Main/D2/Judge/Official/Storage changes, Native Judge execution,
dependency install or Git mutation. STOP after SH-2.

## SH-2 Smart Hints Renderer delivery — 2026-10-28

After SH-1 formal acceptance, delivered the authorized Practice drawer, progressive
hints, Code/Run advisory, exact Practice/Solution selection explanation, read-only
proposal/NO_FIX, per-action snapshot consent and independent context retirement.
Completed pagehide cleanup and unchanged-PREPARED ACK recovery without replaying
start; stylesheet uses the existing CSS entry. No production provider/Apply,
Main/IPC contract, Judge, Storage, History or D2 behavior change.
258 selected UI tests PASS including47 SH-2 cases; scoped tsc, targeted lint and
final production build PASS. Additional regression checks encounter Learning
roadmap timeouts; global typecheck/lint/whitespace failures and unverified manual
Electron checks remain explicit in [SH-2 acceptance](AI-SMART-HINTS-SH2-ACCEPTANCE.md).
SH-2 remains IN_PROGRESS pending acceptance, full exit NOT PASS; SH-3/SH-4 remain
NOT_STARTED. No unrelated acceptance status, dependency or Git history change.

## SH-1 Smart Hints Core & Contracts — 2026-10-28

SH-0 formally accepted COMPLETE — PASS WITH LIMITATIONS; SH-1 delivered for user
acceptance. Separate contracts, Main public capture and exact Public Run Receipt,
single-consent operations, structured edit validation and typed IPC/Preload are
implemented with fake-only provider tests.114 focused PASS, scoped typecheck and
targeted lint PASS. Existing Run baseline regression/full-project fixture and
unowned global whitespace limitations are explicitly retained in
[SH-1 acceptance](AI-SMART-HINTS-SH1-ACCEPTANCE.md); no blanket all-gates PASS.
No Renderer UI/Apply/live requests, accepted D2 contract, Judge/Storage/Completion
change, dependency install or commit. SH-2–SH-4 remain NOT_STARTED.

## Complete Chapter 2 teaching solutions — 2026-10-28

Added independently authored C#/JavaScript walkthroughs and complete source for
ch2-02–ch2-09 from public statements/signatures/samples, retaining the original
ch2-01 Sum unchanged. All9 Chapter2 exercises now resolve Solution content.
No UI/Runtime/Judge/Official/Storage/WA/AI changes.157 selected tests PASS including
39 new cases, actual local .NET10 compilation/execution of trusted teaching source,
JavaScript public/independent examples and finite-domain property checks. Scoped
tsc, targeted lint and diff checks PASS. No full suite/IDE build/native Judge/
Electron E2E, no acceptance/status change to E7/WA/AI-D or other phases.
See [Chapter2 review](LEARNING-SOLUTIONS-CHAPTER2-REVIEW.md).

## WA-B1 formally accepted / WA-B2 UI delivered — 2026-10-28

User accepts WA-B1 COMPLETE — PASS WITH LIMITATIONS, retaining550 relevant PASS
including80 focused plus scoped tsc/lint/diff evidence. Native/Electron/build and
target-host performance/RAM remain unverified; no B1 evidence rerun in B2.

WA-B2 adds a dynamic Wrong Answer tab after Submissions using the accepted B1
contract, current light Practice tokens and existing Tabs. It renders only public
sample Input/Actual/Expected or truthful fallback, independently of storage and
committed History. Guarded Attempt markers replace click-based loading selection;
full-ref once-only auto-open/context retirement preserve Run/editor/Restore and
completion. No Main/contract/storage/Official/AI/network changes or Git publication.
42 focused UI PASS; final related13-file batch380 PASS/1 roadmap-test timeout,
isolated unchanged Learning suite retry10 PASS. Scoped tsc/targeted lint/diff PASS.
No blanket simultaneous381-case batch PASS or performance claim. Verification
and manual limitations are recorded in the WA-B2 acceptance report;
await user acceptance, no other phase execution. Historical sections below remain
unchanged and their earlier pending acceptance notes are superseded by this entry.

## AI-D1 accepted / AI-D2 service delivered — 2026-10-28

User formally accepts AI-D1 COMPLETE — PASS WITH LIMITATIONS (historical 65
targeted PASS/0 FAIL, 42 final fake requests; native fetch/direct contract,
validation/lifecycle/redaction accepted within prototype). Evidence/OpenCode
prototypes preserved; real API/Electron runtime/key provisioning UNVERIFIED.

Delivered authorized D2: separate semantic Analysis contracts/validators and typed
Preload/IPC; existing owner/frame/context/source-reference authority; exact bounded
committed Accepted/all graded Failed source capture and matching public statement;
Main-private direct provider seam, strict JSON, explicit versioned consent,
60-second single-use capture, duplicate/lost-ACK/stale protection, cancellation and
shutdown. Existing store read recovery/public Registry capabilities are reused
without changing write semantics, Registry identity or Official assets. Resources
release before dispatch. No UI, live credentials/default transport or agent tools;
production composition fails KEY_UNAVAILABLE.

[D2 packet](AI-D2-SUBMISSION-ANALYSIS-SERVICE-ACCEPTANCE.md): final 110 D2 targeted
PASS/0 FAIL/0 SKIP, scoped TypeScript/targeted lint/diff checks PASS. Selected
regression 275 PASS/1 baseline FAIL/1 deliberately filtered SKIP (includes final
14-PASS synthetic Source IPC supplement): old keyboard-tab assertion expects Submissions
after one ArrowRight although unchanged UI has an intervening Solution tab;
same failure independently reproduced in archived HEAD. No unrelated UI/test fix,
E7 status change, full suite/native Judge/build/Electron E2E or live API execution.
D2 IN_PROGRESS — delivered, awaiting acceptance. D3/D4 NOT_STARTED. Stop; no
commit/push/merge.

This changelog records substantial work created for the independent Student Coding IDE. It does not claim Orca source or general IDE concepts as original implementation.

<<<<<<< HEAD
## Phase9E-6 — Formal final acceptance — 2026-10-26

User formally accepts **E6-S1–S3 and Phase 9E-6 COMPLETE — PASS WITH LIMITATIONS**.
[Final acceptance](PHASE-9E6-FINAL-ACCEPTANCE.md) retains step-local results:
S1 42 new/47 regression PASS; S2 41/18 PASS,38 filtered not PASS; S3 48/58 PASS;
scoped typecheck/lint/diff PASS within each step's scope. Submit/result UI, tabs,
committed History/Completion, Details/read-only source and confirmed Restore are
accepted. No repeated-test aggregation; initial S3 CRLF test failures/corrections
and all historical evidence remain intact.

Documentation-only closure updates the S3 packet, summary, implementation status
and map/changelog; consistency/document diff checks only. No production/test edits,
tests/build/typecheck/lint/native/smoke rerun, limitation repair or user-data access.
Two legacy fixture cast exclusions remain; Monaco/Electron/native end-to-end and
target-host/release UNVERIFIED; E4 current-artifact handoff NOT PASS; E5 storage
durability/performance UNVERIFIED;12 performance models PENDING_RUNTIME and all
deferred gates including loader B1a/B1b unchanged. No production/release certification.
**Phase9E-7 NOT_STARTED. STOP pending separate explicit E7 authorization; no
commit/push/merge.** Earlier pending statuses below describe their delivery dates.

## Phase9E-6 — S2 accepted / S3 Details and Restore delivered — 2026-10-26

User accepts S2 COMPLETE — PASS WITH LIMITATIONS (41 new/18 regression PASS,
38 filtered not PASS and scoped checks), authorizing only E6-S3. Submission rows now
open in-pane Details, existing E5 source reads assemble verified contiguous UTF-8
chunks and a separate read-only Monaco model displays C#/JavaScript. Source readiness
is distinct from historical saved status/availability; private Judge data, errors and
opaque bindings remain absent from DOM. Confirmed Restore checks current exercise,
language, draft text/revision, active/close/operation state and one-shot consent, then
reuses the existing explicit replacement/draft queue. Cross-language Restore updates
only its target draft; viewing/back/late reads never edit or auto-Submit. Source/
selection/consent retire on context changes and pagehide. No Main/Preload/Judge/
Storage/API/Official/Runtime/Project or dependency changes; prior uncommitted work kept.

[S3 packet](PHASE-9E6-S3-DETAILS-RESTORE-ACCEPTANCE.md):48 new PASS/58 directly
affected History/Practice/editor replacement regression PASS/0 FAIL/0 SKIP; scoped
tsc/lint/diff PASS. First43-test run had41 PASS/2 FAIL from textarea mock CRLF
normalization, corrected by checking normalized DOM and exact editor/draft payloads;
five added safety cases give48, not an aggregation of campaigns. Actual Monaco
EOL/undo/coloring/disposal/Electron/native smoke remain UNVERIFIED, as do prior
target-host/release/storage durability/performance/deferred gates and12 performance
models PENDING_RUNTIME; E4 current-artifact handoff NOT PASS, two legacy fixture cast
exclusions unchanged. No full suite/build/native/Runtime/benchmark/user-data access.
**E6-S1/S2 COMPLETE — PASS WITH LIMITATIONS; E6-S3 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE; Phase9E-6 IN_PROGRESS — AWAITING FINAL ACCEPTANCE; E7 NOT_STARTED.**
STOP; no whole-phase closure, E7 or commit/push/merge.

## Phase9E-6 — S1 accepted / S2 Submission History delivered — 2026-10-26

User accepts **E6-S1 COMPLETE — PASS WITH LIMITATIONS** (42 new/47 regressions and
scoped checks) and authorizes only S2, without a separate design/plan. Existing
uncommitted S1 work is preserved. Description now shares an exercise-keyed tab pane
with Submission, reusing existing tabs/Learning styling while keeping editor/draft,
Run and Submit mounted. Committed ALL-store History shows timestamps, language,
safe graded verdict and saved target; bounded pages, stale-cursor first-page reload,
partial/unavailable/conflicting stores and recovered-data warnings remain explicit.
New saved records refresh History; provisional results never become rows. Completion
reuses the committed API observer, not Accepted rows or transient Judge verdicts.
No Main/Preload/Judge/Storage/API/Runtime/Project changes, detail/source/Restore UI,
new persistence index, operation lifecycle or dependencies.

[S2 packet](PHASE-9E6-S2-SUBMISSION-HISTORY-ACCEPTANCE.md):41 new PASS/14 Practice
regression PASS/4 directly affected S1 integration PASS,38 filtered not PASS; scoped
tsc/lint/diff PASS. First36 new tests are an earlier coverage iteration, not extra
unique tests. Initial tsc failed on unsupported `getByRole` `exact` in the new test,
corrected before final PASS; no functional test failure. S1 legacy fixture cast
exclusions remain. Its earlier per-file regression split15/9/23 was corrected to
14/10/23, with47 unchanged and no unrelated suite rerun. No full suite/build/native/
Runtime/benchmark/real Electron/UI smoke or learner-data access. All inherited E4
current-artifact NOT PASS/native-host-release UNVERIFIED/storage durability and
performance/12 PENDING_RUNTIME/deferred gate limitations remain unchanged.
**E6-S2 REVIEW COMPLETED — AWAITING USER ACCEPTANCE (tracking IN_PROGRESS);
Phase9E-6 IN_PROGRESS; E6-S3/E7 NOT_STARTED.** STOP; no commit/push/merge.

## Phase9E-6 — E6-S1 Submit UI delivered for acceptance — 2026-10-26

User authorizes E6-S1 only after accepting Phase9E-5 COMPLETE — PASS WITH
LIMITATIONS, with direct implementation and scoped verification. Existing Learning
Workspace now exposes Submit beside Run, immutable four-field capture, safe verdict
and independent storage status, stale-source notice, committed completion/UNKNOWN
and recovered-data warning. Main-issued refs/status-only recovery avoid automatic
replay after missing ACK; local observation retires on context/leave with listener/
timer cleanup. Existing E5/Main/Preload/Judge/Runtime/Storage and public Run semantics
are unchanged; UI styling reuses Learning tokens/layout.

[E6-S1 packet](PHASE-9E6-S1-SUBMIT-UI-ACCEPTANCE.md):42 new UI PASS/47 directly
affected regression PASS/0 FAIL/0 SKIP; changed source/new-test scoped tsc, targeted
lint and diff PASS. Initial expanded tsc exposed two untouched legacy fixture
TS2352 casts, retained/documented and excluded from final tsc; those runtime suites
PASS. Earlier35/41-test iterations are not extra unique results. No full suite,
build/native/benchmark/real Electron/UI smoke or learner-data access. Inherited E4
current-artifact NOT PASS, native/host/release UNVERIFIED, storage durability/
performance uncertified,12 PENDING_RUNTIME models and deferred gates remain.
**E6-S1 REVIEW COMPLETED — AWAITING USER ACCEPTANCE (tracking IN_PROGRESS);
Phase9E-6 IN_PROGRESS; E6-S2/E7 NOT_STARTED.** History/Restore and Project changes
are excluded. STOP for S1 acceptance/separate S2 authorization; no commit/push/merge.

## Phase9E-5 — S5 accepted / S6 safe transport and final review delivered — 2026-10-26

- User formally accepts [S5 COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md):35 integration PASS,
  96 focused regression PASS/1 filtered/scoped checks; original guard/hold/cleanup/
  shutdown evidence, failures and limitations preserved without a full S5 rerun.
- Pure shared Submit/read/status/ref/context contracts and validation; existing Main
  ExerciseIpcService routes, explicit safe projections, opaque owner/context-bound
  committed source/cursors and separate `learning.submission` preload capability.
  Cross-mode generation ordering, bounded pre-ACK buffer and listener/unload cleanup;
  Main/current-ref status retry and non-auto-retryable Submit errors avoid ACK replay.
- [Final packet](PHASE-9E5-FINAL-ACCEPTANCE.md):42 new PASS (17 contracts/15 Main IPC/
  10 preload),24 direct Run transport PASS and5 focused S5 projection PASS/30 filtered;
  scoped tsc/targeted lint/diff. Initial38 PASS and2 fixture lint errors corrected;
  review strengthened identity/correlation/coverage/lifetime checks; expanded41 PASS,
  final42 PASS after explicit initialization-unavailable→UNKNOWN/partial coverage.
  Repeated tests are not summed. Controlled real service/Judge/temporary commit/read
  survives lost ACK with one Submit/record; no native/student process or UI.
- No storage/Judge/Runtime/Core/Registry/Official/native/dependency/policy changes;
  no generic fs/executor/new lifecycle. Read-only service stamp/count seams do not
  change S5 authority. S1–S5 COMPLETE — PASS WITH LIMITATIONS; **S6 REVIEW COMPLETED —
  AWAITING USER ACCEPTANCE; Phase9E-5 IN_PROGRESS — AWAITING FINAL ACCEPTANCE**;
  E6/E7 NOT_STARTED.12 performance models PENDING_RUNTIME and all native/current-
  artifact/storage durability/performance/target-host/release limits remain.
  STOP for final acceptance; no E6/UI/Restore or Git publication.

## Phase9E-5 — S4 accepted / E5-S5 service integration delivered — 2026-10-26

- User formally accepts [S4 COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md):72 S4 PASS,
  3 focused regression PASS/scoped checks; committed History/availability/pagination/
  source/completion and original limitations preserved without S4 rerun.
- Existing ExerciseService now admits immutable Submit intent on its active slot,
  binds trusted current Official identity in owned Prepare, finalizes VERIFIED
  cleanup/content release and holds the same op through S3 commit/reconciliation.
  Live synchronous owner/epoch/source/plan/cleanup/lease/base guard; pending/failed/
  unknown separate from Judge verdict; no retry rerun/recompare/duplicate append.
- Managed storage dependency precedes ExerciseService; shutdown joins runtime12s
  independently from Accepted15s/Failed10s and retains unsafe I/O/lease/slot through
  retries. Existing evidence-only runJudge/sample-only Run/public boundary retained.
- [S5 packet](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md):35 new PASS plus96 directly
  affected regression PASS/0 FAIL/1 factory/probe filtered, scoped tsc/lint/diff.
  Initial26 PASS/5 fixture assertion FAIL/one unhandled assertion warning corrected;
  31 PASS then regression failures4 Official/Judge +1 service exposed introduced
  microtask cancellation/coalesced-close issues. Fixed in ExerciseService only;
  existing tests/Runtime unchanged. Added delayed Prepare/owner/shutdown cases;
  final35/74/22 distinct PASS, not a sum of repeated runs. Scoped declaration/spy
  typecheck setup corrections and all limitations recorded.
- No storage/Judge/Runtime/Core/Registry/Official/native/dependency/public transport
  changes or build/native/student execution. S1–S4 COMPLETE — PASS WITH LIMITATIONS;
  **S5 REVIEW COMPLETED — AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS;
  S6 NOT_STARTED; Phase9E-5 IN_PROGRESS. STOP for acceptance; no UI/History/Restore/
  E6/E7, native/host/power-loss/release certification or Git publication.

## Phase9E-5 — S3 accepted / E5-S4 committed reads delivered — 2026-10-26

- User formally accepts [S3 COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md):40 S3 PASS,
  28 S2 regression PASS/1 native live SKIP, scoped checks; controlled atomicity/
  idempotency/backup/recovery and all historical limitations preserved. No full S3
  rerun, native execution or upgraded durability/production claim.
- New Main-private read model and façade methods load verified committed snapshots
  under the shared lease. Explicit partial availability/conflicts, deterministic
  bounded history/cursors, source identity/hash/UTF-8 chunks and Accepted-only
  completion. No Failed filesystem probe for completion; unreadable Accepted is
  UNKNOWN, recovered backup retains POSSIBLE_DATA_LOSS and no repair is performed.
- [S4 evidence](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md):72 new PASS/0 FAIL/0 SKIP,
  3 directly affected façade regression PASS (37 tests filtered), scoped tsc/lint/
  diff checks. Initial one tsc narrowing error/one lint unused import corrected;
  69/70/final72 are repeated coverage, not additive. Review fixed new read-acquisition
  ownership cleanup and separated completion from Failed I/O before final checks.
- No storage schema/policy/transaction/recovery, Judge/Runtime/Core/Official/native/
  public Run/dependency changes; no persisted progress/index or S5/S6/UI/Restore.
  S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; **S4 REVIEW COMPLETED — AWAITING USER
  ACCEPTANCE**, tracking IN_PROGRESS; S5/S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.
  STOP for user acceptance; inherited durability/performance/host/release limits
  remain, no commit/push/merge.

## Phase9E-5 — E5-S3 transaction/recovery delivered — 2026-10-26

- Main-private façade and retained one-target transaction reuse S1/S2: immutable
  idempotency/conflicts, policy capacity/reserve/expiry/backoff, checked staging and
  verified backup, synchronous injected primary guard, exact committed read-back,
  unknown reconciliation without competing append and resource retention.
- Lease-authenticated recovery classifies missing/unavailable/corrupt/unsupported/
  oversized/conflicting snapshots. Verified primary remains authority; older backup
  recovery warns of possible data loss and blocks mutation, preserving evidence.
  No automatic repair/reset/prune or temp/checkpoint promotion.
- [S3 acceptance](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md):40 new synthetic
  temporary-directory PASS;28 affected S2 regression PASS/1 native live SKIP;0 FAIL.
  Scoped tsc/targeted lint PASS; final whitespace checks recorded in packet.
  Initial tsc literal-parameter error corrected;60/66/67/final68 repeated PASS counts
  are not additive. Historical S1/S2 live results remain unchanged.
- S1/S2 COMPLETE — PASS WITH LIMITATIONS; **S3 REVIEW COMPLETED — AWAITING USER
  ACCEPTANCE**, tracking IN_PROGRESS; S4–S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.
  No production authority/service/transport/completion or native changes. Controlled
  tests do not certify actual crash/power-loss durability, performance or release;
  inherited E4/current-artifact limitations unchanged. STOP for user acceptance.

## Phase9E-5 — S2 formally accepted — 2026-10-26

- User accepts [S2 COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md); S1 remains COMPLETE — PASS WITH LIMITATIONS. Phase9E-5 IN_PROGRESS; S3–S6 NOT_STARTED. This supersedes historical pending S2 status below.
- Existing29 targeted PASS/0 FAIL/0 SKIP, filesystem/shared lease/Windows contention/reacquisition/unchanged fingerprint and scoped checks accepted without rerun. All lint failure/corrections/history/limitations retained; no receipt/hash/source change.
- Documentation-only consistency/diff checks. No transaction/recovery/durability/performance/general native provenance/release claim upgraded; inherited E4/current-artifact NOT PASS and unverified gates unchanged. STOP awaiting separate S3 authorization; no production/execution/user-data change or Git publication.

## Phase9E-5 — S1 accepted / S2 checked files and lease delivered — 2026-10-26

- User accepts S1 COMPLETE — PASS WITH LIMITATIONS,81 historical PASS retained without rerun; only S2 authorized. New Main-private checked root/file identity, fixed paths, bounded byte reads, exclusive staging/sync/close/read-back, guarded sibling replacement and authenticated shared native lease/retained close retry. No submission transaction/recovery/service/IPC/completion.
- [S2 evidence](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md):29 targeted tests PASS/0 FAIL/0 SKIP, scoped TypeScript/targeted ESLint/diff PASS. Initial one lint no-this-alias error corrected; first27 tests PASS, lifecycle review then revoked stale token release and added two regressions, final29 PASS. Do not sum repeated tests.
- Real Windows x64 Node24.16.0/ABI137 parent-held→child-busy and child-held→parent-busy, release/reacquisition, fixture stage/discard; native hash before/after `97dd803603ba655ab58d1df24e5de4957ff226c8ea31e1491d58c4bcfe0cbcc3` unchanged.0 Jobs/Runtime/Judge; temporary roots only. Lease subset evidence does not certify E4 artifacts or release/native behavior generally.
- S2 REVIEW COMPLETED — AWAITING USER ACCEPTANCE, Phase9E-5 IN_PROGRESS — E5-S2; S3–S6 NOT_STARTED. Retained unverified replacement/unsafe staging awaits future managed reconciliation, no blind retry/reset. Node TOCTOU/UNC/installed/target-host/reliability/power-loss/performance limitations remain. STOP before S3; no build/binary edit/Runtime/ExerciseService/Official/public API/user-data/history restore or commit/push/merge.

## Phase9E-5 — Design approved / E5-S1 pure contracts delivered — 2026-10-26

- User APPROVES Storage Design/six-step plan/E5-D1–D6; only S1 authorized. Main-private pure contracts/strict validation, exact Unicode source/hash, canonical JSON/checksum, document lineage/capacity, candidate routing and idempotency delivered. No I/O/lease/commit/recovery/service/IPC/completion behavior.
- [S1 evidence](PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md):81 synthetic tests PASS/0 FAIL/0 SKIP, scoped typecheck/targeted lint/diff PASS. Real canonical snapshots tested at64MiB/32MiB and +1byte without building whole snapshot strings;2MiB record/16KiB metadata exact limits exercised through byte preflight because valid field/source limits are tighter. No tests/quality failures during S1 execution.
- Phase9E-5 IN_PROGRESS — E5-S1; S1 REVIEW COMPLETED — AWAITING USER ACCEPTANCE, S2–S6 NOT_STARTED. Public Submit/status/read transport allocated to S6 by approved D6; UI/History/Restore remain E6. STOP before S2.
- E4 recorded-hash acceptance/current-artifact handoff NOT PASS/current native UNVERIFIED,12 models PENDING_RUNTIME, general Official60s/target-host/reliability/release UNVERIFIED and deferred gates unchanged. Storage performance NOT MEASURED/durability UNVERIFIED. No build/native/Official/filesystem/restart/smoke/benchmark/user-data operations, history restoration or Git publication.

## Phase 9E-4 — Option A final acceptance — 2026-10-26

- User formally approves recorded-hash acceptance: S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only); Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope);9E-5 NOT_STARTED. This supersedes historical pending acceptance statements below.
- [Accepted evidence](PHASE-9E4-FINAL-ACCEPTANCE.md):4/4 native operations PASS; C#/JS correct Accepted candidate7/7 each, wrong WA at case0/STOP with6 unattempted cases each;22 Jobs, VERIFIED cleanup/content release/zero Registry ledger; historical targeted typecheck/lint/Main emission/diff PASS. Receipts/hashes/drift audit unchanged.
- Current-artifact handoff remains NOT PASS; different current native binary UNVERIFIED; post-run `out/main/index.js` lacks full-app verification. No current-artifact/release certification. Finalized artifacts need release verification;12 models PENDING_RUNTIME, general Official60s/target-host/reliability/release UNVERIFIED and deferred loader/installed/offline/filesystem gates unchanged.
- 9E-5 must design commit-time owner validation, same-operation hold-through-commit and storage/recovery. Public Submit transport remains unimplemented and needs explicit E4-D4 allocation. Documentation consistency review/scoped `git diff --check` only; no tests/native operations/build/restore/production changes, historical document restoration or Git publication. STOP; no9E-5 implementation.

## Phase 9E-4 — E4-S3 accepted / E4-S4 native review — 2026-10-26

- User accepts S3 COMPLETE — PASS WITH LIMITATIONS;37 controlled +60 regressions/97 unique PASS, historical fixture failures/filtered exclusions and limitations retained without rerun. Only S4 authorized.
- [Final review](PHASE-9E4-FINAL-ACCEPTANCE.md): exactly4 native Divide Judge operations PASS, correct-source Accepted candidate7/7 per language and real first-case WA/STOP with untouched6-case suffix per language.16 comparisons,22 real Windows Jobs, VERIFIED cleanup/release and zero Registry ledger after each fixture teardown; no production change or native rerun.
- Scoped tsc/lint, separate50-input Main emission/privacy graph and22-file unchanged-fingerprint checks PASS. Initial new-test Vitest typing and test-only raw-loader emission failures corrected before native execution, retained in report. No S1–S3/full/63×2/UI/smoke/benchmark/release campaign.
- Later handoff audit finds native binary/Main index changed after the successful run;20/22 current fingerprints match. Native receipts remain PASS for recorded hashes, but current-artifact handoff **NOT PASS** and current artifacts UNVERIFIED. No artifact restore/rebuild/additional native operation; user must resolve baseline before closure.
- S4 REVIEW COMPLETED — AWAITING USER ACCEPTANCE; Phase9E-4 IN_PROGRESS — AWAITING FINAL ACCEPTANCE;9E-5 NOT_STARTED.12 models PENDING_RUNTIME, general Official60s/target-host/reliability/release UNVERIFIED. STOP before phase closure/9E-5; no persistence/Submit/history/commit/push/merge.

## Phase 9E-4 — E4-S2 accepted / E4-S3 integration review — 2026-10-26

- User accepts S2 COMPLETE — PASS WITH LIMITATIONS; original110 reducer/93 comparator-contract tests, scoped checks and historical typing/lint failures retained without rerun. Only S3 authorized.
- Integrated same-operation Main-private Judge via owned Prepare view, existing synchronous consumer and service-owned VERIFIED cleanup/release handoff. Explicit borrow/release facts, safe managed retry and document-epoch guard for stale Judge receipts/raw completion; no second lifecycle or public API.
- [S3 evidence](PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md):37 controlled Judge +60 direct service/plan/ownership/privacy regressions PASS, scoped tsc/lint/diff PASS. Initial2 fixture failures (request-reference shape and clock crossing caller wait) recorded/corrected; no Core/reducer change. Final idle-context/leave guard regressions separately passed without broad reruns.
- Phase9E-4 IN_PROGRESS; S3 REVIEW COMPLETED — AWAITING USER ACCEPTANCE; S4/9E-5 NOT_STARTED. Native Judge/full release UNVERIFIED;12 models PENDING_RUNTIME. No language Runtime/driver/Core/Registry/frozen resource/security/quota/deadline changes, build/native/smoke/benchmark/full checks or Git publication. STOP before S4/9E-5.

## Phase 9E-4 — E4-S1 accepted / E4-S2 reducer delivered — 2026-10-26

- S1 user accepted COMPLETE — PASS WITH LIMITATIONS; original93 PASS/0 FAIL/0 SKIP, scoped checks, intermediate lint failures and limitations retained. Only S2 newly authorized.
- Added pure Main-private verdict/eligibility reducer and necessary private fact-contract extensions. Validates binding/plan/prefix/suffix/comparison/disposition/cleanup facts and preserves Core first cause without new quota ranking. No service attestation, execution, comparator semantics, Runtime/public API/data/storage change.
- [S2 evidence](PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md):110 synthetic reducer PASS +93 affected contract regression PASS; scoped tsc/lint/diff PASS after recorded fixture/projection type failures and unused-import lint correction. No E3/full/native/build/smoke/benchmark reruns.
- S2 REVIEW COMPLETED — AWAITING USER ACCEPTANCE; Phase9E-4 IN_PROGRESS; S3/S4 NOT_STARTED.12 models PENDING_RUNTIME; target-host/release UNVERIFIED. STOP before S3; no official persistence authority/commit/push/merge.

## Phase 9E-4 — E4-S1 comparator/private contracts delivered — 2026-10-26

- User approves design/four-step plan/E4-D1–D4 and authorizes S1 only. Implemented Main-private pure exact-typed@1 for six types, dense/rectangular arrays, Unicode, exact values/order and asymmetric Expected-L6/Actual-Runtime bounds; no stringify/reparse/clone/coercion.
- Added type-only scalar verdict/state/owner/evidence/cleanup/eligibility vocabulary. No reducer/precedence execution/service/integration/public transport/persistence.
- [S1 evidence](PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md):93 targeted PASS/0 FAIL/0 SKIP, scoped tsc/lint PASS. Intermediate added sparse literals caused2 test lint errors; corrected without production change, historical failure retained. No E3/full/native/build/benchmark/UI verification.
- Phase9E-3 COMPLETE — PASS WITH LIMITATIONS; Phase9E-4 IN_PROGRESS — E4-S1 delivered PASS WITH LIMITATIONS/awaiting acceptance; S2–S4 NOT_STARTED.12 models PENDING_RUNTIME; target-host/release UNVERIFIED. STOP before S2; no Git publication.

## Phase 9E-2 — S2 accepted / S3 candidate evidence delivered — 2026-10-24

- User accepted S2 COMPLETE — PASS WITH LIMITATIONS, retaining116 PASS/1 SKIP,
  nine language pairs/oracles/private controls and two pending performance models.
- S3 only authorized:162 exploratory rows compacted to73 (18 public/55 hidden)
  in9 ignored candidates,49 fact-derived groups/90 finer facets;44 critical
  correctness and18 broader model kills,2 critical performance items still pending.
- Stable IDs/UTF8/LF/version/hash chain; two clean CLI roots reproduce274 files.
  Shared full-profile validators/reader, actual Registry clone/representation
  ledger/zero shutdown and63-public-projection parity; actual60s Runtime UNVERIFIED.
-109 targeted PASS, typecheck/targeted lint PASS; no production build needed.
  Private csproj inputs fixed to ten sources after diagnosed default-glob Debug
  collision;18 algorithms unchanged, no incidental artifacts deleted. Prior failed
  attempts retained in [S3 report](PHASE-9E2-S3-PILOT-CANDIDATE-EVIDENCE.md).
- PASS WITH LIMITATIONS delivered pending pilot user review; S4–S7 NOT_STARTED.
  No production resources/manifest/compiled anchor/Runtime/contracts changes,
  promotion/Judge/Submit/remaining54 expansion or Git publishing. STOP for S4.

## Phase 9E-2 E2-S2 — Tooling and pilot references delivered — 2026-10-24

- User authorized S2 only after accepted S1/M1=A. Developer-only versioned bounded
  authoring, nine C#/JS references, independent oracles, exact domains, fail-closed
  quarantine and mutation/obligation reports; no frozen Official Set or promotion.
- Fixed offline drivers, cleared NuGet sources, bounded streams/heaps/scratch,
  single-flight/close-drain and source fingerprints. Narrow approved build-helper
  private route/import/emitted-path enforcement; no Runtime/IPC/contracts change.
- Final targeted five-file run116 PASS/1 existing file-symlink SKIP, typecheck,
  targeted lint and build PASS;378 Main/Preload/Renderer outputs audited without
  reference/tool/evidence leakage. Real CLI replay agrees for all9 IDs; baseline
  63 packages/126 samples/252 assets unchanged. Earlier verification failures and
  corrections are retained in [S2 report](PHASE-9E2-S2-TOOLING-REFERENCES.md).
- 155 ephemeral exploratory rows;43 prepared critical models,41 kills/2 pending
  actual Runtime performance evidence, no false 60s certification. Heap limits
  are not OS RSS quotas; S3 frozen-set/release certification remains separate.
  **PASS WITH LIMITATIONS**, S2 IN_PROGRESS pending user acceptance; S3–S7
  NOT_STARTED. No full suite/full lint, new dependency/network or Git publishing.

## Phase 9E-2 E2-S1 — M1 approval and closure — 2026-10-24

- User APPROVED M1=A, Unique Returned String: aa/a valid -> `"a"`, aba/ab invalid,
  no-solution valid -> `""`; no leftmost rule or public samples/constraints edit.
- Separate 16 fixed in-memory MinWindow domain assertions and approved anchors
  PASS; manifest/252 asset baseline unchanged (63 packages/126 samples). Prior
  74 assertions and initial BLOCKED/NOT PASS remain historical evidence.
- All nine pilot worksheets complete, no remaining semantic blocker.
  **E2-S1 COMPLETE — PASS** under user acceptance conditional on verification.
  Phase 9E-2 IN_PROGRESS, E2-S2–S7 NOT_STARTED; no production, Official Sets,
  generators/references, project build/profiling or Git publishing. Stop before S2.

## Phase 9E-2 E2-S1 — Initial semantic inventory delivery (historical) — 2026-10-24

- User APPROVED the Official Test Sets design, seven-step plan and E2-D1–D5;
  D5 approves only the ambiguity-resolution process. Phase 9E-2 IN_PROGRESS,
  E2-S1 only authorized; no E2-S2–S7 implementation.
- Delivered [pilot specification](PHASE-9E2-S1-SEMANTIC-PILOT-SPECIFICATION.md)
  with full 63-package/126-public-sample baseline, all 252 raw asset hashes/lengths,
  63 canonical signature bindings and 126 typed sample checks. Deep domain,
  arithmetic, ordering, obligations/mutants, planned oracle and resource-risk
  worksheets cover exactly nine pilot IDs. No sample/data changes.
- 74 fixed in-memory predicate/classification assertions PASS. This is narrow
  semantic/inventory verification, not C#/JS reference, coverage or Runtime PASS.
  Eight complete-domain worksheets are ready for review; MinWindow M1 (unique
  returned text versus unique interval) remains OPEN. **E2-S1 BLOCKED on M1**;
  full semantic exit gate NOT PASS, report delivered for decision/acceptance.
- No production, Runtime, schema/security/contract, generator, reference solution
  or Official asset changes. No project tests/build/profiling or Git publishing.
  9E1-AC1/S5-AC1 and deferred hosts/platform/reliability gates remain unchanged;
  SDK concurrency prototype NOT PASS — excluded from production. Stop before S2.

## Phase9E-1 Step4 - Public packages and bounded IPC - 2026-10-23

- User APPROVED S4-D1/D2; migrated63 stable-ID public packages (252 assets,
  126 samples) with explicit version2/official:null. Full version1/explicit full
  profile remains5 assets and fail-closed. Only ProductExceptSelf samples changed;
  captured baseline proves other public-field/starter/signature parity.
- Same contained reader/compiled anchor/Registry/ledger, public ownership,
  bounded detached reply packets and owned Prepare Run binding. Existing9D
  adapters/orchestrators/Core/native/quotas/Policy B untouched.
- Bounded list/detail/draft bridge, generic IDs/counts, preserved draft schema1,
  content-version-guarded chunks and truthful package unavailability/retry.
  Monaco/Reset/autosave and8 chapters retained; no Project/Terminal source changes.
- Consolidated26-file targeted evidence703 PASS/1 SKIP; combined build-contention
  theory-file timeouts disclosed in report, unchanged10 tests PASS alone.
  Typecheck,42-file targeted ESLint (41 TS/TSX + smoke script), production build/emitted integrity checks
  and real Electron Monaco/drafts plus C#/JavaScript smoke PASS.
- COMPLETE — PASS WITH LIMITATIONS by formal user acceptance. Steps1–4 accepted
  COMPLETE — PASS WITH LIMITATIONS;9E-1 IN_PROGRESS, Step5 NOT_STARTED. Closure is
  documentation-only; no tests/build/lint rerun or new acceptance evidence. Prior
  FAIL evidence and corrective StrictMode33-test/development smoke evidence are
  retained in the Step4 report.
  Official coverage/live execution of all63, Windows10/UNC/symlink EPERM/opaque
  reparse/installed packaging/concurrent Project-PTY remain unverified; physical
  latency/RSS/GC/startup/stall NOT MEASURED. No Step5/9E-2+ or storage/Submit work.
  [Step4 evidence](PHASE-9E1-STEP4-MIGRATION-BOUNDED-IPC.md).

## Phase9E-1 Step3 resumed — 2026-10-23

- User APPROVED all S3-D1–D4; implemented Main-only lazy registry through the
  existing anchored reader, exact pre-parse/raw/copy reservations and fixed
  16MiB/1m/8MiB accounting. Same-owner single-flight/leases, BUSY, unpinned eviction,
  explicit verified retry and capability readiness; no global Judge READY flag.
- One managed instance, manifest-only nonblocking start, private owned Prepare
  guards/retention and shutdown waiting for original I/O/close and owner cleanup.
  No current Run9D/catalogue/IPC/UI or Runtime/Policy B changes.
- 9 targeted files:500 PASS/1 SKIP; typecheck,10-file targeted lint and required
  Main integration production build PASS. No runtime acceptance/benchmark claim.
  Inherited Windows10/UNC/symlink EPERM/opaque reparse/installed packaging UNVERIFIED;
  latency/RSS/GC/startup/stall NOT MEASURED. Node TOCTOU limitations unchanged.
- User accepted Step3 COMPLETE — PASS WITH LIMITATIONS;9E-1 IN_PROGRESS,9E-0 COMPLETE.
  Acceptance closure is documentation-only; no tests/build rerun or new evidence.
  Steps4/5 NOT_STARTED. [Step3 evidence](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md).

## Phase9E-1 Step2 closure / Step3 historical contract gate — 2026-10-23

- User accepted Step2 **COMPLETE — PASS WITH LIMITATIONS**. Historical468 targeted
  PASS/1 SKIP, typecheck/targeted lint/build/compiled-anchor PASS preserved; no rerun.
  File-symlink EPERM, Node TOCTOU, Windows10/UNC/opaque reparse/installed packaging
  UNVERIFIED; metrics NOT MEASURED. S2-R1–R4 remain APPROVED.
- Step3 authorized; inspection found precise reservation/alias accounting, owner
  single-flight/pinning/admission, scoped readiness and startup/shutdown contracts
  still unspecified. Under the task's explicit gate rule, stop before code and
  present S3-D1–D4 options, all PROPOSED. No L1–L12 or architecture policy changed.
- Phase9E IN_PROGRESS;9E-1 BLOCKED at Step3; Steps4–5 NOT_STARTED. Documentation
  only: no source/tests/config/resources/catalogue changes or executable checks.
  [Step3 report and pending choices](PHASE-9E1-STEP3-LAZY-REGISTRY-READINESS-BUDGETS.md).

## Phase9E-1 Step2 — Resource integrity and Main build assets — 2026-10-23

- User accepted S2-R1–R4; resumed the authorized Step2 after its design blocker.
  Actual deterministic source/dev/packaged roots, bounded safe reader with link/
  identity/length/digest checks, Step1 schema reuse, canonical signature v1 and
  trusted compiled Main manifest anchor. Exact generic Main emission and explicit
  empty bootstrap; no synthetic production cases. Renderer dev-server denies
  private source/emitted asset paths, retaining default secret-file denials.
- 7 targeted files:468 PASS/1 SKIP (file symlink creation EPERM, UNVERIFIED).
  Typecheck/targeted lint PASS; necessary build PASS including unchanged native
  compilation hooks. Actual compiled Main factory reads emitted zero-package
  bootstrap with source-byte parity; fixture-only nonempty emit/anchor verified.
- PASS WITH LIMITATIONS, awaiting Step2 user acceptance;9E/9E-1 IN_PROGRESS,
  Steps3–5 NOT_STARTED. No Runtime/Core/Policy B/quota/catalogue/IPC/UI/registry/
  storage changes or benchmark/9D acceptance. Node TOCTOU/opaque reparse limits,
  Windows10/UNC/installed packaging UNVERIFIED; performance NOT MEASURED.
  [Step2 acceptance report](PHASE-9E1-STEP2-RESOURCE-INTEGRITY-ASSETS.md).

## Phase9E-1 Step1 — Contracts, policy and bounded validators — 2026-10-23

- Explicitly authorized Step1 only; implemented additive public types/Main-only
  package/manifest/official contracts and approved L1–L12 policy. Byte-input parser
  checks UTF-8/BOM, grammar, decoded duplicate keys, Unicode and all structural
  counters before JSON.parse; exact schemas/type bounds/linkage/declared totals
  follow without arbitrary object hooks or package code execution.
- Six targeted test files:438 PASS; typecheck PASS; targeted lint on eight changed
  TypeScript files PASS. Initial sandbox spawn EPERM ran no tests; authorized
  reruns exposed/corrected type narrowing, test fixture state and error-code
  consistency issues before final PASS. No build/full suite/full lint/benchmark.
- Phase9E/9E-1 IN_PROGRESS; Step1 implemented/verified awaiting user acceptance;
  Step2–5 NOT_STARTED. No catalogue,9D Runtime/Core/native/Policy B/quotas, IPC/UI,
  registry/loader, Official Tests, Submit or persistence implementation changes.
  Latency/RSS/GC/startup/stall NOT MEASURED; Windows/installed packaging UNVERIFIED.
  [Scoped acceptance report](PHASE-9E1-STEP1-CONTRACTS-VALIDATION.md).

## Phase 9D — Learning Runtime final acceptance — 2026-10-23

- User accepted **9D Common and overall Phase 9D COMPLETE — PASS WITH
  LIMITATIONS**. 9D.1/9D.2 retain the same accepted status; A01/A02/A03 remain
  FIXED — PASS. 9E–9G remain NOT_STARTED; overall Phase 9 remains IN_PROGRESS.
- Closure reuses Common 14 checks, existing production C#/JS artifacts, the
  907 PASS/11 SKIP targeted merge, A01 32 PASS, A02 23 PASS and A03 88 PASS plus
  real Electron reproduction as independent sets, never one full-suite count.
- All named Windows/UNC/crash-restart/worker/coverage limits, 9G packaging,
  9E Accepted Restore, C# ~7–8s and full lint FAIL (1,106 historical errors;
  targeted lint PASS) are explicitly accepted limits, not new PASS claims.
  Sandbox startup observations and original FAIL artifacts remain unresolved/
  historical as recorded. Documentation closure only; no tests/build/lint rerun,
  no code/test/script change, no commit/push/merge or 9E implementation.
  [Accepted final review](PHASE-9D-FINAL-REVIEW.md). Stop for the next user decision.

## Phase 9D.2 — final user acceptance and closure — 2026-10-23

- User accepted **Step 6 and Phase 9D.2 COMPLETE — PASS WITH LIMITATIONS**.
  Steps 1–5 and 9D.1 retain COMPLETE — PASS WITH LIMITATIONS; **9D Common remains
  IN_PROGRESS**, **9E remains NOT_STARTED**. A01/A02 remain FIXED — PASS.
- Accepted evidence covers end-to-end JavaScript Run, sequential actual/NOT_RUN,
  errors/timeouts/resources, Windows 11 Job/Policy B/cancellation/cleanup/recovery,
  Monaco diagnostics/editor and scoped C#/Project/Terminal regressions. Existing
  907 PASS/11 SKIP targeted-regression merge, A01 32 targeted PASS and A02 23
  targeted PASS remain separate result sets, not one full-suite run.
- Named limits are accepted for 9D.2 closure without becoming PASS: Windows 10/
  UNC and remaining Windows scenarios, 9G packaging/bundled Node, 9E Accepted
  Restore, production UI string[] return, historical full lint FAIL (1,106 errors;
  targeted lint PASS), sandbox startup observations and all other final-review
  gaps. Original FAIL evidence is preserved. Closure uses accepted evidence only;
  no tests/build/lint/benchmark/spike rerun, no code/test/script change or Git
  publishing. No Common/Windows 10/9G gate closure or 9E implementation.
  [Accepted final review](PHASE-9D2-JAVASCRIPT-FINAL-REVIEW.md). Stop for the user's
  next decision.

## Phase 9D.2 — A02 closure accepted and final review — 2026-10-23

- User accepted **A02: FIXED — PASS**; A01 retains **FIXED — PASS**. Existing A02
  evidence: 23 targeted tests PASS, real Electron JS/TS diagnostics without worker
  exceptions, UI JavaScript Run [8,0]/VERIFIED cleanup, typecheck/build/targeted
  lint/diff PASS. Binder retained; each TypeScript worker grows 115.1 KiB / 0.894%.
- Final review recommends **PASS WITH LIMITATIONS** for Step 6 and Phase 9D.2;
  proposes COMPLETE — PASS WITH LIMITATIONS only after final user acceptance.
  Official Step 6 remains IN_PROGRESS — PENDING USER ACCEPTANCE, 9D.2/Common
  IN_PROGRESS. Steps 1–5 retain accepted status. Named Windows/UNC/9G/9E, editor,
  crash/restart, runtime, console and historical lint/traceability limits remain.
- Reused existing 907 PASS/11 SKIP targeted-regression merge, A01's 32 targeted
  PASS and A02's 23 targeted PASS as separate result sets. No new tests/build/lint
  or acceptance reruns; read-only source/hash/artifact review and document
  diff/whitespace only. Original FAIL evidence retained; no code/test/script edits,
  Git publishing or next-phase work. [Final review](PHASE-9D2-JAVASCRIPT-FINAL-REVIEW.md).

## Phase 9D.2 — A01 closure accepted — 2026-10-23

- User accepted **A01: FIXED — PASS**. Existing evidence: 32 targeted tests PASS;
  real Electron reproduction on Windows 11 / Node 24.16.0 PASS; PREPARE_TIMEOUT
  maps to JavaScript TIMEOUT/prepare, remaining samples stay NOT_RUN and lifecycle
  cancellation suppresses stale publication. Cleanup VERIFIED, handles/leases
  closed, workspace removed; typecheck/build/targeted ESLint/diff checks PASS.
- Original pre-fix FAIL evidence remains traceable. This closure changes only
  documentation and reruns no tests/build/lint/acceptance matrix.
  **A02 — Monaco Diagnostics: OPEN — NOT FIXED**; Step 6 **IN_PROGRESS — NOT PASS**;
  Phase 9D.2/Common IN_PROGRESS; Steps 1–5 retain accepted status. Await separate
  A02 approval. [Correction and evidence](PHASE-9D2-JAVASCRIPT-ACCEPTANCE.md#14-a01-authorized-correction--post-fix-verification).

## Phase 9D.2 — Step 6 initial acceptance (pre-A01 fix history) — 2026-10-23

- Added test-only production Electron acceptance and isolated compiler-build
  investigation scripts. Actual installed Node24 samples, return/type failures,
  protocol/resource faults, lifecycle, stale transport, Job/identity/lease cleanup,
  Project Run/PTY isolation and C# regressions have separately scoped evidence.
  Common real-clock 12s/60s and editor/draft fixtures also pass. Windows 10/UNC/9G
  and named compatibility/production-catalogue gaps remain unverified.
- Found a real Prepare timeout observation race: Common PREPARE_TIMEOUT with
  javascript.result.failure=null. Isolated the prior console issue to compiler
  binder elimination in the worker build; default disposable build reproduces
  the `.get` error, annotation-disabled variants return diagnostics. Neither
  production correction is applied; exact proposals/risks await user approval.
- Initial selected regression run: 903 PASS/1 FAIL/1 SKIP; native allocator helper
  was missing. After building the existing helper, native suite 6/6 PASS; selected
  real C# regressions 3 PASS/10 name-filtered skips. Latest per-test results:
  907 PASS/11 SKIP, not a full-suite run. Typecheck/build and new-script lint PASS;
  full repository lint FAIL (1,106 existing spike/evidence errors).
- Verified all 471 baseline source/evidence hashes unchanged (266 src files).
  No production/config/Core/native/dependency/Policy B changes or Git publishing.
  Recommended verdict FAIL. Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE;
  Phase 9D.2/Common IN_PROGRESS. [Acceptance report and full evidence index](PHASE-9D2-JAVASCRIPT-ACCEPTANCE.md).

## Phase 9D.2 — Step 5 JavaScript UI/IPC — 2026-10-23

- Connected the production JavaScript factory to the accepted adapter/orchestrator
  and Main catalogue; added independent bounded JS snapshots over existing IPC/
  Preload, context/revision checks and buffered-event ordering. Existing Result
  Panel tabs show actuals, NOT_RUN and safe syntax/runtime/protocol errors.
  C# factory/DTOs, Editor/autosave implementation, Core/native and Policy B unchanged.
- 172 distinct targeted tests PASS, including C# Result Panel/editor/draft
  regressions; typecheck/build/targeted ESLint PASS. Controlled production Electron
  smoke on Windows 11 with installed Node v24.16.0: three operations/nine Jobs,
  VERIFIED cleanup, released/closed handles and managed shutdown. Renderer console
  `get` errors remain unisolated despite successful source capture/Run/UI checks.
- Step 4 synchronized to COMPLETE — PASS WITH LIMITATIONS using accepted existing
  evidence without acceptance reruns. Step 5 is COMPLETE — PASS WITH LIMITATIONS by user acceptance
  2026-10-23; Step 6 NOT_STARTED. No full suite/full lint/benchmark/spike matrix or
  commit/push/merge. Files, commands, fixture failures and remaining limitations:
  [Step 5 report](PHASE-9D2-JAVASCRIPT-UI-IPC.md). Closure changes documentation
  only, preserves all verification evidence/limits and runs no tests. The Renderer
  console error `Cannot read properties of undefined (reading 'get')` remains
  unexplained and needs investigation in the next separately authorized
  verification stage. Phase 9D.2 stays IN_PROGRESS; Step 6 stays NOT_STARTED.

## Phase 9D.2 — Step 4 JavaScript Orchestrator — 2026-10-22

- Added Main-internal JavaScript execution adapter and admitted-session driver:
  Prepare/Syntax once, sequential fresh Node processes/Jobs, VERIFIED execution
  barriers, ordered actuals and fail-fast exact notRunCaseIndices suffix. Core
  retains original deadlines/output accounting, I/O/handles, cleanup/retry,
  checkpoints/recovery/quarantine. No existing production/test file changed;
  no C#/Core/native/Policy B, Project/Terminal, factory/IPC/UI or contract changes.
- **160 targeted tests PASS**: 18 new unit/lifecycle, 16 real JavaScript native,
  125 selected Common/C# regressions and one real C# multi-case test. JavaScript
  **57 Learning Jobs**, all cleanup VERIFIED, handles closed and leases released;
  C# selected operation used four Jobs. Windows 11 / Node v24.16.0 x64 observed,
  not patch-pinned. Typecheck/build/targeted ESLint/diff/whitespace checks PASS.
  Test-fixture empty-stdin and descendant-diagnostics assertions corrected;
  final native evidence is 16/16 PASS. No architecture/contract amendment.
- Review **PASS WITH LIMITATIONS**; Step 4 IN_PROGRESS pending user acceptance,
  Steps 1–3 retain COMPLETE — PASS WITH LIMITATIONS, Steps 5–6 NOT_STARTED,
  9D.2/Common IN_PROGRESS. Windows 10/actual UNC, packaging/bundled Node (9G),
  concurrent Project Run/PTY and production UI/IPC/end-to-end JavaScript remain
  unverified. No full suite/repository lint, benchmark/spike matrix, dependency
  changes or commit/push/merge. Stop before Step 5.
  [Report/evidence](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md).

## Phase 9D.2 — Step 3 JavaScript Harness & Syntax accepted — 2026-10-22

- Added fixed raw Node child asset with context-owned console/data normalization,
  exclusive Source.json/Harness.mjs files with identity/hash verification, parse-only
  vm.Script syntax checker and Main-internal catalogue sample-0 driver. No student
  evaluation in Electron, multi-case, factory/IPC/UI, Judge/Submit or new dependency.
  Step 1 contracts and existing C#/Project/Terminal/native/Policy B code unchanged.
- **259/259 targeted tests PASS**: 27 unit/lifecycle, 172 JavaScript contracts,
  60 real native operations / **172 Learning Jobs**. All operations cleanup VERIFIED,
  Jobs/handles closed and leases released. Windows 11 build 26200 / Node v24.16.0
  x64 observed, not pinned. Syntax checking never executes student top-level code;
  six types, strict JSON/UTF-8 and syntax/runtime/protocol failures verified.
  Typecheck/build/targeted ESLint and diff checks PASS as recorded in the report.
  No full suite/repository lint, benchmark or spike matrix.
- Initial file-symlink fixture EPERM replaced with a junction reparse test;
  child asset URL global lint declaration corrected. No contract/architecture
  amendment. User accepted Step 3 COMPLETE — PASS WITH LIMITATIONS on 2026-10-22;
  Steps 1–2 retain the same accepted status, Steps 4–6 NOT_STARTED, 9D.2/Common
  IN_PROGRESS. Windows 10/actual UNC, packaging/bundled runtime (9G), concurrent
  Project Run/PTY smoke remain unverified; multi-case orchestration is Step 4,
  production UI/IPC and end-to-end Run are Steps 5–6. These limits are not PASS.
  Documentation-only closure; no production/test edits or repeated execution of
  tests/build/lint/benchmark/spike. Ready for Step 4 — JavaScript Orchestrator,
  awaiting separate implementation authorization.
  No commit/push/merge. [Evidence](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md).

## Phase 9D.2 — Step 2 Node resolver / Prepare probe accepted — 2026-10-22

- Added Learning-only PATH-first stable 24.x resolver, PE/file/alias/junction
  identity validation/revalidation and fixed owned Prepare probe. Core supplies
  512 MiB only for JavaScript Prepare; C# retains null/non-process preparation.
  Original deadlines/raw-output quotas, retained lifecycle/cleanup and Policy B
  remain; no native/Step 1/C# contracts/Project/Terminal or Run factory changes.
- **169 tests PASS**: 159 unit/regression + 9 real Windows probe cases (10 Jobs) + one real
  C# Sum case PASS; 21 other C# cases name-filtered. All probe Jobs VERIFIED,
  owned handles closed/leases released. Windows 11 build 26200 / Node v24.16.0 x64
  observed; no patch pin. Typecheck/build/targeted ESLint/diff checks PASS; details
  recorded in the report. No full suite/repository lint, benchmark or spike matrix.
- Initial native fixture failure retained; wrapper corrected to explicitly
  forward non-enumerable Node-API methods. User accepted **Step 2 COMPLETE — PASS
  WITH LIMITATIONS** on 2026-10-22; Step 1 remains COMPLETE — PASS WITH LIMITATIONS,
  9D.2/Common IN_PROGRESS, Steps 3–6
  NOT_STARTED. Windows 10/actual UNC/packaging, concurrent Project/PTY smoke and
  student JavaScript execution remain unverified. These limits are accepted for
  moving to Step 3 and are not PASS claims; bundled Node/packaging remains 9G.
  C# Prepare/Run and Policy B are unaffected within the verified scope. Step 3 —
  JavaScript Harness & Syntax is eligible, pending explicit implementation
  authorization. Closure changes documents only; no tests/build/lint/benchmark/
  spike rerun, production/test or historical lint changes, commit/push/merge.
  [Evidence and boundaries](PHASE-9D2-NODE-RESOLVER-PROBE.md).

## Phase 9D.2 — Step 1 JavaScript contracts accepted — 2026-10-22

- Added independent JS DTOs/schema, safe diagnostic/failure taxonomy and Common
  mappings; strict six-type JSON validators with UTF-8/Unicode, duplicate-key/
  document, exact shape, byte/depth, index/outcome/exit checks and detached result
  validation. Main-only type ports; no runtime/service/IPC/Renderer or C# changes.
- Three targeted JS/Common/C# suites: **308/308 PASS**. Typecheck/build and targeted
  ESLint PASS; `git diff --check` PASS. Full repository lint NOT PASS: 1,106 errors
  in existing shutdown spike/evidence files, left unchanged. User accepted these
  as an out-of-scope limitation: **Step 1 COMPLETE — PASS WITH LIMITATIONS**.
  Full repository lint itself remains failed; no Node runtime or execution acceptance.
- 9D.2 and 9D Common IN_PROGRESS; Steps 2–6 NOT_STARTED. Ready for Step 2 — Node.js
  Resolver & Prepare Probe, pending explicit user confirmation. Closure updates
  documentation only, reuses recorded evidence and reruns no tests/build/lint/spike.
  No full suite, benchmark, spike,
  installed Node execution or Windows runtime acceptance; no commit/push/merge.
  [Specification/evidence](PHASE-9D2-JAVASCRIPT-CONTRACTS.md).

## Phase 9D.1 — Accepted closure — 2026-10-21

- User confirmed **9D.1: COMPLETE — PASS WITH LIMITATIONS** for installed-runtime
  C# Learning Run on Windows 11. SDK stable 10.x, direct Roslyn, sequential
  compile-once samples, actuals/NOT_RUN, IPC/Result Panel, Monaco drafts and
  Policy B cleanup/isolation are covered by the recorded acceptance evidence.
- Preserved final review evidence: **130 PASS, 1 SKIP in 9 targeted test files**,
  plus previously recorded real Windows 11 Electron/Monaco/.NET/native evidence.
  No tests, build, benchmark or spike rerun for this documentation-only closure.
- Limitations: C# Run approximately 7–8s, optimization after completing Phase 9;
  Windows 10 and packaging unverified; production Accepted-record Restore awaits
  Phase 9E. No unverified scope is promoted to PASS.
- **9D Common: IN_PROGRESS; 9D.2: NOT_STARTED.** Ready to proceed to 9D.2, with
  separate implementation authorization required; no JavaScript/Judge/Submit
  implementation. No production/test edits or commit/push/merge.
- [Accepted final review](PHASE-9D1-FINAL-REVIEW.md). Earlier entries below retain
  their execution-time statuses; this closure supersedes pending C# acceptance.

## Phase 9D.1 — Learning editor draft synchronization correction — 2026-10-21

- Fixed stale React draft echoes overwriting newer Monaco text, moving the caret
  outside the method and dropping characters. Local text remains in Monaco;
  context-keyed initialization and explicit Reset/Restore preserve draft behavior.
- 38 focused regressions PASS; real Monaco/Electron verifies rapid input,
  Unicode paste, selection, undo/redo, context switching, Reset and disk reload,
  with zero stale full-model writes. Typecheck, targeted lint, production/native
  build and diff checks PASS. [Evidence report](PHASE-9D1-EDITOR-SYNC.md).
- Runtime/Policy B/Project unchanged; no commit/push/merge. 9D.1/Common remain
  IN_PROGRESS, awaiting user acceptance.

## Phase 9D.1 — Test Result presentation refinement — 2026-10-21

- Preserved the IDE styling and existing tabs; added horizontal case selection
  with one detail view, named catalogue Input, structured actual Output and
  catalogue Expected. Diagnostics, NOT_RUN and Console remain distinct; no
  comparison, fabricated duration, backend, contract or IPC change.
- Renderer regressions 49/49 PASS; reduced real Windows 11 Electron acceptance
  4 operations PASS. Typecheck, targeted lint, production/native build and diff
  checks PASS. Screenshots and scope: [UI report](PHASE-9D1-RESULT-PRESENTATION.md).
- 9D.1/Common remain IN_PROGRESS awaiting UI acceptance. No commit/push/merge.

## Phase 9D.1 — Production C# Run / Result Panel Step 7 — 2026-10-21

- Connected the existing Learning factory to the compile-once C# orchestrator;
  production Renderer Run uses real Roslyn/.NET via the existing Exercise API.
  Added bounded typed snapshot observations, safe diagnostics/actuals/NOT_RUN and
  preserved owner/frame/document/generation/sequence validation. Fixed a Learning
  polling race where a rejected older invoke could overwrite a newer event.
- Windows 11 Electron 44 acceptance PASS: 12 C# operations / 25 real Jobs,
  actuals [8,0], syntax/signature/runtime failures, timeout/output/memory limits,
  context/reload cancellation and native cleanup-query failure with managed retry.
  Five actual Project Run/PTY probes verify isolation. JavaScript remains
  UNSUPPORTED; Submit disabled; no comparison, Stop/Cancel UI or saved results.
- Focused regressions 411 PASS / 1 existing SDK opt-in SKIP; targeted real-native
  regressions 2/2 PASS. Typecheck, targeted lint, production/native build and diff
  checks PASS. Evidence, screenshot, exact file list and limits:
  [Step 7 report](PHASE-9D1-CSHARP-UI.md).
- No protected-domain/runtime-policy change or commit/push/merge. Windows 10 and
  packaging remain untested here; 9D.1/Common remain IN_PROGRESS pending final
  user acceptance.

## Phase 9D.1 — Multi-case C# orchestration Step 6 — 2026-10-21

- Added a Main-only driver over one admitted Learning session: compile once,
  execute catalogue samples sequentially in separate Jobs, fail fast and collect
  actuals without comparison. Approved result amendment adds exact ordered
  `notRunCaseIndices` alongside the attempted prefix; Harness Protocol v1 stays.
- Added a VERIFIED tree/I/O barrier that retains Jobs, handles, checkpoint and
  pending-task ownership until final Policy B cleanup. Shared 60s operation and
  1 MiB output budgets, per-case 2s and cleanup caller 12s remain unchanged.
- Focused regressions: 350 PASS / 1 existing opt-in SKIP. Real Windows/.NET:
  13/13 multi-case integrations PASS, including six types, middle-case failures,
  cumulative output, owner loss and injected barrier query failure/retry.
  Typecheck, targeted lint and production/native build PASS. Evidence and final
  rebuilt-artifact/diff verification: [Step 6 report](PHASE-9D1-CSHARP-MULTICASE.md).
- No production wiring, comparison/Judge/Submit, protected-domain change or
  commit/push/merge. 9D.1/Common remain IN_PROGRESS; stop for Step 7 approval.

## Phase 9D.1 — Single-sample C# execution Step 5 — 2026-10-21

- Added Main-internal sample-0 execution adapter over production Roslyn, Learning
  Jobs/stdin/EOF and the generated typed harness. Strict byte/protocol/result
  validation, bounded raw output accounting and aggregate Job cleanup remain Main.
- Retained runtime/artifact identities avoid repeating SDK discovery inside the
  2s execute due; productive pipe draining yields promptly. Core maps existing
  semantic failures. No Policy B, quota/deadline or SDK support policy change.
- 346 focused/regression tests PASS (1 opt-in observation SKIP), including nine
  native stdin cases; 22 real .NET execution cases PASS. Typecheck, targeted lint
  and production/native build PASS. Initial deadline/drain failures and fixes:
  `docs/PHASE-9D1-CSHARP-EXECUTION.md`.
- No multi-case, production IPC/Renderer wiring, JavaScript, custom cases,
  comparison, Judge/Submit or protected-domain changes. 9D.1/Common remain
  IN_PROGRESS. Stop for approval before the next step; no commit/push/merge.

## Phase 9D.1 — Native stdin/EOF Step 4 — 2026-10-21

- Added Learning-only one-shot bounded UTF-8 input and EOF, overlapped pipe writes,
  partial-progress/backpressure handling and retained cancellation settlement.
  Existing Job-before-resume, deadlines/quotas/output and Policy B remain unchanged.
- 275 focused/regression tests PASS, including nine real Windows stdin cases;
  one process-result regression PASS. Typecheck, targeted lint and production/
  native build PASS. Evidence/limits: `docs/PHASE-9D1-NATIVE-STDIN.md`.
- No C# assembly/sample, multi-case, IPC/Renderer or protected-domain changes.
  9D.1/Common remain IN_PROGRESS. Stop for approval before Step 5.

## Phase 9D.1 — Roslyn compiler and generated harness Step 3 — 2026-10-21

- Implemented Main-owned typed C# harness/config/source generation and direct
  installed SDK 10.x Roslyn compilation under Learning Windows Job. Explicit
  net10.0 references, fixed entry/arguments/output, exact selection revalidation,
  contained exclusive files and safe bounded diagnostics; no restore/project/server.
- Main-only raw-byte accounting preserves Core's combined output ceiling while
  compiler paths/messages stay out of public snapshot streams. Core retains Job,
  pending I/O and all Policy B cleanup authority; no runtime policy changes.
- 303 focused/regression tests, 10 real Roslyn compile/error/cancellation cases
  and one native process-result regression PASS. Typecheck, targeted lint,
  production/native build and diff checks PASS. Initial generated CS0136 defect
  was corrected; original failed artifact remains. Evidence and exact limits:
  `docs/PHASE-9D1-CSHARP-COMPILER.md`.
- No native stdin, generated-program/sample execution, C# execution adapter,
  IPC/UI wiring, Judge/Submit, protected-domain changes or commit/push/merge.
  9D.1/Common remain IN_PROGRESS; next step awaits explicit approval.

## Phase 9D.1 — Learning process result port — 2026-10-20

- Added an internal Main process-result port to the Learning Windows adapter;
  OS exit, process/stream settlement and bounded Job-memory evidence are observable
  independently from cleanup proof. Nonzero exit is data for future compiler
  diagnostics; existing Common runPhase rejection is preserved.
- Output stays on Core's combined operation limiter, without another output
  accumulator. Deadline/cancellation/native failures retain typed observations
  through cleanup; existing release reconciliation and Policy B remain unchanged.
- Focused Core/service/workspace/contracts/adapter tests: 230/230 PASS. A separate
  real Windows Job test observes exits 0/1/259 and stdout/stderr with normal cleanup;
  it does not compile C# or run the older spike matrices. Evidence/quality checks:
  `docs/PHASE-9D1-PROCESS-RESULT-PORT.md`.
- No native stdin, compiler/harness, C# execution adapter, IPC/UI or protected
  domain implementation. 9D.1/Common remain IN_PROGRESS; compiler resumption
  requires user approval. No commit/push/merge.

## Phase 9D.1 — C# SDK filesystem resolver step 2 — 2026-10-20

- Implemented Learning-only installed stable SDK 10.x resolver, numeric highest
  valid compatible selection, contained filesystem reads, x64/AnyCPU PE/CLR
  validation, compiler/runtime manifests and targeting-pack harness closure.
  Selection is frozen per operation; no Project resolver/global.json, process
  discovery, environment mutation, install/download, patch pin or major fallback.
- Configuration and I/O errors remain distinct, with safe typed messages; read
  handles are identity-checked and closed, cancellation/deadlines checked across
  awaits, pending I/O retained until settlement. No Common policy or lifecycle change.
- 183/183 tests PASS (41 controlled fixtures, one actual installed-filesystem
  observation and 141 contract regressions), typecheck/targeted lint/production-
  native build/diff/new-file whitespace PASS. No full lint or spike rerun.
- Real Windows 11 read-only evidence selected SDK 10.0.112/runtime+reference pack
  10.0.12, 167 reference files in 3,250.364ms; not a product patch lock, compiler
  execution or performance guarantee. Two initial observation failures remain;
  corrected over-broad facade closure without downloading optional packages.
  Details: [Step 2 report](PHASE-9D1-SDK-RESOLVER.md).
- No compiler/harness/native stdin/adapter/composition/IPC/UI implementation,
  protected-domain edits, dependencies or commit/push/merge. 9D.1/Common stay
  IN_PROGRESS. Stop for user review before Step 3.

## Phase 9D.1 — C# execution contracts step 1 — 2026-10-20

- Recorded user-approved direct installed stable SDK 10.x Roslyn/filesystem
  discovery, staged Learning-only native/runtime/DTO extensions and sample-only
  Run without comparison/Submit/persistence. ADR-025 and current status/docs now
  distinguish C# contracts IN_PROGRESS from unimplemented execution support.
- Added standalone C# harness request/response, diagnostic/failure, compile/case/
  aggregate-result DTOs and bounded exact validators; fixed failure tags map to
  existing Common reasons without changing Core. Added Main-only SDK resolver,
  compiler/process-result/adapter ports. Existing Exercise API/Snapshot unchanged.
- Protocol defines typed synchronous Solution invocation, one JSON stdin document
  and response, captured Console streams, OS-observed exit, six data types,
  contiguous/fail-fast samples and bounded UTF-8 data. No expected/verdict/native
  authority in public DTOs; no lifecycle/cleanup proof is inferred from a result.
- 141/141 focused C#/Common contracts PASS; typecheck, targeted lint, production/
  native build and diff/new-file whitespace checks PASS. No SDK/compiler/native
  stdin/adapter implementation, Main/IPC/UI wiring, protected domain changes,
  runtime/spike runs, dependencies, commit/push/merge or full lint rerun.
- Specification: [C# contracts](PHASE-9D1-CSHARP-CONTRACTS.md). 9D.1 and Common
  remain IN_PROGRESS. Stop for user review before Step 2; no execution acceptance.

## Phase 9D Common — live integration acceptance step 7 — 2026-10-20

- Added a separately built test-only Electron fixture using existing injection
  ports; no production entries, debug IPC, language adapter or behavior changes.
  Fourteen groups have bounded evidence for actual native Job/tree/handles/quota
  read-back, IPC, owner navigation/crash, 60s deadline, 12s retained I/O, Policy B
  recovery/quarantine, cleanup/shutdown retry and actual Project Run/Terminal PTY
  isolation. Faults/history gaps/checkpoint seeds are explicitly fixture evidence.
- Real operation including cleanup: 60,115.627ms/28 Jobs; pending I/O caller wait:
  12,224.106ms with one original write. Production Main/Preload still returns
  UNSUPPORTED and managed idle quit succeeds. Three fixture ownership/checkpoint
  errors remain in FAIL artifacts; only completed groups count, and subsequent
  runs select remaining groups rather than repeat successful checks.
- 284/284 targeted regressions, final typecheck, production lint and production/
  native build PASS. Full lint retains 1,106 spike errors and zero outside spikes;
  final diff/new-text whitespace checks PASS. No spike matrix rerun or protected
  source edits, dependencies, commit/push/merge. See
  [acceptance report](PHASE-9D-COMMON-STEP7-ACCEPTANCE.md) for artifacts and limits.
- Common remains IN_PROGRESS: Windows 10 and active production C#/JS adapter
  acceptance are NOT_OBSERVED. Stop for user review; no Common completion claimed.

## Phase 9D Common — Learning Renderer integration step 6 — 2026-10-20

- Added use-exercise-runtime and connected existing Learning/practice components
  to run/snapshot/internal stop/onChanged. Main remains identity authority; context
  disposal, subscription cleanup and identity/revision/sequence guards reject stale
  work. Late admissions after unmount only request cleanup. Observation polls are
  nonoverlapping and change no runtime deadline. Draft/navigation callbacks guard
  unmount; code-at-Run includes source revision.
- Existing Run/Result surfaces show safe running/error/unsupported/cancellation/
  cleanup states and escaped output. Submit stays disabled; no execution Stop/
  Cancel, language adapter, Judge or protected Project/Terminal/Core/Native change.
- 298/298 tests PASS across 22 files (45 Learning plus 253 related regressions),
  typecheck, production lint and production/native build PASS. Updated stale exact
  theory-heading counts to current authored content and scoped expensive fixture
  queries/stubbed unrelated theory in Practice tests; no timeout increases/content
  changes. Full repo lint retains 1,106 historical spike errors, zero outside spikes.
  Final diff/new-source whitespace checks PASS; spike evidence remains untouched.
- Production Electron 44 Renderer/Preload/Main smoke PASS with two real unsupported
  C#/JS invokes, language/exercise/mode reset, reload, disabled Submit/no Stop and
  graceful idle quit. Screenshot inspected. Evidence:
  `out/learning-renderer-step6-1792488905034/`; earlier harness-selector FAILs are
  preserved. beUI duplicates animated label text; fixed the harness selector using
  its existing semantic attributes, without production changes.
- Active-operation Renderer tests use mock APIs; live native execution and Project
  Run/PTY concurrency remain acceptance work. Common stays IN_PROGRESS; stop before
  Step 7. No spike matrix rerun or commit/push/merge.

## Phase 9D Common — typed Exercise IPC/Preload step 5 — 2026-10-20

- Added Learning-only IPC handlers and `studentIde.learning.exercise` bridge,
  exact request/response validation, registered owner/current main-frame authority,
  document epochs and session/generation/sequence filtering. Main errors are
  sanitized; no raw IPC, path/process/native capability is exposed.
- Added bounded owner-specific publication, one shared Preload event listener,
  independent unsubscribe/unload disposal, and one pre-reply event buffer that
  binds only after an authorized response. Existing Core enforces combined UTF-8
  output cap and Policy B cleanup unchanged.
- Added ownership-checked lifecycle stop and snapshot callback in ExerciseService;
  additive Main IPC registration/owner/STOPPING hooks preserve every existing
  protected service's relative shutdown order. No C#/JS driver, UI, Judge/Submit
  or protected Project/Terminal/process/native implementation changes.
- 253/253 targeted tests PASS (11 new IPC, nine new bridge tests); typecheck,
  production lint and production/native build PASS. Active runtime/cancellation/
  pending cleanup evidence uses mock adapters/owners with real Core/filesystem.
  Diff/new-source whitespace checks PASS; full repo lint retains 1,106 historical
  spike errors, zero errors outside spikes, without new exclusions.
- Live Electron 44 built production Main/Preload smoke PASS, evidence:
  `out/learning-ipc-step5-1792485217424/evidence.json`; verified sandbox/isolated
  bridge, real unsupported-backend invoke, malformed/stale request rejection,
  reload/unsubscribe, unregistered WebContents rejection and managed idle quit.
  Active native IPC operation and concurrent live Project Run/PTY acceptance
  remain due. No old spike matrices rerun, commit/push/merge or phase completion.

## Phase 9D Common — ExerciseService and additive Main lifecycle step 4 — 2026-10-20

- Added Main-only ExerciseService with global single-operation/no-queue admission,
  Main UUID/generation/host epoch, immutable request/snapshot boundaries, stale
  owner/work suppression and bounded final-snapshot retention. Missing language
  drivers explicitly reject; no fake successful Run or C#/JS execution implementation.
- Added tracked asynchronous startup recovery, lease/checkpoint retry and orphan
  quarantine; Learning admission stays blocked on pending/failure. Recovery and
  cleanup keep original tasks/ownership across 12 s caller deadlines. Added Core
  metadata injection and safe ownership audit for cancellation before a phase starts.
- Main composition adds the independent Windows factory/owner hooks and managed
  service before WindowManager. STOPPING seals Learning synchronously, then managed
  cleanup blocks graceful completion/window teardown on failure. Existing Project/
  Terminal relative order and DesktopApplication/quit coordinator/process/native
  implementations are unchanged. No IPC/Preload/renderer/Judge/adapter wiring.
- 209/209 targeted tests PASS: 22 ExerciseService, 127 Common/contracts, 60 existing
  Desktop/quit/Project Run/Terminal lifecycle regressions. Actual coordinators are
  tested with mock owners/adapters/window stop ports, including pending startup
  recovery, failed shutdown and retry. Live Electron windows/IPC/Run/PTY acceptance
  remains due. No old native/spike matrices rerun; no phase completion or commit.
- Quality gates: typecheck, production lint (`src tests scripts` and Vite config),
  production/native build and diff checks PASS. Repository-wide lint still reports
  1,106 historical errors, all under spikes; no production exclusions added.

## Phase 9D Common — native Windows Job integration step 3 — 2026-10-20

- Added independent Learning Node-API Job/identity/lease binding and Windows
  runtime adapter. Job hard commit quota and kill-on-close are set/read back before
  suspended atomic Job-list launch, with a strict std-handle list. Main retains
  root identity and ownership before resume; no resume after deadline. Descendant
  membership, handles, accounting and EOF/root observer state gate release.
- Added OS-exclusive non-inheritable file leases, post-release native stage query,
  safe native error mapping and per-Job/per-handle retry. Core preserves Job-limit
  reasons and distinguishes late native errors from results arriving within budget.
  Historical accounting mismatch remains HISTORY_UNVERIFIED, not a live-process claim.
  No PID-based recovery kill or Project process/native implementation changes.
- Separate build script/artifact plus additive electron-vite native build hook;
  no Main composition, IPC, Preload, renderer, language driver, Judge or packaging.
- Verification: 126/126 unit/regression tests PASS (11 new adapter tests, 48 Core,
  67 contracts); five targeted native integration cases have latest PASS evidence
  across timestamped runs under out/learning-native-step3. Root/descendant Core
  cleanup VERIFIED, retained independent handles SIGNALED; 2 GiB/512 MiB quota
  read-back; bounded 64 MiB allocator quota denial plus matching Job event; safe
  ambiguous-release retry; Electron 44.0.0 owner exit releases lease and kills
  descendants; validation/spawn rollback. No watchdog termination counted as PASS.
- Initial owner fixture failed readiness: empty environment omitted SystemRoot
  and Node CSPRNG initialization failed. Diagnostic FAIL evidence retained; fixed
  filtered environment forwarding, then only affected/unrun cases executed. ESM
  fixture/type fixes and deadline guard prompted selected case rechecks, without
  changing quota/timeouts/assertions or rerunning the historical spike matrices.
- Final typecheck, production/native build (/W4 /WX), production/tests/scripts/config
  lint and diff/whitespace PASS; full lint retains 1,106 spike/archive errors, zero
  production errors, no exclusion/rule changes. Actual evidence is one Windows x64
  host, including Electron-as-Node module loading, not full application lifecycle,
  Windows 10/other-machine, language adapter or live Project/Terminal acceptance.
  Common remains IN_PROGRESS; stop for user approval before step 4.

## Phase 9D Common — Learning Runtime Core step 2 — 2026-10-20

- Added six Learning-only runtime modules: session, workspace, checkpoint,
  recovery, limits and runtime adapter/lease interfaces. No application wiring.
  Policy B separates history mismatch from unresolved current termination;
  verified cleanup and acknowledged historical quarantine have different flags.
- Added scoped filesystem checkpoint write/sync/replace/read-back, identity and
  reparse containment checks, exclusive-lease recovery without PID killing and
  stage-aware retry. Completed native actions/deletion are not repeated after
  persistence failure. Pending preparation/cleanup/recovery I/O remains owned
  and concurrent callers join the same original task across 12 s wait failures.
- One monotonic operation deadline spans phases; fixed approved phase limits
  are clamped to it. Both phase and cleanup waits check late results even when
  timer callbacks were blocked. Combined output overflow cancels safely.
- Tests use mock runtime/native actions and a mock lease provider, with real
  temporary filesystem checkpoint/recovery/junction checks. Real Windows Job/
  quota/process proof and crash-released OS leases remain native integration;
  owner admission/IPC/lifecycle and live isolation remain later acceptance.
  Shared contracts remain unchanged; no Project/Terminal/shared process changes,
  new spike, adapter, Judge, packaging, commit or phase completion.
- Verification: 114/114 targeted tests PASS (47 new Core tests + 67 existing
  contracts); final typecheck, production build, production/tests/scripts/config
  lint, new-file whitespace and diff checks PASS. Full lint retains 1,106 errors
  in spikes only, with zero production errors and no exclusion/rule changes.
  Core remains uncomposed; stop for review before step 3, not Common completion.

## Phase 9D Common — approved policy and shared contracts step — 2026-10-20

- Recorded user-approved Policy B, stable installed SDK 10.x / Node 24.x without
  patch lock, initial RAM/time/output/concurrency bounds and scoped integration
  direction. Common is IN_PROGRESS; adapters/Judge/packaging are not started by
  this work. The prior 30/30 shutdown and latest 16/16 resource spike results are
  input evidence, not rerun or production acceptance.
- Added side-effect-free Exercise run/session/lifecycle/snapshot declarations,
  readonly policy constants, exact validators and focused unit tests. Reuses 9C
  draft identities/languages/code bounds. Validators reject privileged fields,
  invalid counters, contradictory clean/quarantine states and combined UTF-8
  output over 1 MiB. DTO validation is not owner authorization or OS proof.
- Verification: 67/67 contract/base-validation tests, typecheck, Windows production
  build (existing native included), changed-source lint, production/tests/scripts/
  config lint and diff check PASS. Full lint still FAILS: 1,106 errors in spikes
  only (1,053 archive/source snapshots, 53 other spike source); no lint rules or
  archived evidence edited. Standard build warnings remain about Monaco chunking.
- No Main service/IPC registration, StudentIdeApi/Preload/native/UI integration,
  runtime adapters or Judge. No Project/Terminal/DesktopApplication/ProcessManager/
  RunService/Project-native source or behavior change. Deadline enforcement,
  ownership, recovery and live isolation acceptance remain subsequent work;
  step 1 ends for user review, without marking 9D COMPLETE.

## Phase 9C closure and isolated 9D.0 runtime prototype — 2026-10-19

- Closed 9C after source/exit-gate review and user-confirmed full manual Electron
  PASS. Recorded prior user-supplied 87/87 tests, typecheck, production/native
  Windows build and diff-check evidence separately from this task's rerun:
  82/82 direct 9C tests plus 4/4 Preload bridge tests. See PHASE-9C-ACCEPTANCE.md.
- Added only a developer spike for C#/JavaScript function execution. Reuses the
  unchanged ProcessManager, Windows Job cleanup and 9C contracts/catalogue;
  selectively ports the argv native primitive/adapter from local C# branch
  commit b4e23fa into an isolated build, without modifying shared source/artifacts.
- Final Windows 11 x64 run: 44/44 scenarios plus two runtime inventory checks
  PASS, including 126 sample calls across all 63 actual starters per language,
  six JSON types, errors, timeout/output limits, Stop and descendant/temp cleanup.
  C# compiles once per run; cases use separate processes. SDK 10.0.112 / .NET
  10.0.12 and Node 24.16.0 are developer installations, not bundled runtimes.
- Builds use private empty package storage and only installed SDK packs;
  assets confirm zero package libraries and no remote restore sources. Network
  was not disabled at OS level; packaged/clean-machine offline acceptance remains
  open. Strict spike typecheck, scoped lint and isolated native/bundle build PASS.
- No production 9D architecture, IPC, UI, Run/Submit/Judge or Accepted storage
  added. 9D/9D.1/9D.2 stay NOT_STARTED; resource/distribution decisions remain
  open. Full evidence and limitations: spikes/exercise-runtime-9d0/REPORT.md.

## Academic Chapter 1 introduction — 2026-10-19

- Reworked the course introduction into an academic opening: book-style serif
  title, concise subject description, three Chapter 1 objectives, course facts
  and reading guidance. Removed promotional slogans and the overview card.
  User explicitly selected this direction for the introduction; Learning colors
  and the left-aligned reading layout remain. Uses installed font fallbacks.
- Retained authored chapter material/code/sources and the continuous scroll
  region; the read button still navigates to Chapter 1. Added no unsupported
  academic credit, duration, prerequisite or assessment metadata.
- Verified typecheck, lint, production/native Windows build, six focused tests
  and diff check. Built Electron layout checks passed at three widths with both
  sidebar states; desktop/narrow Chapter 1 screenshots were inspected. No
  dependency/architecture/IPC change; full-suite/original gates not rerun.

## Learning header and compact tabs — 2026-10-19

- Moved Lộ trình học and its collapse/expand control beside the logo in the
  existing App header. Retained App-owned sidebar state, accessible naming,
  no-drag button behavior and overlay locking. Both logo and expand button
  remain visible in the 64px collapsed header; removed the old sidebar row.
- Reduced the Cursor-style tab control to 13px text and content width, with
  smaller padding and no full-width section divider. Measured about 153 × 31px
  with 6px vertical margins in built Electron.
- Typecheck, lint, production/native Windows build, six focused Renderer tests
  and diff check passed. Electron checked header alignment/fit, button no-drag,
  compact tab geometry, panel/keyboard behavior and both sidebar screenshots.
  Full-suite/original phase gates were not rerun. No dependency/IPC/ADR change.

## Learning beUI Tabs follow-up — 2026-10-19

- Replaced theory/practice buttons with official beUI Tabs, using controlled
  pill tabs. Preserved stock component source and MIT
  attribution, rewiring only local support imports; reused existing dependencies.
- Retained guarded saves, per-chapter selection, drafts and theory scroll state;
  linked accessible panels, keyboard selection and disabled tabs during close.
  Scoped Learning colors and ensured Practice still fills the available width.
  The final user reference is Cursor pricing's Individuel / Teams control:
  5% ink track, 2px inset, #f2f1ed selected pill with subtle shadow, regular 16px
  labels and no icons. Checked the actual reference in Chrome and verified
  both sidebar states, colors/weights, panel/keyboard behavior, screenshots,
  targeted tab/save test, typecheck, lint and final build in Electron.
- Typecheck, lint, production/native Windows build and diff check passed.
  Related tests: 15 PASS / seven FAIL due to existing outdated chapter-section
  counts; the broader group is not claimed PASS. Electron icon/panel/keyboard/
  width checks and expanded/collapsed screenshot review passed. Stock upstream
  emitted ResizeObserver notification warnings during animation measurements.
  No architecture/IPC/runtime change or later-phase authorization.

## Learning document layout correction — 2026-10-19

- Removed nested centering from all eight theory pages; introduction, headings
  and material share a left gutter with the Roadmap expanded or collapsed.
- Reworked Chapter 1 using `docs/learning/system-design.md`: responsive overview,
  light display typography, cream canvas, white hairline panels and 80px section
  spacing. Preserved authored lessons, code, metadata and retained scroll state.
- Verified typecheck, lint, production/native Windows build and five focused
  Renderer tests (15s per-test allowance; seven unselected tests skipped).
  Built Electron layout checks passed for eight chapters at three widths and
  both sidebar states; Chapter 1 screenshot QA passed. Full-suite and original
  phase offline/Terminal gates were not rerun. No architecture/IPC change.

## Phase 9B — Course Content & Lessons (2026-10-17)

- User-authorized final acceptance closes 9B as COMPLETE, with 9A COMPLETE and
  9C NOT_STARTED. No 9C production work or Git publication was performed.
- Integrated supplied Vietnamese manifest and eight Markdown chapters as fixed
  Main-bundled content: 47 content sections and 42 independently authored C#
  examples. Preserved Markdown and source/license-review metadata. Reference
  URLs grant no third-party redistribution rights.
- Added a validated read-only Learning capability, safe Markdown/GFM rendering,
  model-free Monaco C# tokenization, scoped reading styles and source inspection.
  Chapters are continuous pages; Chapter 1 follows the retained introduction.
- Verified 32/32 scoped tests, typecheck, scoped lint, production/native build and
  42/42 C# expected UTF-8 outputs under net10.0. Focused built Electron rendering
  verified all eight pages, real highlighting, tables, unchanged code text,
  metadata and chapter/scroll retention; Chapter 2 screenshot inspected.
- User confirmed Manual Offline PASS in their actual reading environment, with
  inspected chapters/environment unspecified. Accepted limitation: automated
  offline smoke is FAIL/incomplete due to its navigator.onLine assertion; it is
  deferred, not reported PASS. Full manual offline coverage, development-server
  and clean packaged Windows acceptance remain NOT VERIFIED. Preserve 9A limits.
- Evidence and next-package decisions: `docs/PHASE-9B-ACCEPTANCE.md`.
=======
## C# Project Run M2-06 — Windows 11 x64 Electron evidence (2026-11-15)

- The C# Run Electron smoke now forwards line input and drives the Output
  composer. On Windows 11 Home Single Language 10.0.26200 x64 it passed 60/60
  cases, 30 on SDK 8.0.410 and 30 on SDK 10.0.112. Resources ended at 0 and
  every native child was released. ReadLine accepted Unicode, a multiline
  draft, an empty line, and EOF. Stop during ReadLine and during a blocked
  8000-byte write both returned. Re-run dropped the unsent draft. Project
  switch during ReadLine cleaned the session. Killing `dotnet run` ends that
  host tree; killing direct `GateApp.exe` left its child in the job until close.
- JavaScript Run, Terminal job/service, Git native, and C# native, workspace,
  and language-acceptance smokes passed. `npm test` passed 1653/1653. Both
  typechecks and `npm run build` passed. Full-workspace lint still fails in
  preserved prototypes, spikes, and release, and is not claimed green.
- Manual W cells were not run: physical typing, paste, IME, SDK uninstall,
  a missing targeting pack, and closing the app during input. M2-06 and M2-07
  are not COMPLETE. Overall C# Run stays IN_PROGRESS. Phase 7 packaging stays
  NOT_STARTED.

## C# Project Run M2-05 — Output line composer (2026-11-15)

- Output now has Send, Enter, and EOF for a C# execute session that accepts
  input. Shift+Enter and IME Enter do not send. A busy or rejected line stays
  in the box and is not sent again automatically. EOF does not send the unsent
  draft. JavaScript and build stay closed, including a no-writer EOF status.
  Re-run drops the draft and ignores a late acknowledgement.
- 5 composer tests plus the existing C# and JavaScript Output renderer tests
  PASS. Both typechecks and scoped ESLint PASS. No full suite, production build,
  or new Windows manual cell in this package.
- M2-05 COMPLETE. M2-06 and M2-07 remain NOT_STARTED. Overall C# Run stays
  IN_PROGRESS.

## C# Project Run M2-04 — semantic input IPC (2026-11-15)

- The Run bridge now sends a line, closes input, and reads input status. Preload
  and Main both check the project, session, and sequence. JavaScript input is
  rejected as `CAPABILITY_DENIED`. Transport failures hide the raw error. A late
  acknowledgement after owner invalidation, or one for another project or session,
  is not accepted.
- 4 focused IPC tests and 273 related contract, IPC, preload, and renderer tests
  PASS. Both typechecks and scoped ESLint PASS. Output still has no line composer.
  No full suite or new Windows manual cell in this package.
- M2-04 COMPLETE. M2-05 through M2-07 remain NOT_STARTED. Overall C# Run stays
  IN_PROGRESS.

## C# Project Run M2-03 — session input queue (2026-11-15)

- RunService now keeps `writeInput` and `closeInput` and queues UTF-8 lines for the
  C# execute step only. JavaScript and build stay closed. One session preserves
  order, the 16 KiB / 64 KiB / 32 / 10-second limits, and a gate that closes
  before Stop, exit, re-run, project switch, owner loss, and shutdown.
- A full queue rejects the new submission and keeps accepted bytes. Duplicate
  sequences are not written again. EOF follows accepted bytes and a repeated
  close does not close the pipe twice. A write timeout stops the session.
  A broken pipe closes input and leaves the process to its normal exit.
- 11 focused queue tests and 141 Run regression tests PASS. Both typechecks and
  scoped ESLint PASS. No IPC, preload, renderer, full suite, or new Windows
  manual cell in this package.
- M2-03 COMPLETE. M2-04 through M2-07 remain NOT_STARTED. Overall C# Run stays
  IN_PROGRESS.

## C# Project Run M2-02 — native Run stdin (2026-11-15)

- Added a Run-only overlapped stdin pipe (`createRunInput`) with one asynchronous
  UTF-8 write, a 16 KiB bound, ordered EOF, and Stop cancellation. JavaScript and
  build still use closed `createRun`. The C# language writer and Git entry points
  stay on their existing pipes.
- The Windows adapter exposes optional `writeInput` and `closeInput`. Closed mode
  rejects both. RunService still drops those methods until M2-03.
- Native module rebuilt for Electron 44 / Windows x64. Input smoke PASS: repeated
  Unicode, a 9000-byte write, idempotent EOF, broken pipe, one in-flight writer,
  and Stop unblocking a full pipe as `cancelled`. Focused tests 12/12. Typecheck
  and scoped ESLint PASS. No full suite, full-workspace lint, or new Windows
  manual cells in this package.
- M2-02 COMPLETE. M2-03 through M2-07 remain NOT_STARTED. Overall C# Run stays
  IN_PROGRESS.

## C# Project Run M2-01 — input contracts (2026-11-15)

- Added lexical `sendInput` / `closeInput` contracts, line normalization, 16 KiB
  UTF-8 bound, acknowledgements, and input status. JavaScript and C# build stay
  closed. Only a C# execute step is described as line-input. No command or
  process fields. Duplicate-sequence and session ownership remain Main checks.
- 23 new contract tests and 129 focused contract tests PASS. Typecheck and scoped
  ESLint PASS. No native, IPC, preload, renderer, or queue change.
- M2-01 COMPLETE. M2-02 through M2-07 remain NOT_STARTED. Overall C# Run stays
  IN_PROGRESS.

## C# Project Run M1-12 — suite blocker resolved (2026-11-15)

- Raised the Windows real-Git integration suite timeout to 20 seconds. Assertions
  are unchanged. The file passes 32/32 alone and inside `npm test --maxWorkers=4`.
- Excluded `prototypes/**` from Vitest collection. The untracked spike files stay
  on disk. No C# Run product, IPC, preload, native, dependency, or ADR change.
- `npm test` exits 0: 100 files, 1608/1608. Focused C# matrix 613/613. Typecheck,
  production build, and `git diff --check` PASS. The existing Windows 11 x64
  smoke remains 48/48 on SDK 8.0.410 and 10.0.112.
- M1-12 is COMPLETE. Overall C# Run stays IN_PROGRESS. M2 stays NOT_STARTED.
  Full-workspace lint was not re-run and is still the earlier unrelated failure
  in preserved prototypes, spikes, and release. Unrun manual cells are not
  claimed PASS.

## C# Project Run M1-12 — acceptance re-check remains BLOCKED (2026-11-15)

- Re-ran the core matrix without product changes. Focused C# Run tests: 613/613
  across 22 files. Windows 11 x64 Electron 44 smoke: 24/24 on SDK 8.0.410 and
  24/24 on SDK 10.0.112; owned resources and source leases returned to 0.
- `npm run typecheck` and `npm run build` PASS. `npm test` FAIL: one parallel
  Git integration timeout that passes 32/32 alone, plus six untracked prototype
  files Vitest cannot collect. Full workspace lint remains the previously recorded
  unrelated failure. Hard root kill, root-unavailable recovery, shutdown during
  build, physical SDK removal, and a simultaneous Terminal/Git/language smoke
  were not claimed.
- M1-12 stays BLOCKED. Overall C# Run stays IN_PROGRESS. M2 stays NOT_STARTED.
  No ADR, dependency, or execution-policy change.

## C# Project Run M1-11 — re-verification (2026-11-15)

- Rechecked the existing workspace target chooser, unified Run/Stop, project
  Save-first guard, phase/failure Output, and JavaScript current-file path.
  No product code, preload, Main, or ADR change in this pass.
- Focused renderer tests PASS: C# UI 29/29, JavaScript Output integration 22/22,
  source-guard 14/14. Typecheck, production build, scoped ESLint, and
  `git diff --check` PASS. Full workspace lint still fails only in preserved
  prototypes, spikes, and release files (2560 errors, 7 warnings).
- The 2026-11-12 Electron/net8.0 UI smoke was not rerun. M1-11 remains COMPLETE.
  M1-12 remains BLOCKED. M2 remains NOT_STARTED.

## C# Project Run M1-12 - Core acceptance BLOCKED (2026-11-12)

- Verified 24 distinct real Electron/native Core cases per SDK 8.0.410/net8.0 and
  10.0.112/net10.0 on Windows 11 x64: selection/persistence/stale target, phases,
  streams/exits, build/restore failures, Save-first/conflicts, all-phase Stop,
  source invalidation, project/owner loss and retained cleanup/Retry Stop.
  All successful cases release owned native children/leases; final resources 0.
- Fixed one reproduced UI defect: rejected preflight output was erased by automatic
  discovery. Retain the error until explicit refresh and invalidate stale READY.
  Added a failing-then-passing UI regression; 65 focused UI/source-guard tests PASS.
  Corrected only CommonJS lint metadata in the existing C# mockup runner.
- JS production UI/native smoke PASS (8 sessions, 5 re-runs, Stop, streams,
  Output tabs, exits 0/7). Final npm test: 1608 tests/100 project files PASS,
  command FAIL due to 6 untracked prototype collection failures. Typecheck/build
  PASS. Full lint FAIL: 2560 errors/7 warnings in preserved unrelated files;
  supplementary tracked/addition scope 358 files has 0 errors. Diff check PASS.
- Added Core smoke script and updated existing plan/map/capability docs only;
  raw evidence remains in out/m1-12. No separate report, ADR/dependency change,
  Learning/AI/Terminal/Language Server change, release change or Git publication.
- M1-12/Milestone 1 BLOCKED: full-workspace gates and explicitly listed fresh
  Windows manual evidence are not complete. Overall C# Run IN_PROGRESS; M2 is
  NOT_STARTED. No stdin/ReadLine or packaged/installer acceptance claim.

## C# Project Run M1-11 — Workspace UI (2026-11-12)

- Extended the existing Run toolbar/controller and Output using M1-10 typed APIs;
  added a compact shared-Dialog target chooser. Main retains target authority and
  persistence. Single/multiple/no-target, stale/recovered choices, dirty/conflict
  Save-first checks, no-editor Run, Stop/Re-run and JS compatibility are covered.
- Added phase separators, build/runtime failure and exit results, early queued Stop,
  retained cleanup retry, discovery cancellation and stale activation/session/target
  rejection. No auto-save, second execution mechanism, dependency or ADR change.
- 288 focused tests/10 files PASS; final UI regression run 28/28 PASS (289 distinct
  cases across runs). Scoped typecheck/lint/build PASS; real Electron/net8.0 UI smoke
  seven sessions PASS, including Stop in all three phases and zero remaining owned
  resources. Narrow 900px dialog and both themes visually inspected.
- M1-11 COMPLETE only. M1-12, Console.ReadLine/stdin (M2) and release work remain
  outside this task. Existing unrelated untracked work is preserved; no full suite,
  separate report, commit, push or merge.

## C# Run pre-UI R2 — Public selection diagnostics (2026-10-08)

- Extended existing C# resolution DTO with optional selectionDiagnostic containing
  only STALE_TARGET/PERSISTENCE_RECOVERED. Main projects safe TargetStore issues;
  shared validation also protects Preload responses and rejects READY contradictions.
- Ordinary/legacy payloads and JS Run API remain compatible. One remaining eligible
  candidate does not override stale/recovered SELECTION_REQUIRED; no storage policy,
  ownership, execution, native or UI changes and no additional API/dependency.
- 25 new tests and 212 focused tests in 7 files PASS; typecheck/scoped ESLint/diff
  PASS. Deleted/renamed/ineligible target, corrupt recovery with/without backup,
  explicit confirmation, invalid diagnostics and leak prevention verified.
- Review R2 resolved; R3 real IPC/native evidence gap remains for Core Acceptance.
  M1-11 NOT_STARTED, M1/overall C# IN_PROGRESS; no full suite/build/native smoke.

## C# Run pre-UI R1 — IPC phase metadata retirement (2026-10-08)

- Reproduced stale IPC phase metadata after unavailable project cleanup: terminal
  session/resources retired, public events muted, one phase record still retained.
- Added a Main-only RunService finalization callback to retire only the matching
  owner/session metadata independently of public event delivery. Active/failed
  cleanup records remain until terminal cleanup, including reload/IPC shutdown.
- 6 new R1 cases and 153 focused Run IPC/lifecycle/Preload tests PASS; typecheck,
  scoped ESLint and diff checks PASS. No native/command policy/public contract/UI
  change; no full suite/build/native smoke, R2 implementation or commit/push/merge.
- M1-11 remains NOT_STARTED; M1 and overall C# Run remain IN_PROGRESS.

## C# Project Run M1-10 — Typed IPC/Preload integration (2026-10-08)

- Extended studentIde.run with semantic target resolve/select/clear/cancel,
  startProject and project-event subscriptions. Legacy JS methods/events remain
  compatible; Stop uses existing owned session identity for both kinds.
- Added exact request/result/event validators and trusted frame/project checks.
  Async replies recheck project identity and owner generation. Project events
  expose phases, output, exit and allowlisted failures, never native error details.
- Added finite target-request scope ownership using the existing resolver/store/
  evaluator. One outstanding operation bounds probes; cancellation, project
  transitions, filesystem unavailability, reload/crash/destroy and shutdown join
  cleanup. Retained cleanup blocks replacement. Start keeps early session response
  and existing selection/source revalidation; no Renderer path can bypass selection.
- Verification: 63 new tests/4 files and 443 focused regressions/17 files PASS;
  typecheck, scoped ESLint and tracked/new-file whitespace PASS. Tests cover real
  persistence/domain integration through Preload/IPC with controlled SDK/process ports.
  They caught successful-transition lease release and cancellation-during-cleanup
  races; both fixed. Existing API-shape assertions updated; no flaky-test workaround.
- No full suite, build or native smoke because native/execution implementation is
  unchanged. No C# UI, stdin, new dependency, ADR change, commit, push or merge.
  M1-10 COMPLETE; M1-11 NOT_STARTED; Milestone 1/C# Run IN_PROGRESS. Commands and
  API usage: `spikes/csharp-project-run/M1-10-REPORT.md`.

## C# Project Run M1-09 — Build/execute strategy (2026-10-08)

- Added Main-only CSharpRunStrategy and owned preparation composition using fresh
  M1-06/07 selection and M1-05 evaluation. Immutable M1-04 Debug build/run commands
  include build-server/node-reuse restrictions; effective SDK/TFM drift invalidates
  the plan. The existing M1-08 session and M1-09a source guard own all lifecycle steps.
- Build failure never executes; safe reasons classify SDK/preflight/build/runtime/
  spawn/observation/cleanup failures. Cleanup failure retains resources and blocks
  replacement. Main registers C# but the legacy public Run API still rejects it.
- Verification: 30 new tests and 384 focused tests/13 files PASS; typecheck,
  scoped ESLint and tracked/new-file whitespace PASS. JavaScript regressions PASS.
  No full suite/application build or unrelated smoke; only a scoped Main bundle.
- Real Windows 11 x64 SDK 8.0.410/net8.0 and 10.0.112/net10.0 smoke: 14/14 PASS,
  plus 4/4 repeated resource cases. All 290 native process objects released,
  zero owned resources/new process survivors, warmed handles 677/677/677/677.
  An initial harness EPIPE was diagnosed and rerun with captured log files;
  production native/process code was unchanged. Details and commands:
  `spikes/csharp-project-run/M1-09-REPORT.md`.
- M1-09 COMPLETE; M1-10 NOT_STARTED; Milestone 1/C# Run IN_PROGRESS. No ADR change,
  public C# IPC/UI, stdin, auto-save, new dependency, commit, push or merge.

## C# Project Run M1-09a — Bounded saved-source handshake (2026-10-08)

- Added RunSourceGuard with exact owner/frame/project/session/request validation,
  a five-second timeout and 64 live approval records. Null revision or dirty/
  conflict source refuses preparation; changed revision invalidates old approval.
- Added a narrow studentIde.runSourceGuard Preload capability and minimal Renderer
  request/release/revision handler. EditorModelManager aggregates all retained
  project buffers, including non-active/reference/configuration files and external
  conflict/missing state. No buffer contents, auto-save/discard or new Run UI.
- Integrated initial/per-step/prelaunch checks into M1-08 C# plans. Stop, project
  change, owner loss/crash and shutdown retire pending guards; build edits abort
  and cleanup without bypassing retained cleanup failure. Already-executing
  programs are unaffected by subsequent edits. JavaScript Run API stays unchanged.
- Verification: 67 new tests in 5 files PASS; 380 focused tests in 16 files PASS
  covering Editor Save/dirty, contracts/IPC/Preload, JS Run and lifecycle/identity.
  Typecheck, scoped ESLint and tracked/new-file whitespace checks PASS. Existing
  jsdom canvas notice is not a test failure. No flaky tests.
- Production guard/bridge/editor/lifecycle integration uses controlled process
  fixtures. Successful cleanup has zero owned resources/guard records; cleanup
  failure retains resources for retry. No full suite, build or native smoke run;
  native/process adapters remain unchanged. Approval is not a disk snapshot.
- M1-09a COMPLETE; M1-09 NOT_STARTED; Milestone 1/C# Run IN_PROGRESS. No new ADR,
  dependency, CSharpRunStrategy/dotnet build/run, stdin, commit, push or merge.

## C# Project Run M1-08 — Cancellable execution-plan lifecycle (2026-10-08)

- Extended RunService/RunStrategy with Main-only immutable JS one-step and C#
  build-restore/execute plan infrastructure. No production CSharpRunStrategy,
  dotnet build/run, public IPC/Preload/UI migration, source handshake or stdin.
- Early STARTING reserves canonical identity before asynchronous preparation.
  AbortSignal and registered session-owned preparation resources permit Stop
  without waiting for preparation promises; late work cannot register or launch.
- Reauthorize canonical target/runtime and whole-plan fingerprint before each
  launch. Step generations suppress old callbacks; successful intermediate exit
  waits for tree/root/EOF/native release and ProcessManager removal before advance.
- Reused existing session/target maps, Stop/re-run/project/owner/shutdown ownership
  and fail-closed cleanup. Failed cleanup retains resources, blocks replacement
  and requires retry. Existing JS live start/prepare/launch/event behavior remains.
- Verification: 31 new plan tests; 145 focused tests across 7 files PASS, including
  JavaScript, project lifecycle, identity/runtime and ProcessManager regressions.
  Typecheck, scoped ESLint and tracked/untracked whitespace checks PASS.
- Native/process adapters unchanged; no full suite, build or native smoke run for
  this TypeScript infrastructure package. Fake cleanup evidence shows successful
  sessions release all owned resources; real production C# acceptance remains M1-12.
- M1-08 COMPLETE. M1-09a/M1-09 NOT_STARTED; Milestone 1 and C# Run IN_PROGRESS.
  No new ADR, dependency, commit, push or merge.
>>>>>>> origin/develop

## Phase 1 — Orca Analysis & Architecture Design

### Analysis

- Verified and studied Orca repository `https://github.com/stablyai/orca` at locked Reference Commit `4bb337741c335cfcc428d3b4271023566e2dadb8` outside the Student Coding IDE source tree.
- Analyzed Electron lifecycle, process/security boundary, IPC, project/workspace, filesystem, Monaco, terminal, execution, Git, persistence/settings, UI state, AI/worktree coupling, and remote/mobile concerns with file and symbol evidence.
- Classified reference subsystems with `REFERENCE`, `REIMPLEMENT`, `ADAPT`, `ADD`, and `OMIT` semantics.

### Student Coding IDE design

- Defined an independent main/preload/renderer architecture and process-ownership matrix.
- Defined typed, validated, domain-scoped IPC with request/response, event, lifecycle, cancellation, cleanup, and serialized errors.
- Separated Terminal PTY, Run, and Language Server process semantics.
- Defined project-scoped filesystem access, Monaco model ownership, Git CLI abstraction, language-service lifecycle, dependency state, persistence/recovery, logging, and Windows process cleanup boundaries.
- Selected xterm.js + `node-pty` subject to the Phase 2 Windows/native compatibility gate and selected direct local Git CLI behind a typed service.
- Recorded Phase 3 language-provider and Phase 4 TypeScript-run decisions as explicit gates rather than inventing implementation claims.

### Documentation

- Added `ARCHITECTURE.md`.
- Added `ORCA-ANALYSIS.md`.
- Added `CODEBASE-MAP.md`.
- Added `LANGUAGE-SUPPORT.md`.
- Added `DECISIONS.md`.
- Added this thesis changelog.
- Reconciled Phase 1 architecture decisions, phase boundaries, and terminology across project documentation.

### Implementation status

No Core IDE feature was implemented in Phase 1. No Orca source, module, commit, submodule, or runtime dependency was copied into Student Coding IDE.

## Phase 2A — Core Contracts & Application Foundation

### Foundation implementation

- Added deterministic application startup/shutdown ownership and a secure WindowManager preserving sandbox, context isolation, disabled Node integration, exact application-origin navigation, and HTTPS-only external opening.
- Added side-effect-free shared contracts, structured AppError serialization, explicit runtime IPC validation, narrow lifecycle preload APIs, handler cleanup, and lifecycle status events.
- Added canonical project identity and project-relative path foundations with Windows drive-letter, case, separator, and UNC normalization behavior.
- Added versioned JSON persistence with schema validation, serialized temporary-file replacement, last-known-good backup, and corrupt/unsupported-state recovery.
- Added a limited internal owned-resource ProcessManager foundation without Terminal, Run, language-server, or generic command execution.

### Decisions and verification

- Resolved ADR-016 with explicit validators for the current small IPC contract surface.
- Recorded HTTPS-only external URL handling in ADR-017.
- Resolved the Phase 2A Test Infrastructure Gate in ADR-018 with Vitest and the stable `npm test` command, including CI execution.
- Added focused automated coverage for contracts, errors, lifecycle, IPC validation, security/navigation, project identity/path handling, persistence/recovery, cleanup ownership, and preload subscription cleanup.
- Verified typecheck, lint, build, tests, and documentation diff checks before marking Phase 2A complete.

### Scope boundary

No Phase 2B Explorer/filesystem workflow, Monaco/editor, Search, Terminal, Run, Git, Language Intelligence, Settings UX, or other later work-package implementation was added.

## Phase 2B — Project & File Explorer

### Project and filesystem implementation

- Added one-active-project open, empty-project creation, close, and switch flows through main-owned folder selection and canonical project identity.
- Added a mandatory transition-guard boundary for every project close/switch path without implementing Phase 2C dirty-editor decisions.
- Integrated minimal recent-project metadata with the existing versioned persistence service.
- Added a main-owned FileSystemService for immediate-child listing, stat, UTF-8 read, exclusive file/folder creation, non-overwriting rename, and Recycle Bin deletion.
- Added repeated project authorization, lexical containment, canonical containment, Windows path/reserved-name checks, and symlink-escape rejection immediately before privileged mutations.
- Added a bounded native watcher for the active project with switch, close, shutdown, runtime-error, and stale-event cleanup.

### Contracts, bridge, and UI

- Added explicit validated `project:*` and `file:*` request/event contracts and dedicated IPC adapters.
- Extended the preload API only with typed `project` and `file` capabilities; raw IPC, Electron, filesystem, shell, and generic command capabilities remain unavailable to Renderer.
- Added a responsive Project/Explorer UI with no-project, loading, empty, error, selected-entry, refresh, and mutation states.
- Added lazy directory expansion that requests only the root or explicitly expanded immediate children, plus a read-only file preview without Monaco, tabs, editing, or save behavior.
- Added explicit Renderer confirmation before every delete; Main uses Electron Recycle Bin handling and never falls back to permanent deletion.
- Realigned the Phase 2B Renderer with Orca's locked visual/interaction baseline through an independently implemented dark IDE shell, compact project controls, dense Explorer rows and toolbar, restrained states, and compact workspace/status chrome; removed the unapproved bespoke student-workbench styling without changing Phase 2B behavior.
- Recorded Orca as the primary visual and interaction reference for future visible IDE UI while preserving Student Coding IDE requirements, architecture, security boundaries, source independence, and scope authority.

### Verification and scope boundary

- Fixed the Explorer mount guard for React StrictMode so a successful initial root listing is applied after the development-only effect setup/cleanup replay instead of leaving the tree in its loading state.
- Correctively reopened Phase 2B after final adversarial review found concurrent transition, Create Project compensation, stale preview, and Renderer integration-coverage defects.
- Serialized every project open/create/close/switch transition, evaluated guards against authoritative state inside that boundary, rejected reentrant deadlock attempts, released the queue after failure, and drained in-flight work safely during shutdown.
- Added empty-only, non-recursive compensation for a directory created by a failed Create Project operation; pre-existing targets and unexpected content are never recursively removed, and cleanup failure crosses IPC as a safe structured error.
- Added generation-based stale-response protection for file previews, project state, and directory refreshes, including project switch, close, selection change, StrictMode replay, and unmount behavior.
- Added focused project lifecycle, transition guard, filesystem, path/Windows/UNC, symlink, race authorization, watcher, IPC, preload, error-mapping, lazy-state, immediate-root-enumeration, refresh-state, delete-confirmation, and jsdom component-integration tests.
- Extended ADR-018 with explicitly approved development-only `jsdom`, `@testing-library/react`, and `@testing-library/dom`; Main, service, security, and IPC tests remain in the Node environment.
- Verified 100 Vitest tests across 16 files, typecheck, lint, production build, adversarial security/lifecycle review, and whitespace checks before returning Phase 2B to complete.
- Left ADR-011 unresolved because focused React state remains sufficient.
- Added no Phase 2C+ Monaco/editor/save, Search, Terminal, Run, Git, Language Intelligence, Problems, or Settings UX implementation.

## Phase 2C — Monaco Editor, Tabs & Save

### Editor and model lifecycle

- Added locally bundled Monaco with explicit editor, TypeScript/JavaScript,
  HTML, CSS, and JSON worker entry points and a thin `@monaco-editor/react`
  mounting layer.
- Added a renderer-owned EditorModelManager with one canonical model per
  normalized project/file identity, language assignment, retained tabs,
  active-tab selection, dirty baselines, version-aware save snapshots, view
  state, and explicit listener/model disposal.
- Kept the editor session above transient React effect lifecycles so Vite Fast
  Refresh does not clear active tabs or dispose canonical models; real renderer
  page unload remains the disposal boundary.
- Replaced the Phase 2B read-only preview with editable Monaco tabs while
  preserving the established Orca-aligned application shell.

### Data safety and external changes

- Added validated project-scoped file writes through the existing Main-owned
  FileSystemService and narrow preload bridge; Renderer receives no direct disk,
  Node, Electron, or generic command capability.
- Added Ctrl+S and version-aware dirty clearing so a stale save cannot mark a
  subsequently edited model clean.
- Added Save / Don't Save / Cancel protection for dirty tabs and consolidated
  Save All / Don't Save All / Cancel decisions for project/application
  transitions and affected folder descendants. Save failure, renderer loss,
  invalid ownership, stale resolution, and timeout fail closed.
- Added clean external-file reconciliation into the retained Monaco model while
  preserving clean state, plus dirty-buffer conflict warnings that never
  overwrite local edits.
- Added generation and model-identity guards for out-of-order watcher reads,
  project switches, closed/reopened files, saves, and Fast Refresh lifecycle
  replacement.

### Corrective runtime review and verification

- Corrected a Monaco layout defect caused by an unused grid row consuming the
  flexible editor area; the editor now fills its flex parent and resizes without
  hard-coded viewport heights or overlays.
- Corrected an intermittent active-editor reset caused by transient hook cleanup
  disposing renderer-session models during React/Vite refresh.
- Added deterministic unit and jsdom integration coverage for canonical identity,
  dirty/save races, unsaved decisions, watcher reload/conflict behavior,
  out-of-order responses, stale projects, disposed documents, Explorer refresh,
  StrictMode/Fast Refresh lifecycle, and Main transition ownership/cleanup.
- Manual Electron smoke passed edit/save/reopen, clean external reload, dirty
  conflict protection, application-close decisions, tab/model undo and view
  retention, Fast Refresh retention, resize/layout, and Monaco workers.
- Verified 134 Vitest tests across 18 files, typecheck, lint, production build,
  adversarial data-safety/lifecycle review, and whitespace checks before marking
  Phase 2C complete.

### Scope boundary

No Phase 2D project search, Terminal, Run, Git, Language Intelligence, Problems,
Settings UX, formatter, debugger, or extension-host work was added.

## Phase 2D — Project Search (`COMPLETE`)

### Search service and security boundary

- Added a Main-owned SearchService using only Node built-ins and the active
  ProjectService authorization boundary; no dependency, external executable,
  search binary, native module, or generic filesystem capability was added.
- Added literal case-insensitive disk-content search with asynchronous streaming
  directory traversal, owner/project operation IDs, cooperative supersession,
  owner-scoped cancellation, and renderer-liveness checks.
- Added default `.git`, `node_modules`, `dist`, `build`, and `out` exclusions;
  all symbolic links, obvious binary extensions, NUL-containing content,
  unreadable entries, and files over 1 MiB are skipped safely.
- Bounded traversal to 50,000 entries and 10,000 scanned text files, results to
  1,000 matches in batches of 50, query length to 256 characters, and previews
  to 240 characters.
- Added explicit validated `search:start`, `search:cancel`, and `search:event`
  contracts plus a narrow typed preload bridge. Renderer supplies no root or
  absolute path and receives no Node, raw IPC, shell, or process capability.

### Search UI and editor integration

- Added persistent `Explorer | Search` tabs inside the existing right sidebar;
  Explorer remains the default and switching tabs preserves both feature state
  without remounting editor models.
- Added idle, searching, cancellation, grouped-result, no-result, bounded-result,
  and structured error states with file paths, line numbers, and text previews.
- Added search-result navigation through the existing editor workspace. It opens
  or reuses the canonical Monaco model, activates the existing tab, reveals and
  selects the match, and focuses the editor without changing saved baselines,
  undo state, dirty content, or disk content.
- Added independent renderer guards for superseded query events, project-switch
  events, component cleanup, and out-of-order file opens.

### Orca UI parity corrective pass

- Re-audited the complete visible Phase 2Bâ€“2D shell against the locked Orca
  commit `4bb337741c335cfcc428d3b4271023566e2dadb8` as a strict visual and
  interaction reference, while retaining an independent implementation.
- Rebalanced the three-column shell with 280 px session-only resizable sidebars,
  moved editor tabs into the Orca-style top-chrome hierarchy, introduced semantic
  dark surface/text/border/focus tokens, and aligned Projects, Explorer, Search,
  workspace empty state, and footer density and hierarchy.
- Enabled Electron's native hidden title-bar overlay with a renderer drag region,
  preserving native Windows controls and all existing BrowserWindow security
  flags.
- Added the explicitly authorized `lucide-react` icon package and OFL-1.1 Geist
  font package through normal dependency workflows; no Orca asset or source was
  copied and no second icon system was introduced.
- Replaced native prompt/confirm flows with Student IDE-owned focus-contained
  dialogs while preserving project transition serialization, dirty-file choices,
  save-failure blocking, and Main-owned Recycle Bin deletion.
- Added an Orca-aligned Search query row with a 180 ms debounce, immediate stale
  operation supersession, delayed visible loading feedback, collapsible groups,
  and case-insensitive literal preview highlighting.
- Added focused regression assertions for title-bar configuration, sidebar
  resizing, dialog focus/Escape behavior, Search debounce/loading, result
  highlighting, and result-group disclosure; no filesystem authority, search
  semantics, or Monaco model ownership changed.

### Verification state

- Added focused contract, SearchService, IPC ownership, preload validation,
  result grouping, no-result/error, cancellation, query/project race, canonical
  model reuse, dirty-buffer preservation, and Monaco reveal/select tests.
- The full automated suite passes 157 tests across 21 files. Typecheck, lint,
  production build, and `git diff --check` pass.
- Final adversarial review found no Phase 2D blocker. Manual Electron visual and
  functional smoke passed top chrome/tabs, sidebar resizing, Monaco layout,
  Explorer/Search retention, dialogs, Search debounce/loading/navigation,
  dirty-buffer preservation, keyboard behavior, visual parity, and runtime/IPC
  error checks. Phase 2D is `COMPLETE`.

### Scope boundary

No replace, regex/options UI, Terminal, Run, Git, Language Intelligence,
Problems, formatter, debugger, AI, extension-host, or Phase 2E work was added.

## Phase 2E-B — Windows / Electron Native Compatibility Spike (`COMPLETE`)

- Verified the approved `@xterm/xterm` 6.0.0, `@xterm/addon-fit` 0.11.0, and
  `node-pty` 1.1.0 dependency state without installing or changing dependencies.
- Loaded the shipped Windows x64 `node-pty` prebuild in Electron 44.0.0 with
  bundled Node 24.18.1 and module ABI 149; no ABI error, rebuild, native toolchain,
  or `@electron/rebuild` dependency was required.
- Spawned a real Windows PowerShell PTY at the repository root because `pwsh` was
  unavailable and Windows PowerShell was the first available approved fallback.
  Deterministic input/output, ordered markers, resize, Ctrl+C, one clean exit
  event with code 0, owned-PID release, and clean Electron exit all passed.
- Confirmed a main-only electron-vite build leaves `node-pty` external and that
  its emitted Electron Main entry resolves the repository dependency and repeats
  the native smoke successfully.
- Removed the isolated harness and generated bundles after recording evidence.
  No production terminal service, IPC, preload API, Renderer UI, generic process
  executor, or Phase 2E-C work was introduced.

## Phase 2E-C — Terminal Contract Foundation (`COMPLETE`)

- Added side-effect-free terminal request/response contracts with an opaque
  branded session ID, strict exact-object validation, dimensions bounded to
  1–1,000, and non-empty input bounded to 64 KiB by UTF-8 byte length.
- Added `CREATING`, `RUNNING`, `CLOSING`, `EXITED`, and `FAILED` states with a
  pure allowed-transition predicate. Successful create is the readiness boundary
  and returns `RUNNING`, avoiding a redundant startup event.
- Added exact `data`, `exit`, and serialized `error` events. Data uses a
  non-negative safe-integer sequence; exit code and signal are explicitly
  nullable for provider/platform variability; raw native errors are rejected.
- Added documented terminal uses of existing AppError codes without introducing
  terminal-specific codes.
- Added a Main-only PTY port with explicit executable/args/cwd/environment spawn
  options isolated from Renderer contracts and without importing `node-pty`.
- Added a timer-free fake PTY supporting deterministic spawn failure, writes,
  control bytes, resize, data, immediate/duplicate exit, late data after close,
  idempotent close, listener disposal, and full disposal.
- Added 26 focused tests. The full suite passes 183 tests across 23 files, along
  with typecheck, lint, production build, security/dependency review, and
  whitespace checks. No production TerminalService, native adapter, IPC,
  preload API, Renderer terminal UI, or Phase 2E-D work was introduced.

## Phase 2E-D — Production Main Terminal Backend (`COMPLETE`)

- Added the sole production `node-pty` adapter behind the existing Main-only PTY
  port. Native types remain inside the adapter; electron-vite keeps the package
  external and no Renderer/shared module imports it.
- Added deterministic Windows shell resolution for valid `pwsh`, Windows
  PowerShell, then absolute `ComSpec`/system `cmd.exe`, with no configured custom
  shell or discovery-command execution. Missing approved shells map to
  `DEPENDENCY_MISSING`.
- Added a Main-owned TerminalService with opaque random IDs, canonical active-
  project cwd, immutable project/renderer ownership, authoritative states,
  input/control-byte forwarding, resize deduplication, typed events, and safe
  AppError normalization.
- Added ordered per-session output batching with an 8 ms latency window, 64 KiB
  UTF-8 queue bound, monotonically increasing sequence numbers, forced trailing
  exit flush, and cross-session isolation. No output history or replay was added.
- Registered every live PTY with ProcessManager and added bounded semantic close,
  owner cleanup, project cleanup, shutdown cleanup, duplicate-exit suppression,
  late-callback suppression, and 256 bounded exited/failed tombstones. No broad
  process-tree kill primitive or generic executor was introduced.
- Extended the deterministic fake PTY and manual scheduler for immediate exit,
  late callbacks, adapter failures, close races, bounded timeouts, and aggregate
  cleanup. The full suite passes 207 tests across 25 files.
- A temporary Main-only Electron 44 smoke exercised the production adapter with
  external `node-pty`, Windows PowerShell, output, resize, one clean exit, and no
  remaining owned PID; all temporary artifacts were removed.
- Typecheck, lint, production build, dependency/security review, and whitespace
  checks pass. No terminal IPC, preload API, Renderer/xterm UI, project dialog,
  or Phase 2E-E work was introduced.

## Phase 2E-E — Production Terminal IPC and Preload Bridge (`COMPLETE`)

- Added four strict terminal handlers through the centralized Main IPC registry.
  Create, input, resize, and close reject unknown fields and malformed values;
  renderer ownership is derived only from `event.sender.id`.
- Connected handlers to TerminalService without moving shell, PTY, batching, or
  session business logic into IPC. Later operations recover immutable project
  identity from Main session state rather than accepting it from Renderer.
- Added validated owner-only `terminal:event` delivery with no window broadcast,
  safe destroyed-owner drops, preserved service ordering, and guarded send errors.
- Added actual WebContents destruction and main-frame reload cleanup through
  `closeSessionsForOwner`. Cleanup is idempotent and owner-scoped; React remounts
  and same-document navigation do not close sessions.
- Added the narrow typed `window.studentIde.terminal` API for create, input,
  resize, close, and unsubscribe-returning events. Requests, responses, and
  events are validated, and one underlying IPC listener fans out to local
  subscribers without exposing raw `ipcRenderer` or generic channels.
- Added 12 focused IPC/preload/routing/lifecycle tests. The full suite passes 219
  tests across 27 files, with typecheck, lint, production build, dependency and
  adversarial security review, and whitespace checks passing.
- No dependency, Renderer terminal UI, xterm import, generic process API,
  replay/reattach behavior, or Phase 2E-F work was added.

## Phase 2E-F — Renderer Terminal UI (`COMPLETE`)

- Added a Renderer-session `TerminalController` that owns stable xterm and
  FitAddon instances independently of React mounts, subscribes to the typed
  terminal event API once, rejects stale/out-of-order events, serializes bounded
  writes, and disposes per-session resources exactly once.
- Added exact xterm input forwarding, including control bytes and Unicode, plus
  visible/non-zero-only fitting, coalesced/deduplicated resize propagation, and
  stopped input/resize behavior for exited or failed sessions.
- Added the initially closed, resizable Bottom Panel with project-aware empty
  state, multiple session tabs, New/Close controls, user-initiated focus, and
  restrained exit/error status while retaining scrollback.
- Added 17 focused controller/panel/resizer tests. The full suite passes 236
  tests across 29 files, together with typecheck, lint, production build, and
  whitespace checks.
- Verified the built Electron application with real Windows PowerShell and
  ConPTY: prompt, input/output, project-root cwd, Vietnamese Unicode, Ctrl+C,
  panel/window/sidebar resizing, multiple sessions, exit, close/reopen, and
  Monaco coexistence all passed.
- No dependency, IPC/preload contract, shell authority, persistence,
  project-transition policy, split terminal, or Phase 2E-G work was added.

## Phase 2E-G — Terminal Transition and Lifecycle Policy (`COMPLETE`)

- Added a Main-owned project-transition lease that blocks new terminal creates,
  drains creates already in flight, snapshots live project sessions, and releases
  its project block idempotently.
- Integrated the lease with the existing serialized ProjectService guard. Project
  close/switch now warns only when the old project owns live PTYs, closes only
  those sessions after approval, and commits new project authority only after
  terminal cleanup succeeds.
- Kept cancellation, renderer loss, timeout, and cleanup failure fail-closed.
  Failed cleanup returns a concise structured error without exposing native
  details or silently changing the current project.
- Ordered Renderer decisions so dirty-buffer Save/Don't Save/Cancel completes
  before the destructive terminal warning. Editor models remain intact until the
  authoritative project-changed event, including when a later terminal decision
  is cancelled.
- Added focused coverage for in-flight create races, project-scoped transition
  blocking, cancellation, cleanup failure, rapid serialized transitions, dialog
  ordering, safe default focus, and clean transitions. Stabilized existing Search
  debounce assertions for constrained parallel test workers without changing
  production Search behavior.
- The full suite passes 249 tests across 29 files. Typecheck, lint, production
  build, and `git diff --check` pass. Phase 2E-F's real Electron/ConPTY smoke
  remains applicable because 2E-G changes only project-transition coordination.
- At Phase 2E-G completion, Phase 2E remained `IN_PROGRESS` because descendant-
  process cleanup and later terminal verification/review work were not yet
  scope-defined. Phase 2E-G did not silently absorb that work.

## Phase 2E-H — Windows Terminal Behavior & Process Cleanup (`COMPLETE`)

- Defined a documentation-only Windows x64 work package for ConPTY/shell
  behavior, Unicode, Ctrl+C, exit/close semantics, controlled child/grandchild
  cleanup, orphan checks, race coverage, and native Electron evidence.
- Separated fake-based automated coverage, targeted Electron-native smoke, and
  non-duplicative manual Windows smoke. Ubuntu CI remains pure-test evidence and
  cannot validate Windows-native behavior.
- Recorded ADR-020 as Proposed and left the minimum Windows/ConPTY baseline,
  Windows CI timing, stronger cleanup strategy if needed, CJK/emoji depth, and
  H/I evidence split as `USER DECISION REQUIRED`.
- Bounded 2E-I to consolidated, non-duplicative terminal acceptance evidence;
  bounded 2E-J to final security/lifecycle/adversarial review and Phase 2E
  completion assessment; retained all packaging/installer work in Phase 7.
- No production source, tests, dependencies, package files, CI workflow, commit,
  or Phase 2E-H implementation was changed by this scope-definition task.
- Reproduced the Windows descendant blocker under Electron 44: node-pty closed
  shell 22796 and child 18376 but left grandchild 26396 alive after three
  seconds; unrelated control 29916 survived while Main had already emitted exit
  and removed ProcessManager ownership.
- Accepted ADR-020 and added a narrow Main-only process-tree terminator. It
  fingerprints the owned PTY root with PID/start time/executable/process name,
  revalidates session ownership and OS identity immediately before absolute
  System32 `taskkill.exe /PID <pid> /T /F`, and uses bounded `execFile` without a
  shell, process name, wildcard, Renderer input, new dependency, or raw error
  exposure. Exit remains pending until tree termination completes, preventing a
  transient false-clean ProcessManager state.
- Corrected and re-ran the controlled tree under actual Electron. The original
  corrected run removed 19276 -> 30408 -> 31956 while control 30688 survived;
  the final ordering run removed 9800 -> 31076 -> 25892 while control 15224
  survived. Close-one, project cleanup, project switch/close, renderer loss, and
  application shutdown also removed every recorded owned shell/child/grandchild
  while common control 16700 survived.
- Verified Windows PowerShell and cmd cwd-with-spaces, Vietnamese/common Unicode,
  required emoji, supplemental CJK, Ctrl+C prompt recovery and reuse, resize,
  clean/non-zero exit, trailing output, concurrent close/exit, close during
  output, Ctrl+C then close, rapid create/close, close-after-exit, and one logical
  exit. An output-active DesktopApplication shutdown stopped shell PID 16508 in
  2,475 ms, emitted one exit, cleared ProcessManager, and reached `STOPPED`.
  Production-build xterm smoke visibly retained scrollback after exit and closed
  a tab with a harmless running process.
- The full suite passes 265 tests across 30 files. Typecheck, lint, production
  build, and `git diff --check` pass. Windows CI remains deferred to 2E-I. At
  that Phase 2E-H checkpoint, Job Objects remained an optional unscheduled
  future evaluation; ADR-020 and Phase 2E-J corrective Step 2 later superseded
  that historical policy with primary Job ownership. Packaging and installer
  claims remain Phase 7.

## Phase 2E-I — Consolidated Terminal Verification Gate (`COMPLETE`)

- Audited FR-019 through FR-021 and terminal security/lifecycle traceability
  across contracts, Main service, IPC/preload, Renderer controller/UI,
  project/application transitions, and Windows owned-process cleanup.
- Reused the same-source 2E-H Windows matrix without ceremonial repetition and
  ran a consolidated Electron 44 / Node 24.18.1 native smoke. Canonical cwd with
  spaces, Vietnamese/common Unicode/emoji, Ctrl+C recovery, resize, trailing
  output, exit code 7, post-exit rejection, multiple-session isolation, focused
  close, and shutdown passed.
- Verified owned trees 4212 -> 7968 -> 12332 and 30072 -> 6784 -> 26632 exited,
  unrelated control PID 16612 survived, each session emitted one exit, and
  ProcessManager reached zero only after cleanup. Temporary harness and fixture
  artifacts were removed after evidence capture.
- Completed a production Electron Bottom Panel smoke covering visible Vietnamese
  and emoji output, two-session creation/switching, closing a session running a
  harmless long process, and continued use of the unaffected session.
- Evaluated Windows CI and selected no Phase 2 Windows job. Ubuntu CI remains the
  portable automated gate; terminal-affecting work requires recorded actual-
  Windows Electron evidence; Phase 7 retains packaged/installed Windows CI and
  release acceptance.
- The full suite passes 265 tests across 30 files. Typecheck, lint, production
  build, and `git diff --check` pass. Non-fatal `node-pty` AttachConsole process-
  list diagnostics are recorded as a limitation; no behavior, cleanup, or
  isolation assertion failed.
- No production feature, dependency, CI workflow, packaging policy, installer,
  custom shell, Job Object, Phase 2E-J review, commit, or push was added.

## Phase 2E-J Corrective Step 2 — Windows Job Object Production Integration (`COMPLETE`)

- Reopened ADR-020 and made a Windows Job Object the primary Windows terminal
  process-tree owner. Pinned `node-pty` exactly to 1.1.0 and added an inspectable,
  deterministic repository patch plus loud patch/rebuild scripts; no dependency,
  fork, vendor copy, Renderer API, preload API, IPC contract, or UI change was
  introduced.
- Extended node-pty's existing ConPTY `STARTUPINFOEX` path with
  `PROC_THREAD_ATTRIBUTE_JOB_LIST`, so the shell is associated atomically at
  `CreateProcessW`. Job/capability/attribute/process creation failures reject
  terminal creation, and the Electron 44 x64 rebuild/load check prevents silent
  use of an upstream unpatched prebuild.
- Added a native opaque-token registry whose Job handle survives root exit.
  Finalization explicitly terminates the Job, polls
  `JobObjectBasicAccountingInformation.ActiveProcesses` to zero, releases the
  handle, then releases ProcessManager/session ownership. `KILL_ON_JOB_CLOSE` is
  disabled; failure retains ownership, and node-pty PID/console-list kill is
  forbidden for established Jobs.
- Unified natural root exit, explicit close, project cleanup, and renderer-owner
  loss behind one in-flight TerminalService finalization task. Root exit no
  longer means cleanup completion; duplicate triggers share work, trailing
  output is flushed before exactly one exit event, and failed cleanup keeps the
  session and ProcessManager entry available for retry.
- Retained the Phase 2E-H fingerprinted `taskkill /PID <pid> /T /F` backend only
  for explicit legacy/unestablished ownership. It still revalidates the OS
  identity immediately before invocation and is forbidden after Job ownership
  or Job termination failure.
- Actual Electron 44 x64 evidence used shell 28332, child 24636, grandchild
  16628, Job-owned conhost helpers 28792 and 25964, and unrelated control 2396.
  The shell PID disappeared naturally while the Job retained four active
  descendants. Job termination removed all descendants/helpers, preserved the
  control process, confirmed zero active processes, and produced one exit event.
- A second Electron smoke bundled and exercised the production `NodePtyPort`,
  `TerminalService`, `WindowsProcessTreeTerminator`, and `ProcessManager` path.
  With shell 33128, child 31128, grandchild 6332, and control 5888,
  ProcessManager remained at one after natural root exit, reached zero only
  after Job finalization, removed both descendants, preserved the control, and
  emitted one terminal exit.
- The full suite passes 285 tests across 31 files. Typecheck, lint,
  electron-vite production build, patch apply/reverse verification, native
  rebuild/capability load, native and production-service Windows natural-root
  smoke, and `git diff --check` pass. At Step 2 completion, Phase 2E-J and Phase
  2E remained `BLOCKED` because corrective Step 3 application-shutdown semantics
  had not begun.

## Phase 2E-J Corrective Step 3 — Application Shutdown Semantics (`COMPLETE`)

- Corrected `DesktopApplication` so `STOPPED` is reached only after every
  mandatory started service stops successfully. Cleanup rejection propagates,
  retains `STOPPING`, and preserves the failed and not-yet-stopped services for
  deterministic retry; concurrent calls share one in-flight shutdown and a
  repeated call after success remains idempotent.
- Preserved reverse dependency cleanup while changing service release from
  pre-emptive list removal to removal after successful `stop()`. A failure now
  stops that cleanup attempt before ProcessManager can duplicate a failed
  TerminalService Job finalization. WindowManager is shutdown-last, leaving the
  existing window close path available to initiate a later retry.
- Added a Main-only Electron quit coordinator. Initial and repeated
  `before-quit` events are prevented during approval/cleanup; success authorizes
  one final `app.quit()` and lets its recursive event/window close pass; failure
  logs through a redacted callback, does not finalize quit, and clears only the
  rejected attempt. BrowserWindow close and non-macOS `window-all-closed` use
  the same path without new Renderer, preload, or IPC authority.
- Added focused DesktopApplication, quit coordinator, WindowManager, and
  TerminalService integration tests for success, failure, retry, concurrency,
  idempotence, final-quit cardinality, recursive-event protection, live Job
  cleanup, natural-root cleanup, and retained Job/ProcessManager ownership.
- Electron 44 Windows x64 production-service smoke passed a live-root shutdown
  (`32972 -> 16304 -> 1756`, control `30836`) and a natural-root-first shutdown
  (`8688 -> 23492 -> 31696`, control `8812`). Both reached `STOPPED` only after
  Job finalization and ProcessManager release, requested one final quit, removed
  every tested owned PID, emitted one terminal exit, and preserved the unrelated
  control process. Failure/retry evidence uses test seams only.
- The full suite passes 297 tests across 32 files. Typecheck, lint, production
  build, and `git diff --check` pass. No dependency, Windows Job strategy,
  node-pty patch policy, force-quit fallback, Renderer/preload/IPC capability,
  packaging, installer, final 2E-J review, commit, or push was added. Corrective
  Step 3 is complete; Phase 2E-J and Phase 2E remain `BLOCKED` until the final
  review is explicitly authorized and rerun.

## Phase 2E-J — Final Consolidated Terminal Review (`COMPLETE`)

- Re-audited the complete terminal security boundary, creation path, shell/cwd
  policy, Windows Job integration, natural-root ownership, ProcessManager,
  explicit/project/renderer/application cleanup, output/exit ordering,
  resize/input races, multiple-session isolation, taskkill gate, documentation,
  and FR-019–FR-021 traceability. No material defect or architecture deviation
  was found; production code was not changed during the review.
- Verified the deterministic patch against pinned `node-pty` 1.1.0, rebuilt the
  patched native module for Electron 44.0.0 x64, loaded its capability marker,
  and passed the electron-vite production build.
- Current native Job evidence used shell/child/grandchild
  `16612 -> 26072 -> 5480`, Job helpers `19248` and `7760`, and unrelated
  control PID `24160`. The root exited naturally while four Job members remained;
  finalization removed the complete owned tree, preserved the control, emptied
  and released the Job, and emitted one exit.
- Current production-service evidence passed live-root application shutdown
  `19452 -> 25648 -> 2672` with control `32508`, and natural-root-first shutdown
  `17768 -> 22220 -> 18304` with control `2316`. Both reached `STOPPED` only
  after Job finalization and ProcessManager release, requested one final quit,
  and left no tested orphan.
- The full suite passes 297 tests across 32 files. Typecheck, lint, production
  build, and `git diff --check` pass. No Search regression was observed. Phase
  2E-J and Phase 2E are complete and ready for user-authorized source-control
  closure; no commit, push, PR, merge, branch deletion, or Phase 2F work was
  performed.

## Phase 2F — Core IDE Stabilization (`COMPLETE`)

- Audited findings 2F-A-001 through 2F-A-011. Corrective packages B–D closed
  the post-approval edit race, preload invoke rejection handling, delete commit
  ordering, unavailable project-root/watcher state, externally deleted-file
  state, expected project-cancellation presentation, renderer subscription and
  terminal resource cleanup, and pointer-resizer unmount cleanup.
- File deletion now retains affected clean or dirty Monaco models until the
  Recycle Bin operation succeeds. Failure preserves the exact buffer and allows
  retry; successful deletion commits Editor disposal before Explorer refresh.
- Added project-scoped filesystem `AVAILABLE`/`UNAVAILABLE` status through the
  validated Main/preload boundary. Watcher startup/runtime failure and active
  root loss visibly disable stale filesystem mutations while existing
  close/reopen or project-switch recovery remains available.
- Externally deleted open files retain their in-memory buffer in an explicit
  disk-missing state. Normal save is blocked, stale reload responses are
  rejected, and no file is silently recreated or discarded.
- Stabilized Search integration tests by separating operation-authority tests
  from debounce timing and checking the 180 ms debounce boundary with fake
  time. Both previously flaky scenarios passed 10 consecutive process-isolated
  runs (20 assertions total). Production Search authority logic was unchanged.
- Verified the integrated project, Explorer, Editor, Search, Terminal, and
  application-lifecycle scenario matrix using focused Renderer, service, IPC,
  cleanup, shutdown, and ownership tests. A 500-file/20-directory disk Search
  emitted exactly the 1,000-match bound and completed with `limitReached`.
- Corrected the node-pty patch verifier to tolerate CRLF/LF checkout differences
  through Git's whitespace-aware patch check without changing the patch or
  Windows Job architecture. The patched Electron 44 x64 capability rebuild,
  native Job smoke, and production TerminalService live-root/natural-root
  shutdown smokes passed. Owned descendants were removed, unrelated controls
  survived, ProcessManager ownership was released only after Job finalization,
  and application state reached `STOPPED` with one final quit.
- Final verification passes 328 tests across 33 files, typecheck, lint,
  electron-vite production build, and `git diff --check`. The test-only jsdom
  canvas diagnostic remains non-blocking; no dependency, Phase 3 feature,
  native architecture change, commit, or push was introduced.
- Recent-project metadata remains the minimal Phase 2 persistence foundation.
  User-facing list management and any product limit policy remain deferred to
  Phase 6 Settings/Recent Projects UX.

## Phase 3A — Language Intelligence Architecture & Feasibility (`COMPLETE`)

- Audited the Phase 2 Monaco/editor baseline, built-in worker capabilities,
  project/model integration, diagnostics ownership, security/resource risks,
  dependency options, and locked Orca reference applicability without changing
  production code or dependencies.
- Approved the current Phase 3 V1 scope as Monaco-native intelligence for
  JavaScript/TypeScript and HTML/CSS/JSON, plus syntax-only C#/PHP. Python and
  Java language support are intentionally deferred to a future authorized phase,
  not permanently removed.
- Selected bounded JavaScript/TypeScript project snapshots/source synchronization;
  rejected wholesale `node_modules` mirroring and canonical project-root exposure
  to Renderer for TypeScript resolution.
- Selected root-`UNAVAILABLE` behavior: stop project intelligence and clear stale
  diagnostics while preserving editor buffers, syntax highlighting, and the open
  project.
- Recorded that current Phase 3 adds no external language-server process,
  Pyright/basedpyright/python-lsp-server, `vscode-jsonrpc`, Python intelligence
  detection/synchronization, or Java-specific provider infrastructure. Future
  external providers remain Main-owned behind a narrow validated bridge and
  independent from `RunService`.
- Reduced the implementation plan to packages 3B–3F. Phase 3 implementation has
  not started; this entry records architecture, feasibility, and approved scope
  documentation only.

## Phase 3B — Language Foundation / Provider Contracts (`COMPLETE`)

- Added the renderer-owned current-provider and capability contracts for
  Monaco-native JS/TS, HTML, CSS, and JSON workers, including documented status
  values. C#/PHP remain syntax-only; Python/Java remain deferred with no provider.
- Centralized safe project-relative URI identity, current language mapping,
  worker routing, deliberate JS/TS defaults, normalized diagnostic identity,
  provider-specific marker ownership, and independent project/provider generation
  checks.
- Added a bounded JS/TS snapshot feasibility state that excludes `node_modules`,
  unsupported languages, and file/count/byte overflow; open Monaco models take
  precedence, stale generations are rejected, and switch/close/root-unavailable/
  renderer-disposal paths clear only the TypeScript provider's project state and
  diagnostics.
- Verified safe virtual-URI same-file completion, TS-to-TS, JS-to-JS, and mixed
  JS/TS relative imports/definitions, JSX/TSX parsing, JS/TS diagnostics, C#/PHP
  tokenizer registration, and marker-owner isolation.
- Measured 1,000 files/8,219,780 UTF-8 bytes through the planner/state in 59 ms
  with a 7,116,248-byte observed heap delta, a 501-file/4,111,341-byte TypeScript
  definition query in 1,184 ms, and a 262,170-byte individual source in 393 ms.
  Recorded initial 3C ceilings of 500 files, 5 MiB total, and 256 KiB per file.
- Added a repeatable Electron production-renderer smoke. The `file://` build loaded
  editor, TypeScript/JavaScript, HTML, CSS, and JSON workers from local hashed
  assets with `contextIsolation: true`, `nodeIntegration: false`, and
  `sandbox: true`.
- Full verification passed 353 tests across 37 files, typecheck, lint, production
  build, Electron worker smoke, and `git diff --check`. No dependency, external
  language server, generic language IPC, canonical-root exposure, commit, push,
  or Phase 3C–3F implementation was introduced.

## Phase 3 V1 Scope Documentation Sync (before 3C)

- Clarified the authoritative V1 matrix: JavaScript/TypeScript are Tier 1,
  HTML/CSS/JSON are Tier 2, and C#/PHP are syntax-only.
- Deferred all Python support, all Java support, and every external
  language-server process from current V1. Python Run/runtime integration is no
  longer a Phase 4 acceptance criterion.
- Retained Main ownership and a narrow validated bridge as future external-server
  architecture only; current Phase 3 remains renderer-owned Monaco/browser
  workers with no generic language IPC.
- Preserved all verified Phase 3A/3B evidence and the initial 3C limits of 500
  JS/TS source files, 5 MiB total UTF-8 content, and 256 KiB per file. This entry
  records documentation decisions only; Phase 3C did not start, no production
  source or dependency changed, and packaged/installed acceptance remains Phase 7.
- Clarified NFR-006 before 3C: current Monaco providers require safe failure,
  disposal, and natural renderer-owned recovery without manual restart UX or
  IPC. Dirty buffers remain authoritative, stale generations remain rejected,
  and manual external-language-server lifecycle UX is future scope.

## Phase 3C — Production JS/TS Language Intelligence (`COMPLETE`)

- Implemented deterministic production discovery for exact `.js`, `.jsx`,
  `.ts`, and `.tsx` sources through the existing project-relative list/stat/read
  capabilities. Discovery excludes `node_modules` and enforces 500 files, 5 MiB
  total UTF-8 content, and 256 KiB per file without new IPC or filesystem
  authority.
- Added renderer-owned project synchronization that creates provider background
  Monaco models while preserving `EditorModelManager` as canonical open-model and
  dirty-state owner. Dirty buffers override disk snapshots; save/reload/close and
  file change/create/delete/rename paths synchronize without writing buffers or
  changing Phase 2 data-safety behavior.
- Added project/provider generation guards and cleanup for open, switch, close,
  root unavailability, renderer disposal, failure, and natural reinitialization.
  Late old-project work is rejected, provider failure does not block edit/save,
  and deleted dirty buffers are retained.
- Verified same-file and cross-file JS/TS, JS-to-JS, TS-to-TS, mixed JS/TS, JSX,
  TSX, completion, hover, signature help, definition, and diagnostics. Existing
  HTML/CSS/JSON worker registration remains passing; C#/PHP remain
  tokenization-only.
- Focused Phase 3 regression passed 49 tests across 5 files. The full suite passed
  365 tests across 38 files; typecheck, lint, production build, Electron worker
  smoke, and `git diff --check` passed. The existing non-blocking jsdom canvas
  diagnostic remains unchanged.
- Added no dependency, package-lock change, external language server, Python or
  Java provider, C#/PHP intelligence, `node_modules` mirroring, full `tsconfig`,
  generic language IPC, canonical-root exposure, Phase 3D work, Phase 4 Run, or
  packaged/installed acceptance claim.

## Phase 3D HTML Diagnostics Scope Decision

- Deferred HTML diagnostics and HTML Problems contribution from current V1 after
  verifying that the approved Monaco HTML provider has no validation support.
- Retained HTML syntax, completion, and provider-supported hover as V1 scope.
  CSS and JSON diagnostics plus their future Phase 3E Problems contribution
  remain required.
- Preserved the renderer-owned Monaco/browser-worker architecture. No custom
  HTML validator/parser, alternate provider, dependency, external LSP, project
  index, IPC, process, filesystem authority, network access, or Phase 3E work was
  added by this documentation decision.

## Phase 3D — HTML/CSS/JSON Language Intelligence (`COMPLETE`)

- Configured the production Monaco web-language defaults explicitly: HTML
  completion/hover with diagnostics disabled; CSS completion/hover/validation;
  and JSON completion/hover/validation with no configured schemas and schema
  requests disabled.
- Verified against the actual Monaco workers that HTML supplies tag/attribute
  completion and useful hover from current dirty model content. HTML validation
  remains unavailable and deferred; no custom validator or alternate provider
  was introduced.
- Verified CSS property/value completion, hover, diagnostic range/severity/source,
  update after edits, clearing after fixes, and model-disposal cleanup.
- Verified local schema-free JSON peer-property completion and syntax diagnostics
  with update/clear/disposal behavior. JSON hover has no useful result without a
  configured local schema, and an explicit remote `$schema` triggers no fetch.
- Focused Phase 3D coverage passed 24 tests across 3 files. The full suite passed
  374 tests across 39 files; typecheck, lint, production build, Electron worker
  smoke, and `git diff --check` passed. The known non-blocking jsdom canvas
  diagnostic remains unchanged.
- Added no dependency, package-lock change, external provider, Python/Java
  provider, C#/PHP intelligence, IPC, filesystem/process authority, project-wide
  Tier 2 index, network access, Problems UI, or packaged/installed acceptance
  claim. Phase 3E remains `NOT_STARTED`.

## Phase 2D Search Corrective Fixes During Phase 3E

- Corrected an intermittent stale-query submit race by keeping the latest input
  value in a renderer ref and reading that value on immediate form submission.
- Corrected the project-reset timing race by moving only the existing
  project-scoped Search reset from passive effect timing to layout-effect timing,
  so reset completes before newly enabled input can be interacted with.
- Preserved SearchService contracts, IPC, debounce behavior, result/navigation
  semantics, canonical model ownership, and dirty-buffer protection. The focused
  Search integration suite passed 57 tests without sleeps, retries, timeouts, or
  weakened assertions.

## Phase 3E — Problems Aggregation and Navigation (`COMPLETE`)

- Added a renderer-owned normalized Problems store and Monaco marker controller
  for existing JavaScript, TypeScript, CSS, and JSON diagnostics. Updates replace
  and clear by provider/file scope, preserve severity/source/range, sort
  deterministically, reject stale project/provider/model generations, and clean
  up on project switch/close, root unavailability, provider disposal, and
  renderer disposal.
- Integrated a Problems tab into the existing Bottom Panel with neutral empty
  state, file grouping, current counts, severity/source/location display, and
  reactive removal. Terminal lifecycle and shell architecture remain unchanged.
- Problem selection opens or reuses the existing canonical Monaco model,
  activates its editor tab, reveals the diagnostic range, preserves dirty
  in-memory content, and fails safely for deleted/stale or old-project targets.
- HTML diagnostics remain deferred because the current provider has no validation
  support. C#/PHP remain tokenization-only; Python, Java, and external LSP remain
  deferred. No validator, provider, dependency, package-lock change, IPC,
  filesystem/process/network authority, project scan, or architecture deviation
  was added.
- Focused Phase 3E coverage passed 11 tests across 3 files; focused Search
  integration passed 57 tests. The full suite passed 385 tests across 42 files;
  typecheck, lint, production build, Electron Monaco worker smoke, and
  `git diff --check` passed. The unchanged jsdom canvas warning remains
  non-blocking. Phase 3 remains `IN_PROGRESS` because Phase 3F is `NOT_STARTED`.

## Phase 3F — Stabilization and Final Verification (`COMPLETE`)

- Audited the full Phase 3 working tree, dependency/package state, security
  boundary, language capability matrix, bounded JS/TS synchronization,
  diagnostics/Problems lifecycle, Search corrections, worker assets, and Phase 2
  regressions. No unrelated accidental change, debug artifact, tracked generated
  output, dependency/package-lock change, or architecture deviation was found.
- Added deterministic lifecycle stress coverage proving repeated JS/TS project
  activate/switch/close/reopen cycles do not accumulate provider background
  models and repeated Problems controller cycles release marker listeners and
  diagnostic state.
- Focused Phase 3 acceptance passed 69 tests across 9 files. The two existing
  Search race corrections each remained stable across two independent 57-test
  integration runs. Two independent full-suite runs each passed 387 tests across
  42 files without retries, sleeps, timeout increases, or weakened assertions.
- Typecheck, lint, production build, Monaco production-worker smoke, and
  `git diff --check` passed. Production `file:` assets loaded editor,
  JavaScript/TypeScript, HTML, CSS, and JSON workers with
  `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
  The unchanged jsdom canvas warning remains non-blocking.
- Phase 3 current V1 acceptance is complete: JS/TS full approved intelligence
  and bounded synchronization; HTML syntax/completion/provider-supported hover
  with diagnostics deferred; CSS/JSON approved Tier 2 behavior; C#/PHP
  tokenization-only; and deterministic Problems aggregation/navigation for
  JS/TS/CSS/JSON. Python, Java, external LSP, HTML diagnostics, broader TypeScript
  project fidelity, and packaged/installed verification remain deferred.
- No Phase 4 implementation, dependency, new IPC, filesystem/process/network
  authority, provider, validator, or commit/push was introduced.

## Phase 4 — Authorized Run Scope Documentation Clarification

- Synchronized the requirements, architecture, ADR-014, capability matrix,
  planned module map, and implementation acceptance scope with explicit user
  decisions: Phase 4 V1 requires Node.js Run only for the current authorized
  JavaScript `.js` file inside the active project.
- Deferred TypeScript Run while preserving Phase 3 TypeScript intelligence.
  No TypeScript runtime, compile/transpile strategy, ts-node, tsx, or Node-native
  execution policy is selected. ADR-014 remains a future decision/verification
  gate and no longer blocks current Phase 4 JavaScript implementation.
- Preserved a narrow internal RunStrategy boundary with only the planned V1
  JavaScriptRunStrategy; future authorized TypeScriptRunStrategy can be added
  without redesigning core RunService. No placeholder production code was added.
- Deferred FR-023 built-in Run Project, npm/package-manager scripts, dev-server
  orchestration, project entry configuration, and framework/project launchers.
  Future Run Project requires an explicit authorized entry/script policy.
- This entry records documentation clarification only, not implemented Run
  behavior or a completed Phase 4 gate. Other Run policies remain subject to
  read-only review and explicit decisions where unresolved. No production source,
  dependency, package-lock, commit, or push change is included.

### Approved Run behavior clarification

- Recorded the subsequent explicit user policies: stop-and-clean before same-target
  re-run without a prompt; block dirty targets until explicit Save; Main process
  PATH-only Node detection with `MISSING` errors; no bundled/configured Node path
  or Node Settings UI in Phase 4.
- Recorded confirmed close/switch waiting for all project Run cleanup, preserving
  project/editor state on cleanup failure, and unavailable-root cleanup with
  stale-event rejection. Recorded one right-aligned editor-header Run button and
  an Output sibling in the existing Bottom Panel, preserving Terminal behavior.
- Added the read-only Windows piped-process ownership feasibility gate. These
  documentation decisions do not claim native/process feasibility, production
  implementation, tests passing, or Phase 4 completion.

## Phase 4A — Run Foundation (`COMPLETE`)

- Added shared exact Run request/session/event validators and an opaque session
  ID type with Main-generated UUIDs. DTOs preserve stdout/stderr identity and
  expose no executable, cwd, arguments, environment, native handle, or root path.
- Added Main-owned immutable Run preparations, renderer-owner access/release
  checks, dirty/unsupported guards, and injected authorization/runtime seams.
  Preparations cannot spawn a process or claim RUNNING. Concrete active-project,
  disk/runtime validation and execution lifecycle remain later packages.
- Added narrow internal RunStrategy and JavaScriptRunStrategy with controlled
  explicit executable/argument preparation and shell disabled. TypeScript Run
  remains deferred with no placeholder implementation or dependency.
- Added typed Main IPC and Preload factories with validation and handler/listener
  cleanup. They are not composed into the live app until execution is ready.
  ProcessManager, Terminal/node-pty behavior, project/shutdown lifecycle, and
  renderer UI/security boundaries were not changed.
- Focused tests passed 37/37. Full regression passed 424/424 across 43 files;
  typecheck, lint, production build, and whitespace checks passed. Existing
  maxWorkers=4 and timeouts were preserved. The known jsdom canvas warning was
  observed without a test failure. Sandbox esbuild EPERM required an approved
  build outside the sandbox; no build configuration workaround was introduced.
- Added lint-only environment/CommonJS metadata to the retained native spike
  fixture; its behavior and evidence remain unchanged. No new dependency,
  package-lock change, production native adapter, UI, commit, or push was added.
  Phase 4 remains IN_PROGRESS; 4B–4F are not complete.

## Phase 4B — PATH Runtime and Native Binding (`COMPLETE`)

- Resumed interrupted 4B implementation: Main PATH-only Node detection, internal
  RunService launch/resource registration, Windows x64 piped-process Node-API
  binding and Electron build artifact integration. Fixed current-drive PATH
  ambiguity and kept native compilation conditional for portable JS builds.
- Native creation establishes Job ownership before user code runs; bounded
  asynchronous stdout/stderr, UTF-8 decoding, root/EOF settlement and explicit
  release were verified through the production Electron entry. ProcessManager
  and Terminal code are unchanged; no live Renderer Run authority was exposed.
- Full suite: 436 tests / 44 files passed. Typecheck, lint, production build and
  whitespace gates passed. Electron 44.0.0 / ABI 149 / Windows x64 smoke passed
  15 output/exit/release cycles plus root-first descendant cleanup and failed
  spawn rollback. Existing jsdom canvas diagnostics remain non-blocking.
- No dependency, lockfile or new ADR decision. App lifecycle, concrete disk
  authority, re-run, Output UI and final Phase 4 acceptance remain 4C–4F;
  packaged/installed and both-platform Windows acceptance remain Phase 7.

## Phase 4C — Run Lifecycle (`COMPLETE`)

- Implemented RunService start/stop/re-run using existing session contracts and
  opaque Main IDs. Canonical same-target requests serialize; other targets remain
  concurrent. Old session callbacks cannot update replacement sessions. Dirty
  targets remain Save-first; no execution authority was added to Renderer.
- ProcessManager's existing per-owner cleanup mechanism now drives exact-session
  lifecycle cleanup. Duplicate Stop shares work; cleanup failures retain STOPPING
  and tracking for retry, blocking replacement. Root/EOF/native release are required
  before one terminal state/exit event; recent completed snapshots are bounded.
- Added 22 deterministic lifecycle tests and production Electron lifecycle smoke.
  Focused 4A–4C: 71/71; full regression: 458/458 in 45 files. Typecheck, lint, build,
  whitespace, existing 4B native smoke, and Monaco production-worker smoke passed.
  Lifecycle smoke verified five real sessions and zero remaining resources under
  Electron 44.0.0 / ABI 149 / Windows x64, including root-first descendant cleanup.
- No ProcessManager redesign, native architecture change, Terminal/renderer change,
  new dependency, lockfile edit, or new ADR. Project/application integration and
  Run/Output UI remain later packages. Phase 4 overall remains IN_PROGRESS.

## Phase 4D — Project / Application Lifecycle (`COMPLETE`)

- Added managed RunProjectLifecycle and Main composition. Existing post-unsaved
  transition guards now await project-owned Run cleanup before switch/close;
  cancellation leaves Run active and failures preserve the project for retry.
- Reused FileSystemService availability notifications and canonical path resolver;
  no Run watcher. Unavailable/teardown events are muted while native accounting
  continues. Generation guards prevent pending starts from surviving transitions
  or shutdown; cleanup promises are awaited through final tracking removal.
- Integrated with existing DesktopApplication/quit-coordinator failure semantics.
  No changes to ProjectService, UnsavedTransitionService, DesktopApplication,
  ApplicationQuitCoordinator, ProcessManager or Terminal implementation.
- Added 16 integration tests. Focused suite: 109/109; final full regression:
  474/474 across 46 files. Typecheck, lint, build, whitespace and Monaco worker
  smoke passed. Native 4D smoke released four sessions across project/application
  scenarios with zero tracked resources; existing lifecycle smoke also passed.
- Kept shared Main chunks beside the entry to preserve native binding lookup.
  Native architecture, dependencies, lockfile, security flags and Renderer invoke
  authority unchanged. Run/Output UI remains 4E; Phase 4 overall is IN_PROGRESS.

## Phase 4E — Run / Output UI (`COMPLETE`, 2026-09-05)

- Wired the existing narrow validated Run capability into Main and Preload.
  Added Main-owned renderer navigation/destruction cleanup with generation guards,
  pending-start invalidation, native release and retained shutdown retry ownership.
- Added one Run entry on the right of the existing editor-tabs header and
  contextual Stop/Retry Stop. Saved active-project .js files run; dirty, missing,
  unavailable, conflicted and unsupported targets have disabled feedback.
  TypeScript copy explicitly describes current V1; Node/spawn errors stay inline
  and safe. Re-run delegates cleanup/replacement to Main.
- Added Output to the existing Bottom Panel with its current height/resizer and
  tokens. Per-target views preserve separate stdout/stderr and delivered order;
  state/exit/error presentation uses Main DTOs. Animation-frame notifications batch
  streaming output. Project/session guards and application-owned subscription
  cleanup prevent stale output or listener growth across panel switches/unmount.
- Added 21 renderer/Preload/service integration cases, three owner-cleanup cases
  and one App panel/subscription case. Updated existing capability/count fixtures
  for the new Run subscription. Full regression passed 499/499 across 47 files;
  maxWorkers=4 and test timeouts/retries remain unchanged. Known jsdom canvas
  diagnostic is non-blocking. Typecheck, lint, production/native build and
  git diff --check passed.
- New production UI smoke verified actual built React/Monaco/Preload/native Run,
  click Run/re-run/Stop, stdout/stderr, exit 0/7 and Problems/Output tab switching.
  Four native sessions released and zero resources remained. Screenshot review
  confirmed the approved header location and existing panel style. Existing
  native smoke (15 cycles), lifecycle smoke (five sessions), project lifecycle
  smoke (four sessions) and Monaco production-worker/security smoke passed.
- No dependency, lockfile, accepted decision, security-flag or shell redesign.
  Terminal/Problems changes only add Output navigation. No commit/push/merge.
  At 4E completion, Phase 4 stayed IN_PROGRESS and 4F required explicit authorization.

## Phase 4F — Stabilization / Final Verification (`COMPLETE`, 2026-09-05)

- Audited all Phase 4 working-tree changes, native source/build integration, spike
  evidence, tests and documentation. No unrelated file, tracked generated binary,
  temporary artifact, log, debug file, secret/private data or local developer path
  remains. Native compiler outputs stay under ignored `out/`; dependencies and lockfile
  are unchanged.
- Reverified 4A–4E contracts, Main ownership, PATH-only Node resolution, creation-time
  Job ownership, separate streams, exit/finalization, re-run, cleanup retry retention,
  project/application cleanup, stale-session rejection, typed Preload IPC, editor Run
  action, Output UI and renderer subscription ownership. Security flags and the strict
  Renderer/Main process boundary remain unchanged.
- Focused Phase 4 coverage passed 180/180 across eight files. Two consecutive full
  suites passed 500/500 across 47 files with `--maxWorkers=4` and unchanged timeout,
  retry and Monaco policy. Representative Terminal, Problems, Search, language,
  editor/save and panel regression coverage passed 147/147 across 16 files.
- Native smoke passed 15 cycles. Run lifecycle smoke passed three repetitions of five
  sessions, project/application lifecycle smoke passed three repetitions of four
  sessions, and the built Electron Run UI smoke passed twice with eight sessions and
  six same-target cycles each. Every run ended with zero tracked resources, released
  native handles and no orphaned descendants; root-first-child cleanup remained PASS.
- Terminal native/service smoke, Monaco production-worker/security smoke, typecheck,
  lint, production build and `git diff --check` passed. Production Main output resolves
  the native binding relatively. Windows 11 NT build 10.0.26200.9168 (25H2) was
  verified; Windows 10 and installed/package verification remain Phase 7 work.
- Phase 4 V1 is complete. TypeScript Run, Run Project, npm scripts, dev servers and
  project entry configuration remain deferred. No commit, push or merge was performed.

## Phase 5A — Git Foundation + Dependency / Repository Detection (`COMPLETE`, 2026-09-06)

- Added side-effect-free Git dependency/repository contracts and one narrow
  `git:get-state` IPC/Preload capability. Requests accept only the active project
  ID; exact validation rejects executable, cwd, argument, command, shell, and
  unknown fields. Responses are exact-validated and expose no canonical path or
  process authority.
- Added a Git-specific Main PATH detector without changing Node detection. It
  checks exact `git.exe` candidates, ignores empty/relative/current-drive entries,
  supports quoted/spaced/Unicode and UNC paths, does not use PATHEXT or cwd search,
  and distinguishes validated `AVAILABLE` from safe-lookup `MISSING`.
  `NOT_CONFIGURED` and configured-path `INVALID_CONFIGURATION` remain reserved for
  future Settings support.
- Added a private finite `GitCommandRunner` using built-in `execFile` with separate
  executable/arguments, `shell: false`, Main-owned cwd, bounded stdout/stderr,
  timeout, cancellation-ready `AbortSignal`, hidden Windows process creation, and
  safe error mapping. Terminal, Run, ProcessManager, and Windows Job semantics are
  unchanged.
- Added GitService repository probing through fixed Main-owned arguments. Main
  authorizes and revalidates the active available project, canonicalizes Git's
  reported top-level, and accepts only exact platform-correct equality with the
  canonical project root. Normal non-Git folders and project subfolders inside a
  parent repository return `NOT_REPOSITORY`; unexpected Git failures remain
  structured errors.
- Final review reopened the premature completion claim for path authorization
  and missing real-process/repository evidence. Remediation strictly validates
  single fully-qualified drive/UNC output before realpath, rejecting malformed
  components, relative/current-drive forms, NUL/control characters and extra
  lines with safe `PROCESS_FAILED`. Dot and drive-relative regressions use the
  actual process cwd as the active root. Existing canonical Windows comparison
  and decisions 1A/2B/3A are unchanged.
- Real-process tests exposed early settlement on spawn failure before child
  close. The local runner fix waits for close and guards duplicate completion;
  deterministic tests cover close-before/callback-before ordering. Six real Git
  process tests verify success, non-zero exit, timeout, cancellation, overflow
  and spawn failure, including dead PIDs, single callback/close, destroyed timer
  resources and removed abort listeners. Overflow uses a live batch process and
  asserts captured output stays within 1024 bytes.
- Three temporary real-Git integrations use production ProjectService identity/
  authorization, GitService, detector, runner and realpath: exact spaced Unicode
  repository root is `REPOSITORY`; ordinary folder and project nested in a parent
  repository are `NOT_REPOSITORY`. Availability is the only stubbed domain port.
  Local Git 2.47.1.windows.2 ran all nine integration tests without skips. The
  Windows/PATH gate explicitly reports unavailable environments; no real UNC
  network-share or packaged/Windows 10 acceptance is claimed.
- After remediation, focused Git/Preload coverage passed 76/76. Full regression
  passed 566/566 across 49 files with the existing `--maxWorkers=4`. Typecheck,
  lint, fresh production/native build and whitespace verification passed.
  Sandboxed test/build spawn EPERM required approved outside-sandbox runs; the
  known jsdom canvas diagnostic remains non-blocking. No test timeout increase,
  assertion weakening, dependency/package-lock change, Phase 5B+ operation,
  Source Control UI, stage, commit or push was introduced. Phase 5A completion
  now includes these remediation gates; Phase 5 overall remains `IN_PROGRESS`.

## Phase 5B — Git Status + Stage / Unstage (`COMPLETE`, 2026-09-06)

- Resumed and completed the interrupted authorized backend package. Added typed
  status and selected-path stage/unstage capabilities with exact IPC/Preload
  validation; Renderer still receives no executable, cwd or command authority.
- Status uses incremental porcelain v2 parsing with staged/unstaged slots,
  untracked files, rename/copy pairs and read-only conflicts. Memory is bounded
  by 1000 retained entries and 128 KiB per token; a complete 1001st entry signals
  truncation and stops the process. Unsupported/malformed output fails closed.
- Main revalidates the exact active repository and canonical selected paths,
  rejects directory expansion, and uses literal pathspecs. Safe unstage handles
  both existing and unborn HEAD without modifying working content or unrelated
  index entries. Rename and copy selection have distinct semantics.
- Process environment strips ambient Git overrides. Streaming timeout,
  cancellation, malformed output, overflow and spawn failure settle after close
  with timer/listener cleanup. Confirmed writes survive failed status refresh;
  unknown mutation outcomes require refresh and are not reported as cancelled.
- Final regression passed 676/676 tests across 53 files with unchanged worker
  settings and no local skips. This includes 18 real 5B repository cases and
  eight real streaming-process cases, plus parser/path/IPC/security coverage.
  Repository evidence includes Unicode/literal paths, staged-plus-modified files,
  additions/deletions, rename/copy, unborn HEAD, conflicts, external index locks,
  nested-root rejection and the 1001-file limit.
- Typecheck, lint, production/native build and whitespace checks passed. Sandbox
  spawn EPERM required approved outside-sandbox tests/build; the existing jsdom
  canvas diagnostic remains non-blocking. No dependency/ADR change or visible UI
  was introduced. Comprehensive owner lifecycle, Source Control UI and remaining
  Git operations stay in 5C–5F. Live UNC, Windows 10 and packaged acceptance are
  not claimed. No project commit, push or merge was performed.

## Phase 5C — Commit + Branch + History (`COMPLETE`, 2026-09-06)

- Implemented the explicitly authorized backend package from the clean,
  committed Phase 5B baseline on `feature/phase-5`. Main/IPC/Preload now expose
  staged-only commit, one local branch snapshot, safe existing-local branch
  switch and bounded local HEAD history. All requests/responses are runtime
  validated; Renderer gains no process or raw Git authority.
- Commit preserves unstaged content and supports first commits and Unicode/
  multiline messages. Invalid messages and Git failures are normalized safely.
  Fixed metadata checks reject commit during merge/rebase/cherry-pick/revert/
  sequencer operations, including a real pending merge verified in tests.
- Branch snapshots distinguish attached, detached and unborn state. Main checks
  fresh local membership before switching, uses no force/discard/creation flags
  and protects ignored files as well as ordinary local changes. A nonzero switch
  can follow an applied switch when post-checkout fails: the approved policy
  reports unknown outcome, requires refresh and never automatically retries.
- History returns full id, subject, author name and authored ISO timestamp from
  HEAD ancestry only. Confirmed unborn history is empty; default/max are 50/100,
  with invalid requests rejected. Fixed NUL framing excludes bodies; typed
  parsing and the existing 1 MiB process-output bound reject malformed/excessive
  output safely. No new history or branch dependency was required.
- Confirmed commit/switch success reuses the 5B applied/refresh-required envelope,
  preserving truth after refresh failure or a project transition. Exact active
  project/root authorization remains in place. Full owner cancellation and
  lifecycle coordination remain Phase 5D.
- Final verification passed: 34 focused 5C tests (23 real Git repository tests),
  176 focused 5A/5B regressions, and all 710 tests across 55 files with unchanged
  `--maxWorkers=4` and no local skips. Typecheck, lint, production/native build
  and whitespace checks passed. Local Git: 2.47.1.windows.2.
- Sandboxed test/build EPERM required approved outside-sandbox execution. An
  initial full run concurrent with build had two new tests exceed the existing
  5-second timeout. History's unnecessary branch enumeration was removed; final
  isolated full-suite verification passed with all assertions/timeouts intact.
  No sleeps, configured retries or skipped tests were added. The existing jsdom
  canvas diagnostic remains non-blocking.
- Updated Implementation Plan and Codebase Map after verification. No dependency,
  package-lock or ADR change; no Source Control UI, remote Git, Phase 5D system,
  repository stage/commit/push, or overall Phase 5 completion is claimed.

### Phase 5C remediation — valid local branch `@` (2026-09-06)

- Corrected the MEDIUM review finding: shared validation and branch snapshots
  accept Git-valid `@` without weakening other name restrictions. Its presence
  no longer prevents switching unrelated local branches.
- Implemented user-approved option 1: normal branches retain safe `git switch`;
  `@` uses Main-generated exact `refs/heads/@` with a native detached switch,
  project/root and HEAD/ref revalidation, then symbolic HEAD attachment and final
  proof. Native post-checkout may see DETACHED, as explicitly approved.
  Failed/interrupted steps or unproven final state return mutation-outcome-unknown
  after a recovery probe, without rollback, retry, hook suppression or read-tree.
- Added real Git evidence for exact target identity, hooks, blocked and harmless
  local changes, ignored-file preservation, attachment lock failure, ref/project
  changes and failed final proof. Existing invalid-input checks still pass.
- Corrective reopening is complete: focused 44/44 (32 real Git cases), 5A/5B
  regression 176/176, full suite 720/720 across 55 files with maxWorkers=4,
  typecheck, lint and production/native build passed. Git 2.47.1.windows.2;
  approved outside-sandbox test/build execution, no timeout inflation or retries.
- No dependency/package-lock change, repository staging/commit/push, Phase 5D,
  Source Control UI or remote Git was introduced.

### Phase 5C resumed verification (2026-09-07)

- Reviewed the existing uncommitted `@` correction; no further production edit
  was needed. Corrected the Implementation Plan overview to list 5D–5F remaining.
- Fresh standalone full suite passed 720/720 tests in 55 files; typecheck, lint
  and production/native Windows build passed. An earlier suite overlapping
  typecheck/lint had three timeouts (717 passed); no assertions, timeouts,
  worker settings or skip/retry settings were changed. Tests/build ran with
  approval outside the sandbox after spawn EPERM.
- 5C remains complete. No ADR, dependency or later-package scope changed.

## Phase 5D — Git lifecycle, cancellation and stale results (`COMPLETE`, 2026-09-08)

- Resumed the authorized unfinished work on `feature/phase-5`, preserving its
  uncommitted implementation and fixtures. Added Main-owned project/window
  generations, latest-read cancellation, mutation serialization and transition/
  shutdown draining around the existing GitService semantic operations.
- Added validated identity framing and Preload receiving guards. Late replies
  are rejected after supersession, project changes, root unavailability or app
  shutdown. Confirmed mutations preserve `applied` while dropping stale status;
  unknown outcomes require refresh and never trigger automatic retries.
- Production Git now uses retained Windows Job ownership with bounded command
  timeouts/output. Root exit terminates surviving hook descendants; release
  requires both pipe EOFs, native settlement and an empty Job. Cleanup failure
  blocks authority release and app shutdown until retry succeeds. The private
  native Git entry shares pipe/Job primitives while preserving Run's original
  single-target entry, separate service and lifecycle.
- Verification passed: 760/760 tests across 59 files, including 40 5D cases;
  real Git hook/descendant, abort/timeout and semantic mutation integration;
  Git native Electron Unicode/argv/commit/history smoke; existing Run native
  smoke with 15 cycles, root-first cleanup and failed spawn. Typecheck, lint,
  final production/native build and whitespace checks passed.
- Evidence host: Windows NT 10.0.26200.0 x64, Git 2.47.1.windows.2 and Electron
  44.0.0. Sandbox EPERM required approved external execution. Earlier suites
  had timeout failures; oversized native scenarios were split into independent
  cases and final standalone verification passed with unchanged worker count,
  timeout limits and configured retries. Existing jsdom canvas noise remains.
  Non-Windows native skips provide no Windows acceptance evidence.
- Updated Architecture, Codebase Map and Implementation Plan. No ADR change,
  added dependency, repository commit/push or Phase 5E/5F implementation.
  Overall Phase 5 remains in progress; Source Control UI is the next package.

### Phase 5D remediation — committed document ownership (2026-09-08)

- Completed resumed verification of the MEDIUM finding where `git:get-context`
  could restore an owner revoked during navigation. Main now observes windows
  before load and restores ownership only on a committed current main document;
  context and semantic IPC reject stale Electron sender-frame identities.
  Shared DTOs and the public Git API are unchanged.
- Six added document regressions verify context rejection, replacement/token
  races, repeated navigation, invalid callers, read cancellation and mutation
  draining. The focused document/lifecycle IPC run passed 16/16 tests; the full
  suite passed 766/766 across 60 files with no skips.
- Real sandboxed Electron Preload/Main smoke passed three reloads on the same
  WebContents, four distinct document frames and three rejected old-document
  requests. Fresh document requests succeeded after each commit.
- Typecheck, lint, production/native build, Git native smoke, Run native smoke
  (15 cycles plus descendant cleanup and failed spawn), and diff whitespace
  checks passed. Test/build sandbox spawn EPERM was resolved by approved
  outside-sandbox execution. Existing jsdom canvas diagnostics were non-blocking.
- Phase 5D returned to COMPLETE after corrective verification. This continuation
  retained the prior implementation without further production changes and
  updated acceptance evidence. No ADR/dependency change, architecture deviation,
  repository commit/push or Phase 5E/5F work.

## Phase 5E — Right sidebar and Source Control (original completion, 2026-09-08)

### Resumed corrective acceptance (2026-09-09)

- Verified the retained whitespace-only Search fix and four regression cases:
  Names restores its tree, Contents remains idle, no empty search is sent, and
  active-query cancellation rejects late results while preserving literal spaces
  in non-empty queries.
- Default parallel `npm test` passed 811/811 in 65 files with unchanged four
  workers, timeouts, assertions and retry settings. Previous Git timeouts did
  not reproduce; no timing root-cause fix is claimed.
- Typecheck, lint, production/native build, both Electron 5E smokes and
  `git diff --check` passed. Inspected four regenerated sidebar screenshots;
  real Git smoke verified semantic actions, sandbox and owned cleanup.
  Tests/build used approved external execution after sandbox spawn failures.
- 5E returns to COMPLETE; 5F remains NOT_STARTED. No dependency, ADR,
  architecture change or repository commit/push.

### Corrective sidebar follow-up (2026-09-08; historical blocker)

- Follow-up icon correction: replaced the Explorer tab's `Folder` with the
  existing Lucide `Files` icon in `App.tsx`, matching `icon: Files` in Orca's
  `src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts`
  at locked commit `4bb337741c335cfcc428d3b4271023566e2dadb8`. Retained the
  16 px icon and existing tab styling. Typecheck, lint, build, 60 Explorer
  integration tests and real Electron sidebar/Git smoke passed; the regenerated
  `explorer-aligned.png` was visually inspected. No dependency or ADR change;
  the previously recorded full parallel-test blocker remains unchanged.
- Finished verification of the resumed Orca-aligned sidebar geometry, search-mode
  strip, compact file rows and trusted file-only Git decorations. Added explicit
  accessible file-row names, including conflict read-only descriptions.
- Expanded the real Electron smoke with accessible labels, DPI-aware geometry,
  220 px keyboard resizing and viewport/content containment. Real Git/UI and
  Names/conflict fixture smoke passed; all four generated screenshots were inspected.
- Focused regression passed 85/85; full sequential diagnostic passed 807/807
  tests across 65 files via `npm test -- --no-file-parallelism`. Typecheck, lint,
  production/native build and whitespace checks passed.
- Default parallel `npm test` still has varying 5-second real Git integration
  timeouts. The corrective package is BLOCKED on that gate, despite successful
  sequential verification; no timeout/assertion/configuration changes were made.
  No new dependency, ADR, architecture deviation, repository commit/push or 5F work.

### Original baseline evidence

- Continued the existing uncommitted 5E work on `feature/phase-5`, preserving
  sidebar, Names/Contents search, Source Control and test changes. The right
  sidebar provides Explorer/Source Control icon tabs with retained session state.
- Source Control presents dependency/repository states, staged/unstaged/untracked
  files, read-only conflicts, selected-file stage/unstage, staged-only commit,
  current/local branch switching and bounded history through the existing Git API.
- Drafts survive tab/Refresh changes; only unchanged successfully submitted text
  is cleared. Newer edits and failed/unknown submissions are retained. Project
  replacement/close resets drafts. Mutations are serialized in the UI; stale reads
  and unsafe follow-up after unknown/unrefreshed outcomes are blocked.
- Corrected initial project-lock recovery and read settlement after unavailable
  roots; added the regression test. Matched Source Control scrolling to existing
  dark semantic styles without redesigning the Orca-aligned shell.
- Verified 802/802 automated tests across 64 files, typecheck, lint, final
  production/native build and whitespace checks. Initial sandbox spawn EPERM
  required approved external execution. A first-run Monaco timeout did not recur
  in the full rerun; no test timeout/worker configuration changed.
- Added `scripts/smoke-git-ui.mjs`: built App + production Preload/Main/document
  ownership/GitService/native runner passed real temporary-repository status,
  stage/unstage, staged-only commit, branch/history, draft retention, project
  replacement/non-repository/close, sandbox and owned cleanup. Component fixture
  smoke separately passed conflict/no-overflow and Names rendering checks.
  Screenshots in `out/phase-5e-ui/` were inspected.
- Updated Codebase Map and Implementation Plan. No new dependency, ADR change,
  architecture deviation or commit/push of this repository. Phase 5E is complete;
  Phase 5F remains NOT_STARTED and overall Phase 5 remains IN_PROGRESS.

## Phase 5F — Stabilization / Final Verification (`COMPLETE`, 2026-09-09)

- Started from clean committed Phase 5A–5E baseline `6af919e` on
  `feature/phase-5` and audited contracts, Main/Preload/Renderer authority,
  repository/path validation, mutation truthfulness, stale-state isolation,
  document ownership, Search/Git separation, process cleanup, UI state and test
  quality. No production defect or architecture/decision change was required.
- Focused tests passed: 5A 66/66, 5B 110/110, 5C 44/44, 5D 46/46, 5E 105/105,
  Phase 2D Search 28/28 and Run 112/112. The combined real-Git matrix passed
  72/72. Full `npm test` passed 811/811 across 65 files with the established
  four workers and no local skips.
- Electron/native evidence passed Git command/Job cleanup, three document reloads,
  built semantic Git/UI workflow, Names/conflict/resize presentation, 15 Run
  native cycles, Run re-run/stop and project/application cleanup. All lifecycle
  smokes finished with zero retained resources.
- Typecheck, lint, production/native build and whitespace checks passed. No retry,
  sleep, timeout, assertion or worker policy changed; no dependency or lockfile
  changed. The managed sandbox required the existing approved external process
  path for test/build execution.
- Confirmed absent/deferred: remote Git and fetch/pull/push, hosted review APIs,
  merge/rebase and conflict resolution, discard/diff, stage-all, branch management,
  worktrees, submodules, polling/watchers, Explorer folder aggregation and context
  menus. Packaged/installed Windows 10/11 verification remains Phase 7.
- Phase 5 is COMPLETE. No commit, push, merge or tag was performed by Phase 5F.

## Phase 5 corrective native-test portability (2026-09-09)

- Ubuntu GitHub Actions exposed that the Phase 5C real local Git integration
  suite ran unconditionally even though production Git detection intentionally
  uses Windows `git.exe` semantics. This was a test-configuration defect; no
  production Git regression was found.
- Correctively reopened Phase 5C and Phase 5F, then guarded the entire 5C native
  suite with the existing non-Windows suite-skip policy. Non-Windows CI now
  skips the Windows-specific suite intentionally. Windows still runs all 32
  tests and treats unavailable Git or any assertion failure as a failure.
- Focused Phase 5C passed 32/32 on Windows. Phase 5A/5B/5D native regression
  passed 32/32. The first unchanged default full run recorded one existing
  5-second timing-sensitive 5C timeout at 5.022 seconds (810/811 passed); an
  independent unchanged rerun passed 811/811 across 65 files.
- Typecheck, lint, production/native build and `git diff --check` passed. No
  assertion, timeout, configured retry, production code, product semantic,
  dependency, lockfile, contract, IPC or ADR changed. Phase 5C and Phase 5F
  returned to `COMPLETE` after local corrective verification.
- The corrected Ubuntu GitHub Actions run remains pending until this uncommitted
  change is pushed. No CI pass, commit, push, merge or tag is claimed here.

## Phase 5.5B C# compatibility hard gate (2026-09-10) — COMPLETE

- Built an isolated Windows spike for real `csharp-ls` stdio LSP behavior using
  trial versions 0.27.0, .NET SDK 10.0.401/runtime 10.0.12,
  `vscode-languageserver-protocol` 3.18.3, and `vscode-jsonrpc` 9.0.2. No
  production dependency or C# service code was added.
- Verified `.sln`, `.slnx`, recursive multi-project mode, paths with spaces/`#`/
  Unicode, UTF-16 dirty incremental sync, completion/resolve/cancellation,
  hover/signature/definition, pull diagnostics, dynamic watched-file
  registration, graceful/unexpected exit, and zero surviving owned processes.
- Verified strict TypeScript, Electron 44 runtime imports, and electron-vite 5.0.0
  production bundling. Project mode also demonstrated that current `csharp-ls`
  recursively loads project files under `bin`, `obj`, `build`, and `out`; Main
  cannot claim ownership of the actual loaded set.
- The initial machine-readable workspace-load failure check did not pass. A
  malformed project initialized and registered normally, stayed alive, returned
  an empty semantic result, and ended work-done progress normally. Only human
  log/progress strings exposed the failure.
- The authorized corrective spike retained `csharp-ls` and verified a structured
  Main-owned preflight: effective SDK exit state, `.sln`/`.slnx` parse exit state,
  bounded `.csproj` discovery, evaluation-only MSBuild property/item JSON, and
  contained/existing `ProjectReference` checks. Valid/broken solution and project,
  unknown/missing SDK, missing reference, targeting, and multi-project cases all
  produced their expected deterministic state without build, restore, target
  execution, temporary solutions, or workspace mutation.
- An unavailable targeting pack intentionally remained a preflight false positive,
  recording the bounded guarantee: `READY` does not certify equivalent Roslyn
  workspace health, and `RUNNING` means only an alive initialized LSP session.
  Valid and broken workspaces both returned empty/null semantic outcomes, so
  semantic emptiness and human log text are excluded from readiness.
- ADR-022 now selects `csharp-ls` 0.27.0, protocol 3.18.3, and JSON-RPC 9.0.2.
  Phase 5.5B is `COMPLETE`, Phase 5.5 is `IN_PROGRESS`, and 5.5C–5.5H remain
  `NOT_STARTED`; no production C# language implementation was added.
- Final verification passed 12/12 structured preflight cases, the full provider
  harness including valid/invalid semantic checks, spike TypeScript/Electron/
  electron-vite gates,
  root typecheck, lint, production/native build, 811/811 tests, and
  `git diff --check`. The first full test attempt had one timing-only Monaco
  timeout; its focused run and the unchanged full rerun passed.

## Phase 5.5C — Contracts + Dependency Foundation (2026-09-10) — COMPLETE

- Added side-effect-free shared contracts and exact validators for C# provider/
  capability ownership, dependency/service/workspace states, safe reason codes,
  project-relative documents, positions/ranges/versions, semantic requests,
  completion/hover/signature/definition/diagnostic DTOs, and opaque completion
  handles. Public shapes expose no executable, canonical-root, process, cwd,
  spawn, raw LSP/JSON-RPC, raw completion-data, or Electron authority.
- Added Main-only PATH resolution and canonical executable validation, finite
  bounded dependency probing, `dotnet --list-sdks` inventory parsing with SDK
  10+ and prerelease-only semantics, and `csharp-ls --version` enforcement for
  the exact approved 0.27.0 provider.
- Enforced development private-provider-first then PATH fallback and packaged
  app-owned-only resolution with no packaged PATH fallback. The packaged
  candidate is supplied by trusted Main composition; Phase 5.5C did not invent
  a payload directory, and Phase 7 retains packaged/installed verification.
- Added exact runtime dependencies `vscode-languageserver-protocol` 3.18.3 and
  `vscode-jsonrpc` 9.0.2 plus 19 focused validation/dependency tests. The full
  test command, typecheck, lint, production/native build, and whitespace gate
  passed without weakening worker, timeout, retry, assertion, or test policy.
- Added no workspace preflight execution, long-running language session, LSP
  connection, provider spawn lifecycle, document synchronization, IPC/Preload,
  Monaco semantic integration, diagnostics/Problems UI, or Phase 5.5D+ work.

## Phase 5.5D — Main LSP core and C# adapter (2026-09-10) — COMPLETE

- Implemented Main-only pinned JSON-RPC stdio transport, request correlation,
  cancellation/deadlines, server handlers, protocol error normalization and
  disposal. The C# adapter captures UTF-16 initialize capabilities and maps
  completion/resolve, hover, signature, definition and pull document diagnostics.
  Completion data and diagnostic result IDs remain in Main.
- Implemented the dependency-backed one-session manager, generation/stale-result
  guards, crash handling without automatic restart, graceful shutdown and
  retained cleanup failure ownership. Added only low-level document/watched-file
  notification primitives; no production synchronization orchestration.
- Applied the separately authorized native C# process decision: writable stdin,
  stdout/stderr pipes, atomic Windows Job creation and terminate/empty/release
  ownership. Run, Git, Terminal and ProcessManager behavior are unchanged.
- Verified 33 deterministic LSP/adapter/lifecycle tests. Production Electron
  smoke proved surviving descendant ownership after hard-killing root 27124,
  rejected early release, descendant 19404 termination, an unaffected unrelated
  control, and blocked stdin write settlement before release. Real csharp-ls
  0.27.0 on SDK 10.0.401 advertised all required V1 capabilities with the minimal
  client and shut down with zero retained registrations.
- Typecheck, lint, production/native build and whitespace checks passed.
  The initial final full suite passed 862/863; one unchanged Phase 5C Git integration
  test timed out at 5000 ms despite passing in isolation. Full-suite acceptance
  was BLOCKED at that point. No assertion, timeout, worker setting or retry was weakened;
  canonical TEMP casing was used for the test process after diagnosing existing
  case-sensitive fixture expectations.
- Corrective investigation reproduced the Git timeout in the existing real-Git
  harness: the affected case took 4044 ms alone and 5024 ms under concurrent Git
  suites, while language + Git passed at 3881 ms and no C#, native or Git child
  survived. Repeated repository setup subprocesses across four workers caused
  resource contention; no Phase 5.5D lifecycle leak was found.
- The Phase 5B/5C/5D real-Git harnesses now reuse one prepared baseline per suite
  while copying an isolated repository for each test. This retains every real
  Git operation and assertion while removing redundant init/config/add/commit
  setup. No timeout, retry, sleep, worker, skip, assertion or production Git
  behavior changed.
- Focused local Git passed 32/32; the exact Git-suite reproduction passed
  266/266; the combined changed harnesses passed 55/55. Two consecutive canonical-
  TEMP full suites passed 863/863 in 51.31 s and 48.96 s. Typecheck, lint,
  production/native build and whitespace checks passed.
- No workspace selection/preflight orchestration, language IPC/Preload, Renderer
  providers, Problems/status UI, or Phase 5.5E+ work was started.

## Phase 5.5E — Workspace and document synchronization (2026-09-11) — COMPLETE

- Implemented Main-owned bounded workspace discovery, saved valid .sln/.slnx
  selection, opaque multi-candidate choices, project mode and syntax-only fallback.
  Per-project selection uses versioned atomic persistence and backup recovery.
  Preflight uses fixed evaluation-only commands, structured exit/JSON results,
  canonical containment and ProjectReference checks. No target/build/restore or
  intentional workspace write is requested; the trusted-project limitation is
  unchanged.
- Added finite native preflight commands with bounded output/deadlines and
  terminate/drain/empty/release Job ownership. Cleanup failure is retained and
  blocks conflicting commands. Main composes the lazy session with project,
  root, renderer-owner and application lifecycle.
- Internal document synchronization retains authoritative text and ordered
  incremental UTF-16/model versions, flushes before semantic work, rejects stale
  results and orders saves through FileSystemService. Watcher events honor
  open-document precedence and dynamic registration/kind masks.
- Real Electron smoke found expected stale watcher cancellation being reported
  as cleanup failure on project close. Only stale-session errors from a replaced
  watcher are now suppressed; live I/O/protocol/cleanup failures remain visible.
- Focused tests: 47/47 PASS, covering workspace policy/persistence, malformed
  evaluation and reference failures, canonical escape, dirty buffers, Unicode,
  batching/version order, save races, rename/delete, switch/close/root loss,
  close during provider startup, renderer loss, stale results, crash/no restart
  and retained cleanup failures.
- Standard npm test: 910/910 tests in 70 files PASS (53.34 s), without altered
  workers/timeouts/assertions/retries or environment overrides. Four existing
  filesystem/project/search test fixture helpers canonicalize TEMP with realpath;
  assertions are unchanged. Existing jsdom canvas noise remains non-blocking.
- Typecheck, lint, production/native build and git diff --check PASS.
  scripts/smoke-csharp-preflight.mjs passed real Electron/native SDK 10.0.401
  .sln/.slnx evaluation, unchanged fixture hashes and malformed-project rejection.
  scripts/smoke-csharp-workspace.mjs passed real csharp-ls 0.27.0 solution/.slnx/
  project-mode cycles with Unicode/space/# paths, dirty UTF-16 versions,
  flush-before-request, FileSystemService save, close/stale-handle rejection,
  zero retained provider registrations and syntax-only fallback without a process.
  Smoke exercises production Main modules; user-facing integration remains 5.5F–G.
- Existing scripts/smoke-csharp-native.mjs also PASS: hard-killed root 11104,
  surviving descendant 21660 retained until Job termination, empty-before-release,
  unrelated control preserved, blocked stdin settled and real provider shutdown.
- No new dependency/ADR resolution, architecture deviation, language IPC/Preload,
  Renderer provider, diagnostics/Problems/status UX, C# Run or trust UX. Phase 7
  retains packaged/installed acceptance. 5.5E is COMPLETE; 5.5F still requires
  separate authorization.

- Updated actual module map and implementation/language status. No commit, push
  or merge was performed.

## Phase 5.5F — IPC, Preload and Monaco semantic providers (2026-09-11) — COMPLETE

- Added exact-validated, committed-frame-owned C# language IPC and a narrow
  Preload API for workspace selection, document synchronization, completion,
  completion resolve, hover, signature help, definition and cancellation.
- Added Main semantic mapping with bounded opaque completion handles, safe
  presentation text, stale-result guards and canonical active-project
  containment for definition targets.
- Added Renderer-session synchronization and separate Monaco completion, hover,
  signature-help and definition providers using negotiated capabilities/triggers
  and explicit UTF-16 range/enum conversion.
- Focused 5.5E–F regression tests passed 150/150; the full suite passed 947/947
  in 72 files. Typecheck, lint, production/native build and `git diff --check`
  passed without changing test policy.
- Diagnostics/Problems/status UX, C# Run, public restart/raw logs and all other
  deferred capabilities remain outside 5.5F. No dependency, ADR or architecture
  deviation was introduced.

## Phase 5.5G — Diagnostics, Problems and status UX (2026-09-12) — COMPLETE

- Added exact-validated open-document diagnostic IPC/Preload routing. Main
  serializes pulls after document synchronization, retains `resultId` privately,
  normalizes bounded severity/code/source/message/ranges, and rejects cancelled or
  stale owner, project, session, document and model-version work.
- Added the C# Renderer diagnostic controller with a dedicated Monaco marker
  owner, existing Problems aggregation/navigation, dirty-model preservation,
  provider/project generation guards, and scoped clear/disposal. Post-edit
  `unchanged` reports use bounded settling pulls until a fresh full report arrives.
- Added status-bar UX that presents dependency, workspace and service lifecycle
  independently, including solution selection, loading/failure, syntax-only
  fallback and `CRASHED`, without public restart, process or raw-log authority.
- Focused diagnostics/Problems/status coverage passed 128/128. The full suite
  passed 1004/1004 tests in 74 files; the existing jsdom canvas warning remained
  non-blocking. Typecheck, lint and production/native build passed without
  changing test workers, timeouts, assertions or retry policy.
- No dependency, ADR or architecture deviation was introduced. C# Run, workspace
  diagnostics, Razor, metadata navigation, public/manual restart, raw logs and all
  other deferred capabilities remain absent. Windows Electron smoke, repeated
  cycles/performance review and final Phase 5.5 verification remain Phase 5.5H.

## Phase 5.5F/G corrective runtime verification (2026-09-12) — IN_PROGRESS

- Reopened after failed manual hover/diagnostics acceptance. Preserved canonical
  C# document/watcher URI casing on the wire, keeping decoded case-insensitive
  Windows ownership checks and duplicate rejection. Previous adapter comparison
  reproduced null hover/empty diagnostics only with lowercased wire identity.
- Added `scripts/smoke-csharp-acceptance.mjs`: a fresh dotnet console fixture,
  actual Electron application/Preload/Monaco/csharp-ls, private build-only trace,
  capability/registration/security checks, marker/Problems checks and screenshots.
  All five requested workflows passed in automated real-app verification.
- Focused regression: 170/170; full suite: 1005/1005 in 74 files; typecheck, lint,
  production/native build and diff-check passed. No production architecture,
  public contract, scheduling or lifecycle change was needed in this resumption.
- Manual pointer/keyboard reacceptance is still unverified because Windows
  Computer Use's native pipe was unavailable. Automated evidence does not replace
  that claim. F/G remain IN_PROGRESS; 5.5H remains NOT_STARTED.

## Phase 5.5F/G development-launch correction (2026-09-13) — VERIFIED

- Identified the first launch divergence: the real-app acceptance harness pinned
  the Phase 5.5B private .NET 10.0.401/provider stack, while `npm run dev`
  inherited its caller's `DOTNET_ROOT` and PATH. The inspected dev environment
  resolved system .NET 10.0.112 and did not contain the project-private provider.
- Added a development-only launcher that uses the complete validated private pair
  when present and preserves PATH fallback otherwise. Production composition,
  IPC, security, diagnostics, scheduling and lifecycle logic did not change.
- A real `npm run dev` trace verified CS0029 from provider through Monaco and
  Problems for `int b = "aaa";`, then verified CS0029 cleared for `int b = 123;`.
  Focused tests passed 171/171; the final full suite passed 1009/1009; typecheck,
  lint, production/native build and `git diff --check` passed. Phase 5.5H remains
  NOT_STARTED.

## Phase 5.5H — Stabilization and final verification (2026-09-13) — COMPLETE

- Final verification passed: focused 227/227 tests (14 files), full 1009/1009
  (75 files), typecheck, lint, production/native build and git diff --check.
- Real Windows native ownership/descendant cleanup, blocked stdin settlement,
  provider lifecycle, workspace/preflight, Unicode/UTF-16, document sync/save
  and repeated cleanup passed. Controlled real-provider crash reached CRASHED,
  rejected the old adapter and released all test-owned resources.
- Final security audit confirmed sandbox settings, runtime validation, trusted
  frame/project/path/version ownership and Main-only protocol/process authority.
- The user confirmed manual completion, hover, signature help, definition,
  markers/Problems, correction clearing, project switching, document reopening
  and npm run dev acceptance PASS, and confirmed all remaining H gates satisfied.
  This supersedes the historical manual-pending F/G and H records above.
- Phase 5.5A–5.5H and overall Phase 5.5 are COMPLETE. Final closure changed
  documentation only; no production code or architecture changed. Phase 6/7
  remain NOT_STARTED. Packaged/installed C# acceptance remains Phase 7.

## Phase 6 — Settings & UX (2026-09-14) — COMPLETE

- Completed the existing SettingsService/IPC/preload and Settings dialog work:
  Light/Dark/System, editor font/tab preferences, fixed shortcut guidance and
  dispatch, and the user-approved dependency guidance scope.
- Implemented ADR-023 Auto Save through existing version-aware saves, with
  1000 ms debounce, rename/disposal handling and dirty/conflict preservation.
- Completed unbounded MRU Recent Projects list/open/remove. Missing folders
  provide recovery guidance; history removal does not delete source or close
  the active project. New history and settings endpoints authorize the current
  Main frame and validate exact payloads.
- Migrated app metadata v1 to v2, preserving history and applying defaults.
  Queued state transformations prevent concurrent Settings/history lost updates;
  backup/default recovery is visible and corrupt primary evidence is preserved.
- Added service/IPC/preload, renderer settings/shortcut, Auto Save and project
  regression coverage. Full suite: 1032/1032 tests in 78 files PASS; typecheck,
  lint, production/native build and diff checks PASS.
- Windows Electron 44 production-stack smoke passed initial save/Auto Save,
  separate-process restart and corrupt-JSON recovery. Light/Dark screenshots
  were inspected. The test-only model observation point and fixture artifacts
  remain under ignored out directories, outside the shipped application.
- No dependency, accepted architecture change, executable-path selection, source
  persistence authority or Phase 7 packaging work was introduced. Phase 7
  remains NOT_STARTED and ready for separate authorization.
## Explorer context-menu follow-up (2026-09-25)

- Replaced Explorer toolbar Rename/Delete buttons with file/folder context-menu
  actions. New File, New Folder and Refresh remain in the toolbar.
- Added independent compact floating menus with viewport clamping, separators,
  lucide icons, destructive Delete color, light/dark semantic tokens, Escape,
  outside dismissal, arrow navigation and right-button release protection.
- Captured the clicked entry and creation directory explicitly; row right-click
  selects without opening files or toggling folders. Background creation uses
  the project root. Existing dialogs, Recycle Bin and dirty-editor guards remain.
- Copy Path uses the browser clipboard for project-relative paths and reports
  failures. No Main/Preload/contracts, dependencies or security settings changed.
  No View File, preview tabs or other excluded actions were introduced.
- Visual/interaction evidence: Orca locked commit
  `4bb337741c335cfcc428d3b4271023566e2dadb8`,
  `src/renderer/src/components/right-sidebar/file-explorer-row-context-menu.tsx`
  (`FileExplorerRowContextMenu`, `stopRightButtonMenuSelection`); independently
  adapted grouping/surface/release behavior without copying modules or stores.
- Verified: 1039/1039 tests across 78 files (69 Explorer/App integration tests),
  typecheck, lint, production/native Windows build and scoped diff whitespace
  checks. Final repository-wide diff check reports trailing whitespace at
  `src/renderer/src/App.tsx:263` in an unrelated concurrent edit, left untouched.
  Live Electron visual QA was not performed. Preserved the pre-existing unrelated
  Problems/Output hover CSS change; no commit or push was performed.
## Local AI Chat UI V1 — 2026-09-25

- Added a Sparkles toggle and a right-sidebar-only chat overlay, preserving
  mounted Explorer/Git state and keeping the sidebar resizer interactive.
- Added static C# example messages and ephemeral mock prompt/reply behavior;
  closing the panel discards the conversation. qwen3:1.7b is display text only.
  No Ollama, AI IPC/preload/backend, file context, tools or persistence.
- Per user correction, retained stock beUI Message, MessageBubble,
  MessageScroller, PromptInput and StreamingResponse source/UI with local import
  rewiring and required upstream support modules. Removed bespoke component CSS;
  only the surrounding chat background follows the project. Semantic Tailwind
  tokens and scrollbar-hide support the upstream classes. Preserved MIT notice
  and source URLs in components/ai. No full shadcn app or demo was imported.
- Added clsx 2.1.1, motion 13.4.3 and tailwind-merge 3.7.0. npm audit reports
  existing Monaco/DOMPurify low/moderate findings; no unrelated upgrades applied.
- Renderer checks: 73/73 passed. Full suite: 1043/1043 across 79 files passed on
  rerun; first concurrent build/test run timed out one real-Git first-commit test
  at 5000ms. Typecheck/lint passed. Light/dark Electron harness renders inspected
  with stock 14px text/16px bubble and prompt radii. Final production/native build
  and diff checks passed. No commit/push/merge.

<<<<<<< HEAD
## 2026-10-24 — S5-F1 cooperative Main correction (acceptance pending)

- User accepted S5-P2 and approved A/B2/C. Implemented one resumable scanner/schema
  kernel with synchronous/cooperative drivers, private5ms scheduling and approved
  work caps, real immediate barriers,64KiB hash updates, cooperative freeze/index
  and retained private representation/copy/packet jobs. Same anchored reader,
  ledger/lease ownership and error/validation semantics; Runtime9D/Policy B,
  ceilings, assets, dependencies and external IPC unchanged.
- Targeted package acceptance:213 PASS/1 existing file-symlink SKIP across11 files;
  separate Run/service/UI/drafts/Project regression:444 PASS across10 files.
  Typecheck/targeted lint/build PASS. No full suite/full lint.
- Reused exact historical fixture bytes/workloads and charged registered clone.
  Available-host plain stall p95/max (ms): production10.363/15.786,
  string1.398/15.162, dense10.864/17.826, registry2.627/14.521. Isolated RSS delta
  stays below128MiB review trigger; logical peaks match historical accounting,
  stopped counters zero. Heavy elapsed latency increases; atomic/host risk remains.
- Historical FAIL is retained. JS/editor-drafts/Monaco worker smokes PASS; initial
  C# PREPARE_TIMEOUT with VERIFIED cleanup and whole-app memory/stall observations
  remain review items. Exact C# repeat scope/results and complete evidence are in
  [correction report](PHASE-9E1-S5-F1-CORRECTION.md). Required-host/Windows10/UNC/
  installed gates remain UNVERIFIED. Step5/9E-1 not closed; no9E-2/Worker/Judge/
  Submit or Git publishing.

## 2026-10-24 — S5-O1 bounded batching (accepted)

- Implemented approved batching of shared scanner string/whitespace and freeze
  traversal. Reduced generator handoffs without changing S5-P2 caps/cadence/5ms
  scheduling, mandatory barriers, validation or ownership/deadline contracts.
  Production changes are confined to bounded-package-json.ts and
  exercise-package-work.ts; no Runtime/IPC/native/SDK change.
- Captured1,089 pre-O1 golden vectors and added batching/cancellation/charge/
  sync-cooperative rollback checks. Final package244 PASS/1 existing symlink SKIP;
  separate Run/UI/drafts/Project regression444 PASS; typecheck/targeted lint/build
  PASS. No full suite/full lint.
- Exact four historical fixtures/workloads/clones retained. Fresh before/after
  large-string latency2502.260→315.705ms, dense790.248→698.480ms,
  maximum-registry1507.420→582.845ms; public p95 107.994→103.016ms.
  All four isolated stall gates pass; measured yield counts/reasons are identical.
  CPU/handoff reductions, RSS/GC/ledger and non-improvements are documented in
  [O1 evidence](PHASE-9E1-S5-O1-OPTIMIZATION.md).
- JS/drafts/Monaco smokes PASS; initial C# PREPARE_TIMEOUT retained, unchanged
  C#/Project/PTY presentation repeat PASS with VERIFIED cleanup. Required hosts,
  installed gates and Prepare reliability remain unresolved. Scoped conclusion
  PASS WITH LIMITATIONS; Step5/9E-1 not closed,9E-2 not authorized. No Git publishing.

- User subsequently accepted **S5-O1 COMPLETE — PASS WITH LIMITATIONS** on2026-10-24
  using the same244 PASS/1 SKIP,444 regression and measurement evidence without
  tests/build reruns. Step5/9E-1 remain open.

## 2026-10-24 — S5-R1 SDK discovery diagnostics (accepted DIAGNOSTICS ONLY)

- Added test-only in-memory Electron SDK/Prepare/filesystem/metadata/CPU probes
  and launcher; reused the existing O1 production build and presentation smoke.
  Five fresh processes PASS with Project/PTY and VERIFIED cleanup. No production
  source, deadline, identity check, quota or Policy B change; no caching.
- Successful Prepare traces identify repeated SDK ancestor/file lstat/realpath
  verification as the dominant measured cost. No Prepare timeout reproduced;
  historical cause/cold-host reliability remain UNVERIFIED. Pure path-plan reuse
  and bounded file-verification concurrency are proposals requiring approval.
- Targeted instrumentation lint/syntax PASS. No full suite/full lint or production
  build; preserved O1 evidence without rerun. Full evidence and limitations:
  [S5-R1 diagnostics](PHASE-9E1-S5-R1-SDK-DISCOVERY-DIAGNOSTICS.md).
  No Step5/9E-1 closure, S5-A1/9E-2 or Git publishing.

## 2026-10-24 — R1 diagnostics closed; isolated concurrency prototype evaluated

- User accepted S5-R1 COMPLETE — DIAGNOSTICS ONLY. Existing lstat/realpath
  bottleneck evidence and historical PREPARE_TIMEOUT UNVERIFIED retained.
- Built isolated generated-copy experiment with≤4 file tasks/≤64MiB read-buffer
  credits; retained per-file safe/read/stat/sameFile/PE checks and ordered result
  consumption. Production resolver/Runtime9D/Compile revalidation unchanged.
- Four same-workload Electron smokes PASS; median SDK3792.921→1596.553ms,
  Core Prepare3866.197→1680.507ms, same filesystem counts. Bounds/drain/actual
  handles tested; baseline56 PASS/1 SKIP and prototype56 PASS/1 SKIP overlap.
  Typecheck/targeted lint/syntax PASS, no full suite/lint/production build.
- **NOT PASS for production promotion:** adversarial cross-file mutation shows
  temporal freshness differs despite all per-file checks. Defect assertion PASS
  is not security parity PASS. No production optimization or semantic waiver.
  [Prototype evidence](PHASE-9E1-S5-R1-BOUNDED-CONCURRENCY-PROTOTYPE.md).
  Stop for user review; Step5/9E-1 open, no S5-A1/9E-2 or Git publishing.

## 2026-10-24 — Step5 accepted COMPLETE, Current Host Only

- User-approved scope amendment S5-AC1 closes **Step 5: COMPLETE — PASS WITH
  LIMITATIONS (Current Host Only)**. Accepted existing S5-F1/O1 and passing
  foundation gates; preserved244 PASS/1 SKIP,444 separate regression, all before/
  after measurements, historical FAILs and limitations. No tests/build/profiling
  rerun and no production changes for this documentation-only closure.
- Two loader targets remain **UNVERIFIED**, mandatory before9E-7 acceptance/
  release certification: Windows10 x64/2 physical cores/8GiB/SSD and Windows11
  x64/≥4 physical cores/16GiB/SSD. Same4 fixtures/workload/registered clone and
  p95≤50ms/max≤100ms; current-host PASS is not reference-host PASS.
- Historical C# Prepare cause/reliability, full-app attribution and file-symlink/
  UNC/opaque reparse/installed-offline limits retained. R1 diagnostics COMPLETE —
  DIAGNOSTICS ONLY; concurrency prototype NOT PASS and forbidden in production.
  Security, Runtime/Policy B/deadlines/ceilings and S5-P2 A/B2/C unchanged.
- Synchronized ADR-025, Implementation Plan, Requirements/Architecture status
  pointers, Codebase Map, limits-review pointer and
  [acceptance Section15](PHASE-9E1-STEP5-FOUNDATION-ACCEPTANCE.md#15-approved-step5-closure--current-host-only).
  Phase9E-1 IN_PROGRESS;9E-2 NOT_STARTED, no authorization. Stop for the user's
  next confirmation; no commit/push/merge.

## 2026-10-24 — Phase9E-1 officially accepted COMPLETE — PASS WITH LIMITATIONS

- Explicit user acceptance9E1-AC1 closes Exercise Package Foundation based on
  the final acceptance report and S5-AC1. Steps1–4 remain COMPLETE — PASS WITH
  LIMITATIONS; Step5 remains COMPLETE — PASS WITH LIMITATIONS (Current Host Only).
  Original counts, measurements, failures and limitations preserved; no tests/
  build/profiling rerun or production changes for this closure.
- Synchronized authoritative/current status pointers and labelled old report
  states as historical. Fixed blanket NOT MEASURED/PROPOSED wording for actual
  foundation evidence/modules without certifying later work or missing hosts.
- B1a Windows10 x64/2 physical cores/8GiB/SSD and B1b Windows11 x64/≥4 physical
  cores/16GiB/SSD remain UNVERIFIED, mandatory before9E-7 acceptance/release
  certification. Historical Prepare reliability/cause, full-app attribution,
  filesystem-security and installed/offline gates remain as recorded. SDK
  concurrency prototype **NOT PASS — excluded from production**.
- [Final closure](PHASE-9E1-FINAL-ACCEPTANCE.md#9-official-phase9e-1-closure):
  technical and phase-acceptance prerequisites for9E-2 satisfied; explicit start
  authorization still pending.9E-2 NOT_STARTED, Official Tests/Judge/Submit not
  implemented. Larger Phase9E IN_PROGRESS; stop for approval, no Git publishing.


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


## E2-S6 Wave C delivery — 2026-10-25

Wave B **COMPLETE — PASS WITH LIMITATIONS**, formally accepted; release5/121 cases/562 unique PASS+1 SKIP and all failures/limitations retained. [Wave C packet](PHASE-9E2-S6-WAVE-C-ACCEPTANCE.md): exactly7 chapter7 remainder sets/68 cases (14 public/54 hidden),107 static obligations,21/21 critical correctness and14/14 broader kills;5 new performance models plus5 inherited remain PENDING_RUNTIME. Two final clean roots318 files byte-identical; release6 SHA bf2d43d27d87cfe85f233de6e3c39f2fb96464a94047cd00a6fec282efd41d1e, compiled opener/309 resources match.56 full/7 public-only/63 total;49 prior full packages/379 accepted cases and189 sample/starter files unchanged.595 unique targeted PASS/1 SKIP; sandbox fork/CLI invocation failures retained. Typecheck/targeted lint/build,44 private URL probes/125 bundle files, MaxProfit C#/JS public Run7 Jobs and Monaco/drafts PASS. Raw LF/CRLF/.gitattributes unchanged. Official60s, especially three12-case sets, remains UNVERIFIED with inherited platform/reliability/release limitations. No semantic/architecture decision, Runtime/security/deadline/ceiling change or Git publication.

Wave C **IN_PROGRESS — delivered PASS WITH LIMITATIONS, awaiting user acceptance**. Phase9E-2/E2-S6 IN_PROGRESS; Wave D, E2-S7 and9E-3 NOT_STARTED. STOP.

## E3-S1 accepted / E3-S2 C# Official port review — 2026-10-25

The user accepts E3-S1 **COMPLETE — PASS WITH LIMITATIONS**, preserving its333
historical PASS/0 SKIP, then authorizes only E3-S2. [S2 review](PHASE-9E3-S2-CSHARP-OFFICIAL-RUNTIME-ACCEPTANCE.md)
delivers input-only integration into the existing C# lifecycle, signature-only
compilation, private strict-v1 evidence and input borrows retained through VERIFIED
barriers or Core release. Public Run constructor/contracts/mapping remain stable;
no Official Expected/visibility is sent to the child or public APIs. Core/native
policy, deadlines, quotas and frozen data remain unchanged.

182 unique targeted PASS/0 FAIL/0 SKIP:173 controlled unit/contract and9 real
Windows native integrations. Frozen Divide7/LeapYear8 cases compile once and run
in fresh ordered processes; exception/invalid-result/timeout/aggregate-output,
owner loss and controlled barrier-query retry finish with VERIFIED cleanup and
zero Registry shutdown ledger. Scoped typecheck/lint/emission build/whitespace
PASS; historical fixture failures and inherited limitations are recorded.
No full suite, full build/native rebuild, UI smoke or broader catalogue campaign.
All12 pending performance models and broader host/release/Official60s gates remain.
**E3-S2 REVIEW COMPLETED — AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS.
S3–S6 remain NOT_STARTED; no production service/hook wiring or Judge/Submit/storage.

## E3-S2 accepted / E3-S3 JavaScript Official port review — 2026-10-25

User accepts **E3-S2 COMPLETE — PASS WITH LIMITATIONS**, preserving182 historical
unique PASS/0 FAIL/0 SKIP (173 unit/contract +9 native) and all coverage/performance/
60s limitations without C# test reruns. Only E3-S3 was then authorized.
[S3 review](PHASE-9E3-S3-JAVASCRIPT-OFFICIAL-RUNTIME-ACCEPTANCE.md) delivers the
input-only JavaScript port/private evidence on the existing lifecycle: unchanged
Node24 PATH-first probe, parse-only syntax, VERIFIED barriers, fresh case processes,
raw quotas, retained inputs/Jobs and final cleanup. Public Run wrapper/contracts,
child v1, Core/native policy and frozen data/manifest7/anchor stay unchanged.

279 unique executed PASS:264 controlled unit/contract +15 real native integrations.
Two initial negative-zero fixture assertion failures were corrected;14 already
passing native tests were deselected in the final new public-parity invocation.
Scoped typecheck/targeted lint/emission build/whitespace PASS. Real Divide7 and
LeapYear8 cases, typed actuals, JS FAILED exit1, top-level parse-only behavior,
syntax/protocol/runtime/cancel/quota failures and query-retry cleanup are proved
on the current host. Broader native/host coverage,12 PENDING_RUNTIME models and
general Official60s/release certification remain pending. **S3 REVIEW COMPLETED
— AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS. **STOP: S4–S6 NOT_STARTED**;
no production Official service/hook, Judge/Comparator/Verdict/Submit/storage/history.

## E3-S3 formal acceptance — 2026-10-25

The user formally accepts **E3-S3 COMPLETE — PASS WITH LIMITATIONS**, based on the
unchanged [S3 acceptance report](PHASE-9E3-S3-JAVASCRIPT-OFFICIAL-RUNTIME-ACCEPTANCE.md).
Retain279 unique PASS (264 unit/contract +15 native),14 final name-filter SKIPs
previously PASS, historical failures and scoped typecheck/lint/build/diff PASS.
Public JS Run compatibility, VERIFIED native barriers/final cleanup, Registry
ledger zero and private-data boundaries remain accepted evidence. All12 models
stay PENDING_RUNTIME; Official Runtime60s UNVERIFIED and native/release coverage
incomplete. This closure changes status documents only; no verification workload,
production code/data or previous acceptance evidence was changed or rerun.
**Phase9E-3 IN_PROGRESS; E3-S4–S6 NOT_STARTED. STOP; no further implementation.**

## E3-S4 Main-private admission/shared driver review — 2026-10-25

After accepted S1–S3, user authorizes S4 only. [S4 report](PHASE-9E3-S4-DRIVER-HOOK-PRIVATE-ADMISSION-ACCEPTANCE.md)
delivers same-service Run/Official single-slot admission, exact Core/Registry
binding, shared C#/JS driver and synchronous post-RETURNED/VERIFIED CONTINUE/STOP.
Private completion preserves failure/true prefix/suffix and actual cleanup, while
public snapshot/event/last/IPC routes reject Official data. Owner/deadline guards,
retained package/native work, original quotas and Policy B remain; a failed12s
Official close waits for managed retry on the same operation, without relaunch.

221 unique PASS/0 FAIL/0 SKIP (219 controlled unit/contract +2 real native service
tests), scoped typecheck/targeted lint/composition build/whitespace PASS. Native
C#/JS Official STOP and subsequent public Run use actual Windows Jobs, compiled
Registry trust and runtimes, with VERIFIED final cleanup and zero Registry ledger.
Initial fixture/reference/lint failures and review correction remain documented.
No Core/native/SDK/Node policy, public contract, frozen cases/Expected/manifest7/
anchor or historical acceptance evidence change. All12 performance models remain
PENDING_RUNTIME; general Official60s/host/native coverage/release certification
remain UNVERIFIED. **S4 REVIEW COMPLETED — AWAITING USER ACCEPTANCE**, tracking
IN_PROGRESS. **STOP. S5/S6 NOT_STARTED; no Judge/Comparator/Verdict/Submit/storage.**

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

## WA-B1 safe public-sample Submit diagnostic — 2026-10-28

Implemented the user-approved public-only ADR-025 exception: bounded, detached
same-operation evidence for final qualified WrongAnswer travels through existing
SubmissionStatus/IPC/Preload. Main verifies leased sample identity/version/mapping/
args/Expected; hidden/unverifiable/oversized/capture failures use safe fallback.
No UI/WA-B2, grading/comparator/fail-fast/Run/Storage/Restore/Completion change,
diagnostic persistence, network/provider or Git publication.80 new focused tests
PASS;13-file targeted/regression batch550 PASS (includes focused tests, not additive).
Scoped tsc and targeted lint PASS; initial synthetic fixture/root/integrity and
test-only typing/lint failures corrected and retained in the acceptance report.
Native/Electron/build/full-suite/performance/release remain unverified/not run.
E7 and AI-D1/D2/D3 acceptance/status history are unchanged. Await user acceptance.
=======
## C# Project Run M1-01 — Semantic Contracts & Validation (2026-10-07)

- Added side-effect-free, discriminated JavaScript file/C# project target,
  semantic start/session, execution phase, candidate/dependency/resolution and
  safe failure DTOs with exact validators in shared/contracts/run.ts. Validation
  covers lexical Windows paths, suffix/type, bounds, required/extra fields,
  candidate membership/project match and inconsistent dependency/result variants.
- Kept live JavaScript Run API/channels and legacy request/session/event behavior
  intact. New DTOs are additive and intentionally rejected by legacy validators;
  actual C# Run execution, Main authorization and IPC composition remain later work.
  No RunService, native, UI, stdin, dependency or accepted ADR change.
- Verified 178/178 focused/regression tests in six files; final new-contract rerun
  74/74 PASS. Typecheck, final lint, production/native Windows build and diff checks
  PASS. Full automated suite and live C# Windows acceptance were not run or claimed
  for this contracts-only task. No commit/push/merge.
- M1-01 COMPLETE; overall C# Run/M1 IN_PROGRESS. Every later task, including M1-02,
  is NOT_STARTED and requires explicit authorization. M1-04 hard gate is unexecuted.

## C# Project Run M1-02 — Identity & Runtime Foundations (2026-10-07)

- Replaced RunService argv-derived identity with Main-authorized project/kind/
  canonical-path identity. Immutable execution snapshots and SHA-256 fingerprints
  reject target/runtime/execution drift between resolution, preparation and launch.
- Injected fixed trusted strategies at construction; contextual runtime resolution
  receives authorized target and kind. Main still composes JavaScript only.
- Preserved public Run API, saved-file behavior, owner/session checks, re-run,
  project transitions, shutdown and retained ownership on cleanup failure.
- Added identity/runtime tests and re-run/fingerprint lifecycle regressions;
  migrated existing test/smoke constructors. No native, IPC, UI or dependency change.
- Verified: 202 focused tests, full suite 1185 tests / 84 files, typecheck, lint,
  build and diff checks PASS. Three real Electron Windows JS smokes (native,
  lifecycle, project lifecycle) PASS, including released resources/descendants.
- M1-02 COMPLETE; M1 and overall C# Run remain IN_PROGRESS. M1-03 and M1-04
  native/SDK work remain unimplemented. No ADR change, commit, push or merge.

## C# Project Run M1-03 — Windows Native Argument Arrays (2026-10-07)

- Added dedicated private native createRun argv entry while preserving legacy
  Run/Git/LSP signatures. Main sends its immutable prepared array unchanged;
  no public process authority, shell, Output UI or C# strategy is introduced.
- Allows empty arguments and 0–1024 items. Validates fully qualified existing
  executable/cwd, rejects NUL/invalid types, and bounds the quoted command line
  to 32766 UTF-16 units plus NUL before allocating handles. Retains filtered
  Main environment without additions, bounded native environment and NUL stdin.
- Added focused adapter tests and native argv/tree fixtures. Windows smoke
  verifies Unicode/spaces/#/quotes/backslashes, exact count/length boundaries,
  30 invalid-input cases, EOF/environment, 23 round-trips and 15 JS cycles.
  Repeated handle counts stayed 688→688; both multi-argument Stop and root-first
  cleanup released the Job with root/descendant PIDs gone.
- Typecheck/lint/build/diff checks PASS; focused suite 212/212 in eight files and
  full suite 1195/1195 across 85 files PASS.
  First full run timed out one real-Git test under concurrent smoke load; isolated
  32/32 Git rerun and subsequent unchanged full suite passed. Native Run lifecycle,
  project lifecycle, Terminal, Git and existing C# LSP/provider smokes all PASS.
- Manual UI, packaged Win10/Win11 and live UNC-share execution not performed.
  M1-03 COMPLETE; M1/overall C# Run IN_PROGRESS. M1-04 remains NOT_STARTED and
  requires separate authorization. No new dependency, ADR change or Git write.

## C# Project Run M1-04 — Isolated Windows/.NET Evidence (2026-10-07)

- Added `spikes/csharp-project-run/` with a separate native probe, SDK harness,
  Console/build-hold fixtures, reproducible instructions and JSON evidence.
  Production source, Run IPC/UI, SDK resolver, strategy and dependencies unchanged.
- Real Windows 11 x64 build 10.0.26200, SDK 8.0.410/net8.0 and 10.0.112/net10.0:
  32/32 compatibility cases PASS. Verified fixed build/execute flags, no-node-reuse
  workers, evaluation JSON, Unicode paths, streams/exits, actual NuGet restore
  cancellation, build Stop, root/descendant cleanup and isolated stdin/EOF/blocked
  write feasibility. No SDK installed and no global server/process-name kill used.
- Final resources/new surviving .NET processes: 0/0. Every native session released
  all handles and settled writes. Eight measured cycles per SDK had flat handle
  counts (700 for SDK 8, 696 for SDK 10); unrelated control owner survived.
- Production build, typecheck, lint, diff checks, full suite 1195 tests/85 files,
  and native JS Run/lifecycle/project, Git, C# LSP/provider and Terminal regression
  smokes PASS. Harness setup/observation corrections are disclosed in REPORT.md.
- At the time of this evidence run, M1-04 was BLOCKED: §13.7 required Windows 10/11 evidence,
  but only Windows 11 was available. Manual UI/packaged acceptance not claimed.
  No observed host incompatibility requires ADR-024 reopening. M1-05 and later
  production work remain NOT_STARTED; overall C# Run remains IN_PROGRESS.
  No repository commit, push or merge.

## C# Project Run platform scope revision — 2026-10-07

- Revised C# Project Run's verified acceptance platform to Windows 11 x64 through
  an explicit ADR-024 amendment; removed Windows 10 evidence from M1-04's scope.
  Windows 10 is outside the verified baseline; compatibility is not claimed.
  This is a scope decision, not a compatibility failure; other IDE obligations remain.
- Existing Windows 11 32/32 evidence now satisfies M1-04: COMPLETE. Raw evidence
  and technical findings are unchanged; historical BLOCKED metadata is preserved.
- No production code changed or spike rerun. Overall C# Run/M1 remain IN_PROGRESS;
  M1-05 prerequisites are satisfied, but M1-05 remains NOT_STARTED.

## C# Project Run M1-05 — Run SDK resolution and evaluation (2026-10-07)

Completion revalidated on 2026-10-08 without source changes: full suite 1255/1255
(86 files), typecheck/lint/build/diff checks and real Windows production smoke
20/20 PASS. All 77 native sessions released; resources and new surviving .NET
processes 0; eight handle counts 677. Source hashes match the original evidence.
See `spikes/csharp-project-run/M1-05-REPORT.md` for the new captured evidence and
the distinction between rerun checks and prior native regression evidence.
M1-05 remains COMPLETE; M1-06 NOT_STARTED. No commit/push.

- Added production Main-only Run SDK resolver, single-project structured MSBuild
  evaluation and bounded Run-owned probe. Candidate cwd/global.json controls CLI
  SDK selection; stable Run SDK >=8 remains independent of language SDK >=10.
  Added bounded global.json syntax/field diagnostics for host fallback behavior.
- Reused FileSystemService authorization and existing Run native Job/closed-pipe
  cleanup; no new wire contract, native change, dependency, SDK installation,
  target discovery/classification, CSharpRunStrategy or UI/input implementation.
- 60 new focused tests, 214 focused/regression tests and final full suite
  1255/1255 PASS; typecheck/lint/build/diff checks PASS. Windows 11 real SDK 8/10
  smoke 20/20 PASS, 77 sessions released, 0 retained resources/new surviving
  .NET processes, eight repeated handle counts all 682. Native Run/Git/C# language
  and Terminal regressions PASS. Earlier smoke fixture/configuration findings,
  one concurrent-build test timeout and one transient temp-file deletion error
  are disclosed in `spikes/csharp-project-run/M1-05-REPORT.md`.
- M1-05 COMPLETE; M1-06 READY but NOT_STARTED. M1 and overall C# Run IN_PROGRESS.
  No later task, commit, push or merge. Manual UI/packaged acceptance not claimed.

## C# Project Run M1-06 — Discover and classify Console targets (2026-10-08)

- Implemented Main-only `CsharpRunTargetResolver` with authorized bounded nested
  discovery, stable canonical Windows deduplication, documented directory/link
  exclusions, cancellation/project invalidation and final graph reauthorization.
- Consumes unchanged production M1-05 evaluation; no XML classification. Console
  eligibility excludes Library/Web/test/WPF/Forms/multi/unknown frameworks.
  Recursive references are reauthorized, deduplicated and cycle/bound checked.
- Preserved M1-01 DTOs. 0/1/multiple and partial assessment failures remain
  distinct; no ambiguous target is auto-selected. No CsharpWorkspace selection
  coupling, target persistence, IPC/UI, build/run/input or native changes.
- Verification: 62 new tests; final full suite 1317/1317 in 87 files; typecheck,
  lint, build and diff checks PASS. Real Windows 11 x64 SDK 8/10 smoke 14/14 PASS
  with Web/test/WPF/Forms fixtures evaluated, no SKIP, and unchanged fixture trees.
  116 native sessions released, 0 resources/new surviving .NET processes;
  eight repeated handle counts all 687. No separate native regression rerun claim.
- Evidence and reproduction: `spikes/csharp-project-run/M1-06-REPORT.md` and
  `spikes/csharp-project-run/evidence/m1-06-targets.json`.
- M1-06 COMPLETE; M1-07 READY but NOT_STARTED. M1 and overall C# Run IN_PROGRESS.
  No new architecture decision/deviation, dependency, SDK/workload installation,
  commit, push or merge. Full C# Run and packaged/manual UI acceptance remain later work.

## C# Project Run M1-07 — Main selection and persistence (2026-10-08)

- Added independent `CsharpRunTargetStore.resolve/select/clear/stop`, using the
  existing atomic PersistenceService in a dedicated per-project schema-1 namespace.
  Persists relative paths only; app settings and C# language selection are untouched.
- Fresh M1-06 eligibility and canonical authorization gate saved/explicit choices.
  Stale choices and corrupt/backup recovery require fresh selection without
  choosing another Console implicitly; unreadable/write-failed storage fails closed.
- Per-project serialized operations, supersession/cancellation, project close/
  switch/same-ID reopen invalidation, pre-commit checks and drained stop are tested.
- Final focused suite: 143/143 tests, 5 files PASS, including M1-06/persistence/
  project lifecycle regressions. Typecheck, scoped ESLint and diff checks PASS.
  Real filesystem and production resolver/persistence integration use mocked SDK
  process facts; no new real .NET/native smoke or full-suite/build claim.
- M1-07 COMPLETE; M1-08 READY but NOT_STARTED. M1 and C# Run remain IN_PROGRESS.
  No UI/IPC, execution, new dependency, architecture deviation/ADR, commit/push/merge.
>>>>>>> origin/develop
