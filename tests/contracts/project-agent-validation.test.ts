import { describe, expect, it } from 'vitest'
import type { ProjectId } from '../../src/shared/contracts'
import {
  validateAgentApplyRequest,
  validateAgentModelAction,
  validateProjectAgentTurnRequest,
  validateProjectAgentTurnResult,
} from '../../src/shared/contracts/project-agent-validation'

const projectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const proposalId = '00000000-0000-4000-8000-000000000001'

describe('project agent contracts', () => {
  it('requires explicit confirmation before apply', () => {
    expect(validateAgentApplyRequest({
      projectId, generation: 1, proposalId, confirmed: true,
    }).ok).toBe(true)
    expect(validateAgentApplyRequest({
      projectId, generation: 1, proposalId, confirmed: false,
    }).ok).toBe(false)
    expect(validateAgentApplyRequest({
      projectId, generation: 1, proposalId, confirmed: true, command: 'npm test',
    }).ok).toBe(false)
  })

  it('rejects a stale generation and an absolute read requested by the model shape', () => {
    expect(validateProjectAgentTurnRequest({
      projectId, generation: 0, message: 'Read src/main.ts', history: [],
    }).ok).toBe(false)
    expect(validateAgentModelAction({
      action: 'read', text: '', relativePath: 'C:/secret', destinationPath: '', content: '', summary: '',
    }).ok).toBe(true)
    expect(validateAgentModelAction({
      action: 'run', text: '', relativePath: 'src/main.ts', destinationPath: '', content: '', summary: '',
    }).ok).toBe(false)
    expect(validateAgentModelAction({
      action: 'create', text: '', relativePath: 'src/auth.ts', destinationPath: '', content: 'export {}\n', summary: 'Add auth.',
    }).ok).toBe(true)
    expect(validateAgentModelAction({
      action: 'delete', text: '', relativePath: 'src/old.ts', destinationPath: '', content: '', summary: 'Remove the old file.',
    }).ok).toBe(true)
    expect(validateAgentModelAction({
      action: 'rename', text: '', relativePath: 'src/main.ts', destinationPath: '', content: '', summary: 'Rename it.',
    }).ok).toBe(false)
    expect(validateAgentModelAction({
      action: 'delete', text: '', relativePath: 'src/old.ts', destinationPath: 'src/other.ts', content: '', summary: 'Remove it.',
    }).ok).toBe(false)
    expect(validateAgentModelAction({
      action: 'rename', text: '', relativePath: 'src/main.ts', destinationPath: 'lib/app.ts', content: '', summary: 'Move main.',
    }).ok).toBe(true)
    expect(validateProjectAgentTurnResult({
      turnId: proposalId,
      projectId,
      generation: 1,
      text: 'Ready.',
      proposals: [{
        proposalId,
        projectId,
        generation: 1,
        kind: 'delete-directory',
        relativePath: 'notes',
        destinationPath: '',
        summary: 'Remove the empty folder.',
        original: '',
        updated: '',
      }],
      applied: [],
    }).ok).toBe(true)
    expect(validateProjectAgentTurnResult({
      turnId: proposalId,
      projectId,
      generation: 1,
      text: 'Ready.',
      proposals: [],
      applied: [{
        kind: 'edit',
        relativePath: 'src/main.ts',
        summary: 'Update the value.',
        updated: 'const value = 2\n',
        lines: [
          { id: 'l0', type: 'removed', content: 'const value = 1', oldLine: 1 },
          { id: 'l1', type: 'added', content: 'const value = 2', newLine: 1 },
        ],
      }],
    }).ok).toBe(true)
    expect(validateProjectAgentTurnResult({
      turnId: proposalId,
      projectId,
      generation: 1,
      text: 'Ready.',
      proposals: [],
      applied: [{
        kind: 'edit',
        relativePath: 'src/main.ts',
        summary: 'Update the value.',
        updated: 'const value = 2\n',
        lines: [{ id: 'l0', type: 'added', content: 'const value = 2', oldLine: 1, newLine: 1 }],
      }],
    }).ok).toBe(false)
    expect(validateProjectAgentTurnResult({
      turnId: proposalId,
      projectId,
      generation: 1,
      text: 'Ready.',
      proposals: [{
        proposalId,
        projectId,
        generation: 1,
        kind: 'delete-directory',
        relativePath: 'notes',
        destinationPath: '',
        summary: 'Remove the empty folder.',
        original: '',
        updated: 'nope',
      }],
      applied: [],
    }).ok).toBe(false)
    expect(validateProjectAgentTurnResult({
      turnId: proposalId,
      projectId,
      generation: 1,
      text: 'Ready.',
      proposals: [{
        proposalId,
        projectId,
        generation: 1,
        kind: 'create',
        relativePath: 'src/auth.ts',
        destinationPath: '',
        summary: 'Add auth.',
        original: 'secret',
        updated: 'export {}\n',
      }],
      applied: [],
    }).ok).toBe(false)
  })
})
