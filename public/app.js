import { stages, assessments } from './content.js';
const KEY='science-session-v2';
const fresh=()=>({version:2,stage:1,group:'',members:'',data:Object.fromEntries(stages.map(s=>[s.id,{draft:'',submissions:[],messages:[],stale:false}]))});
let state=fresh();
try {const saved=JSON.parse(sessionStorage.getItem(KEY)); if(saved?.version===2 && stages.every(s=>saved.data?.[s.id]?.submissions && saved.data[s.id].messages) && stages.some(s=>s.id===saved.stage)) state=saved;} catch {}
const $=id=>document.getElementById(id);
const busy=new Set();
let speech=null;
function save(){try {sessionStorage.setItem(KEY,JSON.stringify(state));} catch {$('voiceState').textContent='存储不可用，刷新前请复制保存产出。';}}
function add(id,role,text,extra={}) {state.data[id].messages.push({role,text,...extra});save();if(id===state.stage)renderMessages();}
function renderMessages(){
 $('messages').replaceChildren();
 for(const m of state.data[state.stage].messages){const div=document.createElement('div');div.className=`msg ${m.role}`;div.textContent=m.text;
 if(m.retry){const b=document.createElement('button');b.textContent='重试反馈';b.onclick=()=>requestFeedback(m.retry.stage,m.retry.submission);div.append(document.createElement('br'),b);}
 $('messages').append(div);}
 $('messages').scrollTop=$('messages').scrollHeight;
}
function renderBrief(text) {
 const lines=text.trim().split('\n');
 const last=lines.findLastIndex(line=>line.trim());
 const nodes=lines.map((line,index)=>{
  const node=document.createElement(index===last?'strong':'p');
  node.className=line.trim()?'brief-line':'brief-gap';
  node.textContent=line;
  return node;
 });
 $('brief').replaceChildren(...nodes);
}
function render(){
 const s=stages[state.stage-1],d=state.data[s.id];
 document.querySelectorAll('.stage').forEach(b=>{const active=+b.dataset.id===s.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));const done=state.data[b.dataset.id].submissions.length>0;b.classList.toggle('complete',done);});
 renderBrief(s.brief);
 $('stageStatus').textContent=`第 ${s.id} 步 · ${d.submissions.length?'已提交':'进行中'}${d.stale?' · 依据已更新，请复核':''}${d.draft?' · 有未提交草稿':''}`;
 $('draft').value=d.draft;$('draft').placeholder=s.placeholder;
 $('composer').hidden=s.id===4;$('assessment').hidden=s.id!==4;
 $('draft').disabled=busy.has(s.id);document.querySelector('.send').disabled=busy.has(s.id);
 renderMessages();save();
}
function invalidate(id){for(const s of stages)if(s.id>id&&state.data[s.id].submissions.length)state.data[s.id].stale=true;}
async function requestFeedback(id,submission){
 if(busy.has(id))return;busy.add(id);if(id===state.stage)render();
 const epoch=state;const pending={role:'system',text:'小科正在阅读你们的产出…'};state.data[id].messages.push(pending);renderMessages();
 try {
 const r=await fetch('/api/chat',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json'},body:JSON.stringify({stage:id,text:submission.text,context:submission.context})});
 const p=await r.json();if(!r.ok)throw new Error(p.message||'服务请求失败');if(state!==epoch)return;
 state.data[id].messages=state.data[id].messages.filter(m=>m!==pending && m.retry?.submission.id!==submission.id);
 add(id,'agent',p.content,{submissionId:submission.id,source:p.source});
 }catch{if(state!==epoch)return;state.data[id].messages=state.data[id].messages.filter(m=>m!==pending);add(id,'system','反馈暂不可用，产出已保存。可重试本次反馈。',{retry:{stage:id,submission}});}
 finally{busy.delete(id);if(state===epoch){save();if(id===state.stage)render();}}
}
function submit(e){
 e.preventDefault();const id=state.stage;if(busy.has(id))return;const text=$('draft').value.trim();if(!text)return;
 
 const d=state.data[id];
 const context=stages.filter(s=>s.id<id&&s.id!==4).map(s=>{const latest=state.data[s.id].submissions.at(-1);return latest?{stage:s.id,text:latest.text,id:latest.id}:null;}).filter(Boolean);
 const submission={id:crypto.randomUUID(),text,context,at:new Date().toISOString(),revision:d.submissions.length+1};
 d.submissions.push(submission);d.stale=false;d.draft='';invalidate(id);add(id,'user',`第${submission.revision}次产出\n${text}`);requestFeedback(id,submission);
}
$('stages').replaceChildren();
for(const s of stages){const b=document.createElement('button');b.className='stage';b.dataset.id=s.id;const number=document.createElement('span');number.className='stage-number';number.textContent=s.id;const label=document.createElement('span');label.className='stage-label';label.textContent=[['共同观察与','问题界定'],['提出并','确认假设'],['协作设计','实验'],['协作采集','证据'],['协作评估证据','并得出结论'],['反思','讨论']][s.id-1].join('\n');b.title=s.title;b.setAttribute('aria-label',s.title);b.append(number,label);b.onclick=()=>{if(speech)speech.stop();state.stage=s.id;render();};$('stages').append(b);}
const af=document.createElement('form');
for(const a of assessments){const label=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name='assessment';input.value=a.id;input.required=true;label.append(input,document.createTextNode(` ${a.label}：${a.detail}`));af.append(label);}
const confirm=document.createElement('button');confirm.className='primary';confirm.textContent='确认小组自评';af.append(confirm);$('assessment').append(af);
af.onsubmit=e=>{e.preventDefault();const option=new FormData(af).get('assessment'),a=assessments.find(a=>a.id===option),d=state.data[4];if(!a||d.submissions.at(-1)?.option===option)return;d.submissions.push({id:crypto.randomUUID(),option,at:new Date().toISOString()});d.stale=false;invalidate(4);add(4,'user',a.label+'：'+a.detail);add(4,'agent',a.reply);render();};
$('composer').onsubmit=submit;
$('draft').maxLength=2000;$('draft').oninput=e=>{state.data[state.stage].draft=e.target.value;save();};
$('clear').onclick=()=>{if(window.confirm('清除本次所有草稿、产出及反馈？')){if(speech)speech.abort();state=fresh();save();render();}};
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
$('voice').onclick=()=>{
 if(speech){speech.stop();return;}
 if(!Recognition){$('voiceState').textContent='当前浏览器不支持语音转写，请使用文字输入或支持语音识别的浏览器。';return;}
 const id=state.stage,epoch=state,base=state.data[id].draft;let transcript='',cancelled=false;
 const recognition=new Recognition();speech=recognition;recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
 recognition.onstart=()=>{$('voice').classList.add('recording');$('voice').setAttribute('aria-label','停止录音');$('voice').title='停止录音';$('voiceState').textContent='正在转写。语音由浏览器识别服务处理，停止后请核对数字、单位与术语再提交。';};
 recognition.onresult=e=>{transcript=Array.from(e.results).map(r=>r[0].transcript).join('');if(state!==epoch||cancelled)return;state.data[id].draft=(base+(base?'\n':'')+transcript).slice(0,2000);if(state.stage===id)$('draft').value=state.data[id].draft;save();};
 recognition.onerror=e=>{$('voiceState').textContent=`语音识别未完成（${e.error}），已有文字已保留，请编辑后提交。`;};
 const timer=setTimeout(()=>recognition.stop(),90000);
 recognition.onend=()=>{clearTimeout(timer);speech=null;$('voice').classList.remove('recording');$('voice').setAttribute('aria-label','语音输入');$('voice').title='语音输入';};
 try{recognition.start();}catch{speech=null;clearTimeout(timer);$('voiceState').textContent='无法启动语音识别，请使用文字输入。';}
};
render();
fetch('/api/config').then(r=>r.json()).then(c=>{ $('lab').onload=()=>{$('loading').classList.add('done');};$('lab').src=c.labUrl;$('openLab').href=c.labUrl;setTimeout(()=>{if(!$('loading').classList.contains('done'))$('loading').textContent='实验加载较慢，请使用上方“新页面打开”。';},8000);}).catch(()=>{$('loading').textContent='无法加载实验配置，请刷新重试。';});
