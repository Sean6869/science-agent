import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,randomInt,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pinyin} from 'pinyin-pro';
import {createGroupStore} from './school-groups.mjs';
import {credentialVault,migrateSchool} from './school-credentials.mjs';
const scrypt=promisify(scryptCallback),now=()=>new Date().toISOString();
export const quizzes=JSON.parse(readFileSync(new URL('./quizzes.json',import.meta.url),'utf8'));
export const publicQuizzes=quizzes.map(q=>({...q,questions:q.questions.map(({answer,...question})=>question)}));
const hashToken=t=>createHash('sha256').update(t).digest('hex');
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');return `${salt}:${Buffer.from(await scrypt(password,salt,64)).toString('hex')}`;}
async function matches(password,stored){const [salt,key]=stored.split(':');return timingSafeEqual(Buffer.from(await scrypt(password,salt,64)),Buffer.from(key,'hex'));}
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function validateAccount(p,creating=true){
 if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.username!=='string'||! /^[a-zA-Z0-9_.-]{3,40}$/.test(p.username))fail('请填写姓名；账号须为3–40位字母、数字或 _ . -');
 if((creating||p.password)&&(typeof p.password!=='string'||p.password.length<8||p.password.length>128))fail('密码须为8–128位');
}
export function validateStudent(p,creating=true){
 validateAccount(p,creating);
 if(!['男','女','未填写'].includes(p.gender))fail('请选择有效的性别');
 if(p.age!==undefined&&p.age!==null&&p.age!==''&&(!Number.isInteger(Number(p.age))||Number(p.age)<1||Number(p.age)>120))fail('年龄须为1–120的整数');
}
export function studentAccountBase(name){return pinyin(name,{toneType:'none',surname:'head',type:'array'}).join('').replaceAll('ü','v').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,25)||'student';}

