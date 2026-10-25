/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function LeapYear(year) { return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) }
module.exports = LeapYear
