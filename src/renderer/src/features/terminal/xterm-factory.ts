import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'

import type { TerminalViewFactory } from './terminal-controller'

export const xtermViewFactory: TerminalViewFactory = {
  create() {
    const styles = getComputedStyle(document.documentElement)
    const color = (token: string, fallback: string): string => (
      styles.getPropertyValue(token).trim() || fallback
    )
    const terminal = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: color('--font-mono', '"Cascadia Code", Consolas, monospace'),
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5_000,
      theme: {
        background: color('--editor-surface', '#1e1e1e'),
        foreground: color('--foreground', '#fafafa'),
        cursor: color('--foreground', '#fafafa'),
        cursorAccent: color('--editor-surface', '#1e1e1e'),
        selectionBackground: color('--accent', '#404040'),
      },
    })
    const fitAddon = new FitAddon()
    return {
      fitAddon,
      terminal: {
        get cols() { return terminal.cols },
        get rows() { return terminal.rows },
        loadAddon: () => terminal.loadAddon(fitAddon),
        open: (parent) => terminal.open(parent),
        focus: () => terminal.focus(),
        write: (data, callback) => terminal.write(data, callback),
        onData: (listener) => terminal.onData(listener),
        dispose: () => terminal.dispose(),
      },
    }
  },
}
