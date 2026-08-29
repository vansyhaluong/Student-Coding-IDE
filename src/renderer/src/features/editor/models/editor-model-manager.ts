import type { editor } from 'monaco-editor'

import type { ProjectId } from '../../../../../shared/contracts'

export interface Disposable {
  dispose(): void
}

export interface EditorTextModel {
  getValue(): string
  setValue(value: string): void
  getVersionId(): number
  onDidChangeContent(listener: () => void): Disposable
  dispose(): void
}

export interface MonacoModelHost {
  createModel(value: string, languageId: string, uri: string): EditorTextModel
}

export interface EditorDocument {
  readonly key: string
  readonly projectId: ProjectId
  readonly relativePath: string
  readonly languageId: string
  readonly model: EditorTextModel
  readonly dirty: boolean
  readonly externalConflict: boolean
}

interface ManagedDocument {
  key: string
  projectId: ProjectId
  relativePath: string
  languageId: string
  model: EditorTextModel
  savedContent: string
  dirty: boolean
  externalConflict: boolean
  viewState: editor.ICodeEditorViewState | null
  changeSubscription: Disposable
}

export interface SaveSnapshot {
  key: string
  projectId: ProjectId
  relativePath: string
  content: string
  modelVersion: number
}

export class EditorModelManager {
  private readonly documents = new Map<string, ManagedDocument>()
  private readonly tabOrder: string[] = []
  private readonly listeners = new Set<() => void>()
  private activeKey: string | null = null

  constructor(private readonly modelHost: MonacoModelHost) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getOpenDocuments(): readonly EditorDocument[] {
    return this.tabOrder
      .map((key) => this.documents.get(key))
      .filter((document): document is ManagedDocument => Boolean(document))
  }

  getActiveDocument(): EditorDocument | null {
    return this.activeKey ? this.documents.get(this.activeKey) ?? null : null
  }

  findDocument(projectId: ProjectId, relativePath: string): EditorDocument | null {
    return this.documents.get(documentKey(projectId, relativePath)) ?? null
  }

  openDocument(
    projectId: ProjectId,
    relativePath: string,
    content: string,
    activate = true,
  ): EditorDocument {
    const normalizedPath = normalizeRelativePath(relativePath)
    const key = documentKey(projectId, normalizedPath)
    const existing = this.documents.get(key)
    if (existing) {
      if (activate) this.activeKey = key
      this.emit()
      return existing
    }

    const languageId = languageIdForPath(normalizedPath)
    const model = this.modelHost.createModel(
      content,
      languageId,
      documentUri(projectId, normalizedPath),
    )
    const document: ManagedDocument = {
      key,
      projectId,
      relativePath: normalizedPath,
      languageId,
      model,
      savedContent: content,
      dirty: false,
      externalConflict: false,
      viewState: null,
      changeSubscription: { dispose: () => undefined },
    }
    document.changeSubscription = model.onDidChangeContent(() => {
      const dirty = model.getValue() !== document.savedContent
      if (dirty !== document.dirty) {
        document.dirty = dirty
      }
      this.emit()
    })
    this.documents.set(key, document)
    this.tabOrder.push(key)
    if (activate) this.activeKey = key
    this.emit()
    return document
  }

  activate(key: string): boolean {
    if (!this.documents.has(key)) return false
    this.activeKey = key
    this.emit()
    return true
  }

  createSaveSnapshot(key: string): SaveSnapshot | null {
    const document = this.documents.get(key)
    if (!document) return null
    return {
      key,
      projectId: document.projectId,
      relativePath: document.relativePath,
      content: document.model.getValue(),
      modelVersion: document.model.getVersionId(),
    }
  }

  acceptSave(snapshot: SaveSnapshot): boolean {
    const document = this.documents.get(snapshot.key)
    if (!document) return false
    document.savedContent = snapshot.content
    document.dirty = document.model.getValue() !== document.savedContent
    document.externalConflict = false
    this.emit()
    return document.model.getVersionId() === snapshot.modelVersion
      && !document.dirty
  }

  close(key: string): boolean {
    const document = this.documents.get(key)
    if (!document) return false
    const index = this.tabOrder.indexOf(key)
    document.changeSubscription.dispose()
    document.model.dispose()
    this.documents.delete(key)
    if (index >= 0) this.tabOrder.splice(index, 1)
    if (this.activeKey === key) {
      this.activeKey = this.tabOrder[index] ?? this.tabOrder[index - 1] ?? null
    }
    this.emit()
    return true
  }

  closeProject(projectId: ProjectId): void {
    for (const document of [...this.documents.values()]) {
      if (document.projectId === projectId) this.close(document.key)
    }
  }

  dispose(): void {
    for (const document of [...this.documents.values()]) this.close(document.key)
    this.listeners.clear()
  }

