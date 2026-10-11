export async function createExperimentWorkspace(){
 const selector=document.getElementById('lessonSelector');
 const initial=document.getElementById('lab');
 const frame=initial.parentElement;
 const loading=document.getElementById('loading');
 const instances=new Map();
 const angleTool=createAngleTool(frame);
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
   angleTool.hidden=lesson.id!=='bending-light';
   if(lesson.id!=='bending-light')angleTool.reset();
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

function createAngleTool(frame){
 const root=document.createElement('div');root.className='angle-tool';root.hidden=true;
 const button=document.createElement('button');button.type='button';button.className='angle-tool-button';button.textContent='测角';button.title='在实验画面上点选两条光线和顶点，显示夹角';
 const readout=document.createElement('output');readout.className='angle-tool-readout';readout.textContent='点击测角后，依次选择光线端点、顶点、光线端点';
 const reset=document.createElement('button');reset.type='button';reset.className='angle-tool-reset';reset.textContent='重置';
 const layer=document.createElement('div');layer.className='angle-tool-layer';layer.hidden=true;
 const canvas=document.createElement('canvas');canvas.className='angle-tool-canvas';layer.append(canvas);frame.append(root,layer);root.append(button,readout,reset);
 let points=[],active=false;
 const resize=()=>{const rect=frame.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`;canvas.getContext('2d').setTransform(ratio,0,0,ratio,0,0);draw();};
 const draw=()=>{const ctx=canvas.getContext('2d'),rect=frame.getBoundingClientRect();ctx.clearRect(0,0,rect.width,rect.height);ctx.strokeStyle='#376ddb';ctx.fillStyle='#fff';ctx.lineWidth=2;points.forEach((point,index)=>{ctx.beginPath();ctx.arc(point.x,point.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#376ddb';ctx.font='bold 12px Microsoft YaHei';ctx.fillText(String(index+1),point.x+9,point.y-8);ctx.fillStyle='#fff';});if(points.length===3){const [a,v,b]=points,angle=Math.acos(Math.max(-1,Math.min(1,((a.x-v.x)*(b.x-v.x)+(a.y-v.y)*(b.y-v.y))/(Math.hypot(a.x-v.x,a.y-v.y)*Math.hypot(b.x-v.x,b.y-v.y)))))*180/Math.PI;readout.textContent=`夹角 ${angle.toFixed(1)}°`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(v.x,v.y);ctx.lineTo(b.x,b.y);ctx.stroke();}};
 const setActive=value=>{active=value;layer.hidden=!value;button.classList.toggle('active',value);if(value){points=[];readout.textContent='请依次点击光线端点、顶点、光线端点';resize();}else{points=[];readout.textContent='点击测角后，依次选择光线端点、顶点、光线端点';draw();}};
 button.onclick=()=>setActive(!active);reset.onclick=()=>{points=[];readout.textContent='请依次点击光线端点、顶点、光线端点';draw();};layer.onclick=event=>{if(points.length>=3)return;const rect=layer.getBoundingClientRect();points.push({x:event.clientX-rect.left,y:event.clientY-rect.top});draw();};window.addEventListener('resize',()=>{if(active)resize();});
 root.reset=()=>setActive(false);return root;
}
