import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGroupLearningSync} from '../public/group-learning-sync.js';
import {setImmediate as flush} from 'node:timers/promises';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('rapid stage changes are saved in click order and polling waits for the final write',async()=>{
 const slow=deferred(),writes=[],applied=[];let reads=0,initialized=false;
 const sync=createGroupLearningSync({read:async()=>{reads++;return {stage:3,updatedAt:'last'};},write:async selection=>{writes.push(selection.stage);if(selection.stage===2)await slow.promise;return {...selection,updatedAt:selection.stage===3?'last':'earlier'};},onRead:()=>{initialized=true;},onState:state=>applied.push(state)});
 const first=sync.publish({stage:2}),second=sync.publish({stage:3});await flush();
 assert.deepEqual(writes,[2]);await sync.sync();assert.equal(reads,0);
 slow.resolve();await Promise.all([first,second]);assert.deepEqual(writes,[2,3]);
 await sync.sync();assert.equal(reads,1);assert.equal(initialized,true);assert.deepEqual(applied,[]);
});

test('an old poll cannot send the student back after a newer local selection',async()=>{
 const slow=deferred(),applied=[];
 const sync=createGroupLearningSync({read:()=>slow.promise,write:async selection=>({...selection,updatedAt:'new'}),onState:state=>applied.push(state)});
 const poll=sync.sync();await sync.publish({stage:5});slow.resolve({stage:1,updatedAt:'old'});await poll;
 assert.deepEqual(applied,[]);
});

test('a failed write does not block later changes or updates from the partner',async()=>{
 let calls=0;const applied=[];
 const sync=createGroupLearningSync({read:async()=>({stage:6,updatedAt:'partner'}),write:async selection=>{if(++calls===1)throw new Error('offline');return {...selection,updatedAt:'saved'};},onState:state=>applied.push(state.stage)});
 await sync.publish({stage:2});await sync.publish({stage:3});await sync.sync();assert.equal(calls,2);assert.deepEqual(applied,[6]);
});
