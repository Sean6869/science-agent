import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {stages} from '../public/content.js';
import {roleGuidance} from '../social-roles.mjs';
test('speech uses authoritative current names, roles and stage text and enforces permissions',async()=>{
 let user={id:'a',role:'student',aiEnabled:true},version=1,leader='a',calls=[];
 const members=[{id:'a',name:'小甲'},{id:'b',name:'小乙'}];
 const store={session:()=>user?{user}:null,groupRoles:id=>{assert.equal(id,'a');return {type:'HL',members,version,guidance:roleGuidance('HL',members,leader,leader==='a'?'b':'a')};}};
 const server=createApp({store,synthesize:async text=>{calls.push(text);return Buffer.from('audio');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
 assert.equal((await fetch(base+'/audio/roles.wav?version=1&user=a&text=override')).status,200);assert.match(calls.at(-1),/请小甲担任领航/);
 assert.equal((await fetch(base+'/audio/roles-preview.wav?version=1&leader=b&challenger=a&user=a')).status,200);assert.match(calls.at(-1),/请小乙担任领航/);
 assert.equal((await fetch(base+'/audio/roles-preview.wav?version=1&leader=a&challenger=a&user=a')).status,400);
 assert.equal((await fetch(base+'/audio/roles.wav?version=1&user=b')).status,409);
 version=2;leader='b';assert.equal((await fetch(base+'/audio/roles.wav?version=1&user=a')).status,409);
 assert.equal((await fetch(base+'/audio/roles.wav?version=2&user=a')).status,200);assert.match(calls.at(-1),/由小乙担任领航/);
 for(const stage of stages){assert.equal((await fetch(base+`/audio/stages/${stage.id}.wav?user=a`)).status,200);assert.equal(calls.at(-1),stage.brief);}
 user.aiEnabled=false;assert.equal((await fetch(base+'/audio/stages/1.wav?user=a')).status,403);
 user=null;assert.equal((await fetch(base+'/audio/roles.wav?version=2&user=a')).status,403);
 assert.equal((await fetch(base+'/audio/stage-1.mp3')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
test('opening role assignment warms both possible role narrations before submission',async()=>{
 const members=[{id:'a',name:'小甲'},{id:'b',name:'小乙'}],texts=[];
 const store={session:()=>({user:{id:'a',role:'student',aiEnabled:true}}),groupRoles:()=>({type:'HL',version:0,members,leaderId:null,challengerId:null,guidance:null})};
 const server=createApp({store,synthesize:async text=>{texts.push(text);return Buffer.from('audio');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/groups/roles`);assert.equal(response.status,200);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(texts.length,2);assert.ok(texts.some(text=>/请小甲担任领航/.test(text)));assert.ok(texts.some(text=>/请小乙担任领航/.test(text)));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('preview speech is available before roles are submitted',async()=>{
 const members=[{id:'a',name:'小甲'},{id:'b',name:'小乙'}],texts=[];
 const store={session:()=>({user:{id:'a',role:'student',aiEnabled:true}}),groupRoles:()=>({type:'LL',version:0,members,leaderId:null,challengerId:null,guidance:null})};
 const server=createApp({store,synthesize:async text=>{texts.push(text);return Buffer.from('audio');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/audio/roles-preview.wav?version=0&leader=a&challenger=b&user=a')).status,200);assert.match(texts.at(-1),/请小甲担任领航/);
  assert.equal((await fetch(base+'/audio/roles.wav?version=0&user=a')).status,409);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
