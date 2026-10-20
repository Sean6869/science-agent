import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,randomInt,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pinyin} from 'pinyin-pro';
import {createGroupStore} from './school-groups.mjs';
import {credentialVault,migrateSchool} from './school-credentials.mjs';
import {isSelfAssessmentText} from './public/turn-kind.js';
import {lessons} from './lessons.mjs';
import {reasoningTest} from './reasoning-test.mjs';
const scrypt=promisify(scryptCallback),now=()=>new Date().toISOString();
export const SESSION_IDLE_MS=30*60*1000;
export const DEFAULT_STAGE_DURATIONS=Object.freeze([300,300,300,300,300,300]);
export const quizzes=JSON.parse(readFileSync(new URL('./quizzes.json',import.meta.url),'utf8'));
export const publicQuizzes=quizzes.map(q=>({...q,questions:q.questions.map(({answer,...question})=>question)}));
const posttestBank=quizzes.flatMap(quiz=>quiz.questions.map(question=>({...question,id:`${quiz.id}:${question.id}`,sourceQuizId:quiz.id})));
const publicPosttest=new Map(posttestBank.map(({answer,...question})=>[question.id,question]));
// One versioned, deterministic order is shared by every student. The salt keeps
// the posttest order distinct from the three pretests concatenated in source order.
const FIXED_POSTTEST_ORDER=Object.freeze(posttestBank.map(question=>question.id).sort((a,b)=>createHash('sha256').update(`xiaoke-posttest-order-v1:${a}`).digest().compare(createHash('sha256').update(`xiaoke-posttest-order-v1:${b}`).digest())));
export const fixedPosttestQuestions=Object.freeze(FIXED_POSTTEST_ORDER.map(id=>posttestBank.find(question=>question.id===id)));
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
 if(p.aiEnabled!==undefined&&typeof p.aiEnabled!=='boolean')fail('请选择有效的权限分组');
 if(!['男','女','未填写'].includes(p.gender))fail('请选择有效的性别');
}
export function studentAccountBase(name){
 const text=name.trim(),options={toneType:'none',surname:'head',type:'array'};
 // A two-character familiar address has its surname after the prefix.
 const parts=/^[小老阿][\u4e00-\u9fff]$/.test(text)
  ? [...pinyin(text[0],{toneType:'none',type:'array'}),...pinyin(text.slice(1),options)]
  : pinyin(text,options);
 return parts.join('').replaceAll('ü','v').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,25)||'student';
}

