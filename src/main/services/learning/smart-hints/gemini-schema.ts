import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import type { SmartCapture } from './capture'
import { hintCodePolicy } from './hint-context'

type Schema = Record<string, unknown>
const text = { type: 'string' }
const literal = (value: string): Schema => ({ type: 'string', enum: [value] })
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties,
  required: Object.keys(properties), additionalProperties: false })
const list = (items: Schema = text, maxItems = 8, minItems = 0): Schema => ({ type: 'array', items, minItems, maxItems })
const describe = (schema: Schema, description: string): Schema => ({ ...schema, description })

/** Wire schema only. Fix uses the Main-private replacement contract;
 * canonical construction and source/structural validation are separate gates. */
export function geminiResponseSchema(capture: SmartCapture): Schema {
  const ids = capture.runContext.kind === 'RUN_PUBLIC' ? capture.runContext.observations.map(o => o.evidenceId) : []
  const evidence = list(ids.length ? { type: 'string', enum: ids } : text, ids.length)
  switch (capture.action.kind) {
    case 'HINT': return object({ kind: literal('HINT'),
      thinking: describe({ type: 'string', minLength: 1, maxLength: 4096 }, 'First: nonempty Vietnamese approach to this public exercise.'),
      steps: describe(list({ type: 'string', minLength: 1, maxLength: 2048 }, 8, 1), 'Second: concrete ordered implementation steps.'),
      code: describe(object({ language: literal(capture.binding.language), text: { type: 'string', minLength: 1, maxLength: 8192 } }),
        'Last: practical code in the exercise language. No Markdown fences or pseudocode. ' + hintCodePolicy(capture.hintImplementation)), evidence })
    case 'ANALYZE': return object({ kind: literal('ANALYSIS'), hypotheses: list(), suggestions: list(), evidence })
    case 'EXPLAIN': return object({ kind: literal('EXPLANATION'), syntax: text, variables: text,
      controlFlow: text, algorithm: text, illustrativeExamples: list() })
    case 'SUGGEST_FIX': return { anyOf: [
      describe(object({ kind: literal('EDIT_PROPOSAL'),
        replacementText: describe({ type: 'string', maxLength: P.editBytes },
          'Exact replacement of action.selection.text only; no code outside that selected region. Preserve sourceEol and whitespace. Empty means deletion. UTF-8 limits are also enforced locally.'),
        rationale: describe({ type: 'string', minLength: 1, maxLength: 2048 },
          'Nonempty Vietnamese explanation of this unverified change, at most 2048 UTF-8 bytes.'),
        evidence: describe(list(ids.length ? { type: 'string', enum: ids } : text, Math.min(8, ids.length)),
          'Only evidence IDs provided in runContext, at most 8; [] when none. No hidden-test references.'),
      }), 'Replace only the frozen selection; do not return edits, positions or old text. Otherwise return NO_FIX.'),
      describe(object({ kind: literal('NO_FIX'), reason: describe({ type: 'string', enum: ['INSUFFICIENT_CONTEXT', 'LOCATION_UNKNOWN', 'NO_FOCUSED_CHANGE'] },
        'INSUFFICIENT_CONTEXT for insufficient evidence; LOCATION_UNKNOWN if the selected target cannot be understood safely; NO_FOCUSED_CHANGE if no safe change fits inside it.'),
        advice: describe({ type: 'string', minLength: 1, maxLength: 4096 },
          'Nonempty Vietnamese advice, at most 4096 UTF-8 bytes. Do not invent a replacement or claim a verified fix.'),
      }), 'No safe focused change within the selection. Return only kind, reason and advice.'),
    ] }
  }
}
