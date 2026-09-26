# Stock beUI components

Adapted from the current beUI registry on 2026-09-25:

- https://beui.dev/r/message.json
- https://beui.dev/r/message-bubble.json
- https://beui.dev/r/message-scroller.json
- https://beui.dev/r/prompt-input.json
- https://beui.dev/r/streaming-response.json

Upstream: https://github.com/starc007/ui-components (MIT; see LICENSE).

The five components retain their stock JSX, utility classes, default sizing,
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

Dependencies: clsx, motion, tailwind-merge (plus existing React/lucide-react).
No components.json, full shadcn app, demo code or registry installer was added.
