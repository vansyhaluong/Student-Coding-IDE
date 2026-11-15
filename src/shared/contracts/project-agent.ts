import type { AppResult } from './app-error'
import type { ProjectId } from './project'

/** Project Agent bounds. These are not an AG-01 production approval. */
export const PROJECT_AGENT_LIMITS = Object.freeze({
  messageChars: 4_000,
  historyMessages: 8,
  historyChars: 2_000,
  textChars: 4_000,
  pathChars: 512,
  summaryChars: 500,
  readBytes: 256 * 1024,
  modelReadChars: 24_000,
  proposeChars: 24_000,
  listEntries: 200,
  proposalsPerTurn: 4,
  /** Lines returned for one File Diff, including a truncation row. */
  diffLines: 400,
  toolSteps: 6,
  turnTimeoutMs: 120_000,
  maxOutputTokens: 8192,
  wireBytes: 200_000,
})

export const PROJECT_AGENT_CHANNELS = {
  session: 'project-agent:session',
  turn: 'project-agent:turn',
  cancel: 'project-agent:cancel',
  apply: 'project-agent:apply',
} as const

export type ProjectAgentHistoryRole = 'user' | 'assistant'

export interface ProjectAgentHistoryMessage {
  role: ProjectAgentHistoryRole
  text: string
}

/** Main-owned read. The renderer does not call this directly. */
export interface AgentReadRequest {
  relativePath: string
}

export interface AgentReadResult {
  relativePath: string
  content: string
}

/** Main-owned directory list. The renderer does not call this directly. */
export interface AgentListRequest {
  relativePath: string
}

export interface AgentListEntry {
  name: string
  relativePath: string
  kind: 'file' | 'directory'
}

export interface AgentListResult {
  relativePath: string
  entries: AgentListEntry[]
  truncated: boolean
}

/**
 * Main-owned proposal for delete or rename.
 * Edit and create are written during the turn and are not stored here.
 */
export interface AgentProposeRequest {
  relativePath: string
  content: string
  summary: string
}

export type ProjectAgentProposalKind = 'edit' | 'create' | 'delete' | 'delete-directory' | 'rename'

export interface ProjectAgentProposal {
  proposalId: string
  projectId: ProjectId
  generation: number
  kind: ProjectAgentProposalKind
  relativePath: string
  /** Set for rename/move. Empty for edit, create, delete, and delete-directory. */
  destinationPath: string
  summary: string
  original: string
  updated: string
}

export interface AgentProposeResult {
  proposal: ProjectAgentProposal
}

export type ProjectAgentDiffLineType = 'added' | 'removed' | 'context'

/** One row of a File Diff. Main computes it. The renderer does not read the file. */
export interface ProjectAgentDiffLine {
  id: string
  type: ProjectAgentDiffLineType
  content: string
  oldLine?: number
  newLine?: number
}

/** An edit or create already written during the turn. */
export interface ProjectAgentAppliedChange {
  kind: 'edit' | 'create'
  relativePath: string
  summary: string
  /** Full file text after the write. The chat renders `lines`, not this text. */
  updated: string
  lines: ProjectAgentDiffLine[]
}

/** Confirmed write for delete, delete-directory, and rename. */
export interface AgentApplyRequest {
  projectId: ProjectId
  generation: number
  proposalId: string
  confirmed: true
}

export interface AgentApplyResult {
  projectId: ProjectId
  generation: number
  relativePath: string
  /** Destination after a rename/move. Empty for edit, create, and delete. */
  destinationPath: string
}

export interface ProjectAgentSession {
  projectId: ProjectId
  generation: number
}

export interface ProjectAgentTurnRequest {
  projectId: ProjectId
  generation: number
  message: string
  history: ProjectAgentHistoryMessage[]
}

export interface ProjectAgentTurnResult {
  turnId: string
  projectId: ProjectId
  generation: number
  text: string
  /** Delete and rename still wait for confirmation. Edit and create are not listed here. */
  proposals: ProjectAgentProposal[]
  /** Edit and create written during this turn, with a line diff. */
  applied: ProjectAgentAppliedChange[]
}

export interface ProjectAgentCancelRequest {
  projectId: ProjectId
  generation: number
}

export type AgentModelActionName = 'reply' | 'read' | 'list' | 'propose' | 'create' | 'delete' | 'rename'

/** One JSON decision from the model. File work stays in Main. */
export interface AgentModelAction {
  action: AgentModelActionName
  text: string
  relativePath: string
  /** Set for rename/move. Empty for every other action. */
  destinationPath: string
  content: string
  summary: string
}

export interface ProjectAgentApi {
  session(): Promise<AppResult<ProjectAgentSession>>
  turn(request: ProjectAgentTurnRequest): Promise<AppResult<ProjectAgentTurnResult>>
  cancel(request: ProjectAgentCancelRequest): Promise<AppResult<null>>
  apply(request: AgentApplyRequest): Promise<AppResult<AgentApplyResult>>
}
