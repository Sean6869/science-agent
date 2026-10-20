const shuffle=(items,random)=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
export const GROUPING_STRATEGY_VERSION=4;
export const GROUPING_PRIORITY=['HL','HH','LL'];
const better=(a,b)=>!b||a.some((value,index)=>a.slice(0,index).every((item,i)=>item===b[i])&&value<b[index]);
// Lexicographic objective: maximize high-low pairs, then minimize low-low pairs,
// which leaves high-high as the preferred same-level fallback. Gender matching is
// considered only after the knowledge-level composition has been optimized.
const groupingScore=(counts,sameGenderPairs)=>[-counts.HL,counts.LL,counts.HH,-sameGenderPairs];

function distributions(total,caps,index=0,prefix=[]){
 if(!caps.length)return total===0?[[]]:[];
 if(index===caps.length-1)return total<=caps[index]?[prefix.concat(total)]:[];
 const result=[];for(let value=0;value<=Math.min(total,caps[index]);value++)result.push(...distributions(total-value,caps,index+1,prefix.concat(value)));return result;
}

// Median ties are split evenly so every student belongs to one of the two prior-knowledge strata.
function classify(students,random){
 const sorted=[...students].sort((a,b)=>a.total-b.total||a.username.localeCompare(b.username)),middle=Math.floor(sorted.length/2);
 const median=sorted.length%2?sorted[middle].total:(sorted[middle-1].total+sorted[middle].total)/2;
 const low=sorted.filter(student=>student.total<median),high=sorted.filter(student=>student.total>median),ties=shuffle(sorted.filter(student=>student.total===median),random);
 const targetHigh=Math.floor(sorted.length/2)+(sorted.length%2&&random()<.5?1:0),highTies=Math.max(0,Math.min(ties.length,targetHigh-high.length));
 high.push(...ties.slice(0,highTies));low.push(...ties.slice(highTies));
 return {sorted,median,low,high,tieCount:ties.length};
}

function allocationOptions(high,low,mixed){
 const genders=[...new Set([...high,...low].map(student=>student.gender))],highBy=genders.map(gender=>high.filter(student=>student.gender===gender)),lowBy=genders.map(gender=>low.filter(student=>student.gender===gender));
 const options=[];for(const takeHigh of distributions(mixed,highBy.map(list=>list.length)))for(const takeLow of distributions(mixed,lowBy.map(list=>list.length))){
  const same=genders.reduce((sum,_,index)=>sum+Math.min(takeHigh[index],takeLow[index])+Math.floor((highBy[index].length-takeHigh[index])/2)+Math.floor((lowBy[index].length-takeLow[index])/2),0);
  options.push({genders,takeHigh,takeLow,same});
 }return options;
}

function buildPairs(high,low,leftover,counts,allocation,random){
 const withoutLeftover=list=>list.filter(student=>student!==leftover),highBy=new Map(),lowBy=new Map();
 for(const gender of allocation.genders){highBy.set(gender,shuffle(withoutLeftover(high).filter(student=>student.gender===gender),random));lowBy.set(gender,shuffle(withoutLeftover(low).filter(student=>student.gender===gender),random));}
 const mixed=[],mixedHigh=[],mixedLow=[];
 allocation.genders.forEach((gender,index)=>{
  const selectedHigh=highBy.get(gender).splice(0,allocation.takeHigh[index]),selectedLow=lowBy.get(gender).splice(0,allocation.takeLow[index]),same=Math.min(selectedHigh.length,selectedLow.length);
  for(let i=0;i<same;i++)mixed.push([selectedHigh[i],selectedLow[i]]);mixedHigh.push(...selectedHigh.slice(same));mixedLow.push(...selectedLow.slice(same));
 });
 const crossHigh=shuffle(mixedHigh,random),crossLow=shuffle(mixedLow,random);for(let i=0;i<crossHigh.length;i++)mixed.push([crossHigh[i],crossLow[i]]);
 const sameLevel=byGender=>{const pairs=[],remaining=[];for(const list of byGender.values()){for(let i=0;i+1<list.length;i+=2)pairs.push([list[i],list[i+1]]);if(list.length%2)remaining.push(list.at(-1));}const cross=shuffle(remaining,random);for(let i=0;i<cross.length;i+=2)pairs.push([cross[i],cross[i+1]]);return pairs;};
 const pairs=[...sameLevel(highBy).map(members=>({type:'HH',members})),...sameLevel(lowBy).map(members=>({type:'LL',members})),...mixed.map(members=>({type:'HL',members}))];
 if(leftover)pairs.push({type:'VR',members:[leftover],virtual:true});
 if(pairs.filter(group=>group.type==='HH').length!==counts.HH||pairs.filter(group=>group.type==='LL').length!==counts.LL||pairs.filter(group=>group.type==='HL').length!==counts.HL)throw new Error('分组计算不一致');
 return shuffle(pairs,random);
}

export function planGroups(students,{random=Math.random}={}){
 if(!students.length)return {groups:[],threshold:null,median:null,lowRange:null,highRange:null,tieCount:0,counts:{LL:0,HH:0,HL:0},strategyVersion:GROUPING_STRATEGY_VERSION};
 const {sorted,median,low,high,tieCount}=classify(students,random),levelById=new Map([...low.map(student=>[student.id,'low']),...high.map(student=>[student.id,'high'])]);
 let bestScore,best=[];const leftovers=students.length%2?[...students]:[null];
 for(const leftover of leftovers){
  const highCount=high.length-(leftover&&levelById.get(leftover.id)==='high'?1:0),lowCount=low.length-(leftover&&levelById.get(leftover.id)==='low'?1:0);
  for(let mixed=0;mixed<=Math.min(highCount,lowCount);mixed++){
   if((highCount-mixed)%2||(lowCount-mixed)%2)continue;
   const counts={HH:(highCount-mixed)/2,LL:(lowCount-mixed)/2,HL:mixed};
   const remainingHigh=high.filter(student=>student!==leftover),remainingLow=low.filter(student=>student!==leftover);
   for(const allocation of allocationOptions(remainingHigh,remainingLow,mixed)){
    const score=groupingScore(counts,allocation.same);if(better(score,bestScore)){bestScore=score;best=[];}if(score.every((value,index)=>value===bestScore[index]))best.push({leftover,counts,allocation});
   }
  }
 }
 const chosen=best[Math.floor(random()*best.length)],groups=buildPairs(high,low,chosen.leftover,chosen.counts,chosen.allocation,random).map(group=>({...group,members:group.members.map(student=>({...student,level:levelById.get(student.id)}))}));
 const range=list=>list.length?[Math.min(...list.map(student=>student.total)),Math.max(...list.map(student=>student.total))]:null;
 return {threshold:median,median,lowRange:range(low),highRange:range(high),tieCount,counts:chosen.counts,strategyVersion:GROUPING_STRATEGY_VERSION,groups};
}
