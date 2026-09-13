import { LANGUAGE_LIMITS, type LanguageDiagnostic } from '../../../shared/contracts/language'
import { LanguageError } from './language-error'
import { safeRange } from './csharp-semantic-mapping'

const severities: Readonly<Record<number, LanguageDiagnostic['severity']>> = {
  1: 'error', 2: 'warning', 3: 'information', 4: 'hint',
}
// Withhold a path-bearing message as a whole, including paths containing spaces.
const privateLocation = /(?:[a-z]:[\\/]|\\\\|[a-z][a-z0-9+.-]*:\/\/|(?:^|[\s'"(])\/[\w.])/i
const safeLabel = (value: unknown): string | null => typeof value === 'string'
  && value.length <= 128 && /^[a-z0-9_. -]+$/i.test(value) ? value : null

export function normalizeCsharpDiagnostics(input: unknown): readonly LanguageDiagnostic[] {
  if (!Array.isArray(input) || input.length > LANGUAGE_LIMITS.maximumDiagnostics) throw new LanguageError('invalid-response')
  return input.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new LanguageError('invalid-response')
    const raw = item as Record<string, unknown>, range = safeRange(raw.range)
    const severity = raw.severity === undefined ? 'error' : typeof raw.severity === 'number' ? severities[raw.severity] : undefined
    if (!range || !severity || typeof raw.message !== 'string' || raw.message.length > LANGUAGE_LIMITS.maximumTextLength) {
      throw new LanguageError('invalid-response')
    }
    return {
      range, severity,
      code: typeof raw.code === 'number' && Number.isSafeInteger(raw.code) ? raw.code : safeLabel(raw.code),
      source: safeLabel(raw.source),
      message: privateLocation.test(raw.message) ? 'C# diagnostic details contain a private path.'
        : [...raw.message].filter(character => character.charCodeAt(0) >= 32 || '\t\n\r'.includes(character)).join(''),
    }
  })
}
