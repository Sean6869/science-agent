import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {stages} from '../public/content.js';
import {roleGuidance} from '../social-roles.mjs';
test('speech uses authoritative current names, roles and stage text and enforces permissions',async()=>{
 let user={id:'a',role:'student',aiEnabled:true},version=1,leader='a',calls=[];
 const members=[{id:'a',name:'小甲'},{id:'b',name:'小乙'}];
 const store={session:()=>user?{user}:null,groupRoles:id=>{assert.equal(id,'a');return {version,guidance:roleGuidance('HL',members,leader,leader==='a'?'b':'a')};}};
 const server=createApp({store,synthesize:async text=>{calls.push(text);return Buffer.from('audio');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
 assert.equal((await fetch(base+'/audio/roles.wav?version=1&text=override')).status,200);assert.match(calls.at(-1),/请小甲担任领航/);
 version=2;leader='b';assert.equal((await fetch(base+'/audio/roles.wav?version=1')).status,409);
 assert.equal((await fetch(base+'/audio/roles.wav?version=2')).status,200);assert.match(calls.at(-1),/由小乙担任领航/);
 for(const stage of stages){assert.equal((await fetch(base+`/audio/stages/${stage.id}.wav`)).status,200);assert.equal(calls.at(-1),stage.brief);}
 user.aiEnabled=false;assert.equal((await fetch(base+'/audio/stages/1.wav')).status,403);
 user=null;assert.equal((await fetch(base+'/audio/roles.wav?version=2')).status,403);
 assert.equal((await fetch(base+'/audio/stage-1.mp3')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
