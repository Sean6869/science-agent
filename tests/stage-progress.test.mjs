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
