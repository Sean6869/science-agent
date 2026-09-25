import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const scrypt=promisify(scryptCallback);
export const quizzes=JSON.parse(readFileSync(new URL('./quizzes.json',import.meta.url),'utf8'));
export const publicQuizzes=quizzes.map(q=>({...q,questions:q.questions.map(({answer,...question})=>question)}));
const hashToken=t=>createHash('sha256').update(t).digest('hex');
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');return `${salt}:${Buffer.from(await scrypt(password,salt,64)).toString('hex')}`;}
async function matches(password,stored){const [salt,key]=stored.split(':');const actual=Buffer.from(await scrypt(password,salt,64));return timingSafeEqual(actual,Buffer.from(key,'hex'));}
export function validateStudent(p,creating=true){
 if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.className!=='string'||!p.className.trim()||p.className.length>80||!['男','女','未填写'].includes(p.gender)||typeof p.username!=='string'||! /^[a-zA-Z0-9_.-]{3,40}$/.test(p.username))throw new Error('请填写姓名、班级、性别；账号须为3–40位字母、数字或 _ . -');
 if((creating||p.password)&& (typeof p.password!=='string'||p.password.length<8||p.password.length>128))throw new Error('密码须为8–128位');
}
export async function openSchoolStore(filename,bootstrap={}){
 if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true});
 const db=new DatabaseSync(filename);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('teacher','student')),name TEXT NOT NULL,gender TEXT NOT NULL,class_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),quiz_id TEXT NOT NULL,version INTEGER NOT NULL,score INTEGER NOT NULL,correct INTEGER NOT NULL,total INTEGER NOT NULL,answers TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,quiz_id,version));
 CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),turn_id TEXT NOT NULL,agent TEXT NOT NULL,lesson_id TEXT NOT NULL,stage INTEGER,user_text TEXT NOT NULL,reply TEXT,source TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,answered_at TEXT);
 CREATE INDEX IF NOT EXISTS conversation_user ON conversations(user_id,created_at);
 CREATE INDEX IF NOT EXISTS conversation_turn ON conversations(user_id,agent,turn_id);`);
 const profile=u=>u&&({id:u.id,username:u.username,role:u.role,name:u.name,gender:u.gender,className:u.class_name,active:!!u.active});
 const store={
  close(){db.close();},
  students(){return db.prepare("SELECT * FROM users WHERE role='student' ORDER BY class_name,name").all().map(profile);},
  async addStudent(p){validateStudent(p);const id=randomUUID();try{db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,p.username,await passwordHash(p.password),'student',p.name.trim(),p.gender,p.className.trim(),new Date().toISOString());}catch(e){if(String(e.message).includes('UNIQUE'))throw new Error('账号已存在');throw e;}return profile(db.prepare('SELECT * FROM users WHERE id=?').get(id));},
  async editStudent(id,p){validateStudent(p,false);const u=db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(id);if(!u)throw new Error('学生不存在');const password=p.password?await passwordHash(p.password):u.password;try{db.prepare('UPDATE users SET username=?,password=?,name=?,gender=?,class_name=?,active=? WHERE id=?').run(p.username,password,p.name.trim(),p.gender,p.className.trim(),p.active===false?0:1,id);}catch(e){if(String(e.message).includes('UNIQUE'))throw new Error('账号已存在');throw e;}db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(db.prepare('SELECT * FROM users WHERE id=?').get(id));},
  async login(username,password){const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);if(!u||!u.active){await scrypt(password,'unknown-user-timing',64);return null;}if(!await matches(password,u.password))return null;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token),u.id,csrf,Date.now()+12*60*60*1000);return {token,csrf,user:profile(u)};},
  session(token){if(!token)return null;const s=db.prepare('SELECT s.csrf,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hashToken(token),Date.now());return s?{user:profile(s),csrf:s.csrf}:null;},
  logout(token){db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));},
  scores(userId){return db.prepare('SELECT quiz_id AS quizId,version,score,correct,total,created_at AS createdAt FROM scores WHERE user_id=? ORDER BY created_at').all(userId);},
  ready(userId){const scores=this.scores(userId);return quizzes.every(q=>scores.some(s=>s.quizId===q.id&&s.version===q.version));},
  submit(userId,quizId,answers){const q=quizzes.find(q=>q.id===quizId);if(!q)throw new Error('测验不存在');const old=this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);if(old)return old;const previous=quizzes.slice(0,quizzes.indexOf(q));if(previous.some(p=>!this.scores(userId).some(s=>s.quizId===p.id&&s.version===p.version)))throw new Error('请先完成上一份测验');if(!answers||Array.isArray(answers)||Object.keys(answers).length!==q.questions.length||q.questions.some(item=>!item.options.some(o=>o.id===answers[item.id])))throw new Error('请完成全部题目，不会的题目可选“我不知道”');const correct=q.questions.filter(item=>answers[item.id]===item.answer).length;db.prepare('INSERT INTO scores VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),userId,q.id,q.version,correct*10,correct,q.questions.length,JSON.stringify(answers),new Date().toISOString());return this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);},
  allScores(){return db.prepare(`SELECT u.id AS studentId,u.name,u.gender,u.class_name AS className,u.username,s.quiz_id AS quizId,s.version,s.score,s.correct,s.total,s.answers,s.created_at AS createdAt FROM scores s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC`).all();},
  conversations(userId='',limit=500,offset=0){return db.prepare(`SELECT c.id,u.name,u.gender,u.class_name AS className,u.username,c.agent,c.lesson_id AS lessonId,c.stage,c.user_text AS userText,c.reply,c.source,c.status,c.created_at AS createdAt,c.answered_at AS answeredAt FROM conversations c JOIN users u ON u.id=c.user_id WHERE (?='' OR c.user_id=?) ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(userId,userId,limit,offset);},
  begin(userId,agent,p){const id=randomUUID();db.prepare('INSERT INTO conversations(id,user_id,turn_id,agent,lesson_id,stage,user_text,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,userId,p.id||randomUUID(),agent,p.lessonId||'unknown',p.stage||null,p.text,'pending',new Date().toISOString());return id;},
  finish(id,result){db.prepare('UPDATE conversations SET reply=?,source=?,status=?,answered_at=? WHERE id=?').run(result.content,result.source,'complete',new Date().toISOString(),id);},
  fail(id){db.prepare("UPDATE conversations SET status='failed',answered_at=? WHERE id=?").run(new Date().toISOString(),id);}
 };
 // Restarted requests are visible to the teacher rather than remaining pending forever.
 db.prepare("UPDATE conversations SET status='interrupted' WHERE status='pending'").run();
 if(!db.prepare("SELECT id FROM users WHERE role='teacher' LIMIT 1").get()){
  if(!bootstrap.username||!bootstrap.password||bootstrap.password.length<12) {db.close();throw new Error('首次启动需设置 TEACHER_USERNAME 和至少12位的 TEACHER_PASSWORD');}
  db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),bootstrap.username,await passwordHash(bootstrap.password),'teacher','教师','未填写','',new Date().toISOString());
 }
 return store;
}
