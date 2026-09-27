import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {openSchoolStore} from '../school-store.mjs';
let store,server,base;
test('role guidance audio is served as a static local asset',async()=>{
 store=await openSchoolStore(':memory:',{username:'teacher',password:'Test-teacher-password'}); server=createApp({store}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/audio/roles/low-low.mp3'); assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),'audio/mpeg'); assert.ok((await response.arrayBuffer()).byteLength>1000);
 const removed=await fetch(base+'/api/roles/audio',{method:'POST'}); assert.equal(removed.status,401);
});
after(()=>new Promise(resolve=>server?.close(()=>{store?.close();resolve();})));
