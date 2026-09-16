import {lessons,defaultLessonId} from './lessons.mjs';
import { completeFeedback } from './deepseek.mjs';
import {answerKnowledge} from './knowledge-agent.mjs';
import {buildFeedbackMessages,exhaustedFeedback,fallbackFeedback,formatStructuredFeedback,isStructuredFeedbackComplete,MAX_CONTENT_SUBMISSIONS} from './metacognitive-agent.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
try { process.loadEnvFile(resolve(root, '.env.local')); } catch {}
const pub = resolve(root, 'public');
function json(res, status, data) { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) { let raw = ''; for await (const c of req) { raw += c; if (Buffer.byteLength(raw) > 64000) throw new Error('请求内容过长'); } return JSON.parse(raw); }
async function evaluate(p) {
 const remainingAttempts=Math.max(0,MAX_CONTENT_SUBMISSIONS-p.attempt);
 if(p.kind==='content'&&p.attempt>MAX_CONTENT_SUBMISSIONS)return {content:exhaustedFeedback(),source:'rule',remainingAttempts:0,exhausted:true,complete:true,kind:p.kind};
 const clean={...p,
  context:Array.isArray(p.context)?p.context.filter(x=>x&&Number.isInteger(x.stage)&&typeof x.text==='string').slice(-6).map(x=>({stage:x.stage,text:x.text.slice(0,2000)})):[],
  conversation:Array.isArray(p.conversation)?p.conversation.filter(x=>x&&['user','agent'].includes(x.role)&&typeof x.text==='string').slice(-6).map(x=>({role:x.role,text:x.text.slice(0,1200)})):[],
  latestSubmission:typeof p.latestSubmission==='string'?p.latestSubmission.slice(0,2000):null
 };
 if (!process.env.DEEPSEEK_API_KEY) return {content:fallbackFeedback(clean),source:'fallback',remainingAttempts,exhausted:false,complete:false,kind:p.kind};
 try {
  const raw = await completeFeedback(buildFeedbackMessages(clean),{responseFormat:{type:'json_object'}});
  const content=formatStructuredFeedback(raw,clean);
  return {content,source:'model',remainingAttempts,exhausted:false,complete:isStructuredFeedbackComplete(raw),kind:p.kind};
 } catch { return {content:fallbackFeedback(clean),source:'fallback',remainingAttempts,exhausted:false,complete:false,kind:p.kind}; }
}
export function createApp() { return createServer(async (req,res)=>{
 try {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname==='/api/config' && req.method==='GET') {
   return json(res,200,{lessons,defaultLessonId});
  }
  if(url.pathname==='/api/knowledge' && req.method==='POST') {
   let p;try{p=await body(req);}catch{return json(res,400,{message:'请求格式无效'});}
   if(!p||typeof p.text!=='string'||!p.text.trim()||p.text.length>2000||!Array.isArray(p.history)||p.history.length>8||p.history.some(m=>!m||!['user','agent'].includes(m.role)||typeof m.text!=='string'||m.text.length>2000))return json(res,400,{message:'请输入1至2000字问题'});
   try{return json(res,200,await answerKnowledge(p));}catch{return json(res,503,{message:'知识答疑暂时无法连接，问题已保留，请稍后重试。'});}
  }
  if(url.pathname==='/api/chat' && req.method==='POST') {
   let p; try {p=await body(req);} catch {return json(res,400,{message:'请求格式无效或内容过长'});}
   if(!p||!Number.isInteger(p.stage)||![1,2,3,5,6].includes(p.stage)||!['content','self_assessment'].includes(p.kind)||!Number.isInteger(p.attempt)||p.attempt<0||p.attempt>MAX_CONTENT_SUBMISSIONS+1||(p.kind==='content'&&p.attempt<1)||typeof p.text!=='string'||!p.text.trim()||p.text.length>2000) return json(res,400,{message:'请选择有效阶段并输入1至2000字产出'});
   return json(res,200,await evaluate(p));
  }
  if(url.pathname.startsWith('/api/')) return json(res,404,{message:'接口不存在'});
  if(req.method!=='GET') return json(res,405,{message:'不支持此请求'});
  const path=resolve(pub,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(pub+sep)) return json(res,403,{message:'禁止访问'});
  try {const file=await readFile(path);const type=extname(path); const immutable=['.png','.mp3']; res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.mp3':'audio/mpeg'})[type]||'application/octet-stream','cache-control':immutable.includes(type)?'public, max-age=31536000, immutable':'no-cache','x-content-type-options':'nosniff'});res.end(file);} catch {json(res,404,{message:'文件不存在'});}
 } catch {json(res,500,{message:'服务暂不可用'});}
});}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) createApp().listen(process.env.PORT||4173,()=>console.log('Science inquiry server ready'));
