export const roleHints=[
 {id:1,title:'共同观察与问题界定',prompt:'请领航发言员先提出自己对科学问题的想法，记录与质疑员随后提出质疑：这个问题是否具体？是否可探究？',record:'小组达成共识后，请记录与质疑员将科学问题记录到实验任务单。'},
 {id:2,title:'提出并确认假设',prompt:'请两位成员先各自独立思考实验假设，然后领航发言员先分享自己的实验假设，记录与质疑员随后提出质疑：假设是否满足可检验性、明确性、条件性？',record:'小组达成共识后，请记录与质疑员将实验假设记录到实验任务单。'},
 {id:3,title:'协作设计实验',prompt:'请领航发言员先提出自己的实验设计方案，记录与质疑员随后提出质疑：这个实验设计方案是否将三类变量（自变量、因变量、无关变量）区分清楚？',record:'小组达成共识后，请记录与质疑员将实验设计方案记录到实验任务单。'},
 {id:4,title:'协作采集证据',prompt:'请领航发言员负责操作虚拟仿真实验，一边操作一边念出实验数据和现象，记录与质疑员对于不正确或不确定的实验数据和现象提出质疑。',record:'小组达成共识后，请记录与质疑员将实验数据和现象记录到实验任务单。'},
 {id:5,title:'协作评估证据并得出结论',prompt:'请领航发言员先提出对实验结论的初步想法，记录与质疑员随后提出质疑：实验结论是否有充分证据？条件是否明确？',record:'小组达成共识后，请记录与质疑员将实验结论记录到实验任务单。'},
 {id:6,title:'反思讨论',prompt:'请领航发言员先分享自己对“实验假设与实验结论是否一致”的判断及理由，记录与质疑员随后提出质疑：这个判断是否指向了具体的表格数据或假设原文？反思是否足够深入？',record:'小组达成共识后，请记录与质疑员将反思讨论内容记录到实验任务单。'}
];

const bulb='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.8.7-1.2 1.3-1.3 2.2h-4.4c-.1-.9-.5-1.5-1.3-2.2Z"/></svg>';
export function createRoleHintButton(){const button=document.createElement('button');button.type='button';button.className='role-hint-button';button.innerHTML=bulb;return button;}
function openHint(hint){
 const dialog=document.createElement('dialog');dialog.className='role-hint-dialog';const head=document.createElement('header'),title=document.createElement('h2'),logo=document.createElement('img');title.textContent=`💡 第 ${hint.id} 环节角色提示`;logo.src='/assets/xiaoke-logo-transparent.png?v=20260917';logo.alt='小科';head.append(title,logo);
 const stage=document.createElement('h3');stage.textContent=hint.title;const prompt=document.createElement('p');prompt.textContent=hint.prompt;const record=document.createElement('p');record.textContent=hint.record;const close=document.createElement('button');close.type='button';close.className='school-button primary';close.textContent='知道了';close.onclick=()=>dialog.close();dialog.append(head,stage,prompt,record,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
export function createRoleHintController(button){
 let current=roleHints[0];
 const enter=id=>{current=roleHints.find(item=>item.id===Number(id))||roleHints[0];button.dataset.attention='true';button.title=`第 ${current.id} 环节角色提示`;button.setAttribute('aria-label',button.title);};
 button.onclick=()=>{button.dataset.attention='false';openHint(current);};enter(1);return {enter};
}
export function createStaticRoleHints(experiment,videoButton){
 const bar=document.createElement('section');bar.className='static-role-hints';const label=document.createElement('label');label.textContent='探究环节';const select=document.createElement('select');select.setAttribute('aria-label','当前探究环节');for(const hint of roleHints){const option=document.createElement('option');option.value=hint.id;option.textContent=`第 ${hint.id} 环节 · ${hint.title}`;select.append(option);}label.append(select);
 const button=createRoleHintButton(),controller=createRoleHintController(button),syncVideo=()=>{if(videoButton)videoButton.hidden=select.value!=='1';};select.onchange=()=>{controller.enter(select.value);syncVideo();};window.addEventListener('science:lesson-change',syncVideo);if(videoButton)bar.append(videoButton);bar.append(label,button);experiment.insertBefore(bar,experiment.querySelector('.frame'));
}
