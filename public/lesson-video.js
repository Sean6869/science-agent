let hlsLoader;

export function loadHls(){
 if(window.Hls)return Promise.resolve(window.Hls);
 if(!hlsLoader)hlsLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/vendor/hls.min.js?v=1.6.13';
  script.onload=()=>window.Hls?resolve(window.Hls):reject(new Error('播放器加载失败'));
  script.onerror=()=>reject(new Error('播放器加载失败'));document.head.append(script);
 }).catch(error=>{hlsLoader=null;throw error;});
 return hlsLoader;
}

export function createLessonVideo({userId,onWatched=()=>{}}={}){
 let lesson=window.__scienceLesson||null,dialog=null,hls=null;
 const button=document.createElement('button');button.type='button';button.className='intro-video-button';
 const key=()=>lesson?.id&&`science-intro-video-v1:${userId}:${lesson.id}`;
 const isWatched=()=>{try{return !!key()&&localStorage.getItem(key())==='watched';}catch{return false;}};
 const hasMedia=()=>!!lesson?.videoStream;
 const render=()=>{button.hidden=!hasMedia();button.textContent=isWatched()?'重新观看导入视频':'▶ 开始观看导入视频';button.setAttribute('aria-label',`${lesson?.title||''}${button.textContent.replace('▶ ','')}`);};
 const closeDialog=()=>{if(!dialog)return;dialog.querySelector('video')?.pause();hls?.destroy();hls=null;dialog.close();dialog.remove();dialog=null;};
 const setLesson=next=>{if(dialog)closeDialog();lesson=next;render();};
 const markWatched=status=>{try{localStorage.setItem(key(),'watched');}catch{}status.textContent='视频已播放完成，正在进入第一环节…';render();onWatched(true);const finishedDialog=dialog;setTimeout(()=>{if(dialog===finishedDialog)closeDialog();},700);};
 button.onclick=()=>{
  if(!hasMedia()||dialog)return;
  dialog=document.createElement('dialog');dialog.className='intro-video-dialog';
  const header=document.createElement('header'),title=document.createElement('h2'),logo=document.createElement('img');title.textContent=`第 ${lesson.number} 节课导入视频`;logo.src='/assets/xiaoke-logo-transparent.png?v=20260917';logo.alt='小科';header.append(title,logo);
  const media=document.createElement('div');media.className='intro-video-media';
  const status=document.createElement('p');status.className='intro-video-status';status.textContent=isWatched()?'这段视频已经看完，可以再次观看。':'视频播放结束后会自动进入第一环节。';
  const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-label',lesson.title+'导入视频');video.onended=()=>markWatched(status);media.append(video);
  const actions=document.createElement('div');actions.className='intro-video-actions';
  const close=document.createElement('button');close.type='button';close.className='school-button';close.textContent='关闭';close.onclick=closeDialog;actions.append(close);
  dialog.append(header,media,status,actions);document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});dialog.showModal();
  const start=()=>video.play().catch(()=>{status.textContent='请点击播放按钮开始观看；播放结束后会自动进入第一环节。';});
  if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=lesson.videoStream;video.addEventListener('loadedmetadata',start,{once:true});}
  else void loadHls().then(Hls=>{if(!dialog)return;hls=new Hls({enableWorker:true});hls.on(Hls.Events.MANIFEST_PARSED,start);hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)status.textContent='视频暂时无法加载，请关闭后重试。';});hls.loadSource(lesson.videoStream);hls.attachMedia(video);}).catch(()=>{status.textContent='视频播放器加载失败，请关闭后重试。';});
 };
 window.addEventListener('science:lesson-change',event=>setLesson(event.detail));render();return {button,isWatched,setLesson};
}
