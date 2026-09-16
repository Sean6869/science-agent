const KEY='science-knowledge-v1';
export function createKnowledgeChat(){
 const list=document.getElementById('knowledgeMessages'),draft=document.getElementById('knowledgeDraft'),form=document.getElementById('knowledgeComposer'),send=document.getElementById('knowledgeSend');
 let state={draft:'',messages:[]},busy=false;
 try{const saved=JSON.parse(sessionStorage.getItem(KEY));if(saved&&typeof saved.draft==='string'&&Array.isArray(saved.messages))state=saved;}catch{}
 const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch{}};
 function render(){
  list.replaceChildren();
  if(!state.messages.length){const welcome=document.createElement('p');welcome.className='knowledge-welcome';welcome.textContent='我是小科，可以帮你理解实验中的科学概念。你想了解什么？';list.append(welcome);}
  for(const m of state.messages){const node=document.createElement('div');node.className=`msg ${m.role}`;node.textContent=m.text;if(m.retry){const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.disabled=busy;retry.onclick=()=>request(m.retry);node.append(document.createElement('br'),retry);}list.append(node);}
  if(busy){const pending=document.createElement('p');pending.className='knowledge-welcome';pending.textContent='小科正在解答…';list.append(pending);}
  send.disabled=busy;draft.disabled=busy;list.scrollTop=list.scrollHeight;
 }
 async function request(turn){
  if(busy)return;busy=true;state.messages=state.messages.filter(m=>m.retry?.id!==turn.id);render();
  try{const response=await fetch('/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(65000),body:JSON.stringify({text:turn.text,history:turn.history})});const result=await response.json();if(!response.ok)throw new Error(result.message);state.messages.push({role:'agent',text:result.content});}
  catch{state.messages.push({role:'system',text:'知识答疑暂时无法连接，问题已保留。',retry:turn});}
  finally{busy=false;save();render();}
 }
 draft.value=state.draft;draft.oninput=()=>{state.draft=draft.value;save();};
 form.onsubmit=e=>{e.preventDefault();const text=draft.value.trim();if(!text||busy)return;const turn={id:crypto.randomUUID(),text,history:state.messages.filter(m=>m.role==='user'||m.role==='agent').slice(-8).map(({role,text})=>({role,text}))};state.messages.push({role:'user',text});state.draft='';draft.value='';save();void request(turn);};
 draft.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
 render();
}
