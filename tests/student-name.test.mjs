import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {studentAccountBase,openSchoolStore} from '../school-store.mjs';

test('existing generated accounts are corrected once, preserving passwords and linked records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'surname-upgrade-')),file=join(dir,'school.sqlite');let store;
 try{
  store=await openSchoolStore(file,{username:'admin',password:'Test-admin-password'});const {user}=await store.login('admin','Test-admin-password');
  const s=await store.addStudent({name:'小曾',username:'xiaoceng_student',password:'12345678',gender:'男',className:'一班'},user);
  await store.addStudent({name:'另一个小曾',username:'xiaozeng_student',password:'12345678',gender:'男',className:'二班'},user);
  store.finish(store.begin(s.id,'knowledge',{text:'问题'}),{content:'回答',source:'model'});const session=await store.login('xiaoceng_student','12345678');store.close();store=null;
  const db=new DatabaseSync(file);db.exec('DROP TABLE school_migrations');db.close();
  store=await openSchoolStore(file);assert.equal((await store.login('xiaozeng2_student','12345678')).user.id,s.id);assert.equal(store.session(session.token).user.id,s.id);assert.equal(store.conversations(s.id,500,0,user)[0].reply,'回答');assert.equal(await store.login('xiaoceng_student','12345678'),null);
  store.close();store=null;store=await openSchoolStore(file);assert.equal((await store.login('xiaozeng2_student','12345678')).user.id,s.id);
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});

test('account names respect surnames in full names and familiar addresses',()=>{
 for(const [name,expected] of [['曾辉','zenghui'],['小曾','xiaozeng'],[' 小曾 ','xiaozeng'],['老曾','laozeng'],['阿曾','azeng'],['单明','shanming'],['小单','xiaoshan'],['解明','xieming'],['欧阳明','ouyangming'],['张三','zhangsan'],['吕明','lvming']])assert.equal(studentAccountBase(name),expected,name);
});

test('surname-aware import handles collisions without renaming existing accounts',async()=>{
 const store=await openSchoolStore(':memory:',{username:'admin',password:'Test-admin-password'});
 try{
  const {user}=await store.login('admin','Test-admin-password');
  await store.addStudent({name:'小曾',username:'xiaoceng_student',password:'12345678',gender:'男',className:'旧班'},user);
  await store.importStudents([{name:'小曾',gender:'男',age:15,className:'一班'},{name:'小曾',gender:'女',age:15,className:'二班'}],'surname-import',user);
  assert.deepEqual(store.students(user).map(s=>s.username).sort(),['xiaoceng_student','xiaozeng2_student','xiaozeng_student'].sort());
  assert.ok(await store.login('xiaoceng_student','12345678'));
 }finally{store.close();}
});
