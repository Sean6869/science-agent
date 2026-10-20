const choice=(label,options)=>({label,options});
const entry=(label,placeholder)=>({label,placeholder});

export const conclusionTasks={
 'bending-light':{
  title:'光的折射：从角度数据得出结论',
  instruction:'对照任务单中的每组入射角、折射角和介质记录，填出两条结论。',
  sections:[
   {title:'实验结论一 · 入射角与折射角',fields:[
    entry('光从哪种介质射入哪种介质','例如：空气射入水'),
    choice('介质组合与入射点',['保持不变','发生改变']),
    choice('入射角逐渐增大时，折射角',['逐渐增大','逐渐减小','保持不变','数据不足，不能判断']),
    entry('支持这条规律的两组数据','例如：入射角30°、折射角……；入射角60°、折射角……')
   ]},
   {title:'实验结论二 · 不同条件的比较',fields:[
    entry('比较的两组传播条件','例如：空气射入水、空气射入玻璃'),
    choice('比较时入射角',['保持相同','不相同']),
    entry('折射角的比较结果','写出哪一组更大或更小，并引用记录'),
    entry('结论适用的条件或范围','例如：本组测量的介质及入射角范围')
   ]}
  ]
 },
 'geometric-optics-basics':{
  title:'凸透镜成像：按物距分类写结论',
  instruction:'对照任务单，分别填写物距大于一倍焦距和小于一倍焦距时的成像规律。',
  sections:[
   {title:'实验结论一 · 物距大于一倍焦距',fields:[
    choice('保持不变的条件',['焦距','物距','像距']),
    choice('物距与一倍焦距的关系',['大于','小于']),
    choice('物体逐渐靠近凸透镜时，物距',['变小','变大','不变']),
    choice('像距',['变大','变小','不变']),
    choice('像的大小',['变大','变小','不变']),
    choice('像的虚实',['实像','虚像']),
    choice('像的正倒',['倒立','正立']),
    choice('像位于凸透镜的',['异侧','同侧'])
   ]},
   {title:'实验结论二 · 物距小于一倍焦距',fields:[
    choice('保持不变的条件',['焦距','物距','像距']),
    choice('物距与一倍焦距的关系',['小于','大于']),
    choice('像的虚实',['虚像','实像']),
    choice('像的正倒',['正立','倒立']),
    choice('像位于凸透镜的',['同侧','异侧']),
    choice('像与物体相比',['放大','缩小','等大'])
   ]}
  ]
 },
 'energy-skate-park':{
  title:'能量滑板：比较变量与能量变化',
  instruction:'对照任务单中改变质量、速度和摩擦的记录，分别写出有条件的结论。',
  sections:[
   {title:'实验结论一 · 质量、速度与动能',fields:[
    entry('保持不变的条件','例如：速度不变，比较质量'),
    choice('改变的条件',['质量','速度','高度']),
    choice('这个条件增大时，动能',['增大','减小','不变','数据不足，不能判断']),
    entry('支持结论的两组数据','写出两个条件值及对应的动能记录')
   ]},
   {title:'实验结论二 · 摩擦与能量',fields:[
    choice('比较的两种摩擦条件',['无摩擦与有摩擦','仅无摩擦','仅有摩擦']),
    choice('无摩擦时机械能总量',['基本保持不变','逐渐减少','逐渐增大']),
    choice('有摩擦时部分机械能转化为',['热能','重力势能','动能']),
    entry('对应的实验观察或数据','写出能量条形图或任务单中的变化'),
    entry('结论适用的条件','例如：相同轨道和初始高度')
   ]}
  ]
 }
};

export function conclusionFieldCount(lessonId){return conclusionTasks[lessonId]?.sections.reduce((sum,section)=>sum+section.fields.length,0)||0;}

export function formatConclusion(lessonId,values){
 const task=conclusionTasks[lessonId];if(!task)throw new Error('当前课程没有结论模板');
 if(!Array.isArray(values)||values.length!==conclusionFieldCount(lessonId))throw new Error('请填写全部结论空格');
 let index=0;
 const paragraphs=task.sections.map(section=>{
  const details=section.fields.map(field=>{
   const answer=String(values[index++]||'').trim();
   if(!answer||answer.length>200||field.options&&!field.options.includes(answer))throw new Error('请填写全部结论空格');
   return `${field.label}：${answer}`;
  });
  return `${section.title}\n${details.join('；')}。`;
 });
 return paragraphs.join('\n\n');
}
