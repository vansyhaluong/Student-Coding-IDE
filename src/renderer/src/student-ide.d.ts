import type { LifecycleApi } from '../../shared/contracts'

declare global {
  interface Window {
    studentIde: {
      lifecycle: LifecycleApi
    }
  }
}

export {}
