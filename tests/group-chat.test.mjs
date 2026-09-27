import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore,quizzes} from '../school-store.mjs';

test('group members share both AI histories with sender attribution and shared attempts',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'});
 try{
  const {user:admin}=await store.login('admin','Test-admin-password');
  const first=await store.addStudent({name:'小甲',username:'group_a',password:'12345678',gender:'男',className:'共享班'},admin),second=await store.addStudent({name:'小乙',username:'group_b',password:'12345678',gender:'男',className:'共享班'},admin);
  for(const student of [first,second])for(const quiz of quizzes)store.submit(student.id,quiz.id,Object.fromEntries(quiz.questions.map(question=>[question.id,question.answer])));
  let report=store.listGroups(admin)[0];store.approveGroups(admin,report.id,report.batchId);report=store.listGroups(admin)[0];const group=report.groups[0];for(const member of group.members)store.joinGroup(member.id,group.code);
  const knowledge=store.begin(first.id,'knowledge',{id:'knowledge-1',lessonId:'bending-light',text:'折射角怎样变化？'});store.finish(knowledge,{content:'先比较入射角和折射角。',source:'model'});
  const shared=store.groupConversations(second.id,'knowledge','bending-light');assert.equal(shared.length,1);assert.equal(shared[0].senderName,'小甲');assert.equal(shared[0].reply,'先比较入射角和折射角。');assert.deepEqual(store.groupPromptHistory(second.id,'knowledge','bending-light'),[{role:'user',text:'折射角怎样变化？'},{role:'agent',text:'先比较入射角和折射角。'}]);
  assert.equal(store.groupConversations(second.id,'knowledge','energy-skate-park').length,0);
  const pending=store.begin(first.id,'knowledge',{id:'knowledge-pending',lessonId:'bending-light',text:'还在等待的问题'});
  assert.equal(store.groupHasPending(second.id,'knowledge','bending-light',null,'knowledge-2'),true);
  assert.equal(store.groupHasPending(first.id,'knowledge','bending-light',null,'knowledge-pending'),false);
  store.finish(pending,{content:'问题已经回答。',source:'model'});
  assert.equal(store.groupHasPending(second.id,'knowledge','bending-light',null,'knowledge-2'),false);
  const retryOne=store.begin(first.id,'knowledge',{id:'knowledge-retry',lessonId:'bending-light',text:'同一次重试问题'});store.finish(retryOne,{content:'临时回复',source:'fallback'});
  const retryTwo=store.begin(first.id,'knowledge',{id:'knowledge-retry',lessonId:'bending-light',text:'同一次重试问题'});store.finish(retryTwo,{content:'最终回复',source:'model'});
  const retried=store.groupConversations(second.id,'knowledge','bending-light').filter(row=>row.turnId==='knowledge-retry');assert.equal(retried.length,1);assert.equal(retried[0].reply,'最终回复');
  const inquiry=store.begin(first.id,'metacognitive',{id:'inquiry-1',lessonId:'bending-light',stage:1,kind:'content',text:'研究入射角对折射角的影响'});store.finish(inquiry,{content:'请补充可观察的变量。',source:'model',complete:false});
  const state=store.groupInquiryState(second.id,'bending-light',1,'inquiry-2');assert.equal(state.attempt,2);assert.equal(state.latestSubmission,'研究入射角对折射角的影响');assert.match(state.conversation.at(-1).text,/可观察的变量/);
 }finally{store.close();}
});
