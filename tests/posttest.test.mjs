import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {openSchoolStore} from '../school-store.mjs';
import {lessons} from '../lessons.mjs';
import {createApp} from '../server.mjs';

const bootstrap={username:'posttest_admin',password:'Posttest-admin-password'};

test('teacher can launch the private randomized posttest at any time and students never receive their score',async()=>{
 const store=await openSchoolStore(':memory:',bootstrap);
 try{
  const teacher=await store.registerTeacher({name:'物理老师',username:'posttest_teacher',password:'Posttest-teacher-password'});
  const first=await store.addStudent({name:'学生甲',username:'posttest_a',password:'Posttest-student-password',gender:'男',className:'八年级一班'},teacher);
  const second=await store.addStudent({name:'学生乙',username:'posttest_b',password:'Posttest-student-password',gender:'女',className:'八年级一班'},teacher);
  const classId=store.classes(teacher)[0].id;
  const launch=store.startPosttest(teacher,classId);assert.ok(launch.startedAt);assert.equal(store.posttestStatus(first.id).phase,'prediction');assert.equal(store.posttestStatus(first.id).eligible,false);
  for(const student of [first,second])for(const lesson of lessons)store.updateStageProgress(student.id,lesson.id,6);
  const firstTest=store.savePosttestPrediction(first.id,18),secondTest=store.savePosttestPrediction(second.id,21);
  assert.equal(firstTest.questions.length,30);assert.equal(new Set(firstTest.questions.map(question=>question.id)).size,30);assert.doesNotMatch(JSON.stringify(firstTest),/"answer"/);
  assert.notDeepEqual(firstTest.questions.map(question=>question.id),secondTest.questions.map(question=>question.id));
  const answers=Object.fromEntries(firstTest.questions.map(question=>[question.id,question.options[0].id]));const confidence=store.savePosttestAnswers(first.id,answers);
  assert.equal(confidence.phase,'confidence');assert.equal('correct' in confidence,false);
  let next=store.savePosttestConfidence(first.id,87);assert.equal(next.phase,'reasoning_prediction');
  next=store.saveReasoningPrediction(first.id,72);assert.equal(next.phase,'reasoning_test');
  next=store.saveReasoningAnswers(first.id,Object.fromEntries(['1','2','3','4','5'].map(id=>[id,`第${id}题的完整回答`] )));assert.equal(next.phase,'reasoning_scoring');
  next=store.saveReasoningScore(first.id,{items:['1','2','3','4','5'].map(id=>({id,score:16,reason:'符合评分标准'})),total:80});assert.equal(next.phase,'reasoning_confidence');
  const certificate=store.saveReasoningConfidence(first.id,91);assert.equal(certificate.phase,'certificate');assert.equal(certificate.certificate.studentName,'学生甲');assert.equal('correct' in certificate,false);
  const report=store.posttestReport(teacher,classId)[0],row=report.students.find(student=>student.id===first.id);assert.equal(row.prediction,18);assert.equal(row.confidence,87);assert.equal(row.total,30);assert.equal(Number.isInteger(row.correct),true);assert.equal(row.status,'已完成');
  assert.equal(store.startPosttest(teacher,classId).startedAt,launch.startedAt);
  assert.equal(store.saveReasoningConfidence(first.id,12).certificate.studentName,'学生甲');assert.equal(store.posttestReport(teacher,classId)[0].students.find(student=>student.id===first.id).confidence,87);
 }finally{store.close();}
});

