import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {openSchoolStore,SESSION_IDLE_MS} from '../school-store.mjs';

let store,server,base,admin,student,classId;
before(async()=>{
 store=await openSchoolStore(':memory:',{username:'timer_admin',password:'Timer-admin-password'});
 admin=await store.login('timer_admin','Timer-admin-password');
 student=await store.addStudent({name:'计时学生',gender:'女',className:'八年级一班',username:'timer_student',password:'12345678'},admin.user);
 classId=student.classId;
 server=createApp({store,synthesize:async()=>Buffer.from('audio')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();});

test('class timer settings are validated, stored and returned to students',async()=>{
 assert.equal(SESSION_IDLE_MS,30*60*1000);
 assert.deepEqual(store.classes(admin.user)[0].stageDurations,[300,300,300,300,300,300]);
 const response=await fetch(base+'/api/teacher/timers',{method:'PUT',headers:{cookie:`xiaoke_session=${admin.token}`,'x-csrf-token':admin.csrf,'content-type':'application/json'},body:JSON.stringify({classId,minutes:[2,3,4,5,6,7]})});
 assert.equal(response.status,200);assert.deepEqual((await response.json()).stageDurations,[120,180,240,300,360,420]);
 const auth=await store.login('timer_student','12345678');
 const me=await fetch(base+'/api/me',{headers:{cookie:`xiaoke_session=${auth.token}`}});
 assert.equal(me.status,200);assert.deepEqual((await me.json()).stageDurations,[120,180,240,300,360,420]);
 const invalid=await fetch(base+'/api/teacher/timers',{method:'PUT',headers:{cookie:`xiaoke_session=${admin.token}`,'x-csrf-token':admin.csrf,'content-type':'application/json'},body:JSON.stringify({classId,minutes:[0,3,4,5,6,7]})});
 assert.equal(invalid.status,400);
});

test('login uses a browser-session cookie and activity refresh remains authenticated',async()=>{
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'timer_admin',password:'Timer-admin-password'})});
 assert.equal(login.status,200);const auth=await login.json(),setCookie=login.headers.get('set-cookie');
 assert.match(setCookie,/xiaoke_session=[a-f0-9]{64}/);assert.doesNotMatch(setCookie,/Max-Age|Expires/i);
 const cookie=setCookie.split(';')[0];
 const activity=await fetch(base+'/api/auth/activity',{method:'POST',headers:{cookie,'x-csrf-token':auth.csrf}});assert.equal(activity.status,200);
 const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,'x-csrf-token':auth.csrf}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/i);
});
