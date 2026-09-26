import {publicQuizzes} from './school-store.mjs';
import {parseStudentsWorkbook,workbookBuffer} from './school-excel.mjs';
export function csv(columns,rows){const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';return '\ufeff'+[columns.map(([title])=>cell(title)).join(','),...rows.map(row=>columns.map(([,key])=>cell(row[key])).join(','))].join('\r\n');}
export function createSchoolApi(store,{json,body}){
 const attempts=new Map();
 function token(req){return /(?:^|;\s*)xiaoke_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];}
 const cookie=(req,value,age)=>`xiaoke_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${req.headers['x-forwarded-proto']==='https'||req.socket.encrypted?'; Secure':''}`;
 return async function schoolApi(req,res,url){
  const path=url.pathname;
  const session=store.session(token(req));req.schoolUser=session?.user;
  if(session&&req.headers['x-session-user']&&req.headers['x-session-user']!==session.user.id){json(res,409,{message:'账号已在另一个页面切换，请重新载入'});return true;}
  if(path.startsWith('/api/')&&req.method!=='GET'){
   const origin=req.headers.origin;
   if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host)){json(res,403,{message:'请从本站页面操作'});return true;}
   if(!['/api/auth/login','/api/auth/register'].includes(path)&&(!session||req.headers['x-csrf-token']!==session.csrf)){json(res,session?403:401,{message:'登录已过期，请重新登录'});return true;}
  }
  if(['/api/auth/login','/api/auth/register'].includes(path)&&req.method==='POST'){
   const ip=req.socket.remoteAddress+path;const now=Date.now();for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
   const entry=attempts.get(ip)||{count:0,until:now+15*60*1000};
   if(entry.count>=20){json(res,429,{message:'登录尝试过多，请15分钟后再试'});return true;}
   entry.count++;attempts.set(ip,entry);
   const p=await body(req);if(typeof p?.username!=='string'||typeof p?.password!=='string'||p.username.length>80||p.password.length>128){json(res,400,{message:'请输入账号和密码'});return true;}
   if(path==='/api/auth/register'){try{await store.registerTeacher(p);json(res,201,{ok:true});}catch(e){json(res,e.status||400,{message:e.message});}return true;}
   const auth=await store.login(p.username.trim(),p.password);if(!auth){json(res,401,{message:'账号或密码错误，或账号已停用'});return true;}
   attempts.delete(ip);res.setHeader('Set-Cookie',cookie(req,auth.token,43200));json(res,200,{user:auth.user,csrf:auth.csrf});return true;
  }
  if(path==='/api/me'&&req.method==='GET'){json(res,200,session?{...session,scores:store.scores(session.user.id),ready:session.user.role!=='student'||store.ready(session.user.id)}:{user:null});return true;}
  if(!path.startsWith('/api/'))return false;
  if(!session){json(res,401,{message:'请先登录'});return true;}
  if(path==='/api/auth/logout'&&req.method==='POST'){store.logout(token(req));res.setHeader('Set-Cookie',cookie(req,'',0));json(res,200,{ok:true});return true;}
  if(path.startsWith('/api/admin/')){
   if(session.user.role!=='admin'){json(res,403,{message:'仅管理员可以访问'});return true;}
   if(path==='/api/admin/teachers'&&req.method==='GET'){json(res,200,{teachers:store.teachers(session.user)});return true;}
   if(/^\/api\/admin\/teachers\/[^/]+$/.test(path)&&req.method==='DELETE'){store.deleteTeacher(path.split('/').at(-1),session.user);json(res,200,{ok:true});return true;}
   if(path.startsWith('/api/admin/teachers/')&&req.method==='PUT'){try{json(res,200,{teacher:await store.editTeacher(path.split('/').at(-1),await body(req),session.user)});}catch(e){json(res,e.status||400,{message:e.message});}return true;}
  }
  if(path==='/api/quizzes'&&req.method==='GET'){json(res,200,{quizzes:publicQuizzes,scores:store.scores(session.user.id)});return true;}
  if(path==='/api/quizzes/submit'&&req.method==='POST'){
   if(session.user.role!=='student'){json(res,403,{message:'请使用学生账号作答'});return true;}
   const p=await body(req);try{json(res,200,{result:store.submit(session.user.id,p?.quizId,p?.answers),ready:store.ready(session.user.id)});}catch(e){json(res,400,{message:e.message});}return true;
  }
  if(path.startsWith('/api/teacher/')){
   if(!['admin','teacher'].includes(session.user.role)){json(res,403,{message:'仅教师或管理员可以访问'});return true;}
   const actor=session.user,classId=url.searchParams.get('class')||'';
   if(req.method==='DELETE'){
    const target=/^\/api\/teacher\/(students|conversations)\/([^/]+)(\/scores)?$/.exec(path);
    if(target){if(target[1]==='conversations'&&!target[3])store.deleteConversation(target[2],actor);else if(target[1]==='students'){if(target[3])store.deleteScores(target[2],actor);else store.deleteStudent(target[2],actor);}else{json(res,404,{message:'接口不存在'});return true;}json(res,200,{ok:true});return true;}
   }
   if(path==='/api/teacher/classes'&&req.method==='GET'){json(res,200,{classes:store.classes(actor)});return true;}
   if(path==='/api/teacher/import'&&req.method==='POST'){
    try{const p=await body(req,1500000);const parsed=await parseStudentsWorkbook(p?.data);json(res,200,await store.importStudents(parsed.rows,parsed.fingerprint,actor,p.classId));}catch(e){json(res,e.status||400,{message:e.message});}return true;
   }
   if(path==='/api/teacher/accounts.xlsx'&&req.method==='GET'){
    const rows=store.studentCredentials(actor,classId);const file=await workbookBuffer([['姓名','name'],['性别','gender',10],['年龄','age',10],['班级','className'],['账号','username',30],['密码','password',20]],rows);
    res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="student-accounts.xlsx"','cache-control':'no-store'});res.end(file);return true;
   }
   if(path==='/api/teacher/students'){
    if(req.method==='GET'){json(res,200,{students:store.students(actor,classId)});return true;}
    if(req.method==='POST'){try{json(res,201,{student:await store.addStudent(await body(req),actor)});}catch(e){json(res,e.status||400,{message:e.message});}return true;}
   }
   if(path.startsWith('/api/teacher/students/')&&req.method==='PUT'){try{json(res,200,{student:await store.editStudent(path.split('/').at(-1),await body(req),actor)});}catch(e){json(res,e.status||400,{message:e.message});}return true;}
   if(path==='/api/teacher/scores'&&req.method==='GET'){json(res,200,{scores:store.allScores(actor,classId)});return true;}
   if(path==='/api/teacher/conversations'&&req.method==='GET'){const page=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('page')))||0));json(res,200,{conversations:store.conversations(url.searchParams.get('student')||'',100,page*100,actor,classId),page});return true;}
   if(path==='/api/teacher/export'&&req.method==='GET'){
    const type=url.searchParams.get('type');if(!['scores','conversations'].includes(type)){json(res,400,{message:'请选择导出内容'});return true;}
    const common=[['姓名','name'],['性别','gender'],['班级','className'],['账号','username']];
    // Check scope before sending download headers, including guessed student IDs.
    store.students(actor,classId);if(type==='conversations')store.conversations(url.searchParams.get('student')||'',1,0,actor,classId);
    res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="xiaoke-${type}.csv"`,'cache-control':'no-store'});
    if(type==='scores')res.end(csv([...common,['测验','quizId'],['试卷版本','version'],['分数（满分100）','score'],['答对题数','correct'],['题目数','total'],['作答','answers'],['提交时间（UTC）','createdAt']],store.allScores(actor,classId)));
    else{
     const columns=[...common,['智能体','agent'],['课程','lessonId'],['环节','stage'],['学生内容','userText'],['AI回答','reply'],['回答来源','source'],['状态','status'],['提问时间（UTC）','createdAt'],['回复时间（UTC）','answeredAt']];
     res.write(csv(columns,[]));for(let offset=0;;offset+=500){const rows=store.conversations(url.searchParams.get('student')||'',500,offset,actor,classId);if(!rows.length)break;res.write('\r\n'+csv(columns,rows).split('\r\n').slice(1).join('\r\n'));}res.end();
    }return true;
   }
  }
  if(['/api/chat','/api/knowledge','/api/assessment','/api/config'].includes(path)&&session.user.role==='student'&&!store.ready(session.user.id)){json(res,403,{message:'请先完成两份入门测验'});return true;}
  return false;
 };
}
