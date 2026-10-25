// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (left,right)=>{function prime(v){if(v<2)return false;if(v===2)return true;if(v%2===0)return false;for(let d=3;d<=Math.floor(Math.sqrt(v));d+=2)if(v%d===0)return false;return true}let count=0;for(let v=left;v<=right;v++)if(prime(v))count++;return count}
