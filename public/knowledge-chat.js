import {apiFetch} from './school.js';
export function createKnowledgeChat(){
 const KEY=`science-knowledge-v1:${window.schoolUser.id}`;
 const promptList=document.getElementById('knowledgePromptList'),list=document.getElementById('knowledgeMessages'),draft=document.getElementById('knowledgeDraft'),form=document.getElementById('knowledgeComposer'),send=document.getElementById('knowledgeSend');
 let state={draft:'',messages:[]},busy=false;
 function setLesson(lesson){promptList.replaceChildren(...(lesson.questions||[]).map(question=>{const b=document.createElement('button');b.type='button';b.textContent=question;b.setAttribute('aria-label',`直接提问：${question}`);b.onclick=()=>{const details=promptList.closest('details');if(details)details.open=false;submitText(question);};return b;}));}
 window.addEventListener('science:lesson-change',event=>setLesson(event.detail));
 try{const saved=JSON.parse(sessionStorage.getItem(KEY));if(saved&&typeof saved.draft==='string'&&Array.isArray(saved.messages))state=saved;}catch{}
 const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch{}};
 function render(){
  list.replaceChildren();
  if(!state.messages.length){const welcome=document.createElement('p');welcome.className='knowledge-welcome';welcome.textContent='我是小科，可以帮你理解实验中的科学概念。你想了解什么？';list.append(welcome);}
  for(const m of state.messages){const node=document.createElement('div');node.className=`msg ${m.role}`;node.textContent=m.text;if(m.retry){const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.disabled=busy;retry.onclick=()=>request(m.retry);node.append(document.createElement('br'),retry);}list.append(node);}
  if(busy){const pending=document.createElement('p');pending.className='knowledge-welcome';pending.textContent='小科正在解答…';list.append(pending);}
  send.disabled=busy;draft.disabled=busy;for(const button of promptList.querySelectorAll('button'))button.disabled=busy;list.scrollTop=list.scrollHeight;
 }
 async function request(turn){
  if(busy)return;busy=true;state.messages=state.messages.filter(m=>m.retry?.id!==turn.id);render();
  try{const response=await apiFetch('/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(130000),body:JSON.stringify({id:turn.id,lessonId:turn.lessonId,text:turn.text,history:turn.history})});const result=await response.json();if(!response.ok)throw new Error(result.message);state.messages.push({role:result.source==='fallback'?'system':'agent',text:result.content,...(result.source==='fallback'?{retry:turn}:{})});}
  catch{state.messages.push({role:'system',text:'知识答疑暂时无法连接，问题已保留。',retry:turn});}
  finally{busy=false;save();render();}
 }
 function submitText(value){
  const text=value.trim();if(!text||busy)return;
  const turn={id:crypto.randomUUID(),lessonId:window.__scienceLesson?.id,text,history:state.messages.filter(m=>m.role==='user'||m.role==='agent').slice(-8).map(({role,text})=>({role,text}))};
  state.messages.push({role:'user',text});state.draft='';draft.value='';save();void request(turn);
 }
 draft.value=state.draft;draft.oninput=()=>{state.draft=draft.value;save();};
 form.onsubmit=e=>{e.preventDefault();submitText(draft.value);};
 draft.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
 render();
 setLesson(window.__scienceLesson||{questions:[]});
}
