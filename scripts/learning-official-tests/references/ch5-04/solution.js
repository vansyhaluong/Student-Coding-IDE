// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = s=>{const words=[];let i=s.length-1;while(i>=0){while(i>=0&&s[i]===' ')i--;let end=i;while(i>=0&&s[i]!==' ')i--;if(end>i)words.push(s.slice(i+1,end+1))}return words.join(' ')}
