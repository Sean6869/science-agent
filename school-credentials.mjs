import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

export function credentialVault(filename,hasEncryptedPasswords=false){
 const path=filename+ '.credentials.key';
 let key;
 if(filename===':memory:')key=randomBytes(32);
 else if(existsSync(path))key=readFileSync(path);
 else{
  if(hasEncryptedPasswords)throw new Error('密码加密密钥丢失，请恢复持久卷中的 school.sqlite.credentials.key');
  key=randomBytes(32);writeFileSync(path,key,{flag:'wx',mode:0o600});
 }
 if(key.length!==32)throw new Error('密码加密密钥无效');
 return {
  encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');},
  decrypt(value){if(!value)return null;const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');}
 };
}

export function migrateSchool(db){
 const columns=db.prepare('PRAGMA table_info(users)').all();
 if(!columns.some(c=>c.name==='class_id')){
  // Rebuild the role constraint without changing any IDs referenced by scores or sessions.
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try{db.exec(`
   CREATE TABLE users_next(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),name TEXT NOT NULL,gender TEXT NOT NULL,class_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,class_id TEXT,age INTEGER,credential TEXT);
   INSERT INTO users_next(id,username,password,role,name,gender,class_name,active,created_at) SELECT id,username,password,CASE WHEN role='teacher' THEN 'admin' ELSE role END,name,gender,class_name,active,created_at FROM users;
   DROP TABLE users; ALTER TABLE users_next RENAME TO users;`);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
  finally{db.exec('PRAGMA foreign_keys=ON');}
 }
 db.exec(`CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,name TEXT NOT NULL,teacher_id TEXT REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS student_class ON users(class_id);
 CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),fingerprint TEXT NOT NULL,class_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(class_id,fingerprint));`);
 const classSchema=db.prepare("SELECT sql FROM sqlite_master WHERE name='classes'").get().sql;
 if(/teacher_id TEXT UNIQUE/i.test(classSchema)){
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try{db.exec(`CREATE TABLE classes_next(id TEXT PRIMARY KEY,name TEXT NOT NULL,teacher_id TEXT REFERENCES users(id),created_at TEXT NOT NULL);INSERT INTO classes_next SELECT * FROM classes;DROP TABLE classes;ALTER TABLE classes_next RENAME TO classes;COMMIT;`);}
  catch(error){db.exec('ROLLBACK');throw error;}finally{db.exec('PRAGMA foreign_keys=ON');}
 }
 db.exec("UPDATE users SET class_id=NULL,class_name='' WHERE role!='student'; CREATE INDEX IF NOT EXISTS class_owner ON classes(teacher_id);");
 for(const row of db.prepare("SELECT DISTINCT class_name FROM users WHERE role='student' AND class_id IS NULL").all()){
  const id=randomBytes(16).toString('hex');db.prepare('INSERT INTO classes VALUES(?,?,NULL,?)').run(id,row.class_name,new Date().toISOString());db.prepare("UPDATE users SET class_id=? WHERE role='student' AND class_id IS NULL AND class_name=?").run(id,row.class_name);
 }
 const violations=db.prepare('PRAGMA foreign_key_check').all();if(violations.length)throw new Error('班级权限升级的数据关联校验失败');
}
