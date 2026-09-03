import { TerminalController } from './terminal-controller'
import { xtermViewFactory } from './xterm-factory'

export const terminalController = new TerminalController({
  getApi: () => window.studentIde.terminal,
  viewFactory: xtermViewFactory,
  createResizeObserver: (listener) => {
    const observer = new ResizeObserver(listener)
    return observer
  },
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (frame) => cancelAnimationFrame(frame),
})
