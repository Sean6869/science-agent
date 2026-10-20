import {createExperimentWorkspace} from './experiment-workspace.js';
import { stages, assessmentsForLesson } from './content.js';
import { createNarrator } from './narration.js';
import {createWorkspacePanels} from './workspace-panels.js';
import {createKnowledgeChat} from './knowledge-chat.js';
import {advanceTimer,createStageTimers,DEFAULT_STAGE_SECONDS,formatTime,pauseTimer,remainingSeconds,resetTimer,startTimer} from './stage-timer.js';
import {isSelfAssessmentText} from './turn-kind.js';
import {createRoleHintButton,createRoleHintController} from './role-hints.js';
import {createLessonVideo} from './lesson-video.js';
import {apiFetch} from './school.js';
import {updateMessageList} from './chat-scroll.js';
import {formatFeedbackForDisplay} from './feedback-format.js';
import {normalizeSpeechTranscript} from './speech-text.js';
import {shouldShowHalfwayEncouragement} from './stage-milestone.js';
import {createDataReasoningCoach,shouldShowDataReasoningCoach} from './data-reasoning-coach.js';
import {conclusionTasks,formatConclusion} from './conclusion-form.js';
const KEY=`science-session-v4:${window.schoolUser.id}:${window.schoolGroup.id}`;
const LEGACY_KEY=`science-session-v2:${window.schoolUser.id}:${window.schoolGroup.id}`;
const configuredDurations=()=>stages.map((_,index)=>{const seconds=Number(window.schoolStageDurations?.[index]);return Number.isInteger(seconds)&&seconds>=60&&seconds<=3600?seconds:DEFAULT_STAGE_SECONDS;});
const fresh=()=>{const durations=configuredDurations();return {version:5,timerConfig:durations.join(','),stage:1,milestones:{halfwayEncouragementShown:false,dataReasoningCompleted:false},timers:createStageTimers(stages.map(s=>s.id),durations),data:Object.fromEntries(stages.map(s=>[s.id,{draft:'',fields:[],submissions:[],messages:[],stale:false,awaitingSelfAssessment:false}]))};};
let state=fresh();
let activeLessonId=null,legacyState=null;
function normalizeState(saved){
 const validData=[2,3,4,5].includes(saved?.version)&&stages.every(s=>saved.data?.[s.id]?.submissions&&saved.data[s.id].messages)&&stages.some(s=>s.id===saved.stage);
 if(!validData)return fresh();const base=fresh(),savedConfig=saved.timerConfig||stages.map(s=>saved.timers?.[s.id]?.durationSeconds).join(','),preserveTimers=saved.version>=3&&savedConfig===base.timerConfig&&stages.every(s=>saved.timers?.[s.id]);const next={...base,...saved,version:5,timerConfig:base.timerConfig,milestones:{...base.milestones,...saved.milestones},timers:preserveTimers?saved.timers:base.timers};for(const s of stages)next.data[s.id]={...base.data[s.id],...saved.data[s.id]};return next;
}
try{legacyState=JSON.parse(sessionStorage.getItem(LEGACY_KEY));}catch{}
const $=id=>document.getElementById(id);
const busy=new Set();
let sharedRows=[],sharedLoaded=false,sharedSyncing=false,sharedGeneration=0;
let speech=null;
let alarmContext=null;
const collapsedBriefs=new Set();
const narrationButton=$('narrate');
const roleHintButton=createRoleHintButton(),roleHint=createRoleHintController(roleHintButton,{load:async hint=>{const response=await apiFetch(`/api/role-hint?stage=${hint.id}`),result=await response.json();if(!response.ok)throw new Error(result.message);return result.hint;}});$('stageTimer').append(roleHintButton);
const lessonVideo=createLessonVideo({userId:window.schoolUser.id,onWatched:()=>render()});
const dataReasoningCoach=createDataReasoningCoach();
const coachReopenGroup=document.createElement('span'),coachReopenLabel=document.createElement('span'),coachReopen=document.createElement('button');coachReopenGroup.className='coach-reopen-group';coachReopenLabel.className='coach-reopen-label';coachReopenLabel.textContent='科学推理教练';coachReopen.type='button';coachReopen.className='icon-button coach-reopen';coachReopen.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-1.9 3.7-3.7 1.9 1.9-3.7 3.7-1.9Z"/></svg>';coachReopen.title='查看科学推理教练';coachReopen.setAttribute('aria-label','查看科学推理教练');coachReopen.onclick=()=>dataReasoningCoach.open({lessonId:window.__scienceLesson?.id,reopen:state.milestones.dataReasoningCompleted,onComplete:()=>{state.milestones.dataReasoningCompleted=true;save();render();}});coachReopenGroup.append(coachReopenLabel,coachReopen);$('stageTimer').append(coachReopenGroup);
const narrator=createNarrator({onError:()=>{narrationButton.title='语音暂不可用，请点击重试';},onLoading:()=>{narrationButton.title='正在准备语音，点击可停止';},onState:playing=>{
 narrationButton.classList.toggle('playing',playing);
 narrationButton.setAttribute('aria-label',playing?'停止播放开场白':'播放开场白');
 narrationButton.title=playing?'停止播放':'播放开场白';
}});
narrationButton.hidden=!narrator.supported;
const stageAudio=stage=>`/audio/stages/${stage}.wav?user=${encodeURIComponent(window.schoolUser.id)}`;
function lessonKey(lessonId){return `${KEY}:${lessonId}`;}
function loadLessonState(lessonId){
 try{const saved=JSON.parse(sessionStorage.getItem(lessonKey(lessonId)));if(saved)return normalizeState(saved);const previousLesson=sessionStorage.getItem('science-lesson');if(legacyState&&(!previousLesson||previousLesson===lessonId)){const migrated=normalizeState(legacyState);sessionStorage.setItem(lessonKey(lessonId),JSON.stringify(migrated));sessionStorage.removeItem(LEGACY_KEY);legacyState=null;return migrated;}}catch{}
 return fresh();
}
function save(){if(!activeLessonId)return;try {sessionStorage.setItem(lessonKey(activeLessonId),JSON.stringify(state));} catch {$('voiceState').textContent='存储不可用，刷新前请复制保存产出。';}}
function showHalfwayEncouragement(previousStage,nextStage){
 if(!shouldShowHalfwayEncouragement(previousStage,nextStage,state.milestones.halfwayEncouragementShown))return;
 state.milestones.halfwayEncouragementShown=true;save();
 const dialog=$('halfwayEncouragement');if(typeof dialog.showModal==='function')dialog.showModal();else dialog.hidden=false;
}
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
function stopActiveTimer(){if(pauseTimer(state.timers[state.stage]))save();}
function add(id,role,text,extra={},forceBottom=false) {state.data[id].messages.push({role,text,...extra});save();if(id===state.stage)renderMessages(forceBottom);}
const uniqueTurns=rows=>[...new Map(rows.map(row=>[row.turnId,row])).values()];
function sharedMessages(id){return uniqueTurns(sharedRows.filter(row=>row.stage===id)).flatMap(row=>{const retry=row.source==='fallback'||['failed','interrupted'].includes(row.status)?{id:row.turnId,lessonId:row.lessonId,stage:row.stage,kind:row.kind,attempt:1,text:row.userText}:undefined;return [{role:'user',text:row.kind==='self_assessment'?`星级自评\n${row.userText}`:row.userText,senderName:row.senderName,turnId:row.turnId},...(row.reply?[{role:row.source==='fallback'?'system':'agent',text:row.reply,turnId:row.turnId,retry}]:retry?[{role:'system',text:'在线评价暂时未完成，产出已保存。重试本次反馈不会占用提交次数。',turnId:row.turnId,retry}]:[])];});}
async function syncShared(){
 const lessonId=window.__scienceLesson?.id;if(!lessonId||sharedSyncing)return;sharedSyncing=true;const generation=sharedGeneration;
 try{const response=await apiFetch(`/api/group-conversations?agent=metacognitive&lesson=${encodeURIComponent(lessonId)}`),result=await response.json();if(!response.ok)throw new Error(result.message);if(lessonId!==window.__scienceLesson?.id||generation!==sharedGeneration)return;let changed=!sharedLoaded||JSON.stringify(sharedRows)!==JSON.stringify(result.conversations);sharedRows=result.conversations;sharedLoaded=true;
  for(const stage of stages){const d=state.data[stage.id],revision=result.resets?.[stage.id]||null;if(revision&&d.resetRevision!==revision){d.messages=[];d.submissions=[];d.fields=[];d.awaitingSelfAssessment=false;d.resetRevision=revision;invalidate(stage.id);changed=true;}const rows=uniqueTurns(sharedRows.filter(row=>row.stage===stage.id));if(stage.id===4)d.submissions=rows.filter(row=>row.kind==='assessment').map(row=>({id:row.turnId,at:row.createdAt}));else{const content=rows.filter(row=>row.kind==='content'&&row.status==='complete'&&row.source==='model');d.submissions=content.map(row=>({id:row.turnId,text:row.userText,at:row.createdAt}));const last=rows.at(-1);d.awaitingSelfAssessment=stage.id!==5&&!!(last?.status==='complete'&&last.kind==='content'&&!last.complete&&last.source==='model');}}
  if(changed){if(!state.data[5].fields?.length)renderConclusionForm();save();render();}
 }catch{}finally{sharedSyncing=false;}
}
function renderFeedback(div,text){
 text=formatFeedbackForDisplay(text);
 const labels=['自我评价：','老师的评价：'];
 text.split('\n').forEach((line,index)=>{if(line.startsWith('知识答疑提示：')){const guidance=document.createElement('aside'),badge=document.createElement('strong'),copy=document.createElement('span'),button=document.createElement('button'),value=line.slice('知识答疑提示：'.length),concepts=[...value.matchAll(/“([^”]+)”/g)].map(match=>match[1]);guidance.className='concept-guidance';badge.textContent='概念联想';copy.textContent=value;button.type='button';button.textContent='去问小科';button.onclick=()=>window.dispatchEvent(new CustomEvent('science:knowledge-suggestion',{detail:{question:concepts.length>=2?`${concepts[0]}和${concepts[1]}有什么联系？`:''}}));guidance.append(badge,copy,button);div.append(guidance);return;}if(index)div.append(document.createTextNode('\n'));const label=labels.find(value=>line.startsWith(value));if(label){const strong=document.createElement('strong');strong.className='feedback-label';strong.textContent=label;div.append(strong,document.createTextNode(line.slice(label.length)));}else div.append(document.createTextNode(line));});
}
function renderMessages(forceBottom=false){
 const list=$('messages');updateMessageList(list,()=>{list.replaceChildren();
  const server=sharedLoaded?sharedMessages(state.stage):[],ids=new Set(server.map(message=>message.turnId).filter(Boolean)),local=state.data[state.stage].messages.filter(message=>!sharedLoaded||((message.retry||message.local)&&!ids.has(message.turnId||message.retry?.id))),shown=[...server,...local];
  const pending=busy.has(state.stage)||sharedRows.some(row=>row.stage===state.stage&&row.status==='pending');
  for(const m of shown){const div=document.createElement('div');div.className=`msg ${m.role}`;if(m.senderName){const sender=document.createElement('small');sender.className='msg-sender';sender.textContent=m.senderName;div.append(sender);}if(m.role==='agent')renderFeedback(div,m.text);else div.append(document.createTextNode(m.text));
  if(m.retry){const b=document.createElement('button');b.textContent='重试反馈';b.onclick=()=>requestFeedback(m.retry);div.append(document.createElement('br'),b);}
  list.append(div);}
  if(pending&&!shown.some(message=>message.pending)){const status=document.createElement('div');status.className='msg system ai-pending';status.setAttribute('role','status');status.textContent='小科正在评估你们的内容，请稍候…';list.append(status);}
 },{forceBottom});
}
function renderBrief(stage) {
 const lines=stage.brief.trim().split('\n');
 const last=lines.findLastIndex(line=>line.trim());
 const nodes=lines.map((line,index)=>{
  const node=document.createElement(index===last?'strong':'p');
  node.className=line.trim()?'brief-line':'brief-gap';
  if(line.trim().startsWith('举个例子'))node.classList.add('brief-example');
  node.textContent=line;
  return node;
 });
 const brief=$('brief'),content=document.createElement('div'),toggle=document.createElement('button'),collapsed=collapsedBriefs.has(stage.id);
 content.className='brief-content';content.append(...nodes,...(stage.id===1?[lessonVideo.button]:[]));
 toggle.type='button';toggle.className='brief-collapse';toggle.innerHTML='<svg viewBox="0 0 24 12" aria-hidden="true"><path d="m6 8 6-5 6 5"/></svg>';toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'展开教学提示':'折叠教学提示');toggle.title=collapsed?'展开教学提示':'折叠教学提示';
 brief.classList.toggle('collapsed',collapsed);toggle.onclick=()=>{const next=!brief.classList.contains('collapsed');brief.classList.toggle('collapsed',next);if(next)collapsedBriefs.add(stage.id);else collapsedBriefs.delete(stage.id);toggle.setAttribute('aria-expanded',String(!next));toggle.setAttribute('aria-label',next?'展开教学提示':'折叠教学提示');toggle.title=next?'展开教学提示':'折叠教学提示';};
 brief.replaceChildren(content,toggle);
}
function renderConclusionForm(){
 const form=$('conclusionForm'),task=conclusionTasks[window.__scienceLesson?.id];form.replaceChildren();if(!task)return;
 const heading=document.createElement('h3');heading.id='conclusionTitle';heading.textContent=task.title;
 const instruction=document.createElement('p');instruction.textContent=task.instruction;
 form.append(heading,instruction);
 let index=0;const saved=state.data[5].fields||[];
 task.sections.forEach(section=>{const card=document.createElement('section');card.className='conclusion-section';const title=document.createElement('h4');title.textContent=section.title;card.append(title);
  section.fields.forEach(field=>{const position=index++,label=document.createElement('label'),caption=document.createElement('span');caption.textContent=field.label;let control;
   if(field.options){control=document.createElement('select');const empty=document.createElement('option');empty.value='';empty.textContent='请选择';control.append(empty,...field.options.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;return option;}));}
   else{control=document.createElement('input');control.type='text';control.maxLength=200;control.placeholder=field.placeholder;}
   control.required=true;control.name=`conclusion-${position}`;control.value=saved[position]||'';control.oninput=()=>{state.data[5].fields[position]=control.value;save();};label.append(caption,control);card.append(label);
  });form.append(card);
 });
 const actions=document.createElement('div');actions.className='conclusion-actions';const status=document.createElement('small');status.className='conclusion-status';status.setAttribute('role','status');const submitButton=document.createElement('button');submitButton.type='submit';submitButton.className='primary';submitButton.textContent='提交结论给小科评价';actions.append(status,submitButton);form.append(actions);
 form.onsubmit=event=>{event.preventDefault();const fields=[...form.querySelectorAll('input,select')].map(control=>control.value.trim());try{status.textContent='';submit(event,formatConclusion(window.__scienceLesson?.id,fields));}catch(error){status.textContent=error.message;form.reportValidity();}};
}
function render(forceMessagesBottom=false){
 const s=stages[state.stage-1],d=state.data[s.id];
 document.querySelector('.inquiry').classList.toggle('assessment-active',s.id===4);
 document.querySelector('.inquiry').classList.toggle('conclusion-active',s.id===5);
 coachReopenGroup.hidden=s.id!==5;
 document.querySelectorAll('.stage').forEach(b=>{const active=+b.dataset.id===s.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));const done=state.data[b.dataset.id].submissions.length>0;b.classList.toggle('complete',done);});
 renderBrief(s);
 $('stageStatus').textContent=`第 ${s.id} 步 · ${s.id===4?(d.submissions.length?'已完成自评':'进行中'):`内容提交 ${Math.min(d.submissions.length,3)}/3`}${d.awaitingSelfAssessment?' · 等待星级自评':''}${d.stale?' · 依据已更新，请复核':''}${d.draft?' · 有未提交草稿':''}`;
 $('draft').value=d.draft;$('draft').placeholder=s.placeholder;
 $('composer').hidden=s.id===4||s.id===5;$('assessment').hidden=s.id!==4;$('conclusionForm').hidden=s.id!==5;
 const groupBusy=sharedRows.some(row=>row.stage===s.id&&row.status==='pending'),videoRequired=s.id===1&&!lessonVideo.isWatched();$('draft').disabled=busy.has(s.id)||groupBusy||videoRequired;document.querySelector('.send').disabled=busy.has(s.id)||groupBusy||videoRequired;if(videoRequired)$('draft').placeholder='请先观看导入视频，再提出科学问题';
 const conclusionSubmit=$('conclusionForm').querySelector('button[type=submit]');if(conclusionSubmit){conclusionSubmit.disabled=busy.has(s.id)||groupBusy||d.submissions.length>=3;const status=$('conclusionForm').querySelector('.conclusion-status');if(d.submissions.length>=3)status.textContent='本环节三次提交机会已用完，请查看小科的反馈。';}
 renderMessages(forceMessagesBottom);renderTimer();save();
}
function invalidate(id){for(const s of stages)if(s.id>id&&state.data[s.id].submissions.length)state.data[s.id].stale=true;}
async function requestFeedback(turn){
 const id=turn.stage;
 if(busy.has(id))return;busy.add(id);if(id===state.stage)render();
 const epoch=state;state.data[id].messages=state.data[id].messages.filter(m=>m.retry?.id!==turn.id);const pending={role:'system',text:'小科正在评估你们的内容，请稍候…',pending:true};state.data[id].messages.push(pending);renderMessages();
 try {
 const r=await apiFetch('/api/chat',{method:'POST',signal:AbortSignal.timeout(130000),headers:{'content-type':'application/json'},body:JSON.stringify(turn)});
 const p=await r.json();if(!r.ok)throw new Error(p.message||'服务请求失败');if(state!==epoch)return;
 state.data[id].messages=state.data[id].messages.filter(m=>m!==pending);
 if(p.source==='fallback'){
  state.data[id].awaitingSelfAssessment=false;
  add(id,'system','在线评价暂时未完成，产出已保存。请重试本次反馈，不会额外占用提交次数。',{retry:turn});
  return;
 }
 state.data[id].awaitingSelfAssessment=id!==5&&turn.kind==='content'&&!p.exhausted&&!p.complete;
 add(id,'agent',p.content,{turnId:turn.id,source:p.source,kind:turn.kind,local:true});
 }catch{if(state!==epoch)return;state.data[id].messages=state.data[id].messages.filter(m=>m!==pending);add(id,'system','反馈暂不可用，产出已保存。可重试本次反馈。',{retry:turn});}
 finally{busy.delete(id);if(state===epoch){await syncShared();save();if(id===state.stage)render();}}
}
function submit(e,preparedText){
 e.preventDefault();const id=state.stage;if(busy.has(id)||sharedRows.some(row=>row.stage===id&&row.status==='pending'))return;const text=(preparedText??$('draft').value).trim();if(!text||id===5&&state.data[id].submissions.length>=3)return;
 stopActiveTimer();
 const d=state.data[id];
 const kind=id!==5&&d.awaitingSelfAssessment&&isSelfAssessmentText(text)?'self_assessment':'content';
 const attempt=kind==='content'?d.submissions.length+1:d.submissions.length;
 const context=stages.filter(s=>s.id<id&&s.id!==4).map(s=>{const latest=state.data[s.id].submissions.at(-1);return latest?{stage:s.id,text:latest.text,id:latest.id}:null;}).filter(Boolean);
 const turn={id:crypto.randomUUID(),lessonId:window.__scienceLesson?.id,stage:id,kind,attempt,text,context,latestSubmission:kind==='self_assessment'?d.submissions.at(-1)?.text||null:text,conversation:d.messages.filter(m=>['user','agent'].includes(m.role)).slice(-6).map(({role,text})=>({role,text}))};
 if(kind==='content'&&attempt<=3){d.submissions.push({id:turn.id,text,context,at:new Date().toISOString(),revision:attempt});d.stale=false;invalidate(id);}
 d.awaitingSelfAssessment=false;d.draft='';add(id,'user',kind==='self_assessment'?`星级自评\n${text}`:`第${attempt}次内容提交\n${text}`,{turnId:turn.id,senderName:window.schoolUser.name,local:true},true);requestFeedback(turn);
}
$('stages').replaceChildren();
function enterStage(stage,{publish=true}={}){
 if(speech)speech.stop();const previousStage=state.stage,now=Date.now();pauseTimer(state.timers[state.stage],now);state.stage=stage.id;recordStageProgress(window.__scienceLesson?.id,stage.id);startTimer(state.timers[stage.id],now);roleHint.enter(stage.id);narrator.stop();void unlockAlarm();render(true);showHalfwayEncouragement(previousStage,stage.id);
 if(publish)void publishGroupLearningState(window.__scienceLesson?.id,stage.id);
}
function requestStageTransition(stage,options={}){
 const previousStage=state.stage;
 if(shouldShowDataReasoningCoach(previousStage,stage.id,state.milestones.dataReasoningCompleted)){
  if(speech)speech.stop();narrator.stop();pauseTimer(state.timers[previousStage]);save();
  dataReasoningCoach.open({lessonId:window.__scienceLesson?.id,onComplete:()=>{state.milestones.dataReasoningCompleted=true;save();enterStage(stage,options);}});
  return;
 }
 enterStage(stage,options);
}
for(const s of stages){const b=document.createElement('button');b.className='stage';b.dataset.id=s.id;const number=document.createElement('span');number.className='stage-number';number.textContent=s.id;const label=document.createElement('span');label.className='stage-label';label.textContent=[['共同观察与','问题界定'],['提出并','确认假设'],['协作设计','实验'],['协作采集','证据'],['协作评估证据','并得出结论'],['反思','讨论']][s.id-1].join('\n');b.title=s.title;b.setAttribute('aria-label',s.title);b.append(number,label);b.onclick=()=>{
 requestStageTransition(s);
};$('stages').append(b);}
$('timerToggle').onclick=()=>{void unlockAlarm();const timer=state.timers[state.stage];timer.running?pauseTimer(timer):startTimer(timer);save();renderTimer();};
$('timerReset').onclick=()=>{const timer=state.timers[state.stage];resetTimer(timer,timer.durationSeconds);save();renderTimer();};
const af=document.createElement('form');
const title=document.createElement('h3');title.className='assessment-title';title.textContent='小组证据采集反思列表';
const confirm=document.createElement('button');confirm.className='primary';confirm.textContent='确认小组自评';af.append(title,confirm);$('assessment').append(af);
let lessonAssessments=[];
function renderAssessmentOptions(){lessonAssessments=assessmentsForLesson(window.__scienceLesson?.id);af.replaceChildren(title,...lessonAssessments.map(a=>{const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='assessment';input.value=a.id;input.required=true;label.append(input,document.createTextNode(` ${a.label}：${a.detail}`));return label;}),confirm);}
af.onsubmit=async e=>{e.preventDefault();const option=new FormData(af).get('assessment'),a=lessonAssessments.find(item=>item.id===option),d=state.data[4];if(!a||confirm.disabled||d.submissions.at(-1)?.option===option)return;confirm.disabled=true;const turnId=crypto.randomUUID();try{const response=await apiFetch('/api/assessment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:turnId,option,lessonId:window.__scienceLesson?.id})});const result=await response.json();if(!response.ok)throw new Error(result.message);stopActiveTimer();d.submissions.push({id:turnId,option,at:new Date().toISOString()});d.stale=false;invalidate(4);add(4,'user',a.label+'：'+a.detail,{turnId,senderName:window.schoolUser.name,local:true},true);add(4,'agent',result.content,{turnId,local:true});await syncShared();render();}catch{add(4,'system','自评暂未保存，请再次点击确认。');render();}finally{confirm.disabled=false;}};
$('composer').onsubmit=submit;
$('draft').maxLength=2000;$('draft').oninput=e=>{state.data[state.stage].draft=e.target.value;save();};
$('draft').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('clear').onclick=async()=>{const id=state.stage,lessonId=window.__scienceLesson?.id;if(!lessonId||!window.confirm('清空当前环节的小组对话和提交记录？所在环节与倒计时保留，历史记录仍供教师查看。'))return;const button=$('clear');button.disabled=true;try{const response=await apiFetch('/api/inquiry-record/clear',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lessonId,stage:id})}),result=await response.json();if(!response.ok)throw new Error(result.message||'清空失败');if(speech)speech.abort();narrator.stop();sharedGeneration++;sharedRows=sharedRows.filter(row=>row.stage!==id);const d=state.data[id];d.draft='';d.fields=[];d.submissions=[];d.messages=[];d.stale=false;d.awaitingSelfAssessment=false;d.resetRevision=result.revision;invalidate(id);renderConclusionForm();save();render();void syncShared();}catch(error){window.alert(error.message||'清空失败，请重试');}finally{button.disabled=false;}};
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
narrationButton.onclick=()=>narrator.isPlaying()?narrator.stop():narrator.play(stageAudio(state.stage));
$('voice').onclick=()=>{
 narrator.stop();
 if(speech){speech.stop();return;}
 if(!Recognition){$('voiceState').textContent='当前浏览器不支持语音转写，请使用文字输入或支持语音识别的浏览器。';return;}
 const id=state.stage,epoch=state,base=state.data[id].draft;let transcript='',recognitionError=false;
 const recognition=new Recognition();speech=recognition;recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
 const maxTimer=setTimeout(()=>recognition.stop(),90000);
 recognition.onstart=()=>{$('voice').classList.add('recording');$('voice').setAttribute('aria-label','停止录音');$('voice').title='停止录音';$('voiceState').textContent='正在识别…';};
 recognition.onresult=e=>{transcript=normalizeSpeechTranscript(Array.from(e.results).map(r=>r[0].transcript).join(''));if(state===epoch){state.data[id].draft=(base+(base?'\n':'')+transcript).slice(0,2000);if(state.stage===id)$('draft').value=state.data[id].draft;save();}};
 recognition.onerror=e=>{recognitionError=true;$('voiceState').textContent=`语音识别未完成（${e.error}），已有文字已保留，请编辑后提交。`;};
 recognition.onend=()=>{clearTimeout(maxTimer);speech=null;$('voice').classList.remove('recording');$('voice').setAttribute('aria-label','语音输入');$('voice').title='语音输入';if(!recognitionError)$('voiceState').textContent=transcript?'识别完成，请检查文字。':'未识别到语音。';};
 try{recognition.start();}catch{speech=null;clearTimeout(maxTimer);$('voiceState').textContent='无法启动语音识别，请使用文字输入。';}
};
render(true);
createWorkspacePanels();
createKnowledgeChat();
function recordStageProgress(lessonId,stage){if(!lessonId||!Number.isInteger(stage))return;void apiFetch('/api/progress',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lessonId,stage})}).catch(()=>{});}
let pendingGroupLearningState=null,lastGroupLearningUpdate='',groupLearningInitialized=false;
async function publishGroupLearningState(lessonId,stage){if(!lessonId||!Number.isInteger(stage))return;try{const response=await apiFetch('/api/group-learning-state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lessonId,stage})});if(response.ok){const payload=await response.json();lastGroupLearningUpdate=payload.state?.updatedAt||lastGroupLearningUpdate;}}catch{}}
async function syncGroupLearningState(){try{const response=await apiFetch('/api/group-learning-state');if(!response.ok)return;const {state:groupState}=await response.json();groupLearningInitialized=true;if(!groupState){await publishGroupLearningState(activeLessonId,state.stage);return;}if(groupState.updatedAt===lastGroupLearningUpdate)return;lastGroupLearningUpdate=groupState.updatedAt;if(groupState.lessonId!==activeLessonId){pendingGroupLearningState=groupState;window.dispatchEvent(new CustomEvent('science:select-lesson',{detail:{lessonId:groupState.lessonId}}));return;}if(groupState.stage!==state.stage){const target=stages.find(stage=>stage.id===groupState.stage);if(target)requestStageTransition(target,{publish:false});}}catch{}}
window.addEventListener('science:lesson-change',event=>{if(activeLessonId){pauseTimer(state.timers[state.stage]);save();}narrator.stop();activeLessonId=event.detail.id;state=loadLessonState(activeLessonId);const synced=pendingGroupLearningState?.lessonId===activeLessonId?pendingGroupLearningState:null;if(synced){state.stage=synced.stage;pendingGroupLearningState=null;}recordStageProgress(activeLessonId,state.stage);sharedGeneration++;sharedRows=[];sharedLoaded=false;renderAssessmentOptions();renderConclusionForm();roleHint.enter(state.stage);render(true);void syncShared();if(!synced)void (groupLearningInitialized?publishGroupLearningState(activeLessonId,state.stage):syncGroupLearningState());});window.addEventListener('focus',()=>{void syncShared();void syncGroupLearningState();});const sharedTimer=setInterval(()=>{if(!document.hidden){void syncShared();void syncGroupLearningState();}},2000);window.addEventListener('pagehide',()=>clearInterval(sharedTimer),{once:true});
setInterval(()=>{const result=advanceTimer(state.timers[state.stage]);if(result.warning){ringAlarm();save();}if(result.finished){ringAlarm(true);save();}renderTimer();},250);
createExperimentWorkspace();
