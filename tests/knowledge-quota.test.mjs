import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore,quizzes} from '../school-store.mjs';
test('HH groups share three questions per lesson, retries are free and teacher reset is scoped',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'});
 try{
  const {user:admin}=await store.login('admin','Test-admin-password'),other=await store.registerTeacher({name:'其他教师',username:'other',password:'Test-teacher-password'}),students=[];
  for(let i=0;i<6;i++)students.push(await store.addStudent({name:'学生'+i,username:'quota_'+i,password:'12345678',gender:'男',className:'一班'},admin));
  for(const [i,s] of students.entries())for(const q of quizzes)store.submit(s.id,q.id,Object.fromEntries(q.questions.map(x=>[x.id,i<3?x.options.find(o=>o.id!==x.answer).id:x.answer])));
  let batch=store.listGroups(admin)[0];store.approveGroups(admin,batch.id,batch.batchId);batch=store.listGroups(admin)[0];
  for(const g of batch.groups)for(const m of g.members)store.joinGroup(m.id,g.code);
  const hh=batch.groups.find(g=>g.type==='HH'),[a,b]=hh.members;
  for(let i=0;i<3;i++)assert.equal(store.knowledgeQuota(i%2?a.id:b.id,'bending-light',{id:'q'+i,text:'问题'+i}).remaining,2-i);
  assert.equal(store.knowledgeQuota(b.id,'bending-light',{id:'q0',text:'问题0'}).remaining,0);
  assert.throws(()=>store.knowledgeQuota(b.id,'bending-light',{id:'q0',text:'换一个问题'}),/不能改变/);
  assert.throws(()=>store.knowledgeQuota(a.id,'bending-light',{id:'q4',text:'问题4'}),e=>e.status===429);
  assert.equal(store.knowledgeQuota(a.id,'energy-skate-park',{id:'q4',text:'问题4'}).remaining,2);
  for(const g of batch.groups.filter(g=>g.type!=='HH'))for(let i=0;i<5;i++)assert.equal(store.knowledgeQuota(g.members[0].id,'bending-light',{id:'q'+i,text:'问题'}).limit,null);
  assert.throws(()=>store.resetKnowledgeQuota(other,batch.id,'bending-light'),/班级/);
  store.resetKnowledgeQuota(admin,batch.id,'bending-light');assert.equal(store.knowledgeQuota(a.id,'bending-light').remaining,3);assert.equal(store.knowledgeQuota(a.id,'energy-skate-park').remaining,2);
 }finally{store.close();}
});
