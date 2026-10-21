import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GROUPING_PRIORITY,GROUPING_STRATEGY_VERSION,planGroups} from '../grouping.mjs';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
import ExcelJS from 'exceljs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('median split prioritizes high-low pairs and avoids low-low pairs',()=>{
 const six=Array.from({length:6},(_,i)=>({id:String(i),username:'s'+i,total:30+i*30,gender:i%2?'女':'男'})),plan=planGroups(six,{random:()=>.3});
 assert.deepEqual(GROUPING_PRIORITY,['HL','HH','LL']);assert.equal(GROUPING_STRATEGY_VERSION,4);assert.equal(plan.strategyVersion,4);
 assert.equal(plan.median,105);assert.deepEqual(plan.counts,{LL:0,HH:0,HL:3});assert.deepEqual(plan.lowRange,[30,90]);assert.deepEqual(plan.highRange,[120,180]);
 assert.equal(new Set(plan.groups.flatMap(g=>g.members.map(m=>m.id))).size,6);assert.ok(plan.groups.every(g=>g.members.length===2));
});
test('median ties are distributed across strata and odd classes receive a virtual partner',()=>{
 const same=planGroups(Array.from({length:5},(_,i)=>({id:String(i),username:'s'+i,total:120,gender:'女'})),{random:()=>.3});
 assert.equal(same.median,120);assert.equal(same.tieCount,5);assert.equal(same.groups.filter(g=>g.type==='VR').length,1);assert.equal(same.groups.find(g=>g.type==='VR').virtual,true);assert.equal(new Set(same.groups.flatMap(g=>g.members.map(m=>m.id))).size,5);
 const ties=planGroups(Array.from({length:6},(_,i)=>({id:String(i),username:'s'+i,total:i<4?100:200,gender:'男'})),{random:()=>.3});assert.equal(ties.median,100);assert.equal(ties.tieCount,4);assert.equal(ties.groups.flatMap(g=>g.members).filter(s=>s.total===100).length,4);
});

test('single-class teacher schema upgrades to multiple classes and approved memberships survive restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xiaoke-groups-')),file=join(dir,'school.sqlite');let store;
 try{
  store=await openSchoolStore(file,{username:'admin',password:'Admin-test-password'});const teacher=await store.registerTeacher({name:'原教师',username:'originalTeacher',password:'Teacher-test-123'});
  const student=await store.addStudent({name:'原学生',username:'old_student',password:'12345678',className:'原班级',gender:'男'},teacher);store.close();store=null;
  const db=new DatabaseSync(file);db.exec(`PRAGMA foreign_keys=OFF;CREATE TABLE old_classes(id TEXT PRIMARY KEY,name TEXT NOT NULL,teacher_id TEXT UNIQUE REFERENCES users(id),created_at TEXT NOT NULL);INSERT INTO old_classes SELECT id,name,teacher_id,created_at FROM classes;DROP TABLE classes;ALTER TABLE old_classes RENAME TO classes;`);db.prepare('UPDATE users SET class_id=?,class_name=? WHERE id=?').run(student.classId,'原班级',teacher.id);db.close();
  store=await openSchoolStore(file);assert.equal(store.classes(teacher)[0].id,student.classId);await store.addStudent({name:'新学生',username:'new_student',password:'12345678',className:'新班级',gender:'女'},teacher);assert.equal(store.classes(teacher).length,2);
  for(const q of quizzes)store.submit(student.id,q.id,Object.fromEntries(q.questions.map(x=>[x.id,x.answer])));const draft=store.listGroups(teacher,student.classId)[0];store.approveGroups(teacher,student.classId,draft.batchId);const approved=store.listGroups(teacher,student.classId)[0],code=approved.groups[0].code;const joined=store.joinGroup(student.id,code);store.close();store=null;
  store=await openSchoolStore(file);assert.equal(store.listGroups(teacher,student.classId)[0].groups[0].code,code);assert.deepEqual(store.groupStatus(student.id),joined);
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});

