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
