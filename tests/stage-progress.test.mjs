import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore} from '../school-store.mjs';

const bootstrap={username:'administrator',password:'Test-admin-password-123'};

test('stage progress is monotonic and teacher views the latest reached stage',async()=>{
 const store=await openSchoolStore(':memory:',bootstrap);
 try{
  const teacher=await store.registerTeacher({name:'教师',username:'progress_teacher',password:'Teacher-password-123'});
  const first=await store.addStudent({name:'学生甲',username:'progress_a',password:'Student-password-123',gender:'男',className:'八年级一班'},teacher);
  const second=await store.addStudent({name:'学生乙',username:'progress_b',password:'Student-password-123',gender:'女',className:'八年级一班'},teacher);
  const classId=store.classes(teacher)[0].id;
  assert.equal(store.updateStageProgress(first.id,'bending-light',4),4);
  assert.equal(store.updateStageProgress(first.id,'bending-light',2),4);
  assert.equal(store.updateStageProgress(second.id,'bending-light',3),3);
  const rows=store.stageProgress(teacher,classId,'bending-light');
  assert.deepEqual(rows.map(row=>[row.name,row.lastStage]).sort((a,b)=>a[0].localeCompare(b[0])),[['学生甲',4],['学生乙',3]].sort((a,b)=>a[0].localeCompare(b[0])));
  assert.equal(store.stageProgress(teacher,classId,'energy-skate-park').every(row=>row.lastStage===0),true);
  assert.throws(()=>store.updateStageProgress(first.id,'',1),/实验进度无效/);
 }finally{store.close();}
});

test('joined group members share the same current lesson and stage in both directions',async()=>{
 const store=await openSchoolStore(':memory:',bootstrap);
 try{
  const teacher=await store.registerTeacher({name:'教师',username:'sync_teacher',password:'Teacher-password-123'});
  const first=await store.addStudent({name:'学生甲',username:'sync_a',password:'Student-password-123',gender:'男',className:'八年级二班'},teacher);
  const second=await store.addStudent({name:'学生乙',username:'sync_b',password:'Student-password-123',gender:'女',className:'八年级二班'},teacher);
  const answers=quiz=>Object.fromEntries(quiz.questions.map(question=>[question.id,question.answer]));
  const {quizzes}=await import('../school-store.mjs');for(const member of [first,second])for(const quiz of quizzes)store.submit(member.id,quiz.id,answers(quiz));
  const classroom=store.listGroups(teacher,store.classes(teacher)[0].id)[0];store.approveGroups(teacher,classroom.id,classroom.batchId);const group=store.listGroups(teacher,classroom.id)[0].groups.find(item=>item.members.some(member=>member.id===first.id));store.joinGroup(first.id,group.code);store.joinGroup(second.id,group.code);
  const firstUpdate=store.setGroupLearningState(first.id,'bending-light',3);assert.equal(store.groupLearningState(second.id).updatedAt,firstUpdate.updatedAt);assert.deepEqual({...store.groupLearningState(second.id),updatedAt:null},{lessonId:'bending-light',stage:3,updatedBy:first.id,updatedAt:null});
  const secondUpdate=store.setGroupLearningState(second.id,'energy-skate-park',5);assert.deepEqual({...store.groupLearningState(first.id),updatedAt:null},{lessonId:'energy-skate-park',stage:5,updatedBy:second.id,updatedAt:null});assert.notEqual(secondUpdate.updatedAt,firstUpdate.updatedAt);
  const progress=store.stageProgress(teacher,classroom.id,'energy-skate-park');assert.equal(progress.every(row=>row.lastStage===5),true);
 }finally{store.close();}
});
