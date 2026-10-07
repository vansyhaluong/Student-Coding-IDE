import { afterEach, describe, expect, it, vi } from 'vitest'
import { WindowsPipedProcessAdapter } from '../../src/main/services/run/windows-piped-process-adapter'
import type { PreparedRun } from '../../src/main/services/run/run-strategy'

const binding = vi.hoisted(() => ({ capability: 'student-ide-piped-job-v1',
  createRun: vi.fn(() => ({})), control: vi.fn(() => 123) }))
vi.mock('node:module', () => ({ createRequire: () => () => binding }))

describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('Main-only Windows Run argv policy', () => {
  afterEach(() => vi.clearAllMocks())
  const run: PreparedRun = { executable: 'C:\\node\\node.exe', cwd: 'C:\\project',
    args: ['C:\\project\\index.js'], environmentAdditions: {}, shell: false }

  it.each([{ args: run.args }, { args: [] }, { args: ['one', '', 'C:\\space # Việt 😀\\', 'a"b', '\\\\'] }])(
    'passes the exact ordered array without constructing shell text: %j', ({ args }) => {
      const adapter = new WindowsPipedProcessAdapter('binding', {})
      adapter.create({ ...run, args }, vi.fn())
      expect(binding.createRun).toHaveBeenCalledWith(run.executable, args, run.cwd, [], expect.any(Function))
      expect(binding.createRun.mock.calls).toHaveLength(1)
    })

  it('uses only filtered Main environment and preserves ordinary inherited values', () => {
    const adapter = new WindowsPipedProcessAdapter('binding', { Path: 'C:\\node', GOOD: 'Việt #',
      node_options: 'unsafe', NODE_PATH: 'unsafe', Electron_Run_As_Node: '1',
      'BAD=KEY': 'bad', 'BAD\0KEY': 'bad', BAD_VALUE: 'bad\0value', ABSENT: undefined })
    adapter.create(run, vi.fn())
    expect(binding.createRun).toHaveBeenCalledWith(run.executable, run.args, run.cwd,
      ['GOOD=Việt #', 'Path=C:\\node'], expect.any(Function))
  })

  it.each([{ shell: true }, { args: 'command string' }, { args: Array(1025).fill('') },
    { environmentAdditions: { PATH: 'untrusted' } }, { environmentAdditions: null }])(
    'rejects unsupported preparation before native dispatch: %j', (change) => {
      const adapter = new WindowsPipedProcessAdapter('binding', {})
      expect(() => adapter.create({ ...run, ...change } as PreparedRun, vi.fn())).toThrow()
      expect(binding.createRun).not.toHaveBeenCalled()
    })

  it('fails closed when an old native artifact lacks the array entry', () => {
    const create = binding.createRun
    try {
      Object.assign(binding, { createRun: undefined })
      expect(() => new WindowsPipedProcessAdapter('binding', {})).toThrow('capability mismatch')
    } finally { binding.createRun = create }
  })
})
