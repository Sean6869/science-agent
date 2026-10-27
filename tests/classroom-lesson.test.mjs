import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
import {lessons} from '../lessons.mjs';

test('classroom course restriction persists and preserves records, group setup and free mode',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'class-course-')),file=join(dir,'school.sqlite');let store=await openSchoolStore(file,{username:'admin',password:'Test-admin-password'}),server;
 try{
  const owner=await store.registerTeacher({name:'教师',username:'owner',password:'12345678'}),outsider=await store.registerTeacher({name:'其他',username:'outsider',password:'12345678'});
  const students=[];for(let i=0;i<2;i++)students.push(await store.addStudent({name:'学生'+i,username:'student'+i,password:'12345678',gender:'男',className:'一班',aiEnabled:i===0},owner));
  const other=await store.addStudent({name:'其他班学生',username:'elsewhere',password:'12345678',gender:'女',className:'二班'},owner),classId=students[0].classId;
  for(const s of students)for(const q of quizzes)store.submit(s.id,q.id,Object.fromEntries(q.questions.map(x=>[x.id,x.answer])));
  let group=store.listGroups(owner,classId)[0];store.approveGroups(owner,classId,group.batchId);group=store.listGroups(owner,classId)[0].groups[0];for(const s of students)store.joinGroup(s.id,group.code);
  const [one,two,three]=lessons.map(l=>l.id);
  assert.equal(store.currentLesson(students[0].id),null);
  store.setGroupLearningState(students[0].id,two,4);const turn=store.begin(students[0].id,'knowledge',{lessonId:two,text:'历史内容'});store.finish(turn,{content:'历史回答',source:'rule'});
  assert.throws(()=>store.setCurrentLesson(outsider,classId,one),e=>e.status===403);
  for(const invalid of ['',undefined,'unknown',1])assert.throws(()=>store.setCurrentLesson(owner,classId,invalid));
  store.setCurrentLesson(owner,classId,one);assert.equal(store.currentLesson(other.id),null);assert.equal(store.groupLearningState(students[0].id),null);
  assert.equal(store.stageProgress(owner,classId,two)[0].lastStage,4);assert.equal(store.conversations(students[0].id,10,0,owner).length,1);
  server=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const auth=await store.login('student0','12345678'),staticAuth=await store.login('student1','12345678'),teacher=await store.login('owner','12345678'),foreign=await store.login('outsider','12345678');
  const request=(path,actor=auth,data,method='POST')=>fetch(base+path,{method:data===undefined?'GET':method,headers:{cookie:`xiaoke_session=${actor.token}`,'x-csrf-token':actor.csrf},body:data===undefined?undefined:JSON.stringify(data)});
  for(const actor of [auth,staticAuth]){
   const config=await(await request('/api/config',actor)).json();assert.deepEqual(config.lessons.map(l=>l.id),[one]);assert.equal(config.defaultLessonId,one);assert.equal((await(await request('/api/me',actor)).json()).currentLessonId,one);
   assert.equal((await request('/api/progress',actor,{lessonId:two,stage:5})).status,409);
   assert.equal((await request('/api/group-learning-state',actor,{lessonId:two,stage:5})).status,409);
   assert.equal((await request('/api/progress',actor,{lessonId:one,stage:1})).status,200);
  }
  assert.equal((await request('/api/group-conversations?agent=knowledge&lesson='+two)).status,409);
  assert.equal((await request('/api/knowledge?lesson='+two)).status,409);
  const roles=store.groupRoles(students[0].id,{version:0,leaderId:students[0].id,challengerId:students[1].id});assert.equal(roles.version,1);
  assert.equal((await request('/api/chat',auth,{lessonId:two,stage:1,kind:'content',attempt:1,text:'测试',context:[]})).status,409);
  assert.equal((await request('/api/inquiry-record/clear',auth,{lessonId:two,stage:1})).status,409);
  const endpoint='/api/teacher/classroom-lesson';
  assert.equal((await request(endpoint,foreign,{classId,lessonId:three},'PUT')).status,403);
  assert.equal((await request(endpoint,auth,{classId,lessonId:three},'PUT')).status,403);
  assert.equal((await request(endpoint,teacher,{classId,lessonId:three},'PUT')).status,200);
  assert.equal(store.session(auth.token).user.id,students[0].id);assert.equal(store.listGroups(owner,classId)[0].groups[0].code,group.code);
  const listing=await(await request(endpoint+'?class='+classId,teacher)).json();assert.equal(listing.classes[0].currentLessonId,three);assert.equal(listing.lessons.length,3);
  assert.equal((await request(endpoint+'?class='+classId,foreign)).status,403);
  await new Promise(r=>server.close(r));server=null;store.close();store=await openSchoolStore(file);
  assert.equal(store.currentLesson(students[0].id),three);assert.equal(store.classes(owner).find(c=>c.id===classId).currentLessonId,three);
  store.setCurrentLesson(owner,classId,null);assert.equal(store.currentLesson(students[0].id),null);assert.equal(store.groupLearningState(students[0].id).lessonId,two);
  store.updateStageProgress(students[0].id,two,5);assert.equal(store.ready(students[0].id),true);
 }finally{if(server)await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});}
});
