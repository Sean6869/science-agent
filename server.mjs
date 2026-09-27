import {lessons,defaultLessonId} from './lessons.mjs';
import {cleanEnvValue,completeStructured} from './deepseek.mjs';
import {answerKnowledge,fallbackKnowledge} from './knowledge-agent.mjs';
import {buildFeedbackMessages,exhaustedFeedback,fallbackFeedback,formatStructuredFeedback,isStructuredFeedbackComplete,MAX_CONTENT_SUBMISSIONS} from './metacognitive-agent.mjs';
import { createServer } from 'node:http';
import {createSpeech} from './tencent-speech.mjs';


import { readFile,stat } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {openSchoolStore} from './school-store.mjs';
import {createSchoolApi} from './school-api.mjs';
import {roleGuidance} from './social-roles.mjs';
import {assessments,stages} from './public/content.js';
const root = fileURLToPath(new URL('.', import.meta.url));
try { process.loadEnvFile(resolve(root, '.env.local')); } catch {}
const pub = resolve(root, 'public');
function json(res, status, data) { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req,limit=64000) { let raw = ''; for await (const c of req) { raw += c; if (Buffer.byteLength(raw) > limit) throw new Error('请求内容过长'); } return JSON.parse(raw); }
async function evaluate(p) {
 const remainingAttempts=Math.max(0,MAX_CONTENT_SUBMISSIONS-p.attempt);
 if(p.kind==='content'&&p.attempt>MAX_CONTENT_SUBMISSIONS)return {content:exhaustedFeedback(),source:'rule',remainingAttempts:0,exhausted:true,complete:true,kind:p.kind};
 const clean={...p,
  context:Array.isArray(p.context)?p.context.filter(x=>x&&Number.isInteger(x.stage)&&typeof x.text==='string').slice(-6).map(x=>({stage:x.stage,text:x.text.slice(0,2000)})):[],
  conversation:Array.isArray(p.conversation)?p.conversation.filter(x=>x&&['user','agent'].includes(x.role)&&typeof x.text==='string').slice(-6).map(x=>({role:x.role,text:x.text.slice(0,1200)})):[],
  latestSubmission:typeof p.latestSubmission==='string'?p.latestSubmission.slice(0,2000):null
 };
 try {
  const result=await completeStructured(buildFeedbackMessages(clean),raw=>({content:formatStructuredFeedback(raw,clean),complete:isStructuredFeedbackComplete(raw)}));
  return {...result,source:'model',remainingAttempts,exhausted:false,kind:p.kind};
 } catch(error) {console.error('[metacognitive]',error.code||error.name);return {content:fallbackFeedback(clean),source:'fallback',remainingAttempts,exhausted:false,complete:false,kind:p.kind}; }
}
export async function defaultSchoolStore(){
 const dataDir=process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.DATA_DIR;
 if(process.env.RAILWAY_ENVIRONMENT_ID&&!process.env.RAILWAY_VOLUME_MOUNT_PATH)throw new Error('请先为 Railway 服务挂载持久化 Volume，建议挂载到 /data，以保存账号、成绩和对话');
 return openSchoolStore(resolve(dataDir||resolve(root,'data'),'school.sqlite'),{username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});
}
export function createApp({store,synthesize}={}) {
 if(!store)throw new Error('createApp requires a school store');
 const speechAudio=synthesize||createSpeech({directory:resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.DATA_DIR||resolve(root,'data'),'speech-audio')});
 const warming=new Set();
 function warmRoleSpeech(roles){
  const members=roles.members||[],texts=[];
  if(roles.guidance)texts.push(roles.guidance);
  else if(members.length===1)texts.push(roleGuidance(roles.type,members,members[0].id,members[0].id));
  else if(members.length===2){texts.push(roleGuidance(roles.type,members,members[0].id,members[1].id),roleGuidance(roles.type,members,members[1].id,members[0].id));}
  for(const text of texts){if(warming.has(text))continue;warming.add(text);speechAudio(text).catch(error=>console.error('[speech-warmup]',error.code||error.name)).finally(()=>warming.delete(text));}
 }
 const schoolApi=createSchoolApi(store,{json,body,onRoles:warmRoleSpeech});
 async function recorded(req,agent,p,run){
  const safe={...p,id:typeof p.id==='string'?p.id.slice(0,80):undefined,lessonId:lessons.some(l=>l.id===p.lessonId)?p.lessonId:'unknown'};
  const id=store.begin(req.schoolUser.id,agent,safe);
  try{const result=await run();store.finish(id,result);return result;}catch(e){store.fail(id);throw e;}
 }
 return createServer(async (req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','same-origin');
 try {
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true});
  if(await schoolApi(req,res,url))return;
  if((url.pathname==='/audio/roles.wav'||url.pathname==='/audio/roles-preview.wav'||/^\/audio\/stages\/\d+\.wav$/.test(url.pathname))&&req.method==='GET'){
   if(!req.schoolUser||req.schoolUser.role!=='student')return json(res,403,{message:'请使用学生账号'});
   const roles=store.groupRoles(req.schoolUser.id);
   let text;
   if(url.pathname==='/audio/roles-preview.wav'){
    if(url.searchParams.get('version')!==String(roles.version))return json(res,409,{message:'角色分工已变化'});
    const leaderId=url.searchParams.get('leader'),challengerId=url.searchParams.get('challenger');
    if(!roles.members.some(member=>member.id===leaderId)||!roles.members.some(member=>member.id===challengerId)||(roles.members.length>1&&leaderId===challengerId))return json(res,400,{message:'请选择有效的角色分工'});
    text=roleGuidance(roles.type,roles.members,leaderId,challengerId);
   }else if(url.pathname==='/audio/roles.wav'){
    if(!roles.guidance)return json(res,409,{message:'请先完成角色分工'});
    if(url.searchParams.get('version')!==String(roles.version))return json(res,409,{message:'角色分工已变化，请重新打开合作建议'});
    text=roles.guidance;
   }else{
    if(!roles.guidance)return json(res,409,{message:'请先完成角色分工'});
    if(!req.schoolUser.aiEnabled)return json(res,403,{message:'静态组不使用探究支架'});
    text=stages.find(s=>s.id===Number(url.pathname.match(/\d+/)[0]))?.brief;
    if(!text)return json(res,404,{message:'播报内容不存在'});
   }
   try{const audio=await speechAudio(text);res.writeHead(200,{'content-type':'audio/wav','cache-control':url.pathname==='/audio/roles-preview.wav'?'private, max-age=3600':'private, no-store'});res.end(audio);}catch(e){json(res,e.status||502,{message:e.message});}return;
  }
  if (url.pathname==='/api/config' && req.method==='GET') {
   return json(res,200,{lessons,defaultLessonId});
  }
  if(url.pathname==='/api/group-conversations'&&req.method==='GET'){
   if(req.schoolUser?.role!=='student')return json(res,403,{message:'请使用学生账号'});
   const agent=url.searchParams.get('agent'),lessonId=url.searchParams.get('lesson');
   if(!['knowledge','metacognitive'].includes(agent)||!lessons.some(lesson=>lesson.id===lessonId))return json(res,400,{message:'请选择有效的会话'});
   return json(res,200,{conversations:store.groupConversations(req.schoolUser.id,agent,lessonId)});
  }
  if(url.pathname==='/api/assessment'&&req.method==='POST'){
   const p=await body(req);const a=assessments.find(a=>a.id===p?.option);if(!a)return json(res,400,{message:'请选择有效的自评选项'});
   return json(res,200,await recorded(req,'metacognitive',{...p,stage:4,kind:'assessment',text:a.label+'：'+a.detail},async()=>({content:a.reply,source:'rule',complete:true})));
  }
  if(url.pathname==='/api/knowledge' && req.method==='GET') {
   const lessonId=url.searchParams.get('lesson');if(!lessons.some(l=>l.id===lessonId))return json(res,400,{message:'请选择有效课程'});
   return json(res,200,store.knowledgeQuota(req.schoolUser.id,lessonId));
  }
  if(url.pathname==='/api/knowledge' && req.method==='POST') {
   let p;try{p=await body(req);}catch{return json(res,400,{message:'请求格式无效'});}
   if(!p||typeof p.text!=='string'||!p.text.trim()||p.text.length>2000||!Array.isArray(p.history)||p.history.length>8||p.history.some(m=>!m||!['user','agent'].includes(m.role)||typeof m.text!=='string'||m.text.length>2000))return json(res,400,{message:'请输入1至2000字问题'});
   const lessonId=lessons.some(l=>l.id===p.lessonId)?p.lessonId:defaultLessonId;
   const turn={id:typeof p.id==='string'&&p.id.length<=80?p.id:crypto.randomUUID(),text:p.text.trim()};
   if(req.schoolUser.role==='student'&&store.groupHasPending(req.schoolUser.id,'knowledge',lessonId,null,turn.id))return json(res,423,{message:'请等待小组当前问题回答完成'});
   store.knowledgeQuota(req.schoolUser.id,lessonId,turn);
   const shared={...p,...turn,lessonId,history:req.schoolUser.role==='student'?store.groupPromptHistory(req.schoolUser.id,'knowledge',lessonId,null,8):p.history};
   const result=await recorded(req,'knowledge',shared,async()=>{try{return await answerKnowledge(shared);}catch(error){console.error(`[knowledge] ${error?.name||'Error'}: ${error?.message||'unknown failure'}`);return fallbackKnowledge(shared.text);}});
   return json(res,200,{...result,quota:store.knowledgeQuota(req.schoolUser.id,lessonId)});
  }
  if(url.pathname==='/api/chat' && req.method==='POST') {
   let p; try {p=await body(req);} catch {return json(res,400,{message:'请求格式无效或内容过长'});}
   if(!p||!Number.isInteger(p.stage)||![1,2,3,5,6].includes(p.stage)||!['content','self_assessment'].includes(p.kind)||!Number.isInteger(p.attempt)||p.attempt<0||p.attempt>MAX_CONTENT_SUBMISSIONS+1||(p.kind==='content'&&p.attempt<1)||typeof p.text!=='string'||!p.text.trim()||p.text.length>2000) return json(res,400,{message:'请选择有效阶段并输入1至2000字产出'});
   const lessonId=lessons.some(lesson=>lesson.id===p.lessonId)?p.lessonId:defaultLessonId,state=req.schoolUser.role==='student'?store.groupInquiryState(req.schoolUser.id,lessonId,p.stage,p.id):p;
   if(req.schoolUser.role==='student'&&store.groupHasPending(req.schoolUser.id,'metacognitive',lessonId,p.stage,p.id))return json(res,423,{message:'请等待小组当前反馈完成'});
   const shared={...p,...state,lessonId,latestSubmission:p.kind==='self_assessment'?state.latestSubmission:p.text};
   return json(res,200,await recorded(req,'metacognitive',shared,()=>evaluate(shared)));
  }
  if(url.pathname.startsWith('/api/')) return json(res,404,{message:'接口不存在'});
  if(!['GET','HEAD'].includes(req.method)) return json(res,405,{message:'不支持此请求'});
  const path=resolve(pub,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(pub+sep)) return json(res,403,{message:'禁止访问'});
  try {const type=extname(path),contentType=({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.mp4':'video/mp4'})[type]||'application/octet-stream';if(type==='.mp4'){const {size}=await stat(path),match=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);let start=0,end=size-1,status=200;if(req.headers.range){if(!match||(!match[1]&&!match[2])){res.setHeader('Content-Range',`bytes */${size}`);return json(res,416,{message:'视频范围无效'});}if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0){res.setHeader('Content-Range',`bytes */${size}`);return json(res,416,{message:'视频范围无效'});}start=Math.max(0,size-suffix);}else start=Number(match[1]);end=match[1]&&match[2]?Number(match[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size){res.setHeader('Content-Range',`bytes */${size}`);return json(res,416,{message:'视频范围无效'});}end=Math.min(end,size-1);status=206;}const headers={'content-type':contentType,'content-length':end-start+1,'accept-ranges':'bytes','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'};if(status===206)headers['content-range']=`bytes ${start}-${end}/${size}`;res.writeHead(status,headers);if(req.method==='HEAD')return res.end();return createReadStream(path,{start,end}).pipe(res);}const file=await readFile(path);res.writeHead(200,{'content-type':contentType,'content-length':file.length,'cache-control':type==='.png'?'public, max-age=31536000, immutable':'no-cache','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:file);} catch {json(res,404,{message:'文件不存在'});}
 } catch(error) {console.error('[request]',error.name);json(res,error.status||(error instanceof SyntaxError?400:500),{message:error.status?error.message:error instanceof SyntaxError?'请求格式无效':'服务暂不可用'});}
});}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const configuredPort=Number(cleanEnvValue(process.env.PORT));
 const port=Number.isInteger(configuredPort)&&configuredPort>0?configuredPort:4173;
 const store=await defaultSchoolStore();
 const server=createApp({store});server.listen(port,()=>console.log(`Science inquiry server ready; DeepSeek ${cleanEnvValue(process.env.DEEPSEEK_API_KEY)?'configured':'not configured'}`));
 process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
}
