// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (b,e)=>{let p=1;while(e){if(e%2)p*=b;e=Math.floor(e/2);if(e)b*=b}return p}
