/* global console, setImmediate */
// Distinct event-loop turns exercise streaming without sleep-based readiness.
console.log('first-output')
setImmediate(() => {
  console.error('second-output')
  console.log('unicode: Việt Nam 😀')
})
