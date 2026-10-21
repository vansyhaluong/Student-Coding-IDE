import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertMonacoRunSource } from './learning-monaco-source-observer.mjs'

const capture = source => ({ source, uri: 'practice:/ch3-01/solution.cs', version: 7,
  identity: { scheme: 'practice', authority: '', path: '/ch3-01/solution.cs', query: '', fragment: '' } })
const request = code => ({ exerciseId: 'ch3-01', language: 'csharp', code })

test('compares the captured model, including indentation and Unicode, verbatim', () => {
  const source = 'public class Solution {\r\n    string s = "a  b Ω";\r\n}\r\n'
  assert.doesNotThrow(() => assertMonacoRunSource(request(source), capture(source)))
})
test('rejects real whitespace mismatch, including inside a C# string literal', () => {
  assert.throws(() => assertMonacoRunSource(request('return "a b";'), capture('return "a  b";')))
  assert.throws(() => assertMonacoRunSource(request(' return 1;'), capture('  return 1;')))
})
test('rejects a different model identity even if source is equal', () => {
  assert.throws(() => assertMonacoRunSource({ ...request('x'), exerciseId: 'ch3-02' }, capture('x')))
})
test('rejects missing capture/version instead of accepting unchecked source', () => {
  assert.throws(() => assertMonacoRunSource(request('x'), undefined))
  assert.throws(() => assertMonacoRunSource(request('x'), { ...capture('x'), version: undefined }))
})
