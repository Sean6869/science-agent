const choice=(label,options)=>({label,options});

export const conclusionTasks={
 'bending-light':{
  title:'光的折射：从角度数据得出结论',
  instruction:'对照任务单中的数据，把四条实验结论补充完整。提交后，小科会按任务单原句帮你们检查。',
  sections:[
   {title:'实验结论一 · 空气斜射入水中',fields:[
    choice('随着入射角增大，折射角',['增大','减小','不变']),
    choice('折射角与入射角相比',['小于','大于','等于']),
    choice('折射光线偏向',['靠近','远离'])
   ]},
   {title:'实验结论二 · 水中斜射入空气中',fields:[
    choice('随着入射角增大，折射角',['增大','减小','不变']),
    choice('折射角与入射角相比',['大于','小于','等于']),
    choice('折射光线偏向',['远离','靠近'])
   ]},
   {title:'实验结论三 · 比较两种介质的折射率',fields:[
    choice('从折射率小的介质斜射入折射率大的介质时，折射角',['小于','大于','等于']),
    choice('此时折射光线',['靠近','远离']),
    choice('从折射率大的介质斜射入折射率小的介质时，折射角',['大于','小于','等于']),
    choice('此时折射光线',['远离','靠近'])
   ]},
   {title:'实验结论四 · 垂直入射',fields:[
    choice('光线的传播方向',['不改变','改变']),
    choice('此时入射角为',['0度','其他角度']),
    choice('此时折射角为',['0度','其他角度'])
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
    choice('物体的速度越大，动能',['越大','越小','不变'])
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

// The visible worksheet and submitted paragraphs share these exact templates.
const templates={
 'bending-light':[
  '（在固定上方与下方介质组合不变的条件下）\n当光线从空气斜射入水中时：\n随着入射角增大，折射角{0}，折射角{1}入射角。折射光线{2}法线。',
  '（在固定上方与下方介质组合不变的条件下）\n当光线从水中斜射入空气中时：\n随着入射角增大，折射角{0}，折射角{1}入射角。折射光线{2}法线。',
  '（在固定入射角不变的条件下）\n当光线从一种介质斜射入另一种介质时，折射角与入射角的大小关系取决于两种介质的折射率大小：\n当光线从折射率小的介质斜射入折射率大的介质时，折射角{0}入射角，折射光线{1}法线；\n当光线从折射率大的介质斜射入折射率小的介质时，折射角{2}入射角，折射光线{3}法线。',
  '（特殊情形）\n当光线从空气垂直射向水面/玻璃时，光线的传播方向{0}，此时入射角为{1}，折射角为{2}。'
 ],
 'geometric-optics-basics':[
  '在固定{0}不变的条件下：\n当物体离凸透镜的距离{1}一倍焦距时：\n如果物体越靠近凸透镜（物距u越小），那么像距{2}，像的大小{3}。此时的像都是{4}。像与物体{5}，{6}。像与物体在凸透镜的{7}。',
  '在固定{0}不变的条件下：\n当物体离凸透镜的距离{1}一倍焦距时：\n此时的像是{2}。像与物体{3}，{4}。像与物体在凸透镜的{5}。'
 ],
 'energy-skate-park':[
  '（动能的影响因素）\n在固定物体速度不变的条件下：\n物体的质量越大，动能{0}。\n在固定物体质量不变的条件下：\n物体的速度越大，动能{1}。',
  '（动能与势能的转化与机械能守恒规律）\n在无摩擦（摩擦力=0）的条件下：\n同一个物体从高处滑下时，随着高度减小，物体的重力势能{0}，物体的动能{1}。物体的机械能（动能+势能）{2}，此时机械能{3}。\n在有摩擦（摩擦力>0）的条件下：\n同一个物体从高处滑下时，随着高度减小，物体的重力势能{4}，物体的动能{5}。物体的机械能（动能+势能）{6}，此时机械能{7}。\n在有摩擦（摩擦力>0）的条件下：\n同一个物体从高处滑下时，部分的机械能转化为热能，并且，摩擦力越大，机械能转化为热能{8}。总能量（动能+势能+热能）{9}。'
 ]
};
for(const [lessonId,task] of Object.entries(conclusionTasks))task.sections.forEach((section,index)=>{section.template=templates[lessonId][index];});

export function conclusionParagraph(section,answers){
 return `【${section.title.split(' · ')[0]}】`+section.template.replace(/\{(\d+)\}/g,(_,index)=>answers[index]).replaceAll('\n','');
}

export function migrateConclusionFields(lessonId,values=[],version=1){
 if(!Array.isArray(values))return [];
 if(version>=2)return values;
 if(lessonId==='bending-light')return Array.from(values).filter((_,index)=>index!==3&&index!==7);
 if(lessonId==='energy-skate-park')return Array.from(values).filter((_,index)=>index!==2);
 return values;
}

export function formatConclusion(lessonId,values){
 const task=conclusionTasks[lessonId];if(!task)throw new Error('当前课程没有结论模板');
 if(!Array.isArray(values)||values.length!==conclusionFieldCount(lessonId))throw new Error('请填写全部结论空格');
 const answers=[];let index=0;
 for(const section of task.sections)for(const field of section.fields){
  const answer=String(values[index++]||'').trim();
  if(!answer||answer.length>200||field.options&&!field.options.includes(answer))throw new Error('请填写全部结论空格');
  answers.push(answer);
 }
 const paragraphs=[];let offset=0;
 for(const section of task.sections){paragraphs.push(conclusionParagraph(section,answers.slice(offset,offset+section.fields.length)));offset+=section.fields.length;}
 const text=paragraphs.join('\n\n');
 if(text.length>2000)throw new Error('结论内容过长，请精简填写的数据');
 return text;
}

const conclusionChecks={
 'bending-light':[
  {title:'实验结论一',match:'当光线从空气斜射入水中时：随着入射角增大，折射角增大，折射角小于入射角。折射光线靠近法线。',hint:'空气斜射入水中时，折射角随入射角增大而增大，折射角小于入射角，光线靠近法线。'},
  {title:'实验结论二',match:'当光线从水中斜射入空气中时：随着入射角增大，折射角增大，折射角大于入射角。折射光线远离法线。',hint:'水中斜射入空气中时，折射角随入射角增大而增大，折射角大于入射角，光线远离法线。'},
  {title:'实验结论三',match:'当光线从折射率小的介质斜射入折射率大的介质时，折射角小于入射角，折射光线靠近法线；当光线从折射率大的介质斜射入折射率小的介质时，折射角大于入射角，折射光线远离法线。',hint:'从低折射率介质进入高折射率介质时靠近法线；反向传播时远离法线。'},
  {title:'实验结论四',match:'当光线从空气垂直射向水面/玻璃时，光线的传播方向不改变，此时入射角为0度，折射角为0度。',hint:'垂直入射时传播方向不改变，入射角和折射角都为0度。'}
 ],
 'geometric-optics-basics':[
  {title:'实验结论一',match:'在固定焦距不变的条件下：当物体离凸透镜的距离大于一倍焦距时：如果物体越靠近凸透镜（物距u越小），那么像距越大，像的大小越大。此时的像都是实像。像与物体左右颠倒，上下颠倒。像与物体在凸透镜的异侧。',hint:'物距大于一倍焦距时，物体靠近凸透镜，像距和像都变大，成倒立实像，像物异侧。'},
  {title:'实验结论二',match:'在固定焦距不变的条件下：当物体离凸透镜的距离小于一倍焦距时：此时的像是虚像。像与物体左右不颠倒，上下不颠倒。像与物体在凸透镜的同侧。',hint:'物距小于一倍焦距时，成正立虚像，像物同侧，左右和上下都不颠倒。'}
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
 const evidenceComplete=checks.length>0&&errors.length===0;
 const correct=evidenceComplete;
 const ratings=[
  {name:'证据充分',stars:evidenceComplete?3:2,reason:evidenceComplete?'任务单各条固定结论均已核对。':'部分填空与任务单中的规律不一致。'},
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
 const evidence='按任务单的固定结论核对填空，不要求额外填写实验数据。';
 return `结论判定：${verdict}\n老师的评价：\n${ratings}。\n${result.correct?'小科已按任务单逐项核对，固定模板中的结论关系全部正确。':errors}\n证据核对：${evidence}\n本环节还剩${remaining}次内容提交机会。`;
}
