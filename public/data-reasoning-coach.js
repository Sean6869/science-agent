const option=(id,label,correct=false,feedback='')=>({id,label,correct,feedback});
const question=(prompt,options,correctFeedback,incorrectFeedback)=>({prompt,options,correctFeedback,incorrectFeedback});

export const dataReasoningDialogues={
 'bending-light':{
  lesson:'探究光的折射规律',
  goal:'学习归纳推理与比较推理',
  pages:[
   {
    method:'归纳推理',
    title:'第一步：从多组数据中寻找共同趋势',
    instruction:'请查看任务单中“基础探究”的数据表：固定上方与下方介质种类不变，改变入射角大小。',
    questions:[question('随着入射角从 30° 增加到 60°，你们记录的折射角发生了怎样的变化？',[
     option('increase','变大',true),option('decrease','变小'),option('same','不变')
    ],'完全正确！像这样从多组实验数据中找出共同变化趋势的方法，叫做归纳推理。','小科提醒你们再核对一次任务单或重新操作实验。随着入射角增大，折射角也会增大；从多组数据中寻找共同趋势，就是归纳推理。')]
   },
   {
    method:'比较推理',
    title:'第二步：比较不同条件下的数据差异',
    instruction:'请查看任务单中“进阶探究”的数据表：固定入射角与上方介质种类不变，改变下方介质种类。',
    questions:[question('在入射角相同（如都是 30°）时，光从空气射入水和射入玻璃相比，哪种情况的折射角更小？',[
     option('water','射入水更小'),option('glass','射入玻璃更小',true),option('same','两者一样')
    ],'太棒了！通过对比不同条件寻找差异，这就是比较推理。现在可以运用这个方法写出你们的结论了。','小科建议你们重新核对两种介质中的实验数据。射入玻璃时折射角更小；通过对比不同条件寻找差异，就是比较推理。')]
   }
  ]
 },
 'geometric-optics-basics':{
  lesson:'探究凸透镜的成像规律',
  goal:'学习分类推理与归纳推理',
  pages:[
   {
    method:'分类推理',
    title:'第一步：依据关键特征整理数据',
    instruction:'请查看任务单中的数据表。直接把所有数据混在一起寻找规律，往往会显得杂乱。',
    questions:[question('能否用一倍焦距（f）作为分界线，把数据分为物距大于 f 和物距小于 f 两类？',[
     option('reasonable','合理，可以这样分',true),option('unreasonable','不合理，分不出来')
    ],'没错！把复杂数据按照共同特征分门别类，这就叫分类推理。','小科提醒你们，一倍焦距（f）是凸透镜成像规律的重要分界线。按照关键特征整理复杂数据，就是分类推理。')]
   },
   {
    method:'归纳推理',
    title:'第二步：在同一类数据中归纳共同规律',
    instruction:'现在请只观察物距大于 f（u＞f）的三行数据，分别判断成像性质与像的大小变化。',
    questions:[
     question('这些数据中，像的正倒和虚实是否保持一致？',[
      option('inverted-real','都是倒立实像',true),option('upright-virtual','都是正立虚像'),option('none','没有明显规律')
     ],'判断正确！把同一类数据放在一起寻找共同点，就是归纳推理。','小科建议你们重新查看 u＞f 的三行数据：它们形成的像都是倒立实像。把同类数据放在一起寻找共同点，就是归纳推理。'),
     question('随着物距 u 逐渐增大，像的大小发生了怎样的变化？',[
      option('larger','像逐渐变大'),option('smaller','像逐渐变小',true),option('same','像的大小保持不变')
     ],'非常好！你们从同类数据中发现了“物距增大，像逐渐变小”的变化规律，这就是归纳推理。','小科建议你们按物距由小到大重新比较像的大小。物距逐渐增大时，像会逐渐变小。')
    ]
   }
  ]
 },
 'energy-skate-park':{
  lesson:'探究动能及机械能守恒规律',
  goal:'学习控制变量推理、守恒推理与转化推理',
  pages:[
   {
    method:'控制变量推理',
    title:'第一步：一次只研究一个影响因素',
    instruction:'请查看任务单中“实验探究一：探究质量对动能的影响”的数据表。质量和速度不能同时改变。',
    questions:[question('探究质量对动能的影响时，必须保证哪个量不变？',[
     option('mass','物体的质量'),option('speed','物体的速度',true),option('unclear','不太清楚')
    ],'很聪明！在控制其他条件（速度）相同的情况下，研究质量与动能之间的关系，这叫做控制变量推理。','小科提醒你们：要研究质量的影响，质量需要改变，速度则应保持不变。一次只改变一个因素，就是控制变量推理。')]
   },
   {
    method:'守恒与转化推理',
    title:'第二步：追踪能量总量与形式的变化',
    instruction:'请查看任务单中“实验探究三”的数据表，分别思考无摩擦和有摩擦两种情况。',
    questions:[
     question('没有摩擦（摩擦力＝0）时，落地时的动能与重力势能总和，和滑道上方的总和相比如何？',[
      option('equal','一样大',true),option('smaller','变小了'),option('larger','变大了'),option('unclear','不太清楚')
     ],'没错！能量形式虽然发生变化，但总量始终不变，这叫做守恒推理。','小科请你们把同一行中的动能和重力势能分别相加再比较。没有摩擦消耗时，机械能总量保持不变。'),
     question('存在摩擦（摩擦力＞0）时，减少的机械能去了哪里？',[
      option('gone','消失不见了',false,'能量不会凭空消失。小科提示你们想一想：有摩擦的轨道为什么会发热？减少的机械能转化成了热能。'),
      option('heat','转化成了热能',true),
      option('hidden','藏在物体里了',false,'小科提醒你们，能量发生了形式转换。由于摩擦，部分机械能转化成热能并散发到环境中。'),
      option('unclear','不太清楚',false,'小科提醒你们，能量发生了形式转换。由于摩擦，部分机械能转化成热能并散发到环境中。')
     ],'太棒了！能量不会凭空消失。有摩擦时，减少的机械能转化成了热能，这叫做转化推理。现在可以运用这些方法写出结论了。','')
    ]
   }
  ]
 }
};

