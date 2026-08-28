export type ProjectId = string & { readonly __brand: 'ProjectId' }

export interface ProjectIdentity {
  id: ProjectId
  name: string
}

export interface RecentProjectMetadata extends ProjectIdentity {
  rootPath: string
  lastOpenedAt: string
}
