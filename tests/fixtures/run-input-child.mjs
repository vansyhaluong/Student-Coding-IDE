/* global process, setInterval */
const mode = process.argv[2] ?? 'echo'
if (mode === 'ignore') {
  process.stdout.write('READY\n')
  setInterval(() => {}, 1000)
} else if (mode === 'exit') {
  process.stdout.write('READY\n')
  process.exit(0)
} else {
  process.stdout.write('READY\n')
  process.stdin.on('data', (data) => process.stdout.write(data))
  process.stdin.on('end', () => {
    process.stdout.write('EOF\n')
    process.exit(0)
  })
}
