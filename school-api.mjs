import {publicQuizzes} from './school-store.mjs';
import {parseStudentsWorkbook,workbookBuffer} from './school-excel.mjs';
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
  if(path==='/api/teacher/profile'&&req.method==='PUT'){try{if(session.user.role!=='teacher')throw Object.assign(new Error('仅教师可以编辑资料'),{status:403});json(res,200,{user:store.updateTeacherProfile(session.user.id,await body(req),session.user)});}catch(e){json(res,e.status||400,{message:e.message});}return true;}
  if(path==='/api/me'&&req.method==='GET'){json(res,200,session?{...session,completed:store.completed(session.user.id),group:session.user.role==='student'?store.groupStatus(session.user.id):null,ready:session.user.role!=='student'||store.ready(session.user.id)}:{user:null});return true;}
  if(!path.startsWith('/api/'))return false;
  if(!session){json(res,401,{message:'请先登录'});return true;}
  if(path==='/api/auth/logout'&&req.method==='POST'){store.logout(token(req));res.setHeader('Set-Cookie',cookie(req,'',0));json(res,200,{ok:true});return true;}
  if(path.startsWith('/api/admin/')){
   if(session.user.role!=='admin'){json(res,403,{message:'仅管理员可以访问'});return true;}
   if(path==='/api/admin/teachers'&&req.method==='GET'){json(res,200,{teachers:store.teachers(session.user)});return true;}
   if(/^\/api\/admin\/teachers\/[^/]+$/.test(path)&&req.method==='DELETE'){store.deleteTeacher(path.split('/').at(-1),session.user);json(res,200,{ok:true});return true;}
   if(path==='/api/admin/classes/assign'&&req.method==='POST'){const p=await body(req);store.assignClass(p?.classId,p?.teacherId,session.user);json(res,200,{ok:true});return true;}
   if(path.startsWith('/api/admin/teachers/')&&req.method==='PUT'){try{json(res,200,{teacher:await store.editTeacher(path.split('/').at(-1),await body(req),session.user)});}catch(e){json(res,e.status||400,{message:e.message});}return true;}
  }
  if(path==='/api/quizzes'&&req.method==='GET'){json(res,200,{quizzes:publicQuizzes,completed:store.completed(session.user.id)});return true;}
  if(path==='/api/quizzes/submit'&&req.method==='POST'){
   if(session.user.role!=='student'){json(res,403,{message:'请使用学生账号作答'});return true;}
   const p=await body(req);try{store.submit(session.user.id,p?.quizId,p?.answers);json(res,200,{saved:true,completed:store.completed(session.user.id),ready:store.ready(session.user.id)});}catch(e){json(res,400,{message:e.message});}return true;
  }
  if(path==='/api/groups/join'&&req.method==='POST'){if(session.user.role!=='student'){json(res,403,{message:'请使用学生账号'});return true;}const p=await body(req);json(res,200,{group:store.joinGroup(session.user.id,p?.code)});return true;}
  if(path.startsWith('/api/teacher/')){
   if(!['admin','teacher'].includes(session.user.role)){json(res,403,{message:'仅教师或管理员可以访问'});return true;}
   const actor=session.user,classId=url.searchParams.get('class')||'';
   if(req.method==='DELETE'){
    const target=/^\/api\/teacher\/(students|conversations)\/([^/]+)(\/scores)?$/.exec(path);
    if(target){if(target[1]==='conversations'&&!target[3])store.deleteConversation(target[2],actor);else if(target[1]==='students'){if(target[3])store.deleteScores(target[2],actor);else store.deleteStudent(target[2],actor);}else{json(res,404,{message:'接口不存在'});return true;}json(res,200,{ok:true});return true;}
   }
   if(path==='/api/teacher/groups'&&req.method==='GET'){json(res,200,{classes:store.listGroups(actor,classId)});return true;}
   if(path==='/api/teacher/groups/approve'&&req.method==='POST'){const p=await body(req);store.approveGroups(actor,p?.classId,p?.batchId);json(res,200,{ok:true});return true;}
   if(path==='/api/teacher/groups.xlsx'&&req.method==='GET'){
    const rows=store.listGroups(actor,classId).filter(c=>c.status==='approved').flatMap(c=>c.groups.map(g=>({className:c.name,number:g.number,code:g.code,type:({LL:'低低',HH:'高高',HL:'高低',single:'单人待补'})[g.type],names:g.members.map(s=>s.name).join('、'),usernames:g.members.map(s=>s.username).join('、'),scores:g.members.map(s=>s.total).join('、'),low:c.summary.lowRange?.join('–'),high:c.summary.highRange?.join('–')||'无'})));
    const file=await workbookBuffer([['班级','className'],['小组','number',10],['小组码','code'],['类型','type'],['成员','names',28],['账号','usernames',40],['三课总分','scores'],['低分段','low'],['高分段','high']],rows,'分组名单');res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="student-groups.xlsx"','cache-control':'no-store'});res.end(file);return true;
   }
   if(path==='/api/teacher/classes'&&req.method==='GET'){json(res,200,{classes:store.classes(actor)});return true;}
   if(path==='/api/teacher/import'&&req.method==='POST'){
    try{const p=await body(req,1500000);const parsed=await parseStudentsWorkbook(p?.data);json(res,200,await store.importStudents(parsed.rows,parsed.fingerprint,actor));}catch(e){json(res,e.status||400,{message:e.message});}return true;
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
   if(path==='/api/teacher/scores'&&req.method==='GET'){json(res,200,{scores:store.allScores(actor,classId),quizzes:publicQuizzes.map(({id,title,version})=>({id,title,version}))});return true;}
   if(path==='/api/teacher/conversations'&&req.method==='GET'){const page=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('page')))||0));json(res,200,{conversations:store.conversations(url.searchParams.get('student')||'',100,page*100,actor,classId),page});return true;}
   if(path==='/api/teacher/export'&&req.method==='GET'){
    const type=url.searchParams.get('type');if(!['scores','conversations'].includes(type)){json(res,400,{message:'请选择导出内容'});return true;}
    const common=[['姓名','name'],['性别','gender'],['班级','className'],['账号','username']];
    // Check scope before sending download headers, including guessed student IDs.
    store.students(actor,classId);if(type==='conversations')store.conversations(url.searchParams.get('student')||'',1,0,actor,classId);
    let columns,rows;
    if(type==='scores'){columns=[...common,['测验','quizId'],['试卷版本','version'],['分数（满分100）','score'],['答对题数','correct'],['题目数','total'],['作答','answers'],['提交时间（UTC）','createdAt']];rows=store.allScores(actor,classId);}
    else{columns=[...common,['智能体','agent'],['课程','lessonId'],['环节','stage'],['学生内容','userText',50],['AI回答','reply',80],['回答来源','source'],['状态','status'],['提问时间（UTC）','createdAt'],['回复时间（UTC）','answeredAt']];rows=[];for(let offset=0;;offset+=500){const batch=store.conversations(url.searchParams.get('student')||'',500,offset,actor,classId);if(!batch.length)break;rows.push(...batch);}}
    const file=await workbookBuffer(columns,rows,type==='scores'?'测验成绩':'AI对话记录');
    res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="xiaoke-${type}.xlsx"`,'cache-control':'no-store'});res.end(file);
    return true;
   }
  }
  if(['/api/chat','/api/knowledge','/api/assessment','/api/config'].includes(path)&&session.user.role==='student'&&!store.ready(session.user.id)){json(res,403,{message:'请先完成全部入门测验'});return true;}
  if(['/api/chat','/api/knowledge','/api/assessment','/api/config'].includes(path)&&session.user.role==='student'&&store.groupStatus(session.user.id).status!=='joined'){json(res,403,{message:'请等待教师确认分组，再输入本组小组码进入实验'});return true;}
  return false;
 };
}