export function shouldShowDataReasoningCoach(previousStage,nextStage,alreadyCompleted){
 return previousStage===4&&nextStage===5&&!alreadyCompleted;
}

export function createDataReasoningCoach(){
 const dialog=document.createElement('dialog');
 dialog.className='data-reasoning-dialog';
 dialog.setAttribute('aria-labelledby','dataReasoningTitle');
 dialog.addEventListener('cancel',event=>event.preventDefault());
 document.body.append(dialog);
 let lesson=null,pageIndex=0,answers=new Map(),completedPages=new Set(),completeHandler=()=>{};

 const show=()=>{if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.hidden=false;dialog.setAttribute('open','');}};
 const close=()=>{if(typeof dialog.close==='function')dialog.close();else{dialog.hidden=true;dialog.removeAttribute('open');}};
 const selected=(questionIndex)=>answers.get(`${pageIndex}:${questionIndex}`);
 const pageComplete=()=>completedPages.has(pageIndex);

 function render(){
  const page=lesson.pages[pageIndex],isLast=pageIndex===lesson.pages.length-1;
  dialog.replaceChildren();
  const shell=document.createElement('div');shell.className='data-reasoning-shell';
  const header=document.createElement('header');
  const avatar=document.createElement('img');avatar.src='/assets/xiaoke-icon-transparent.png?v=20260917';avatar.alt='小科';
  const heading=document.createElement('div');heading.className='data-reasoning-heading';
  const eyebrow=document.createElement('small');eyebrow.textContent='小科 · 数据推理教练';
  const title=document.createElement('h2');title.id='dataReasoningTitle';title.textContent='从实验数据走向科学结论';
  heading.append(eyebrow,title);header.append(avatar,heading);

  const progress=document.createElement('div');progress.className='data-reasoning-progress';progress.setAttribute('aria-label',`第 ${pageIndex+1} 步，共 ${lesson.pages.length} 步`);
  lesson.pages.forEach((item,index)=>{const step=document.createElement('span');step.className=index===pageIndex?'active':index<pageIndex?'done':'';step.textContent=`${index+1} ${item.method}`;progress.append(step);});

  const body=document.createElement('div');body.className='data-reasoning-body';
  if(pageIndex===0){const intro=document.createElement('section');intro.className='data-reasoning-intro';intro.innerHTML='<strong>恭喜你们成功采集到了数据！</strong><p>接下来，小科要带着你们把一组组数据变成有依据的科学结论。请拿出小组刚才填写的实验任务单，一起寻找数据中的规律。</p>';body.append(intro);}
  const lessonMeta=document.createElement('div');lessonMeta.className='data-reasoning-lesson';lessonMeta.innerHTML=`<span>${lesson.lesson}</span><strong>${lesson.goal}</strong>`;
  const pageTitle=document.createElement('h3');pageTitle.textContent=page.title;
  const instruction=document.createElement('p');instruction.className='data-reasoning-instruction';instruction.textContent=page.instruction;
  const form=document.createElement('form');form.className='data-reasoning-form';
  page.questions.forEach((item,questionIndex)=>{
   const fieldset=document.createElement('fieldset');
   const legend=document.createElement('legend');legend.textContent=`${questionIndex+1}. ${item.prompt}`;fieldset.append(legend);
   const options=document.createElement('div');options.className='data-reasoning-options';
   item.options.forEach(itemOption=>{const label=document.createElement('label'),input=document.createElement('input'),copy=document.createElement('span');input.type='radio';input.name=`question-${questionIndex}`;input.value=itemOption.id;input.required=true;input.checked=selected(questionIndex)===itemOption.id;input.disabled=pageComplete();copy.textContent=itemOption.label;label.append(input,copy);options.append(label);});
   fieldset.append(options);
   if(pageComplete()){
    const chosen=item.options.find(itemOption=>itemOption.id===selected(questionIndex));
    const feedback=document.createElement('div');feedback.className=`data-reasoning-feedback ${chosen?.correct?'correct':'review'}`;
    const feedbackTitle=document.createElement('strong');feedbackTitle.textContent=chosen?.correct?'小科：回答正确！':'小科：我们再想一想';
    const feedbackCopy=document.createElement('p');feedbackCopy.textContent=chosen?.feedback||(chosen?.correct?item.correctFeedback:item.incorrectFeedback);
    feedback.append(feedbackTitle,feedbackCopy);fieldset.append(feedback);
   }
   form.append(fieldset);
  });
  const actions=document.createElement('footer');
  if(pageIndex>0){const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='上一页';back.onclick=()=>{pageIndex-=1;render();};actions.append(back);}
  const primary=document.createElement('button');primary.type=pageComplete()?'button':'submit';primary.className='primary';primary.textContent=pageComplete()?(isLast?'完成引导，进入第五环节':'下一页：继续学习'):'提交答案，听听小科怎么说';
  if(pageComplete())primary.onclick=()=>{if(isLast){close();completeHandler();}else{pageIndex+=1;render();}};
  actions.append(primary);form.append(actions);
  form.onsubmit=event=>{event.preventDefault();const data=new FormData(form);page.questions.forEach((_,index)=>answers.set(`${pageIndex}:${index}`,data.get(`question-${index}`)));completedPages.add(pageIndex);render();};
  body.append(lessonMeta,pageTitle,instruction,form);shell.append(header,progress,body);dialog.append(shell);
 }

 return {
  open({lessonId,onComplete}){
   const nextLesson=dataReasoningDialogues[lessonId];
   if(!nextLesson){onComplete?.();return;}
   lesson=nextLesson;pageIndex=0;answers=new Map();completedPages=new Set();completeHandler=onComplete||(()=>{});render();show();
  },
  get isOpen(){return dialog.open;}
 };
}