test('three private tests lead to a draft; only owner review creates codes; membership and exports are scoped',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Admin-test-password'}),server=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,session,p)=>fetch(base+path,{method:p?'POST':'GET',headers:{cookie:`xiaoke_session=${session.token}`,'x-csrf-token':session.csrf},body:p?JSON.stringify(p):undefined});
 const answer=q=>Object.fromEntries(q.questions.map(x=>[x.id,x.answer]));
 try{
  const a=await store.registerTeacher({name:'教师甲',username:'teacherA',password:'Teacher-test-123'}),b=await store.registerTeacher({name:'教师乙',username:'teacherB',password:'Teacher-test-123'}),ta=await store.login(a.username,'Teacher-test-123'),tb=await store.login(b.username,'Teacher-test-123');
  const s1=await store.addStudent({name:'学生甲',username:'one_student',password:'12345678',gender:'男',className:'一班'},a),s2=await store.addStudent({name:'学生乙',username:'two_student',password:'12345678',gender:'男',className:'一班'},a);
  const other=await store.addStudent({name:'学生丙',username:'three_student',password:'12345678',gender:'女',className:'二班'},a);assert.equal(store.classes(a).length,2);
  const outsider=await store.addStudent({name:'学生丁',username:'four_student',password:'12345678',gender:'男',className:'一班'},b);assert.notEqual(outsider.classId,s1.classId);
  const student=await store.login(s1.username,'12345678'),student2=await store.login(s2.username,'12345678'),outside=await store.login(outsider.username,'12345678');
  for(const q of quizzes){const r=await request('/api/quizzes/submit',student,{quizId:q.id,answers:answer(q)});assert.equal(r.status,200);const data=await r.json();assert.equal(data.saved,true);assert.doesNotMatch(JSON.stringify(data),/"(?:score|correct|answers|ratings|total)"/);}
  assert.equal(store.groupStatus(s1.id).status,'waiting');assert.equal(store.listGroups(a,s1.classId)[0].groups.length,0);
  for(const q of quizzes)store.submit(s2.id,q.id,answer(q));const draft=store.listGroups(a,s1.classId)[0];assert.equal(draft.status,'review');assert.ok(draft.groups.every(g=>g.code===null));
  for(const path of ['/api/me','/api/quizzes']){const r=await request(path,student),p=await r.json();assert.doesNotMatch(JSON.stringify(p),/"(?:score|correct|answers|total|threshold|level|type)"/);}
  assert.equal((await request('/api/config',student)).status,403);
  assert.equal((await request('/api/teacher/groups/approve',ta,{})).status,400);
  assert.equal((await request('/api/teacher/groups/approve',tb,{classId:s1.classId,batchId:draft.batchId})).status,403);
  assert.equal((await request('/api/teacher/groups/approve',student,{classId:s1.classId,batchId:draft.batchId})).status,403);
  assert.equal((await request('/api/groups/join',student,{code:'ABCDEFGH'})).status,400);
  const beforeExport=await request('/api/teacher/groups.xlsx?class='+s1.classId,ta),empty=new ExcelJS.Workbook();await empty.xlsx.load(Buffer.from(await beforeExport.arrayBuffer()));assert.equal(empty.worksheets[0].rowCount,1);
  assert.equal(beforeExport.headers.get('content-disposition'),`attachment; filename="student-groups.xlsx"; filename*=UTF-8''${encodeURIComponent('一班_小组码.xlsx')}`);
  assert.equal((await request('/api/teacher/groups/approve',ta,{classId:s1.classId,batchId:draft.batchId})).status,200);
  const approved=store.listGroups(a,s1.classId)[0],code=approved.groups[0].code;assert.match(code,/^[A-F0-9]{8}$/);
  assert.equal((await request('/api/config',student)).status,403);
  assert.equal((await request('/api/groups/join',outside,{code})).status,400);
  const joined=await(await request('/api/groups/join',student,{code})).json();assert.deepEqual(joined.group.members,['学生甲','学生乙']);assert.doesNotMatch(JSON.stringify(joined),/"(?:total|type|level|threshold|score)"/);assert.equal((await request('/api/config',student)).status,200);
  await request('/api/groups/join',student2,{code});assert.equal(store.groupStatus(s2.id).id,joined.group.id);
  const exported=await request('/api/teacher/groups.xlsx?class='+s1.classId,ta),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));assert.equal(book.worksheets[0].getCell('C2').value,code);assert.equal((await request('/api/teacher/groups.xlsx?class='+s1.classId,tb)).status,403);assert.equal((await request('/api/teacher/groups.xlsx',student)).status,403);
  assert.equal(exported.headers.get('content-disposition'),beforeExport.headers.get('content-disposition'));
  store.deleteScores(s2.id,a);assert.equal(store.groupStatus(s1.id).status,'waiting');assert.equal((await request('/api/config',student)).status,403);assert.equal((await request('/api/groups/join',student,{code})).status,400);
  for(const q of quizzes)store.submit(s2.id,q.id,answer(q));assert.equal((await request('/api/teacher/groups/approve',ta,{classId:s1.classId,batchId:draft.batchId})).status,400);
  assert.equal(store.listGroups(a,other.classId)[0].status,'waiting');
 }finally{await new Promise(r=>server.close(r));store.close();}
});
