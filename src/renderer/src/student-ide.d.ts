import type { StudentIdeApi } from '../../shared/contracts'

declare global {
  interface Window {
    studentIde: StudentIdeApi
    
  }
}

export {}
