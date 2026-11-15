/* global require, process */
/* eslint-disable @typescript-eslint/no-require-imports */
// Native smoke fixture: argv round-trip, inherited environment and immediate EOF.
const { readFileSync } = require('node:fs')
process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(),
  stdin: readFileSync(0, 'utf8'), nodeOptions: process.env.NODE_OPTIONS ?? null,
  nodePath: process.env.NODE_PATH ?? null, electronAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
  inherited: process.env.RUN_SMOKE_INHERITED ?? null }))