test('posttest APIs keep scores private and export complete teacher records',async()=>{
 const store=await openSchoolStore(':memory:',bootstrap),scoreReasoning=async()=>({items:['1','2','3','4','5'].map(id=>({id,score:18,reason:'符合评分标准'})),total:90}),server=createApp({store,scoreReasoning});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,session,data,method='POST')=>fetch(base+path,{method:data===undefined?'GET':method,headers:session?{cookie:`xiaoke_session=${session.token}`,'x-csrf-token':session.csrf,'content-type':'application/json'}:{},body:data===undefined?undefined:JSON.stringify(data)});
 try{
  const teacher=await store.registerTeacher({name:'物理老师',username:'posttest_api_teacher',password:'Posttest-teacher-password'}),student=await store.addStudent({name:'学生丙',username:'posttest_api_student',password:'Posttest-student-password',gender:'男',className:'八年级二班'},teacher),classId=store.classes(teacher)[0].id;
  for(const lesson of lessons)store.updateStageProgress(student.id,lesson.id,6);
  const teacherSession=await store.login(teacher.username,'Posttest-teacher-password'),studentSession=await store.login(student.username,'Posttest-student-password');
  assert.equal((await request('/api/teacher/posttest/start',teacherSession,{classId})).status,200);
  let response=await request('/api/posttest',studentSession),payload=await response.json();assert.equal(payload.phase,'prediction');assert.equal('correct' in payload,false);
  payload=await(await request('/api/posttest/prediction',studentSession,{prediction:20})).json();assert.equal(payload.questions.length,30);assert.doesNotMatch(JSON.stringify(payload),/"answer"/);
  const answers=Object.fromEntries(payload.questions.map(question=>[question.id,question.options[0].id]));payload=await(await request('/api/posttest/answers',studentSession,{answers})).json();assert.equal(payload.phase,'confidence');assert.equal('correct' in payload,false);
  payload=await(await request('/api/posttest/confidence',studentSession,{confidence:76})).json();assert.equal(payload.phase,'reasoning_prediction');assert.equal('correct' in payload,false);
  payload=await(await request('/api/posttest/reasoning-prediction',studentSession,{prediction:70})).json();assert.equal(payload.phase,'reasoning_test');
  payload=await(await request('/api/posttest/reasoning-answers',studentSession,{answers:Object.fromEntries(['1','2','3','4','5'].map(id=>[id,`第${id}题回答`]))})).json();assert.equal(payload.phase,'reasoning_confidence');assert.equal('reasoningScore' in payload,false);
  payload=await(await request('/api/posttest/reasoning-confidence',studentSession,{confidence:82})).json();assert.equal(payload.phase,'certificate');assert.equal('correct' in payload,false);
  assert.equal((await request('/api/teacher/posttest',studentSession)).status,403);const report=await(await request(`/api/teacher/posttest?class=${classId}`,teacherSession)).json();assert.equal(report.classes[0].students[0].confidence,76);assert.equal(report.classes[0].students[0].reasoningScore,90);assert.equal(Number.isInteger(report.classes[0].students[0].correct),true);
  const exported=await request(`/api/teacher/export?type=posttest&class=${classId}`,teacherSession),book=new ExcelJS.Workbook();assert.equal(exported.status,200);const disposition=exported.headers.get('content-disposition');assert.match(disposition,/xiaoke-posttest\.xlsx/);assert.match(disposition,new RegExp(encodeURIComponent('后测成绩-八年级二班.xlsx')));assert.doesNotMatch(decodeURIComponent(disposition),/小科-后测成绩/);await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));assert.equal(book.worksheets[0].name,'后测成绩');assert.equal(book.worksheets[0].getCell('A2').value,'学生丙');
  const text='请查看实验资料：https://example.com/physics';assert.equal((await request('/api/teacher/broadcasts',teacherSession,{classId,message:text})).status,201);let inbox=await(await request('/api/broadcasts/latest',studentSession)).json();assert.equal(inbox.broadcast.message,text);assert.equal((await request(`/api/broadcasts/${inbox.broadcast.id}/read`,studentSession,{})).status,200);inbox=await(await request('/api/broadcasts/latest',studentSession)).json();assert.equal(inbox.broadcast,null);const history=await(await request(`/api/teacher/broadcasts?class=${classId}`,teacherSession)).json();assert.equal(history.broadcasts[0].readCount,1);assert.equal(history.broadcasts[0].studentCount,1);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
