import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import {openSchoolStore,passwordHash,quizzes} from '../school-store.mjs';
import {parseStudentsWorkbook,workbookBuffer} from '../school-excel.mjs';
import {createApp} from '../server.mjs';
const bootstrap={username:'administrator',password:'Test-admin-password-123'};
const teacherData=(username)=>({name:username,className:'七年级一班',username,password:'Test-teacher-password-123',role:'admin'});
const makeFile=async(rows)=>{const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('学生');sheet.addRow(['姓名','性别','年龄']);rows.forEach(row=>sheet.addRow(row));return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');};

test('teacher registration, scoped APIs, import, exports and password resets enforce ownership',async()=>{
 const store=await openSchoolStore(':memory:',bootstrap),server=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,session,data,method='POST')=>fetch(base+path,{method:data===undefined?'GET':method,headers:session?{cookie:`xiaoke_session=${session.token}`,'x-csrf-token':session.csrf}:{},body:data===undefined?undefined:JSON.stringify(data)});
 try{
  const admin=await store.login(bootstrap.username,bootstrap.password);
  for(const username of ['teacher_a','teacher_b'])assert.equal((await request('/api/auth/register',null,teacherData(username))).status,201);
  const a=await store.login('teacher_a',teacherData('a').password),b=await store.login('teacher_b',teacherData('b').password);
  assert.equal(a.user.role,'teacher');assert.notEqual(a.user.classId,b.user.classId);assert.equal(store.classes(a.user).length,1);assert.equal(store.classes(admin.user).length,2);
  assert.equal((await request('/api/admin/teachers',a)).status,403);
  const data=await makeFile([['陈辉','男',14],['陈辉','女',13],['单明','男',12]]);
  assert.equal((await request('/api/teacher/import',a,{data,classId:b.user.classId})).status,403);
  assert.equal(store.students(admin.user).length,0);
  const result=await(await request('/api/teacher/import',a,{data})).json();assert.equal(result.created,3);
  assert.equal((await(await request('/api/teacher/import',a,{data})).json()).alreadyImported,true);
  assert.equal(store.students(a.user).length,3);assert.equal(store.students(b.user).length,0);
  const credentials=store.studentCredentials(a.user);assert.deepEqual(credentials.map(s=>s.username).sort(),['chenhui2_student','chenhui_student','shanming_student'].sort());
  for(const s of credentials){assert.match(s.password,/^\d{8}$/);assert.equal(s.classId,a.user.classId);assert.ok(await store.login(s.username,s.password));}
  const student=credentials[0],studentSession=await store.login(student.username,student.password);
  assert.equal((await request('/api/admin/teachers',studentSession)).status,403);assert.equal((await request('/api/teacher/accounts.xlsx',studentSession)).status,403);
  store.submit(student.id,quizzes[0].id,Object.fromEntries(quizzes[0].questions.map(q=>[q.id,q.answer])));
  const turn=store.begin(student.id,'knowledge',{text:'什么是动能？',lessonId:'energy-skate-park'});store.finish(turn,{content:'测试回答',source:'model'});
  for(const path of ['/api/teacher/students','/api/teacher/scores','/api/teacher/conversations','/api/teacher/accounts.xlsx','/api/teacher/export?type=scores','/api/teacher/export?type=conversations'])assert.equal((await request(path+(path.includes('?')?'&':'?')+'class='+a.user.classId,b)).status,403,path);
  assert.equal((await request('/api/teacher/conversations?student='+student.id,b)).status,403);
  assert.equal((await request('/api/teacher/export?type=conversations&student='+student.id,b)).status,403);
  assert.equal((await request('/api/teacher/students/'+student.id,b,{...student,password:''},'PUT')).status,403);
  assert.equal(store.allScores(b.user).length,0);assert.equal(store.conversations('',100,0,b.user).length,0);assert.equal(store.allScores(admin.user).length,1);
  const download=await request('/api/teacher/accounts.xlsx',a);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store');
  const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await download.arrayBuffer()));const sheet=book.worksheets[0];assert.equal(sheet.rowCount,4);assert.equal(sheet.getCell('F2').value,credentials[0].password);assert.equal(typeof sheet.getCell('F2').value,'string');
  const teacherList=await(await request('/api/admin/teachers',admin)).json();assert.equal(teacherList.teachers.length,2);assert.equal(teacherList.teachers[0].password,teacherData('a').password);assert.equal('credential' in teacherList.teachers[0],false);
  const changed=await request('/api/admin/teachers/'+a.user.id,admin,{...teacherData('teacher_a'),password:'Changed-teacher-123',className:'八年级一班'},'PUT');assert.equal(changed.status,200);assert.equal(store.session(a.token),null);assert.equal(await store.login('teacher_a',teacherData('a').password),null);assert.ok(await store.login('teacher_a','Changed-teacher-123'));assert.equal(store.students(admin.user,a.user.classId)[0].className,'八年级一班');
  assert.equal(store.teachers(admin.user).find(t=>t.id===a.user.id).password,'Changed-teacher-123');
  // Profile edits with no new password must preserve the current credential.
  assert.equal((await request('/api/admin/teachers/'+b.user.id,admin,{name:'教师乙',username:'teacher_b',className:'八年级二班'},'PUT')).status,200);
  const currentA=await store.login('teacher_a','Changed-teacher-123'),currentB=await store.login('teacher_b',teacherData('b').password);
  for(const path of ['/api/teacher/students/'+student.id,'/api/teacher/students/'+student.id+'/scores','/api/teacher/conversations/'+turn,'/api/admin/teachers/'+a.user.id])assert.equal((await request(path,currentB,{},'DELETE')).status,403);
  assert.equal(store.scores(student.id).length,1);assert.equal(store.conversations(student.id,100,0,currentA.user).length,1);
  assert.equal((await request('/api/teacher/conversations/'+turn,currentA,{},'DELETE')).status,200);assert.equal(store.conversations(student.id,100,0,currentA.user).length,0);
  assert.equal((await request('/api/teacher/students/'+student.id+'/scores',currentA,{},'DELETE')).status,200);assert.equal(store.scores(student.id).length,0);assert.equal(store.ready(student.id),false);
  assert.equal((await request('/api/teacher/students/'+student.id,currentA,{},'DELETE')).status,200);assert.equal(store.session(studentSession.token),null);
  assert.equal((await request('/api/admin/teachers/'+a.user.id,admin,{},'DELETE')).status,200);assert.equal(store.session(currentA.token),null);assert.equal(store.students(admin.user,a.user.classId).length,2);assert.equal(store.classes(admin.user).length,2);assert.equal(store.teachers(admin.user).length,1);
  assert.throws(()=>store.students(),/权限/);
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('Excel validation rejects empty templates, formulas and invalid rows before importing',async()=>{
 const template=await readFile(new URL('../public/student-template.xlsx',import.meta.url));await assert.rejects(parseStudentsWorkbook(template.toString('base64')),/还没有学生/);
 await assert.rejects(parseStudentsWorkbook(await makeFile([['学生','未知',14]])),/性别/);
 await assert.rejects(parseStudentsWorkbook(await makeFile([['学生','男',0]])),/年龄/);
 await assert.rejects(parseStudentsWorkbook(await makeFile([['学生','男',14],[{formula:'1+1'},'女',13]])),/不支持公式/);
 await assert.rejects(parseStudentsWorkbook('not a workbook'),/无效/);
 const file=await workbookBuffer([['账号','username'],['密码','password']],[{username:'=HYPERLINK("x")',password:'01234567'}]);const book=new ExcelJS.Workbook();await book.xlsx.load(file);assert.equal(book.worksheets[0].getCell('A2').type,ExcelJS.ValueType.String);assert.equal(book.worksheets[0].getCell('B2').value,'01234567');
});

test('legacy users migrate without losing grades, conversations or sessions; credentials persist encrypted',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xiaoke-migrate-')),file=join(dir,'school.sqlite');let store;
 try{
  const db=new DatabaseSync(file);db.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('teacher','student')),name TEXT NOT NULL,gender TEXT NOT NULL,class_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
   CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE scores(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),quiz_id TEXT NOT NULL,version INTEGER NOT NULL,score INTEGER NOT NULL,correct INTEGER NOT NULL,total INTEGER NOT NULL,answers TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,quiz_id,version));
   CREATE TABLE conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),turn_id TEXT NOT NULL,agent TEXT NOT NULL,lesson_id TEXT NOT NULL,stage INTEGER,user_text TEXT NOT NULL,reply TEXT,source TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,answered_at TEXT);`);
  const insert=db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,1,?)');insert.run('old-admin',bootstrap.username,await passwordHash(bootstrap.password),'teacher','原教师','男','',new Date().toISOString());insert.run('old-student','oldstudent',await passwordHash('Student-old-123'),'student','原学生','女','原班级',new Date().toISOString());
  db.exec(`INSERT INTO sessions VALUES('old-token','old-student','csrf',9999999999999);INSERT INTO scores VALUES('score','old-student','lesson-1',1,80,8,10,'{}','2026-09-01');INSERT INTO conversations VALUES('turn','old-student','turn-id','knowledge','bending-light',NULL,'问题','回答','model','complete','2026-09-01','2026-09-01');`);db.close();
  store=await openSchoolStore(file,bootstrap);const admin=await store.login(bootstrap.username,bootstrap.password);assert.equal(admin.user.role,'admin');assert.equal(store.students(admin.user)[0].id,'old-student');assert.equal(store.scores('old-student')[0].score,80);assert.equal(store.conversations('old-student',100,0,admin.user)[0].reply,'回答');assert.equal(store.studentCredentials(admin.user)[0].password,'未保存');
  const teacher=await store.registerTeacher(teacherData('newteacher'));store.close();store=null;
  const inspect=new DatabaseSync(file);assert.equal(inspect.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token=?').get('old-token').n,1);assert.equal(inspect.prepare('PRAGMA foreign_key_check').all().length,0);assert.notEqual(inspect.prepare('SELECT credential FROM users WHERE id=?').get(teacher.id).credential,teacherData('a').password);inspect.close();
  store=await openSchoolStore(file,bootstrap);assert.equal(store.teachers(admin.user)[0].password,teacherData('a').password);assert.equal(store.classes(admin.user).length,2);
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
