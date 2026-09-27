import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
test('static and dynamic accounts share workflows, enforce ownership and only dynamic mode calls the model',async()=>{
 const originalFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;let modelCalls=0;process.env.DEEPSEEK_API_KEY='test-static-routing';globalThis.fetch=(url,options)=>{if(String(url).startsWith('http://127.0.0.1:'))return originalFetch(url,options);modelCalls++;return Promise.resolve(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sentences:['动态回答。','测试模型调用。','请继续观察。']})}}]}));};
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

  assert.equal((await request('/api/groups/roles')).status,200);
  await request('/api/groups/roles',{version:0,leaderId:student.id,challengerId:student.id});
  for(const stage of [1,2,3,5,6])for(const kind of ['content','self_assessment']){
   const r=await request('/api/chat',{stage,kind,attempt:1,text:'我们的观点',aiEnabled:true});assert.equal(r.status,200);const reply=await r.json();assert.equal(reply.source,'static');assert.equal(reply.remainingAttempts,2);assert.doesNotMatch(reply.content,/暂时不可用|恢复后|重试/);
  }
  const knowledge=await(await request('/api/knowledge',{text:'什么是凸透镜的焦距？',history:[],lessonId:'geometric-optics-basics',aiEnabled:true})).json();assert.equal(knowledge.source,'static');assert.match(knowledge.content,/光心到焦点/);
  assert.equal((await request('/api/knowledge?lesson=bending-light')).status,200);
  assert.equal((await request('/api/config')).status,200);assert.equal((await request('/api/quizzes')).status,200);
  const assessment=await(await request('/api/assessment',{option:'sufficient'})).json();assert.ok(assessment.content);
  assert.equal(modelCalls,0);
  assert.equal(store.groupStatus(student.id).status,'joined');assert.ok(store.conversations(student.id,100,0,owner).some(r=>r.source==='static'));
  assert.equal((await request('/api/teacher/ai-permissions',{classId:student.classId,aiEnabled:true})).status,403);
  store.setAiPermission(admin,student.classId,true);
  const dynamic=await(await request('/api/knowledge',{text:'什么是凸透镜的焦距？',history:[],lessonId:'geometric-optics-basics',aiEnabled:false})).json();assert.equal(dynamic.source,'model');assert.equal(modelCalls,1);
  await store.editStudent(student.id,{...student,password:'',aiEnabled:false},owner);
  assert.equal(store.groupStatus(student.id).status,'joined');
  await new Promise(r=>server.close(r));server=null;store.close();store=await openSchoolStore(file);
  assert.equal((await store.login('student','12345678')).user.aiEnabled,false);
 }finally{globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;if(server)await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});}
});
