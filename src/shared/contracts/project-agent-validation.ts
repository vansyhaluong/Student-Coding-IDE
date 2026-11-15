import { isProjectId } from './project'
import {
  PROJECT_AGENT_LIMITS as LIMITS,
  type AgentApplyRequest,
  type AgentApplyResult,
  type AgentModelAction,
  type AgentModelActionName,
  type ProjectAgentAppliedChange,
  type ProjectAgentCancelRequest,
  type ProjectAgentDiffLine,
  type ProjectAgentHistoryMessage,
  type ProjectAgentProposal,
  type ProjectAgentProposalKind,
  type ProjectAgentSession,
  type ProjectAgentTurnRequest,
  type ProjectAgentTurnResult,
} from './project-agent'
import {
  isPlainObject,
  validateEmptyObject,
  validateExactObject,
  type ValidationIssue,
  type ValidationResult,
} from './validation'

const ACTIONS: readonly AgentModelActionName[] = ['reply', 'read', 'list', 'propose', 'create', 'delete', 'rename']
const PROPOSAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validateProjectAgentSessionRequest(
  value: unknown,
): ValidationResult<Record<string, never>> {
  return validateEmptyObject(value)
}

export function validateProjectAgentTurnRequest(
  value: unknown,
): ValidationResult<ProjectAgentTurnRequest> {
  const object = validateExactObject(value, ['projectId', 'generation', 'message', 'history'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const projectId = projectField(object.value.projectId, issues)
  const generation = generationField(object.value.generation, issues)
  const message = boundedText(object.value.message, '$.message', LIMITS.messageChars, false, issues)
  const history = historyField(object.value.history, issues)
  if (!projectId || generation === null || message === null || !history) {
    return { ok: false, issues }
  }
  return { ok: true, value: { projectId, generation, message, history } }
}

export function validateProjectAgentCancelRequest(
  value: unknown,
): ValidationResult<ProjectAgentCancelRequest> {
  const object = validateExactObject(value, ['projectId', 'generation'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const projectId = projectField(object.value.projectId, issues)
  const generation = generationField(object.value.generation, issues)
  if (!projectId || generation === null) return { ok: false, issues }
  return { ok: true, value: { projectId, generation } }
}

export function validateAgentApplyRequest(
  value: unknown,
): ValidationResult<AgentApplyRequest> {
  const object = validateExactObject(value, ['projectId', 'generation', 'proposalId', 'confirmed'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const projectId = projectField(object.value.projectId, issues)
  const generation = generationField(object.value.generation, issues)
  const proposalId = idField(object.value.proposalId, '$.proposalId', issues)
  if (object.value.confirmed !== true) {
    issues.push({ path: '$.confirmed', message: 'Expected explicit confirmation' })
  }
  if (!projectId || generation === null || !proposalId || object.value.confirmed !== true) {
    return { ok: false, issues }
  }
  return { ok: true, value: { projectId, generation, proposalId, confirmed: true } }
}

export function validateAgentModelAction(
  value: unknown,
): ValidationResult<AgentModelAction> {
  const object = validateExactObject(value, ['action', 'text', 'relativePath', 'destinationPath', 'content', 'summary'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const { action, text, relativePath, destinationPath, content, summary } = object.value
  if (typeof action !== 'string' || !ACTIONS.includes(action as AgentModelActionName)) {
    issues.push({ path: '$.action', message: 'Expected a project agent action' })
  }
  const reply = boundedText(text, '$.text', LIMITS.textChars, true, issues)
  const path = boundedText(relativePath, '$.relativePath', LIMITS.pathChars, true, issues)
  const destination = boundedText(destinationPath, '$.destinationPath', LIMITS.pathChars, true, issues)
  const body = boundedText(content, '$.content', LIMITS.proposeChars, true, issues)
  const note = boundedText(summary, '$.summary', LIMITS.summaryChars, true, issues)
  if (
    typeof action === 'string'
    && ACTIONS.includes(action as AgentModelActionName)
    && reply !== null
    && path !== null
    && destination !== null
    && body !== null
    && note !== null
  ) {
    if (action === 'reply' && reply.trim().length === 0) {
      issues.push({ path: '$.text', message: 'Expected a reply' })
    }
    if ((action === 'read' || action === 'propose' || action === 'create' || action === 'delete' || action === 'rename') && path.trim().length === 0) {
      issues.push({ path: '$.relativePath', message: 'Expected a project-relative path' })
    }
    if (action === 'propose' && (body.length === 0 || note.trim().length === 0)) {
      issues.push({ path: '$.content', message: 'Expected proposed content and a summary' })
    }
    if ((action === 'create' || action === 'delete' || action === 'rename') && note.trim().length === 0) {
      issues.push({ path: '$.summary', message: 'Expected a summary' })
    }
    if (action === 'rename' && destination.trim().length === 0) {
      issues.push({ path: '$.destinationPath', message: 'Expected a destination path' })
    }
    if (action !== 'rename' && destination.length !== 0) {
      issues.push({ path: '$.destinationPath', message: 'Expected an empty destination' })
    }
    if ((action === 'delete' || action === 'rename') && body.length !== 0) {
      issues.push({ path: '$.content', message: 'Expected empty content' })
    }
  }
  if (issues.length > 0 || reply === null || path === null || destination === null || body === null || note === null) {
    return { ok: false, issues }
  }
  return {
    ok: true,
    value: {
      action: action as AgentModelActionName,
      text: reply,
      relativePath: path,
      destinationPath: destination,
      content: body,
      summary: note,
    },
  }
}

export function validateProjectAgentSession(value: unknown): ValidationResult<ProjectAgentSession> {
  const object = validateExactObject(value, ['projectId', 'generation'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const projectId = projectField(object.value.projectId, issues)
  const generation = generationField(object.value.generation, issues)
  if (!projectId || generation === null) return { ok: false, issues }
  return { ok: true, value: { projectId, generation } }
}

export function validateProjectAgentTurnResult(
  value: unknown,
): ValidationResult<ProjectAgentTurnResult> {
  const object = validateExactObject(value, ['turnId', 'projectId', 'generation', 'text', 'proposals', 'applied'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const turnId = idField(object.value.turnId, '$.turnId', issues)
  const projectId = projectField(object.value.projectId, issues)
  const generation = generationField(object.value.generation, issues)
  const text = boundedText(object.value.text, '$.text', LIMITS.textChars, false, issues)
  const proposals = proposalsField(object.value.proposals, issues)
  const applied = appliedField(object.value.applied, issues)
  if (!turnId || !projectId || generation === null || text === null || !proposals || !applied) {
    return { ok: false, issues }
  }
  return { ok: true, value: { turnId, projectId, generation, text, proposals, applied } }
}

export function validateAgentApplyResult(value: unknown): ValidationResult<AgentApplyResult> {
  const object = validateExactObject(value, ['projectId', 'generation', 'relativePath', 'destinationPath'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  const projectId = projectField(object.value.projectId, issues)
  const generation = generationField(object.value.generation, issues)
  const relativePath = boundedText(object.value.relativePath, '$.relativePath', LIMITS.pathChars, false, issues)
  const destinationPath = boundedText(object.value.destinationPath, '$.destinationPath', LIMITS.pathChars, true, issues)
  if (!projectId || generation === null || relativePath === null || destinationPath === null) return { ok: false, issues }
  return { ok: true, value: { projectId, generation, relativePath, destinationPath } }
}

function projectField(value: unknown, issues: ValidationIssue[]) {
  if (!isProjectId(value)) {
    issues.push({ path: '$.projectId', message: 'Expected a project id' })
    return null
  }
  return value
}

function generationField(value: unknown, issues: ValidationIssue[]): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    issues.push({ path: '$.generation', message: 'Expected a project generation' })
    return null
  }
  return value
}

function idField(value: unknown, path: string, issues: ValidationIssue[]): string | null {
  if (typeof value !== 'string' || !PROPOSAL_ID.test(value)) {
    issues.push({ path, message: 'Expected an id' })
    return null
  }
  return value
}

function boundedText(
  value: unknown,
  path: string,
  max: number,
  allowEmpty: boolean,
  issues: ValidationIssue[],
): string | null {
  if (typeof value !== 'string' || value.includes('\0') || value.length > max || (!allowEmpty && value.trim().length === 0)) {
    issues.push({ path, message: 'Expected bounded text' })
    return null
  }
  return value
}

function historyField(
  value: unknown,
  issues: ValidationIssue[],
): ProjectAgentHistoryMessage[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.historyMessages || value.length % 2 !== 0) {
    issues.push({ path: '$.history', message: 'Expected paired chat history' })
    return null
  }
  const history: ProjectAgentHistoryMessage[] = []
  for (let index = 0; index < value.length; index += 1) {
    const item = validateExactObject(value[index], ['role', 'text'])
    const role = item.ok ? item.value.role : undefined
    const expected = index % 2 === 0 ? 'user' : 'assistant'
    if (!item.ok || role !== expected) {
      issues.push({ path: `$.history[${index}]`, message: 'Expected an alternating history message' })
      return null
    }
    const text = boundedText(item.value.text, `$.history[${index}].text`, LIMITS.historyChars, false, issues)
    if (text === null) return null
    history.push({ role: expected, text })
  }
  return history
}

const DIFF_LINE_KEYS = ['id', 'type', 'content', 'oldLine', 'newLine']
const DIFF_ID = /^[A-Za-z0-9_-]{1,32}$/

function appliedField(
  value: unknown,
  issues: ValidationIssue[],
): ProjectAgentAppliedChange[] | undefined {
  if (!Array.isArray(value) || value.length > LIMITS.proposalsPerTurn) {
    issues.push({ path: '$.applied', message: 'Expected applied file changes' })
    return undefined
  }
  const applied: ProjectAgentAppliedChange[] = []
  for (let index = 0; index < value.length; index += 1) {
    const change = appliedChangeField(value[index], issues, `$.applied[${index}]`)
    if (!change) return undefined
    applied.push(change)
  }
  return applied
}

function appliedChangeField(
  value: unknown,
  issues: ValidationIssue[],
  prefix: string,
): ProjectAgentAppliedChange | undefined {
  const object = validateExactObject(value, ['kind', 'relativePath', 'summary', 'updated', 'lines'])
  if (!object.ok) {
    issues.push(...object.issues.map((issue) => ({ ...issue, path: `${prefix}${issue.path.slice(1)}` })))
    return undefined
  }
  const kind = object.value.kind === 'edit' || object.value.kind === 'create' ? object.value.kind : null
  if (!kind) issues.push({ path: `${prefix}.kind`, message: 'Expected an applied edit or create' })
  const relativePath = boundedText(object.value.relativePath, `${prefix}.relativePath`, LIMITS.pathChars, false, issues)
  const summary = boundedText(object.value.summary, `${prefix}.summary`, LIMITS.summaryChars, false, issues)
  const updated = boundedText(object.value.updated, `${prefix}.updated`, LIMITS.proposeChars, true, issues)
  const lines = diffLinesField(object.value.lines, issues, `${prefix}.lines`)
  if (!kind || relativePath === null || summary === null || updated === null || !lines) return undefined
  return { kind, relativePath, summary, updated, lines }
}

function diffLinesField(
  value: unknown,
  issues: ValidationIssue[],
  prefix: string,
): ProjectAgentDiffLine[] | undefined {
  if (!Array.isArray(value) || value.length > LIMITS.diffLines) {
    issues.push({ path: prefix, message: 'Expected a bounded file diff' })
    return undefined
  }
  const lines: ProjectAgentDiffLine[] = []
  for (let index = 0; index < value.length; index += 1) {
    const line = diffLineField(value[index], issues, `${prefix}[${index}]`)
    if (!line) return undefined
    lines.push(line)
  }
  return lines
}

function diffLineField(
  value: unknown,
  issues: ValidationIssue[],
  prefix: string,
): ProjectAgentDiffLine | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path: prefix, message: 'Expected a diff line' })
    return undefined
  }
  const unknown = Object.keys(value).filter((key) => !DIFF_LINE_KEYS.includes(key))
  if (unknown.length > 0) {
    issues.push({ path: `${prefix}.${unknown[0]}`, message: 'Unknown field' })
    return undefined
  }
  const id = typeof value.id === 'string' && DIFF_ID.test(value.id) ? value.id : null
  if (!id) issues.push({ path: `${prefix}.id`, message: 'Expected a diff line id' })
  const type = value.type === 'added' || value.type === 'removed' || value.type === 'context' ? value.type : null
  if (!type) issues.push({ path: `${prefix}.type`, message: 'Expected a diff line type' })
  const content = boundedText(value.content, `${prefix}.content`, LIMITS.proposeChars, true, issues)
  const oldLine = lineNumberField(value.oldLine, `${prefix}.oldLine`, issues)
  const newLine = lineNumberField(value.newLine, `${prefix}.newLine`, issues)
  const numbersReady = type === 'added'
    ? oldLine === undefined && typeof newLine === 'number'
    : type === 'removed'
      ? typeof oldLine === 'number' && newLine === undefined
      : (typeof oldLine === 'number' && typeof newLine === 'number') || (oldLine === undefined && newLine === undefined)
  if (type && !numbersReady) issues.push({ path: prefix, message: 'Expected diff line numbers' })
  if (!id || !type || content === null || oldLine === null || newLine === null || !numbersReady) return undefined
  const line: ProjectAgentDiffLine = { id, type, content }
  if (typeof oldLine === 'number') line.oldLine = oldLine
  if (typeof newLine === 'number') line.newLine = newLine
  return line
}

function lineNumberField(value: unknown, path: string, issues: ValidationIssue[]): number | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    issues.push({ path, message: 'Expected a line number' })
    return null
  }
  return value
}

function proposalsField(
  value: unknown,
  issues: ValidationIssue[],
): ProjectAgentProposal[] | undefined {
  if (!Array.isArray(value) || value.length > LIMITS.proposalsPerTurn) {
    issues.push({ path: '$.proposals', message: 'Expected file proposals' })
    return undefined
  }
  const proposals: ProjectAgentProposal[] = []
  for (let index = 0; index < value.length; index += 1) {
    const proposal = proposalField(value[index], issues, `$.proposals[${index}]`)
    if (!proposal) return undefined
    proposals.push(proposal)
  }
  return proposals
}

function proposalField(
  value: unknown,
  issues: ValidationIssue[],
  prefix: string,
): ProjectAgentProposal | undefined {
  const object = validateExactObject(value, [
    'proposalId', 'projectId', 'generation', 'kind', 'relativePath', 'destinationPath', 'summary', 'original', 'updated',
  ])
  if (!object.ok) {
    issues.push(...object.issues.map((issue) => ({ ...issue, path: `${prefix}${issue.path.slice(1)}` })))
    return undefined
  }
  const proposalId = idField(object.value.proposalId, `${prefix}.proposalId`, issues)
  const projectId = isProjectId(object.value.projectId) ? object.value.projectId : null
  if (!projectId) issues.push({ path: `${prefix}.projectId`, message: 'Expected a project id' })
  const generation = typeof object.value.generation === 'number'
    && Number.isSafeInteger(object.value.generation)
    && object.value.generation >= 1
    ? object.value.generation
    : null
  if (generation === null) issues.push({ path: `${prefix}.generation`, message: 'Expected a project generation' })
  const kind = object.value.kind === 'edit' || object.value.kind === 'create' || object.value.kind === 'delete' || object.value.kind === 'delete-directory' || object.value.kind === 'rename'
    ? object.value.kind as ProjectAgentProposalKind
    : null
  if (!kind) issues.push({ path: `${prefix}.kind`, message: 'Expected a file proposal kind' })
  const relativePath = boundedText(object.value.relativePath, `${prefix}.relativePath`, LIMITS.pathChars, false, issues)
  const destinationPath = boundedText(object.value.destinationPath, `${prefix}.destinationPath`, LIMITS.pathChars, true, issues)
  const summary = boundedText(object.value.summary, `${prefix}.summary`, LIMITS.summaryChars, false, issues)
  const original = boundedText(object.value.original, `${prefix}.original`, LIMITS.proposeChars, true, issues)
  const updated = boundedText(object.value.updated, `${prefix}.updated`, LIMITS.proposeChars, true, issues)
  if (kind === 'create' && original !== '') {
    issues.push({ path: `${prefix}.original`, message: 'A new file has no original content' })
  }
  if (kind === 'rename' && (destinationPath === null || destinationPath.trim().length === 0)) {
    issues.push({ path: `${prefix}.destinationPath`, message: 'Expected a destination path' })
  }
  if (kind !== null && kind !== 'rename' && destinationPath !== null && destinationPath !== '') {
    issues.push({ path: `${prefix}.destinationPath`, message: 'Expected an empty destination' })
  }
  const contentless = kind === 'delete' || kind === 'delete-directory' || kind === 'rename'
  if (contentless && (original !== '' || updated !== '')) {
    issues.push({ path: `${prefix}.original`, message: 'A delete or rename has no file content' })
  }
  const destinationReady = kind !== 'rename' || (destinationPath !== null && destinationPath.trim().length > 0)
  const contentReady = kind !== 'create' || original === ''
  const structuralReady = !contentless || (original === '' && updated === '')
  const destinationEmpty = kind === 'rename' || destinationPath === ''
  if (!proposalId || !projectId || generation === null || !kind || relativePath === null || destinationPath === null || summary === null || original === null || updated === null || !destinationReady || !contentReady || !structuralReady || !destinationEmpty) {
    return undefined
  }
  return { proposalId, projectId, generation, kind, relativePath, destinationPath, summary, original, updated }
}
