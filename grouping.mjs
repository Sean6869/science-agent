// Equal scores stay on the same side of a class-specific, near-median boundary.
export function planGroups(students){
 if(!students.length)return {groups:[],threshold:null,lowRange:null,highRange:null};
 const sorted=[...students].sort((a,b)=>a.total-b.total||a.username.localeCompare(b.username));
 let split=sorted.length;
 for(let i=1;i<sorted.length;i++)if(sorted[i-1].total<sorted[i].total&&Math.abs(sorted.length-2*i)<Math.abs(sorted.length-2*split))split=i;
 const threshold=sorted[split-1].total;
 const level=s=>s.total<=threshold?'low':'high';
 const type=members=>members.length===1?'single':level(members[0])===level(members[1])?(level(members[0])==='low'?'LL':'HH'):'HL';
 function options(gender){
  const people=sorted.filter(s=>s.gender===gender),low=people.filter(s=>level(s)==='low'),high=people.filter(s=>level(s)==='high'),plans=[];
  const singles=people.length%2?[...(low.length?['low']:[]),...(high.length?['high']:[])]:[null];
  for(const single of singles){const l=[...low],h=[...high],left=single?(single==='low'?l:h).pop():null;
   for(let mixed=0;mixed<=Math.min(l.length,h.length);mixed++){
    if((l.length-mixed)%2||(h.length-mixed)%2)continue;
    const pairs=[];for(let i=0;i<mixed;i++)pairs.push([l[i],h[i]]);
    for(const list of [l.slice(mixed),h.slice(mixed)])for(let i=0;i<list.length;i+=2)pairs.push(list.slice(i,i+2));
    plans.push({pairs,left});
   }
  }return plans;
 }
 let best;
 const better=(a,b)=>!b||a.some((n,i)=>n!==b[i]&&a.slice(0,i).every((x,j)=>x===b[j])&&n<b[i]);
 for(const m of options('男'))for(const f of options('女'))for(const u of options('未填写')){
  const leftovers=[m.left,f.left,u.left].filter(Boolean),base=[...m.pairs,...f.pairs,...u.pairs];
  // At most one leftover per gender. Try each possible residual pairing.
  const residual=leftovers.length===3?[[[leftovers[0],leftovers[1]],[leftovers[2]]],[[leftovers[0],leftovers[2]],[leftovers[1]]],[[leftovers[1],leftovers[2]],[leftovers[0]]]]:[leftovers.length?[leftovers]:[]];
  for(const tail of residual){const pairs=[...base,...tail],counts={LL:0,HH:0,HL:0};for(const p of pairs)if(p.length===2)counts[type(p)]++;
   const values=Object.values(counts),score=[Math.max(...values)-Math.min(...values),values.reduce((sum,n)=>sum+n*n,0)];
   if(better(score,best?.score))best={pairs,counts,score};
  }
 }
 return {threshold,lowRange:[sorted[0].total,threshold],highRange:split<sorted.length?[sorted[split].total,sorted.at(-1).total]:null,counts:best.counts,groups:best.pairs.map(members=>({type:type(members),members:members.map(s=>({...s,level:level(s)}))}))};
}
