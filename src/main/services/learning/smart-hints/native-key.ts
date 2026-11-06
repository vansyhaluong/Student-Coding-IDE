import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DomainError } from '../../../errors/app-error'

interface KeyBinding { prompt(owner: Buffer): Promise<string | null>; cancel(): void }
/** Only called by Main's validated settings route; no secret-bearing IPC. */
export class NativeSmartHintsKeyEntry {
  private binding?: KeyBinding
  async prompt(owner: Buffer, signal: AbortSignal): Promise<string | null> {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new DomainError({ code: 'UNSUPPORTED',
      operation: 'settings:smart-hints:key', message: 'Secure API key input requires Windows x64.', retryable: false })
    try {
      this.binding ??= createRequire(__filename)(join(__dirname, 'native/smart-hints-key.node')) as KeyBinding
      if (signal.aborted) return null
      const cancel = () => this.binding?.cancel()
      signal.addEventListener('abort', cancel, { once: true })
      try { return await this.binding.prompt(owner) } finally { signal.removeEventListener('abort', cancel) }
    } catch { throw new DomainError({ code: 'PROCESS_FAILED', operation: 'settings:smart-hints:key',
      message: 'Secure key input could not open. Check the native application build.', retryable: true }) }
  }
  cancel(): void { this.binding?.cancel() }
}
