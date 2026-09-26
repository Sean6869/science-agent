import {lessons,defaultLessonId} from './lessons.mjs';
import {cleanEnvValue,completeStructured} from './deepseek.mjs';
import {answerKnowledge,fallbackKnowledge} from './knowledge-agent.mjs';
import {buildFeedbackMessages,exhaustedFeedback,fallbackFeedback,formatStructuredFeedback,isStructuredFeedbackComplete,MAX_CONTENT_SUBMISSIONS} from './metacognitive-agent.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {openSchoolStore} from './school-store.mjs';
import {createSchoolApi} from './school-api.mjs';
import {assessments} from './public/content.js';
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
 return openSchoolStore(resolve(dataDir||resolve(root,'data'),'school.sqlite'),{username:process.env.ADMIN_USERNAME||process.env.TEACHER_USERNAME,password:process.env.ADMIN_PASSWORD||process.env.TEACHER_PASSWORD});
}
export function createApp({store}={}) {
 if(!store)throw new Error('createApp requires a school store');
 const schoolApi=createSchoolApi(store,{json,body});
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
  if (url.pathname==='/api/config' && req.method==='GET') {
   return json(res,200,{lessons,defaultLessonId});
  }
  if(url.pathname==='/api/assessment'&&req.method==='POST'){
   const p=await body(req);const a=assessments.find(a=>a.id===p?.option);if(!a)return json(res,400,{message:'请选择有效的自评选项'});
   return json(res,200,await recorded(req,'metacognitive',{...p,stage:4,text:a.label+'：'+a.detail},async()=>({content:a.reply,source:'rule'})));
  }
  if(url.pathname==='/api/knowledge' && req.method==='POST') {
   let p;try{p=await body(req);}catch{return json(res,400,{message:'请求格式无效'});}
   if(!p||typeof p.text!=='string'||!p.text.trim()||p.text.length>2000||!Array.isArray(p.history)||p.history.length>8||p.history.some(m=>!m||!['user','agent'].includes(m.role)||typeof m.text!=='string'||m.text.length>2000))return json(res,400,{message:'请输入1至2000字问题'});
   const result=await recorded(req,'knowledge',p,async()=>{try{return await answerKnowledge(p);}catch(error){console.error(`[knowledge] ${error?.name||'Error'}: ${error?.message||'unknown failure'}`);return fallbackKnowledge(p.text);}});
   return json(res,200,result);
  }
  if(url.pathname==='/api/chat' && req.method==='POST') {
   let p; try {p=await body(req);} catch {return json(res,400,{message:'请求格式无效或内容过长'});}
   if(!p||!Number.isInteger(p.stage)||![1,2,3,5,6].includes(p.stage)||!['content','self_assessment'].includes(p.kind)||!Number.isInteger(p.attempt)||p.attempt<0||p.attempt>MAX_CONTENT_SUBMISSIONS+1||(p.kind==='content'&&p.attempt<1)||typeof p.text!=='string'||!p.text.trim()||p.text.length>2000) return json(res,400,{message:'请选择有效阶段并输入1至2000字产出'});
   return json(res,200,await recorded(req,'metacognitive',p,()=>evaluate(p)));
  }
  if(url.pathname.startsWith('/api/')) return json(res,404,{message:'接口不存在'});
  if(req.method!=='GET') return json(res,405,{message:'不支持此请求'});
  const path=resolve(pub,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(pub+sep)) return json(res,403,{message:'禁止访问'});
  try {const file=await readFile(path);const type=extname(path); const immutable=['.png','.mp3']; res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.mp3':'audio/mpeg','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})[type]||'application/octet-stream','cache-control':immutable.includes(type)?'public, max-age=31536000, immutable':'no-cache','x-content-type-options':'nosniff'});res.end(file);} catch {json(res,404,{message:'文件不存在'});}
 } catch(error) {console.error('[request]',error.name);json(res,error.status||(error instanceof SyntaxError?400:500),{message:error.status?error.message:error instanceof SyntaxError?'请求格式无效':'服务暂不可用'});}
});}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const configuredPort=Number(cleanEnvValue(process.env.PORT));
 const port=Number.isInteger(configuredPort)&&configuredPort>0?configuredPort:4173;
 const store=await defaultSchoolStore();
 const server=createApp({store});server.listen(port,()=>console.log(`Science inquiry server ready; DeepSeek ${cleanEnvValue(process.env.DEEPSEEK_API_KEY)?'configured':'not configured'}`));
 process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
}
