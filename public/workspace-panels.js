export function createWorkspacePanels(){
 const layout=document.querySelector('.layout'),coach=document.getElementById('coachPanel'),toggle=document.getElementById('coachToggle');
 const knowledge=document.getElementById('knowledgePanel'),avatar=document.getElementById('knowledgeToggle');
 function setCoach(open){coach.hidden=!open;layout.classList.toggle('coach-collapsed',!open);toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'收起探究支架 ›':'‹ 展开探究支架';try{sessionStorage.setItem('science-coach-open',String(open));}catch{}}
 function setKnowledge(open){knowledge.hidden=!open;avatar.setAttribute('aria-expanded',String(open));avatar.setAttribute('aria-label',open?'收起知识答疑':'打开知识答疑');if(open)document.getElementById('knowledgeDraft').focus();else avatar.focus();}
 toggle.onclick=()=>setCoach(coach.hidden);
 avatar.onclick=()=>setKnowledge(knowledge.hidden);
 document.getElementById('knowledgeClose').onclick=()=>setKnowledge(false);
 knowledge.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();setKnowledge(false);}});
 try{setCoach(sessionStorage.getItem('science-coach-open')!=='false');}catch{setCoach(true);}
}
