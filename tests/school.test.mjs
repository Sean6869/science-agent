import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
import ExcelJS from 'exceljs';
import {workbookBuffer} from '../school-excel.mjs';
async function workbookText(response){assert.match(response.headers.get('content-type'),/spreadsheetml/);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));return JSON.stringify(book.worksheets[0].getSheetValues());}
let store,server,base,teacher,student,other,dir,file;
const bootstrap={username:'teacher',password:'Teacher-password-123'};
async function request(path,session,data,method='POST') {const headers={...(session?{cookie:`xiaoke_session=${session.token}`,'x-csrf-token':session.csrf}:{})};return fetch(base+path,{method:data===undefined?'GET':method,headers,body:data===undefined?undefined:JSON.stringify(data)});}
before(async()=>{dir=await mkdtemp(join(tmpdir(),'xiaoke-school-'));file=join(dir,'school.sqlite');store=await openSchoolStore(file,bootstrap);teacher=await store.login(bootstrap.username,bootstrap.password);const s=await store.addStudent({name:'学生甲',gender:'女',className:'七年级一班',username:'student1',password:'Student-password-123'},teacher.user);student=await store.login(s.username,'Student-password-123');await store.addStudent({name:'学生乙',gender:'男',className:'七年级二班',username:'student2',password:'Student-password-456'},teacher.user);other=await store.login('student2','Student-password-456');server=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));store.close();await rm(dir,{recursive:true,force:true});});
test('login is required; students cannot bypass quiz gate or read teacher exports',async()=>{
 assert.equal((await request('/api/config')).status,401);
 assert.equal((await request('/api/knowledge',null,{text:'谁',history:[]})).status,401);
 assert.equal((await request('/api/config',student)).status,403);
 for(const path of ['/api/teacher/students','/api/teacher/scores','/api/teacher/conversations','/api/teacher/export?type=scores'])assert.equal((await request(path,student)).status,403);
 const r=await fetch(base+'/api/quizzes/submit',{method:'POST',headers:{cookie:`xiaoke_session=${student.token}`},body:'{}'});assert.equal(r.status,403);
 const cross=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin:'https://other.example'},body:'{}'});assert.equal(cross.status,403);
 const switched=await fetch(base+'/api/config',{headers:{cookie:`xiaoke_session=${student.token}`,'x-session-user':other.user.id}});assert.equal(switched.status,409);
});
test('quiz API preserves all diagrams and options without leaking answers',async()=>{const r=await request('/api/quizzes',student);assert.equal(r.status,200);const p=await r.json();assert.equal(p.quizzes.length,3);assert.equal(p.quizzes[1].questions[6].options.length,7);const updated=p.quizzes[1].questions.find(question=>question.id==='8');assert.match(updated.text,/记忆口诀/);assert.equal(updated.options.length,6);assert.match(updated.options.find(option=>option.id==='D').text,/两倍焦距分正倒/);for(const q of p.quizzes.flatMap(q=>q.questions)){assert.equal('answer' in q,false);assert.doesNotMatch(q.text,/（\s*[A-G]\s*）/);for(const path of [...q.images,...q.options.flatMap(o=>o.images)])assert.equal((await request(path)).status,200);}assert.equal((await request('/quizzes.json')).status,404);assert.equal((await request('/data/school.sqlite')).status,404);});
test('server grades in order, rejects incomplete submissions, and cannot overwrite scores',async()=>{
 const answers=q=>Object.fromEntries(q.questions.map(item=>[item.id,item.answer]));
 assert.equal((await request('/api/quizzes/submit',student,{quizId:'lesson-2',answers:answers(quizzes[1])})).status,400);
 assert.equal((await request('/api/quizzes/submit',student,{quizId:'lesson-1',answers:{}})).status,400);
 const first=answers(quizzes[0]);first['1']='E';const p=await(await request('/api/quizzes/submit',student,{quizId:'lesson-1',answers:first,score:100,userId:other.user.id})).json();assert.equal(store.scores(student.user.id)[0].score,90);assert.equal(p.result,undefined);assert.equal(p.ready,false);assert.equal(store.scores(other.user.id).length,0);
 const repeated=await(await request('/api/quizzes/submit',student,{quizId:'lesson-1',answers:answers(quizzes[0])})).json();assert.equal(store.scores(student.user.id)[0].score,90);assert.equal(repeated.result,undefined);
 const second=await(await request('/api/quizzes/submit',student,{quizId:'lesson-2',answers:answers(quizzes[1])})).json();assert.equal(store.scores(student.user.id)[1].score,100);assert.equal(second.ready,false);
 const third=await(await request('/api/quizzes/submit',student,{quizId:'lesson-3',answers:answers(quizzes[2])})).json();assert.equal(third.ready,true);assert.equal((await request('/api/config',student)).status,403);
 const c=store.listGroups(teacher.user,student.user.classId)[0];store.approveGroups(teacher.user,c.id,c.batchId);store.joinGroup(student.user.id,store.listGroups(teacher.user,c.id)[0].groups[0].code);assert.equal((await request('/api/config',student)).status,200);
});
test('both agents persist student input and returned replies tied to authenticated identity',async()=>{
 assert.equal((await request('/api/chat',student,{text:'问题',stage:1})).status,403);
 const roles=store.groupRoles(student.user.id);store.groupRoles(student.user.id,{version:0,leaderId:roles.members[0].id,challengerId:roles.members.at(-1).id});
 delete process.env.DEEPSEEK_API_KEY;
 for(const [path,p,expected] of [['/api/knowledge',{text:'什么是焦距？',history:[],lessonId:'geometric-optics-basics'},null],['/api/chat',{text:'物距变化影响像的大小',stage:1,kind:'content',attempt:1,lessonId:'geometric-optics-basics'},null],['/api/assessment',{option:'sufficient',lessonId:'geometric-optics-basics'},/焦点附近/],['/api/assessment',{option:'partial',lessonId:'bending-light'},/空气射入水/],['/api/assessment',{option:'needs_revision',lessonId:'energy-skate-park'},/质量对动能的影响/]]){
  const r=await request(path,student,{...p,userId:other.user.id});assert.equal(r.status,200);const reply=await r.json();assert.ok(reply.content);if(expected)assert.match(reply.content,expected);const rows=store.conversations(student.user.id,500,0,teacher.user);assert.equal(rows[0].reply,reply.content);assert.equal(rows[0].status,'complete');assert.equal(rows[0].username,'student1');
 }
 assert.equal((await request('/api/assessment',student,{option:'sufficient',lessonId:'unknown'})).status,400);
 assert.equal(store.conversations(other.user.id,500,0,teacher.user).length,0);const exported=await request('/api/teacher/export?type=conversations&class='+student.user.classId,teacher);assert.equal(exported.status,200);const data=await workbookText(exported);assert.match(data,/知识|knowledge/);assert.match(data,/metacognitive/);assert.match(data,/物距变化影响像的大小/);
 const scoreCSV=await workbookText(await request('/api/teacher/export?type=scores&class='+student.user.classId,teacher));assert.match(scoreCSV,/9 \/ 10/);assert.match(scoreCSV,/10 \/ 10/);assert.doesNotMatch(scoreCSV,/"账号"|90 \/ 100/);
});
test('clearing the current inquiry record keeps the stage and archives earlier feedback',async()=>{
 store.setGroupLearningState(student.user.id,'geometric-optics-basics',2);
 const before=await(await request('/api/group-conversations?agent=metacognitive&lesson=geometric-optics-basics',student)).json();
 assert.ok(before.conversations.some(row=>row.stage===1));
 assert.equal((await request('/api/inquiry-record/clear',teacher,{lessonId:'geometric-optics-basics',stage:1})).status,403);
 assert.equal((await request('/api/inquiry-record/clear',student,{lessonId:'unknown',stage:1})).status,400);
 const cleared=await request('/api/inquiry-record/clear',student,{lessonId:'geometric-optics-basics',stage:1});assert.equal(cleared.status,200);
 const {revision}=await cleared.json();
 const after=await(await request('/api/group-conversations?agent=metacognitive&lesson=geometric-optics-basics',student)).json();
 assert.equal(after.resets[1],revision);
 assert.equal(after.conversations.filter(row=>row.stage===1).length,0);
 assert.equal(store.groupLearningState(student.user.id).stage,2);
 assert.ok(store.conversations(student.user.id,100,0,teacher.user).some(row=>row.userText==='物距变化影响像的大小'));
 const retry=await request('/api/chat',student,{id:'after-clear',lessonId:'geometric-optics-basics',stage:1,kind:'content',attempt:1,text:'物距和像的大小之间有什么关系？'});assert.equal(retry.status,200);const retryResult=await retry.json();assert.equal(retryResult.source,'fallback');assert.equal(retryResult.remainingAttempts,3);
 assert.equal(store.groupInquiryState(student.user.id,'geometric-optics-basics',1,'next-turn').attempt,1);
});
test('teacher updates student profiles and resets passwords without exposing hashes',async()=>{
 const result=await request(`/api/teacher/students/${other.user.id}`,teacher,{name:'学生乙改',gender:'未填写',className:'七年级三班',username:'student2',password:'New-password-789',active:true},'PUT');assert.equal(result.status,200);const p=await result.json();assert.equal('password' in p.student,false);assert.equal(store.session(other.token),null);assert.equal(await store.login('student2','Student-password-456'),null);assert.ok(await store.login('student2','New-password-789'));assert.equal((await request('/api/teacher/students',student,{name:'伪造'})).status,403);
});
test('records survive database reopen and XLSX keeps user text as text',async()=>{
 const snapshot=store.scores(student.user.id);const reopened=await openSchoolStore(file);try{assert.deepEqual(reopened.scores(student.user.id),snapshot);assert.ok(reopened.conversations(student.user.id,500,0,teacher.user).length>=3);}finally{reopened.close();}const book=new ExcelJS.Workbook();await book.xlsx.load(await workbookBuffer([['内容','value']],[{value:'=HYPERLINK("evil")'}]));assert.equal(book.worksheets[0].getCell('A2').type,ExcelJS.ValueType.String);
});
test('successful model replies are recorded without substituting local answers',async()=>{
 const original=globalThis.fetch;const originalKey=process.env.DEEPSEEK_API_KEY;let calls=0;
 process.env.DEEPSEEK_API_KEY='test-only-key';
 globalThis.fetch=async(url,options)=>{
  if(url==='https://api.deepseek.com/chat/completions'){calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sentences:['这是测试模型的第一句话。','这是第二句解释。','你想继续观察什么？']})}}]});}
  return original(url,options);
 };
 try{const response=await request('/api/knowledge',student,{text:'测试在线记录',history:[],lessonId:'bending-light'});const result=await response.json();assert.equal(result.source,'model');assert.equal(calls,1);const row=store.conversations(student.user.id,500,0,teacher.user)[0];assert.equal(row.reply,result.content);assert.equal(row.source,'model');assert.equal(row.lessonId,'bending-light');}finally{globalThis.fetch=original;if(originalKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=originalKey;}
});

