import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSchoolStore} from '../school-store.mjs';
test('deployment admin credentials synchronize on restart, preserve identity and data, and revoke changed sessions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-sync-')),file=join(dir,'school.sqlite');let store;
 try{
  store=await openSchoolStore(file,{username:'old_admin',password:'Old-admin-password'});
  const old=await store.login('old_admin','Old-admin-password');
  const student=await store.addStudent({name:'测试学生',username:'test_student',password:'12345678',gender:'男',className:'一班'},old.user);
  store.close();store=null;
  store=await openSchoolStore(file,{username:'new_admin',password:'New-admin-password'});
  assert.equal(await store.login('old_admin','Old-admin-password'),null);
  assert.equal(await store.login('new_admin','Old-admin-password'),null);
  assert.equal(store.session(old.token),null);
  const current=await store.login('new_admin','New-admin-password');assert.equal(current.user.id,old.user.id);assert.equal(current.user.role,'admin');assert.equal(store.students(current.user)[0].id,student.id);
  store.close();store=null;
  store=await openSchoolStore(file,{username:'new_admin',password:'New-admin-password'});assert.equal(store.session(current.token).user.id,old.user.id);
  store.close();store=null;
  await assert.rejects(openSchoolStore(file,{username:'test_student',password:'New-admin-password'}),/重复/);
  store=await openSchoolStore(file);assert.equal((await store.login('new_admin','New-admin-password')).user.id,old.user.id);assert.ok(await store.login('test_student','12345678'));
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
