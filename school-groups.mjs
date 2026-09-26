import {randomUUID,randomBytes} from 'node:crypto';
import {planGroups} from './grouping.mjs';

export function createGroupStore(db,{quizzes,getUser,scope,fail}){
 db.exec(`CREATE TABLE IF NOT EXISTS group_batches(class_id TEXT PRIMARY KEY REFERENCES classes(id),id TEXT NOT NULL,summary TEXT NOT NULL,approved_at TEXT,approved_by TEXT);
 CREATE TABLE IF NOT EXISTS student_groups(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id),number INTEGER NOT NULL,type TEXT NOT NULL,code TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS group_members(user_id TEXT PRIMARY KEY REFERENCES users(id),group_id TEXT NOT NULL REFERENCES student_groups(id),total INTEGER NOT NULL,level TEXT NOT NULL,joined INTEGER NOT NULL DEFAULT 0);`);
 db.exec('CREATE TABLE IF NOT EXISTS knowledge_usage(group_id TEXT NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,lesson_id TEXT NOT NULL,user_id TEXT NOT NULL,turn_id TEXT NOT NULL,question TEXT NOT NULL,PRIMARY KEY(group_id,lesson_id,user_id,turn_id))');
 function quota(userId,lessonId,turn){
  const group=db.prepare('SELECT g.id,g.type FROM student_groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=? AND m.joined=1').get(userId);
  if(!group||group.type!=='HH')return {limit:null,remaining:null};
  return atomic(()=>{
   let used=db.prepare('SELECT COUNT(*) AS n FROM knowledge_usage WHERE group_id=? AND lesson_id=?').get(group.id,lessonId).n;
   if(turn){
    const old=db.prepare('SELECT question FROM knowledge_usage WHERE group_id=? AND lesson_id=? AND user_id=? AND turn_id=?').get(group.id,lessonId,userId,turn.id);
    if(old&&old.question!==turn.text)fail('重试的问题内容不能改变');
    if(!old){if(used>=3)fail('本小组本节课的3次知识答疑机会已用完，请与组员讨论或向老师请教。',429);db.prepare('INSERT INTO knowledge_usage VALUES(?,?,?,?,?)').run(group.id,lessonId,userId,turn.id,turn.text);used++;}
   }
   return {limit:3,used,remaining:3-used};
  });
 }
 const roster=classId=>db.prepare("SELECT id,name,username,gender FROM users WHERE class_id=? AND role='student' AND active=1 ORDER BY username").all(classId).map(s=>{
  const scores=db.prepare('SELECT quiz_id,version,score FROM scores WHERE user_id=?').all(s.id),current=quizzes.map(q=>scores.find(r=>r.quiz_id===q.id&&r.version===q.version));return {...s,completed:current.every(Boolean),total:current.reduce((n,r)=>n+(r?.score||0),0)};
 });
 function atomic(fn){db.exec('SAVEPOINT group_change');try{const value=fn();db.exec('RELEASE group_change');return value;}catch(error){db.exec('ROLLBACK TO group_change; RELEASE group_change');throw error;}}
 function invalidate(classId){if(!classId)return;atomic(()=>{db.prepare('DELETE FROM group_members WHERE group_id IN (SELECT id FROM student_groups WHERE class_id=?)').run(classId);db.prepare('DELETE FROM student_groups WHERE class_id=?').run(classId);db.prepare('DELETE FROM group_batches WHERE class_id=?').run(classId);});}
 function ensure(classId){
  if(!classId||db.prepare('SELECT id FROM group_batches WHERE class_id=?').get(classId))return;
  const people=roster(classId);if(!people.length||people.some(s=>!s.completed))return;
  const {groups,...summary}=planGroups(people);
  atomic(()=>{db.prepare('INSERT INTO group_batches VALUES(?,?,?,NULL,NULL)').run(classId,randomUUID(),JSON.stringify(summary));
   for(const [index,g] of groups.entries()){const id=randomUUID();db.prepare('INSERT INTO student_groups VALUES(?,?,?,?,NULL)').run(id,classId,index+1,g.type);for(const s of g.members)db.prepare('INSERT INTO group_members VALUES(?,?,?,?,0)').run(s.id,id,s.total,s.level);}
  });
 }
 function student(userId){
  const user=getUser(userId);ensure(user?.class_id);
  const row=db.prepare('SELECT g.id,g.number,m.joined,b.approved_at FROM group_members m JOIN student_groups g ON g.id=m.group_id JOIN group_batches b ON b.class_id=g.class_id WHERE m.user_id=?').get(userId);
  if(!row)return {status:'waiting'};
  if(!row.approved_at)return {status:'review'};
  if(!row.joined)return {status:'code_required'};
  return {status:'joined',id:row.id,number:row.number,members:db.prepare('SELECT u.name FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.username').all(row.id).map(s=>s.name)};
 }
 function report(c){
  ensure(c.id);const people=roster(c.id),batch=db.prepare('SELECT * FROM group_batches WHERE class_id=?').get(c.id);
  return {...c,total:people.length,completed:people.filter(s=>s.completed).length,batchId:batch?.id,status:batch?(batch.approved_at?'approved':'review'):'waiting',summary:batch?JSON.parse(batch.summary):null,groups:db.prepare('SELECT * FROM student_groups WHERE class_id=? ORDER BY number').all(c.id).map(g=>({...g,members:db.prepare('SELECT u.id,u.name,u.username,u.gender,m.total,m.level FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.username').all(g.id)}))};
 }
 function approve(actor,classId,batchId){if(typeof classId!=='string'||!classId||typeof batchId!=='string'||!batchId)fail('请选择待审核的分组');scope(actor,classId);const batch=db.prepare('SELECT * FROM group_batches WHERE class_id=?').get(classId);if(!batch||batch.id!==batchId)fail('分组草案已改变，请刷新后重新审核');if(batch.approved_at)return;
  atomic(()=>{for(const g of db.prepare('SELECT id FROM student_groups WHERE class_id=?').all(classId)){let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(db.prepare('SELECT id FROM student_groups WHERE code=?').get(code));db.prepare('UPDATE student_groups SET code=? WHERE id=?').run(code,g.id);}db.prepare('UPDATE group_batches SET approved_at=?,approved_by=? WHERE class_id=?').run(new Date().toISOString(),actor.id,classId);});
 }
 function join(userId,code){const g=db.prepare('SELECT g.id FROM student_groups g JOIN group_members m ON m.group_id=g.id JOIN group_batches b ON b.class_id=g.class_id WHERE m.user_id=? AND g.code=? AND b.approved_at IS NOT NULL').get(userId,String(code||'').trim().toUpperCase());if(!g)fail('小组码不正确，或教师尚未确认分组');db.prepare('UPDATE group_members SET joined=1 WHERE user_id=?').run(userId);return student(userId);}
 function edit(actor,classId,batchId,assignments){
  if(typeof classId!=='string'||!classId)fail('请选择班级');scope(actor,classId);
  const batch=db.prepare('SELECT * FROM group_batches WHERE class_id=?').get(classId);
  if(!batch||batch.id!==batchId)fail('分组草案已改变，请刷新后重新编辑',409);
  if(batch.approved_at)fail('分组已确认，不能修改已发放的小组码对应成员');
  const people=roster(classId),byId=new Map(people.map(s=>[s.id,s]));
  if(!Array.isArray(assignments)||assignments.length!==Math.ceil(people.length/2)||assignments.some(g=>!Array.isArray(g)||g.length<1||g.length>2))fail('每组须为两人，奇数人数仅保留一个单人组');
  const ids=assignments.flat();if(ids.length!==people.length||new Set(ids).size!==people.length||ids.some(id=>!byId.has(id))||people.some(s=>!s.completed))fail('成员须包含本班全部已完成测验的学生，且不能重复');
  const summary=JSON.parse(batch.summary),level=s=>s.total<=summary.threshold?'low':'high';summary.counts={LL:0,HH:0,HL:0};summary.edited=true;
  const planned=assignments.map(ids=>{const members=ids.map(id=>byId.get(id)),type=members.length===1?'single':level(members[0])===level(members[1])?(level(members[0])==='low'?'LL':'HH'):'HL';if(type!=='single')summary.counts[type]++;return {members,type};});
  atomic(()=>{
   invalidate(classId);
   db.prepare('INSERT INTO group_batches VALUES(?,?,?,NULL,NULL)').run(classId,randomUUID(),JSON.stringify(summary));
   for(const [i,g] of planned.entries()){const id=randomUUID();db.prepare('INSERT INTO student_groups VALUES(?,?,?,?,NULL)').run(id,classId,i+1,g.type);for(const s of g.members)db.prepare('INSERT INTO group_members VALUES(?,?,?,?,0)').run(s.id,id,s.total,level(s));}
  });
 }
 function resetQuota(actor,classId,lessonId){if(!classId)fail('请选择班级');scope(actor,classId);db.prepare('DELETE FROM knowledge_usage WHERE lesson_id=? AND group_id IN (SELECT id FROM student_groups WHERE class_id=?)').run(lessonId,classId);}
 return {invalidate,ensure,student,report,approve,join,edit,quota,resetQuota};
}
