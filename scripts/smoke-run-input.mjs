/* global console, process, setTimeout, clearTimeout, setInterval, clearInterval, Buffer */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const binding = require(resolve('out/main/native/run-process.node'))
const executable = process.execPath
const fixture = resolve('tests/fixtures/run-input-child.mjs')
const cwd = resolve('.')
const environment = ['SystemRoot', 'PATH', 'PATHEXT', 'WINDIR'].flatMap((name) => {
  const value = Object.entries(process.env).find(([key]) => key.toUpperCase() === name.toUpperCase())?.[1]
  return value && !value.includes('\0') ? [`${name}=${value}`] : []
})
const deadline = (promise, ms = 8000) => new Promise((done, fail) => {
  const timer = setTimeout(() => fail(new Error('Run stdin smoke deadline')), ms)
  promise.then((value) => { clearTimeout(timer); done(value) }, (error) => { clearTimeout(timer); fail(error) })
})
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }

function open(mode, onEvent) {
  return binding.createRunInput(executable, [fixture, mode], cwd, environment, onEvent)
}
function write(handle, bytes) {
  return new Promise((resolveWrite, rejectWrite) => {
    try {
      binding.writeRun(handle, bytes, (status) => resolveWrite(status))
    } catch (error) { rejectWrite(error) }
  })
}
function closeInput(handle) {
  return new Promise((resolveClose, rejectClose) => {
    try {
      binding.closeRunInput(handle, (status) => status === 'closed' ? resolveClose() : rejectClose(new Error(status)))
    } catch (error) { rejectClose(error) }
  })
}
async function release(handle, settled) {
  await deadline(settled.promise)
  let count = binding.control(handle, 'count')
  for (let attempt = 0; count !== 0 && attempt < 20; attempt += 1) {
    await new Promise((done) => setTimeout(done, 50))
    count = binding.control(handle, 'count')
  }
  if (count !== 0) console.error(JSON.stringify({ activeAfterSettled: count, pid: binding.control(handle, 'pid') }))
  assert.equal(count, 0)
  binding.control(handle, 'release')
}

async function main() {
  assert.equal(typeof binding.createGit, 'function')
  assert.equal(typeof binding.createCsharp, 'function')
  assert.equal(typeof binding.writeCsharp, 'function')
  assert.equal(typeof binding.createRun, 'function')

  const echoed = deferred(), echoSettled = deferred()
  let echoOut = ''
  const echo = open('echo', (event) => {
    if (event.type === 'stdout') echoOut += event.data.toString('utf8')
    if (event.type === 'settled') echoSettled.resolve()
    if (echoOut.includes('READY\n') && echoOut.includes('xin chào 😀\n') && echoOut.includes('second\n') && echoOut.includes('EOF\n')) echoed.resolve()
  })
  await deadline(new Promise((done) => {
    const timer = setInterval(() => { if (echoOut.includes('READY\n')) { clearInterval(timer); done() } }, 10)
  }))
  assert.equal(await write(echo, Buffer.from('xin chào 😀\n', 'utf8')), 'delivered')
  assert.equal(await write(echo, Buffer.from('second\n', 'utf8')), 'delivered')
  const partial = Buffer.alloc(9000, 0x42)
  assert.equal(await write(echo, partial), 'delivered')
  await closeInput(echo)
  await closeInput(echo)
  await deadline(echoed.promise)
  assert.ok(echoOut.includes(partial.toString('utf8')))
  assert.throws(() => binding.writeRun(echo, Buffer.from('later\n'), () => {}))
  assert.throws(() => binding.writeCsharp(echo, Buffer.from('nope'), () => {}))
  await release(echo, echoSettled)
  console.log(JSON.stringify({ repeatedUtf8AndEof: 'PASS', partialWrites: 9000, idempotentEof: true }))

  const brokenSettled = deferred()
  let brokenExited = deferred()
  const broken = open('exit', (event) => {
    if (event.type === 'exit') brokenExited.resolve()
    if (event.type === 'settled') brokenSettled.resolve()
  })
  await deadline(brokenExited.promise)
  assert.equal(await write(broken, Buffer.from('too late\n')), 'broken')
  await release(broken, brokenSettled)
  console.log(JSON.stringify({ brokenPipe: 'PASS' }))

  const blockedSettled = deferred(), ready = deferred()
  let blockedOut = ''
  const blocked = open('ignore', (event) => {
    if (event.type === 'stdout') {
      blockedOut += event.data.toString('utf8')
      if (blockedOut.includes('READY\n')) ready.resolve()
    }
    if (event.type === 'settled') blockedSettled.resolve()
  })
  await deadline(ready.promise)
  const blockedWrite = write(blocked, Buffer.alloc(16 * 1024, 0x41))
  assert.throws(() => binding.writeRun(blocked, Buffer.from('x'), () => {}))
  binding.control(blocked, 'terminate')
  const blockedStatus = await deadline(blockedWrite)
  assert.notEqual(blockedStatus, 'delivered')
  await release(blocked, blockedSettled)
  console.log(JSON.stringify({ oneInFlight: true, stopUnblockedFullPipe: blockedStatus }))

  const closedSettled = deferred()
  let closedOut = ''
  const closed = binding.createRun(executable, [resolve('tests/fixtures/run/argv.js')], cwd, environment, (event) => {
    if (event.type === 'stdout') closedOut += event.data.toString('utf8')
    if (event.type === 'settled') closedSettled.resolve()
  })
  await release(closed, closedSettled)
  assert.equal(JSON.parse(closedOut).stdin, '')
  assert.throws(() => binding.writeRun(closed, Buffer.from('x'), () => {}))
  console.log(JSON.stringify({ closedStdin: 'PASS', lspAndGitExportsPreserved: true }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
