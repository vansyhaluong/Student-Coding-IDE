// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (s,t)=>{if(s.length!==t.length)return false;const m=new Map();for(const c of s)m.set(c,(m.get(c)||0)+1);for(const c of t){if(!m.get(c))return false;m.set(c,m.get(c)-1)}return true}
