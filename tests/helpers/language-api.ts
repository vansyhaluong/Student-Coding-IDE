import { createLanguageBridge } from '../../src/preload/bridge/language'
/** Non-C# renderer fixtures deliberately have no language service. */
export const unavailableLanguageApi = createLanguageBridge({
  invoke: async () => ({ ok: false, error: { code: 'DEPENDENCY_MISSING', message: 'Language service unavailable.', retryable: false } }),
  on: () => {}, removeListener: () => {},
})
