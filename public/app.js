import {createExperimentWorkspace} from './experiment-workspace.js';
import { stages, assessments } from './content.js';
import { createNarrator } from './narration.js';
import {createWorkspacePanels} from './workspace-panels.js';
import {createKnowledgeChat} from './knowledge-chat.js';
import {advanceTimer,createStageTimers,formatTime,pauseTimer,remainingSeconds,resetTimer,startTimer} from './stage-timer.js';
import {isSelfAssessmentText} from './turn-kind.js';
const KEY='science-session-v2';
const fresh=()=>({version:3,stage:1,timers:createStageTimers(stages.map(s=>s.id)),data:Object.fromEntries(stages.map(s=>[s.id,{draft:'',submissions:[],messages:[],stale:false,awaitingSelfAssessment:false}]))});
let state=fresh();
try {
 const saved=JSON.parse(sessionStorage.getItem(KEY));
 const validData=(saved?.version===2||saved?.version===3)&&stages.every(s=>saved.data?.[s.id]?.submissions&&saved.data[s.id].messages)&&stages.some(s=>s.id===saved.stage);
 if(validData){const base=fresh();state={...base,...saved,version:3,timers:saved.version===3&&stages.every(s=>saved.timers?.[s.id])?saved.timers:base.timers};for(const s of stages)state.data[s.id]={...base.data[s.id],...saved.data[s.id]};}
} catch {}
const $=id=>document.getElementById(id);
const busy=new Set();
let speech=null;
let alarmContext=null;
const narrationButton=$('narrate');
const narrator=createNarrator({onState:playing=>{
 narrationButton.classList.toggle('playing',playing);
 narrationButton.setAttribute('aria-label',playing?'停止播放开场白':'播放开场白');
 narrationButton.title=playing?'停止播放':'播放开场白';
}});
narrationButton.hidden=!narrator.supported;
function save(){try {sessionStorage.setItem(KEY,JSON.stringify(state));} catch {$('voiceState').textContent='存储不可用，刷新前请复制保存产出。';}}
function unlockAlarm(){
 const AudioContext=window.AudioContext||window.webkitAudioContext;
 if(!AudioContext)return Promise.resolve(false);
 if(!alarmContext)alarmContext=new AudioContext();
 return alarmContext.state==='suspended'?alarmContext.resume().then(()=>true).catch(()=>false):Promise.resolve(true);
}
function ringAlarm(final=false){
 void unlockAlarm().then(ready=>{
  if(!ready||alarmContext.state!=='running')return;
  const now=alarmContext.currentTime;
  const notes=final?[0,.18,.36,.72,.9,1.08]:[0,.22,.44];
  notes.forEach((delay,index)=>{
   const oscillator=alarmContext.createOscillator(),gain=alarmContext.createGain();
   oscillator.type='sine';oscillator.frequency.value=final&&index>=3?660:880;
   gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(.14,now+delay+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.14);
   oscillator.connect(gain).connect(alarmContext.destination);oscillator.start(now+delay);oscillator.stop(now+delay+.16);
  });
 });
}
function renderTimer(now=Date.now()){
 const timer=state.timers[state.stage],remaining=remainingSeconds(timer,now),complete=state.data[state.stage].submissions.length>0;
 $('timerLabel').textContent=`第 ${state.stage} 环节`;$('timerRemaining').textContent=formatTime(remaining);
 const timerState=remaining===0?'expired':timer.running&&remaining<=60?'warning':timer.running?'running':remaining<timer.durationSeconds?'paused':'idle';
 $('stageTimer').dataset.state=timerState;
 $('timerHint').textContent=complete?'已完成':remaining===0?'时间到':timer.running?(remaining<=60?'最后 1 分钟':'进行中'):remaining<timer.durationSeconds?'已暂停':'点击环节开始';
 $('timerToggle').disabled=remaining===0;
 const action=timer.running?'暂停倒计时':'开始倒计时';$('timerToggle').setAttribute('aria-label',action);$('timerToggle').title=action;
}
function renderTimerFields(){
 $('timerFields').replaceChildren(...stages.map(s=>{
  const label=document.createElement('label');label.className='timer-field';
  const name=document.createElement('span');name.textContent=`${s.id}. ${s.title}`;name.title=s.title;
  const input=document.createElement('input');input.type='number';input.name=`stage-${s.id}`;input.min='1';input.max='60';input.required=true;input.value=String(Math.round(state.timers[s.id].durationSeconds/60));input.setAttribute('aria-label',`${s.title}时长（分钟）`);
  const unit=document.createElement('span');unit.className='timer-unit';unit.textContent='分钟';label.append(name,input,unit);return label;
 }));
}
function stopActiveTimer(){if(pauseTimer(state.timers[state.stage]))save();}
function add(id,role,text,extra={}) {state.data[id].messages.push({role,text,...extra});save();if(id===state.stage)renderMessages();}
function renderFeedback(div,text){
 const labels=['自我评价：','老师的评价：'];
 text.split('\n').forEach((line,index)=>{if(index)div.append(document.createTextNode('\n'));const label=labels.find(value=>line.startsWith(value));if(label){const strong=document.createElement('strong');strong.className='feedback-label';strong.textContent=label;div.append(strong,document.createTextNode(line.slice(label.length)));}else div.append(document.createTextNode(line));});
}
function renderMessages(){
 $('messages').replaceChildren();
 for(const m of state.data[state.stage].messages){const div=document.createElement('div');div.className=`msg ${m.role}`;if(m.role==='agent')renderFeedback(div,m.text);else div.textContent=m.text;
 if(m.retry){const b=document.createElement('button');b.textContent='重试反馈';b.onclick=()=>requestFeedback(m.retry);div.append(document.createElement('br'),b);}
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
 $('brief').replaceChildren(narrationButton,...nodes);
}
function render(){
 const s=stages[state.stage-1],d=state.data[s.id];
 document.querySelectorAll('.stage').forEach(b=>{const active=+b.dataset.id===s.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));const done=state.data[b.dataset.id].submissions.length>0;b.classList.toggle('complete',done);});
 renderBrief(s.brief);
 $('stageStatus').textContent=`第 ${s.id} 步 · ${s.id===4?(d.submissions.length?'已完成自评':'进行中'):`内容提交 ${Math.min(d.submissions.length,3)}/3`}${d.awaitingSelfAssessment?' · 等待星级自评':''}${d.stale?' · 依据已更新，请复核':''}${d.draft?' · 有未提交草稿':''}`;
 $('draft').value=d.draft;$('draft').placeholder=s.placeholder;
 $('composer').hidden=s.id===4;$('assessment').hidden=s.id!==4;
 $('draft').disabled=busy.has(s.id);document.querySelector('.send').disabled=busy.has(s.id);
 renderMessages();renderTimer();save();
}
function invalidate(id){for(const s of stages)if(s.id>id&&state.data[s.id].submissions.length)state.data[s.id].stale=true;}
async function requestFeedback(turn){
 const id=turn.stage;
 if(busy.has(id))return;busy.add(id);if(id===state.stage)render();
 const epoch=state;state.data[id].messages=state.data[id].messages.filter(m=>m.retry!==turn);const pending={role:'system',text:'小科正在对照量规阅读你们的产出…'};state.data[id].messages.push(pending);renderMessages();
 try {
 const r=await fetch('/api/chat',{method:'POST',signal:AbortSignal.timeout(65000),headers:{'content-type':'application/json'},body:JSON.stringify(turn)});
 const p=await r.json();if(!r.ok)throw new Error(p.message||'服务请求失败');if(state!==epoch)return;
 state.data[id].messages=state.data[id].messages.filter(m=>m!==pending);state.data[id].awaitingSelfAssessment=turn.kind==='content'&&!p.exhausted&&!p.complete;
 add(id,'agent',p.content,{turnId:turn.id,source:p.source,kind:turn.kind});
 }catch{if(state!==epoch)return;state.data[id].messages=state.data[id].messages.filter(m=>m!==pending);add(id,'system','反馈暂不可用，产出已保存。可重试本次反馈。',{retry:turn});}
 finally{busy.delete(id);if(state===epoch){save();if(id===state.stage)render();}}
}
function submit(e){
 e.preventDefault();const id=state.stage;if(busy.has(id))return;const text=$('draft').value.trim();if(!text)return;
 stopActiveTimer();
 const d=state.data[id];
 const kind=d.awaitingSelfAssessment&&isSelfAssessmentText(text)?'self_assessment':'content';
 const attempt=kind==='content'?d.submissions.length+1:d.submissions.length;
 const context=stages.filter(s=>s.id<id&&s.id!==4).map(s=>{const latest=state.data[s.id].submissions.at(-1);return latest?{stage:s.id,text:latest.text,id:latest.id}:null;}).filter(Boolean);
 const turn={id:crypto.randomUUID(),stage:id,kind,attempt,text,context,latestSubmission:kind==='self_assessment'?d.submissions.at(-1)?.text||null:text,conversation:d.messages.filter(m=>['user','agent'].includes(m.role)).slice(-6).map(({role,text})=>({role,text}))};
 if(kind==='content'&&attempt<=3){d.submissions.push({id:turn.id,text,context,at:new Date().toISOString(),revision:attempt});d.stale=false;invalidate(id);}
 d.awaitingSelfAssessment=false;d.draft='';add(id,'user',kind==='self_assessment'?`星级自评\n${text}`:`第${attempt}次内容提交\n${text}`);requestFeedback(turn);
}
$('stages').replaceChildren();
for(const s of stages){const b=document.createElement('button');b.className='stage';b.dataset.id=s.id;const number=document.createElement('span');number.className='stage-number';number.textContent=s.id;const label=document.createElement('span');label.className='stage-label';label.textContent=[['共同观察与','问题界定'],['提出并','确认假设'],['协作设计','实验'],['协作采集','证据'],['协作评估证据','并得出结论'],['反思','讨论']][s.id-1].join('\n');b.title=s.title;b.setAttribute('aria-label',s.title);b.append(number,label);b.onclick=()=>{
 if(speech)speech.stop();const now=Date.now();pauseTimer(state.timers[state.stage],now);state.stage=s.id;startTimer(state.timers[s.id],now);void unlockAlarm();render();narrator.play(`/audio/stage-${s.id}.mp3`);
};$('stages').append(b);}
renderTimerFields();
$('timerToggle').onclick=()=>{void unlockAlarm();const timer=state.timers[state.stage];timer.running?pauseTimer(timer):startTimer(timer);save();renderTimer();};
$('timerReset').onclick=()=>{const timer=state.timers[state.stage];resetTimer(timer,timer.durationSeconds);save();renderTimer();};
$('timerSettingsToggle').onclick=()=>{const panel=$('timerSettingsPanel'),opening=panel.hidden;panel.hidden=!opening;$('timerSettingsToggle').setAttribute('aria-expanded',String(opening));$('timerSettingsToggle').textContent=opening?'收起时间设置⌃':'设置各环节时间⌄';};
$('timerSettingsPanel').onsubmit=e=>{e.preventDefault();const form=new FormData(e.currentTarget),durations=stages.map(s=>({id:s.id,minutes:Number(form.get(`stage-${s.id}`))}));if(durations.some(x=>!Number.isInteger(x.minutes)||x.minutes<1||x.minutes>60))return;for(const item of durations)resetTimer(state.timers[item.id],item.minutes*60);e.currentTarget.hidden=true;$('timerSettingsToggle').setAttribute('aria-expanded','false');$('timerSettingsToggle').textContent='设置各环节时间⌄';save();renderTimer();};
const af=document.createElement('form');
for(const a of assessments){const label=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name='assessment';input.value=a.id;input.required=true;label.append(input,document.createTextNode(` ${a.label}：${a.detail}`));af.append(label);}
const confirm=document.createElement('button');confirm.className='primary';confirm.textContent='确认小组自评';af.append(confirm);$('assessment').append(af);
af.onsubmit=e=>{e.preventDefault();const option=new FormData(af).get('assessment'),a=assessments.find(a=>a.id===option),d=state.data[4];if(!a||d.submissions.at(-1)?.option===option)return;stopActiveTimer();d.submissions.push({id:crypto.randomUUID(),option,at:new Date().toISOString()});d.stale=false;invalidate(4);add(4,'user',a.label+'：'+a.detail);add(4,'agent',a.reply);render();};
$('composer').onsubmit=submit;
$('draft').maxLength=2000;$('draft').oninput=e=>{state.data[state.stage].draft=e.target.value;save();};
$('draft').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('clear').onclick=()=>{if(window.confirm('清除本次所有草稿、产出、反馈及倒计时设置？')){if(speech)speech.abort();narrator.stop();state=fresh();renderTimerFields();$('timerSettingsPanel').hidden=true;$('timerSettingsToggle').setAttribute('aria-expanded','false');$('timerSettingsToggle').textContent='设置各环节时间⌄';save();render();}};
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
narrationButton.onclick=()=>narrator.isPlaying()?narrator.stop():narrator.play(`/audio/stage-${state.stage}.mp3`);
$('voice').onclick=()=>{
 narrator.stop();
 if(speech){speech.stop();return;}
 if(!Recognition){$('voiceState').textContent='当前浏览器不支持语音转写，请使用文字输入或支持语音识别的浏览器。';return;}
 const id=state.stage,epoch=state,base=state.data[id].draft;let transcript='';
 const recognition=new Recognition();speech=recognition;recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
 recognition.onstart=()=>{$('voice').classList.add('recording');$('voice').setAttribute('aria-label','停止录音');$('voice').title='停止录音';$('voiceState').textContent='正在转写。语音由浏览器识别服务处理，停止后请核对数字、单位与术语再提交。';};
 recognition.onresult=e=>{transcript=Array.from(e.results).map(r=>r[0].transcript).join('');if(state!==epoch)return;state.data[id].draft=(base+(base?'\n':'')+transcript).slice(0,2000);if(state.stage===id)$('draft').value=state.data[id].draft;save();};
 recognition.onerror=e=>{$('voiceState').textContent=`语音识别未完成（${e.error}），已有文字已保留，请编辑后提交。`;};
 const timer=setTimeout(()=>recognition.stop(),90000);
 recognition.onend=()=>{clearTimeout(timer);speech=null;$('voice').classList.remove('recording');$('voice').setAttribute('aria-label','语音输入');$('voice').title='语音输入';};
 try{recognition.start();}catch{speech=null;clearTimeout(timer);$('voiceState').textContent='无法启动语音识别，请使用文字输入。';}
};
render();
createWorkspacePanels();
createKnowledgeChat();
setInterval(()=>{const result=advanceTimer(state.timers[state.stage]);if(result.warning){ringAlarm();save();}if(result.finished){ringAlarm(true);save();}renderTimer();},250);
setTimeout(()=>narrator.play(`/audio/stage-${state.stage}.mp3`),150);
createExperimentWorkspace();
