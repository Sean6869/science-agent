export function createLessonVideo({userId,onWatched=()=>{}}={}){
 let lesson=window.__scienceLesson||null,dialog=null;
 const button=document.createElement('button');button.type='button';button.className='intro-video-button';
 const key=()=>lesson?.id&&`science-intro-video-v1:${userId}:${lesson.id}`;
 const isWatched=()=>{try{return !!key()&&localStorage.getItem(key())==='watched';}catch{return false;}};
 const render=()=>{button.hidden=!lesson?.video;button.textContent=isWatched()?'重新观看导入视频':'▶ 开始观看导入视频';button.setAttribute('aria-label',`${lesson?.title||''}${button.textContent.replace('▶ ','')}`);};
 const closeDialog=()=>{if(!dialog)return;dialog.querySelector('video')?.pause();dialog.close();dialog.remove();dialog=null;};
 const setLesson=next=>{if(dialog)closeDialog();lesson=next;render();onWatched(isWatched());};
 button.onclick=()=>{
  if(!lesson?.video||dialog)return;dialog=document.createElement('dialog');dialog.className='intro-video-dialog';const header=document.createElement('header'),title=document.createElement('h2'),logo=document.createElement('img');title.textContent=`第 ${lesson.number} 节课导入视频`;logo.src='/assets/xiaoke-logo-transparent.png?v=20260917';logo.alt='小科';header.append(title,logo);
  const video=document.createElement('video');video.src=lesson.video;video.controls=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',lesson.title+'导入视频');const status=document.createElement('p');status.className='intro-video-status';status.textContent=isWatched()?'这段视频已经看完，可以再次观看。':'请先完整观看视频，再提出科学问题。';const close=document.createElement('button');close.type='button';close.className='school-button';close.textContent='关闭';close.onclick=closeDialog;
  video.onended=()=>{try{localStorage.setItem(key(),'watched');}catch{}status.textContent='视频已看完，现在可以提出科学问题。';render();onWatched(true);};dialog.append(header,video,status,close);document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});dialog.showModal();void video.play().catch(()=>{});
 };
 window.addEventListener('science:lesson-change',event=>setLesson(event.detail));render();return {button,isWatched,setLesson};
}
