import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';
import {conclusionTasks,formatConclusion} from '../public/conclusion-form.js';
const bootstrap={username:'audit_admin',password:'Audit-admin-password'};
async function enroll(store){
 const {user:admin}=await store.login(bootstrap.username,bootstrap.password);
 const student=await store.addStudent({name:'审核测试学生',username:'audit_student',password:'12345678',gender:'女',className:'测试班'},admin);
 for(const quiz of quizzes)store.submit(student.id,quiz.id,Object.fromEntries(quiz.questions.map(question=>[question.id,question.answer])));
 let batch=store.listGroups(admin)[0];store.approveGroups(admin,batch.id,batch.batchId);batch=store.listGroups(admin)[0];
 store.joinGroup(student.id,batch.groups[0].code);const roles=store.groupRoles(student.id);store.groupRoles(student.id,{version:0,leaderId:student.id,challengerId:roles.members.find(member=>member.id!==student.id).id});
 return {admin,student};
}

test('rejected fourth submissions do not inflate attempts and self-assessment uses the current count',async()=>{
 const store=await openSchoolStore(':memory:',bootstrap);let server;
 try{
  const {student}=await enroll(store),session=await store.login(student.username,'12345678');
  server=createApp({store,synthesize:async()=>Buffer.from('test')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async payload=>{const response=await fetch(base+'/api/chat',{method:'POST',headers:{cookie:`xiaoke_session=${session.token}`,'x-csrf-token':session.csrf},body:JSON.stringify(payload)});assert.equal(response.status,200);return response.json();};
  const lessonId='geometric-optics-basics',fields=conclusionTasks[lessonId].sections.flatMap(section=>section.fields),text=formatConclusion(lessonId,fields.map(field=>field.options[0]));
  for(let attempt=1;attempt<=3;attempt++){
   const reply=await request({id:'conclusion-'+attempt,lessonId,stage:5,kind:'content',attempt:1,text});assert.equal(reply.remainingAttempts,3-attempt);
  }
  for(let attempt=4;attempt<=5;attempt++){
   const reply=await request({id:'exhausted-'+attempt,lessonId,stage:5,kind:'content',attempt:1,text});assert.equal(reply.exhausted,true);assert.equal(reply.remainingAttempts,0);
  }
  assert.equal(store.groupConversations(student.id,'metacognitive',lessonId).filter(row=>row.stage===5).length,3);
  const seeded=store.begin(student.id,'metacognitive',{id:'question-1',lessonId,stage:1,kind:'content',text:'物距和像距之间有什么关系？'});store.finish(seeded,{content:'已评价',source:'model'});
  const originalKey=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
  try{const reply=await request({id:'self-rating',lessonId,stage:1,kind:'self_assessment',attempt:1,text:'我给自己两颗星'});assert.equal(reply.remainingAttempts,2);}finally{if(originalKey!==undefined)process.env.DEEPSEEK_API_KEY=originalKey;}
 }finally{if(server)await new Promise(resolve=>server.close(resolve));store.close();}
});

test('legacy clear boundaries survive migration, deleted history and later restarts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'inquiry-sequence-')),filename=join(directory,'school.sqlite');let store;
 try{
  store=await openSchoolStore(filename,bootstrap);const {student,admin}=await enroll(store);
  const original=store.begin(student.id,'metacognitive',{id:'old-turn',lessonId:'bending-light',stage:1,kind:'content',text:'原来的问题'});store.finish(original,{content:'原来的评价',source:'model'});
  const request=store.clearInquiryRecord(student.id,'bending-light',1),{revision}=store.reviewInquiryClearRequest(request.id,true,admin);
  for(const row of store.conversations('',100,0,admin))store.deleteConversation(row.id,admin);
  store.close();store=null;
  // Simulate an old deployment that retained a rowid reset marker after all rows were deleted.
  const old=new DatabaseSync(filename);old.exec('DROP INDEX conversation_sequence_order; ALTER TABLE conversations DROP COLUMN sequence; DROP TABLE conversation_sequence;');old.close();
  store=await openSchoolStore(filename,bootstrap);assert.equal(store.groupInquiryResets(student.id,'bending-light')[1],revision);
  const fresh=store.begin(student.id,'metacognitive',{id:'fresh-turn',lessonId:'bending-light',stage:1,kind:'content',text:'升级后的新问题'});store.finish(fresh,{content:'升级后的评价',source:'model'});
  assert.equal(store.groupConversations(student.id,'metacognitive','bending-light').at(-1)?.userText,'升级后的新问题');
  store.close();store=await openSchoolStore(filename,bootstrap);
  assert.equal(store.groupInquiryState(student.id,'bending-light',1,'next-turn').attempt,2);
 }finally{store?.close();await rm(directory,{recursive:true,force:true});}
});
