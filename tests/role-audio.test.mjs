import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRoleSpeech,splitSpeech,speechHeaders} from '../tencent-speech.mjs';
test('Tencent premium speech preserves text, shares requests and persists valid WAV',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'speech-'));let calls=0;
 const text='合作建议。'.repeat(50),config={voiceType:101026,clips:{single:text}};
 const request=async(url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.VoiceType,101026);assert.equal(p.SampleRate,16000);assert.equal(p.Codec,'pcm');assert.ok(p.Text.length<=140);assert.match(options.headers.Authorization,/TC3-HMAC-SHA256/);return {ok:true,json:async()=>({Response:{Audio:Buffer.alloc(3200).toString('base64')}})};};
 try{const audio=createRoleSpeech({directory,config,env:{TENCENTCLOUD_SECRET_ID:'test',TENCENTCLOUD_SECRET_KEY:'test'},request});const [a,b]=await Promise.all([audio('single'),audio('single')]);assert.deepEqual(a,b);assert.equal(a.toString('ascii',0,4),'RIFF');assert.equal(a.readUInt32LE(40),calls*3200);assert.equal(calls,splitSpeech(text).length);assert.equal(splitSpeech(text).join(''),text);
 const cached=createRoleSpeech({directory,config,env:{},request:()=>assert.fail('cache must not call Tencent')});assert.deepEqual(await cached('single'),a);await assert.rejects(audio('../bad'),e=>e.status===404);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('missing credentials and upstream failures do not become cached audio',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'speech-'));const config={voiceType:101026,clips:{single:'你好'}};
 try{await assert.rejects(createRoleSpeech({directory,config,env:{}})('single'),e=>e.status===503);
 let calls=0;const audio=createRoleSpeech({directory,config,env:{TENCENTCLOUD_SECRET_ID:'test',TENCENTCLOUD_SECRET_KEY:'test'},request:async()=>{calls++;return {ok:true,json:async()=>({Response:{Error:{Code:'AuthFailure'}}})};}});await assert.rejects(audio('single'),/AuthFailure/);await assert.rejects(audio('single'),/AuthFailure/);assert.equal(calls,2);
 assert.equal(speechHeaders('{}','id','key',0)['X-TC-Version'],'2019-08-23');
 }finally{await rm(directory,{recursive:true,force:true});}
});
