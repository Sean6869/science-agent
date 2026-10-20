const choice=(label,options)=>({label,options});
const entry=(label,placeholder)=>({label,placeholder});

export const conclusionTasks={
 'bending-light':{
  title:'光的折射：从角度数据得出结论',
  instruction:'对照任务单中的数据，把两条实验结论补充完整。提交后，小科会按任务单原句帮你们检查。',
  sections:[
   {title:'实验结论一 · 空气斜射入水中',fields:[
    choice('随着入射角增大，折射角',['增大','减小','不变']),
    choice('折射角与入射角相比',['小于','大于','等于']),
    choice('折射光线偏向',['靠近','远离']),
    entry('支持这条规律的数据','例如：入射角30°时折射角……，入射角60°时折射角……')
   ]},
   {title:'实验结论二 · 水中斜射入空气中',fields:[
    choice('随着入射角增大，折射角',['增大','减小','不变']),
    choice('折射角与入射角相比',['大于','小于','等于']),
    choice('折射光线偏向',['远离','靠近']),
    entry('支持这条规律的数据','例如：入射角30°时折射角……，入射角60°时折射角……')
   ]}
  ]
 },
 'geometric-optics-basics':{
  title:'凸透镜成像：按物距分类写结论',
  instruction:'对照任务单，把物距大于一倍焦距和小于一倍焦距时的成像规律补充完整。',
  sections:[
   {title:'实验结论一 · 物距大于一倍焦距',fields:[
    choice('保持不变的条件',['焦距','物距','像距']),
    choice('物距与一倍焦距的关系',['大于','小于']),
    choice('物体逐渐靠近凸透镜时，像距',['越大','越小']),
    choice('物体逐渐靠近凸透镜时，像的大小',['越大','越小']),
    choice('像的虚实',['实像','虚像']),
    choice('像与物体的左右关系',['左右颠倒','左右不颠倒']),
    choice('像与物体的上下关系',['上下颠倒','上下不颠倒']),
    choice('像位于凸透镜的',['异侧','同侧'])
   ]},
   {title:'实验结论二 · 物距小于一倍焦距',fields:[
    choice('保持不变的条件',['焦距','物距','像距']),
    choice('物距与一倍焦距的关系',['小于','大于']),
    choice('像的虚实',['虚像','实像']),
    choice('像与物体的左右关系',['左右不颠倒','左右颠倒']),
    choice('像与物体的上下关系',['上下不颠倒','上下颠倒']),
    choice('像位于凸透镜的',['同侧','异侧'])
   ]}
  ]
 },
 'energy-skate-park':{
  title:'能量滑板：比较变量与能量变化',
  instruction:'对照任务单，把动能变化和机械能守恒的结论补充完整。',
  sections:[
   {title:'实验结论一 · 质量、速度与动能',fields:[
    choice('物体的质量越大，动能',['越大','越小','不变']),
    choice('物体的速度越大，动能',['越大','越小','不变']),
    entry('支持结论的实验数据','写出质量、速度和对应的动能记录')
   ]},
   {title:'实验结论二 · 摩擦与能量',fields:[
    choice('无摩擦时，重力势能',['减小','增大','不变']),
    choice('无摩擦时，动能',['增大','减小','不变']),
    choice('无摩擦时，机械能',['不变','增大','减小']),
    choice('无摩擦时，机械能是否守恒',['守恒','不守恒']),
    choice('有摩擦时，重力势能',['减小','增大','不变']),
    choice('有摩擦时，动能',['增大','减小','不变']),
    choice('有摩擦时，机械能',['减小','增大','不变']),
    choice('有摩擦时，机械能是否守恒',['不守恒','守恒']),
    choice('摩擦力越大，转化成的热能',['越多','越少']),
    choice('总能量（动能+势能+热能）',['不变','增大','减小'])
   ]}
  ]
 }
};

export function conclusionFieldCount(lessonId){return conclusionTasks[lessonId]?.sections.reduce((sum,section)=>sum+section.fields.length,0)||0;}

