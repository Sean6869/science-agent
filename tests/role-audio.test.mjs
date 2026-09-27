import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSpeech,splitSpeech,speechHeaders} from '../tencent-speech.mjs';
test('Tencent premium speech preserves text, shares requests and persists valid WAV',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'speech-'));let calls=0;
 const text='合作建议。'.repeat(50);
 const request=async(url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.VoiceType,101026);assert.equal(p.SampleRate,16000);assert.equal(p.Codec,'pcm');assert.ok(p.Text.length<=140);assert.match(options.headers.Authorization,/TC3-HMAC-SHA256/);return {ok:true,json:async()=>({Response:{Audio:Buffer.alloc(3200).toString('base64')}})};};
 try{const audio=createSpeech({directory,env:{TENCENTCLOUD_SECRET_ID:'test',TENCENTCLOUD_SECRET_KEY:'test'},request});const [a,b]=await Promise.all([audio(text),audio(text)]);assert.deepEqual(a,b);assert.equal(a.toString('ascii',0,4),'RIFF');assert.equal(a.readUInt32LE(40),calls*3200);assert.equal(calls,splitSpeech(text).length);assert.equal(splitSpeech(text).join(''),text);
 const cached=createSpeech({directory,env:{},request:()=>assert.fail('cache must not call Tencent')});assert.deepEqual(await cached(text),a);await assert.rejects(audio(''),e=>e.status===400);const previous=calls;await audio('小明担任领航。');assert.equal(calls,previous+1);await audio('小红担任领航。');assert.equal(calls,previous+2);await cached('小明担任领航。');assert.equal(calls,previous+2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('missing credentials and upstream failures do not become cached audio',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'speech-'));const text='你好';
 try{await assert.rejects(createSpeech({directory,env:{}})(text),e=>e.status===503);
 let calls=0;const audio=createSpeech({directory,env:{TENCENTCLOUD_SECRET_ID:'test',TENCENTCLOUD_SECRET_KEY:'test'},request:async()=>{calls++;return {ok:true,json:async()=>({Response:{Error:{Code:'AuthFailure'}}})};}});await assert.rejects(audio(text),/AuthFailure/);await assert.rejects(audio(text),/AuthFailure/);assert.equal(calls,2);
 assert.equal(speechHeaders('{}','id','key',0)['X-TC-Version'],'2019-08-23');
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('long speech segments synthesize concurrently and retain their original order',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'speech-')),pending=[];let bothStarted;const started=new Promise(resolve=>{bothStarted=resolve;});
 const text='甲'.repeat(139)+'。'+'乙'.repeat(139)+'。';
 const request=async(url,options)=>{const segment=JSON.parse(options.body).Text;let release;const wait=new Promise(resolve=>{release=resolve;});pending.push({segment,release});if(pending.length===2)bothStarted();await wait;return {ok:true,json:async()=>({Response:{Audio:Buffer.from(segment.startsWith('甲')?[1,0]:[2,0]).toString('base64')}})};};
 try{
  const result=createSpeech({directory,env:{TENCENTCLOUD_SECRET_ID:'test',TENCENTCLOUD_SECRET_KEY:'test'},request})(text);
  await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('speech requests did not start concurrently')),1000))]);assert.equal(pending.length,2);for(const item of pending.reverse())item.release();
  const wav=await result;assert.equal(wav[44],1);assert.equal(wav.at(-2),2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
