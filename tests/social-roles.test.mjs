import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSchoolStore,quizzes} from '../school-store.mjs';
import {roleGuidance} from '../social-roles.mjs';
test('roles belong to joined groups, reject invalid and stale edits and share swaps',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'});
 try{
  const {user:admin}=await store.login('admin','Test-admin-password'),students=[];
  for(let i=0;i<3;i++)students.push(await store.addStudent({name:'角色'+i,username:'role_'+i,password:'12345678',gender:'男',className:'一班'},admin));
  assert.throws(()=>store.groupRoles(students[0].id),e=>e.status===403);
  for(const s of students)for(const q of quizzes)store.submit(s.id,q.id,Object.fromEntries(q.questions.map(x=>[x.id,x.answer])));
  let batch=store.listGroups(admin)[0];store.approveGroups(admin,batch.id,batch.batchId);batch=store.listGroups(admin)[0];
  for(const g of batch.groups)for(const m of g.members)store.joinGroup(m.id,g.code);
  const pair=batch.groups.find(g=>g.members.length===2),[a,b]=pair.members,solo=batch.groups.find(g=>g.members.length===1).members[0];
  assert.throws(()=>store.groupRoles(a.id,{version:0,leaderId:a.id,challengerId:a.id}),/不同/);
  assert.throws(()=>store.groupRoles(a.id,{version:0,leaderId:a.id,challengerId:solo.id}),/不同/);
  const first=store.groupRoles(a.id,{version:0,leaderId:a.id,challengerId:b.id});assert.equal(first.version,1);assert.deepEqual(store.groupRoles(b.id),first);
  assert.throws(()=>store.groupRoles(b.id,{version:0,swap:true}),e=>e.status===409);
  const swapped=store.groupRoles(b.id,{version:1,swap:true});assert.equal(swapped.leaderId,b.id);assert.equal(store.groupRoles(a.id).challengerId,a.id);
  assert.equal(store.conversations(b.id,100,0,admin)[0].agent,'social');
  assert.ok(swapped.members.every(m=>!('total' in m)));
  assert.match(store.groupRoles(solo.id,{version:0,leaderId:solo.id,challengerId:solo.id}).guidance,/兼任/);
 }finally{store.close();}
});
test('prescribed guidance differs by prior knowledge and uses member names',()=>{
 const members=[{id:'a',name:'小甲',total:200},{id:'b',name:'小乙',total:50}];
 assert.match(roleGuidance('LL',members,'a','b'),/每个环节结束后都交换/);
 assert.match(roleGuidance('HH',members,'a','b'),/太快达成同意/);
 assert.match(roleGuidance('HL',members,'a','b'),/由小甲担任领航/);
});
