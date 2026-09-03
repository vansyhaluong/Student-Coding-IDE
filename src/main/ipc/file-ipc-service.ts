import {
  FILE_CHANNELS,
  validateCreateEntryRequest,
  validateProjectPathRequest,
  validateProjectFileSystemStatusRequest,
  validateRenameEntryRequest,
  validateWriteFileRequest,
  type FileChangedEvent,
  type ProjectFileSystemStatus,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { FileSystemService } from '../services/filesystem/filesystem-service'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export class FileIpcService implements ManagedService {
  readonly name = 'FileIpcService'
  private readonly cleanup: (() => void)[] = []

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly fileSystemService: FileSystemService,
    private readonly publishChanged: (event: FileChangedEvent) => void,
    private readonly publishStatusChanged: (status: ProjectFileSystemStatus) => void = () => undefined,
  ) {}

  start(): void {
    this.cleanup.push(
      this.registry.register({
        channel: FILE_CHANNELS.getStatus,
        validate: validateProjectFileSystemStatusRequest,
        handle: ({ projectId }) => this.fileSystemService.getStatus(projectId),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.listDirectory,
        validate: validateProjectPathRequest,
        handle: ({ projectId, relativePath }) => (
          this.fileSystemService.listDirectory(projectId, relativePath)
        ),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.stat,
        validate: validateProjectPathRequest,
        handle: ({ projectId, relativePath }) => (
          this.fileSystemService.stat(projectId, relativePath)
        ),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.read,
        validate: validateProjectPathRequest,
        handle: ({ projectId, relativePath }) => (
          this.fileSystemService.read(projectId, relativePath)
        ),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.write,
        validate: validateWriteFileRequest,
        handle: async ({ projectId, relativePath, content }) => {
          await this.fileSystemService.write(projectId, relativePath, content)
          return null
        },
      }),
      this.registry.register({
        channel: FILE_CHANNELS.createFile,
        validate: validateCreateEntryRequest,
        handle: ({ projectId, parentPath, name }) => (
          this.fileSystemService.createFile(projectId, parentPath, name)
        ),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.createDirectory,
        validate: validateCreateEntryRequest,
        handle: ({ projectId, parentPath, name }) => (
          this.fileSystemService.createDirectory(projectId, parentPath, name)
        ),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.rename,
        validate: validateRenameEntryRequest,
        handle: ({ projectId, relativePath, newName }) => (
          this.fileSystemService.rename(projectId, relativePath, newName)
        ),
      }),
      this.registry.register({
        channel: FILE_CHANNELS.delete,
        validate: validateProjectPathRequest,
        handle: async ({ projectId, relativePath }) => {
          await this.fileSystemService.delete(projectId, relativePath)
          return null
        },
      }),
      this.fileSystemService.subscribe(this.publishChanged),
      this.fileSystemService.subscribeStatus(this.publishStatusChanged),
    )
  }

  stop(): void {
    for (const cleanup of this.cleanup.splice(0).reverse()) {
      cleanup()
    }
  }
}
