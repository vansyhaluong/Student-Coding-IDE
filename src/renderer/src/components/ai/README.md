# Stock beUI components

Hint code toolbar (2026-11-08) composes the existing `support/button/base.tsx`
ghost/icon and ghost/sm Button variants with lucide Copy/Check/Apply icons.
No registry install, upstream source edit, Shiki or new dependency is needed.
AssistantCodeBlock keeps Monaco tokenization and uses existing Chat theme tokens.

Adapted from the current beUI registry on 2026-09-25:

- https://beui.dev/r/message.json
- https://beui.dev/r/message-bubble.json
- https://beui.dev/r/message-scroller.json
- https://beui.dev/r/prompt-input.json
- https://beui.dev/r/streaming-response.json

Upstream: https://github.com/starc007/ui-components (MIT; see LICENSE).

The five components initially retained their stock JSX, utility classes, default sizing,
surfaces, animation and behavior. Only import paths are rewired into this local
directory. Required upstream support modules live in support/ and lib/; the
Button import targets its stock base directly, excluding unrelated variants.
MIT copyright and permission are retained in LICENSE.

AiChatPanel composes the public APIs: soft user bubbles, ghost assistant bubbles,
completed responses with actions hidden, no prompt model/actions, one to five
input rows. No real streaming or backend is used. The surrounding transcript
background uses the IDE sidebar background. At the user's request, PromptInput
uses its className API to set a gray sidebar-accent background; all other stock
component styling remains unchanged.
Tailwind semantic color utilities map to existing light/dark IDE tokens.
The standard scrollbar-hide utility required by PromptInput is registered in
styles.css; it does not change the component source or its intended appearance.

Agent Activity (2026-11-15) is adapted from https://beui.dev/r/agent-activity
for Project chat replies. English labels are inlined. Search rows do not open
links. The working shimmer is the bundled text-shimmer style, without the
locale provider. No new package was added.

File Diff (2026-11-15) is adapted from https://beui.dev/r/file-diff for Project
chat. It reuses the local AgentDisclosure, ease springs, and cn helper. Line
text stays plain because the upstream code view depends on Shiki, which this
project does not install. English labels are inlined. No preview, registry
installer, or new package was added.

Dependencies: clsx, motion, tailwind-merge (plus existing React/lucide-react).
No components.json, full shadcn app, demo code or registry installer was added.

AI-C4-E (2026-11-06/07): LearningAssistantPanel also composes Message, MessageBubble,
MessageScroller and PromptInput over its existing typed Chat/Smart Hints hooks.
The live official registry was checked for these four APIs/dependencies; installed
React 19, Tailwind 4, Motion, clsx/lucide/tailwind-merge suffice. The MIT license
above is retained. No Pro assets or new package is used. Code Block adds Shiki,
so Learning keeps its existing escaped-text Monaco C#/JavaScript tokenization.
PromptInput has small optional header/formProps/submitLabel/stopLabel composition
slots for Quick Actions, consent visibility and localized accessible names.
Defaults preserve the existing Local AI consumer. No agent/streaming workflow is
used by Learning. Markdown there uses installed react-markdown/remark-gfm with
raw HTML, remote images and URL navigation disabled.
