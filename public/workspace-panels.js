export function createWorkspacePanels(){
 const layout=document.querySelector('.layout'),coach=document.getElementById('coachPanel'),toggle=document.getElementById('coachToggle');
 const knowledge=document.getElementById('knowledgePanel'),avatar=document.getElementById('knowledgeToggle'),face=document.getElementById('petFace');
 const clamp=(n,max)=>Math.max(8,Math.min(n,Math.max(8,max)));
 function positionPanel(){
  if(knowledge.hidden)return;
  const r=avatar.getBoundingClientRect(),w=knowledge.offsetWidth,h=knowledge.offsetHeight;
  knowledge.style.left=`${clamp(r.left+w+90<innerWidth?r.right+10:r.left-w-10,innerWidth-w-8)}px`;
  knowledge.style.top=`${clamp(r.bottom-h,innerHeight-h-8)}px`;
 }
 function positionPet(x,y){avatar.style.left=`${clamp(x,innerWidth-avatar.offsetWidth-8)}px`;avatar.style.top=`${clamp(y,innerHeight-avatar.offsetHeight-8)}px`;positionPanel();}
 function setCoach(open){coach.hidden=!open;layout.classList.toggle('coach-collapsed',!open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'收起探究支架':'展开探究支架');toggle.title=open?'收起探究支架':'展开探究支架';try{sessionStorage.setItem('science-coach-open',String(open));}catch{}}
 function setKnowledge(open){knowledge.hidden=!open;avatar.setAttribute('aria-expanded',String(open));avatar.setAttribute('aria-label',open?'收起知识答疑':'打开知识答疑');face.src=open?'/assets/xiaoke-pet-active.png':'/assets/xiaoke-icon-transparent.png';positionPanel();if(open)document.getElementById('knowledgeDraft').focus();else avatar.focus();}
 toggle.onclick=()=>setCoach(coach.hidden);
 let drag=null,suppressClick=false;
 avatar.onpointerdown=e=>{if(e.button!==0)return;const r=avatar.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};suppressClick=false;avatar.setPointerCapture(e.pointerId);};
 avatar.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved){avatar.classList.add('dragging');positionPet(drag.left+dx,drag.top+dy);}};
 const finish=e=>{if(!drag||drag.id!==e.pointerId)return;suppressClick=drag.moved||e.type==='pointercancel';drag=null;avatar.classList.remove('dragging');if(avatar.hasPointerCapture(e.pointerId))avatar.releasePointerCapture(e.pointerId);const r=avatar.getBoundingClientRect();try{sessionStorage.setItem('science-pet-position',JSON.stringify({x:r.left,y:r.top}));}catch{}};
 avatar.onpointerup=finish;avatar.onpointercancel=finish;
 avatar.onclick=e=>{if(suppressClick&&e.detail!==0){suppressClick=false;return;}setKnowledge(knowledge.hidden);};
 document.getElementById('knowledgeClose').onclick=()=>setKnowledge(false);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!knowledge.hidden){e.stopPropagation();setKnowledge(false);}});
 window.addEventListener('resize',()=>{const r=avatar.getBoundingClientRect();positionPet(r.left,r.top);});
 try{setCoach(sessionStorage.getItem('science-coach-open')!=='false');const p=JSON.parse(sessionStorage.getItem('science-pet-position'));if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))positionPet(p.x,p.y);}catch{setCoach(true);}
}
