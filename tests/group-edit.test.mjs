import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore,quizzes} from '../school-store.mjs';
test('draft editing preserves all members, recalculates types and requires fresh approval',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'});
 try{
  const teacher=await store.registerTeacher({name:'教师',username:'teacher',password:'Test-teacher-password'}),other=await store.registerTeacher({name:'其他',username:'other',password:'Test-teacher-password'});
  const students=[];for(let i=0;i<4;i++)students.push(await store.addStudent({name:'学生'+i,username:'student_'+i,password:'12345678',gender:'男',className:'一班'},teacher));
  for(const [i,s] of students.entries())for(const q of quizzes)store.submit(s.id,q.id,Object.fromEntries(q.questions.map(item=>[item.id,i<2?item.options.find(o=>o.id!==item.answer).id:item.answer])));
  const original=store.listGroups(teacher)[0],classId=original.id;
  const assignments=[[students[0].id,students[2].id],[students[1].id,students[3].id]];
  assert.throws(()=>store.editGroups(other,classId,original.batchId,assignments),/班级/);
  assert.throws(()=>store.editGroups(teacher,classId,original.batchId,[[students[0].id,students[0].id],[students[2].id,students[3].id]]),/重复/);
  assert.equal(store.listGroups(teacher)[0].batchId,original.batchId);
  store.editGroups(teacher,classId,original.batchId,assignments);
  const edited=store.listGroups(teacher)[0];assert.notEqual(edited.batchId,original.batchId);assert.equal(edited.status,'review');assert.equal(edited.summary.counts.HL,2);assert.ok(edited.groups.every(g=>!g.code));
  assert.deepEqual(edited.groups.map(g=>g.members.map(m=>m.id).sort()),assignments.map(g=>[...g].sort()));
  assert.throws(()=>store.approveGroups(teacher,classId,original.batchId),/改变/);
  assert.throws(()=>store.editGroups(teacher,classId,original.batchId,assignments),/改变/);
  store.approveGroups(teacher,classId,edited.batchId);assert.ok(store.listGroups(teacher)[0].groups.every(g=>g.code));
  assert.throws(()=>store.editGroups(teacher,classId,edited.batchId,assignments),/已确认/);
 }finally{store.close();}
});
