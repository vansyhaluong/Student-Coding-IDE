/* global process */
import { existsSync } from 'node:fs'
import { delimiter, join, win32 } from 'node:path'

/** Keep the normal machine environment unless the complete compatibility-spike
 * SDK/provider pair is available. The pair is the Phase 5.5B validated stack. */
export function developmentEnvironment(root, environment = process.env, options = {}) {
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? existsSync
  const result = { ...environment }
  if (platform !== 'win32') return result

  const joinPath = platform === 'win32' ? win32.join : join
  const sdk = joinPath(root, 'spikes', 'csharp-lsp-compatibility', '.dotnet')
  const tools = joinPath(root, 'spikes', 'csharp-lsp-compatibility', '.tools')
  if (!exists(joinPath(sdk, 'dotnet.exe')) || !exists(joinPath(tools, 'csharp-ls.exe'))) return result

  const inheritedPath = environmentEntry(environment, 'PATH') ?? ''
  removeEnvironmentEntry(result, 'PATH')
  removeEnvironmentEntry(result, 'DOTNET_ROOT')
  result.DOTNET_ROOT = sdk
  const pathDelimiter = platform === 'win32' ? win32.delimiter : delimiter
  result.PATH = [sdk, tools, inheritedPath].filter(Boolean).join(pathDelimiter)
  return result
}

function environmentEntry(environment, name) {
  return Object.entries(environment).find(([key]) => key.toUpperCase() === name)?.[1]
}

function removeEnvironmentEntry(environment, name) {
  for (const key of Object.keys(environment)) if (key.toUpperCase() === name) delete environment[key]
}
