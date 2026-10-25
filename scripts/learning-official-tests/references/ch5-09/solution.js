// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (s,t)=>{const memo=new Map();function f(i,j){if(j===t.length)return 1;if(i===s.length)return 0;const k=i+','+j;if(memo.has(k))return memo.get(k);const v=f(i+1,j)+(s[i]===t[j]?f(i+1,j+1):0);memo.set(k,v);return v}return f(0,0)}
