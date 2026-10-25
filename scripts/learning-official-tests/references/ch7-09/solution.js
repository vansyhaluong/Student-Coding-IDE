/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = ratings=>{let total=1,up=0,down=0,peak=0;for(let i=1;i<ratings.length;i++){if(ratings[i]>ratings[i-1]){up++;peak=up;down=0;total+=up+1}else if(ratings[i]===ratings[i-1]){up=down=peak=0;total++}else{up=0;down++;total+=down+1;if(peak>=down)total--}}return total}
