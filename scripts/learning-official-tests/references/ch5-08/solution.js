// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (a,b)=>{const memo=new Map();function f(i,j){if(i===a.length)return b.length-j;if(j===b.length)return a.length-i;const k=i+','+j;if(memo.has(k))return memo.get(k);const v=a[i]===b[j]?f(i+1,j+1):1+Math.min(f(i+1,j),f(i,j+1),f(i+1,j+1));memo.set(k,v);return v}return f(0,0)}