test('teacher can reset a student account and clear learning records without deleting the account',async()=>{
 assert.equal((await request(`/api/teacher/students/${other.user.id}/reset-account`,student,{})).status,403);
 const reset=await request(`/api/teacher/students/${other.user.id}/reset-account`,teacher,{});assert.equal(reset.status,200);
 const account=await reset.json();assert.equal(account.student.username,'student2');assert.equal(account.password.length>=8,true);
 assert.equal(await store.login('student2','New-password-789'),null);
 assert.ok(await store.login('student2',account.password));
 assert.ok(store.scores(student.user.id).length>0);
 assert.ok(store.conversations(student.user.id,100,0,teacher.user).length>0);
 store.startPosttest(teacher.user,student.user.classId);assert.equal(store.posttestStatus(student.user.id).active,true);
 assert.equal((await request(`/api/teacher/students/${student.user.id}/clear-records`,student,{})).status,403);
 const cleared=await request(`/api/teacher/students/${student.user.id}/clear-records`,teacher,{});assert.equal(cleared.status,200);
 assert.equal(store.session(student.token),null);
 assert.deepEqual(store.scores(student.user.id),[]);
 assert.deepEqual(store.conversations(student.user.id,100,0,teacher.user),[]);
 assert.equal(store.ready(student.user.id),false);
 assert.equal(store.posttestStatus(student.user.id).active,false);
 assert.equal(store.groupStatus(student.user.id).status,'waiting');
 assert.ok(await store.login('student1','Student-password-123'));
 for(const lessonId of ['bending-light','geometric-optics-basics','energy-skate-park'])store.updateStageProgress(student.user.id,lessonId,6);
 assert.equal(store.posttestStatus(student.user.id).active,true);
});
