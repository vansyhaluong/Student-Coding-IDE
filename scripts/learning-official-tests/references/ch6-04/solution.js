// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (a,b)=>{function gcd(x,y){let shift=0;while(x%2===0&&y%2===0){x/=2;y/=2;shift++}while(x%2===0)x/=2;while(y){while(y%2===0)y/=2;if(x>y)[x,y]=[y,x];y-=x}return x*2**shift}return a/gcd(a,b)*b}
