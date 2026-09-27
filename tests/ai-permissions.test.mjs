import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
test('account AI permissions default on, persist, respect ownership and block all agent APIs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ai-permission-')),file=join(dir,'school.sqlite');
 let store=await openSchoolStore(file,{username:'admin',password:'Test-admin-password'}),server;
 try{
  const {user:admin}=await store.login('admin','Test-admin-password');
  const owner=await store.registerTeacher({name:'教师',username:'teacher',password:'12345678'}),other=await store.registerTeacher({name:'其他',username:'other',password:'12345678'});
  const student=await store.addStudent({name:'学生',username:'student',password:'12345678',gender:'男',className:'一班'},owner);
  assert.equal(student.aiEnabled,true);
  await store.importStudents([{name:'导入甲',gender:'女',className:'二班'}],'one',owner);
  await store.importStudents([{name:'导入乙',gender:'女',className:'三班'}],'two',owner,false);
  assert.equal(store.students(owner).find(s=>s.name==='导入甲').aiEnabled,true);
  assert.equal(store.students(owner).find(s=>s.name==='导入乙').aiEnabled,false);
  assert.throws(()=>store.setAiPermission(other,student.classId,false),e=>e.status===403);
  assert.throws(()=>store.setAiPermission(owner,'',false));
  assert.throws(()=>store.setAiPermission(owner,student.classId,'false'));
  for(const q of quizzes)store.submit(student.id,q.id,Object.fromEntries(q.questions.map(x=>[x.id,x.answer])));
  const batch=store.listGroups(owner,student.classId)[0];store.approveGroups(owner,batch.id,batch.batchId);store.joinGroup(student.id,store.listGroups(owner,student.classId)[0].groups[0].code);
  const auth=await store.login('student','12345678');store.setAiPermission(owner,student.classId,false);
  assert.equal(store.session(auth.token).user.aiEnabled,false);
  server=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,data)=>fetch(base+path,{method:data?'POST':'GET',headers:{cookie:`xiaoke_session=${auth.token}`,'x-csrf-token':auth.csrf},body:data?JSON.stringify(data):undefined});
  for(const path of ['/api/chat','/api/knowledge','/api/assessment','/api/groups/roles']){const r=await request(path,{text:'测试',aiEnabled:true});assert.equal(r.status,403);assert.equal((await r.json()).code,'AI_DISABLED');}
  assert.equal((await request('/api/knowledge?lesson=bending-light')).status,403);
  assert.equal((await request('/api/config')).status,200);
  assert.equal((await request('/api/quizzes')).status,200);
  assert.equal(store.groupStatus(student.id).status,'joined');
  assert.equal(store.conversations(student.id,10,0,owner).length,0);
  assert.equal((await request('/api/teacher/ai-permissions',{classId:student.classId,aiEnabled:true})).status,403);
  store.setAiPermission(admin,student.classId,true);assert.equal((await request('/api/groups/roles')).status,200);
  await store.editStudent(student.id,{...student,password:'',aiEnabled:false},owner);
  assert.equal(store.groupStatus(student.id).status,'joined');
  await new Promise(r=>server.close(r));server=null;store.close();store=await openSchoolStore(file);
  assert.equal((await store.login('student','12345678')).user.aiEnabled,false);
 }finally{if(server)await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});}
});
