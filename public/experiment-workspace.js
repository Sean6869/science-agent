export async function createExperimentWorkspace(){
 const selector=document.getElementById('lessonSelector');
 const initial=document.getElementById('lab');
 const frame=initial.parentElement;
 const loading=document.getElementById('loading');
 const open=document.getElementById('openLab');
 const instances=new Map();
 let activeId;
 let timeout;
 try{
  const response=await fetch('/api/config');
  if(!response.ok)throw new Error('config');
  const {lessons,defaultLessonId}=await response.json();
  let saved;try{saved=sessionStorage.getItem('science-lesson');}catch{}
  function select(lesson){
   if(activeId===lesson.id)return;
   activeId=lesson.id;clearTimeout(timeout);
   try{sessionStorage.setItem('science-lesson',lesson.id);}catch{}
   open.href=lesson.url;
   open.setAttribute('aria-label',`新页面打开：${lesson.title}`);
   for(const button of selector.children)button.setAttribute('aria-pressed',String(button.dataset.lesson===lesson.id));
   let entry=instances.get(lesson.id);
   if(!entry){
    const element=instances.size?document.createElement('iframe'):initial;
    element.id=`lab-${lesson.id}`;element.title=`PhET ${lesson.title}`;element.allow='fullscreen';
    entry={element,loaded:false};instances.set(lesson.id,entry);
    element.addEventListener('load',()=>{entry.loaded=true;if(activeId===lesson.id)loading.classList.add('done');});
    element.src=lesson.url;
    if(element!==initial)frame.append(element);
   }
   for(const [id,item] of instances)item.element.hidden=id!==activeId;
   loading.textContent=`正在连接 ${lesson.title}…`;
   loading.classList.toggle('done',entry.loaded);
   if(!entry.loaded)timeout=setTimeout(()=>{loading.textContent='实验加载较慢，可使用上方“新页面打开”。';},8000);
  }
  for(const lesson of lessons){
   const button=document.createElement('button');button.type='button';button.dataset.lesson=lesson.id;
   const number=document.createElement('span');number.textContent=`第 ${lesson.number} 节课`;
   button.append(number,document.createTextNode(lesson.title));
   button.addEventListener('click',()=>select(lesson));selector.append(button);
  }
  select(lessons.find(l=>l.id===saved)||lessons.find(l=>l.id===defaultLessonId)||lessons[0]);
 }catch{loading.textContent='无法加载实验课程，请刷新重试。';}
}
