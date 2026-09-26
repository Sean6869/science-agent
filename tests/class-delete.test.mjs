import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';

test('only administrator can delete a class and its records without affecting another class',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'}),server=createApp({store});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const admin=await store.login('admin','Test-admin-password');
  await store.registerTeacher({name:'教师',username:'teacher',password:'Test-teacher-password'});
  const teacher=await store.login('teacher','Test-teacher-password');
  const a=await store.addStudent({name:'甲',username:'student_a',password:'12345678',gender:'男',className:'一班'},teacher.user);
  const b=await store.addStudent({name:'乙',username:'student_b',password:'12345678',gender:'女',className:'二班'},teacher.user);
  const session=await store.login('student_a','12345678');
  for(const s of [a,b]){for(const q of quizzes)store.submit(s.id,q.id,Object.fromEntries(q.questions.map(i=>[i.id,i.answer])));store.finish(store.begin(s.id,'knowledge',{text:'测试问题'}),{content:'测试回答',source:'model'});}
  const draft=store.listGroups(admin.user,a.classId)[0];store.approveGroups(admin.user,a.classId,draft.batchId);
  const remove=auth=>fetch(`http://127.0.0.1:${server.address().port}/api/admin/classes/${a.classId}`,{method:'DELETE',headers:auth?{cookie:`xiaoke_session=${auth.token}`,'x-csrf-token':auth.csrf}:{}});
  assert.equal((await remove(null)).status,401);assert.equal((await remove(teacher)).status,403);assert.equal(store.students(admin.user).length,2);
  assert.equal((await remove(admin)).status,200);assert.equal((await remove(admin)).status,404);
  assert.equal(store.session(session.token),null);assert.equal(await store.login('student_a','12345678'),null);
  assert.deepEqual(store.students(admin.user).map(s=>s.id),[b.id]);assert.equal(store.classes(admin.user).length,1);
  assert.equal(store.allScores(admin.user).length,3);assert.equal(store.conversations('',500,0,admin.user).length,1);
  assert.equal(store.listGroups(admin.user).length,1);assert.ok(await store.login('teacher','Test-teacher-password'));
 }finally{await new Promise(r=>server.close(r));store.close();}
});