  setViewState(
    key: string,
    viewState: editor.ICodeEditorViewState | null,
  ): void {
    const document = this.documents.get(key)
    if (document) document.viewState = viewState
  }

  getViewState(key: string): editor.ICodeEditorViewState | null {
    return this.documents.get(key)?.viewState ?? null
  }

  markExternalConflict(key: string): void {
    const document = this.documents.get(key)
    if (!document || document.externalConflict) return
    document.externalConflict = true
    this.emit()
  }

  reloadClean(key: string, content: string): boolean {
    const document = this.documents.get(key)
    if (!document || document.dirty) return false
    document.savedContent = content
    document.externalConflict = false
    if (document.model.getValue() !== content) document.model.setValue(content)
    document.dirty = false
    this.emit()
    return true
  }

  findAffectedDocuments(
    projectId: ProjectId,
    relativePath: string,
    includeDescendants: boolean,
  ): readonly EditorDocument[] {
    const normalized = normalizeRelativePath(relativePath)
    return this.getOpenDocuments().filter((document) => (
      document.projectId === projectId
      && (includeDescendants
        ? isSameOrDescendant(document.relativePath, normalized)
        : normalizeIdentityPath(document.relativePath) === normalizeIdentityPath(normalized))
    ))
  }

  renamePath(
    projectId: ProjectId,
    oldPath: string,
    newPath: string,
    includeDescendants: boolean,
  ): void {
    const oldNormalized = normalizeRelativePath(oldPath)
    const newNormalized = normalizeRelativePath(newPath)
    const affected = this.findAffectedDocuments(
      projectId,
      oldNormalized,
      includeDescendants,
    ).map((document) => this.documents.get(document.key)!)

    for (const document of affected) {
      const suffix = includeDescendants
        ? document.relativePath.slice(oldNormalized.length).replace(/^\//, '')
        : ''
      const targetPath = suffix ? `${newNormalized}/${suffix}` : newNormalized
      const targetKey = documentKey(projectId, targetPath)
      if (targetKey !== document.key && this.documents.has(targetKey)) {
        throw new Error('The renamed document identity already exists.')
      }
    }

    for (const document of affected) {
      const oldKey = document.key
      const suffix = includeDescendants
        ? document.relativePath.slice(oldNormalized.length).replace(/^\//, '')
        : ''
      const targetPath = suffix ? `${newNormalized}/${suffix}` : newNormalized
      const targetKey = documentKey(projectId, targetPath)
      const content = document.model.getValue()
      const replacement = this.modelHost.createModel(
        content,
        languageIdForPath(targetPath),
        documentUri(projectId, targetPath),
      )
      document.changeSubscription.dispose()
      document.model.dispose()
      document.model = replacement
      document.key = targetKey
      document.relativePath = targetPath
      document.languageId = languageIdForPath(targetPath)
      document.changeSubscription = replacement.onDidChangeContent(() => {
        document.dirty = replacement.getValue() !== document.savedContent
        this.emit()
      })
      this.documents.delete(oldKey)
      this.documents.set(targetKey, document)
      const index = this.tabOrder.indexOf(oldKey)
      if (index >= 0) this.tabOrder[index] = targetKey
      if (this.activeKey === oldKey) this.activeKey = targetKey
    }
    if (affected.length > 0) this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function normalizeRelativePath(relativePath: string): string {
  const replaced = relativePath.replaceAll('\\', '/')
  if (replaced.startsWith('/') || /^[a-z]:/i.test(replaced)) {
    throw new Error('Expected a project-relative path.')
  }
  const parts: string[] = []
  for (const part of replaced.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') throw new Error('Parent traversal is not allowed.')
    parts.push(part)
  }
  if (parts.length === 0) throw new Error('Expected a file path.')
  return parts.join('/')
}

export function isSameOrDescendant(path: string, ancestor: string): boolean {
  const candidate = normalizeIdentityPath(normalizeRelativePath(path))
  const parent = normalizeIdentityPath(normalizeRelativePath(ancestor))
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

export function documentKey(projectId: ProjectId, relativePath: string): string {
  return `${projectId}:${normalizeIdentityPath(normalizeRelativePath(relativePath))}`
}

export function documentUri(projectId: ProjectId, relativePath: string): string {
  const encodedPath = normalizeRelativePath(relativePath)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return `student-ide://project/${encodeURIComponent(projectId)}/${encodedPath}`
}

export function languageIdForPath(relativePath: string): string {
  const extension = relativePath.split('.').at(-1)?.toLowerCase()
  return ({
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    py: 'python', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', java: 'java', cs: 'csharp', php: 'php',
  } as Record<string, string>)[extension ?? ''] ?? 'plaintext'
}

function normalizeIdentityPath(path: string): string {
  return path.toLocaleLowerCase('en-US')
}