export async function openSchoolStore(filename,bootstrap={}){
 if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true});
 const db=new DatabaseSync(filename);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),name TEXT NOT NULL,gender TEXT NOT NULL,class_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,class_id TEXT,age INTEGER,credential TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),quiz_id TEXT NOT NULL,version INTEGER NOT NULL,score INTEGER NOT NULL,correct INTEGER NOT NULL,total INTEGER NOT NULL,answers TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,quiz_id,version));
 CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),turn_id TEXT NOT NULL,agent TEXT NOT NULL,lesson_id TEXT NOT NULL,stage INTEGER,user_text TEXT NOT NULL,reply TEXT,source TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,answered_at TEXT);
 CREATE INDEX IF NOT EXISTS conversation_user ON conversations(user_id,created_at);
 CREATE INDEX IF NOT EXISTS conversation_turn ON conversations(user_id,agent,turn_id);
 `);
 migrateSchool(db);
 db.exec(`CREATE TABLE IF NOT EXISTS stage_progress(student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,lesson_id TEXT NOT NULL,stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 6),updated_at TEXT NOT NULL,PRIMARY KEY(student_id,lesson_id));`);
 db.exec(`CREATE TABLE IF NOT EXISTS posttest_launches(class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,started_by TEXT NOT NULL,started_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS posttest_results(student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,prediction INTEGER NOT NULL CHECK(prediction BETWEEN 0 AND 30),question_order TEXT NOT NULL,answers TEXT,correct INTEGER,total INTEGER,confidence INTEGER CHECK(confidence BETWEEN 0 AND 100),started_at TEXT NOT NULL,answered_at TEXT,submitted_at TEXT);`);
 db.prepare('UPDATE posttest_results SET question_order=? WHERE question_order<>?').run(JSON.stringify(FIXED_POSTTEST_ORDER),JSON.stringify(FIXED_POSTTEST_ORDER));
 db.exec(`CREATE TABLE IF NOT EXISTS reasoning_results(student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,prediction INTEGER NOT NULL CHECK(prediction BETWEEN 0 AND 100),answers TEXT,score INTEGER CHECK(score BETWEEN 0 AND 100),breakdown TEXT,confidence INTEGER CHECK(confidence BETWEEN 0 AND 100),started_at TEXT NOT NULL,answered_at TEXT,scored_at TEXT,submitted_at TEXT);`);
 db.exec(`CREATE TABLE IF NOT EXISTS group_learning_state(group_id TEXT PRIMARY KEY REFERENCES student_groups(id) ON DELETE CASCADE,lesson_id TEXT NOT NULL,stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 6),updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,updated_at TEXT NOT NULL);`);
 db.exec(`CREATE TABLE IF NOT EXISTS inquiry_record_resets(group_id TEXT NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,lesson_id TEXT NOT NULL,stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 6),after_rowid INTEGER NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(group_id,lesson_id,stage));`);
 db.exec(`CREATE TABLE IF NOT EXISTS student_record_resets(student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,reset_at TEXT NOT NULL);`);
 db.exec(`CREATE TABLE IF NOT EXISTS class_broadcasts(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,sender_id TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS broadcast_reads(broadcast_id TEXT NOT NULL REFERENCES class_broadcasts(id) ON DELETE CASCADE,student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,read_at TEXT NOT NULL,PRIMARY KEY(broadcast_id,student_id));
 CREATE INDEX IF NOT EXISTS broadcast_class_time ON class_broadcasts(class_id,created_at);`);
 if(!db.prepare('PRAGMA table_info(classes)').all().some(c=>c.name==='stage_durations'))db.exec(`ALTER TABLE classes ADD COLUMN stage_durations TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_STAGE_DURATIONS)}'`);
 for(const column of [['ai_enabled','INTEGER NOT NULL DEFAULT 1'],['subject',"TEXT NOT NULL DEFAULT ''"],['school',"TEXT NOT NULL DEFAULT ''"],['avatar',"TEXT NOT NULL DEFAULT ''"],['motto',"TEXT NOT NULL DEFAULT ''"]]){if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name===column[0]))db.exec('ALTER TABLE users ADD COLUMN '+column[0]+' '+column[1]);}
 db.exec("UPDATE users SET avatar='' WHERE avatar<>'' AND avatar NOT LIKE 'data:image/webp;base64,%'");
 for(const column of [['kind','TEXT'],['complete','INTEGER']]){if(!db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name===column[0]))db.exec('ALTER TABLE conversations ADD COLUMN '+column[0]+' '+column[1]);}
 const setLegacyKind=db.prepare('UPDATE conversations SET kind=? WHERE id=?');for(const row of db.prepare("SELECT id,stage,user_text AS text FROM conversations WHERE agent='metacognitive' AND kind IS NULL").all())setLegacyKind.run(row.stage===4?'assessment':isSelfAssessmentText(row.text)?'self_assessment':'content',row.id);
 const vault=credentialVault(filename,!!db.prepare('SELECT id FROM users WHERE credential IS NOT NULL LIMIT 1').get());
 const profile=u=>u&&({id:u.id,username:u.username,role:u.role,name:u.name,gender:u.gender,className:u.class_name,classId:u.class_id,active:!!u.active,aiEnabled:!!u.ai_enabled,subject:u.subject||'',school:u.school||'',avatar:u.avatar||'',motto:u.motto||''});
 const stageDurations=value=>{try{const durations=JSON.parse(value);if(Array.isArray(durations)&&durations.length===6&&durations.every(n=>Number.isInteger(n)&&n>=60&&n<=3600))return durations;}catch{}return [...DEFAULT_STAGE_DURATIONS];};
 const classProfile=({stage_durations,...c})=>({...c,stageDurations:stageDurations(stage_durations)});
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
  const c={id:randomUUID(),name};db.prepare('INSERT INTO classes(id,name,teacher_id,created_at) VALUES(?,?,?,?)').run(c.id,name,owner,now());return c;
 }
 function targetStudent(id,actor){const u=getUser(id);if(!u||u.role!=='student')fail('学生不存在或无权访问',403);scope(actor,u.class_id);return u;}
 const scopedWhere="(?='' OR u.class_id IN (SELECT id FROM classes WHERE teacher_id=?)) AND (?='' OR u.class_id=?)";
 const scopeArgs=(actor,classId='')=>{const s=scope(actor,classId);return [s.owner,s.owner,s.classId,s.classId];};
 function insertStudent(p,hash,c){const id=randomUUID();groups.invalidate(c.id);db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,class_id,age,credential,ai_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,p.username,hash,'student',p.name.trim(),p.gender,c.name,now(),c.id,null,vault.encrypt(p.password),p.aiEnabled===false?0:1);return profile(getUser(id));}
 const groups=createGroupStore(db,{quizzes,getUser,scope,fail});
 const store={
  close(){db.close();},
  deleteClass(id,actor){
   if(manager(actor).role!=='admin')fail('仅管理员可以删除班级',403);
   if(!id||!db.prepare('SELECT id FROM classes WHERE id=?').get(id))fail('班级不存在',404);
   return transaction(()=>{
    groups.invalidate(id);
    for(const table of ['sessions','scores','conversations'])db.prepare(`DELETE FROM ${table} WHERE user_id IN (SELECT id FROM users WHERE class_id=? AND role='student')`).run(id);
    db.prepare('DELETE FROM imports WHERE class_id=?').run(id);
    db.prepare("DELETE FROM users WHERE class_id=? AND role='student'").run(id);
    db.prepare('DELETE FROM classes WHERE id=?').run(id);
   });
  },
  classes(actor){const u=manager(actor);return db.prepare("SELECT c.id,c.name,c.stage_durations,u.name AS teacherName,u.username AS teacherUsername FROM classes c LEFT JOIN users u ON u.id=c.teacher_id WHERE (?='admin' OR c.teacher_id=?) ORDER BY c.name,c.created_at").all(u.role,u.id).map(classProfile);},
  setStageDurations(actor,classId,minutes){scope(actor,classId);if(!classId||!Array.isArray(minutes)||minutes.length!==6||minutes.some(n=>!Number.isInteger(n)||n<1||n>60))fail('六个环节的时长须为1–60分钟整数');const durations=minutes.map(n=>n*60);db.prepare('UPDATE classes SET stage_durations=? WHERE id=?').run(JSON.stringify(durations),classId);return durations;},
  stageDurations(userId){const u=getUser(userId);if(!u||u.role!=='student'||!u.class_id)return [...DEFAULT_STAGE_DURATIONS];const c=db.prepare('SELECT stage_durations FROM classes WHERE id=?').get(u.class_id);return stageDurations(c?.stage_durations);},
  updateStageProgress(userId,lessonId,stage){
   const u=getUser(userId);if(!u||u.role!=='student')fail('仅学生可以更新实验进度',403);
   if(typeof lessonId!=='string'||!lessonId.trim()||!Number.isInteger(stage)||stage<1||stage>6)fail('实验进度无效');
   const current=db.prepare('SELECT stage FROM stage_progress WHERE student_id=? AND lesson_id=?').get(userId,lessonId);
   if(!current){db.prepare('INSERT INTO stage_progress VALUES(?,?,?,?)').run(userId,lessonId,stage,now());return stage;}
   if(stage>current.stage)db.prepare('UPDATE stage_progress SET stage=?,updated_at=? WHERE student_id=? AND lesson_id=?').run(stage,now(),userId,lessonId);
   return Math.max(current.stage,stage);
  },
  groupLearningState(userId){
   const group=db.prepare(`SELECT g.id FROM student_groups g JOIN group_members gm ON gm.group_id=g.id JOIN group_batches b ON b.class_id=g.class_id WHERE gm.user_id=? AND gm.joined=1 AND b.approved_at IS NOT NULL`).get(userId);
   if(!group)fail('请先加入已审核的小组',403);
   const row=db.prepare('SELECT lesson_id AS lessonId,stage,updated_by AS updatedBy,updated_at AS updatedAt FROM group_learning_state WHERE group_id=?').get(group.id);
   return row||null;
  },
  setGroupLearningState(userId,lessonId,stage){
   const u=getUser(userId);if(!u||u.role!=='student')fail('仅学生可以同步学习进度',403);
   if(!lessons.some(lesson=>lesson.id===lessonId)||!Number.isInteger(stage)||stage<1||stage>6)fail('课程进度无效');
   const group=db.prepare(`SELECT g.id FROM student_groups g JOIN group_members gm ON gm.group_id=g.id JOIN group_batches b ON b.class_id=g.class_id WHERE gm.user_id=? AND gm.joined=1 AND b.approved_at IS NOT NULL`).get(userId);
   if(!group)fail('请先加入已审核的小组',403);
   const updatedAt=`${now()}|${randomUUID()}`;
   transaction(()=>{
    db.prepare(`INSERT INTO group_learning_state(group_id,lesson_id,stage,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET lesson_id=excluded.lesson_id,stage=excluded.stage,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(group.id,lessonId,stage,userId,updatedAt);
    for(const member of db.prepare('SELECT user_id AS id FROM group_members WHERE group_id=? AND joined=1 AND user_id IS NOT NULL').all(group.id))this.updateStageProgress(member.id,lessonId,stage);
   });
   return {lessonId,stage,updatedBy:userId,updatedAt};
  },
  posttestEligible(userId){
   const u=getUser(userId);if(!u||u.role!=='student')return false;
   const completed=new Set(db.prepare('SELECT lesson_id FROM stage_progress WHERE student_id=? AND stage=6').all(userId).map(row=>row.lesson_id));
   return lessons.every(lesson=>completed.has(lesson.id));
  },
  posttestStatus(userId){
   const u=getUser(userId);if(!u||u.role!=='student')fail('请使用学生账号',403);
   const launch=u.class_id?db.prepare('SELECT started_at AS startedAt FROM posttest_launches WHERE class_id=?').get(u.class_id):null,eligible=this.posttestEligible(userId);
   if(!launch)return {active:false,eligible,total:posttestBank.length,phase:'inactive'};
   const reset=db.prepare('SELECT reset_at AS resetAt FROM student_record_resets WHERE student_id=?').get(userId);
   if(reset&&launch.startedAt<=reset.resetAt&&!eligible)return {active:false,eligible,total:posttestBank.length,phase:'inactive'};
   const result=db.prepare('SELECT prediction,question_order AS questionOrder,answers,confidence,started_at AS startedAt,answered_at AS answeredAt,submitted_at AS submittedAt FROM posttest_results WHERE student_id=?').get(userId);
   const reasoning=db.prepare('SELECT prediction,answers,score,breakdown,confidence,started_at AS startedAt,answered_at AS answeredAt,scored_at AS scoredAt,submitted_at AS submittedAt FROM reasoning_results WHERE student_id=?').get(userId);
   let phase=!result?'prediction':result.answers===null?'test':result.confidence===null?'confidence':!reasoning?'reasoning_prediction':reasoning.answers===null?'reasoning_test':reasoning.score===null?'reasoning_scoring':reasoning.confidence===null?'reasoning_confidence':'certificate';
   const status={active:true,eligible,total:posttestBank.length,phase,launchKey:reset?`${launch.startedAt}:${reset.resetAt}`:launch.startedAt,startedAt:result?.startedAt||null,submittedAt:result?.submittedAt||null};
   if(phase==='test'){const order=JSON.parse(result.questionOrder);status.questions=order.map(id=>publicPosttest.get(id)).filter(Boolean);}
   if(phase==='reasoning_test')status.reasoningTest=reasoningTest;
   if(phase==='certificate')status.certificate={studentName:u.name,className:u.class_name,completedAt:reasoning.submittedAt};
   return status;
  },
  startPosttest(actor,classId){
   scope(actor,classId);if(!classId)fail('请选择班级');
   const students=this.students(actor,classId).filter(student=>student.active);if(!students.length)fail('班级中没有启用的学生账号');
   const existing=db.prepare('SELECT started_at AS startedAt FROM posttest_launches WHERE class_id=?').get(classId);if(existing)return existing;
   const startedAt=now();db.prepare('INSERT INTO posttest_launches VALUES(?,?,?)').run(classId,actor.id,startedAt);return {startedAt};
  },
  savePosttestPrediction(userId,prediction){
   const value=Number(prediction);if(!Number.isInteger(value)||value<0||value>30)fail('预测题数须为0–30的整数');
   const status=this.posttestStatus(userId);if(!status.active)fail('教师尚未开启课堂测试',409);
   if(db.prepare('SELECT student_id FROM posttest_results WHERE student_id=?').get(userId))return this.posttestStatus(userId);
   db.prepare('INSERT INTO posttest_results(student_id,prediction,question_order,started_at) VALUES(?,?,?,?)').run(userId,value,JSON.stringify(FIXED_POSTTEST_ORDER),now());return this.posttestStatus(userId);
  },
  savePosttestAnswers(userId,answers){
   const row=db.prepare('SELECT question_order AS questionOrder,answers FROM posttest_results WHERE student_id=?').get(userId);if(!row)fail('请先完成答题数量预测',409);if(row.answers!==null)return this.posttestStatus(userId);
   const order=JSON.parse(row.questionOrder);if(!answers||Array.isArray(answers)||Object.keys(answers).length!==order.length||order.some(id=>!posttestBank.find(question=>question.id===id)?.options.some(option=>option.id===answers[id])))fail('请完成全部题目，不会的题目可选“我不知道”');
   const correct=posttestBank.filter(question=>answers[question.id]===question.answer).length;db.prepare('UPDATE posttest_results SET answers=?,correct=?,total=?,answered_at=? WHERE student_id=?').run(JSON.stringify(answers),correct,posttestBank.length,now(),userId);return this.posttestStatus(userId);
  },
  savePosttestConfidence(userId,confidence){
   const value=Number(confidence),row=db.prepare('SELECT answers,confidence FROM posttest_results WHERE student_id=?').get(userId);if(!row?.answers)fail('请先完成课堂测试',409);if(!Number.isInteger(value)||value<0||value>100)fail('信心值须为0%–100%的整数');
   if(row.confidence===null)db.prepare('UPDATE posttest_results SET confidence=?,submitted_at=? WHERE student_id=?').run(value,now(),userId);return this.posttestStatus(userId);
  },
  saveReasoningPrediction(userId,prediction){
   const value=Number(prediction),status=this.posttestStatus(userId);if(status.phase!=='reasoning_prediction')return status;
   if(!Number.isInteger(value)||value<0||value>100)fail('预测分数须为0–100的整数');
   db.prepare('INSERT INTO reasoning_results(student_id,prediction,started_at) VALUES(?,?,?)').run(userId,value,now());return this.posttestStatus(userId);
  },
  saveReasoningAnswers(userId,answers){
   const row=db.prepare('SELECT answers FROM reasoning_results WHERE student_id=?').get(userId);if(!row)fail('请先完成科学推理测试成绩预测',409);if(row.answers!==null)return this.posttestStatus(userId);
   if(!answers||Array.isArray(answers)||Object.keys(answers).length!==reasoningTest.questions.length)fail('请完成全部简答题');
   const clean={};for(const question of reasoningTest.questions){const value=typeof answers[question.id]==='string'?answers[question.id].trim():'';if(!value)fail('请完成全部简答题');if(value.length>3000)fail('每题回答不能超过3000字');clean[question.id]=value;}
   db.prepare('UPDATE reasoning_results SET answers=?,answered_at=? WHERE student_id=?').run(JSON.stringify(clean),now(),userId);return this.posttestStatus(userId);
  },
  reasoningAnswers(userId){const row=db.prepare('SELECT answers FROM reasoning_results WHERE student_id=?').get(userId);if(!row?.answers)fail('请先完成科学推理能力测试',409);return JSON.parse(row.answers);},
  saveReasoningScore(userId,result){
   const row=db.prepare('SELECT answers,score FROM reasoning_results WHERE student_id=?').get(userId);if(!row?.answers)fail('请先完成科学推理能力测试',409);if(row.score!==null)return this.posttestStatus(userId);
   const score=Number(result?.total),items=result?.items;if(!Number.isInteger(score)||score<0||score>100||!Array.isArray(items)||items.length!==5)fail('评分结果无效');
   db.prepare('UPDATE reasoning_results SET score=?,breakdown=?,scored_at=? WHERE student_id=?').run(score,JSON.stringify(items),now(),userId);return this.posttestStatus(userId);
  },
  saveReasoningConfidence(userId,confidence){
   const value=Number(confidence),row=db.prepare('SELECT score,confidence FROM reasoning_results WHERE student_id=?').get(userId);if(row?.score===null||row?.score===undefined)fail('请等待科学推理能力测试评分完成',409);if(!Number.isInteger(value)||value<0||value>100)fail('信心值须为0%–100%的整数');
   if(row.confidence===null)db.prepare('UPDATE reasoning_results SET confidence=?,submitted_at=? WHERE student_id=?').run(value,now(),userId);return this.posttestStatus(userId);
  },
  posttestReport(actor,classId=''){
   const classes=this.classes(actor).filter(item=>!classId||item.id===classId);if(classId)scope(actor,classId);
   return classes.map(classroom=>{const launch=db.prepare('SELECT started_at AS startedAt FROM posttest_launches WHERE class_id=?').get(classroom.id);const students=this.students(actor,classroom.id).filter(student=>student.active).map(student=>{const result=db.prepare('SELECT prediction,correct,total,confidence,question_order AS questionOrder,answers,started_at AS startedAt,answered_at AS answeredAt,submitted_at AS submittedAt FROM posttest_results WHERE student_id=?').get(student.id),reasoning=db.prepare('SELECT prediction AS reasoningPrediction,answers AS reasoningAnswers,score AS reasoningScore,breakdown AS reasoningBreakdown,confidence AS reasoningConfidence,started_at AS reasoningStartedAt,answered_at AS reasoningAnsweredAt,scored_at AS reasoningScoredAt,submitted_at AS reasoningSubmittedAt FROM reasoning_results WHERE student_id=?').get(student.id);const status=reasoning?.reasoningSubmittedAt?'已完成':reasoning?.reasoningScore!==null&&reasoning?.reasoningScore!==undefined?'待填写推理信心':reasoning?.reasoningAnsweredAt?'AI评分中':reasoning?'科学推理答题中':result?.confidence!==null&&result?.confidence!==undefined?'待科学推理测试':result?.answeredAt?'待填写物理信心':result?'物理测试答题中':launch?'等待进入':'未开启';return {...student,eligible:this.posttestEligible(student.id),status,...result,...reasoning};});return {...classroom,active:!!launch,startedAt:launch?.startedAt||null,ready:students.length>0&&students.every(student=>student.eligible),students};});
  },
  sendBroadcast(actor,classId,message){
   scope(actor,classId);const text=String(message||'').trim();if(!classId)fail('请选择班级');if(!text)fail('请输入广播内容');if(text.length>1000)fail('广播内容不能超过1000字');const item={id:randomUUID(),classId,message:text,createdAt:now()};db.prepare('INSERT INTO class_broadcasts VALUES(?,?,?,?,?)').run(item.id,classId,actor.id,text,item.createdAt);return item;
  },
  broadcasts(actor,classId=''){scope(actor,classId);return db.prepare(`SELECT b.id,b.class_id AS classId,c.name AS className,u.name AS senderName,b.message,b.created_at AS createdAt,(SELECT COUNT(*) FROM broadcast_reads r WHERE r.broadcast_id=b.id) AS readCount,(SELECT COUNT(*) FROM users s WHERE s.class_id=b.class_id AND s.role='student' AND s.active=1) AS studentCount FROM class_broadcasts b JOIN classes c ON c.id=b.class_id LEFT JOIN users u ON u.id=b.sender_id WHERE (?='' OR b.class_id IN (SELECT id FROM classes WHERE teacher_id=?)) AND (?='' OR b.class_id=?) ORDER BY b.created_at DESC LIMIT 100`).all(...scopeArgs(actor,classId));
  },
  nextBroadcast(userId){const u=getUser(userId);if(!u||u.role!=='student')fail('请使用学生账号',403);return db.prepare(`SELECT b.id,b.message,b.created_at AS createdAt FROM class_broadcasts b WHERE b.class_id=? AND NOT EXISTS(SELECT 1 FROM broadcast_reads r WHERE r.broadcast_id=b.id AND r.student_id=?) ORDER BY b.created_at LIMIT 1`).get(u.class_id,userId)||null;},
  readBroadcast(userId,broadcastId){const u=getUser(userId),item=db.prepare('SELECT id FROM class_broadcasts WHERE id=? AND class_id=?').get(broadcastId,u?.class_id);if(!u||u.role!=='student'||!item)fail('广播不存在或无权访问',404);db.prepare('INSERT OR IGNORE INTO broadcast_reads VALUES(?,?,?)').run(item.id,userId,now());},
  stageProgress(actor,classId='',lessonId=''){
   if(typeof lessonId!=='string'||!lessonId.trim())fail('请选择课程');
   return this.students(actor,classId).filter(student=>student.active).map(student=>{
    const progress=db.prepare('SELECT stage,updated_at AS updatedAt FROM stage_progress WHERE student_id=? AND lesson_id=?').get(student.id,lessonId);
    const group=db.prepare('SELECT g.id AS groupId,g.number AS groupNumber,g.type AS groupType FROM group_members m JOIN student_groups g ON g.id=m.group_id WHERE m.user_id=?').get(student.id);
    return {...student,lastStage:progress?.stage||0,progressAt:progress?.updatedAt||null,groupId:group?.groupId||null,groupNumber:group?.groupNumber||null,groupType:group?.groupType||null};
   });
  },
  assignClass(classId,teacherId,actor){if(manager(actor).role!=='admin')fail('仅管理员可以分配班级',403);scope(actor,classId);if(!classId)fail('请选择班级');if(!teacherId){db.prepare('UPDATE classes SET teacher_id=NULL WHERE id=?').run(classId);return;}const t=getUser(teacherId);if(!t||t.role!=='teacher'||!t.active)fail('请选择启用的教师');db.prepare('UPDATE classes SET teacher_id=? WHERE id=?').run(t.id,classId);},
  students(actor,classId=''){return db.prepare("SELECT u.* FROM users u WHERE u.role='student' AND "+scopedWhere+" ORDER BY u.class_name,u.name,u.username").all(...scopeArgs(actor,classId)).map(profile);},
  setAiPermission(actor,classId,aiEnabled){if(!classId||typeof aiEnabled!=='boolean')fail('请选择班级和权限分组');scope(actor,classId);db.prepare("UPDATE users SET ai_enabled=? WHERE class_id=? AND role='student'").run(Number(aiEnabled),classId);},
  studentCredentials(actor,classId=''){return this.students(actor,classId).map(s=>({...s,password:vault.decrypt(getUser(s.id).credential)||'未保存'}));},
  teachers(actor){if(manager(actor).role!=='admin')fail('仅管理员可以访问',403);return db.prepare("SELECT * FROM users WHERE role='teacher' ORDER BY created_at").all().map(u=>({...profile(u),className:db.prepare('SELECT name FROM classes WHERE teacher_id=? ORDER BY name').all(u.id).map(c=>c.name).join('、'),password:vault.decrypt(u.credential)}));},
  async registerTeacher(p){validateAccount(p);const gender=['男','女'].includes(p.gender)?p.gender:'未填写',hash=await passwordHash(p.password);return transaction(()=>{const id=randomUUID();db.prepare('INSERT INTO users(id,username,password,role,name,gender,class_name,created_at,credential) VALUES(?,?,?,?,?,?,?,?,?)').run(id,p.username,hash,'teacher',p.name.trim(),gender,'',now(),vault.encrypt(p.password));return profile(getUser(id));});},
  async editTeacher(id,p,actor){
   if(manager(actor).role!=='admin')fail('仅管理员可以访问',403);const u=getUser(id);if(!u||u.role!=='teacher')fail('教师不存在',404);validateAccount({...u,...p,password:p.password||''},false);
   const hash=p.password?await passwordHash(p.password):u.password;
   const gender=['男','女','未填写'].includes(p.gender)?p.gender:u.gender;
   return transaction(()=>{db.prepare('UPDATE users SET username=?,name=?,gender=?,password=?,credential=?,active=? WHERE id=?').run(p.username,p.name.trim(),gender,hash,p.password?vault.encrypt(p.password):u.credential,p.active===false?0:1,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(getUser(id));});
  },
  updateTeacherProfile(id,p,actor){
   const u=manager(actor);if(u.role!=='teacher'||u.id!==id)fail('只能编辑自己的教师资料',403);const subject=String(p?.subject||'').trim(),school=String(p?.school||'').trim(),gender=String(p?.gender||u.gender),avatar=String(p?.avatar||''),motto=String(p?.motto||'').trim();if(subject.length>80||school.length>120||motto.length>120)fail('资料文字过长');if(!['男','女','未填写'].includes(gender))fail('请选择有效的性别');if(avatar&&(avatar.length>360000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(avatar)))fail('头像格式无效，请重新裁剪');db.prepare('UPDATE users SET subject=?,school=?,gender=?,avatar=?,motto=? WHERE id=?').run(subject,school,gender,avatar,motto,id);return profile(getUser(id));
  },
  async addStudent(p,actor){validateStudent(p);const duplicate=db.prepare('SELECT * FROM users WHERE username=?').get(p.username);if(duplicate){const owner=manager(actor);if(owner.role==='teacher'&&duplicate.role==='student'){const c=db.prepare('SELECT teacher_id FROM classes WHERE id=?').get(duplicate.class_id);if(c?.teacher_id!==owner.id)fail('账号已存在，但未归属当前教师，请联系管理员在班级归属中核查分配');}fail('账号已存在，请在学生列表中编辑原账号');}const hash=await passwordHash(p.password);return transaction(()=>insertStudent(p,hash,classroom(actor,p)));},
  async resetStudentAccount(id,actor){
   targetStudent(id,actor);
   const password=randomBytes(12).toString('base64url'),hash=await passwordHash(password);
   return transaction(()=>{const user=targetStudent(id,actor);db.prepare('UPDATE users SET password=?,credential=?,active=1 WHERE id=?').run(hash,vault.encrypt(password),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return {student:profile(getUser(user.id)),password};});
  },
  clearStudentRecords(id,actor){
   return transaction(()=>{
    const user=targetStudent(id,actor);
    groups.invalidate(user.class_id);
    for(const [table,column] of [['sessions','user_id'],['scores','user_id'],['conversations','user_id'],['stage_progress','student_id'],['posttest_results','student_id'],['reasoning_results','student_id'],['broadcast_reads','student_id']])db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(id);
    db.prepare('INSERT INTO student_record_resets(student_id,reset_at) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET reset_at=excluded.reset_at').run(id,now());
    return {ok:true};
   });
  },
  deleteStudent(id,actor){return transaction(()=>{groups.invalidate(targetStudent(id,actor).class_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM scores WHERE user_id=?').run(id);db.prepare('DELETE FROM conversations WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);});},
  deleteScores(id,actor){transaction(()=>{groups.invalidate(targetStudent(id,actor).class_id);db.prepare('DELETE FROM scores WHERE user_id=?').run(id);});},
  deleteConversation(id,actor){const row=db.prepare('SELECT user_id FROM conversations WHERE id=?').get(id);if(!row)fail('记录不存在',404);targetStudent(row.user_id,actor);db.prepare('DELETE FROM conversations WHERE id=?').run(id);},
  deleteTeacher(id,actor){
   const admin=manager(actor);if(admin.role!=='admin')fail('仅管理员可以访问',403);
   return transaction(()=>{const u=getUser(id);if(!u||u.role!=='teacher')fail('教师不存在',404);db.prepare('UPDATE classes SET teacher_id=NULL WHERE teacher_id=?').run(id);db.prepare('UPDATE imports SET user_id=? WHERE user_id=?').run(admin.id,id);for(const table of ['sessions','scores','conversations'])db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);});
  },
  async editStudent(id,p,actor){
   const u=targetStudent(id,actor);validateStudent(p,false);const hash=p.password?await passwordHash(p.password):u.password;
   return transaction(()=>{targetStudent(id,actor);const c=classroom(actor,{...p,classId:p.classId||(!p.className?u.class_id:undefined)});if(c.id!==u.class_id||p.gender!==u.gender||(p.active!==false)!==!!u.active){groups.invalidate(u.class_id);groups.invalidate(c.id);}db.prepare('UPDATE users SET username=?,password=?,credential=?,name=?,gender=?,class_name=?,class_id=?,age=?,active=?,ai_enabled=? WHERE id=?').run(p.username,hash,p.password?vault.encrypt(p.password):u.credential,p.name.trim(),p.gender,c.name,c.id,u.age,p.active===false?0:1,p.aiEnabled===undefined?u.ai_enabled:Number(p.aiEnabled),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return profile(getUser(id));});
  },
  async importStudents(rows,fingerprint,actor,aiEnabled=true){
   if(typeof aiEnabled!=='boolean')fail('请选择有效的权限分组');
   manager(actor);const prepared=[];for(const row of rows){const password=String(randomInt(10000000,100000000));prepared.push({...row,password,hash:await passwordHash(password)});}
   return transaction(()=>{let created=0;const batches=Map.groupBy(prepared,row=>row.className);
    for(const [className,batch] of batches){const c=classroom(actor,{className});if(db.prepare('SELECT id FROM imports WHERE class_id=? AND fingerprint=?').get(c.id,fingerprint))continue;
     for(const row of batch){const base=studentAccountBase(row.name);let username=base+'_student',n=2;while(db.prepare('SELECT id FROM users WHERE username=?').get(username))username=base+(n++)+'_student';insertStudent({...row,username,aiEnabled},row.hash,c);created++;}
     db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(randomUUID(),actor.id,fingerprint,c.id,now());
    }return {created,alreadyImported:created===0};});
  },
  async login(username,password){const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);if(!u||!u.active){await scrypt(password,'unknown-user-timing',64);return null;}if(!await matches(password,u.password))return null;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hashToken(token),u.id,csrf,Date.now()+SESSION_IDLE_MS);return {token,csrf,user:profile(u)};},
  session(token){if(!token)return null;const s=db.prepare('SELECT s.csrf,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hashToken(token),Date.now());return s?{user:profile(s),csrf:s.csrf}:null;},
  touchSession(token){if(!token)return false;const at=Date.now();return db.prepare('UPDATE sessions SET expires=? WHERE token=? AND expires>?').run(at+SESSION_IDLE_MS,hashToken(token),at).changes===1;},
  logout(token){db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));},
  scores(userId){return db.prepare('SELECT quiz_id AS quizId,version,score,correct,total,created_at AS createdAt FROM scores WHERE user_id=? ORDER BY created_at').all(userId);},
  ready(userId){return quizzes.every(q=>this.scores(userId).some(s=>s.quizId===q.id&&s.version===q.version));},
  submit(userId,quizId,answers){const q=quizzes.find(q=>q.id===quizId);if(!q)fail('测验不存在');const old=this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);if(old)return old;if(quizzes.slice(0,quizzes.indexOf(q)).some(p=>!this.scores(userId).some(s=>s.quizId===p.id&&s.version===p.version)))fail('请先完成上一份测验');if(!answers||Array.isArray(answers)||Object.keys(answers).length!==q.questions.length||q.questions.some(item=>!item.options.some(o=>o.id===answers[item.id])))fail('请完成全部题目，不会的题目可选“我不知道”');const correct=q.questions.filter(item=>answers[item.id]===item.answer).length;db.prepare('INSERT INTO scores VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),userId,q.id,q.version,correct*10,correct,q.questions.length,JSON.stringify(answers),now());groups.ensure(getUser(userId).class_id);return this.scores(userId).find(s=>s.quizId===q.id&&s.version===q.version);},
  allScores(actor,classId=''){return db.prepare('SELECT u.id AS studentId,u.name,u.gender,u.class_name AS className,u.username,s.quiz_id AS quizId,s.version,s.score,s.correct,s.total,s.answers,s.created_at AS createdAt FROM scores s JOIN users u ON u.id=s.user_id WHERE '+scopedWhere+' ORDER BY s.created_at DESC').all(...scopeArgs(actor,classId));},
  conversations(userId='',limit=500,offset=0,actor,classId=''){const args=scopeArgs(actor,classId);if(userId)targetStudent(userId,actor);return db.prepare("SELECT c.id,u.name,u.gender,u.class_name AS className,u.username,c.agent,c.lesson_id AS lessonId,c.stage,c.user_text AS userText,c.reply,c.source,c.status,c.created_at AS createdAt,c.answered_at AS answeredAt FROM conversations c JOIN users u ON u.id=c.user_id WHERE (?='' OR c.user_id=?) AND "+scopedWhere+' ORDER BY c.created_at DESC LIMIT ? OFFSET ?').all(userId,userId,...args,limit,offset);},
  groupConversations(userId,agent,lessonId,limit=200){
   if(!['knowledge','metacognitive'].includes(agent)||typeof lessonId!=='string')fail('请选择有效的会话');
   const group=db.prepare('SELECT gm.group_id AS id FROM group_members gm JOIN student_groups g ON g.id=gm.group_id JOIN group_batches b ON b.class_id=g.class_id WHERE gm.user_id=? AND gm.joined=1 AND b.approved_at IS NOT NULL').get(userId);
   if(!group)fail('请先加入已审核的小组',403);
   const rows=db.prepare(`SELECT c.id,c.turn_id AS turnId,c.user_id AS userId,u.name AS senderName,c.agent,c.lesson_id AS lessonId,c.stage,c.kind,c.user_text AS userText,c.reply,c.source,c.status,c.complete,c.created_at AS createdAt,c.answered_at AS answeredAt
    FROM conversations c JOIN users u ON u.id=c.user_id WHERE c.user_id IN (SELECT user_id FROM group_members WHERE group_id=?) AND c.agent=? AND c.lesson_id=?
    AND (c.agent<>'metacognitive' OR c.rowid>COALESCE((SELECT r.after_rowid FROM inquiry_record_resets r WHERE r.group_id=? AND r.lesson_id=c.lesson_id AND r.stage=c.stage),0))
    ORDER BY c.rowid DESC LIMIT ?`).all(group.id,agent,lessonId,group.id,Math.max(1,Math.min(500,limit))).reverse();
   return [...new Map(rows.map(row=>[row.turnId,row])).values()];
  },
  groupInquiryResets(userId,lessonId){const group=groups.student(userId);if(group.status!=='joined')fail('请先加入已审核的小组',403);return Object.fromEntries(db.prepare('SELECT stage,revision FROM inquiry_record_resets WHERE group_id=? AND lesson_id=?').all(group.id,lessonId).map(row=>[row.stage,row.revision]));},
  clearInquiryRecord(userId,lessonId,stage){
   if(!lessons.some(lesson=>lesson.id===lessonId)||!Number.isInteger(stage)||stage<1||stage>6)fail('请选择有效课程和环节');
   const group=groups.student(userId);if(group.status!=='joined')fail('请先加入已审核的小组',403);
   return transaction(()=>{
    if(this.groupHasPending(userId,'metacognitive',lessonId,stage))fail('请等待本环节反馈完成后再清空记录',409);
    const afterRowid=db.prepare('SELECT COALESCE(MAX(c.rowid),0) AS value FROM conversations c WHERE c.user_id IN (SELECT user_id FROM group_members WHERE group_id=?) AND c.agent=? AND c.lesson_id=? AND c.stage=?').get(group.id,'metacognitive',lessonId,stage).value;
    const revision=randomUUID();db.prepare('INSERT INTO inquiry_record_resets(group_id,lesson_id,stage,after_rowid,revision) VALUES(?,?,?,?,?) ON CONFLICT(group_id,lesson_id,stage) DO UPDATE SET after_rowid=excluded.after_rowid,revision=excluded.revision').run(group.id,lessonId,stage,afterRowid,revision);
    return {revision};
   });
  },
  groupPromptHistory(userId,agent,lessonId,stage,limit=8){const rows=this.groupConversations(userId,agent,lessonId,500).filter(row=>(!stage||row.stage===stage)&&(agent!=='metacognitive'||row.status==='complete'&&row.source==='model')),messages=[];for(const row of rows){messages.push({role:'user',text:row.userText});if(row.reply&&row.status==='complete')messages.push({role:'agent',text:row.reply});}return messages.slice(-limit);},
  groupHasPending(userId,agent,lessonId,stage,turnId){return this.groupConversations(userId,agent,lessonId,500).some(row=>row.status==='pending'&&(!stage||row.stage===stage)&&row.turnId!==turnId);},
  groupInquiryState(userId,lessonId,stage,turnId){
   const rows=this.groupConversations(userId,'metacognitive',lessonId,500),content=rows.filter(row=>row.kind==='content'&&row.stage===stage&&row.status==='complete'&&['model','rule'].includes(row.source));
   const context=[];for(const prior of [1,2,3,5,6].filter(value=>value<stage)){const latest=rows.filter(row=>row.kind==='content'&&row.stage===prior&&row.status==='complete'&&row.source==='model').at(-1);if(latest)context.push({stage:prior,text:latest.userText,id:latest.turnId});}
   return {attempt:content.some(row=>row.turnId===turnId)?content.findIndex(row=>row.turnId===turnId)+1:content.length+1,latestSubmission:content.at(-1)?.userText||null,context,conversation:this.groupPromptHistory(userId,'metacognitive',lessonId,stage,6)};
  },
  completed(userId){return this.scores(userId).map(({quizId,version})=>({quizId,version}));},
  approveGroups(actor,classId,batchId){return groups.approve(actor,classId,batchId);},
  editGroups(actor,classId,batchId,assignments){return groups.edit(actor,classId,batchId,assignments);},
  groupRoles(userId,change){const result=groups.roles(userId,change);if(change){const name=id=>result.members.find(m=>m.id===id).name;const id=this.begin(userId,'social',{lessonId:'小组角色分工',text:(change.swap?'交换角色：':'角色分工：')+'领航发言员 '+name(result.leaderId)+'；记录与质疑员 '+name(result.challengerId)});this.finish(id,{content:change.swap?'角色已交换。':result.guidance,source:'rule'});}return result;},
  groupStatus(userId){return groups.student(userId);},
  knowledgeQuota(userId,lessonId,turn){return groups.quota(userId,lessonId,turn);},
  resetKnowledgeQuota(actor,classId,lessonId){return groups.resetQuota(actor,classId,lessonId);},
  joinGroup(userId,code){return groups.join(userId,code);},
  listGroups(actor,classId=''){scope(actor,classId);return this.classes(actor).filter(c=>!classId||c.id===classId).map(c=>groups.report(c));},
  begin(userId,agent,p){const id=randomUUID();db.prepare('INSERT INTO conversations(id,user_id,turn_id,agent,lesson_id,stage,user_text,status,created_at,kind) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,userId,p.id||randomUUID(),agent,p.lessonId||'unknown',p.stage||null,p.text,'pending',now(),p.kind||null);return id;},
  finish(id,result){db.prepare('UPDATE conversations SET reply=?,source=?,status=?,answered_at=?,complete=? WHERE id=?').run(result.content,result.source,'complete',now(),result.complete===undefined?null:Number(!!result.complete),id);},
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
  db.exec('CREATE TABLE IF NOT EXISTS school_migrations(name TEXT PRIMARY KEY)');
  if(!db.prepare('SELECT name FROM school_migrations WHERE name=?').get('surname-address-accounts-v1'))transaction(()=>{
   for(const user of db.prepare("SELECT id,name,username FROM users WHERE role='student' ORDER BY created_at,id").all()){
    const base=studentAccountBase(user.name),oldBase=pinyin(user.name,{toneType:'none',surname:'head',type:'array'}).join('').replaceAll('ü','v').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,25)||'student';
    if(base===oldBase||!new RegExp('^'+oldBase+'(?:[2-9]|[1-9][0-9]+)?_student$','i').test(user.username))continue;
    let username=base+'_student',n=2;while(db.prepare('SELECT id FROM users WHERE username=?').get(username))username=base+(n++)+'_student';
    db.prepare('UPDATE users SET username=? WHERE id=?').run(username,user.id);
   }
   db.prepare('INSERT INTO school_migrations VALUES(?)').run('surname-address-accounts-v1');
  });
 }catch(error){db.close();throw error;}
 return store;
}
