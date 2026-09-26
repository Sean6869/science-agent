import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
import {csv} from '../school-api.mjs';
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
test('quiz API preserves all diagrams and options without leaking answers',async()=>{const r=await request('/api/quizzes',student);assert.equal(r.status,200);const p=await r.json();assert.equal(p.quizzes.length,2);assert.equal(p.quizzes[1].questions[6].options.length,7);for(const q of p.quizzes.flatMap(q=>q.questions)){assert.equal('answer' in q,false);assert.doesNotMatch(q.text,/（\s*[A-G]\s*）/);for(const path of [...q.images,...q.options.flatMap(o=>o.images)])assert.equal((await request(path)).status,200);}assert.equal((await request('/quizzes.json')).status,404);assert.equal((await request('/data/school.sqlite')).status,404);});
test('server grades in order, rejects incomplete submissions, and cannot overwrite scores',async()=>{
 const answers=q=>Object.fromEntries(q.questions.map(item=>[item.id,item.answer]));
 assert.equal((await request('/api/quizzes/submit',student,{quizId:'lesson-2',answers:answers(quizzes[1])})).status,400);
 assert.equal((await request('/api/quizzes/submit',student,{quizId:'lesson-1',answers:{}})).status,400);
 const first=answers(quizzes[0]);first['1']='E';const p=await(await request('/api/quizzes/submit',student,{quizId:'lesson-1',answers:first,score:100,userId:other.user.id})).json();assert.equal(p.result.score,90);assert.equal(p.ready,false);assert.equal(store.scores(other.user.id).length,0);
 const repeated=await(await request('/api/quizzes/submit',student,{quizId:'lesson-1',answers:answers(quizzes[0])})).json();assert.equal(repeated.result.score,90);
 const second=await(await request('/api/quizzes/submit',student,{quizId:'lesson-2',answers:answers(quizzes[1])})).json();assert.equal(second.result.score,100);assert.equal(second.ready,true);assert.equal((await request('/api/config',student)).status,200);
});
test('both agents persist student input and returned replies tied to authenticated identity',async()=>{
 delete process.env.DEEPSEEK_API_KEY;
 for(const [path,p] of [['/api/knowledge',{text:'什么是焦距？',history:[],lessonId:'geometric-optics-basics'}],['/api/chat',{text:'物距变化影响像的大小',stage:1,kind:'content',attempt:1,lessonId:'geometric-optics-basics'}],['/api/assessment',{option:'sufficient',lessonId:'geometric-optics-basics'}]]){
  const r=await request(path,student,{...p,userId:other.user.id});assert.equal(r.status,200);const reply=await r.json();assert.ok(reply.content);const rows=store.conversations(student.user.id,500,0,teacher.user);assert.equal(rows[0].reply,reply.content);assert.equal(rows[0].status,'complete');assert.equal(rows[0].username,'student1');
 }
 assert.equal(store.conversations(other.user.id,500,0,teacher.user).length,0);const exported=await request('/api/teacher/export?type=conversations',teacher);assert.equal(exported.status,200);const data=await exported.text();assert.match(data,/知识|knowledge/);assert.match(data,/metacognitive/);assert.match(data,/物距变化影响像的大小/);
 const scoreCSV=await(await request('/api/teacher/export?type=scores',teacher)).text();assert.match(scoreCSV,/90/);assert.match(scoreCSV,/100/);
});
test('teacher updates student profiles and resets passwords without exposing hashes',async()=>{
 const result=await request(`/api/teacher/students/${other.user.id}`,teacher,{name:'学生乙改',gender:'未填写',className:'七年级三班',username:'student2',password:'New-password-789',active:true},'PUT');assert.equal(result.status,200);const p=await result.json();assert.equal('password' in p.student,false);assert.equal(store.session(other.token),null);assert.equal(await store.login('student2','Student-password-456'),null);assert.ok(await store.login('student2','New-password-789'));assert.equal((await request('/api/teacher/students',student,{name:'伪造'})).status,403);
});
test('records survive database reopen and CSV escapes formula cells',async()=>{
 const snapshot=store.scores(student.user.id);const reopened=await openSchoolStore(file);assert.deepEqual(reopened.scores(student.user.id),snapshot);assert.ok(reopened.conversations(student.user.id,500,0,teacher.user).length>=3);reopened.close();assert.match(csv([['内容','value']],[{value:' =HYPERLINK("evil")'}]),/"' =HYPERLINK/);
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
