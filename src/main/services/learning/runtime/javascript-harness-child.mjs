/* global process, Buffer, TextDecoder, URL */
import fs from 'node:fs'
import vm from 'node:vm'

// Fixed trusted child asset. Never imported/evaluated by Electron; bundled as raw
// text and written exclusively. These values mirror the accepted Step 1 limits.
const MAX = 1024 * 1024, VERSION = 1, DEPTH = 12
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
const unicode = s => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)
function strictJson(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX || !unicode(text)) throw Error('protocol')
  let p = 0
  const ws = () => { while (p < text.length && /[\t\r\n ]/.test(text[p])) p++ }
  const str = () => {
    const start = p++
    while (p < text.length) { const c = text[p++]; if (c === '"') return JSON.parse(text.slice(start, p)); if (c === '\\') p++ }
    throw Error('string')
  }
  const scan = depth => {
    if (depth > DEPTH) throw Error('depth')
    ws(); const c = text[p]
    if (c === '"') { str(); return }
    if (c === '{' || c === '[') {
      const obj = c === '{', end = obj ? '}' : ']', keys = new Set()
      p++; ws(); if (text[p] === end) { p++; return }
      for (;;) {
        ws()
        if (obj) {
          if (text[p] !== '"') throw Error('key')
          const k = str(); if (keys.has(k)) throw Error('duplicate'); keys.add(k)
          ws(); if (text[p++] !== ':') throw Error('colon')
        }
        scan(depth + 1); ws()
        if (text[p] === end) { p++; return }
        if (text[p++] !== ',') throw Error('separator')
      }
    }
    const token = /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y
    token.lastIndex = p; if (!token.exec(text)) throw Error('token'); p = token.lastIndex
  }
  scan(0); ws(); if (p !== text.length) throw Error('trailing')
  return JSON.parse(text)
}
const types = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
function typed(v, t) {
  const integer = n => typeof n === 'number' && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
  if (t === 'int32') return integer(v)
  if (t === 'boolean') return typeof v === 'boolean'
  if (t === 'string') return typeof v === 'string' && unicode(v)
  if (!Array.isArray(v)) return false
  if (t === 'int32[]') return v.every(integer)
  if (t === 'string[]') return v.every(s => typeof s === 'string' && unicode(s))
  return v.every(row => Array.isArray(row) && row.length === v[0].length && row.every(integer))
}
function emit(text, exit) { process.stdout.write(text, () => process.exit(exit)) }
function failProtocol() { process.exit(2) }

// This closure-free function is compiled from its FIXED raw asset source into vm.
// It is never passed as a host function. Only a primitive JSON string is injected.
function bootstrap() {
  'use strict'
  const parse = JSON.parse, stringify = JSON.stringify, own = Object.getOwnPropertyDescriptor, keys = Reflect.ownKeys
  const isArray = Array.isArray, integer = Number.isInteger, create = Object.create, setPrototype = Object.setPrototypeOf, apply = Reflect.apply
  const StringValue = String, NumberValue = Number, charCode = Function.prototype.call.bind(String.prototype.charCodeAt)
  const data = parse(globalThis.__learningData); delete globalThis.__learningData
  let stdout = '', stderr = '', used = 0, overflow = false, budget = data.max
  const record = () => create(null), array = () => setPrototype([], null)
  function byteLength(s) {
    let n = 0
    for (let i = 0; i < s.length; i++) {
      const c = charCode(s, i)
      if (c < 128) n++; else if (c < 2048) n += 2
      else if (c >= 0xd800 && c <= 0xdbff) { const d = charCode(s, ++i); if (!(d >= 0xdc00 && d <= 0xdfff)) throw Error('unicode'); n += 4 }
      else if (c >= 0xdc00 && c <= 0xdfff) throw Error('unicode')
      else n += 3
    }
    return n
  }
  function log(stream, args) {
    if (overflow) throw Error('capture limit')
    let text = ''
    for (let i = 0; i < args.length; i++) {
      if (i) text += ' '
      text += StringValue(args[i])
      if (text.length > data.max) { overflow = true; throw Error('capture limit') }
    }
    text += '\n'; used += byteLength(stringify(text)) - 2
    // Representation reserve, not a new OS quota. Overflow stays a failed result,
    // even if student code catches the capture exception.
    if (used > data.max - 4096) { overflow = true; throw Error('capture limit') }
    if (stream === 'stdout') stdout += text; else stderr += text
  }
  const console = record()
  console.log = (...a) => log('stdout', a); console.info = (...a) => log('stdout', a); console.debug = (...a) => log('stdout', a)
  console.warn = (...a) => log('stderr', a); console.error = (...a) => log('stderr', a)
  globalThis.console = console
  function clean(v, t, depth) {
    if (--budget < 0 || depth > data.depth) throw Error('bounds')
    if (t === 'int32') { if (typeof v !== 'number' || !integer(v) || v < -2147483648 || v > 2147483647) throw Error('type'); return v }
    if (t === 'boolean') { if (typeof v !== 'boolean') throw Error('type'); return v }
    if (t === 'string') { if (typeof v !== 'string' || v.length > budget) throw Error('type'); budget -= v.length; byteLength(v); return v }
    if (!isArray(v)) throw Error('type')
    const length = own(v, 'length')
    if (!length || !integer(length.value) || length.value > budget) throw Error('array')
    const n = length.value, names = keys(v)
    if (names.length !== n + 1) throw Error('properties')
    for (let i = 0; i < names.length; i++) {
      const k = names[i]
      if (k !== 'length' && (typeof k !== 'string' || !/^(0|[1-9]\d*)$/.test(k) || NumberValue(k) >= n)) throw Error('property')
    }
    const result = array(); let width = null
    for (let i = 0; i < n; i++) {
      const d = own(v, StringValue(i))
      if (!d || !('value' in d) || !d.enumerable) throw Error('accessor')
      const row = clean(d.value, t === 'int32[]' ? 'int32' : t === 'string[]' ? 'string' : 'int32[]', depth + 1)
      if (t === 'int32[][]') { if (width === null) width = row.length; else if (width !== row.length) throw Error('matrix') }
      result[i] = row
    }
    return result
  }
  function response(outcome, actual, error) {
    const r = record()
    r.protocolVersion = 1; r.caseIndex = data.request.caseIndex; r.stdout = stdout; r.stderr = stderr; r.outcome = outcome
    if (outcome === 'RETURNED') r.actual = actual; else r.error = error
    const text = stringify(r); if (byteLength(text) > data.max) throw Error('response limit')
    return text
  }
  function failed(tag) {
    try { return response('FAILED', null, overflow ? 'INVALID_RESULT' : tag) }
    catch { stdout = ''; stderr = ''; return response('FAILED', null, 'INVALID_RESULT') }
  }
  const bridge = record(); bridge.failed = failed
  bridge.finish = function (fn) {
    if (typeof fn !== 'function') return failed('USER_EXCEPTION')
    let actual
    try { actual = apply(fn, undefined, data.request.args) } catch { return failed('USER_EXCEPTION') }
    if (overflow) return failed('INVALID_RESULT')
    try { budget = data.max; return response('RETURNED', clean(actual, data.schema.returnType, 0), null) }
    catch { return failed('INVALID_RESULT') }
  }
  return bridge
}

