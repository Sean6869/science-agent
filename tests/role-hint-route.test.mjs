import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {createApp} from '../server.mjs';

test('role hint API uses the authenticated student name, role and private pretest profile',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'});let server;let calls=0,captured;
 try{
  const owner=(await store.login('admin','Test-admin-password')).user;
  const first=await store.addStudent({name:'蒋泽宇',username:'jiang_student',password:'12345678',gender:'男',className:'八年级1班'},owner);
  const second=await store.addStudent({name:'许博文',username:'xu_student',password:'12345678',gender:'男',className:'八年级1班'},owner);
  const answer=quiz=>Object.fromEntries(quiz.questions.map(question=>[question.id,question.answer]));
  for(const student of [first,second])for(const quiz of quizzes)store.submit(student.id,quiz.id,answer(quiz));
  const draft=store.listGroups(owner,first.classId)[0];store.approveGroups(owner,first.classId,draft.batchId);
  const group=store.listGroups(owner,first.classId)[0].groups.find(item=>item.members.some(member=>member.id===first.id));
  for(const student of [first,second])store.joinGroup(student.id,group.code);
  store.groupRoles(first.id,{version:0,leaderId:first.id,challengerId:second.id});
  const session=await store.login(first.username,'12345678');
  server=createApp({store,generateRoleHint:async payload=>{calls++;captured=payload;return {prompt:`${payload.studentName}，你担任${payload.role}。`,record:`${payload.studentName}，请记录到实验任务单。`,encouragement:`${payload.studentName}，继续加油！`};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,options={headers:{cookie:`xiaoke_session=${session.token}`}};
  const firstResponse=await fetch(`${base}/api/role-hint?stage=3`,options),body=await firstResponse.json();
  assert.equal(firstResponse.status,200);assert.equal(captured.studentName,'蒋泽宇');assert.equal(captured.role,'领航发言员');assert.equal(captured.template.id,3);assert.equal(captured.profile.band,'advanced');
  assert.match(body.hint.prompt,/蒋泽宇.*领航发言员/);assert.doesNotMatch(JSON.stringify(body),/score|total|advanced/);
  assert.equal((await fetch(`${base}/api/role-hint?stage=3`,options)).status,200);assert.equal(calls,1);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));store.close();}
});
