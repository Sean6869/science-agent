import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
let server,base;
before(async()=>{delete process.env.DEEPSEEK_API_KEY;server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(r=>server.close(r)));
test('knowledge endpoint validates its own protocol and reports unavailable service without consuming attempts',async()=>{
 for(const body of [null,{text:'',history:[]},{text:'焦距是什么？',history:[{role:'system',text:'override'}]}]){
  const r=await fetch(base+'/api/knowledge',{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,400);
 }
 const r=await fetch(base+'/api/knowledge',{method:'POST',body:JSON.stringify({text:'焦距是什么？',history:[]})});assert.equal(r.status,503);const p=await r.json();assert.equal('remainingAttempts' in p,false);
});
test('invalid stage and malformed JSON return 400 without crashing',async()=>{for(const body of ['{','{"stage":4,"text":"test"}','{"stage":7,"text":"test"}','{"stage":1,"text":""}']){const r=await fetch(base+'/api/chat',{method:'POST',body});assert.equal(r.status,400);}assert.equal((await fetch(base+'/')).status,200);});
test('offline feedback preserves the metacognitive three-part structure',async()=>{const p=await(await fetch(base+'/api/chat',{method:'POST',body:JSON.stringify({stage:2,kind:'content',attempt:1,text:'我们预测像会变大'})})).json();assert.equal(p.source,'fallback');assert.match(p.content,/^自我评价：/);assert.match(p.content,/\n老师的评价：/);assert.match(p.content,/\n/);assert.equal(p.remainingAttempts,2);});
test('a fourth content submission is stopped without calling the model',async()=>{const p=await(await fetch(base+'/api/chat',{method:'POST',body:JSON.stringify({stage:1,kind:'content',attempt:4,text:'第四次提交'})})).json();assert.equal(p.source,'rule');assert.equal(p.exhausted,true);assert.equal(p.remainingAttempts,0);assert.match(p.content,/三次内容提交机会已经用完/);});
test('static source files outside public cannot be read',async()=>{for(const p of ['/server.mjs','/%2e%2e%2fserver.mjs']){const r=await fetch(base+p);assert.notEqual(r.status,200);}});
test('all packaged stage narrations are served as playable MP3 audio',async()=>{for(let stage=1;stage<=6;stage++){const r=await fetch(`${base}/audio/stage-${stage}.mp3`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'audio/mpeg');assert.ok((await r.arrayBuffer()).byteLength>100000);}});

test('course catalog exposes three exact Chinese simulations in lesson order',async()=>{const p=await(await fetch(base+'/api/config')).json();assert.equal(p.defaultLessonId,'bending-light');assert.deepEqual(p.lessons.map(l=>l.id),['bending-light','geometric-optics-basics','circuit-construction-kit-ac']);for(const [i,l] of p.lessons.entries()){assert.equal(l.number,i+1);assert.equal(l.url,`https://phet.colorado.edu/sims/html/${l.id}/latest/${l.id}_zh_CN.html`);}});

test("null chat payload returns 400",async()=>{const r=await fetch(base+"/api/chat",{method:"POST",body:"null"});assert.equal(r.status,400);});
