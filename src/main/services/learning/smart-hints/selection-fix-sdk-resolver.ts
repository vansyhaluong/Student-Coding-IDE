import { win32 as path } from 'node:path'
import { FilesystemCsharpSdkResolver, csharpSdkDiskAccess, type CsharpSdkResolverOptions } from '../runtime/csharp-sdk-resolver'
import type { CsharpPreparationContext, CsharpSdkResolution, CsharpSdkResolver } from '../runtime/csharp-execution-contracts'
import { FIX_PARSER_SDK, FIX_PARSER_RUNTIME } from './selection-fix-protocol'

/** Main-private G0 policy. Discover the same roots, but never select an unapproved
 * candidate merely because its SDK/runtime/pack version is newer. Installation,
 * PE/assembly closure, containment and cancellation checks stay in Learning's
 * existing validator. Its default selection and every other caller are unchanged.
 */
export class SelectionFixCsharpSdkResolver implements CsharpSdkResolver {
  constructor(private readonly options: CsharpSdkResolverOptions = {}) {}

  resolve(context: CsharpPreparationContext): Promise<CsharpSdkResolution> {
    const files = this.options.files ?? csharpSdkDiskAccess
    return new FilesystemCsharpSdkResolver({ ...this.options, files: { ...files,
      readdir: async directory => {
        const entries = await files.readdir(directory)
        const name = path.basename(directory).toLowerCase(), parent = path.basename(path.dirname(directory)).toLowerCase()
        const selected = name === 'sdk' ? FIX_PARSER_SDK
          : name === 'microsoft.netcore.app' && parent === 'shared'
            || name === 'microsoft.netcore.app.ref' && parent === 'packs'
            || name === 'fxr' && parent === 'host' ? FIX_PARSER_RUNTIME : undefined
        return selected === undefined ? entries : entries.filter(entry => entry === selected)
      },
    } }).resolve(context)
  }
}
