import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {openSchoolStore} from '../school-store.mjs';
let store,server,base;
test('role audio requires Azure configuration and validates access',async()=>{store=await openSchoolStore(':memory:',{username:'teacher',password:'Test-teacher-password'});const auth=await store.login('teacher','Test-teacher-password');server=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;const r=await fetch(base+'/api/roles/audio',{method:'POST',headers:{cookie:'xiaoke_session='+auth.token,'x-csrf-token':auth.csrf},body:JSON.stringify({text:'合作建议'})});assert.equal(r.status,403);});
after(()=>new Promise(r=>server?.close(()=>{store?.close();r();})));
