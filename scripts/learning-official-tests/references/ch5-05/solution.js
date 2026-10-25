// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = s=>{const set=new Set();let l=0,best=0;for(let r=0;r<s.length;r++){while(set.has(s[r]))set.delete(s[l++]);set.add(s[r]);best=Math.max(best,r-l+1)}return best}
