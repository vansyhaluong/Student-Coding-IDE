// Main-private shape only: fixed contract field names, presence and type enums.
// Unknown names can themselves contain private data, so expose only a boolean.
const checks = ['HEADERS', 'BODY', 'OUTER_JSON', 'TOP_LEVEL_FIELDS', 'CHOICES', 'MODEL_METADATA',
  'PROVIDER', 'SERVICE_TIER', 'CHOICE_INDEX', 'FINISH_REASON', 'CHOICE_FIELDS', 'CHOICE_METADATA', 'MESSAGE_ROLE', 'MESSAGE_FIELDS', 'MESSAGE_METADATA', 'CONTENT_TYPE', 'RESPONSE_POLICY', 'MODEL_IDENTITY'] as const
export type EnvelopeCheck = typeof checks[number]
const types = ['UNOBSERVED', 'MISSING', 'NULL', 'STRING', 'ARRAY', 'OBJECT', 'NUMBER', 'BOOLEAN', 'OTHER'] as const
type ShapeType = typeof types[number]
const rootNames = ['id', 'object', 'created', 'model', 'provider', 'system_fingerprint', 'service_tier', 'choices', 'usage', 'alignment', 'openrouter_metadata', 'safeguard_results', 'error'] as const
const choiceNames = ['index', 'finish_reason', 'native_finish_reason', 'logprobs', 'message', 'delta', 'error', 'text'] as const
const messageNames = ['role', 'content', 'reasoning', 'reasoning_content', 'reasoning_details', 'tool_calls', 'refusal', 'model', 'name', 'audio', 'images', 'annotations'] as const
const paths = ['response', ...rootNames.map(k => `response.${k}`), ...choiceNames.map(k => `choices[0].${k}`),
  ...messageNames.map(k => `message.${k}`)]
export interface EnvelopeDiagnostics {
  check: EnvelopeCheck
  fields: { field: string; presence: 'PRESENT' | 'MISSING'; type: ShapeType }[]
  otherFields: { response: boolean; choice: boolean; message: boolean }
}
const object = (v: unknown): v is object => v !== null && typeof v === 'object' && !Array.isArray(v)
function own(v: unknown, key: string): { present: boolean; value: unknown } {
  if (!object(v) && !Array.isArray(v)) return { present: false, value: undefined }
  const d = Object.getOwnPropertyDescriptor(v, key)
  return d && Object.hasOwn(d, 'value') ? { present: true, value: d.value } : { present: !!d, value: undefined }
}
function shape(v: unknown, present: boolean): ShapeType {
  if (!present) return 'MISSING'
  if (v === null) return 'NULL'
  if (Array.isArray(v)) return 'ARRAY'
  const type = typeof v
  return type === 'string' ? 'STRING' : type === 'object' ? 'OBJECT' : type === 'number' ? 'NUMBER' : type === 'boolean' ? 'BOOLEAN' : 'OTHER'
}
export function envelopeDiagnostics(check: EnvelopeCheck, value?: unknown): EnvelopeDiagnostics {
  const result: EnvelopeDiagnostics = { check, fields: [], otherFields: { response: false, choice: false, message: false } }
  if (value === undefined) return result // Body/envelope has not been parsed; do not invent missing fields.
  const choices = own(value, 'choices').value
  const choice = Array.isArray(choices) ? own(choices, '0').value : undefined
  const message = own(choice, 'message').value
  result.fields.push({ field: 'response', presence: 'PRESENT', type: shape(value, true) })
  const groups = [{ prefix: 'response.', value, names: rootNames, key: 'response' as const },
    { prefix: 'choices[0].', value: choice, names: choiceNames, key: 'choice' as const },
    { prefix: 'message.', value: message, names: messageNames, key: 'message' as const }]
  for (const group of groups) {
    for (const name of group.names) {
      const property = own(group.value, name)
      result.fields.push({ field: group.prefix + name, presence: property.present ? 'PRESENT' : 'MISSING', type: shape(property.value, property.present) })
    }
    if (object(group.value)) result.otherFields[group.key] = Reflect.ownKeys(group.value).some(k => typeof k !== 'string' || !(group.names as readonly string[]).includes(k))
  }
  return result
}

/** Reconstruct the shape projection at the sink; never forward an arbitrary object. */
export function projectEnvelopeDiagnostics(value: unknown): EnvelopeDiagnostics | undefined {
  const check = own(value, 'check').value, fields = own(value, 'fields').value, others = own(value, 'otherFields').value
  if (!(checks as readonly unknown[]).includes(check) || !Array.isArray(fields) || fields.length > paths.length) return undefined
  const output: EnvelopeDiagnostics = { check: check as EnvelopeCheck, fields: [], otherFields: {
    response: own(others, 'response').value === true, choice: own(others, 'choice').value === true, message: own(others, 'message').value === true } }
  for (let i = 0; i < fields.length; i++) {
    const row = own(fields, String(i)).value, field = own(row, 'field').value, type = own(row, 'type').value, presence = own(row, 'presence').value
    if (typeof field === 'string' && paths.includes(field) && (types as readonly unknown[]).includes(type) && ['PRESENT', 'MISSING'].includes(presence as string)
      && !output.fields.some(r => r.field === field)) output.fields.push({ field, type: type as ShapeType, presence: presence as 'PRESENT' | 'MISSING' })
  }
  return output
}
