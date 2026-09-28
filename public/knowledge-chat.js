import {apiFetch} from './school.js';
import {updateMessageList} from './chat-scroll.js';
export function createKnowledgeChat(){
 const KEY=`science-knowledge-draft-v3:${window.schoolUser.id}:${window.schoolGroup.id}`;
 const promptList=document.getElementById('knowledgePromptList'),list=document.getElementById('knowledgeMessages'),draft=document.getElementById('knowledgeDraft'),form=document.getElementById('knowledgeComposer'),send=document.getElementById('knowledgeSend');
 let messages=[],busy=false,groupBusy=false,local=[],syncing=false,activeLessonId=null;
 const quotaNote=document.createElement('p');quotaNote.className='knowledge-welcome';quotaNote.setAttribute('role','status');form.before(quotaNote);
 const draftKey=()=>activeLessonId&&`${KEY}:${activeLessonId}`;
 const saveDraft=()=>{try{if(draftKey())sessionStorage.setItem(draftKey(),draft.value);}catch{}};
 async function refreshQuota(){const lessonId=window.__scienceLesson?.id;if(!lessonId)return;try{const r=await apiFetch('/api/knowledge?lesson='+encodeURIComponent(lessonId));if(!r.ok)return;const q=await r.json();if(lessonId===window.__scienceLesson?.id)quotaNote.textContent=q.limit===3?'本组本课知识答疑：剩余 '+q.remaining+' / 3 次（组员共享）':'';}catch{}}
 function render(forceBottom=false){
  updateMessageList(list,()=>{list.replaceChildren();const shown=[...messages,...local];
   if(!shown.length){const welcome=document.createElement('p');welcome.className='knowledge-welcome';welcome.textContent='我是小科，可以帮你们理解实验中的科学概念。小组成员的提问和回答会显示在这里。';list.append(welcome);}
   for(const m of shown){const node=document.createElement('div');node.className=`msg ${m.role}`;if(m.senderName){const sender=document.createElement('small');sender.className='msg-sender';sender.textContent=m.senderName;node.append(sender);}node.append(document.createTextNode(m.text));if(m.retry){const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.disabled=busy;retry.onclick=()=>request(m.retry);node.append(document.createElement('br'),retry);}list.append(node);}
   if(busy||groupBusy){const pending=document.createElement('p');pending.className='knowledge-welcome';pending.textContent='小科正在解答小组的问题…';list.append(pending);}
  },{forceBottom});
  send.disabled=busy||groupBusy;draft.disabled=busy||groupBusy;for(const button of promptList.querySelectorAll('button'))button.disabled=busy||groupBusy;
 }
 async function sync(){
  const lessonId=window.__scienceLesson?.id;if(!lessonId||syncing)return;syncing=true;
  try{const response=await apiFetch(`/api/group-conversations?agent=knowledge&lesson=${encodeURIComponent(lessonId)}`),result=await response.json();if(!response.ok)throw new Error(result.message);if(lessonId!==window.__scienceLesson?.id)return;const nextBusy=result.conversations.some(row=>row.status==='pending'),nextMessages=result.conversations.flatMap(row=>[{role:'user',text:row.userText,senderName:row.senderName,turnId:row.turnId},...(row.reply?[{role:row.source==='fallback'?'system':'agent',text:row.reply,turnId:row.turnId}]:[])]),ids=new Set(result.conversations.map(row=>row.turnId)),nextLocal=local.filter(message=>message.retry||!ids.has(message.turnId)),changed=nextBusy!==groupBusy||JSON.stringify(nextMessages)!==JSON.stringify(messages)||JSON.stringify(nextLocal)!==JSON.stringify(local);groupBusy=nextBusy;messages=nextMessages;local=nextLocal;if(changed)render();}
  catch{}finally{syncing=false;}
 }
 function setLesson(lesson){saveDraft();activeLessonId=lesson.id||null;try{draft.value=draftKey()?sessionStorage.getItem(draftKey())||'':'';}catch{draft.value='';}promptList.replaceChildren(...(lesson.questions||[]).map(question=>{const button=document.createElement('button');button.type='button';button.textContent=question;button.setAttribute('aria-label',`直接提问：${question}`);button.onclick=()=>{const details=promptList.closest('details');if(details)details.open=false;submitText(question);};return button;}));messages=[];local=[];render(true);void Promise.all([sync(),refreshQuota()]);}
 async function request(turn){
  if(busy)return;busy=true;local=local.filter(message=>message.retry?.id!==turn.id);render();
  try{const response=await apiFetch('/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(130000),body:JSON.stringify({...turn,history:[]})}),result=await response.json();if(!response.ok){if(response.status===429){local.push({role:'system',text:result.message});return;}throw new Error(result.message);}}
  catch{local.push({role:'system',text:'知识答疑暂时无法连接，问题已保留。',retry:turn});}
  finally{busy=false;await sync();render();void refreshQuota();}
 }
 function submitText(value){const text=value.trim();if(!text||busy||groupBusy)return;const turn={id:crypto.randomUUID(),lessonId:window.__scienceLesson?.id,text};local.push({role:'user',text,senderName:window.schoolUser.name,turnId:turn.id});draft.value='';saveDraft();render(true);void request(turn);}
 draft.oninput=saveDraft;form.onsubmit=event=>{event.preventDefault();submitText(draft.value);};draft.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
 window.addEventListener('focus',()=>{void sync();void refreshQuota();});window.addEventListener('science:lesson-change',event=>setLesson(event.detail));
 const timer=setInterval(()=>{if(!document.hidden)void sync();},2000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 render();setLesson(window.__scienceLesson||{questions:[]});
}
