import { createProtocolConnection } from 'vscode-languageserver-protocol/node'
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

export const bundledProtocolImports = {
  createProtocolConnection: typeof createProtocolConnection,
  streamMessageReader: typeof StreamMessageReader,
  streamMessageWriter: typeof StreamMessageWriter
}
