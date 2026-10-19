# beUI Motion Tabs

Stock source from https://beui.dev/r/tabs.json, retrieved 2026-10-19.
Component preview: https://beui.dev/components/motion/tabs.
User-selected visual reference: https://cursor.com/fr/pricing (Individuel / Teams).
Upstream: https://github.com/starc007/ui-components (MIT; see LICENSE).

`tabs.tsx` and its registry-provided `lib/ease.ts` and `lib/utils.ts` retain
upstream behavior, JSX, animations and utility classes. Only the two support
import paths are rewired locally. Existing React, lucide-react, motion, clsx
and tailwind-merge dependencies are reused; no registry installer is needed.

LearningWorkspace uses controlled pill tabs and existing guarded draft saving.
Consumer IDs associate the tabs with retained theory and existing Practice
surfaces. Consumer CSS matches the observed Cursor pricing control: 5% ink track,
2px inset, #f2f1ed selected surface, subtle shadow and fully rounded ends. The
user's compact-layout follow-up uses 13px regular labels, smaller trigger
padding and a content-width section. Selection changes text from 60% ink to
full ink. Labels have no
icons. The duplicate moving overlay label is hidden; vendor source is unchanged.