export async function openSchoolStore(filename,bootstrap={}){
 if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true});
 const db=new DatabaseSync(filename);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),name TEXT NOT NULL,gender TEXT NOT NULL,class_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,class_id TEXT,age INTEGER,credential TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),quiz_id TEXT NOT NULL,version INTEGER NOT NULL,score INTEGER NOT NULL,correct INTEGER NOT NULL,total INTEGER NOT NULL,answers TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,quiz_id,version));
 CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),turn_id TEXT NOT NULL,agent TEXT NOT NULL,lesson_id TEXT NOT NULL,stage INTEGER,user_text TEXT NOT NULL,reply TEXT,source TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,answered_at TEXT);
 CREATE INDEX IF NOT EXISTS conversation_user ON conversations(user_id,created_at);
 CREATE INDEX IF NOT EXISTS conversation_turn ON conversations(user_id,agent,turn_id);`);
 migrateSchool(db);
 const vault=credentialVault(filename,!!db.prepare('SELECT id FROM users WHERE credential IS NOT NULL LIMIT 1').get());
 const profile=u=>u&&({id:u.id,username:u.username,role:u.role,name:u.name,gender:u.gender,className:u.class_name,classId:u.class_id,age:u.age,active:!!u.active});
 const getUser=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');if(String(error.message).includes('UNIQUE'))fail('账号已存在');throw error;}}
 function manager(actor){const current=actor?getUser(actor.id):null;if(!current?.active||!['admin','teacher'].includes(current.role))fail('没有管理权限',403);return current;}
 function scope(actor,classId=''){
  const u=manager(actor);if(classId){const c=db.prepare('SELECT * FROM classes WHERE id=?').get(classId);if(!c||(u.role!=='admin'&&c.teacher_id!==u.id))fail('不能访问其他班级',403);}
  return {owner:u.role==='admin'?'':u.id,classId};
 }
 function classroom(actor,p){
  const u=manager(actor);if(p.classId){scope(actor,p.classId);return db.prepare('SELECT * FROM classes WHERE id=?').get(p.classId);}
  if(typeof p.className!=='string'||!p.className.trim()||p.className.length>80)fail('请填写班级');
  const name=p.className.trim(),owner=u.role==='teacher'?u.id:null,existing=db.prepare('SELECT * FROM classes WHERE name=? AND teacher_id IS ?').get(name,owner);if(existing)return existing;
  const c={id:randomUUID(),name};db.prepare('INSERT INTO classes VALUES(?,?,?,?)').run(c.id,name,owner,now());return c;
 }
 function targetStudent(id,actor){const u=getUser(id);if(!u||u.role!=='student')fail('学生不存在或无权访问',403);scope(actor,u.class_id);return u;}
 const scopedWhere="(?='' OR u.class_id IN (SELECT id FROM classes WHERE teacher_id=?)) AND (?='' OR u.class_id=?)";
 const scopeArgs=(actor,classId='')=>{const s=scope(actor,classId);return [s.owner,s.owner,s.classId,s.classId];};
 function insertStudent(p,hash,c){const id=randomUUID();groups.invalidate(c.id);db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,class_id,age,credential) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,p.username,hash,'student',p.name.trim(),p.gender,c.name,now(),c.id,p.age?Number(p.age):null,vault.encrypt(p.password));return profile(getUser(id));}
 const groups=createGroupStore(db,{quizzes,getUser,scope,fail});
 const store={
  close(){db.close();},
  classes(actor){const u=manager(actor);return db.prepare("SELECT c.id,c.name,u.name AS teacherName,u.username AS teacherUsername FROM classes c LEFT JOIN users u ON u.id=c.teacher_id WHERE (?='admin' OR c.teacher_id=?) ORDER BY c.name,c.created_at").all(u.role,u.id);},
  assignClass(classId,teacherId,actor){if(manager(actor).role!=='admin')fail('仅管理员可以分配班级',403);scope(actor,classId);const t=getUser(teacherId);if(!classId||!t||t.role!=='teacher'||!t.active)fail('请选择班级和启用的教师');db.prepare('UPDATE classes SET teacher_id=? WHERE id=?').run(t.id,classId);},
  students(actor,classId=''){return db.prepare("SELECT u.* FROM users u WHERE u.role='student' AND "+scopedWhere+" ORDER BY u.class_name,u.name,u.username").all(...scopeArgs(actor,classId)).map(profile);},
  studentCredentials(actor,classId=''){return this.students(actor,classId).map(s=>({...s,password:vault.decrypt(getUser(s.id).credential)||'未保存'}));},
  teachers(actor){if(manager(actor).role!=='admin')fail('仅管理员可以访问',403);return db.prepare("SELECT * FROM users WHERE role='teacher' ORDER BY created_at").all().map(u=>({...profile(u),className:db.prepare('SELECT name FROM classes WHERE teacher_id=? ORDER BY name').all(u.id).map(c=>c.name).join('、'),password:vault.decrypt(u.credential)}));},
  async registerTeacher(p){validateAccount(p);const hash=await passwordHash(p.password);return transaction(()=>{const id=randomUUID();db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,credential) VALUES(?,?,?,?,?,?,?,?,?)').run(id,p.username,hash,'teacher',p.name.trim(),'未填写','',now(),vault.encrypt(p.password));return profile(getUser(id));});},
  async editTeacher(id,p,actor){
   if(manager(actor).role!=='admin')fail('仅管理员可以访问',403);const u=getUser(id);if(!u||u.role!=='teacher')fail('教师不存在',404);validateAccount({...u,...p,password:p.password||''},false);
   const hash=p.password?await passwordHash(p.password):u.password;
   return transaction(()=>{db.prepare('UPDATE users SET username=?,name=?,password=?,credential=?,active=? WHERE id=?').run(p.username,p.name.trim(),hash,p.password?vault.encrypt(p.password):u.credential,p.active===false?0:1,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(getUser(id));});
  },
  async addStudent(p,actor){validateStudent(p);const duplicate=db.prepare('SELECT * FROM users WHERE username=?').get(p.username);if(duplicate){const owner=manager(actor);if(owner.role==='teacher'&&duplicate.role==='student'){const c=db.prepare('SELECT teacher_id FROM classes WHERE id=?').get(duplicate.class_id);if(c?.teacher_id!==owner.id)fail('账号已存在，但未归属当前教师，请联系管理员在班级归属中核查分配');}fail('账号已存在，请在学生列表中编辑原账号');}const hash=await passwordHash(p.password);return transaction(()=>insertStudent(p,hash,classroom(actor,p)));},
  deleteStudent(id,actor){return transaction(()=>{groups.invalidate(targetStudent(id,actor).class_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM scores WHERE user_id=?').run(id);db.prepare('DELETE FROM conversations WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);});},
  deleteScores(id,actor){transaction(()=>{groups.invalidate(targetStudent(id,actor).class_id);db.prepare('DELETE FROM scores WHERE user_id=?').run(id);});},
  deleteConversation(id,actor){const row=db.prepare('SELECT user_id FROM conversations WHERE id=?').get(id);if(!row)fail('记录不存在',404);targetStudent(row.user_id,actor);db.prepare('DELETE FROM conversations WHERE id=?').run(id);},
  deleteTeacher(id,actor){
   const admin=manager(actor);if(admin.role!=='admin')fail('仅管理员可以访问',403);
   return transaction(()=>{const u=getUser(id);if(!u||u.role!=='teacher')fail('教师不存在',404);db.prepare('UPDATE classes SET teacher_id=NULL WHERE teacher_id=?').run(id);db.prepare('UPDATE imports SET user_id=? WHERE user_id=?').run(admin.id,id);for(const table of ['sessions','scores','conversations'])db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);});
  },
  async editStudent(id,p,actor){
   const u=targetStudent(id,actor);validateStudent(p,false);const hash=p.password?await passwordHash(p.password):u.password;
   return transaction(()=>{targetStudent(id,actor);const c=classroom(actor,{...p,classId:p.classId||(!p.className?u.class_id:undefined)});if(c.id!==u.class_id||p.gender!==u.gender||(p.active!==false)!==!!u.active){groups.invalidate(u.class_id);groups.invalidate(c.id);}db.prepare('UPDATE users SET username=?,password=?,credential=?,name=?,gender=?,class_name=?,class_id=?,age=?,active=? WHERE id=?').run(p.username,hash,p.password?vault.encrypt(p.password):u.credential,p.name.trim(),p.gender,c.name,c.id,p.age?Number(p.age):null,p.active===false?0:1,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(getUser(id));});
  },
  async importStudents(rows,fingerprint,actor){
   manager(actor);const prepared=[];for(const row of rows){const password=String(randomInt(10000000,100000000));prepared.push({...row,password,hash:await passwordHash(password)});}
   return transaction(()=>{let created=0;const batches=Map.groupBy(prepared,row=>row.className);
    for(const [className,batch] of batches){const c=classroom(actor,{className});if(db.prepare('SELECT id FROM imports WHERE class_id=? AND fingerprint=?').get(c.id,fingerprint))continue;
     for(const row of batch){const base=studentAccountBase(row.name);let username=base+'_student',n=2;while(db.prepare('SELECT id FROM users WHERE username=?').get(username))username=base+(n++)+'_student';insertStudent({...row,username},row.hash,c);created++;}
     db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(randomUUID(),actor.id,fingerprint,c.id,now());
    }return {created,alreadyImported:created===0};});
  },
  async login(username,password){const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);if(!u||!u.active){await scrypt(password,'unknown-user-timing',64);return null;}if(!await matches(password,u.password))return null;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token),u.id,csrf,Date.now()+12*60*60*1000);return {token,csrf,user:profile(u)};},
  session(token){if(!token)return null;const s=db.prepare('SELECT s.csrf,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hashToken(token),Date.now());return s?{user:profile(s),csrf:s.csrf}:null;},
  logout(token){db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));},
  scores(userId){return db.prepare('SELECT quiz_id AS quizId,version,score,correct,total,created_at AS createdAt FROM scores WHERE user_id=? ORDER BY created_at').all(userId);},
  ready(userId){return quizzes.every(q=>this.scores(userId).some(s=>s.quizId===q.id&&s.version===q.version));},
  submit(userId,quizId,answers){const q=quizzes.find(q=>q.id===quizId);if(!q)fail('测验不存在');const old=this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);if(old)return old;if(quizzes.slice(0,quizzes.indexOf(q)).some(p=>!this.scores(userId).some(s=>s.quizId===p.id&&s.version===p.version)))fail('请先完成上一份测验');if(!answers||Array.isArray(answers)||Object.keys(answers).length!==q.questions.length||q.questions.some(item=>!item.options.some(o=>o.id===answers[item.id])))fail('请完成全部题目，不会的题目可选“我不知道”');const correct=q.questions.filter(item=>answers[item.id]===item.answer).length;db.prepare('INSERT INTO scores VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),userId,q.id,q.version,correct*10,correct,q.questions.length,JSON.stringify(answers),now());groups.ensure(getUser(userId).class_id);return this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);},
  allScores(actor,classId=''){return db.prepare('SELECT u.id AS studentId,u.name,u.gender,u.class_name AS className,u.username,s.quiz_id AS quizId,s.version,s.score,s.correct,s.total,s.answers,s.created_at AS createdAt FROM scores s JOIN users u ON u.id=s.user_id WHERE '+scopedWhere+' ORDER BY s.created_at DESC').all(...scopeArgs(actor,classId));},
  conversations(userId='',limit=500,offset=0,actor,classId=''){const args=scopeArgs(actor,classId);if(userId)targetStudent(userId,actor);return db.prepare("SELECT c.id,u.name,u.gender,u.class_name AS className,u.username,c.agent,c.lesson_id AS lessonId,c.stage,c.user_text AS userText,c.reply,c.source,c.status,c.created_at AS createdAt,c.answered_at AS answeredAt FROM conversations c JOIN users u ON u.id=c.user_id WHERE (?='' OR c.user_id=?) AND "+scopedWhere+' ORDER BY c.created_at DESC LIMIT ? OFFSET ?').all(userId,userId,...args,limit,offset);},
  completed(userId){return this.scores(userId).map(({quizId,version})=>({quizId,version}));},
  approveGroups(actor,classId,batchId){return groups.approve(actor,classId,batchId);},
  groupStatus(userId){return groups.student(userId);},
  joinGroup(userId,code){return groups.join(userId,code);},
  listGroups(actor,classId=''){scope(actor,classId);return this.classes(actor).filter(c=>!classId||c.id===classId).map(c=>groups.report(c));},
  begin(userId,agent,p){const id=randomUUID();db.prepare('INSERT INTO conversations(id,user_id,turn_id,agent,lesson_id,stage,user_text,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,userId,p.id||randomUUID(),agent,p.lessonId||'unknown',p.stage||null,p.text,'pending',now());return id;},
  finish(id,result){db.prepare('UPDATE conversations SET reply=?,source=?,status=?,answered_at=? WHERE id=?').run(result.content,result.source,'complete',now(),id);},
  fail(id){db.prepare("UPDATE conversations SET status='failed',answered_at=? WHERE id=?").run(now(),id);}
 };
 db.prepare("UPDATE conversations SET status='interrupted' WHERE status='pending'").run();
 // Railway configuration is authoritative for the deployment administrator.
 try{
  const admins=db.prepare("SELECT * FROM users WHERE role='admin'").all();
  if(bootstrap.username!==undefined||bootstrap.password!==undefined||!admins.length){
   const username=typeof bootstrap.username==='string'?bootstrap.username.trim():'',password=bootstrap.password;
   if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||typeof password!=='string'||password.length<12||password.length>128)fail('请设置有效的 ADMIN_USERNAME 和 ADMIN_PASSWORD（密码12–128位）');
   db.exec('CREATE TABLE IF NOT EXISTS deployment_admin(id INTEGER PRIMARY KEY CHECK(id=1),user_id TEXT NOT NULL REFERENCES users(id))');
   const tracked=db.prepare('SELECT user_id FROM deployment_admin WHERE id=1').get();
   const existing=tracked?getUser(tracked.user_id):(admins.find(u=>u.username.toLowerCase()===username.toLowerCase())||(admins.length===1?admins[0]:null));
   if(admins.length&&!existing)fail('无法确定部署管理员，请使用现有管理员账号配置 ADMIN_USERNAME');
   const collision=db.prepare('SELECT id FROM users WHERE username=?').get(username);
   if(collision&&collision.id!==existing?.id)fail('ADMIN_USERNAME 与其他账号重复，请使用独立的管理员账号');
   const changed=!existing||existing.username!==username||!existing.active||!await matches(password,existing.password);
   const hash=changed?await passwordHash(password):existing.password;
   transaction(()=>{
    const id=existing?.id||randomUUID();
    if(existing){if(!existing.credential)db.prepare('UPDATE users SET credential=? WHERE id=?').run(vault.encrypt(password),id);if(changed){db.prepare('UPDATE users SET username=?,password=?,credential=?,active=1 WHERE id=?').run(username,hash,vault.encrypt(password),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}}
    else db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,credential) VALUES(?,?,?,?,?,?,?,?,?)').run(id,username,hash,'admin','管理员','未填写','',now(),vault.encrypt(password));
    db.prepare('INSERT INTO deployment_admin VALUES(1,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id').run(id);
   });
  }
 }catch(error){db.close();throw error;}
 return store;
}
