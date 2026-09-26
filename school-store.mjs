import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,randomInt,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pinyin} from 'pinyin-pro';
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
  const u=manager(actor);if(u.role==='teacher'){if(classId&&classId!==u.class_id)fail('不能访问其他班级',403);return {role:u.role,classId:u.class_id||'none'};}
  return {role:classId?'filtered':'admin',classId};
 }
 function classroom(actor,p){
  const u=manager(actor);if(u.role==='teacher'){if(p.classId&&p.classId!==u.class_id)fail('不能访问其他班级',403);return db.prepare('SELECT * FROM classes WHERE id=? AND teacher_id=?').get(u.class_id,u.id)||fail('班级不存在');}
  if(p.classId)return db.prepare('SELECT * FROM classes WHERE id=?').get(p.classId)||fail('请选择有效班级');
  if(typeof p.className!=='string'||!p.className.trim()||p.className.length>80)fail('请填写班级');
  const name=p.className.trim(),existing=db.prepare('SELECT * FROM classes WHERE name=? AND teacher_id IS NULL').get(name);if(existing)return existing;
  const c={id:randomUUID(),name};db.prepare('INSERT INTO classes VALUES(?,?,NULL,?)').run(c.id,name,now());return c;
 }
 function targetStudent(id,actor){const u=getUser(id),s=scope(actor);if(!u||u.role!=='student'||(s.role!=='admin'&&u.class_id!==s.classId))fail('学生不存在或无权访问',403);return u;}
 function insertStudent(p,hash,c){const id=randomUUID();db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,class_id,age,credential) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,p.username,hash,'student',p.name.trim(),p.gender,c.name,now(),c.id,p.age?Number(p.age):null,vault.encrypt(p.password));return profile(getUser(id));}
 const store={
  close(){db.close();},
  classes(actor){const u=manager(actor);return db.prepare("SELECT c.id,c.name,u.name AS teacherName,u.username AS teacherUsername FROM classes c LEFT JOIN users u ON u.id=c.teacher_id WHERE (?='admin' OR c.teacher_id=?) ORDER BY c.name,c.created_at").all(u.role,u.id);},
  students(actor,classId=''){const s=scope(actor,classId);return db.prepare("SELECT * FROM users WHERE role='student' AND (?='admin' OR class_id=?) ORDER BY class_name,name,username").all(s.role,s.classId).map(profile);},
  studentCredentials(actor,classId=''){return this.students(actor,classId).map(s=>({...s,password:vault.decrypt(getUser(s.id).credential)||'未保存'}));},
  teachers(actor){if(manager(actor).role!=='admin')fail('仅管理员可以访问',403);return db.prepare("SELECT * FROM users WHERE role='teacher' ORDER BY created_at").all().map(u=>({...profile(u),password:vault.decrypt(u.credential)}));},
  async registerTeacher(p){
   validateAccount(p);if(typeof p.className!=='string'||!p.className.trim()||p.className.length>80)fail('请填写班级');
   const hash=await passwordHash(p.password);
   return transaction(()=>{const id=randomUUID(),classId=randomUUID();db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,class_id,credential) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,p.username,hash,'teacher',p.name.trim(),'未填写',p.className.trim(),now(),classId,vault.encrypt(p.password));db.prepare('INSERT INTO classes VALUES(?,?,?,?)').run(classId,p.className.trim(),id,now());return profile(getUser(id));});
  },
  async editTeacher(id,p,actor){
   if(manager(actor).role!=='admin')fail('仅管理员可以访问',403);const u=getUser(id);if(!u||u.role!=='teacher')fail('教师不存在',404);validateAccount({...u,...p,password:p.password||''},false);
   if(typeof p.className!=='string'||!p.className.trim()||p.className.length>80)fail('请填写班级');
   const hash=p.password?await passwordHash(p.password):u.password;
   return transaction(()=>{db.prepare('UPDATE users SET username=?,name=?,password=?,credential=?,active=?,class_name=? WHERE id=?').run(p.username,p.name.trim(),hash,p.password?vault.encrypt(p.password):u.credential,p.active===false?0:1,p.className.trim(),id);db.prepare('UPDATE classes SET name=? WHERE id=?').run(p.className.trim(),u.class_id);db.prepare("UPDATE users SET class_name=? WHERE role='student' AND class_id=?").run(p.className.trim(),u.class_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(getUser(id));});
  },
  async addStudent(p,actor){validateStudent(p);const hash=await passwordHash(p.password);return transaction(()=>insertStudent(p,hash,classroom(actor,p)));},
  deleteStudent(id,actor){return transaction(()=>{targetStudent(id,actor);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM scores WHERE user_id=?').run(id);db.prepare('DELETE FROM conversations WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);});},
  deleteScores(id,actor){targetStudent(id,actor);db.prepare('DELETE FROM scores WHERE user_id=?').run(id);},
  deleteConversation(id,actor){const row=db.prepare('SELECT user_id FROM conversations WHERE id=?').get(id);if(!row)fail('记录不存在',404);targetStudent(row.user_id,actor);db.prepare('DELETE FROM conversations WHERE id=?').run(id);},
  deleteTeacher(id,actor){
   const admin=manager(actor);if(admin.role!=='admin')fail('仅管理员可以访问',403);
   return transaction(()=>{const u=getUser(id);if(!u||u.role!=='teacher')fail('教师不存在',404);db.prepare('UPDATE classes SET teacher_id=NULL WHERE teacher_id=?').run(id);db.prepare('UPDATE imports SET user_id=? WHERE user_id=?').run(admin.id,id);for(const table of ['sessions','scores','conversations'])db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);});
  },
  async editStudent(id,p,actor){
   const u=targetStudent(id,actor);validateStudent(p,false);const hash=p.password?await passwordHash(p.password):u.password;
   return transaction(()=>{targetStudent(id,actor);const c=classroom(actor,{...p,classId:p.classId||u.class_id});db.prepare('UPDATE users SET username=?,password=?,credential=?,name=?,gender=?,class_name=?,class_id=?,age=?,active=? WHERE id=?').run(p.username,hash,p.password?vault.encrypt(p.password):u.credential,p.name.trim(),p.gender,c.name,c.id,p.age?Number(p.age):null,p.active===false?0:1,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(getUser(id));});
  },
  async importStudents(rows,fingerprint,actor,classId){
   const c=classroom(actor,{classId});
   if(db.prepare('SELECT id FROM imports WHERE class_id=? AND fingerprint=?').get(c.id,fingerprint))return {created:0,alreadyImported:true};
   const prepared=[];for(const row of rows){const password=String(randomInt(10000000,100000000));prepared.push({...row,password,hash:await passwordHash(password)});}
   return transaction(()=>{
    classroom(actor,{classId:c.id});if(db.prepare('SELECT id FROM imports WHERE class_id=? AND fingerprint=?').get(c.id,fingerprint))return {created:0,alreadyImported:true};
    for(const row of prepared){const base=studentAccountBase(row.name);let username=base+'_student',n=2;while(db.prepare('SELECT id FROM users WHERE username=?').get(username))username=`${base}${n++}_student`;insertStudent({...row,username},row.hash,c);}
    db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(randomUUID(),actor.id,fingerprint,c.id,now());return {created:rows.length,alreadyImported:false};
   });
  },
  async login(username,password){const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);if(!u||!u.active){await scrypt(password,'unknown-user-timing',64);return null;}if(!await matches(password,u.password))return null;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token),u.id,csrf,Date.now()+12*60*60*1000);return {token,csrf,user:profile(u)};},
  session(token){if(!token)return null;const s=db.prepare('SELECT s.csrf,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hashToken(token),Date.now());return s?{user:profile(s),csrf:s.csrf}:null;},
  logout(token){db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));},
  scores(userId){return db.prepare('SELECT quiz_id AS quizId,version,score,correct,total,created_at AS createdAt FROM scores WHERE user_id=? ORDER BY created_at').all(userId);},
  ready(userId){return quizzes.every(q=>this.scores(userId).some(s=>s.quizId===q.id&&s.version===q.version));},
  submit(userId,quizId,answers){const q=quizzes.find(q=>q.id===quizId);if(!q)fail('测验不存在');const old=this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);if(old)return old;if(quizzes.slice(0,quizzes.indexOf(q)).some(p=>!this.scores(userId).some(s=>s.quizId===p.id&&s.version===p.version)))fail('请先完成上一份测验');if(!answers||Array.isArray(answers)||Object.keys(answers).length!==q.questions.length||q.questions.some(item=>!item.options.some(o=>o.id===answers[item.id])))fail('请完成全部题目，不会的题目可选“我不知道”');const correct=q.questions.filter(item=>answers[item.id]===item.answer).length;db.prepare('INSERT INTO scores VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),userId,q.id,q.version,correct*10,correct,q.questions.length,JSON.stringify(answers),now());return this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);},
  allScores(actor,classId=''){const scopeValue=scope(actor,classId);return db.prepare(`SELECT u.id AS studentId,u.name,u.gender,u.class_name AS className,u.username,s.quiz_id AS quizId,s.version,s.score,s.correct,s.total,s.answers,s.created_at AS createdAt FROM scores s JOIN users u ON u.id=s.user_id WHERE (?='admin' OR u.class_id=?) ORDER BY s.created_at DESC`).all(scopeValue.role,scopeValue.classId);},
  conversations(userId='',limit=500,offset=0,actor,classId=''){const s=scope(actor,classId);if(userId)targetStudent(userId,actor);return db.prepare(`SELECT c.id,u.name,u.gender,u.class_name AS className,u.username,c.agent,c.lesson_id AS lessonId,c.stage,c.user_text AS userText,c.reply,c.source,c.status,c.created_at AS createdAt,c.answered_at AS answeredAt FROM conversations c JOIN users u ON u.id=c.user_id WHERE (?='' OR c.user_id=?) AND (?='admin' OR u.class_id=?) ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(userId,userId,s.role,s.classId,limit,offset);},
  begin(userId,agent,p){const id=randomUUID();db.prepare('INSERT INTO conversations(id,user_id,turn_id,agent,lesson_id,stage,user_text,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,userId,p.id||randomUUID(),agent,p.lessonId||'unknown',p.stage||null,p.text,'pending',now());return id;},
  finish(id,result){db.prepare('UPDATE conversations SET reply=?,source=?,status=?,answered_at=? WHERE id=?').run(result.content,result.source,'complete',now(),id);},
  fail(id){db.prepare("UPDATE conversations SET status='failed',answered_at=? WHERE id=?").run(now(),id);}
 };
 db.prepare("UPDATE conversations SET status='interrupted' WHERE status='pending'").run();
 if(!db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()){
  if(!bootstrap.username||!bootstrap.password||bootstrap.password.length<12){db.close();throw new Error('首次启动需设置管理员账号和至少12位的密码');}
  db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,credential) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),bootstrap.username,await passwordHash(bootstrap.password),'admin','管理员','未填写','',now(),vault.encrypt(bootstrap.password));
 }
 // Recover only the known bootstrap password after verifying its existing hash.
 const legacy=db.prepare("SELECT * FROM users WHERE role='admin' AND username=? AND credential IS NULL").get(bootstrap.username||'');
 if(legacy&&bootstrap.password&&await matches(bootstrap.password,legacy.password))db.prepare('UPDATE users SET credential=? WHERE id=?').run(vault.encrypt(bootstrap.password),legacy.id);
 return store;
}
