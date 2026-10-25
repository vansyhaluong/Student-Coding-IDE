// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (text,pattern)=>{const pi=Array(pattern.length).fill(0);for(let i=1,j=0;i<pattern.length;i++){while(j&&pattern[i]!==pattern[j])j=pi[j-1];if(pattern[i]===pattern[j])j++;pi[i]=j}for(let i=0,j=0;i<text.length;i++){while(j&&text[i]!==pattern[j])j=pi[j-1];if(text[i]===pattern[j])j++;if(j===pattern.length)return i-j+1}return -1}