let source
try {
  source = strictJson(decode(fs.readFileSync(new URL('./Source.json', import.meta.url))))
  if (!exact(source, ['code', 'functionName', 'schema']) || typeof source.code !== 'string' || source.code.length > 256 * 1024 || !unicode(source.code)
    || typeof source.functionName !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(source.functionName)
    || !exact(source.schema, ['parameterTypes', 'returnType', 'sampleCount']) || !Array.isArray(source.schema.parameterTypes)
    || !source.schema.parameterTypes.every(t => types.includes(t)) || !types.includes(source.schema.returnType)
    || !Number.isSafeInteger(source.schema.sampleCount) || source.schema.sampleCount < 1 || source.schema.sampleCount > MAX) throw Error('source')
} catch { failProtocol() }
if (process.argv[2] === 'syntax') {
  // Parse only: no context, runInContext, function lookup or student evaluation.
  try { new vm.Script(source.code, { filename: 'solution.js' }); emit('{"status":"SUCCEEDED"}', 0) }
  catch (e) { if (e && e.name === 'SyntaxError') emit('{"status":"FAILED","code":"SYNTAX_ERROR"}', 1); else failProtocol() }
} else if (process.argv[2] === 'execute') {
  const chunks = []; let bytes = 0
  process.stdin.on('data', chunk => { bytes += chunk.length; if (bytes > MAX) failProtocol(); else chunks.push(chunk) })
  process.stdin.on('error', failProtocol)
  process.stdin.on('end', () => {
    let request
    try {
      request = strictJson(decode(Buffer.concat(chunks)))
      if (!exact(request, ['protocolVersion', 'caseIndex', 'args']) || request.protocolVersion !== VERSION
        || !Number.isSafeInteger(request.caseIndex) || request.caseIndex < 0 || request.caseIndex >= source.schema.sampleCount
        || !Array.isArray(request.args) || request.args.length !== source.schema.parameterTypes.length
        || !request.args.every((a, i) => typed(a, source.schema.parameterTypes[i]))) throw Error('request')
    } catch { failProtocol(); return }
    const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' })
    context.__learningData = JSON.stringify({ request, schema: source.schema, max: MAX, depth: DEPTH })
    let bridge
    try {
      bridge = new vm.Script('(' + bootstrap.toString() + ')()', { filename: 'learning-context.js' }).runInContext(context)
      const lookup = new vm.Script('typeof ' + source.functionName + ' === "function" ? ' + source.functionName + ' : null', { filename: 'learning-call.js' })
      const baseline = lookup.runInContext(context)
      new vm.Script(source.code, { filename: 'solution.js' }).runInContext(context)
      const fn = lookup.runInContext(context)
      const text = bridge.finish(fn === baseline ? null : fn)
      if (typeof text !== 'string') throw Error('bridge')
      emit(text, JSON.parse(text).outcome === 'RETURNED' ? 0 : 1)
    } catch {
      if (bridge) { try { emit(bridge.failed('USER_EXCEPTION'), 1); return } catch { /* Fall through to protocol failure. */ } }
      failProtocol()
    }
  })
} else failProtocol()
