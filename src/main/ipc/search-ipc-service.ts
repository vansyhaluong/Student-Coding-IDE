import {
  SEARCH_CHANNELS,
  validateCancelSearchRequest,
  validateStartSearchRequest,
  type SearchEvent,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { SearchService } from '../services/search/search-service'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export class SearchIpcService implements ManagedService {
  readonly name = 'SearchIpcService'
  private readonly cleanup: (() => void)[] = []

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly searchService: SearchService,
    private readonly publish: (ownerId: number, event: SearchEvent) => void,
  ) {}

  start(): void {
    this.cleanup.push(
      this.registry.register({
        channel: SEARCH_CHANNELS.start,
        validate: validateStartSearchRequest,
        handle: (request, context) => {
          this.searchService.startSearch(
            request,
            context.senderId,
            (event) => this.publish(context.senderId, event),
          )
          return null
        },
      }),
      this.registry.register({
        channel: SEARCH_CHANNELS.cancel,
        validate: validateCancelSearchRequest,
        handle: ({ operationId }, context) => {
          this.searchService.cancel(operationId, context.senderId)
          return null
        },
      }),
    )
  }

  stop(): void {
    for (const cleanup of this.cleanup.splice(0).reverse()) cleanup()
  }
}
