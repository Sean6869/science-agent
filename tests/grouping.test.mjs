import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planGroups} from '../grouping.mjs';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
import ExcelJS from 'exceljs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

function merit(groups,threshold){let same=0;const c={LL:0,HH:0,HL:0};for(const members of groups){if(members.length<2)continue;const [a,b]=members;if(a.gender===b.gender)same++;c[a.total<=threshold?(b.total<=threshold?'LL':'HL'):(b.total<=threshold?'HL':'HH')]++;}const v=Object.values(c);return [-same,Math.max(...v)-Math.min(...v),v.reduce((a,n)=>a+n*n,0)];}
function better(a,b){return !b||a.some((v,i)=>a.slice(0,i).every((x,j)=>x===b[j])&&v<b[i]);}
function* pairings(people,allowSingle=people.length%2===1){if(!people.length){yield [];return;}const [first,...rest]=people;if(allowSingle)for(const tail of pairings(rest,false))yield [[first],...tail];for(let i=0;i<rest.length;i++)for(const tail of pairings(rest.filter((_,j)=>i!==j),allowSingle))yield [[first,rest[i]],...tail];}
test('pairing maximizes same-gender pairs then balances types, compared against exhaustive small classes',()=>{
 for(let n=2;n<=9;n++)for(let male=0;male<=n;male++){
  const people=Array.from({length:n},(_,i)=>({id:String(i),username:'s'+i,total:i*10,gender:i<male?'男':'女'})),plan=planGroups(people);let best;
  for(const pairs of pairings(people)){const value=merit(pairs,plan.threshold);if(better(value,best))best=value;}
  assert.deepEqual(merit(plan.groups.map(g=>g.members),plan.threshold),best,`n=${n}, boys=${male}`);assert.equal(new Set(plan.groups.flatMap(g=>g.members.map(m=>m.id))).size,n);
 }
});
test('class-specific bands keep equal scores together and show unavoidable all-equal or odd cases',()=>{
 const six=Array.from({length:6},(_,i)=>({id:String(i),username:'s'+i,total:30+i*30,gender:'女'}));assert.deepEqual(planGroups(six).counts,{LL:1,HH:1,HL:1});assert.deepEqual(planGroups(six).lowRange,[30,90]);
 const same=planGroups(six.slice(0,5).map(s=>({...s,total:120})));assert.equal(same.highRange,null);assert.equal(same.groups.filter(g=>g.type==='single').length,1);assert.equal(same.groups.filter(g=>g.type==='LL').length,2);
 const ties=planGroups(six.map((s,i)=>({...s,total:i<4?100:200})));const levels=ties.groups.flatMap(g=>g.members).filter(s=>s.total===100).map(s=>s.level);assert.equal(new Set(levels).size,1);
});

test('single-class teacher schema upgrades to multiple classes and approved memberships survive restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xiaoke-groups-')),file=join(dir,'school.sqlite');let store;
 try{
  store=await openSchoolStore(file,{username:'admin',password:'Admin-test-password'});const teacher=await store.registerTeacher({name:'原教师',username:'originalTeacher',password:'Teacher-test-123'});
  const student=await store.addStudent({name:'原学生',username:'old_student',password:'12345678',className:'原班级',gender:'男'},teacher);store.close();store=null;
  const db=new DatabaseSync(file);db.exec(`PRAGMA foreign_keys=OFF;CREATE TABLE old_classes(id TEXT PRIMARY KEY,name TEXT NOT NULL,teacher_id TEXT UNIQUE REFERENCES users(id),created_at TEXT NOT NULL);INSERT INTO old_classes SELECT * FROM classes;DROP TABLE classes;ALTER TABLE old_classes RENAME TO classes;`);db.prepare('UPDATE users SET class_id=?,class_name=? WHERE id=?').run(student.classId,'原班级',teacher.id);db.close();
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
  const beforeExport=await request('/api/teacher/groups.xlsx',ta),empty=new ExcelJS.Workbook();await empty.xlsx.load(Buffer.from(await beforeExport.arrayBuffer()));assert.equal(empty.worksheets[0].rowCount,1);
  assert.equal((await request('/api/teacher/groups/approve',ta,{classId:s1.classId,batchId:draft.batchId})).status,200);
  const approved=store.listGroups(a,s1.classId)[0],code=approved.groups[0].code;assert.match(code,/^[A-F0-9]{8}$/);
  assert.equal((await request('/api/config',student)).status,403);
  assert.equal((await request('/api/groups/join',outside,{code})).status,400);
  const joined=await(await request('/api/groups/join',student,{code})).json();assert.deepEqual(joined.group.members,['学生甲','学生乙']);assert.doesNotMatch(JSON.stringify(joined),/"(?:total|type|level|threshold|score)"/);assert.equal((await request('/api/config',student)).status,200);
  await request('/api/groups/join',student2,{code});assert.equal(store.groupStatus(s2.id).id,joined.group.id);
  const exported=await request('/api/teacher/groups.xlsx',ta),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));assert.equal(book.worksheets[0].getCell('C2').value,code);assert.equal((await request('/api/teacher/groups.xlsx?class='+s1.classId,tb)).status,403);assert.equal((await request('/api/teacher/groups.xlsx',student)).status,403);
  store.deleteScores(s2.id,a);assert.equal(store.groupStatus(s1.id).status,'waiting');assert.equal((await request('/api/config',student)).status,403);assert.equal((await request('/api/groups/join',student,{code})).status,400);
  for(const q of quizzes)store.submit(s2.id,q.id,answer(q));assert.equal((await request('/api/teacher/groups/approve',ta,{classId:s1.classId,batchId:draft.batchId})).status,400);
  assert.equal(store.listGroups(a,other.classId)[0].status,'waiting');
 }finally{await new Promise(r=>server.close(r));store.close();}
});