export function formatConclusion(lessonId,values){
 const task=conclusionTasks[lessonId];if(!task)throw new Error('当前课程没有结论模板');
 if(!Array.isArray(values)||values.length!==conclusionFieldCount(lessonId))throw new Error('请填写全部结论空格');
 const answers=[];let index=0;
 for(const section of task.sections)for(const field of section.fields){
  const answer=String(values[index++]||'').trim();
  if(!answer||answer.length>200||field.options&&!field.options.includes(answer))throw new Error('请填写全部结论空格');
  answers.push(answer);
 }
 const text=lessonId==='bending-light'
  ? `【实验结论一】（在固定上方与下方介质组合不变的条件下）当光线从空气斜射入水中时：随着入射角增大，折射角${answers[0]}，折射角${answers[1]}入射角。折射光线${answers[2]}法线。支持这条规律的数据是：${answers[3]}。\n\n【实验结论二】（在固定上方与下方介质组合不变的条件下）当光线从水中斜射入空气中时：随着入射角增大，折射角${answers[4]}，折射角${answers[5]}入射角。折射光线${answers[6]}法线。支持这条规律的数据是：${answers[7]}。`
  : lessonId==='geometric-optics-basics'
   ? `【实验结论一】在固定${answers[0]}不变的条件下：当物体离凸透镜的距离${answers[1]}一倍焦距时：如果物体越靠近凸透镜（物距u越小），那么像距${answers[2]}，像的大小${answers[3]}。此时的像都是${answers[4]}。像与物体${answers[5]}，${answers[6]}。像与物体在凸透镜的${answers[7]}。\n\n【实验结论二】在固定${answers[8]}不变的条件下：当物体离凸透镜的距离${answers[9]}一倍焦距时：此时的像是${answers[10]}。像与物体${answers[11]}，${answers[12]}。像与物体在凸透镜的${answers[13]}。`
   : `【实验结论一】（动能的影响因素）在固定物体速度不变的条件下：物体的质量越大，动能${answers[0]}。在固定物体质量不变的条件下：物体的速度越大，动能${answers[1]}。支持这些结论的实验数据是：${answers[2]}。\n\n【实验结论二】（动能与势能的转化与机械能守恒规律）在无摩擦（摩擦力=0）的条件下：同一个物体从高处滑下时，随着高度减小，物体的重力势能${answers[3]}，物体的动能${answers[4]}。物体的机械能（动能+势能）${answers[5]}，此时机械能${answers[6]}。在有摩擦（摩擦力>0）的条件下：同一个物体从高处滑下时，随着高度减小，物体的重力势能${answers[7]}，物体的动能${answers[8]}。物体的机械能（动能+势能）${answers[9]}，此时机械能${answers[10]}。在有摩擦（摩擦力>0）的条件下：同一个物体从高处滑下时，部分的机械能转化为热能，并且，摩擦力越大，机械能转化为热能${answers[11]}。总能量（动能+势能+热能）${answers[12]}。`;
 if(text.length>2000)throw new Error('结论内容过长，请精简填写的数据');
 return text;
}

