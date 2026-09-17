export async function createExperimentWorkspace(){
 const selector=document.getElementById('lessonSelector');
 const initial=document.getElementById('lab');
 const frame=initial.parentElement;
 const loading=document.getElementById('loading');
 const instances=new Map();
 let activeId=null;
 let requestedId=null;
 let timeout;
 try{
  const response=await fetch('/api/config');
  if(!response.ok)throw new Error('config');
  const {lessons,defaultLessonId}=await response.json();
  let saved;try{saved=sessionStorage.getItem('science-lesson');}catch{}

  function presentLesson(lesson){
   const artwork=document.getElementById('lessonArtwork');
   artwork.src=`/assets/lesson-${lesson.number}.png?v=20260917`;
   artwork.alt=`第${['一','二','三'][lesson.number-1]}节课`;
   selector.title=lesson.title;
   window.__scienceLesson=lesson;
   window.dispatchEvent(new CustomEvent('science:lesson-change',{detail:lesson}));
  }

  function activate(lesson,entry){
   if(requestedId!==lesson.id)return;
   activeId=lesson.id;
   for(const [id,item] of instances)item.element.hidden=id!==activeId;
   loading.classList.add('done');
  }

  function select(lesson){
   if(requestedId===lesson.id)return;
   requestedId=lesson.id;
   clearTimeout(timeout);
   presentLesson(lesson);
   try{sessionStorage.setItem('science-lesson',lesson.id);}catch{}
   for(const item of instances.values())item.element.hidden=true;
   loading.textContent=`正在连接 ${lesson.title}…`;
   loading.classList.remove('done');
   let entry=instances.get(lesson.id);
   if(!entry){
    const element=instances.size?document.createElement('iframe'):initial;
    element.id=`lab-${lesson.id}`;
    element.title=`PhET ${lesson.title}`;
    element.allow='fullscreen';
    element.hidden=true;
    entry={element,loaded:false};
    instances.set(lesson.id,entry);
    element.addEventListener('load',()=>{
     entry.loaded=true;
     activate(lesson,entry);
    });
    element.src=lesson.url;
    if(element!==initial)frame.append(element);
   }
   if(entry.loaded)activate(lesson,entry);
   else timeout=setTimeout(()=>{
    if(requestedId===lesson.id)loading.textContent='实验加载较慢，请检查网络连接后刷新页面。';
   },8000);
  }

  const step=offset=>{
   const current=requestedId||activeId||defaultLessonId;
   const index=lessons.findIndex(lesson=>lesson.id===current);
   select(lessons[(index+offset+lessons.length)%lessons.length]);
  };
  document.getElementById('previousLesson').onclick=()=>step(-1);
  document.getElementById('nextLesson').onclick=()=>step(1);
  select(lessons.find(lesson=>lesson.id===saved)||lessons.find(lesson=>lesson.id===defaultLessonId)||lessons[0]);
 }catch{loading.textContent='无法加载实验课程，请刷新重试。';}
}
