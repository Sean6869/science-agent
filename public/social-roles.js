import {createNarrator} from './narration.js';
export async function setupRoles(api,bar){
 const userId=window.schoolUser.id;
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 const heading=title=>{const head=node('div');head.className='social-role-heading';const logo=node('img');logo.src='/assets/xiaoke-logo-transparent.png?v=20260917';logo.alt='小科';head.append(node('h2',title),logo);return head;};
 let state=await api('/api/groups/roles');
 const display=node('span');display.className='group-role-display';bar.append(display);

 const roleAudio=version=>'/audio/roles.wav?'+new URLSearchParams({version,user:userId});
 function showGuidance(dialog,form,done=()=>{},preparedSource=null,releasePrepared=()=>{}){
  form.replaceChildren(heading('🤝 合作建议'));const text=node('p',state.guidance);text.className='social-guidance';form.append(text);
  const replay=node('button','重新朗读');replay.type='button';replay.className='school-button';
  const status=node('span');status.className='school-note';status.setAttribute('role','status');
  const narrator=createNarrator({onState:playing=>{status.textContent=playing?'正在播放':'';},onLoading:()=>{status.textContent='正在准备语音…';},onError:()=>{status.textContent='语音暂不可用，请点击重新朗读';}});
  const source=roleAudio(state.version);let localSource=null;
  const playPrepared=async()=>{try{localSource=await preparedSource;if(localSource)narrator.play(localSource);else narrator.play(source);}catch{narrator.play(source);}};
  replay.onclick=()=>localSource?narrator.play(localSource):void playPrepared();
  const enter=node('button','开始探究');enter.type='button';enter.className='school-button primary';
  enter.onclick=()=>{narrator.stop();releasePrepared();dialog.close();dialog.remove();done();};
  window.addEventListener('pagehide',()=>{narrator.stop();releasePrepared();},{once:true});
  form.append(replay,status,enter);void playPrepared();
 }
 function render(){
  display.replaceChildren();if(!state.leaderId)return;
  const name=id=>state.members.find(m=>m.id===id)?.name||'';
  display.append(node('span',`领航：${name(state.leaderId)} · 质疑：${name(state.challengerId)}`));
  const advice=node('button','合作建议');advice.type='button';advice.className='school-link';advice.onclick=async()=>{state=await api('/api/groups/roles');render();const dialog=node('dialog'),form=node('div');dialog.className='social-role-dialog';dialog.append(form);document.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());dialog.showModal();showGuidance(dialog,form);};display.append(advice);
  if(state.members.length>1){const swap=node('button','交换角色');swap.className='school-link';swap.type='button';swap.onclick=async()=>{swap.disabled=true;try{state=await api('/api/groups/roles',{swap:true,version:state.version});render();}catch(err){alert(err.message);swap.disabled=false;}};display.append(swap);}
 }
 if(!state.leaderId)await new Promise(resolve=>{
  const dialog=node('dialog');dialog.className='social-role-dialog';const form=node('form');
  form.append(heading('🤝 小组角色分工'),node('p','请明确你们的角色分工：'));
  function select(label,index){const wrap=node('label',label),input=node('select');input.required=true;for(const m of state.members){const o=node('option',m.name);o.value=m.id;input.append(o);}input.value=state.members[Math.min(index,state.members.length-1)].id;wrap.append(input);form.append(wrap);return input;}
  const leader=select('领航发言员',0),challenger=select('记录与质疑员',1);
  let previewGeneration=0,preparedUrl=null,preparedAudio=Promise.resolve(null);
  const releasePrepared=()=>{if(preparedUrl){URL.revokeObjectURL(preparedUrl);preparedUrl=null;}};
  const prepareAudio=()=>{const generation=++previewGeneration,params=new URLSearchParams({version:state.version,leader:leader.value,challenger:challenger.value,user:userId});preparedAudio=fetch('/audio/roles-preview.wav?'+params).then(response=>{if(!response.ok)throw new Error('preview');return response.blob();}).then(blob=>{const url=URL.createObjectURL(blob);if(generation!==previewGeneration){URL.revokeObjectURL(url);return null;}releasePrepared();preparedUrl=url;return url;}).catch(()=>null);};
  if(state.members.length===2){leader.onchange=()=>{challenger.value=state.members.find(m=>m.id!==leader.value).id;prepareAudio();};challenger.onchange=()=>{leader.value=state.members.find(m=>m.id!==challenger.value).id;prepareAudio();};}
  prepareAudio();
  form.append(node('p','领航发言员：带领小组开展科学实验、组织讨论，每次讨论率先提出观点。'),node('p','记录与质疑员：用笔记录小组共识，在领航发言员之后提出观点和质疑。'));
  const error=node('p');error.setAttribute('role','alert');error.className='school-error';const submit=node('button','提交分工');submit.className='school-button primary';form.append(error,submit);dialog.append(form);document.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());dialog.showModal();
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{
   state=await api('/api/groups/roles',{leaderId:leader.value,challengerId:challenger.value,version:state.version});render();
   showGuidance(dialog,form,resolve,preparedAudio,releasePrepared);
  }catch(err){error.textContent=err.message;submit.disabled=false;}};
 });
 render();
 const sync=async()=>{if(document.hidden)return;try{const next=await api('/api/groups/roles');if(next.version!==state.version){state=next;render();}}catch{}};
 window.addEventListener('focus',sync);const timer=setInterval(sync,15000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