const conclusionChecks={
 'bending-light':[
  {title:'实验结论一',match:'当光线从空气斜射入水中时：随着入射角增大，折射角增大，折射角小于入射角。折射光线靠近法线。',hint:'空气斜射入水中时，折射角随入射角增大而增大，折射角小于入射角，光线靠近法线。'},
  {title:'实验结论二',match:'当光线从水中斜射入空气中时：随着入射角增大，折射角增大，折射角大于入射角。折射光线远离法线。',hint:'水中斜射入空气中时，折射角随入射角增大而增大，折射角大于入射角，光线远离法线。'}
 ],
 'geometric-optics-basics':[
  {title:'实验结论一',match:'当物体离凸透镜的距离大于一倍焦距时：如果物体越靠近凸透镜（物距u越小），那么像距越大，像的大小越大。此时的像都是实像。像与物体左右颠倒，上下颠倒。像与物体在凸透镜的异侧。',hint:'物距大于一倍焦距时，物体靠近凸透镜，像距和像都变大，成倒立实像，像物异侧。'},
  {title:'实验结论二',match:'当物体离凸透镜的距离小于一倍焦距时：此时的像是虚像。像与物体左右不颠倒，上下不颠倒。像与物体在凸透镜的同侧。',hint:'物距小于一倍焦距时，成正立虚像，像物同侧，左右和上下都不颠倒。'}
 ],
 'energy-skate-park':[
  {title:'实验结论一',match:'在固定物体速度不变的条件下：物体的质量越大，动能越大。在固定物体质量不变的条件下：物体的速度越大，动能越大。',hint:'速度不变时质量越大动能越大；质量不变时速度越大动能越大。'},
  {title:'实验结论二',match:'在无摩擦（摩擦力=0）的条件下：同一个物体从高处滑下时，随着高度减小，物体的重力势能减小，物体的动能增大。物体的机械能（动能+势能）不变，此时机械能守恒。在有摩擦（摩擦力>0）的条件下：同一个物体从高处滑下时，随着高度减小，物体的重力势能减小，物体的动能增大。物体的机械能（动能+势能）减小，此时机械能不守恒。在有摩擦（摩擦力>0）的条件下：同一个物体从高处滑下时，部分的机械能转化为热能，并且，摩擦力越大，机械能转化为热能越多。总能量（动能+势能+热能）不变。',hint:'无摩擦时机械能守恒；有摩擦时机械能减少并转化为热能，摩擦力越大转化的热能越多，总能量不变。'}
 ]
};

const normalizeConclusionText=text=>String(text||'').replace(/\s/g,'');

export function evaluateConclusion(lessonId,text){
 const normalized=normalizeConclusionText(text),checks=conclusionChecks[lessonId]||[];
 const errors=checks.filter(item=>!normalized.includes(normalizeConclusionText(item.match)));
 const evidenceRequired=lessonId==='bending-light'?2:lessonId==='energy-skate-park'?1:0;
 const evidenceMatches=[...String(text||'').matchAll(/支持(?:这条规律|这些结论)的数据是：([^。\n]*)/g)];
 const evidenceComplete=evidenceMatches.length>=evidenceRequired&&evidenceMatches.slice(0,evidenceRequired).every(match=>match[1].trim()&&match[1].trim()!=='任务单记录：第一组与第二组有一致趋势');
 const correct=errors.length===0&&evidenceComplete;
 const ratings=[
  {name:'证据充分',stars:evidenceRequired===0||evidenceComplete?3:2,reason:evidenceComplete||evidenceRequired===0?'已提交对应结论的任务单数据。':'还有结论缺少对应的任务单数据。'},
  {name:'条件明确',stars:errors.length===0?3:2,reason:errors.length===0?'每条结论都写明了成立条件。':'有结论的成立条件或对应关系填写不正确。'},
  {name:'表述精确',stars:errors.length===0?3:1,reason:errors.length===0?'变化方向和成像或能量特征与任务单一致。':'至少一条变化方向或实验现象与任务单不一致。'}
 ];
 return {correct,errors:errors.map(item=>`${item.title}：${item.hint}`),ratings,evidenceComplete};
}

export function formatConclusionEvaluation(lessonId,text,attempt=1){
 const result=evaluateConclusion(lessonId,text),remaining=Math.max(0,3-attempt);
 const ratings=result.ratings.map(item=>`${item.name}${'⭐'.repeat(item.stars)}（${item.reason}）`).join('；\n');
 const verdict=result.correct?'✅ 结论正确':'❌ 结论需要订正';
 const errors=result.errors.length?`\n需要订正：\n${result.errors.join('\n')}`:'';
 const evidence=lessonId==='geometric-optics-basics'?'任务单中的固定结论已完成核对。':result.evidenceComplete?'证据数据已填写。':'请补充每条结论对应的任务单数据。';
 return `结论判定：${verdict}\n老师的评价：\n${ratings}。\n${result.correct?'小科已按任务单逐项核对，固定模板中的结论关系全部正确。':errors}\n证据核对：${evidence}\n本环节还剩${remaining}次内容提交机会。`;
}
